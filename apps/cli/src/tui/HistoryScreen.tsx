import type { HistoryEntry, Jukebox } from "@jukeboxdl/core";
import { Box, Text, useInput } from "ink";
import { useEffect, useState } from "react";
import { TextInput } from "../components/TextInput";
import { KeyHints } from "./KeyHints";
import { useCursor } from "./list";

export function HistoryScreen({
  jukebox,
  active,
  height,
  refreshKey,
}: {
  jukebox: Jukebox;
  active: boolean;
  height: number;
  /** Muda quando um download termina, para recarregar a lista. */
  refreshKey: number;
}) {
  const [filter, setFilter] = useState("");
  const [filtering, setFiltering] = useState(false);
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [version, setVersion] = useState(0);
  const pageSize = Math.max(3, height - 5);
  const cursor = useCursor(entries.length, pageSize);

  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshKey e version só disparam a recarga
  useEffect(() => {
    if (!active) return;
    setEntries(jukebox.history.list({ limit: 500, ...(filter && { search: filter }) }));
  }, [jukebox, filter, active, refreshKey, version]);

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
      <Box paddingX={1}>
        <Text color="cyan">/ </Text>
        <TextInput
          value={filter}
          onChange={setFilter}
          focus={active && filtering}
          placeholder="filtrar por título, artista ou álbum"
        />
      </Box>
      <Box flexDirection="column" flexGrow={1} marginTop={1}>
        {entries.length === 0 && (
          <Text dimColor> {filter ? "Nada encontrado." : "Nenhuma faixa baixada ainda."}</Text>
        )}
        {entries.slice(cursor.start, cursor.start + pageSize).map((entry, i) => {
          const isSelected = !filtering && cursor.start + i === cursor.index;
          const date = new Date(entry.downloadedAt).toLocaleString("pt-BR", {
            dateStyle: "short",
            timeStyle: "short",
          });
          return (
            <Box key={`${entry.videoId}-${entry.downloadedAt}`}>
              <Text color="cyan">{isSelected ? "❯ " : "  "}</Text>
              <Text dimColor>{date} </Text>
              <Box flexGrow={1} flexShrink={1}>
                <Text wrap="truncate-end" bold={isSelected}>
                  {entry.artist ? `${entry.artist} - ${entry.title}` : entry.title}
                </Text>
              </Box>
              {entry.playlist && (
                <Box flexShrink={0} marginLeft={2} width={20} justifyContent="flex-end">
                  <Text dimColor wrap="truncate-end">
                    {entry.playlist}
                  </Text>
                </Box>
              )}
            </Box>
          );
        })}
      </Box>
      <Text dimColor wrap="truncate-start">
        {"  "}
        {selected?.path ?? " "}
      </Text>
      <Box marginTop={1}>
        <KeyHints
          hints={[
            ["/", "filtrar"],
            ["d", "remover do histórico"],
            ["tab", "próxima aba"],
          ]}
        />
      </Box>
    </Box>
  );
}
