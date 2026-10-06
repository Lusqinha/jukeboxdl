import { Text, useInput, usePaste } from "ink";
import { useEffect, useState } from "react";

export interface TextInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: (value: string) => void;
  placeholder?: string;
  focus?: boolean;
}

/** Campo de texto de uma linha com cursor, atalhos estilo shell e suporte a colar. */
export function TextInput({
  value,
  onChange,
  onSubmit,
  placeholder = "",
  focus = true,
}: TextInputProps) {
  const [cursor, setCursor] = useState(value.length);

  useEffect(() => {
    setCursor((c) => Math.min(c, value.length));
  }, [value]);

  const insert = (text: string) => {
    onChange(value.slice(0, cursor) + text + value.slice(cursor));
    setCursor(cursor + text.length);
  };

  useInput(
    (input, key) => {
      if (key.return) return onSubmit?.(value);
      if (key.leftArrow) return setCursor(Math.max(0, cursor - 1));
      if (key.rightArrow) return setCursor(Math.min(value.length, cursor + 1));
      if (key.home || (key.ctrl && input === "a")) return setCursor(0);
      if (key.end || (key.ctrl && input === "e")) return setCursor(value.length);
      if (key.ctrl && input === "u") {
        onChange(value.slice(cursor));
        return setCursor(0);
      }
      if (key.ctrl && input === "w") {
        const start = value.slice(0, cursor).replace(/\S+\s*$/, "").length;
        onChange(value.slice(0, start) + value.slice(cursor));
        return setCursor(start);
      }
      if (key.backspace || key.delete) {
        if (cursor === 0) return;
        onChange(value.slice(0, cursor - 1) + value.slice(cursor));
        return setCursor(cursor - 1);
      }
      if (key.ctrl || key.meta || key.tab || key.escape || key.upArrow || key.downArrow) return;
      if (key.pageUp || key.pageDown) return;
      if (input) insert(input);
    },
    { isActive: focus },
  );

  usePaste((text) => insert(text.replace(/[\r\n]+/g, " ")), { isActive: focus });

  if (!focus) {
    return value ? <Text>{value}</Text> : <Text dimColor>{placeholder}</Text>;
  }
  if (!value) {
    return (
      <Text>
        <Text inverse>{placeholder[0] ?? " "}</Text>
        <Text dimColor>{placeholder.slice(1)}</Text>
      </Text>
    );
  }
  return (
    <Text>
      {value.slice(0, cursor)}
      <Text inverse>{value[cursor] ?? " "}</Text>
      {value.slice(cursor + 1)}
    </Text>
  );
}
