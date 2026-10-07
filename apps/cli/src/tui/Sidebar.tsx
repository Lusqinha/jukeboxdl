import { basename } from "node:path";
import { Box, Text } from "ink";
import { t } from "../lib/i18n";
import { useTheme } from "./theme";

export const VIEWS = [
  "library",
  "albums",
  "artists",
  "folders",
  "search",
  "downloads",
  "config",
] as const;
export type View = (typeof VIEWS)[number];

const LABEL: Record<View, Parameters<typeof t>[0]> = {
  library: "nav.library",
  albums: "nav.albums",
  artists: "nav.artists",
  folders: "nav.folders",
  search: "nav.search",
  downloads: "nav.downloads",
  config: "nav.config",
};

/** Grupos visuais da barra: ouvir, baixar, ajustar. */
const SEPARATOR_BEFORE = new Set<View>(["search", "config"]);

export const SIDEBAR_WIDTH = 20;

export function Sidebar({
  view,
  focused,
  pending,
  destination,
  height,
}: {
  view: View;
  focused: boolean;
  /** Downloads em andamento ou na fila. */
  pending: number;
  destination: string | null;
  height: number;
}) {
  const theme = useTheme();
  const border = focused ? theme.accent : theme.retro ? theme.bevelDark : theme.muted;
  return (
    <Box
      width={SIDEBAR_WIDTH}
      height={height}
      flexShrink={0}
      flexDirection="column"
      borderStyle={theme.retro ? "single" : "round"}
      borderColor={border}
      paddingX={1}
    >
      <Text color={theme.accent} bold>
        ♪ jukeboxdl
      </Text>
      <Box height={1} />
      {VIEWS.map((item, i) => {
        const selected = item === view;
        return (
          <Box key={item} flexDirection="column">
            {SEPARATOR_BEFORE.has(item) && (
              <Text color={theme.muted}>{"─".repeat(SIDEBAR_WIDTH - 4)}</Text>
            )}
            <Box {...(selected && { backgroundColor: theme.selectionBg })}>
              <Text color={selected ? theme.accent : theme.link} bold={selected}>
                {selected ? "❯ " : "  "}
              </Text>
              <Text color={theme.muted}>{i + 1} </Text>
              <Text
                {...(selected && { color: theme.retro ? "#ffffff" : theme.accent })}
                bold={selected}
              >
                {t(LABEL[item])}
              </Text>
              {item === "downloads" && pending > 0 && <Text color={theme.notice}> {pending}</Text>}
            </Box>
          </Box>
        );
      })}
      <Box flexGrow={1} />
      {destination && (
        <Text color={theme.notice} wrap="truncate-start">
          → {basename(destination)}
        </Text>
      )}
    </Box>
  );
}
