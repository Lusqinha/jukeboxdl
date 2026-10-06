import { expandHome, type Job, type Jukebox } from "@jukeboxdl/core";
import { Box, Text, useInput } from "ink";
import { JobRow } from "../components/JobRow";
import { KeyHints } from "./KeyHints";
import { useCursor } from "./list";

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
  const pageSize = Math.max(3, height - 2);
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

  return (
    <Box flexDirection="column" flexGrow={1}>
      {jobs.length === 0 ? (
        <Box paddingX={2} paddingY={1} flexGrow={1}>
          <Text dimColor>Nenhum download ainda. Busque algo na aba Buscar e tecle enter.</Text>
        </Box>
      ) : (
        <Box flexDirection="column" flexGrow={1}>
          {jobs.slice(cursor.start, cursor.start + pageSize).map((job, i) => (
            <JobRow
              key={job.id}
              job={job}
              selected={cursor.start + i === cursor.index}
              outputDir={outputDir}
            />
          ))}
        </Box>
      )}
      <Box marginTop={1}>
        <KeyHints
          hints={[
            ["x", "cancelar"],
            ["X", "cancelar todos"],
            ["r", "tentar de novo"],
            ["R", "repetir falhas"],
            ["c", "limpar concluídos"],
            ["tab", "próxima aba"],
          ]}
        />
      </Box>
    </Box>
  );
}
