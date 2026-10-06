import { Box, Text } from "ink";
import { useEffect, useState } from "react";

/** Início da janela visível para manter `index` na tela. */
export function windowStart(index: number, length: number, size: number): number {
  if (length <= size) return 0;
  return Math.min(Math.max(index - Math.floor(size / 2), 0), length - size);
}

interface NavKey {
  upArrow: boolean;
  downArrow: boolean;
  pageUp: boolean;
  pageDown: boolean;
  home: boolean;
  end: boolean;
}

/** Cursor de lista: setas dão a volta nas pontas, page up/down pulam uma página. */
export function useCursor(length: number, pageSize: number) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex((i) => Math.min(i, Math.max(0, length - 1)));
  }, [length]);

  const handleKey = (key: NavKey): boolean => {
    if (length === 0) return false;
    const last = length - 1;
    if (key.upArrow) setIndex((i) => (i === 0 ? last : i - 1));
    else if (key.downArrow) setIndex((i) => (i === last ? 0 : i + 1));
    else if (key.pageUp) setIndex((i) => Math.max(0, i - pageSize));
    else if (key.pageDown) setIndex((i) => Math.min(last, i + pageSize));
    else if (key.home) setIndex(0);
    else if (key.end) setIndex(last);
    else return false;
    return true;
  };

  return { index, setIndex, handleKey, start: windowStart(index, length, pageSize) };
}

/** Linha discreta indicando itens fora da tela. */
export function ScrollHint({
  start,
  pageSize,
  length,
  position,
}: {
  start: number;
  pageSize: number;
  length: number;
  position: "above" | "below";
}) {
  const count = position === "above" ? start : Math.max(0, length - start - pageSize);
  return (
    <Box height={1} paddingLeft={4}>
      {count > 0 && (
        <Text dimColor>
          {position === "above" ? "▲" : "▼"} {count} {position === "above" ? "acima" : "abaixo"}
        </Text>
      )}
    </Box>
  );
}
