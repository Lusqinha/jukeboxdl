import type { HistoryEntry, Jukebox } from "@jukeboxdl/core";
import { Box, Text, useInput } from "ink";
import { useEffect, useState } from "react";
import { Panel, panelChrome } from "../components/Panel";
import { TextInput } from "../components/TextInput";
import { displayText } from "../lib/format";
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
}: {
  jukebox: Jukebox;
  active: boolean;
  height: number;
  /** Muda quando um download termina, para recarregar a lista. */
  refreshKey: number;
  onCaptureChange: (capturing: boolean) => void;
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

  useInput(
    (input, key) => {
      if (filtering) {
        if (key.return || key.escape || key.downArrow) setFiltering(false);
        return;
      }
      if (cursor.handleKey(key)) return;
      const selected = entries[cursor.index];
      if (input === "/") setFiltering(true);
      else if (input === "d" && selected) {
        jukebox.history.remove(selected.videoId);
        setVersion((v) => v + 1);
      } else if (key.escape && filter) setFilter("");
    },
    { isActive: active },
  );

  const selected = entries[cursor.index];

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Panel
        title="histórico"
        right={<Text color={theme.meta}>{entries.length} faixas</Text>}
        flexGrow={1}
      >
        <Box>
          <Text color={theme.accent}>/ </Text>
          <TextInput
            value={filter}
            onChange={setFilter}
            focus={active && filtering}
            placeholder="filtrar por título, artista ou álbum"
          />
        </Box>
        <Box flexDirection="column" flexGrow={1}>
          {entries.length === 0 && (
            <Text color={theme.muted}>
              {" "}
              {filter ? "nada encontrado." : "nenhuma faixa baixada ainda."}
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
            const date = new Date(entry.downloadedAt).toLocaleString("pt-BR", {
              dateStyle: "short",
              timeStyle: "short",
            });
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
            ["/", "filtrar"],
            ["d", "remover do histórico"],
            ["1-4", "abas"],
          ]}
        />
      </Box>
    </Box>
  );
}
