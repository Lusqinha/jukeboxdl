import { join } from "node:path";
import {
  COVER_SOURCES,
  type CoverSource,
  detectBinary,
  getAppPaths,
  History,
  pathExists,
  updateCover,
} from "@jukeboxdl/core";
import { t } from "../lib/i18n";
import { fail, loadConfigOrFail } from "../lib/session";

export async function coversUpdateCommand(
  files: string[],
  options: { all?: boolean; source?: string },
): Promise<void> {
  const config = await loadConfigOrFail();
  const paths = getAppPaths();
  const [ffmpeg, ffprobe] = await Promise.all([
    detectBinary("ffmpeg", { binaries: config.binaries, paths }),
    detectBinary("ffprobe", { binaries: config.binaries, paths }),
  ]);
  if (!ffmpeg || !ffprobe) fail(`ffmpeg/ffprobe: ${t("doctor.notFound")} (jukeboxdl deps install)`);
  const source = (options.source ?? config.cover.source) as CoverSource;
  if (!COVER_SOURCES.includes(source)) fail(`${options.source}: ${COVER_SOURCES.join(", ")}`);

  let targets = files;
  if (options.all) {
    const history = new History(join(paths.data, "history.db"));
    try {
      const entries = history.list({ limit: 1_000_000 });
      const unique = [...new Set(entries.map((entry) => entry.path))];
      const existing = await Promise.all(
        unique.map(async (path) => ((await pathExists(path)) ? path : null)),
      );
      targets = [...targets, ...existing.filter((path): path is string => path !== null)];
    } finally {
      history.close();
    }
  }
  if (targets.length === 0) {
    console.log(t("covers.none"));
    return;
  }

  let updated = 0;
  let missing = 0;
  for (const file of targets) {
    try {
      const result = await updateCover(file, {
        source,
        ffmpeg: ffmpeg.path,
        ffprobe: ffprobe.path,
      });
      if (result.status === "updated") {
        updated++;
        console.log(t("covers.updated", { file, source: result.source }));
      } else {
        missing++;
        console.log(
          t(result.status === "unsupported" ? "covers.unsupported" : "covers.notFound", { file }),
        );
      }
    } catch (error) {
      missing++;
      console.log(
        t("covers.failed", { file, error: error instanceof Error ? error.message : String(error) }),
      );
    }
  }
  console.log(`\n${t("covers.summary", { updated, missing })}`);
  if (updated === 0) process.exitCode = 1;
}
