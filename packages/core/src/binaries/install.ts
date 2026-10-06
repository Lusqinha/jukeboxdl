import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { chmod, mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream } from "node:stream/web";
import { promisify } from "node:util";
import { DownloadError, UnsupportedPlatformError } from "../errors";
import { t } from "../i18n/messages";
import { type AppPaths, getAppPaths } from "../paths";
import {
  currentPlatform,
  executableName,
  ffmpegAsset,
  type PlatformInfo,
  ytDlpAsset,
} from "./platform";

const execFileAsync = promisify(execFile);

const YT_DLP_RELEASES = "https://github.com/yt-dlp/yt-dlp/releases";
const FFMPEG_RELEASES = "https://github.com/yt-dlp/FFmpeg-Builds/releases";

export interface InstallProgress {
  phase: "download" | "extract";
  received: number;
  total: number | null;
}

export interface InstallOptions {
  paths?: AppPaths;
  platformInfo?: PlatformInfo;
  onProgress?: (progress: InstallProgress) => void;
  signal?: AbortSignal;
  fetch?: typeof fetch;
}

/** Lê arquivos no formato do `sha256sum` (`<hash>  <arquivo>`). */
export function parseChecksums(text: string): Map<string, string> {
  const sums = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const match = /^([a-f0-9]{64})\s+\*?(.+)$/i.exec(line.trim());
    if (match?.[1] && match[2]) sums.set(match[2], match[1].toLowerCase());
  }
  return sums;
}

async function fetchOk(fetchImpl: typeof fetch, url: string, signal?: AbortSignal) {
  const response = await fetchImpl(url, signal ? { signal } : {});
  if (!response.ok)
    throw new DownloadError(t("install.httpError", { url, status: response.status }));
  return response;
}

async function expectedChecksum(
  fetchImpl: typeof fetch,
  url: string,
  asset: string,
  signal?: AbortSignal,
): Promise<string> {
  const sums = parseChecksums(await (await fetchOk(fetchImpl, url, signal)).text());
  const hash = sums.get(asset);
  if (!hash) throw new DownloadError(t("install.checksumMissing", { asset, url }));
  return hash;
}

/** Baixa para `dest` calculando o SHA-256 durante o download. */
async function downloadVerified(
  url: string,
  dest: string,
  expectedHash: string,
  { fetch: fetchImpl = fetch, onProgress, signal }: InstallOptions,
): Promise<void> {
  const response = await fetchOk(fetchImpl, url, signal);
  if (!response.body) throw new DownloadError(t("install.emptyResponse", { url }));

  const total = Number(response.headers.get("content-length")) || null;
  const hash = createHash("sha256");
  let received = 0;
  const meter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      hash.update(chunk);
      received += chunk.length;
      onProgress?.({ phase: "download", received, total });
      callback(null, chunk);
    },
  });

  await pipeline(
    Readable.fromWeb(response.body as ReadableStream<Uint8Array>),
    meter,
    createWriteStream(dest, { mode: 0o755 }),
    ...(signal ? [{ signal }] : []),
  );

  const actual = hash.digest("hex");
  if (actual !== expectedHash) {
    throw new DownloadError(t("install.checksumMismatch", { url, expected: expectedHash, actual }));
  }
}

/** Baixa (ou atualiza) o yt-dlp para o diretório de binários do app. */
export async function installYtDlp(options: InstallOptions = {}): Promise<string> {
  const {
    paths = getAppPaths(),
    platformInfo = currentPlatform(),
    fetch: fetchImpl = fetch,
  } = options;
  const asset = ytDlpAsset(platformInfo);
  if (!asset) {
    throw new UnsupportedPlatformError(
      t("install.noYtDlpBuild", { platform: `${platformInfo.platform}/${platformInfo.arch}` }),
    );
  }

  const base = `${YT_DLP_RELEASES}/latest/download`;
  const expected = await expectedChecksum(fetchImpl, `${base}/SHA2-256SUMS`, asset, options.signal);

  await mkdir(paths.bin, { recursive: true });
  const target = join(paths.bin, executableName("yt-dlp", platformInfo.platform));
  const tmp = join(paths.bin, `.yt-dlp-${randomUUID()}.part`);
  try {
    await downloadVerified(`${base}/${asset}`, tmp, expected, options);
    await chmod(tmp, 0o755);
    await rename(tmp, target);
  } finally {
    await rm(tmp, { force: true });
  }
  return target;
}

/** Baixa um build estático de ffmpeg + ffprobe para o diretório de binários do app. */
export async function installFfmpeg(
  options: InstallOptions = {},
): Promise<{ ffmpeg: string; ffprobe: string }> {
  const {
    paths = getAppPaths(),
    platformInfo = currentPlatform(),
    fetch: fetchImpl = fetch,
  } = options;
  const asset = ffmpegAsset(platformInfo);
  if (!asset) {
    const hint =
      platformInfo.platform === "darwin" ? t("install.ffmpegMacHint") : t("install.ffmpegHint");
    throw new UnsupportedPlatformError(
      t("install.noFfmpegBuild", {
        platform: `${platformInfo.platform}/${platformInfo.arch}`,
        hint,
      }),
    );
  }

  const archive = `${asset}.${asset.includes("win") ? "zip" : "tar.xz"}`;
  const base = `${FFMPEG_RELEASES}/latest/download`;
  const expected = await expectedChecksum(
    fetchImpl,
    `${base}/checksums.sha256`,
    archive,
    options.signal,
  );

  await mkdir(paths.bin, { recursive: true });
  const workdir = await mkdtemp(join(paths.bin, ".ffmpeg-"));
  try {
    const archivePath = join(workdir, archive);
    await downloadVerified(`${base}/${archive}`, archivePath, expected, options);

    options.onProgress?.({ phase: "extract", received: 0, total: null });
    // O tar do sistema descompacta .tar.xz e, no Windows (bsdtar), também .zip.
    await execFileAsync("tar", ["-xf", archivePath, "-C", workdir]);

    const result = { ffmpeg: "", ffprobe: "" };
    for (const name of ["ffmpeg", "ffprobe"] as const) {
      const file = executableName(name, platformInfo.platform);
      const target = join(paths.bin, file);
      await chmod(join(workdir, asset, "bin", file), 0o755);
      await rename(join(workdir, asset, "bin", file), target);
      result[name] = target;
    }
    return result;
  } finally {
    await rm(workdir, { recursive: true, force: true });
  }
}

/** Versão mais recente do yt-dlp, lida do redirecionamento de `releases/latest`. */
export async function latestYtDlpVersion(
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<string> {
  const response = await fetchImpl(`${YT_DLP_RELEASES}/latest`, {
    method: "HEAD",
    ...(signal && { signal }),
  });
  const version = /\/tag\/([^/?#]+)/.exec(response.url)?.[1];
  if (!version) throw new DownloadError(t("install.latestUnknown"));
  return decodeURIComponent(version);
}
