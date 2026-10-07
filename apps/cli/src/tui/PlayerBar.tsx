import type { PlayerState } from "@jukeboxdl/core";
import { Box, Text } from "ink";
import { ProgressBar } from "../components/ProgressBar";
import { Spinner } from "../components/Spinner";
import { displayText, formatDuration } from "../lib/format";
import { t } from "../lib/i18n";
import { useTheme } from "./theme";

const STATUS_ICON: Record<PlayerState["status"], string> = {
  idle: "■",
  loading: "…",
  playing: "▶",
  paused: "❚❚",
  error: "✖",
};

/** Barra do player, sempre visível no rodapé. */
export function PlayerBar({ state, width }: { state: PlayerState; width: number }) {
  const theme = useTheme();
  const { track } = state;
  const barWidth = Math.max(10, Math.min(30, Math.floor(width / 5)));
  const progress = state.duration ? state.position / state.duration : 0;

  if (!track || state.status === "idle") {
    return (
      <Box paddingX={1}>
        <Text color={theme.muted}>
          {STATUS_ICON.idle} {t("player.idle")}
        </Text>
      </Box>
    );
  }

  const title = displayText(track.artist ? `${track.title} · ${track.artist}` : track.title);
  return (
    <Box paddingX={1} gap={1}>
      <Box flexShrink={0}>
        {state.status === "loading" ? (
          <Spinner />
        ) : (
          <Text color={state.status === "error" ? theme.danger : theme.accent}>
            {STATUS_ICON[state.status]}
          </Text>
        )}
      </Box>
      <Box flexGrow={1} flexShrink={1} minWidth={10}>
        <Text wrap="truncate-end" bold {...(theme.retro && { color: "#ffffff" })}>
          {title}
        </Text>
      </Box>
      <Box flexShrink={0} gap={1}>
        <Text color={theme.meta}>{formatDuration(state.position)}</Text>
        <ProgressBar value={progress} width={barWidth} />
        <Text color={theme.meta}>{formatDuration(state.duration)}</Text>
      </Box>
      <Box flexShrink={0} gap={1}>
        <Text color={theme.muted}>vol</Text>
        <Text color={theme.notice}>{String(state.volume).padStart(3)}</Text>
        <Text color={state.shuffle ? theme.accent : theme.muted}>⇄</Text>
        <Text color={state.repeat === "off" ? theme.muted : theme.accent}>
          {state.repeat === "one" ? "↻¹" : "↻"}
        </Text>
      </Box>
    </Box>
  );
}
