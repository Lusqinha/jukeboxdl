import { Text } from "ink";

/** Linha de atalhos: [["enter", "baixar"], ["espaço", "marcar"]]. */
export function KeyHints({ hints }: { hints: Array<[string, string]> }) {
  return (
    <Text wrap="truncate-end">
      {hints.map(([key, label], i) => (
        <Text key={key}>
          {i > 0 && <Text dimColor> · </Text>}
          <Text color="cyan">{key}</Text> <Text dimColor>{label}</Text>
        </Text>
      ))}
    </Text>
  );
}
