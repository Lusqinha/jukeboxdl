import { createHash } from "node:crypto";
import { mkdtemp, readdir, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { DownloadError, UnsupportedPlatformError } from "../errors";
import { type AppPaths, getAppPaths } from "../paths";
import { installYtDlp, latestYtDlpVersion, parseChecksums } from "./install";

const linux = { platform: "linux", arch: "x64", musl: false } as const;
const binary = Buffer.from("#!/bin/sh\necho fake yt-dlp\n");
const sha = (data: Buffer) => createHash("sha256").update(data).digest("hex");

function fakeFetch(files: Record<string, Buffer | string>): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = String(input);
    const name = url.slice(url.lastIndexOf("/") + 1);
    const body = files[name];
    if (body === undefined) return new Response("not found", { status: 404 });
    return new Response(body, { headers: { "content-length": String(Buffer.byteLength(body)) } });
  }) as typeof fetch;
}

let paths: AppPaths;

beforeEach(async () => {
  const root = await mkdtemp(join(tmpdir(), "jukeboxdl-install-"));
  paths = getAppPaths({ env: { JUKEBOXDL_HOME: root } });
});

describe("parseChecksums", () => {
  it("lê o formato do sha256sum", () => {
    const hash = "a".repeat(64);
    const sums = parseChecksums(`${hash}  yt-dlp_linux\n${"B".repeat(64)} *yt-dlp.exe\n\nlixo`);
    expect(sums.get("yt-dlp_linux")).toBe(hash);
    expect(sums.get("yt-dlp.exe")).toBe("b".repeat(64));
    expect(sums.size).toBe(2);
  });
});

describe("installYtDlp", () => {
  it("baixa, verifica e instala como executável", async () => {
    const progress: number[] = [];
    const path = await installYtDlp({
      paths,
      platformInfo: linux,
      fetch: fakeFetch({
        "SHA2-256SUMS": `${sha(binary)}  yt-dlp_linux\n`,
        yt_dlp_linux: "errado",
        "yt-dlp_linux": binary,
      }),
      onProgress: (p) => progress.push(p.received),
    });

    expect(path).toBe(join(paths.bin, "yt-dlp"));
    expect(await readFile(path)).toEqual(binary);
    expect((await stat(path)).mode & 0o111).not.toBe(0);
    expect(progress.at(-1)).toBe(binary.length);
  });

  it("recusa arquivo com checksum diferente e não deixa lixo", async () => {
    await expect(
      installYtDlp({
        paths,
        platformInfo: linux,
        fetch: fakeFetch({
          "SHA2-256SUMS": `${"0".repeat(64)}  yt-dlp_linux\n`,
          "yt-dlp_linux": binary,
        }),
      }),
    ).rejects.toThrow(/Checksum não confere/);
    expect(await readdir(paths.bin)).toEqual([]);
  });

  it("falha se o asset não está na lista de checksums", async () => {
    await expect(
      installYtDlp({ paths, platformInfo: linux, fetch: fakeFetch({ "SHA2-256SUMS": "" }) }),
    ).rejects.toThrow(DownloadError);
  });

  it("recusa plataformas sem build", async () => {
    await expect(
      installYtDlp({ paths, platformInfo: { platform: "freebsd", arch: "x64", musl: false } }),
    ).rejects.toThrow(UnsupportedPlatformError);
  });
});

describe("latestYtDlpVersion", () => {
  it("extrai a versão da URL final do redirecionamento", async () => {
    const fetchImpl = (async () => {
      const response = new Response(null);
      Object.defineProperty(response, "url", {
        value: "https://github.com/yt-dlp/yt-dlp/releases/tag/2026.09.20",
      });
      return response;
    }) as unknown as typeof fetch;
    expect(await latestYtDlpVersion(fetchImpl)).toBe("2026.09.20");
  });
});
