import { Text } from "ink";
import { colorRuns, gradientAt, useTheme } from "../tui/theme";

/** Barra de progresso: segmentos LED em gradiente no tema retrô, blocos no clássico. */
export function ProgressBar({ value, width = 20 }: { value: number; width?: number }) {
  const theme = useTheme();
  const filled = Math.round(Math.min(Math.max(value, 0), 1) * width);
  const runs = colorRuns(width, (i) =>
    i < filled
      ? {
          char: theme.barFilled,
          color: theme.retro
            ? gradientAt(theme, (i / width) * theme.gradient.length)
            : theme.accent,
        }
      : { char: theme.barEmpty, color: theme.muted },
  );
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
