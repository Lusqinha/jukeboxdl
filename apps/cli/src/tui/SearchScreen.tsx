import type { Jukebox, PlaylistItem, VideoSummary } from "@jukeboxdl/core";
import { Box, Text, useInput, useWindowSize } from "ink";
import { useEffect, useRef, useState } from "react";
import { Panel, panelChrome } from "../components/Panel";
import { Spinner } from "../components/Spinner";
import { StarBackdrop } from "../components/Starfield";
import { TextInput } from "../components/TextInput";
import { displayText, formatDuration, isUrl, videoIdFromUrl } from "../lib/format";
import { KeyHints } from "./KeyHints";
import { ScrollHint, useCursor } from "./list";
import { Pointer } from "./Pointer";
import { useTheme } from "./theme";

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
  const theme = useTheme();
  const { columns } = useWindowSize();
  // Campo (3) + moldura/cabeçalho dos resultados + indicadores de rolagem (2) + atalhos (2).
  const pageSize = Math.max(3, height - 3 - (theme.retro ? panelChrome(theme, true) : 1) - 4);
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
  const inputFocused = active && focus === "input";
  const summary = results
    ? results.kind === "playlist"
      ? `playlist "${displayText(results.title)}" · ${results.items.length} faixas${results.unavailable ? ` · ${results.unavailable} indisponíveis` : ""}`
      : `${results.items.length} resultado${results.items.length === 1 ? "" : "s"}`
    : "";

  const input = (
    <Box
      borderStyle={theme.retro ? "single" : "round"}
      {...(theme.retro
        ? {
            borderTopColor: theme.bevelDark,
            borderLeftColor: theme.bevelDark,
            borderBottomColor: theme.bevelLight,
            borderRightColor: theme.bevelLight,
          }
        : { borderColor: inputFocused ? "cyan" : "gray" })}
      paddingX={1}
    >
      <Text color={theme.retro ? theme.accent : theme.link}>
        {loading ? <Spinner /> : theme.retro ? "»" : "🔎"}{" "}
      </Text>
      <TextInput
        value={query}
        onChange={setQuery}
        onSubmit={submit}
        focus={inputFocused}
        placeholder="buscar música ou colar link de vídeo/playlist"
      />
    </Box>
  );

  const list = results && (
    <Box flexDirection="column" flexGrow={1}>
      <ScrollHint start={cursor.start} pageSize={pageSize} length={items.length} position="above" />
      {visible.map((item, i) => {
        const index = cursor.start + i;
        const selected = focus === "list" && index === cursor.index;
        const isMarked = marked.has(item.id);
        return (
          <Box key={item.id} {...(selected && { backgroundColor: theme.selectionBg })}>
            <Pointer selected={selected} />
            <Text color={isMarked ? theme.accent : theme.muted}>{isMarked ? "◉ " : "○ "}</Text>
            {"index" in item && <Text color={theme.muted}>{String(item.index).padStart(3)} </Text>}
            <Box flexGrow={1} flexShrink={1}>
              <Text
                wrap="truncate-end"
                bold={selected}
                {...(theme.retro && selected && { color: "#ffffff" })}
              >
                {displayText(item.title)}
              </Text>
            </Box>
            <Box flexShrink={0} marginLeft={2}>
              {downloaded.has(item.id) && <Text color={theme.success}>✓ </Text>}
              <Box width={22} justifyContent="flex-end">
                <Text color={theme.meta} wrap="truncate-end">
                  {displayText(item.channel ?? "")}
                </Text>
              </Box>
              <Box width={8} justifyContent="flex-end">
                <Text color={theme.meta}>{formatDuration(item.duration)}</Text>
              </Box>
            </Box>
          </Box>
        );
      })}
      <ScrollHint start={cursor.start} pageSize={pageSize} length={items.length} position="below" />
    </Box>
  );

  // Área disponível para o estado vazio: tudo menos campo, moldura e atalhos.
  const emptyHeight = Math.max(3, height - 3 - panelChrome(theme, true) - 2);
  const emptyWidth = Math.max(10, columns - (theme.retro ? 4 : 0));
  const empty = (
    <StarBackdrop
      width={emptyWidth}
      height={emptyHeight}
      contentWidth={Math.min(emptyWidth, 84)}
      contentHeight={4}
      seed={7}
    >
      {error ? (
        <Text color={theme.danger}>✖ {error}</Text>
      ) : loading ? (
        <Text color={theme.notice}>
          <Spinner /> {loading}
        </Text>
      ) : (
        <>
          <Text color={theme.notice}>
            {theme.retro ? "★ " : ""}digite uma música, artista ou álbum e tecle enter
            {theme.retro ? " ★" : ""}
          </Text>
          <Text color={theme.muted}>
            links do YouTube e YouTube Music (vídeos, playlists e álbuns) também valem
          </Text>
        </>
      )}
    </StarBackdrop>
  );

  const header = (
    <Text color={theme.muted}>
      {summary}
      {marked.size > 0 && (
        <Text color={theme.accent}>
          {" "}
          · {marked.size} marcada{marked.size > 1 ? "s" : ""}
        </Text>
      )}
    </Text>
  );

  return (
    <Box flexDirection="column" flexGrow={1}>
      {input}
      {theme.retro ? (
        <Panel title={results ? "resultados" : "sintonizar"} right={results && header} flexGrow={1}>
          {results && error && <Text color={theme.danger}>✖ {error}</Text>}
          {results ? list : empty}
        </Panel>
      ) : (
        <Box flexDirection="column" flexGrow={1}>
          {results ? (
            <>
              <Box paddingLeft={2}>{header}</Box>
              {error && <Text color={theme.danger}> ✖ {error}</Text>}
              {list}
            </>
          ) : (
            empty
          )}
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
              ["1-4", "abas"],
            ]}
          />
        )}
      </Box>
    </Box>
  );
}
