import { Text } from "ink";
import { useTheme } from "./theme";

/** Linha de atalhos: [["enter", "baixar"], ["espaço", "marcar"]]. */
export function KeyHints({ hints }: { hints: Array<[string, string]> }) {
  const theme = useTheme();
  return (
    <Text wrap="truncate-end">
      {hints.map(([key, label], i) => (
        <Text key={key}>
          {i > 0 && <Text color={theme.muted}> · </Text>}
          {theme.retro ? (
            <Text color={theme.link}>[{key}]</Text>
          ) : (
            <Text color={theme.link}>{key}</Text>
          )}{" "}
          <Text color={theme.muted}>{label}</Text>
        </Text>
      ))}
    </Text>
  );
}
