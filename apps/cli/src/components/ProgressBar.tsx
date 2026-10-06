import { Text } from "ink";

export function ProgressBar({
  value,
  width = 20,
  color = "cyan",
}: {
  value: number;
  width?: number;
  color?: string;
}) {
  const filled = Math.round(Math.min(Math.max(value, 0), 1) * width);
  return (
    <Text>
      <Text color={color}>{"█".repeat(filled)}</Text>
      <Text dimColor>{"░".repeat(width - filled)}</Text>
    </Text>
  );
}
