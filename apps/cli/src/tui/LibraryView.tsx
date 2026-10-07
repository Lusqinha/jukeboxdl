import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  expandHome,
  groupTracks,
  type Jukebox,
  type LibraryTrack,
  openPath,
  type PlayableTrack,
  type TrackGroup,
} from "@jukeboxdl/core";
import { Box, Text, useInput, useWindowSize } from "ink";
import { useEffect, useMemo, useRef, useState } from "react";
import { historyToCsv } from "../commands/history";
import { Panel, panelChrome } from "../components/Panel";
import { StarBackdrop } from "../components/Starfield";
import { TextInput } from "../components/TextInput";
import { displayText, formatDuration } from "../lib/format";
import { t } from "../lib/i18n";
import { KeyHints } from "./KeyHints";
import { ScrollHint, useCursor } from "./list";
import { Pointer } from "./Pointer";
import { useTheme } from "./theme";

export type LibraryMode = "tracks" | "albums" | "artists" | "folders";

const GROUP_BY = { albums: "album", artists: "artist", folders: "folder" } as const;
const TITLE: Record<LibraryMode, Parameters<typeof t>[0]> = {
  tracks: "nav.library",
  albums: "nav.albums",
  artists: "nav.artists",
  folders: "nav.folders",
};

const toPlayable = (track: LibraryTrack): PlayableTrack => ({
  id: track.path,
  title: track.title,
  artist: track.artist,
  album: track.album,
  path: track.path,
  duration: track.duration,
});

function matches(track: LibraryTrack, filter: string): boolean {
  if (!filter) return true;
  const needle = filter.toLocaleLowerCase();
  return [track.title, track.artist, track.album].some((field) =>
    field?.toLocaleLowerCase().includes(needle),
  );
}

export function LibraryView({
  jukebox,
  mode,
  tracks,
  scanning,
  playingId,
  active,
  height,
  outputDir,
  onFlash,
  onCaptureChange,
  onBack,
}: {
  jukebox: Jukebox;
  mode: LibraryMode;
  tracks: LibraryTrack[];
  scanning: string | null;
  playingId: string | undefined;
  active: boolean;
  height: number;
  outputDir: string | null;
  onFlash: (message: string) => void;
  onCaptureChange: (capturing: boolean) => void;
  /** Chamado com esc/← quando não há mais nada para voltar (o foco vai para a barra lateral). */
  onBack: () => void;
}) {
  const theme = useTheme();
  const { columns } = useWindowSize();
  const [filter, setFilter] = useState("");
  const [filtering, setFiltering] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const updating = useRef(false);

  const filtered = useMemo(
    () => tracks.filter((track) => matches(track, filter)),
    [tracks, filter],
  );
  const groups: TrackGroup[] = useMemo(
    () => (mode === "tracks" ? [] : groupTracks(filtered, GROUP_BY[mode])),
    [filtered, mode],
  );
  const group = openGroup ? groups.find((g) => g.key === openGroup) : undefined;
  const showingGroups = mode !== "tracks" && !group;
  const list: LibraryTrack[] = mode === "tracks" ? filtered : (group?.tracks ?? []);
  const length = showingGroups ? groups.length : list.length;

  // Moldura + filtro (1) + indicadores (2) + atalhos (2).
  const pageSize = Math.max(3, height - panelChrome(theme, true) - 5);
  const cursor = useCursor(length, pageSize);
  const groupCursor = useRef(0);

  useEffect(() => {
    onCaptureChange(filtering);
  }, [filtering, onCaptureChange]);

  const updateCovers = async (targets: LibraryTrack[]) => {
    if (updating.current || targets.length === 0) return;
    updating.current = true;
    let updated = 0;
    let missing = 0;
    try {
      for (const [i, track] of targets.entries()) {
        if (targets.length > 1)
          onFlash(t("flash.coversProgress", { done: i + 1, total: targets.length }));
        const result = await jukebox
          .updateCover(track.path)
          .catch(() => ({ status: "not-found" as const }));
        if (result.status === "updated") updated++;
        else missing++;
      }
    } finally {
      updating.current = false;
      onFlash(
        targets.length === 1
          ? updated
            ? t("flash.coverUpdated", { source: jukebox.config.cover.source })
            : t("flash.coverNotFound")
          : t("flash.coversDone", { updated, missing }),
      );
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
      const back =
        key.escape || key.leftArrow || key.backspace || key.delete || (input === "h" && !key.ctrl);
      if (back) {
        if (group) {
          setOpenGroup(null);
          cursor.setIndex(groupCursor.current);
        } else if (filter) {
          setFilter("");
        } else {
          onBack();
        }
        return;
      }
      if (input === "/") return setFiltering(true);
      if (input === "R") return void jukebox.scanLibrary(outputDir ? [outputDir] : []);
      if (input === "e") return void exportCsv();

      if (showingGroups) {
        const selected = groups[cursor.index];
        if (selected && (key.return || key.rightArrow || input === "l")) {
          groupCursor.current = cursor.index;
          setOpenGroup(selected.key);
          cursor.setIndex(0);
        }
        return;
      }

      const selected = list[cursor.index];
      if (!selected) return;
      if (key.return) void jukebox.player.playList(list.map(toPlayable), cursor.index);
      else if (input === "o") openPath(dirname(selected.path));
      else if (input === "t") void updateCovers([selected]);
      else if (input === "T") void updateCovers(list);
      else if (input === "r" && selected.youtubeId) {
        jukebox.queue.add([
          {
            video: {
              id: selected.youtubeId,
              title: selected.title,
              url: `https://www.youtube.com/watch?v=${selected.youtubeId}`,
            },
            redownload: true,
            outputDir: outputDir ?? undefined,
          },
        ]);
        onFlash(t("flash.queued", { n: 1 }));
      }
    },
    { isActive: active },
  );

  const wide = columns >= 110;
  const title = group ? `${t(TITLE[mode])} · ${displayText(group.label)}` : t(TITLE[mode]);
  const count =
    scanning ??
    (showingGroups
      ? t("library.groups", { n: groups.length })
      : t("library.tracks", { n: list.length }));

  const empty = tracks.length === 0 && !scanning;

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Panel
        title={title}
        right={<Text color={scanning ? theme.notice : theme.meta}>{count}</Text>}
        flexGrow={1}
      >
        <Box>
          <Text color={theme.accent}>/ </Text>
          <TextInput
            value={filter}
            onChange={setFilter}
            focus={active && filtering}
            placeholder={t("library.filter")}
          />
        </Box>
        {empty ? (
          <StarBackdrop
            width={Math.max(10, columns - 26)}
            height={Math.max(3, height - panelChrome(theme, true) - 4)}
            contentWidth={Math.min(90, columns - 28)}
            contentHeight={2}
            seed={33}
          >
            <Text color={theme.notice}>{t("library.empty")}</Text>
            <Text color={theme.muted}>{t("library.emptyHint")}</Text>
          </StarBackdrop>
        ) : (
          <Box flexDirection="column" flexGrow={1}>
            <ScrollHint start={cursor.start} pageSize={pageSize} length={length} position="above" />
            {showingGroups
              ? groups.slice(cursor.start, cursor.start + pageSize).map((item, i) => {
                  const selected = !filtering && cursor.start + i === cursor.index;
                  const total = item.tracks.reduce((sum, track) => sum + (track.duration ?? 0), 0);
                  return (
                    <Box key={item.key} {...(selected && { backgroundColor: theme.selectionBg })}>
                      <Pointer selected={selected} />
                      <Box flexGrow={1} flexShrink={1}>
                        <Text wrap="truncate-end" bold={selected}>
                          {displayText(item.label)}
                        </Text>
                      </Box>
                      <Box flexShrink={0} marginLeft={2} width={12} justifyContent="flex-end">
                        <Text color={theme.meta}>
                          {t("library.tracks", { n: item.tracks.length })}
                        </Text>
                      </Box>
                      <Box flexShrink={0} width={9} justifyContent="flex-end">
                        <Text color={theme.muted}>{formatDuration(total)}</Text>
                      </Box>
                    </Box>
                  );
                })
              : list.slice(cursor.start, cursor.start + pageSize).map((track, i) => {
                  const selected = !filtering && cursor.start + i === cursor.index;
                  const playing = track.path === playingId;
                  return (
                    <Box key={track.path} {...(selected && { backgroundColor: theme.selectionBg })}>
                      <Pointer selected={selected} />
                      <Box width={2} flexShrink={0}>
                        <Text color={theme.accent}>{playing ? "♪" : " "}</Text>
                      </Box>
                      <Box flexGrow={1} flexShrink={1}>
                        <Text
                          wrap="truncate-end"
                          bold={selected || playing}
                          {...(playing && { color: theme.accent })}
                        >
                          {displayText(track.title)}
                        </Text>
                      </Box>
                      <Box flexShrink={0} marginLeft={2} width={22}>
                        <Text color={theme.meta} wrap="truncate-end">
                          {displayText(track.artist ?? t("library.unknown"))}
                        </Text>
                      </Box>
                      {wide && (
                        <Box flexShrink={0} marginLeft={1} width={22}>
                          <Text color={theme.muted} wrap="truncate-end">
                            {displayText(track.album ?? "")}
                          </Text>
                        </Box>
                      )}
                      <Box flexShrink={0} width={7} justifyContent="flex-end">
                        <Text color={theme.muted}>{formatDuration(track.duration)}</Text>
                      </Box>
                    </Box>
                  );
                })}
            <ScrollHint start={cursor.start} pageSize={pageSize} length={length} position="below" />
          </Box>
        )}
      </Panel>
      <Box marginTop={1}>
        <KeyHints
          hints={
            showingGroups
              ? [
                  ["enter", t("key.open")],
                  ["/", t("key.filter")],
                  ["R", t("key.rescan")],
                  ["esc", t("key.focus")],
                  ["?", t("key.help")],
                ]
              : [
                  ["enter", t("key.play")],
                  ["/", t("key.filter")],
                  ["t/T", t("key.updateCover")],
                  ["o", t("key.openFolder")],
                  ["esc", group ? t("key.back") : t("key.focus")],
                  ["?", t("key.help")],
                ]
          }
        />
      </Box>
    </Box>
  );
}
