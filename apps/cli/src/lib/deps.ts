import type { BinaryReport } from "@jukeboxdl/core";
import type { DepTask } from "../components/DepsInstaller";

const missing = (report: BinaryReport, name: keyof BinaryReport) => {
  const entry = report[name];
  return !entry || entry instanceof Error;
};

/** Quais binários precisam ser baixados. */
export function missingDeps(report: BinaryReport): DepTask[] {
  const tasks: DepTask[] = [];
  if (missing(report, "yt-dlp")) tasks.push("yt-dlp");
  if (missing(report, "ffmpeg") || missing(report, "ffprobe")) tasks.push("ffmpeg");
  return tasks;
}
