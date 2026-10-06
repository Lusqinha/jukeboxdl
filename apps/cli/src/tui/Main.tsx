import {
  type Config,
  detectLocale,
  getLocale,
  type Jukebox,
  setLocale,
  type ThemeName,
} from "@jukeboxdl/core";
import { Box, Text, useInput, useWindowSize } from "ink";
import { useEffect, useMemo, useRef, useState } from "react";
import { GradientRule } from "../components/GradientRule";
import { JobSummary, summarize } from "../components/JobRow";
import { ProgressBar } from "../components/ProgressBar";
import { t } from "../lib/i18n";
import { useQueueJobs } from "../lib/use-queue";
import { ConfigScreen } from "./ConfigScreen";
import { DownloadsScreen } from "./DownloadsScreen";
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

function Header({ tab, pending }: { tab: Tab; pending: number }) {
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
    </Box>
  );
}

function Screens({
  jukebox,
  onQuit,
  onConfigSaved,
}: {
  jukebox: Jukebox;
  onQuit: () => void;
  onConfigSaved: (config: Config) => void;
}) {
  const theme = useTheme();
  const { columns, rows } = useWindowSize();
  const [tab, setTab] = useState<Tab>("Buscar");
  // Quais telas estão com um campo de texto focado (aí números e esc vão para o campo).
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
  const flashTimer = useRef<NodeJS.Timeout | undefined>(undefined);
  const jobs = useQueueJobs(jukebox.queue);
  const summary = summarize(jobs);
  const busy = summary.active + summary.queued > 0;

  const showFlash = (message: string) => {
    setFlash(message);
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 3000);
  };
  useEffect(() => () => clearTimeout(flashTimer.current), []);

  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      if (busy && !confirmQuit) {
        setConfirmQuit(true);
        showFlash(t("flash.confirmQuit"));
        return;
      }
      onQuit();
      return;
    }
    if (confirmQuit) setConfirmQuit(false);
    if (key.tab && !(tab === "Config" && capture)) {
      const step = key.shift ? -1 : 1;
      setTab((t) => TABS[(TABS.indexOf(t) + step + TABS.length) % TABS.length] as Tab);
      return;
    }
    if (capture) return;
    const number = Number(input);
    if (number >= 1 && number <= TABS.length) setTab(TABS[number - 1] as Tab);
    else if (key.escape && tab !== "Buscar") setTab("Buscar");
  });

  const height = Math.max(8, rows - CHROME_ROWS);
  const running = jobs.filter((j) => ["downloading", "converting", "tagging"].includes(j.status));
  const overall =
    running.length + summary.queued > 0
      ? (summary.done +
          summary.skipped +
          summary.failed +
          running.reduce((sum, j) => sum + j.progress, 0)) /
        (summary.total - summary.canceled || 1)
      : 0;

  return (
    <Box flexDirection="column" width={columns} height={rows}>
      <Header tab={tab} pending={summary.active + summary.queued} />
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
            active={tab === "Buscar"}
            height={height}
            onFlash={showFlash}
            onCaptureChange={captureSetters.Buscar}
          />
        </Box>
        <Box display={tab === "Downloads" ? "flex" : "none"} flexDirection="column" flexGrow={1}>
          <DownloadsScreen
            jukebox={jukebox}
            jobs={jobs}
            active={tab === "Downloads"}
            height={height}
          />
        </Box>
        <Box display={tab === "Histórico" ? "flex" : "none"} flexDirection="column" flexGrow={1}>
          <HistoryScreen
            jukebox={jukebox}
            active={tab === "Histórico"}
            height={height}
            refreshKey={summary.done}
            onCaptureChange={captureSetters.Histórico}
          />
        </Box>
        <Box display={tab === "Config" ? "flex" : "none"} flexDirection="column" flexGrow={1}>
          <ConfigScreen
            jukebox={jukebox}
            active={tab === "Config"}
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
          <Text color={confirmQuit ? theme.warning : theme.success}>{flash}</Text>
        ) : (
          <Box gap={2}>
            {busy && <ProgressBar value={overall} width={20} />}
            <JobSummary jobs={jobs} />
          </Box>
        )}
      </Box>

      {tab !== "Downloads" && columns >= 90 && <TapeDeck jobs={jobs} bottom={5} />}
    </Box>
  );
}

export function Main({ jukebox, onQuit }: { jukebox: Jukebox; onQuit: () => void }) {
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
      <Screens jukebox={jukebox} onQuit={onQuit} onConfigSaved={onConfigSaved} />
    </ThemeProvider>
  );
}
