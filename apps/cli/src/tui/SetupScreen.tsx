import { type BinaryReport, getAppPaths } from "@jukeboxdl/core";
import { Box, Text, useInput } from "ink";
import { useCallback, useState } from "react";
import { DepsInstaller, type DepTask } from "../components/DepsInstaller";
import { Doctor } from "../components/Doctor";
import { KeyHints } from "./KeyHints";

export function SetupScreen({
  report,
  tasks,
  onReady,
  onQuit,
}: {
  report: BinaryReport;
  tasks: DepTask[];
  onReady: () => void;
  onQuit: () => void;
}) {
  const [phase, setPhase] = useState<"ask" | "installing" | "failed">("ask");
  const paths = getAppPaths();

  useInput((input, key) => {
    if (phase === "installing") return;
    if (key.return) setPhase("installing");
    else if (input === "q" || key.escape) onQuit();
  });

  const onDone = useCallback(
    (ok: boolean) => {
      if (ok) onReady();
      else setPhase("failed");
    },
    [onReady],
  );

  return (
    <Box flexDirection="column" padding={1} gap={1}>
      <Text bold color="cyan">
        ♪ jukeboxdl · configuração inicial
      </Text>
      <Doctor
        configFile={paths.configFile}
        configError={null}
        binDir={paths.bin}
        binaries={report}
      />
      {phase === "ask" && (
        <Box flexDirection="column">
          <Text>
            Faltam dependências: <Text bold>{tasks.join(", ")}</Text>. Posso baixar os builds
            oficiais (com checksum verificado) para <Text dimColor>{paths.bin}</Text>.
          </Text>
          <Box marginTop={1}>
            <KeyHints
              hints={[
                ["enter", "baixar agora"],
                ["q", "sair"],
              ]}
            />
          </Box>
        </Box>
      )}
      {phase !== "ask" && <DepsInstaller tasks={tasks} onDone={onDone} />}
      {phase === "failed" && (
        <Box flexDirection="column">
          <Text color="red">
            Não foi possível instalar tudo. Instale manualmente ou configure os caminhos em
            config.json.
          </Text>
          <KeyHints
            hints={[
              ["enter", "tentar de novo"],
              ["q", "sair"],
            ]}
          />
        </Box>
      )}
    </Box>
  );
}
