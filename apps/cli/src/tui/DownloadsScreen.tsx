import { expandHome, type Job, type Jukebox } from "@jukeboxdl/core";
import { Box, Text, useInput, useWindowSize } from "ink";
import { JobRow, JobSummary } from "../components/JobRow";
import { Panel, panelChrome } from "../components/Panel";
import { StarBackdrop } from "../components/Starfield";
import { KeyHints } from "./KeyHints";
import { ScrollHint, useCursor } from "./list";
import { useTheme } from "./theme";

export function DownloadsScreen({
  jukebox,
  jobs,
  active,
  height,
}: {
  jukebox: Jukebox;
  jobs: Job[];
  active: boolean;
  height: number;
}) {
  const theme = useTheme();
  const { columns } = useWindowSize();
  // Moldura + indicadores de rolagem (2) + atalhos (2).
  const pageSize = Math.max(3, height - panelChrome(theme, true) - 4);
  const cursor = useCursor(jobs.length, pageSize);
  const selected = jobs[cursor.index];

  useInput(
    (input, key) => {
      if (cursor.handleKey(key)) return;
      const queue = jukebox.queue;
      if (input === "x" && selected) queue.cancel(selected.id);
      else if (input === "X") queue.cancelAll();
      else if (input === "r" && selected) queue.retry(selected.id);
      else if (input === "R") for (const job of jobs) queue.retry(job.id);
      else if (input === "c") queue.clearFinished();
    },
    { isActive: active },
  );

  const outputDir = expandHome(jukebox.config.outputDir);
  const emptyHeight = Math.max(3, height - panelChrome(theme, true) - 2);

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Panel title="fila" right={jobs.length > 0 && <JobSummary jobs={jobs} />} flexGrow={1}>
        {jobs.length === 0 ? (
          <StarBackdrop
            width={Math.max(10, columns - (theme.retro ? 4 : 0))}
            height={emptyHeight}
            contentWidth={60}
            contentHeight={2}
            seed={21}
          >
            <Text color={theme.notice}>
              {theme.retro ? "★ fita vazia ★" : "Nenhum download ainda."}
            </Text>
            <Text color={theme.muted}>busque algo na aba buscar e tecle enter</Text>
          </StarBackdrop>
        ) : (
          <Box flexDirection="column" flexGrow={1}>
            <ScrollHint
              start={cursor.start}
              pageSize={pageSize}
              length={jobs.length}
              position="above"
            />
            {jobs.slice(cursor.start, cursor.start + pageSize).map((job, i) => {
              const isSelected = cursor.start + i === cursor.index;
              return (
                <Box key={job.id} {...(isSelected && { backgroundColor: theme.selectionBg })}>
                  <JobRow job={job} selected={isSelected} outputDir={outputDir} />
                </Box>
              );
            })}
            <ScrollHint
              start={cursor.start}
              pageSize={pageSize}
              length={jobs.length}
              position="below"
            />
          </Box>
        )}
      </Panel>
      <Box marginTop={1}>
        <KeyHints
          hints={[
            ["x", "cancelar"],
            ["X", "cancelar todos"],
            ["r", "tentar de novo"],
            ["R", "repetir falhas"],
            ["c", "limpar concluídos"],
            ["1-4", "abas"],
          ]}
        />
      </Box>
    </Box>
  );
}
