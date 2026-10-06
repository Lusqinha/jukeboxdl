import {
  type BinaryReport,
  ConfigError,
  detectBinaries,
  Jukebox,
  loadConfig,
  type ThemeName,
} from "@jukeboxdl/core";
import { Box, Text, useApp, useInput } from "ink";
import { useCallback, useEffect, useState } from "react";
import type { DepTask } from "../components/DepsInstaller";
import { missingDeps } from "../lib/deps";
import { BootScreen } from "./BootScreen";
import { Main } from "./Main";
import { SetupScreen } from "./SetupScreen";
import { ThemeProvider } from "./theme";

type State =
  | { phase: "loading" }
  | { phase: "setup"; report: BinaryReport; tasks: DepTask[] }
  | { phase: "ready"; jukebox: Jukebox }
  | { phase: "error"; message: string };

/** Tempo mínimo da tela de boot, para a animação não piscar e sumir. */
const MIN_BOOT_MS = 1600;

export function App() {
  const { exit } = useApp();
  const [state, setState] = useState<State>({ phase: "loading" });
  const [boot, setBoot] = useState({ progress: 0, status: "Iniciando…" });
  const [booting, setBooting] = useState(true);
  const [themeName, setThemeName] = useState<ThemeName>("neon");

  const load = useCallback(async () => {
    setState({ phase: "loading" });
    const step = (progress: number, status: string) => setBoot({ progress, status });
    try {
      step(0.15, "Lendo configuração…");
      const config = await loadConfig();
      setThemeName(config.theme);
      step(0.45, "Verificando yt-dlp e ffmpeg…");
      const report = await detectBinaries({ binaries: config.binaries });
      const tasks = missingDeps(report);
      if (tasks.length > 0) {
        step(1, "Faltam dependências");
        setState({ phase: "setup", report, tasks });
        return;
      }
      step(0.8, "Abrindo histórico…");
      const jukebox = await Jukebox.create({ config });
      step(1, "Pronto");
      setState({ phase: "ready", jukebox });
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
    const timer = setTimeout(() => setBooting(false), MIN_BOOT_MS);
    return () => clearTimeout(timer);
  }, [load]);

  const quit = useCallback(async () => {
    if (state.phase === "ready") await state.jukebox.close();
    exit();
  }, [state, exit]);

  const showBoot = booting || state.phase === "loading";

  useInput(
    (input, key) => {
      if (key.ctrl && input === "c") return exit();
      if (state.phase === "error") {
        if (input === "q" || key.escape || key.return) exit();
        return;
      }
      // Qualquer tecla pula a animação assim que o carregamento terminar.
      if (state.phase !== "loading") setBooting(false);
    },
    { isActive: showBoot || state.phase === "error" },
  );

  return <ThemeProvider name={themeName}>{renderPhase()}</ThemeProvider>;

  function renderPhase() {
    if (showBoot) return <BootScreen progress={boot.progress} status={boot.status} />;
    switch (state.phase) {
      case "error":
        return (
          <Box padding={1} flexDirection="column" gap={1}>
            <Text color="red">✖ {state.message}</Text>
            <Text dimColor>Corrija o problema e abra de novo. (q para sair)</Text>
          </Box>
        );
      case "setup":
        return (
          <SetupScreen report={state.report} tasks={state.tasks} onReady={load} onQuit={exit} />
        );
      case "ready":
        return <Main jukebox={state.jukebox} onQuit={quit} />;
      default:
        return null;
    }
  }
}
