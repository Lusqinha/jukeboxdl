import type { Job, PlayerState } from "@jukeboxdl/core";
import { Box, Spacer, Text, useAnimation } from "ink";
import { jobTitle } from "../components/JobRow";
import { ProgressBar } from "../components/ProgressBar";
import { displayText, formatBytes } from "../lib/format";
import { t } from "../lib/i18n";
import { gradientAt, range, useTheme } from "./theme";

const REEL = ["◐", "◓", "◑", "◒"];
const EQ = "▁▂▃▄▅▆▇█";
export const TAPE_DECK_WIDTH = 46;

/** Widget flutuante que mostra a faixa sendo baixada, como um toca-fitas. */
export function TapeDeck({
  jobs,
  bottom,
  player,
}: {
  jobs: Job[];
  bottom: number;
  player: PlayerState;
}) {
  const theme = useTheme();
  const active = jobs.filter(
    (j) => j.status === "downloading" || j.status === "converting" || j.status === "tagging",
  );
  const { frame } = useAnimation({
    interval: 120,
    isActive: active.length > 0 || player.status === "playing",
  });
  const job = active[0];
  const previewing = player.status === "loading" || player.status === "playing";
  if (!theme.retro || (!job && !previewing)) return null;
  const title = previewing && "video" in player ? player.video.title : job ? jobTitle(job) : "";

  const reel = REEL[frame % REEL.length];
  const eq = range(8).map((i) => {
    const level = (frame * (i + 2) + i * 3) % EQ.length;
    return (
      <Text key={`eq${i}`} color={gradientAt(theme, i + frame / 2)}>
        {EQ[level]}
      </Text>
    );
  });
  const detail = !job
    ? ""
    : job.status === "converting"
      ? t("job.converting")
      : job.status === "tagging"
        ? t("job.tagging")
        : job.speed
          ? `${formatBytes(job.speed)}/s`
          : "";

  return (
    <Box
      position="absolute"
      right={2}
      bottom={bottom}
      width={TAPE_DECK_WIDTH}
      flexDirection="column"
      borderStyle="single"
      borderTopColor={theme.bevelLight}
      borderLeftColor={theme.bevelLight}
      borderBottomColor={theme.bevelDark}
      borderRightColor={theme.bevelDark}
      backgroundColor="#0b0b12"
      paddingX={1}
    >
      <Box>
        <Text color={theme.accent}>{previewing ? t("tape.title") : t("tape.recording")}</Text>
        <Spacer />
        {active.length > 0 && (
          <Text color={theme.notice}>{t("tape.count", { n: active.length })}</Text>
        )}
      </Box>
      <Box>
        <Text color={theme.link}>(</Text>
        <Text color={theme.accent}>{reel}</Text>
        <Text color={theme.link}>)</Text>
        <Text color={theme.muted}>═</Text>
        <Text color={theme.link}>(</Text>
        <Text color={theme.accent}>{reel}</Text>
        <Text color={theme.link}>) </Text>
        <Box flexShrink={1}>
          <Text wrap="truncate-end" color="#ffffff">
            {displayText(title)}
          </Text>
        </Box>
      </Box>
      <Box gap={1}>
        <Text>{eq}</Text>
        {previewing ? (
          <Text color={theme.notice}>
            {player.status === "loading" ? t("tape.loading") : t("tape.preview")}
          </Text>
        ) : (
          job && (
            <>
              <ProgressBar value={job.progress} width={12} />
              <Text color={theme.notice}>
                {String(Math.round(job.progress * 100)).padStart(3)}%
              </Text>
              <Text color={theme.meta}>{detail}</Text>
            </>
          )
        )}
      </Box>
    </Box>
  );
}
