import {
  applyFilters,
  DEFAULT_FILTERS,
  type DurationFilter,
  type Jukebox,
  type PlaylistItem,
  type SearchFilters,
  type VideoSummary,
} from "@jukeboxdl/core";
import { Box, Text, useInput, useWindowSize } from "ink";
import { useEffect, useRef, useState } from "react";
import { Panel, panelChrome } from "../components/Panel";
import { Spinner } from "../components/Spinner";
import { StarBackdrop } from "../components/Starfield";
import { TextInput } from "../components/TextInput";
import { displayText, formatDuration, isUrl, videoIdFromUrl } from "../lib/format";
import { t } from "../lib/i18n";
import { KeyHints } from "./KeyHints";
import { ScrollHint, useCursor } from "./list";
import { Pointer } from "./Pointer";
import { useTheme } from "./theme";

type Results =
  | { kind: "search"; query: string; items: VideoSummary[]; hasMore: boolean }
  | { kind: "playlist"; title: string; items: PlaylistItem[]; unavailable: number };

const PAGE_SIZE = 20;
/** Faltando esta quantidade de itens para o fim da lista, a próxima página é carregada. */
const LOAD_MORE_THRESHOLD = 3;
/** Letras que são atalhos na lista (as demais começam uma nova busca). */
const LIST_SHORTCUTS = /^[acdfgjkpqvGU?/1-4]$/;

const nextDuration: Record<DurationFilter, DurationFilter> = {
  any: "short",
  short: "long",
  long: "any",
};

export function SearchScreen({
  jukebox,
  active,
  height,
  onFlash,
  onCaptureChange,
  focusRequest,
  outputDir,
}: {
  jukebox: Jukebox;
  active: boolean;
  height: number;
  onFlash: (message: string) => void;
  onCaptureChange: (capturing: boolean) => void;
  /** Muda quando outra parte da interface pede foco no campo de busca. */
  focusRequest: number;
  /** Pasta de destino da sessão, quando diferente da config. */
  outputDir: string | null;
}) {
  const [query, setQuery] = useState("");
  const [focus, setFocus] = useState<"input" | "list">("input");
  const [loading, setLoading] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Results | null>(null);
  const [marked, setMarked] = useState<Set<string>>(new Set());
  const [downloaded, setDownloaded] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<SearchFilters>(DEFAULT_FILTERS);
  const abort = useRef<AbortController | null>(null);
  const pending = useRef<string | null>(null);

  const rawItems: VideoSummary[] = results?.items ?? [];
  const items = results?.kind === "search" ? applyFilters(rawItems, filters) : rawItems;
  const hidden = rawItems.length - items.length;
  const theme = useTheme();
  const { columns } = useWindowSize();
  // Campo (3) + moldura/cabeçalho dos resultados + indicadores de rolagem (2) + atalhos (2).
  const pageSize = Math.max(3, height - 3 - (theme.retro ? panelChrome(theme, true) : 1) - 4);
  const cursor = useCursor(items.length, pageSize);
  const lastQuery = useRef<string | null>(null);

  useEffect(() => {
    onCaptureChange(focus === "input");
  }, [focus, onCaptureChange]);

  useEffect(() => {
    if (focusRequest > 0) setFocus("input");
  }, [focusRequest]);

  const markDownloaded = async (videos: VideoSummary[], signal: AbortSignal) => {
    const flags = await Promise.all(videos.map((item) => jukebox.isDownloaded(item.id)));
    if (signal.aborted) return;
    const found = videos.filter((_, i) => flags[i]).map((item) => item.id);
    if (found.length > 0) setDownloaded((d) => new Set([...d, ...found]));
  };

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
    setLoading(isUrl(text) ? t("search.loadingLink") : t("search.loading"));
    setError(null);
    try {
      let next: Results;
      let initialMarks = new Set<string>();
      if (isUrl(text)) {
        const result = await jukebox.resolve(text, { signal: controller.signal });
        if (result.kind === "video") {
          next = { kind: "search", query: text, items: [result.video], hasMore: false };
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
        const page = await jukebox.searchPage(text, {
          limit: PAGE_SIZE,
          signal: controller.signal,
        });
        next = { kind: "search", query: text, items: page, hasMore: page.length === PAGE_SIZE };
      }
      if (controller.signal.aborted) return;
      lastQuery.current = text;
      setResults(next);
      setMarked(initialMarks);
      setDownloaded(new Set());
      cursor.setIndex(0);
      setFocus(next.items.length > 0 ? "list" : "input");
      await markDownloaded(next.items, controller.signal);
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (abort.current === controller) {
        setLoading(null);
        pending.current = null;
      }
    }
  };

  // Paginação: perto do fim da lista (ou com poucos itens visíveis pelos filtros), busca mais.
  // biome-ignore lint/correctness/useExhaustiveDependencies: dispara só pela posição na lista e pelos resultados
  useEffect(() => {
    if (results?.kind !== "search" || !results.hasMore || loadingMore || loading) return;
    if (items.length - cursor.index > LOAD_MORE_THRESHOLD && items.length >= pageSize) return;
    const controller = abort.current ?? new AbortController();
    const current = results;
    setLoadingMore(true);
    jukebox
      .searchPage(current.query, {
        offset: current.items.length,
        limit: PAGE_SIZE,
        signal: controller.signal,
      })
      .then(async (page) => {
        if (controller.signal.aborted) return;
        const known = new Set(current.items.map((item) => item.id));
        const fresh = page.filter((item) => !known.has(item.id));
        setResults({
          ...current,
          items: [...current.items, ...fresh],
          hasMore: page.length === PAGE_SIZE && fresh.length > 0,
        });
        await markDownloaded(fresh, controller.signal);
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => setLoadingMore(false));
  }, [results, cursor.index, items.length, pageSize, loading, loadingMore]);

  const chosenItems = () => {
    const current = items[cursor.index];
    return marked.size > 0 ? items.filter((i) => marked.has(i.id)) : current ? [current] : [];
  };

  const enqueue = (splitChapters = false) => {
    if (!results) return;
    const chosen = chosenItems();
    if (chosen.length === 0) return;
    jukebox.queue.add(
      chosen.map((video) =>
        results.kind === "playlist"
          ? {
              video,
              playlist: results.title,
              index: (video as PlaylistItem).index,
              splitChapters,
              outputDir: outputDir ?? undefined,
            }
          : { video, splitChapters, outputDir: outputDir ?? undefined },
      ),
    );
    onFlash(
      splitChapters
        ? t("flash.chapters", { n: chosen.length })
        : t("flash.queued", { n: chosen.length }),
    );
    setMarked(new Set());
  };

  useInput(
    (input, key) => {
      if (focus === "input") {
        // esc sempre sai do campo (libera os atalhos globais, mesmo sem resultados).
        if (key.escape || (key.downArrow && items.length > 0)) setFocus("list");
        return;
      }
      if (key.upArrow && cursor.index === 0) return setFocus("input");
      if (cursor.handleKey(key, input)) return;
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
      if (input === "p" && current) return void jukebox.player.toggle(current);
      if (input === "c") return enqueue(true);
      if (input === "f") {
        setFilters((f) => ({ ...f, duration: nextDuration[f.duration] }));
        return cursor.setIndex(0);
      }
      if (input === "v") {
        setFilters((f) => ({ ...f, hideVersions: !f.hideVersions }));
        return cursor.setIndex(0);
      }
      // Qualquer outra letra volta para a busca e começa a digitar.
      if (
        input &&
        !key.ctrl &&
        !key.meta &&
        !key.tab &&
        input.length === 1 &&
        input >= " " &&
        !LIST_SHORTCUTS.test(input)
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
      ? t("search.playlistSummary", {
          title: displayText(results.title),
          n: results.items.length,
        }) + (results.unavailable ? t("search.unavailable", { n: results.unavailable }) : "")
      : t("search.results", { n: results.items.length })
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
        placeholder={t("search.placeholder")}
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
            <Box width={2} flexShrink={0}>
              <Text color={isMarked ? theme.accent : theme.muted}>{isMarked ? "◉" : "○"}</Text>
            </Box>
            {"index" in item && (
              <Box width={4} flexShrink={0}>
                <Text color={theme.muted}>{String(item.index).padStart(3)}</Text>
              </Box>
            )}
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
      {loadingMore && (
        <Text color={theme.notice}>
          {"    "}
          <Spinner /> {t("search.loadingMore")}
        </Text>
      )}
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
            {theme.retro ? `★ ${t("search.hint")} ★` : t("search.hint")}
          </Text>
          <Text color={theme.muted}>{t("search.hintLinks")}</Text>
        </>
      )}
    </StarBackdrop>
  );

  const filterLabels = [
    filters.duration === "short"
      ? t("filter.durationShort")
      : filters.duration === "long"
        ? t("filter.durationLong")
        : null,
    filters.hideVersions ? t("filter.hideVersions") : null,
  ].filter(Boolean);

  const header = (
    <Text color={theme.muted} wrap="truncate-end">
      {summary}
      {filterLabels.length > 0 && <Text color={theme.notice}> · {filterLabels.join(" · ")}</Text>}
      {hidden > 0 && <Text color={theme.muted}> · {t("filter.hidden", { n: hidden })}</Text>}
      {marked.size > 0 && (
        <Text color={theme.accent}>{t("search.marked", { n: marked.size })}</Text>
      )}
    </Text>
  );

  return (
    <Box flexDirection="column" flexGrow={1}>
      {input}
      {theme.retro ? (
        <Panel
          title={results ? t("panel.results") : t("panel.tune")}
          right={results && header}
          flexGrow={1}
        >
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
              ["enter", t("key.search")],
              ["↓", t("key.results")],
              ["tab", t("key.nextTab")],
              ["ctrl+c", t("key.quit")],
            ]}
          />
        ) : (
          <KeyHints
            hints={[
              [
                "enter",
                marked.size > 0 ? t("key.downloadN", { n: marked.size }) : t("key.download"),
              ],
              [t("key.space"), t("key.mark")],
              ["p", t("key.preview")],
              ["c", t("key.chapters")],
              ["f/v", t("key.filters")],
              ["?", t("key.help")],
            ]}
          />
        )}
      </Box>
    </Box>
  );
}
