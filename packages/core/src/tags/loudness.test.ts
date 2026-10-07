import { execFile } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { which } from "../binaries/which";
import {
  measureLoudness,
  normalizeAudio,
  parseEbur128,
  r128TrackGain,
  replayGainTags,
} from "./loudness";

const ffmpeg = await which("ffmpeg");

describe("loudness", () => {
  it("lê o resumo do ebur128 e calcula ReplayGain/R128", () => {
    const loudness = parseEbur128(
      "Summary:\n  Integrated loudness:\n    I:  -10.0 LUFS\n  True peak:\n    Peak:  -1.0 dBFS",
    );
    expect(loudness).toEqual({ integrated: -10, peak: -1 });
    expect(replayGainTags({ integrated: -10, peak: -1 }).REPLAYGAIN_TRACK_GAIN).toBe("-8.00 dB");
    expect(r128TrackGain({ integrated: -10, peak: -1 })).toBe(String(-13 * 256));
  });

  it.skipIf(!ffmpeg)("normaliza um áudio baixo para perto de -14 LUFS", async () => {
    const dir = await mkdtemp(join(tmpdir(), "jukeboxdl-loud-"));
    const quiet = join(dir, "quiet.opus");
    await promisify(execFile)(ffmpeg ?? "", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "sine=f=440:duration=5,volume=0.05",
      "-c:a",
      "libopus",
      quiet,
    ]);
    const before = await measureLoudness(ffmpeg ?? "", quiet);
    const output = join(dir, "normalized.opus");
    expect(await normalizeAudio(ffmpeg ?? "", quiet, output, "opus")).toBe(true);
    const after = await measureLoudness(ffmpeg ?? "", output);
    expect(before?.integrated).toBeLessThan(-25);
    expect(after?.integrated).toBeGreaterThan(-16);
    expect(after?.integrated).toBeLessThan(-12);
  });
});
