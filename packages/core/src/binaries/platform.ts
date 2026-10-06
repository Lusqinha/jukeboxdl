export type BinaryName = "yt-dlp" | "ffmpeg" | "ffprobe";

export interface PlatformInfo {
  platform: NodeJS.Platform;
  arch: string;
  /** Linux sem glibc (Alpine e afins). */
  musl: boolean;
}

export function currentPlatform(): PlatformInfo {
  const report = process.report?.getReport() as
    | { header?: { glibcVersionRuntime?: string } }
    | undefined;
  return {
    platform: process.platform,
    arch: process.arch,
    musl: process.platform === "linux" && !report?.header?.glibcVersionRuntime,
  };
}

export function executableName(name: string, platform: NodeJS.Platform = process.platform): string {
  return platform === "win32" ? `${name}.exe` : name;
}

/** Nome do arquivo no release do yt-dlp para a plataforma, ou `null` se não houver build. */
export function ytDlpAsset({ platform, arch, musl }: PlatformInfo): string | null {
  if (platform === "darwin") return "yt-dlp_macos";
  if (platform === "win32") {
    if (arch === "x64") return "yt-dlp.exe";
    if (arch === "arm64") return "yt-dlp_arm64.exe";
    return null;
  }
  if (platform === "linux") {
    const base = musl ? "yt-dlp_musllinux" : "yt-dlp_linux";
    if (arch === "x64") return base;
    if (arch === "arm64") return `${base}_aarch64`;
  }
  return null;
}

/** Nome base (sem extensão) do pacote no release yt-dlp/FFmpeg-Builds, com ffmpeg e ffprobe. */
export function ffmpegAsset({ platform, arch }: PlatformInfo): string | null {
  const targets: Record<string, string> = {
    "linux-x64": "linux64-gpl",
    "linux-arm64": "linuxarm64-gpl",
    "win32-x64": "win64-gpl",
    "win32-arm64": "winarm64-gpl",
  };
  const target = targets[`${platform}-${arch}`];
  return target ? `ffmpeg-master-latest-${target}` : null;
}
