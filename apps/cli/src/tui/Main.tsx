import type { Jukebox } from "@jukeboxdl/core";
import { Box, Text, useInput, useWindowSize } from "ink";
import { useEffect, useMemo, useRef, useState } from "react";
import { JobSummary, summarize } from "../components/JobRow";
import { ProgressBar } from "../components/ProgressBar";
import { useQueueJobs } from "../lib/use-queue";
import { ConfigScreen } from "./ConfigScreen";
import { DownloadsScreen } from "./DownloadsScreen";
import { HistoryScreen } from "./HistoryScreen";
import { SearchScreen } from "./SearchScreen";
import { SELECTION_BG } from "./theme";

const TABS = ["Buscar", "Downloads", "Histórico", "Config"] as const;
type Tab = (typeof TABS)[number];

// Cabeçalho (1) + separador (1) + rodapé (2).
const CHROME_ROWS = 4;

export function Main({ jukebox, onQuit }: { jukebox: Jukebox; onQuit: () => void }) {
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
        showFlash("Há downloads em andamento. ctrl+c de novo para cancelar e sair.");
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
      <Box>
        <Text backgroundColor="cyan" color="black" bold>
          {" ♪ jukeboxdl "}
        </Text>
        <Text> </Text>
        {TABS.map((name, i) => {
          const selected = name === tab;
          const badge =
            name === "Downloads" && summary.active + summary.queued > 0
              ? ` ${summary.active + summary.queued}`
              : "";
          return (
            <Text key={name}>
              <Text> </Text>
              {selected ? (
                <Text backgroundColor={SELECTION_BG} color="cyan" bold>
                  {` ${i + 1} ${name}${badge} `}
                </Text>
              ) : (
                <Text>
                  <Text dimColor>{` ${i + 1} `}</Text>
                  {name}
                  <Text color="cyan">{badge} </Text>
                </Text>
              )}
            </Text>
          );
        })}
      </Box>
      <Text dimColor>{"─".repeat(Math.max(0, columns))}</Text>

      <Box flexDirection="column" height={height} overflow="hidden">
        {/* As telas ficam montadas para preservar o estado ao trocar de aba. */}
        <Box display={tab === "Buscar" ? "flex" : "none"} flexDirection="column" flexGrow={1}>
          <SearchScreen
            jukebox={jukebox}
            active={tab === "Buscar"}
            height={height - 4}
            onFlash={showFlash}
            onCaptureChange={captureSetters.Buscar}
          />
        </Box>
        <Box display={tab === "Downloads" ? "flex" : "none"} flexDirection="column" flexGrow={1}>
          <DownloadsScreen
            jukebox={jukebox}
            jobs={jobs}
            active={tab === "Downloads"}
            height={height - 2}
          />
        </Box>
        <Box display={tab === "Histórico" ? "flex" : "none"} flexDirection="column" flexGrow={1}>
          <HistoryScreen
            jukebox={jukebox}
            active={tab === "Histórico"}
            height={height - 2}
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
          />
        </Box>
      </Box>

      <Text dimColor>{"─".repeat(Math.max(0, columns))}</Text>
      <Box>
        {flash ? (
          <Text color={confirmQuit ? "yellow" : "green"}>{flash}</Text>
        ) : (
          <Box gap={2}>
            {busy && <ProgressBar value={overall} width={20} />}
            <JobSummary jobs={jobs} />
          </Box>
        )}
      </Box>
    </Box>
  );
}
