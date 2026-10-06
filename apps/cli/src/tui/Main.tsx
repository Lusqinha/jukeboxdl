import {
  type Config,
  checkYtDlpUpdate,
  detectLocale,
  getLocale,
  installYtDlp,
  type Jukebox,
  notify,
  type PlayerState,
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
import { useQueueJobs } from "../lib/use-queue";
import { ConfigScreen } from "./ConfigScreen";
import { DestinationPicker } from "./DestinationPicker";
import { DownloadsScreen } from "./DownloadsScreen";
import { HelpOverlay } from "./HelpOverlay";
import { HistoryScreen } from "./HistoryScreen";
import { SearchScreen } from "./SearchScreen";
import { TapeDeck } from "./TapeDeck";
import { ThemeProvider, useTheme } from "./theme";

const TABS = ["Buscar", "Downloads", "Histórico", "Config"] as const;
type Tab = (typeof TABS)[number];

const TAB_LABEL = {
  Buscar: "tab.search",
  Downloads: "tab.downloads",
  Histórico: "tab.history",
  Config: "tab.config",
} as const satisfies Record<Tab, Parameters<typeof t>[0]>;

const tabLabel = (tab: Tab) => t(TAB_LABEL[tab]);
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

// Cabeçalho (1) + divisor (1) + separador do rodapé (1) + rodapé (1).
const CHROME_ROWS = 4;

function Header({
  tab,
  pending,
  destination,
}: {
  tab: Tab;
  pending: number;
  destination: string | null;
}) {
  const theme = useTheme();
  return (
    <Box>
      {theme.retro ? (
        <Text color={theme.accent} bold>
          {" ♪ jukeboxdl "}
        </Text>
      ) : (
        <Text backgroundColor="cyan" color="black" bold>
          {" ♪ jukeboxdl "}
        </Text>
      )}
      <Text> </Text>
      {TABS.map((name, i) => {
        const selected = name === tab;
        const badge = name === "Downloads" && pending > 0 ? ` ${pending}` : "";
        if (theme.retro) {
          const label = tabLabel(name);
          return (
            <Text key={name}>
              <Text> </Text>
              <Text color={selected ? theme.accent : theme.link} bold={selected}>
                [ <Text color={theme.muted}>{i + 1}</Text>{" "}
                <Text underline color={selected ? theme.accent : theme.link}>
                  {label}
                </Text>
                {badge && <Text color={theme.notice}>{badge}</Text>} ]
              </Text>
            </Text>
          );
        }
        return (
          <Text key={name}>
            <Text> </Text>
            {selected ? (
              <Text backgroundColor={theme.selectionBg} color="cyan" bold>
                {` ${i + 1} ${capitalize(tabLabel(name))}${badge} `}
              </Text>
            ) : (
              <Text>
                <Text color={theme.muted}>{` ${i + 1} `}</Text>
                {capitalize(tabLabel(name))}
                <Text color="cyan">{badge} </Text>
              </Text>
            )}
          </Text>
        );
      })}
      {destination && (
        <>
          <Spacer />
          <Text color={theme.notice} wrap="truncate-start">
            → {destination}{" "}
          </Text>
        </>
      )}
    </Box>
  );
}

function usePlayerState(player: Jukebox["player"]): PlayerState {
  const [state, setState] = useState<PlayerState>(player.state);
  useEffect(() => {
    player.on("change", setState);
    return () => {
      player.off("change", setState);
    };
  }, [player]);
  return state;
}

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
  const [tab, setTab] = useState<Tab>("Buscar");
  // Quais telas estão com um campo de texto focado (aí números e atalhos vão para o campo).
  const [captures, setCaptures] = useState<Record<Tab, boolean>>({
    Buscar: true,
    Downloads: false,
    Histórico: false,
    Config: false,
  });
  const capture = captures[tab];
  const captureSetters = useMemo(
    () =>
      Object.fromEntries(
        TABS.map((screen) => [
          screen,
          (value: boolean) =>
            setCaptures((c) => (c[screen] === value ? c : { ...c, [screen]: value })),
        ]),
      ) as Record<Tab, (value: boolean) => void>,
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
    checkYtDlpUpdate({ binaries: jukebox.config.binaries })
      .then((status) => setUpdate(status?.outdated ? status : null))
      .catch(() => undefined);
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reage só a mudanças do player
  useEffect(() => {
    if (player.status !== "error") return;
    showFlash(player.unavailable ? t("flash.previewUnavailable") : player.message);
  }, [player]);

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
    // Escolhido na aba Downloads, o destino vale também para o que ainda está na fila.
    if (tab === "Downloads") {
      const moved = jukebox.queue.updateQueued((request) => ({
        ...request,
        outputDir: path ?? undefined,
      }));
      if (moved > 0) showFlash(t("dest.moved", { n: moved }));
    }
  };

  useInput((input, key) => {
    if (pickingDestination) return;
    if (showHelp) {
      if (key.escape || input === "?" || input === "q") setShowHelp(false);
      return;
    }
    if (key.ctrl && input === "c") return requestQuit();
    if (confirmQuit && input !== "q") setConfirmQuit(false);
    if (key.tab && !(tab === "Config" && capture)) {
      const step = key.shift ? -1 : 1;
      setTab((current) => TABS[(TABS.indexOf(current) + step + TABS.length) % TABS.length] as Tab);
      return;
    }
    if (capture) return;
    if (input === "?") return setShowHelp(true);
    if (input === "q") return requestQuit();
    if (input === "U") return updateYtDlp();
    if (input === "d" && (tab === "Buscar" || tab === "Downloads"))
      return setPickingDestination(true);
    if (input === "/" && tab !== "Histórico") {
      setTab("Buscar");
      setFocusRequest((n) => n + 1);
      return;
    }
    const number = Number(input);
    if (number >= 1 && number <= TABS.length) setTab(TABS[number - 1] as Tab);
    else if (key.escape && tab !== "Buscar") setTab("Buscar");
  });

  const height = Math.max(8, rows - CHROME_ROWS);
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
  const screenActive = (screen: Tab) => tab === screen && !showHelp && !pickingDestination;

  return (
    <Box flexDirection="column" width={columns} height={rows}>
      <Header tab={tab} pending={summary.active + summary.queued} destination={sessionDir} />
      {theme.retro ? (
        <GradientRule width={columns} />
      ) : (
        <Text color={theme.muted}>{"─".repeat(columns)}</Text>
      )}

      <Box flexDirection="column" height={height} overflow="hidden">
        {/* As telas ficam montadas para preservar o estado ao trocar de aba. */}
        <Box display={tab === "Buscar" ? "flex" : "none"} flexDirection="column" flexGrow={1}>
          <SearchScreen
            jukebox={jukebox}
            active={screenActive("Buscar")}
            height={height}
            onFlash={showFlash}
            onCaptureChange={captureSetters.Buscar}
            focusRequest={focusRequest}
            outputDir={sessionDir}
          />
        </Box>
        <Box display={tab === "Downloads" ? "flex" : "none"} flexDirection="column" flexGrow={1}>
          <DownloadsScreen
            jukebox={jukebox}
            jobs={jobs}
            active={screenActive("Downloads")}
            height={height}
          />
        </Box>
        <Box display={tab === "Histórico" ? "flex" : "none"} flexDirection="column" flexGrow={1}>
          <HistoryScreen
            jukebox={jukebox}
            active={screenActive("Histórico")}
            height={height}
            refreshKey={summary.done}
            onCaptureChange={captureSetters.Histórico}
            onFlash={showFlash}
            outputDir={sessionDir}
          />
        </Box>
        <Box display={tab === "Config" ? "flex" : "none"} flexDirection="column" flexGrow={1}>
          <ConfigScreen
            jukebox={jukebox}
            active={screenActive("Config")}
            onEditingChange={captureSetters.Config}
            onFlash={showFlash}
            onSaved={onConfigSaved}
          />
        </Box>
      </Box>

      <Text color={theme.retro ? theme.bevelDark : theme.muted}>
        {"─".repeat(Math.max(0, columns))}
      </Text>
      <Box>
        {flash ? (
          <Text color={confirmQuit ? theme.warning : theme.success} wrap="truncate-end">
            {flash}
          </Text>
        ) : (
          <Box gap={2} flexGrow={1}>
            {busy && <ProgressBar value={overall} width={20} />}
            <JobSummary jobs={jobs} />
            <Spacer />
            {update && (
              <Text color={theme.notice} wrap="truncate-start">
                {t("update.available", { current: update.current ?? "?", latest: update.latest })} ·{" "}
                {update.managed ? t("update.pressU") : t("update.system")}
              </Text>
            )}
            {!update && (
              <Text color={theme.muted}>
                <Text color={theme.link}>?</Text> {t("key.help")}
              </Text>
            )}
          </Box>
        )}
      </Box>

      {tab !== "Downloads" && columns >= 90 && !showHelp && (
        <TapeDeck jobs={jobs} bottom={5} player={player} />
      )}
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
