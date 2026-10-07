import { Box, Text } from "ink";
import { t } from "../lib/i18n";
import { useTheme } from "./theme";

type Section = { title: string; keys: Array<[string, string]> };

function sections(): Section[] {
  return [
    {
      title: t("help.global"),
      keys: [
        ["1-7", t("help.tabs")],
        ["tab", t("help.sidebar")],
        ["d", t("help.destination")],
        ["U", t("help.updateYtDlp")],
        ["?", t("help.toggleHelp")],
        ["q · ctrl+c", t("help.quit")],
      ],
    },
    {
      title: t("help.player"),
      keys: [
        [t("key.space"), t("help.playPause")],
        ["> <", t("help.nextPrev")],
        ["[ ]", t("help.seek")],
        ["- +", t("help.volume")],
        ["S · L", t("help.shuffleRepeat")],
      ],
    },
    {
      title: t("help.list"),
      keys: [
        ["↑↓ · j k", t("help.move")],
        ["pgup pgdn · ^u ^d", t("help.page")],
        ["home end · g G", t("help.edges")],
      ],
    },
    {
      title: t("help.library"),
      keys: [
        ["enter", t("help.playFromHere")],
        ["esc", t("key.back")],
        ["/", t("key.filter")],
        ["t / T", t("help.updateCover")],
        ["o · r · e", `${t("key.openFolder")} · ${t("key.redownload")} · ${t("key.export")}`],
        ["R", t("help.rescan")],
      ],
    },
    {
      title: t("help.search"),
      keys: [
        ["enter", t("key.download")],
        [t("key.space"), t("key.mark")],
        ["p", t("help.preview")],
        ["c", t("help.splitChapters")],
        ["f · v", `${t("help.durationFilter")} · ${t("filter.hideVersions")}`],
      ],
    },
    {
      title: t("help.downloads"),
      keys: [
        ["x / X", t("key.cancel")],
        ["r / R", t("key.retry")],
        ["c", t("key.clearDone")],
        ["o", t("key.openFolder")],
      ],
    },
  ];
}

function SectionView({
  section,
  keyWidth,
  first,
}: {
  section: Section;
  keyWidth: number;
  first: boolean;
}) {
  const theme = useTheme();
  return (
    <Box flexDirection="column" marginTop={first ? 0 : 1}>
      <Text color={theme.notice}>{section.title}</Text>
      {section.keys.map(([keys, label]) => (
        <Box key={keys + label}>
          <Box width={keyWidth} flexShrink={0}>
            <Text color={theme.link}>{keys}</Text>
          </Box>
          <Text color={theme.muted} wrap="truncate-end">
            {label}
          </Text>
        </Box>
      ))}
    </Box>
  );
}

/** Painel flutuante com todos os atalhos, em duas colunas para caber em terminais baixos. */
export function HelpOverlay({ width }: { width: number }) {
  const theme = useTheme();
  const boxWidth = Math.min(108, width - 2);
  const all = sections();
  const left = [all[0], all[1], all[2]].filter((s): s is Section => Boolean(s));
  const right = [all[3], all[4], all[5]].filter((s): s is Section => Boolean(s));
  return (
    <Box
      position="absolute"
      top={1}
      left={Math.max(0, Math.floor((width - boxWidth) / 2))}
      width={boxWidth}
      flexDirection="column"
      borderStyle={theme.retro ? "double" : "round"}
      borderColor={theme.accent}
      backgroundColor="#0b0b12"
      paddingX={2}
    >
      <Text color={theme.accent} bold>
        {theme.retro ? `// ${t("help.title")}` : t("help.title")}
        <Text color={theme.muted}>{`   esc / ? · ${t("key.close")}`}</Text>
      </Text>
      <Box gap={4}>
        <Box flexDirection="column" flexBasis="50%" flexShrink={1}>
          {left.map((section, i) => (
            <SectionView key={section.title} section={section} keyWidth={20} first={i === 0} />
          ))}
        </Box>
        <Box flexDirection="column" flexBasis="50%" flexShrink={1}>
          {right.map((section, i) => (
            <SectionView key={section.title} section={section} keyWidth={12} first={i === 0} />
          ))}
        </Box>
      </Box>
    </Box>
  );
}
