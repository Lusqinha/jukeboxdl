import type { Jukebox, PlaylistItem, VideoSummary } from "@jukeboxdl/core";
import { Box, Text, useInput } from "ink";
import { useEffect, useRef, useState } from "react";
import { Spinner } from "../components/Spinner";
import { TextInput } from "../components/TextInput";
import { displayText, formatDuration, isUrl, videoIdFromUrl } from "../lib/format";
import { KeyHints } from "./KeyHints";
import { ScrollHint, useCursor } from "./list";
import { SELECTION_BG } from "./theme";

type Results =
  | { kind: "search"; query: string; items: VideoSummary[] }
  | { kind: "playlist"; title: string; items: PlaylistItem[]; unavailable: number };

export function SearchScreen({
  jukebox,
  active,
  height,
  onFlash,
  onCaptureChange,
}: {
  jukebox: Jukebox;
  active: boolean;
  height: number;
  onFlash: (message: string) => void;
  onCaptureChange: (capturing: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const [focus, setFocus] = useState<"input" | "list">("input");
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Results | null>(null);
  const [marked, setMarked] = useState<Set<string>>(new Set());
  const [downloaded, setDownloaded] = useState<Set<string>>(new Set());
  const abort = useRef<AbortController | null>(null);
  const pending = useRef<string | null>(null);

  const items: VideoSummary[] = results?.items ?? [];
  // Campo de busca (3) + cabeçalho (1) + indicadores de rolagem (2) + atalhos (2).
  const pageSize = Math.max(3, height - 7);
  const cursor = useCursor(items.length, pageSize);
  const lastQuery = useRef<string | null>(null);

  useEffect(() => {
    onCaptureChange(focus === "input");
  }, [focus, onCaptureChange]);

  const submit = async (value: string) => {
    const text = value.trim();
    if (!text || pending.current === text) return;
    // Mesma busca já exibida: só desce para os resultados.
    if (text === lastQuery.current && items.length > 0) {
      setFocus("list");
      return;
    }
    pending.current = text;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setLoading(isUrl(text) ? "Lendo link…" : "Buscando…");
    setError(null);
    try {
      let next: Results;
      let initialMarks = new Set<string>();
      if (isUrl(text)) {
        const result = await jukebox.resolve(text, { signal: controller.signal });
        if (result.kind === "video") {
          next = { kind: "search", query: text, items: [result.video] };
          initialMarks = new Set([result.video.id]);
        } else {
          next = {
            kind: "playlist",
            title: result.title,
            items: result.items,
            unavailable: result.unavailable,
          };
          // Link de vídeo dentro de uma playlist: marca só o vídeo; senão, a playlist toda.
          const videoId = videoIdFromUrl(text);
          initialMarks = new Set(
            videoId && result.items.some((i) => i.id === videoId)
              ? [videoId]
              : result.items.map((i) => i.id),
          );
        }
      } else {
        next = {
          kind: "search",
          query: text,
          items: await jukebox.search(text, 20, controller.signal),
        };
      }
      if (controller.signal.aborted) return;
      lastQuery.current = text;
      setResults(next);
      setMarked(initialMarks);
      cursor.setIndex(0);
      setFocus(next.items.length > 0 ? "list" : "input");
      const flags = await Promise.all(next.items.map((item) => jukebox.isDownloaded(item.id)));
      if (!controller.signal.aborted)
        setDownloaded(new Set(next.items.filter((_, i) => flags[i]).map((i) => i.id)));
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (abort.current === controller) {
        setLoading(null);
        pending.current = null;
      }
    }
  };

  const enqueue = () => {
    if (!results) return;
    const current = items[cursor.index];
    const chosen =
      marked.size > 0 ? items.filter((i) => marked.has(i.id)) : current ? [current] : [];
    if (chosen.length === 0) return;
    if (results.kind === "playlist") jukebox.enqueuePlaylist(results, chosen as PlaylistItem[]);
    else jukebox.enqueue(chosen);
    onFlash(
      `${chosen.length} faixa${chosen.length > 1 ? "s" : ""} adicionada${chosen.length > 1 ? "s" : ""} à fila`,
    );
    setMarked(new Set());
  };

  useInput(
    (input, key) => {
      if (focus === "input") {
        if (key.downArrow && items.length > 0) setFocus("list");
        if (key.escape && items.length > 0) setFocus("list");
        return;
      }
      if (key.upArrow && cursor.index === 0) return setFocus("input");
      if (cursor.handleKey(key)) return;
      if (key.return) return enqueue();
      if (key.escape || input === "/") return setFocus("input");
      const current = items[cursor.index];
      if (input === " " && current) {
        setMarked((m) => {
          const next = new Set(m);
          if (next.has(current.id)) next.delete(current.id);
          else next.add(current.id);
          return next;
        });
        cursor.setIndex(Math.min(items.length - 1, cursor.index + 1));
        return;
      }
      if (input === "a") {
        setMarked((m) => (m.size === items.length ? new Set() : new Set(items.map((i) => i.id))));
        return;
      }
      // Qualquer outra letra volta para a busca e começa a digitar (números trocam de aba).
      if (
        input &&
        !key.ctrl &&
        !key.meta &&
        !key.tab &&
        input.length === 1 &&
        input >= " " &&
        !/[1-4]/.test(input)
      ) {
        setQuery(input);
        setFocus("input");
      }
    },
    { isActive: active },
  );

  const visible = items.slice(cursor.start, cursor.start + pageSize);

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box
        borderStyle="round"
        borderColor={focus === "input" && active ? "cyan" : "gray"}
        paddingX={1}
      >
        <Text color="cyan">{loading ? <Spinner /> : "🔎"} </Text>
        <TextInput
          value={query}
          onChange={setQuery}
          onSubmit={submit}
          focus={active && focus === "input"}
          placeholder="Buscar música ou colar link de vídeo/playlist"
        />
      </Box>

      {error && <Text color="red"> ✖ {error}</Text>}
      {loading && !results && (
        <Text dimColor>
          {"  "}
          {loading}
        </Text>
      )}

      {results && (
        <Box flexDirection="column" flexGrow={1}>
          <Text dimColor>
            {"  "}
            {results.kind === "playlist"
              ? `Playlist "${results.title}" · ${results.items.length} faixas${results.unavailable ? ` · ${results.unavailable} indisponíveis` : ""}`
              : `${results.items.length} resultado${results.items.length === 1 ? "" : "s"}`}
            {marked.size > 0 && (
              <Text color="cyan">
                {" "}
                · {marked.size} marcada{marked.size > 1 ? "s" : ""}
              </Text>
            )}
          </Text>
          <ScrollHint
            start={cursor.start}
            pageSize={pageSize}
            length={items.length}
            position="above"
          />
          {visible.map((item, i) => {
            const index = cursor.start + i;
            const selected = focus === "list" && index === cursor.index;
            const isMarked = marked.has(item.id);
            return (
              <Box key={item.id} {...(selected && { backgroundColor: SELECTION_BG })}>
                <Text color="cyan">{selected ? "❯ " : "  "}</Text>
                <Text color={isMarked ? "cyan" : "gray"}>{isMarked ? "◉ " : "○ "}</Text>
                {"index" in item && <Text dimColor>{String(item.index).padStart(3)} </Text>}
                <Box flexGrow={1} flexShrink={1}>
                  <Text wrap="truncate-end" bold={selected}>
                    {displayText(item.title)}
                  </Text>
                </Box>
                <Box flexShrink={0} marginLeft={2}>
                  {downloaded.has(item.id) && <Text color="green">✓ </Text>}
                  <Box width={22} justifyContent="flex-end">
                    <Text dimColor wrap="truncate-end">
                      {displayText(item.channel ?? "")}
                    </Text>
                  </Box>
                  <Box width={8} justifyContent="flex-end">
                    <Text dimColor>{formatDuration(item.duration)}</Text>
                  </Box>
                </Box>
              </Box>
            );
          })}
          <ScrollHint
            start={cursor.start}
            pageSize={pageSize}
            length={items.length}
            position="below"
          />
        </Box>
      )}

      {!results && !loading && !error && (
        <Box flexDirection="column" paddingX={2} paddingY={1}>
          <Text dimColor>Digite o nome de uma música, artista ou álbum e tecle enter.</Text>
          <Text dimColor>
            Links do YouTube e YouTube Music (vídeos, playlists e álbuns) também funcionam.
          </Text>
        </Box>
      )}

      <Box marginTop={1}>
        {focus === "input" ? (
          <KeyHints
            hints={[
              ["enter", "buscar"],
              ["↓", "resultados"],
              ["tab", "próxima aba"],
              ["ctrl+c", "sair"],
            ]}
          />
        ) : (
          <KeyHints
            hints={[
              ["enter", marked.size > 0 ? `baixar ${marked.size}` : "baixar"],
              ["espaço", "marcar"],
              ["a", "marcar todas"],
              ["/", "buscar"],
              ["tab", "próxima aba"],
            ]}
          />
        )}
      </Box>
    </Box>
  );
}
