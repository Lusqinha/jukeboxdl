import { Text } from "ink";
import { colorRuns, mirroredGradient, useTheme } from "../tui/theme";

/** Linha horizontal em gradiente espelhado (magenta → ciano → magenta). */
export function GradientRule({ width, char = "━" }: { width: number; char?: string }) {
  const theme = useTheme();
  const runs = colorRuns(Math.max(0, width), (i) => ({
    char,
    color: mirroredGradient(theme, i, width),
  }));
  return (
    <Text>
      {runs.map((run) => (
        <Text key={run.start} {...(run.color && { color: run.color })}>
          {run.text}
        </Text>
      ))}
    </Text>
  );
}
