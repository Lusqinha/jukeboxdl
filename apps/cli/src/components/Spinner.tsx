import { Text, useAnimation } from "ink";
import { useTheme } from "../tui/theme";

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export function Spinner({ color }: { color?: string }) {
  const theme = useTheme();
  const { frame } = useAnimation({ interval: 80 });
  return <Text color={color ?? theme.link}>{FRAMES[frame % FRAMES.length]}</Text>;
}
