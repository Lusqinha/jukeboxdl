import {
  type BinaryReport,
  ConfigError,
  detectBinaries,
  Jukebox,
  loadConfig,
} from "@jukeboxdl/core";
import { Box, Text, useApp, useInput } from "ink";
import { useCallback, useEffect, useState } from "react";
import type { DepTask } from "../components/DepsInstaller";
import { Spinner } from "../components/Spinner";
import { missingDeps } from "../lib/deps";
import { Main } from "./Main";
import { SetupScreen } from "./SetupScreen";

type State =
  | { phase: "loading" }
  | { phase: "setup"; report: BinaryReport; tasks: DepTask[] }
  | { phase: "ready"; jukebox: Jukebox }
  | { phase: "error"; message: string };

export function App() {
  const { exit } = useApp();
  const [state, setState] = useState<State>({ phase: "loading" });

  const load = useCallback(async () => {
    setState({ phase: "loading" });
    try {
      const config = await loadConfig();
      const report = await detectBinaries({ binaries: config.binaries });
      const tasks = missingDeps(report);
      if (tasks.length > 0) {
        setState({ phase: "setup", report, tasks });
        return;
      }
      setState({ phase: "ready", jukebox: await Jukebox.create({ config }) });
    } catch (error) {
      const message =
        error instanceof ConfigError
          ? error.message
          : error instanceof Error
            ? error.message
            : String(error);
      setState({ phase: "error", message });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const quit = useCallback(async () => {
    if (state.phase === "ready") await state.jukebox.close();
    exit();
  }, [state, exit]);

  useInput(
    (input, key) => {
      if ((key.ctrl && input === "c") || input === "q" || key.escape) exit();
    },
    { isActive: state.phase === "error" || state.phase === "loading" },
  );

  switch (state.phase) {
    case "loading":
      return (
        <Box padding={1}>
          <Text>
            <Spinner /> Carregando…
          </Text>
        </Box>
      );
    case "error":
      return (
        <Box padding={1} flexDirection="column" gap={1}>
          <Text color="red">✖ {state.message}</Text>
          <Text dimColor>Corrija o problema e abra de novo. (q para sair)</Text>
        </Box>
      );
    case "setup":
      return <SetupScreen report={state.report} tasks={state.tasks} onReady={load} onQuit={exit} />;
    case "ready":
      return <Main jukebox={state.jukebox} onQuit={quit} />;
  }
}
