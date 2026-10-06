import { BINARY_NAMES, type BinaryReport, type BinarySource } from "@jukeboxdl/core";
import { Box, Text } from "ink";

const SOURCE_LABEL: Record<BinarySource, string> = {
  config: "config",
  managed: "gerenciado",
  system: "sistema",
};

export interface DoctorProps {
  configFile: string;
  configError: string | null;
  binDir: string;
  binaries: BinaryReport;
}

export function Doctor({ configFile, configError, binDir, binaries }: DoctorProps) {
  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold>Configuração</Text>
      <Box paddingLeft={2} flexDirection="column">
        <Text>
          <Text color={configError ? "red" : "green"}>{configError ? "✖" : "✔"}</Text>{" "}
          <Text dimColor>{configFile}</Text>
        </Text>
        {configError && <Text color="red">{configError}</Text>}
      </Box>

      <Box marginTop={1}>
        <Text bold>Dependências</Text>
        <Text dimColor> (binários gerenciados em {binDir})</Text>
      </Box>
      <Box paddingLeft={2} flexDirection="column">
        {BINARY_NAMES.map((name) => {
          const entry = binaries[name];
          if (entry instanceof Error) {
            return (
              <Text key={name}>
                <Text color="red">✖ {name.padEnd(8)}</Text> {entry.message}
              </Text>
            );
          }
          if (!entry) {
            return (
              <Text key={name}>
                <Text color="red">✖ {name.padEnd(8)}</Text> <Text dimColor>não encontrado</Text>
              </Text>
            );
          }
          return (
            <Text key={name}>
              <Text color="green">✔ {name.padEnd(8)}</Text> {entry.version ?? "versão desconhecida"}{" "}
              <Text dimColor>
                [{SOURCE_LABEL[entry.source]}] {entry.path}
              </Text>
            </Text>
          );
        })}
      </Box>
    </Box>
  );
}
