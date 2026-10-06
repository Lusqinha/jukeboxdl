import { Box, Text } from "ink";
import { useTheme } from "./theme";

/** Marcador da linha selecionada, com largura fixa para não desalinhar as colunas. */
export function Pointer({ selected }: { selected: boolean }) {
  const theme = useTheme();
  return (
    <Box width={2} flexShrink={0}>
      <Text color={theme.link}>{selected ? "❯" : " "}</Text>
    </Box>
  );
}
