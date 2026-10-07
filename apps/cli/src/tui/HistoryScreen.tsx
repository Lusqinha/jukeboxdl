import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { expandHome, type HistoryEntry, type Jukebox, openPath, pathExists } from "@jukeboxdl/core";
import { Box, Text, useInput } from "ink";
import { useEffect, useRef, useState } from "react";
import { historyToCsv } from "../commands/history";
import { Panel, panelChrome } from "../components/Panel";
import { TextInput } from "../components/TextInput";
import { displayText } from "../lib/format";
import { formatDate, t } from "../lib/i18n";
import { KeyHints } from "./KeyHints";
import { ScrollHint, useCursor } from "./list";
import { Pointer } from "./Pointer";
import { useTheme } from "./theme";

export function HistoryScreen({
  jukebox,
  active,
  height,
  refreshKey,
  onCaptureChange,
  onFlash,
  outputDir,
}: {
  jukebox: Jukebox;
  active: boolean;
  height: number;
  /** Muda quando um download termina, para recarregar a lista. */
  refreshKey: number;
  onCaptureChange: (capturing: boolean) => void;
  onFlash: (message: string) => void;
  outputDir: string | null;
}) {
  const [filter, setFilter] = useState("");
  const [filtering, setFiltering] = useState(false);
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [version, setVersion] = useState(0);
  const theme = useTheme();
  // Moldura + filtro (1) + caminho (1) + indicadores (2) + atalhos (2).
  const pageSize = Math.max(3, height - panelChrome(theme, true) - 6);
  const cursor = useCursor(entries.length, pageSize);

  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshKey e version só disparam a recarga
  useEffect(() => {
    if (!active) return;
    setEntries(jukebox.history.list({ limit: 500, ...(filter && { search: filter }) }));
  }, [jukebox, filter, active, refreshKey, version]);

  useEffect(() => {
    onCaptureChange(filtering);
  }, [filtering, onCaptureChange]);

  const updatingCovers = useRef(false);

  const updateOne = async (path: string) => {
    const result = await jukebox.updateCover(path).catch(() => ({ status: "not-found" as const }));
    onFlash(
      result.status === "updated"
        ? t("flash.coverUpdated", { source: result.source })
        : t("flash.coverNotFound"),
    );
  };

  const updateAll = async () => {
    if (updatingCovers.current) return;
    updatingCovers.current = true;
    const paths = [
      ...new Set(jukebox.history.list({ limit: 1_000_000 }).map((entry) => entry.path)),
    ];
    let updated = 0;
    let missing = 0;
    try {
      for (const [i, path] of paths.entries()) {
        onFlash(t("flash.coversProgress", { done: i + 1, total: paths.length }));
        if (!(await pathExists(path))) continue;
        const result = await jukebox
          .updateCover(path)
          .catch(() => ({ status: "not-found" as const }));
        if (result.status === "updated") updated++;
        else missing++;
      }
    } finally {
      updatingCovers.current = false;
      onFlash(t("flash.coversDone", { updated, missing }));
    }
  };

  const exportCsv = async () => {
    const file = join(
      expandHome(jukebox.config.outputDir),
      `jukeboxdl-${new Date().toISOString().slice(0, 10)}.csv`,
    );
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, historyToCsv(jukebox.history.list({ limit: 1_000_000 })));
    onFlash(t("flash.exported", { path: file }));
  };

  useInput(
    (input, key) => {
      if (filtering) {
        if (key.return || key.escape || key.downArrow) setFiltering(false);
        return;
      }
      if (cursor.handleKey(key, input)) return;
      const selected = entries[cursor.index];
      if (input === "/") setFiltering(true);
      else if (input === "d" && selected) {
        jukebox.history.remove(selected.videoId);
        setVersion((v) => v + 1);
      } else if (input === "o" && selected) openPath(dirname(selected.path));
      else if (input === "r" && selected) {
        jukebox.queue.add([
          {
            video: {
              id: selected.videoId,
              title: selected.title,
              url: `https://www.youtube.com/watch?v=${selected.videoId}`,
            },
            redownload: true,
            outputDir: outputDir ?? undefined,
          },
        ]);
        onFlash(t("flash.queued", { n: 1 }));
      } else if (input === "e") void exportCsv();
      else if (input === "t" && selected) void updateOne(selected.path);
      else if (input === "T") void updateAll();
      else if (key.escape && filter) setFilter("");
    },
    { isActive: active },
  );

  const selected = entries[cursor.index];

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Panel
        title={t("panel.history")}
        right={<Text color={theme.meta}>{t("history.count", { n: entries.length })}</Text>}
        flexGrow={1}
      >
        <Box>
          <Text color={theme.accent}>/ </Text>
          <TextInput
            value={filter}
            onChange={setFilter}
            focus={active && filtering}
            placeholder={t("history.filterPlaceholder")}
          />
        </Box>
        <Box flexDirection="column" flexGrow={1}>
          {entries.length === 0 && (
            <Text color={theme.muted}>
              {" "}
              {filter ? t("history.nothingFound") : t("history.none")}
            </Text>
          )}
          <ScrollHint
            start={cursor.start}
            pageSize={pageSize}
            length={entries.length}
            position="above"
          />
          {entries.slice(cursor.start, cursor.start + pageSize).map((entry, i) => {
            const isSelected = !filtering && cursor.start + i === cursor.index;
            const date = formatDate(entry.downloadedAt);
            return (
              <Box
                key={`${entry.videoId}-${entry.downloadedAt}`}
                {...(isSelected && { backgroundColor: theme.selectionBg })}
              >
                <Pointer selected={isSelected} />
                <Text color={theme.meta}>{date} </Text>
                <Box flexGrow={1} flexShrink={1}>
                  <Text wrap="truncate-end" bold={isSelected}>
                    {displayText(entry.artist ? `${entry.artist} - ${entry.title}` : entry.title)}
                  </Text>
                </Box>
                {entry.playlist && (
                  <Box flexShrink={0} marginLeft={2} width={20} justifyContent="flex-end">
                    <Text color={theme.accent} wrap="truncate-end">
                      {displayText(entry.playlist)}
                    </Text>
                  </Box>
                )}
              </Box>
            );
          })}
          <ScrollHint
            start={cursor.start}
            pageSize={pageSize}
            length={entries.length}
            position="below"
          />
        </Box>
        <Text color={theme.muted} wrap="truncate-start">
          {selected?.path ?? " "}
        </Text>
      </Panel>
      <Box marginTop={1}>
        <KeyHints
          hints={[
            ["/", t("key.filter")],
            ["o", t("key.openFolder")],
            ["r", t("key.redownload")],
            ["e", t("key.export")],
            ["t/T", t("key.updateCover")],
            ["d", t("key.removeHistory")],
            ["?", t("key.help")],
          ]}
        />
      </Box>
    </Box>
  );
}
