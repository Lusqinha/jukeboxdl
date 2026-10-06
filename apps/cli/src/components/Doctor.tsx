import { BINARY_NAMES, type BinaryReport } from "@jukeboxdl/core";
import { Box, Text } from "ink";
import { t } from "../lib/i18n";

export interface DoctorProps {
  configFile: string;
  configError: string | null;
  binDir: string;
  binaries: BinaryReport;
}

export function Doctor({ configFile, configError, binDir, binaries }: DoctorProps) {
  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold>{t("doctor.config")}</Text>
      <Box paddingLeft={2} flexDirection="column">
        <Text>
          <Text color={configError ? "red" : "green"}>{configError ? "✖" : "✔"}</Text>{" "}
          <Text dimColor>{configFile}</Text>
        </Text>
        {configError && <Text color="red">{configError}</Text>}
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text bold>{t("doctor.deps")}</Text>
        <Text dimColor> {t("doctor.managedIn", { path: binDir })}</Text>
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
                <Text color="red">✖ {name.padEnd(8)}</Text>{" "}
                <Text dimColor>{t("doctor.notFound")}</Text>
              </Text>
            );
          }
          return (
            <Text key={name}>
              <Text color="green">✔ {name.padEnd(8)}</Text>{" "}
              {entry.version ?? t("doctor.unknownVersion")}{" "}
              <Text dimColor>
                [{t(`source.${entry.source}`)}] {entry.path}
              </Text>
            </Text>
          );
        })}
      </Box>
    </Box>
  );
}
