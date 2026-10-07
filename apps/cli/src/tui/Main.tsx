import {
  type Config,
  checkYtDlpUpdate,
  detectLocale,
  getLocale,
  installYtDlp,
  type Jukebox,
  notify,
  rememberDestination,
  setLocale,
  type ThemeName,
  type YtDlpUpdateStatus,
} from "@jukeboxdl/core";
import { Box, Spacer, Text, useInput, useWindowSize } from "ink";
import { useEffect, useMemo, useRef, useState } from "react";
import { GradientRule } from "../components/GradientRule";
import { JobSummary, summarize } from "../components/JobRow";
import { ProgressBar } from "../components/ProgressBar";
import { t } from "../lib/i18n";
import { useLibrary, usePlayerState } from "../lib/use-player";
import { useQueueJobs } from "../lib/use-queue";
import { ConfigScreen } from "./ConfigScreen";
import { DestinationPicker } from "./DestinationPicker";
import { DownloadsScreen } from "./DownloadsScreen";
import { HelpOverlay } from "./HelpOverlay";
import { type LibraryMode, LibraryView } from "./LibraryView";
import { PlayerBar } from "./PlayerBar";
import { SearchScreen } from "./SearchScreen";
import { Sidebar, VIEWS, type View } from "./Sidebar";
import { ThemeProvider, useTheme } from "./theme";

// Separador (1) + barra do player (1) + linha de status (1).
const FOOTER_ROWS = 3;
const LIBRARY_MODES: Partial<Record<View, LibraryMode>> = {
  library: "tracks",
  albums: "albums",
  artists: "artists",
  folders: "folders",
};
/** Depois que downloads terminam, espera um pouco antes de reler a biblioteca. */
const RESCAN_DELAY_MS = 1500;

function Screens({
  jukebox,
  onQuit,
  onConfigSaved,
  restored,
}: {
  jukebox: Jukebox;
  onQuit: () => void;
  onConfigSaved: (config: Config) => void;
  restored: number;
}) {
  const theme = useTheme();
  const { columns, rows } = useWindowSize();
  const [view, setView] = useState<View>("library");
  const [focus, setFocus] = useState<"sidebar" | "content">("content");
  // Telas com campo de texto focado: aí números e atalhos vão para o campo.
  const [captures, setCaptures] = useState<Partial<Record<View, boolean>>>({});
  const capture = Boolean(captures[view]);
  const captureSetters = useMemo(
    () =>
      Object.fromEntries(
        VIEWS.map((screen) => [
          screen,
          (value: boolean) =>
            setCaptures((c) => (Boolean(c[screen]) === value ? c : { ...c, [screen]: value })),
        ]),
      ) as Record<View, (value: boolean) => void>,
    [],
  );
  const [flash, setFlash] = useState<string | null>(null);
  const [confirmQuit, setConfirmQuit] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [focusRequest, setFocusRequest] = useState(0);
  const [update, setUpdate] = useState<YtDlpUpdateStatus | null>(null);
  const [updating, setUpdating] = useState(false);
  // Pasta só desta sessão (ex.: um pendrive); null = pasta da config.
  const [sessionDir, setSessionDir] = useState<string | null>(null);
  const [pickingDestination, setPickingDestination] = useState(false);
  const flashTimer = useRef<NodeJS.Timeout | undefined>(undefined);
  const notified = useRef(new Set<string>());
  const jobs = useQueueJobs(jukebox.queue);
  const player = usePlayerState(jukebox.player);
  const library = useLibrary(jukebox.library);
  const summary = summarize(jobs);
  const busy = summary.active + summary.queued > 0;

  const showFlash = (message: string) => {
    setFlash(message);
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 3500);
  };
  useEffect(() => () => clearTimeout(flashTimer.current), []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: avisos únicos ao abrir
  useEffect(() => {
    if (restored > 0) showFlash(t("flash.restored", { n: restored }));
    void jukebox.scanLibrary();
    checkYtDlpUpdate({ binaries: jukebox.config.binaries })
      .then((status) => setUpdate(status?.outdated ? status : null))
      .catch(() => undefined);
  }, []);

  // Downloads concluídos e troca de destino entram na biblioteca.
  useEffect(() => {
    if (summary.done === 0 && !sessionDir) return;
    const timer = setTimeout(
      () => void jukebox.scanLibrary(sessionDir ? [sessionDir] : []),
      RESCAN_DELAY_MS,
    );
    return () => clearTimeout(timer);
  }, [summary.done, sessionDir, jukebox]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reage só a erros do player
  useEffect(() => {
    if (player.status !== "error") return;
    showFlash(player.unavailable ? t("player.noEngine") : (player.error ?? ""));
  }, [player.status, player.error]);

  // Notificação do sistema quando a fila esvazia, com o que terminou desde a última.
  useEffect(() => {
    if (busy || !jukebox.config.notifications) return;
    const fresh = jobs.filter(
      (job) => (job.status === "done" || job.status === "failed") && !notified.current.has(job.id),
    );
    if (fresh.length === 0) return;
    for (const job of fresh) notified.current.add(job.id);
    const done = fresh.filter((job) => job.status === "done").length;
    const failed = fresh.length - done;
    notify(
      t("notify.doneTitle"),
      t("notify.doneBody", { done, failed: failed ? t("notify.failed", { n: failed }) : "" }),
    );
  }, [busy, jobs, jukebox]);

  const updateYtDlp = () => {
    if (!update?.managed || updating) return;
    setUpdating(true);
    showFlash(t("update.updating"));
    installYtDlp()
      .then(() => {
        showFlash(t("update.done", { version: update.latest }));
        setUpdate(null);
      })
      .catch((error: unknown) => showFlash(t("update.failed", { error: String(error) })))
      .finally(() => setUpdating(false));
  };

  const requestQuit = () => {
    if (busy && !confirmQuit) {
      setConfirmQuit(true);
      showFlash(t("flash.confirmQuit"));
      return;
    }
    onQuit();
  };

  const selectDestination = (path: string | null) => {
    setPickingDestination(false);
    setSessionDir(path);
    if (path) void rememberDestination(path);
    showFlash(path ? t("dest.changed", { path }) : t("dest.reset"));
    // Escolhido na tela de downloads, o destino vale também para o que ainda está na fila.
    if (view === "downloads") {
      const moved = jukebox.queue.updateQueued((request) => ({
        ...request,
        outputDir: path ?? undefined,
      }));
      if (moved > 0) showFlash(t("dest.moved", { n: moved }));
    }
  };

  const goTo = (next: View) => {
    setView(next);
    setFocus("content");
  };

  /** Atalhos do player, válidos em qualquer tela (o espaço marca faixas na busca). */
  const handlePlayerKey = (input: string): boolean => {
    const p = jukebox.player;
    if (input === " " && view !== "search") void p.togglePause();
    else if (input === ">") void p.next();
    else if (input === "<") void p.previous();
    else if (input === "]") p.seek(10);
    else if (input === "[") p.seek(-10);
    else if (input === "+" || input === "=") p.changeVolume(5);
    else if (input === "-") p.changeVolume(-5);
    else if (input === "S") p.toggleShuffle();
    else if (input === "L") p.cycleRepeat();
    else return false;
    return true;
  };

  useInput((input, key) => {
    if (pickingDestination) return;
    if (showHelp) {
      if (key.escape || input === "?" || input === "q") setShowHelp(false);
      return;
    }
    if (key.ctrl && input === "c") return requestQuit();
    if (confirmQuit && input !== "q") setConfirmQuit(false);
    if (key.tab && !(view === "config" && capture)) {
      setFocus((f) => (f === "sidebar" ? "content" : "sidebar"));
      return;
    }
    if (capture && focus === "content") return;

    const number = Number(input);
    if (number >= 1 && number <= VIEWS.length) return goTo(VIEWS[number - 1] as View);
    if (input === "?") return setShowHelp(true);
    if (input === "q") return requestQuit();
    if (input === "U") return updateYtDlp();
    if (handlePlayerKey(input)) return;

    if (focus === "sidebar") {
      const index = VIEWS.indexOf(view);
      if (key.upArrow || input === "k")
        setView(VIEWS[(index - 1 + VIEWS.length) % VIEWS.length] as View);
      else if (key.downArrow || input === "j") setView(VIEWS[(index + 1) % VIEWS.length] as View);
      else if (key.return || key.rightArrow || input === "l") setFocus("content");
      return;
    }

    if (input === "d" && (view === "search" || view === "downloads" || LIBRARY_MODES[view])) {
      return setPickingDestination(true);
    }
    if (input === "/" && (view === "downloads" || view === "config")) {
      goTo("search");
      setFocusRequest((n) => n + 1);
      return;
    }
    if (key.escape && (view === "downloads" || view === "config")) setFocus("sidebar");
  });

  const height = Math.max(8, rows - FOOTER_ROWS);
  const running = jobs.filter((j) =>
    ["downloading", "converting", "tagging", "retrying"].includes(j.status),
  );
  const overall =
    running.length + summary.queued > 0
      ? (summary.done +
          summary.skipped +
          summary.failed +
          running.reduce((sum, j) => sum + j.progress, 0)) /
        (summary.total - summary.canceled || 1)
      : 0;
  const overlay = showHelp || pickingDestination;
  const screenActive = (screen: View) => view === screen && focus === "content" && !overlay;
  const scanning = library.progress
    ? t("library.scanning", { scanned: library.progress.scanned, total: library.progress.total })
    : null;

  return (
    <Box flexDirection="column" width={columns} height={rows}>
      <Box height={height}>
        <Sidebar
          view={view}
          focused={focus === "sidebar"}
          pending={summary.active + summary.queued}
          destination={sessionDir}
          height={height}
        />
        <Box flexDirection="column" flexGrow={1} paddingLeft={1} overflow="hidden">
          {/* As telas ficam montadas para preservar o estado ao trocar de seção. */}
          {(Object.entries(LIBRARY_MODES) as Array<[View, LibraryMode]>).map(([screen, mode]) => (
            <Box
              key={screen}
              display={view === screen ? "flex" : "none"}
              flexDirection="column"
              flexGrow={1}
            >
              <LibraryView
                jukebox={jukebox}
                mode={mode}
                tracks={library.tracks}
                scanning={scanning}
                playingId={player.status === "idle" ? undefined : player.track?.id}
                active={screenActive(screen)}
                height={height}
                outputDir={sessionDir}
                onFlash={showFlash}
                onCaptureChange={captureSetters[screen]}
                onBack={() => setFocus("sidebar")}
              />
            </Box>
          ))}
          <Box display={view === "search" ? "flex" : "none"} flexDirection="column" flexGrow={1}>
            <SearchScreen
              jukebox={jukebox}
              active={screenActive("search")}
              height={height}
              onFlash={showFlash}
              onCaptureChange={captureSetters.search}
              focusRequest={focusRequest}
              outputDir={sessionDir}
            />
          </Box>
          <Box display={view === "downloads" ? "flex" : "none"} flexDirection="column" flexGrow={1}>
            <DownloadsScreen
              jukebox={jukebox}
              jobs={jobs}
              active={screenActive("downloads")}
              height={height}
            />
          </Box>
          <Box display={view === "config" ? "flex" : "none"} flexDirection="column" flexGrow={1}>
            <ConfigScreen
              jukebox={jukebox}
              active={screenActive("config")}
              onEditingChange={captureSetters.config}
              onFlash={showFlash}
              onSaved={onConfigSaved}
            />
          </Box>
        </Box>
      </Box>

      {theme.retro ? (
        <GradientRule width={columns} />
      ) : (
        <Text color={theme.muted}>{"─".repeat(columns)}</Text>
      )}
      <PlayerBar state={player} width={columns} />
      <Box paddingX={1}>
        {flash ? (
          <Text color={confirmQuit ? theme.warning : theme.success} wrap="truncate-end">
            {flash}
          </Text>
        ) : (
          <Box gap={2} flexGrow={1}>
            {busy && <ProgressBar value={overall} width={16} />}
            <JobSummary jobs={jobs} />
            <Spacer />
            {update ? (
              <Text color={theme.notice} wrap="truncate-start">
                {t("update.available", { current: update.current ?? "?", latest: update.latest })} ·{" "}
                {update.managed ? t("update.pressU") : t("update.system")}
              </Text>
            ) : (
              <Text color={theme.muted}>
                <Text color={theme.link}>tab</Text> {t("key.focus")} ·{" "}
                <Text color={theme.link}>?</Text> {t("key.help")}
              </Text>
            )}
          </Box>
        )}
      </Box>

      {showHelp && <HelpOverlay width={columns} />}
      {pickingDestination && (
        <DestinationPicker
          defaultDir={jukebox.config.outputDir}
          current={sessionDir}
          width={columns}
          onSelect={selectDestination}
          onCancel={() => setPickingDestination(false)}
        />
      )}
    </Box>
  );
}

export function Main({
  jukebox,
  onQuit,
  restored = 0,
}: {
  jukebox: Jukebox;
  onQuit: () => void;
  restored?: number;
}) {
  const [themeName, setThemeName] = useState<ThemeName>(jukebox.config.theme);
  // Só serve para re-renderizar com os novos textos; as telas mantêm o estado.
  const [, setLocaleState] = useState(getLocale());
  const onConfigSaved = (config: Config) => {
    setThemeName(config.theme);
    setLocale(config.language ?? detectLocale());
    setLocaleState(getLocale());
  };
  return (
    <ThemeProvider name={themeName}>
      <Screens
        jukebox={jukebox}
        onQuit={onQuit}
        onConfigSaved={onConfigSaved}
        restored={restored}
      />
    </ThemeProvider>
  );
}
