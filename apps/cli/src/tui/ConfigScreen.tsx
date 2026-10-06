import {
  CONFIG_FIELDS,
  ConfigError,
  type ConfigField,
  formatConfigValue,
  getAppPaths,
  getConfigValue,
  type Jukebox,
  renderTemplate,
  SAMPLE_TRACK,
  saveConfig,
  setConfigValue,
  validateTemplate,
} from "@jukeboxdl/core";
import { Box, Text, useInput } from "ink";
import { useState } from "react";
import { TextInput } from "../components/TextInput";
import { KeyHints } from "./KeyHints";
import { useCursor } from "./list";

function TemplatePreview({ template }: { template: string }) {
  const issues = validateTemplate(template);
  if (issues.length > 0) return <Text color="red">✖ {issues[0]?.message}</Text>;
  return (
    <Text>
      <Text dimColor>exemplo: </Text>
      <Text color="green">{renderTemplate(template, SAMPLE_TRACK)}</Text>
    </Text>
  );
}

export function ConfigScreen({
  jukebox,
  active,
  onEditingChange,
  onFlash,
}: {
  jukebox: Jukebox;
  active: boolean;
  onEditingChange: (editing: boolean) => void;
  onFlash: (message: string) => void;
}) {
  const [config, setConfig] = useState(jukebox.config);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const cursor = useCursor(CONFIG_FIELDS.length, CONFIG_FIELDS.length);
  const field = CONFIG_FIELDS[cursor.index] as ConfigField;

  const save = async (key: string, raw: string): Promise<boolean> => {
    try {
      const next = setConfigValue(config, key, raw);
      await saveConfig(next);
      setConfig(next);
      jukebox.setConfig(next);
      setError(null);
      onFlash(
        key.startsWith("binaries.")
          ? "Salvo; reabra o app para usar o novo binário"
          : "Configuração salva",
      );
      return true;
    } catch (err) {
      setError(err instanceof ConfigError ? err.issues.join("; ") || err.message : String(err));
      return false;
    }
  };

  const stopEditing = () => {
    setEditing(null);
    onEditingChange(false);
  };

  useInput(
    (input, key) => {
      if (editing) {
        if (key.escape) {
          stopEditing();
          setError(null);
        }
        return;
      }
      if (cursor.handleKey(key)) return setError(null);
      const value = getConfigValue(config, field.key);
      if (field.type === "boolean" && (key.return || input === " ")) {
        void save(field.key, value ? "false" : "true");
      } else if (
        field.type === "choice" &&
        (key.return || input === " " || key.rightArrow || key.leftArrow)
      ) {
        const choices = field.choices ?? [];
        const step = key.leftArrow ? -1 : 1;
        const next =
          choices[(choices.indexOf(value as number) + step + choices.length) % choices.length];
        void save(field.key, String(next));
      } else if (key.return) {
        setDraft(value === undefined ? "" : String(value));
        setEditing(field.key);
        onEditingChange(true);
      }
    },
    { isActive: active },
  );

  const labelWidth = Math.max(...CONFIG_FIELDS.map((f) => f.label.length)) + 2;

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box flexDirection="column" flexGrow={1}>
        {CONFIG_FIELDS.map((f, i) => {
          const selected = i === cursor.index;
          const isEditing = editing === f.key;
          return (
            <Box key={f.key} flexDirection="column">
              <Box>
                <Text color="cyan">{selected ? "❯ " : "  "}</Text>
                <Box width={labelWidth} flexShrink={0}>
                  <Text bold={selected}>{f.label}</Text>
                </Box>
                {isEditing ? (
                  <TextInput
                    value={draft}
                    onChange={setDraft}
                    onSubmit={async (value) => {
                      if (await save(f.key, value)) stopEditing();
                    }}
                    focus={active}
                  />
                ) : (
                  <Text
                    color={
                      f.type === "boolean"
                        ? getConfigValue(config, f.key)
                          ? "green"
                          : "gray"
                        : undefined
                    }
                    wrap="truncate-end"
                  >
                    {formatConfigValue(getConfigValue(config, f.key))}
                  </Text>
                )}
              </Box>
              {f.type === "template" && (selected || isEditing) && (
                <Box paddingLeft={labelWidth + 2}>
                  <TemplatePreview
                    template={isEditing ? draft : String(getConfigValue(config, f.key))}
                  />
                </Box>
              )}
            </Box>
          );
        })}
      </Box>

      <Box flexDirection="column" marginTop={1}>
        {error ? <Text color="red">✖ {error}</Text> : <Text dimColor>{field.description}</Text>}
        {field.type === "template" && (
          <Text dimColor>
            Variáveis:{" "}
            {"{title} {artist} {album} {track} {year} {playlist} {index} {uploader} {id}"} ·{" "}
            {"{track:02}"} zeros · {"{album|Singles}"} padrão · / pastas
          </Text>
        )}
        <Text dimColor wrap="truncate-start">
          {getAppPaths().configFile}
        </Text>
      </Box>
      <Box marginTop={1}>
        {editing ? (
          <KeyHints
            hints={[
              ["enter", "salvar"],
              ["esc", "cancelar"],
            ]}
          />
        ) : (
          <KeyHints
            hints={[
              ["↑↓", "navegar"],
              [
                "enter",
                field.type === "boolean" || field.type === "choice" ? "alternar" : "editar",
              ],
              ["tab", "próxima aba"],
            ]}
          />
        )}
      </Box>
    </Box>
  );
}
