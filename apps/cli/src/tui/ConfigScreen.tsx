import {
  CONFIG_FIELDS,
  type Config,
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
import { Panel } from "../components/Panel";
import { TextInput } from "../components/TextInput";
import { KeyHints } from "./KeyHints";
import { useCursor } from "./list";
import { Pointer } from "./Pointer";
import { useTheme } from "./theme";

function TemplatePreview({ template }: { template: string }) {
  const theme = useTheme();
  const issues = validateTemplate(template);
  if (issues.length > 0) return <Text color={theme.danger}>✖ {issues[0]?.message}</Text>;
  return (
    <Text>
      <Text color={theme.muted}>exemplo: </Text>
      <Text color={theme.success}>{renderTemplate(template, SAMPLE_TRACK)}</Text>
    </Text>
  );
}

export function ConfigScreen({
  jukebox,
  active,
  onEditingChange,
  onFlash,
  onSaved,
}: {
  jukebox: Jukebox;
  active: boolean;
  onEditingChange: (editing: boolean) => void;
  onFlash: (message: string) => void;
  onSaved: (config: Config) => void;
}) {
  const theme = useTheme();
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
      onSaved(next);
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
          choices[
            (choices.indexOf(value as number | string) + step + choices.length) % choices.length
          ];
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
      <Panel
        title="config"
        right={<Text color={theme.meta}>{getAppPaths().configFile}</Text>}
        flexGrow={1}
      >
        <Box flexDirection="column" flexGrow={1}>
          {CONFIG_FIELDS.map((f, i) => {
            const selected = i === cursor.index;
            const isEditing = editing === f.key;
            const value = getConfigValue(config, f.key);
            return (
              <Box key={f.key} flexDirection="column">
                <Box {...(selected && { backgroundColor: theme.selectionBg })}>
                  <Pointer selected={selected} />
                  <Box width={labelWidth} flexShrink={0}>
                    <Text
                      bold={selected}
                      {...(theme.retro && { color: selected ? "#ffffff" : theme.link })}
                    >
                      {f.label}
                    </Text>
                  </Box>
                  {isEditing ? (
                    <TextInput
                      value={draft}
                      onChange={setDraft}
                      onSubmit={async (text) => {
                        if (await save(f.key, text)) stopEditing();
                      }}
                      focus={active}
                    />
                  ) : (
                    <Text
                      color={
                        f.type === "boolean"
                          ? value
                            ? theme.success
                            : theme.muted
                          : theme.retro
                            ? theme.notice
                            : "white"
                      }
                      wrap="truncate-end"
                    >
                      {f.type === "choice" && selected
                        ? `‹ ${formatConfigValue(value)} ›`
                        : formatConfigValue(value)}
                    </Text>
                  )}
                </Box>
                {f.type === "template" && (selected || isEditing) && (
                  <Box paddingLeft={labelWidth + 2}>
                    <TemplatePreview template={isEditing ? draft : String(value)} />
                  </Box>
                )}
              </Box>
            );
          })}
        </Box>
        <Box flexDirection="column" marginTop={1}>
          {error ? (
            <Text color={theme.danger}>✖ {error}</Text>
          ) : (
            <Text color={theme.muted}>{field.description}</Text>
          )}
          {field.type === "template" && (
            <Text color={theme.muted}>
              variáveis:{" "}
              {"{title} {artist} {album} {track} {year} {playlist} {index} {uploader} {id}"} ·{" "}
              {"{track:02}"} zeros · {"{album|Singles}"} padrão · / pastas
            </Text>
          )}
        </Box>
      </Panel>
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
                field.type === "choice" ? "←→" : "enter",
                field.type === "boolean" || field.type === "choice" ? "alternar" : "editar",
              ],
              ["1-4", "abas"],
            ]}
          />
        )}
      </Box>
    </Box>
  );
}
