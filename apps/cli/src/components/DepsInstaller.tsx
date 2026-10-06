import { type InstallProgress, installFfmpeg, installYtDlp } from "@jukeboxdl/core";
import { Box, Text } from "ink";
import { useEffect, useState } from "react";
import { formatBytes } from "../lib/format";
import { t } from "../lib/i18n";
import { ProgressBar } from "./ProgressBar";
import { Spinner } from "./Spinner";

export type DepTask = "yt-dlp" | "ffmpeg";

const RUNNERS: Record<DepTask, (onProgress: (p: InstallProgress) => void) => Promise<unknown>> = {
  "yt-dlp": (onProgress) => installYtDlp({ onProgress }),
  ffmpeg: (onProgress) => installFfmpeg({ onProgress }),
};

type TaskState =
  | { status: "pending" }
  | { status: "running"; progress?: InstallProgress }
  | { status: "done" }
  | { status: "failed"; error: string };

/** Baixa os binários um por vez, mostrando o progresso. */
export function DepsInstaller({
  tasks,
  onDone,
}: {
  tasks: DepTask[];
  onDone: (ok: boolean) => void;
}) {
  const [states, setStates] = useState<Record<string, TaskState>>(() =>
    Object.fromEntries(tasks.map((t) => [t, { status: "pending" }])),
  );

  useEffect(() => {
    let ok = true;
    const set = (task: DepTask, state: TaskState) => setStates((s) => ({ ...s, [task]: state }));
    (async () => {
      for (const task of tasks) {
        set(task, { status: "running" });
        let last = 0;
        try {
          await RUNNERS[task]((progress) => {
            const now = Date.now();
            if (progress.phase === "download" && now - last < 100) return;
            last = now;
            set(task, { status: "running", progress });
          });
          set(task, { status: "done" });
        } catch (error) {
          ok = false;
          set(task, {
            status: "failed",
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      onDone(ok);
    })();
  }, [tasks, onDone]);

  return (
    <Box flexDirection="column">
      {tasks.map((task) => {
        const state = states[task] ?? { status: "pending" };
        return (
          <Box key={task} gap={1}>
            {state.status === "pending" && <Text dimColor>·</Text>}
            {state.status === "running" && <Spinner />}
            {state.status === "done" && <Text color="green">✔</Text>}
            {state.status === "failed" && <Text color="red">✖</Text>}
            <Text>{task.padEnd(7)}</Text>
            {state.status === "running" && state.progress?.phase === "download" && (
              <Text>
                <ProgressBar
                  value={state.progress.total ? state.progress.received / state.progress.total : 0}
                />{" "}
                <Text dimColor>
                  {formatBytes(state.progress.received)}
                  {state.progress.total ? ` / ${formatBytes(state.progress.total)}` : ""}
                </Text>
              </Text>
            )}
            {state.status === "running" && state.progress?.phase === "extract" && (
              <Text dimColor>{t("deps.extracting")}</Text>
            )}
            {state.status === "running" && !state.progress && (
              <Text dimColor>{t("deps.verifying")}</Text>
            )}
            {state.status === "done" && <Text dimColor>{t("deps.installed")}</Text>}
            {state.status === "failed" && <Text color="red">{state.error}</Text>}
          </Box>
        );
      })}
    </Box>
  );
}
