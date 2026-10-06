import { useEffect, useState } from "react";

/** Início da janela visível para manter `index` na tela. */
export function windowStart(index: number, length: number, size: number): number {
  if (length <= size) return 0;
  return Math.min(Math.max(index - Math.floor(size / 2), 0), length - size);
}

/** Cursor de lista com teclas de navegação já tratadas. */
export function useCursor(length: number, pageSize: number) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex((i) => Math.min(i, Math.max(0, length - 1)));
  }, [length]);

  const handleKey = (key: {
    upArrow: boolean;
    downArrow: boolean;
    pageUp: boolean;
    pageDown: boolean;
    home: boolean;
    end: boolean;
  }): boolean => {
    const last = Math.max(0, length - 1);
    if (key.upArrow) setIndex((i) => Math.max(0, i - 1));
    else if (key.downArrow) setIndex((i) => Math.min(last, i + 1));
    else if (key.pageUp) setIndex((i) => Math.max(0, i - pageSize));
    else if (key.pageDown) setIndex((i) => Math.min(last, i + pageSize));
    else if (key.home) setIndex(0);
    else if (key.end) setIndex(last);
    else return false;
    return true;
  };

  return { index, setIndex, handleKey, start: windowStart(index, length, pageSize) };
}
