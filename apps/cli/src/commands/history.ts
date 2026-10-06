import { join } from "node:path";
import { getAppPaths, History } from "@jukeboxdl/core";

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
      console.log("Histórico vazio.");
      return;
    }
    for (const entry of entries) {
      const date = new Date(entry.downloadedAt).toLocaleString("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
      });
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
    console.log(removed ? `✔ ${removed} registro(s) removido(s)` : "Nenhum registro com esse id.");
  } finally {
    history.close();
  }
}
