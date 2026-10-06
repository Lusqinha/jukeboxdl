import { describe, expect, it } from "vitest";
import { ffmpegAsset, ytDlpAsset } from "./platform";

describe("assets", () => {
  it.each([
    ["linux", "x64", false, "yt-dlp_linux"],
    ["linux", "arm64", false, "yt-dlp_linux_aarch64"],
    ["linux", "x64", true, "yt-dlp_musllinux"],
    ["darwin", "arm64", false, "yt-dlp_macos"],
    ["win32", "x64", false, "yt-dlp.exe"],
    ["linux", "ia32", false, null],
  ] as const)("yt-dlp em %s/%s (musl=%s)", (platform, arch, musl, expected) => {
    expect(ytDlpAsset({ platform, arch, musl })).toBe(expected);
  });

  it("ffmpeg não tem build para macOS", () => {
    expect(ffmpegAsset({ platform: "darwin", arch: "arm64", musl: false })).toBeNull();
    expect(ffmpegAsset({ platform: "linux", arch: "x64", musl: false })).toBe(
      "ffmpeg-master-latest-linux64-gpl",
    );
  });
});
