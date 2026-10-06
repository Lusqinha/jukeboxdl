import {
  checkDestination,
  type Destination,
  describeDestination,
  expandHome,
  listRemovableDrives,
  loadRecentDestinations,
} from "@jukeboxdl/core";
import { Box, Text, useInput } from "ink";
import { useEffect, useState } from "react";
import { TextInput } from "../components/TextInput";
import { formatBytes } from "../lib/format";
import { t } from "../lib/i18n";
import { KeyHints } from "./KeyHints";
import { useCursor } from "./list";
import { Pointer } from "./Pointer";
import { useTheme } from "./theme";

type Option =
  | { kind: "default"; destination: Destination }
  | { kind: "recent" | "drive"; destination: Destination }
  | { kind: "type" };

/**
 * Painel para escolher onde salvar os próximos downloads: a pasta padrão, destinos
 * recentes, discos removíveis detectados (pendrives) ou um caminho digitado.
 */
export function DestinationPicker({
  defaultDir,
  current,
  width,
  onSelect,
  onCancel,
}: {
  defaultDir: string;
  current: string | null;
  width: number;
  /** `null` volta para a pasta padrão. */
  onSelect: (path: string | null) => void;
  onCancel: () => void;
}) {
  const theme = useTheme();
  const [options, setOptions] = useState<Option[]>([]);
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState(current ?? "");
  const [error, setError] = useState<string | null>(null);
  const cursor = useCursor(options.length, options.length);

  useEffect(() => {
    void (async () => {
      const base = expandHome(defaultDir);
      const [drives, recentPaths, defaultInfo] = await Promise.all([
        listRemovableDrives(),
        loadRecentDestinations(),
        describeDestination(base, t("dest.default")),
      ]);
      const drivePaths = new Set(drives.map((d) => d.path));
      const recent = await Promise.all(
        recentPaths
          .filter((path) => path !== base && !drivePaths.has(path))
          .map((path) => describeDestination(path)),
      );
      setOptions([
        { kind: "default", destination: defaultInfo },
        ...recent.map((destination) => ({ kind: "recent" as const, destination })),
        ...drives.map((destination) => ({ kind: "drive" as const, destination })),
        { kind: "type" },
      ]);
    })();
  }, [defaultDir]);

  const choose = async (path: string) => {
    const check = await checkDestination(path);
    if (!check.ok) {
      setError(t(`dest.error.${check.reason}` as Parameters<typeof t>[0]));
      return;
    }
    onSelect(check.path);
  };

  useInput((input, key) => {
    if (typing) {
      if (key.escape) {
        setTyping(false);
        setError(null);
      }
      return;
    }
    if (key.escape || input === "q") return onCancel();
    if (cursor.handleKey(key, input)) return setError(null);
    if (!key.return) return;
    const option = options[cursor.index];
    if (!option) return;
    if (option.kind === "type") setTyping(true);
    else if (option.kind === "default") onSelect(null);
    else void choose(option.destination.path);
  });

  const hasDrives = options.some((o) => o.kind === "drive");
  const sectionStart = (i: number) => options[i]?.kind !== options[i - 1]?.kind;
  const sectionTitle: Partial<Record<Option["kind"], string>> = {
    recent: t("dest.recent"),
    drive: t("dest.drives"),
  };
  const boxWidth = Math.min(76, width - 4);

  return (
    <Box
      position="absolute"
      top={3}
      left={Math.max(0, Math.floor((width - boxWidth) / 2))}
      width={boxWidth}
      flexDirection="column"
      borderStyle={theme.retro ? "double" : "round"}
      borderColor={theme.accent}
      backgroundColor="#0b0b12"
      paddingX={2}
      paddingY={1}
    >
      <Text color={theme.accent} bold>
        {theme.retro ? `// ${t("dest.title")}` : t("dest.title")}
      </Text>
      {options.map((option, i) => {
        const selected = !typing && i === cursor.index;
        const title = sectionStart(i) ? sectionTitle[option.kind] : undefined;
        const isCurrent =
          option.kind === "default"
            ? current === null
            : option.kind !== "type" && option.destination.path === current;
        return (
          <Box
            key={option.kind === "type" ? "type" : `${option.kind}:${option.destination.path}`}
            flexDirection="column"
          >
            {title && (
              <Box marginTop={1}>
                <Text color={theme.notice}>{title}</Text>
              </Box>
            )}
            {option.kind === "type" && !hasDrives && (
              <Box marginTop={1}>
                <Text color={theme.muted}>{t("dest.noDrives")}</Text>
              </Box>
            )}
            <Box
              {...(selected && { backgroundColor: theme.selectionBg })}
              {...(option.kind === "type" && { marginTop: 1 })}
            >
              <Pointer selected={selected} />
              {option.kind === "type" ? (
                <Text color={theme.link}>{t("dest.type")}</Text>
              ) : (
                <>
                  <Box flexShrink={0}>
                    <Text bold={selected} {...(isCurrent && { color: theme.accent })}>
                      {isCurrent ? "● " : "  "}
                      {option.destination.label}
                    </Text>
                  </Box>
                  <Box flexGrow={1} flexShrink={1} marginLeft={2}>
                    <Text color={theme.muted} wrap="truncate-start">
                      {option.destination.path}
                    </Text>
                  </Box>
                  {option.destination.free !== undefined && (
                    <Box flexShrink={0} marginLeft={2}>
                      <Text color={theme.meta}>
                        {t("dest.free", { size: formatBytes(option.destination.free) })}
                      </Text>
                    </Box>
                  )}
                </>
              )}
            </Box>
          </Box>
        );
      })}
      {typing && (
        <Box marginTop={1}>
          <Text color={theme.accent}>» </Text>
          <TextInput
            value={draft}
            onChange={(value) => {
              setDraft(value);
              setError(null);
            }}
            onSubmit={(value) => void choose(value)}
            placeholder={t("dest.placeholder")}
          />
        </Box>
      )}
      {error && (
        <Box marginTop={1}>
          <Text color={theme.danger}>✖ {error}</Text>
        </Box>
      )}
      <Box marginTop={1}>
        <KeyHints
          hints={
            typing
              ? [
                  ["enter", t("dest.select")],
                  ["esc", t("dest.back")],
                ]
              : [
                  ["enter", t("dest.select")],
                  ["esc", t("key.close")],
                ]
          }
        />
      </Box>
    </Box>
  );
}
