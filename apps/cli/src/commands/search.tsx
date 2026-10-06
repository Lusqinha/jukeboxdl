import { formatDuration } from "../lib/format";
import { t } from "../lib/i18n";
import { openJukebox } from "../lib/session";

export async function searchCommand(
  query: string[],
  options: { limit: string; json?: boolean },
): Promise<void> {
  const jukebox = await openJukebox();
  try {
    const results = await jukebox.search(query.join(" "), Number(options.limit) || 10);
    if (options.json) {
      console.log(JSON.stringify(results, null, 2));
      return;
    }
    if (results.length === 0) {
      console.log(t("search.none"));
      return;
    }
    const width = String(results.length).length;
    results.forEach((video, i) => {
      console.log(
        `${String(i + 1).padStart(width)}. ${video.title}  \x1b[2m${formatDuration(video.duration)} · ${video.channel ?? "?"}\x1b[0m\n` +
          `${" ".repeat(width + 2)}\x1b[2m${video.url}\x1b[0m`,
      );
    });
  } finally {
    await jukebox.close();
  }
}
