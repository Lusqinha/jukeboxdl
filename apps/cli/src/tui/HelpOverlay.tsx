import { Box, Text } from "ink";
import { t } from "../lib/i18n";
import { useTheme } from "./theme";

type Section = { title: string; keys: Array<[string, string]> };

function sections(): Section[] {
  return [
    {
      title: t("help.global"),
      keys: [
        ["tab / 1-4", t("help.tabs")],
        ["/", t("help.jumpSearch")],
        ["esc", t("help.backToSearch")],
        ["d", t("help.destination")],
        ["U", t("help.updateYtDlp")],
        ["?", t("help.toggleHelp")],
        ["q · ctrl+c", t("help.quit")],
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
      title: t("help.search"),
      keys: [
        ["enter", t("key.download")],
        [t("key.space"), t("key.mark")],
        ["a", t("help.markAll")],
        ["p", t("help.preview")],
        ["c", t("help.splitChapters")],
        ["f", t("help.durationFilter")],
        ["v", t("help.versionsFilter")],
        ["…", t("help.typeToSearch")],
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
    {
      title: t("help.history"),
      keys: [
        ["/", t("key.filter")],
        ["o", t("key.openFolder")],
        ["r", t("key.redownload")],
        ["e", t("key.export")],
        ["d", t("key.removeHistory")],
      ],
    },
  ];
}

function SectionView({ section, keyWidth }: { section: Section; keyWidth: number }) {
  const theme = useTheme();
  return (
    <Box flexDirection="column" marginTop={1}>
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
  const left = [all[0], all[1], all[3]].filter((s): s is Section => Boolean(s));
  const right = [all[2], all[4]].filter((s): s is Section => Boolean(s));
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
      </Text>
      <Box gap={4}>
        <Box flexDirection="column" flexBasis="50%" flexShrink={1}>
          {left.map((section) => (
            <SectionView key={section.title} section={section} keyWidth={20} />
          ))}
        </Box>
        <Box flexDirection="column" flexBasis="50%" flexShrink={1}>
          {right.map((section) => (
            <SectionView key={section.title} section={section} keyWidth={10} />
          ))}
        </Box>
      </Box>
      <Text color={theme.muted}>esc / ? · {t("key.close")}</Text>
    </Box>
  );
}
