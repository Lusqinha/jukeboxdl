import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getAppPaths, History, type HistoryEntry } from "@jukeboxdl/core";
import { formatDate, t } from "../lib/i18n";

function openHistory(): History {
  return new History(join(getAppPaths().data, "history.db"));
}

export function historyListCommand(options: {
  search?: string;
  limit: string;
  json?: boolean;
}): void {
  const history = openHistory();
  try {
    const entries = history.list({
      limit: Number(options.limit) || 20,
      ...(options.search && { search: options.search }),
    });
    if (options.json) {
      console.log(JSON.stringify(entries, null, 2));
      return;
    }
    if (entries.length === 0) {
      console.log(t("history.empty"));
      return;
    }
    for (const entry of entries) {
      const date = formatDate(entry.downloadedAt);
      const name = entry.artist ? `${entry.artist} - ${entry.title}` : entry.title;
      console.log(
        `\x1b[2m${date}\x1b[0m  ${name}  \x1b[2m[${entry.videoId}]\x1b[0m\n                  \x1b[2m${entry.path}\x1b[0m`,
      );
    }
  } finally {
    history.close();
  }
}

export function historyRemoveCommand(videoId: string): void {
  const history = openHistory();
  try {
    const removed = history.remove(videoId);
    console.log(removed ? t("history.removed", { n: removed }) : t("history.noRecord"));
  } finally {
    history.close();
  }
}

const csvField = (value: string | undefined) => {
  const text = value ?? "";
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export function historyToCsv(entries: HistoryEntry[]): string {
  const header = "downloaded_at,video_id,artist,title,album,playlist,path";
  const rows = entries.map((e) =>
    [e.downloadedAt, e.videoId, e.artist, e.title, e.album, e.playlist, e.path]
      .map(csvField)
      .join(","),
  );
  return `${[header, ...rows].join("\n")}\n`;
}

export async function historyExportCommand(options: {
  format: "csv" | "json";
  output?: string;
}): Promise<void> {
  const history = openHistory();
  try {
    const entries = history.list({ limit: 1_000_000 });
    const content =
      options.format === "json" ? `${JSON.stringify(entries, null, 2)}\n` : historyToCsv(entries);
    if (!options.output) {
      process.stdout.write(content);
      return;
    }
    await writeFile(options.output, content);
    console.log(t("history.exported", { path: options.output }));
  } finally {
    history.close();
  }
}
