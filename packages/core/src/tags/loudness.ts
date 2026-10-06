import { runCommand } from "../process";

export interface Loudness {
  /** Volume integrado em LUFS. */
  integrated: number;
  /** Pico verdadeiro em dBFS. */
  peak: number;
}

/** ReplayGain 2.0 usa -18 LUFS como referência. */
const REPLAYGAIN_REFERENCE = -18;
/** Tags R128 do Opus usam -23 LUFS. */
const R128_REFERENCE = -23;

export function parseEbur128(output: string): Loudness | null {
  const summary = output.slice(output.lastIndexOf("Summary:"));
  const integrated = /I:\s+(-?[\d.]+) LUFS/.exec(summary)?.[1];
  const peak = /Peak:\s+(-?[\d.]+|-inf) dBFS/.exec(summary)?.[1];
  if (integrated === undefined || peak === undefined) return null;
  return { integrated: Number(integrated), peak: peak === "-inf" ? -120 : Number(peak) };
}

/** Mede o volume com o filtro ebur128 do ffmpeg. */
export async function measureLoudness(
  ffmpeg: string,
  file: string,
  signal?: AbortSignal,
): Promise<Loudness | null> {
  const result = await runCommand(
    ffmpeg,
    ["-hide_banner", "-nostats", "-i", file, "-af", "ebur128=peak=true", "-f", "null", "-"],
    { signal },
  );
  return result.code === 0 ? parseEbur128(result.stderr) : null;
}

export function replayGainTags(loudness: Loudness): Record<string, string> {
  const gain = REPLAYGAIN_REFERENCE - loudness.integrated;
  return {
    REPLAYGAIN_TRACK_GAIN: `${gain.toFixed(2)} dB`,
    REPLAYGAIN_TRACK_PEAK: (10 ** (loudness.peak / 20)).toFixed(6),
  };
}

/** R128_TRACK_GAIN do Opus: ganho relativo a -23 LUFS em ponto fixo Q7.8. */
export function r128TrackGain(loudness: Loudness): string {
  return String(Math.round((R128_REFERENCE - loudness.integrated) * 256));
}
