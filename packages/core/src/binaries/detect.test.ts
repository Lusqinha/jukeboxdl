import { chmod, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { BinaryError } from "../errors";
import { type AppPaths, getAppPaths } from "../paths";
import { detectBinaries, detectBinary } from "./detect";
import { which } from "./which";

const unix = process.platform === "win32" ? describe.skip : describe;

async function fakeBinary(dir: string, name: string, output: string): Promise<string> {
  await mkdir(dir, { recursive: true });
  const path = join(dir, name);
  await writeFile(path, `#!/bin/sh\necho "${output}"\n`);
  await chmod(path, 0o755);
  return path;
}

let root: string;
let paths: AppPaths;
let systemDir: string;
let env: NodeJS.ProcessEnv;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "jukeboxdl-bin-"));
  paths = getAppPaths({ env: { JUKEBOXDL_HOME: join(root, "app") } });
  systemDir = join(root, "system");
  env = { PATH: systemDir };
});

unix("detectBinary", () => {
  it("encontra no PATH e lê a versão", async () => {
    await fakeBinary(systemDir, "yt-dlp", "2026.09.01");
    expect(await detectBinary("yt-dlp", { paths, env })).toEqual({
      name: "yt-dlp",
      path: join(systemDir, "yt-dlp"),
      source: "system",
      version: "2026.09.01",
    });
  });

  it("prefere o binário gerenciado ao do sistema", async () => {
    await fakeBinary(systemDir, "ffmpeg", "ffmpeg version 6.0 Copyright");
    await fakeBinary(paths.bin, "ffmpeg", "ffmpeg version 7.1-static Copyright");
    const info = await detectBinary("ffmpeg", { paths, env });
    expect(info?.source).toBe("managed");
    expect(info?.version).toBe("7.1-static");
  });

  it("usa o caminho da config, com ffprobe ao lado do ffmpeg", async () => {
    const custom = join(root, "custom");
    const ffmpeg = await fakeBinary(custom, "ffmpeg", "ffmpeg version 5.0");
    await fakeBinary(custom, "ffprobe", "ffprobe version 5.0");
    const info = await detectBinary("ffprobe", { paths, env, binaries: { ffmpeg } });
    expect(info).toMatchObject({ source: "config", path: join(custom, "ffprobe") });
  });

  it("falha se o caminho configurado não existe", async () => {
    await fakeBinary(systemDir, "yt-dlp", "1");
    await expect(
      detectBinary("yt-dlp", { paths, env, binaries: { ytDlp: join(root, "nope") } }),
    ).rejects.toThrow(BinaryError);
  });

  it("ignora arquivos sem permissão de execução", async () => {
    await mkdir(systemDir, { recursive: true });
    await writeFile(join(systemDir, "yt-dlp"), "");
    expect(await which("yt-dlp", env)).toBeNull();
  });

  it("monta relatório com ausentes e erros", async () => {
    await fakeBinary(systemDir, "yt-dlp", "2026.09.01");
    const report = await detectBinaries({
      paths,
      env,
      binaries: { ffmpeg: join(root, "missing", "ffmpeg") },
    });
    expect(report["yt-dlp"]).toMatchObject({ version: "2026.09.01" });
    expect(report.ffmpeg).toBeInstanceOf(BinaryError);
    expect(report.ffprobe).toBeInstanceOf(BinaryError);
  });
});
