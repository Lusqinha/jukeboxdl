import { Box, Text } from "ink";
import { useEffect, useState } from "react";
import { t } from "../lib/i18n";

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

  /** Setas, page up/down, home/end e os equivalentes do vim: j/k, g/G, ctrl+d/ctrl+u. */
  const handleKey = (key: NavKey & { ctrl?: boolean }, input = ""): boolean => {
    if (length === 0) return false;
    const last = length - 1;
    const half = Math.max(1, Math.floor(pageSize / 2));
    if (key.upArrow || (input === "k" && !key.ctrl)) setIndex((i) => (i === 0 ? last : i - 1));
    else if (key.downArrow || (input === "j" && !key.ctrl))
      setIndex((i) => (i === last ? 0 : i + 1));
    else if (key.pageUp) setIndex((i) => Math.max(0, i - pageSize));
    else if (key.pageDown) setIndex((i) => Math.min(last, i + pageSize));
    else if (key.ctrl && input === "u") setIndex((i) => Math.max(0, i - half));
    else if (key.ctrl && input === "d") setIndex((i) => Math.min(last, i + half));
    else if (key.home || input === "g") setIndex(0);
    else if (key.end || input === "G") setIndex(last);
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
  // Lista que cabe inteira na tela não precisa de indicadores (nem da linha reservada).
  if (length <= pageSize) return null;
  const count = position === "above" ? start : Math.max(0, length - start - pageSize);
  return (
    <Box height={1} paddingLeft={4}>
      {count > 0 && (
        <Text dimColor>
          {position === "above" ? "▲" : "▼"}{" "}
          {t(position === "above" ? "scroll.above" : "scroll.below", { n: count })}
        </Text>
      )}
    </Box>
  );
}
