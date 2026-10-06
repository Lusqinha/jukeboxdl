import { Box, Text, useAnimation, useWindowSize } from "ink";
import { useEffect, useRef, useState } from "react";
import pkg from "../../package.json" with { type: "json" };
import { GradientRule } from "../components/GradientRule";
import { StarBackdrop } from "../components/Starfield";
import { colorRuns, gradientAt, type Theme, useTheme } from "./theme";

// Letras de 3 linhas desenhadas para o wordmark "jukeboxdl".
const LETTERS: Record<string, [string, string, string]> = {
  j: ["   █", "▄  █", "▀▄▄▀"],
  u: ["█  █", "█  █", "▀▄▄▀"],
  k: ["█ ▄▀", "██▀ ", "█ ▀▄"],
  e: ["█▀▀▀", "█▀▀ ", "█▄▄▄"],
  b: ["█▀▀▄", "█▀▀▄", "█▄▄▀"],
  o: ["▄▀▀▄", "█  █", "▀▄▄▀"],
  x: ["▀▄▄▀", " ██ ", "▄▀▀▄"],
  d: ["█▀▀▄", "█  █", "█▄▄▀"],
  l: ["█   ", "█   ", "█▄▄▄"],
};
const WORD = "jukeboxdl";
const WORD_WIDTH = WORD.length * 5 - 1;
const WORD_LETTERS = [...WORD].map((char, position) => ({ char, position }));
const NOTES = ["♪", "♫", "♬", "♩"];
const NEON_SHADOW = "#5a1a6e";

/** Jukebox com notas saltitantes, equalizador e luzes que mudam de cor. */
function JukeboxArt({ frame, theme }: { frame: number; theme: Theme }) {
  const note = (offset: number) => NOTES[(Math.floor(frame / 4) + offset) % NOTES.length];
  const up = (offset: number) => Math.floor(frame / 3 + offset) % 2 === 0;
  const light = (offset: number) => gradientAt(theme, frame / 2 + offset);
  const eq = [0, 1, 2, 3, 4].map((i) => "▁▂▃▄▅▆▇█"[(Math.floor(frame / 2) * (i + 3) + i * 5) % 8]);

  return (
    <Box flexDirection="column" alignItems="center">
      <Text color={light(0)}> {[0, 1, 2].map((i) => (up(i) ? note(i) : " ")).join("   ")}</Text>
      <Text color={light(2)}>{[0, 1, 2].map((i) => (up(i) ? " " : note(i))).join("   ")} </Text>
      <Text color={light(1)}>╭───────────╮</Text>
      <Text>
        <Text color={light(1)}>│</Text>
        <Text color={light(3)}> ◜ </Text>
        <Text color={theme.retro ? theme.notice : "#d7d7ff"}>{eq.join("")}</Text>
        <Text color={light(3)}> ◝ </Text>
        <Text color={light(1)}>│</Text>
      </Text>
      <Text>
        <Text color={light(2)}>│</Text>
        <Text color={theme.muted}> ╞═══════╡ </Text>
        <Text color={light(2)}>│</Text>
      </Text>
      <Text>
        <Text color={light(3)}>│</Text>
        <Text color={light(4)}> ● </Text>
        <Text color={theme.muted}>▤▤▤▤▤</Text>
        <Text color={light(5)}> ● </Text>
        <Text color={light(3)}>│</Text>
      </Text>
      <Text color={light(4)}>╰─┬───────┬─╯</Text>
    </Box>
  );
}

/** Wordmark revelado letra a letra; no retrô, letreiro neon com sombra e tremulação ocasional. */
function Wordmark({ frame, theme }: { frame: number; theme: Theme }) {
  const revealed = Math.min(WORD.length, Math.floor(frame / 2));
  // De tempos em tempos uma letra "falha", como neon velho.
  const flicker = frame % 47 < 2 ? 3 : frame % 71 < 1 ? 6 : -1;
  const letterColor = (i: number) => {
    if (!theme.retro) return gradientAt(theme, i - frame / 3);
    return i === flicker ? NEON_SHADOW : theme.accent;
  };

  return (
    <Box flexDirection="column">
      {[0, 1, 2].map((row) => (
        <Box key={`row${row}`} height={1}>
          <Text>
            {WORD_LETTERS.map(({ char, position }) => (
              <Text key={position} color={letterColor(position)}>
                {position < revealed ? (LETTERS[char]?.[row] ?? "    ") : "    "}
                {position < WORD.length - 1 ? " " : ""}
              </Text>
            ))}
          </Text>
        </Box>
      ))}
      {theme.retro && (
        <Box height={1}>
          <Text color={NEON_SHADOW}>
            {" "}
            {[...WORD]
              .map((char, i) =>
                i < revealed ? (LETTERS[char]?.[2] ?? "    ").replace(/\S/g, "░") : "    ",
              )
              .join(" ")}
          </Text>
        </Box>
      )}
    </Box>
  );
}

function BootBar({ shown, frame, theme }: { shown: number; frame: number; theme: Theme }) {
  const width = 36;
  const filled = Math.round(Math.min(1, shown) * width);
  const shimmer = frame % (width + 8);
  const runs = colorRuns(width, (i) => {
    if (i >= filled) return { char: theme.retro ? theme.barEmpty : "━", color: theme.muted };
    const color =
      Math.abs(i - shimmer) < 2
        ? "#ffffff"
        : gradientAt(theme, (i / width) * theme.gradient.length);
    return { char: theme.retro ? theme.barFilled : "━", color };
  });
  return (
    <Text>
      {runs.map((run) => (
        <Text key={run.start} {...(run.color && { color: run.color })}>
          {run.text}
        </Text>
      ))}
    </Text>
  );
}

export function BootScreen({ progress, status }: { progress: number; status: string }) {
  const theme = useTheme();
  const { columns, rows } = useWindowSize();
  const { frame } = useAnimation({ interval: 50 });
  // A barra persegue o progresso real suavemente em vez de pular.
  const [shown, setShown] = useState(0);
  const target = useRef(progress);
  target.current = progress;

  // biome-ignore lint/correctness/useExhaustiveDependencies: avança a cada quadro da animação
  useEffect(() => {
    setShown((value) => value + (target.current - value) * 0.25);
  }, [frame]);

  return (
    <StarBackdrop width={columns} height={rows} contentWidth={WORD_WIDTH + 4} contentHeight={20}>
      <JukeboxArt frame={frame} theme={theme} />
      <Box marginTop={1} flexDirection="column" alignItems="center">
        <Wordmark frame={frame} theme={theme} />
        {theme.retro && (
          <Box height={1}>
            <GradientRule width={WORD_WIDTH} />
          </Box>
        )}
      </Box>
      <Box height={1}>
        <Text color={theme.retro ? theme.notice : theme.muted}>
          {theme.retro ? "tocador de fitas do cyberespaço" : "músicas do YouTube direto para MP3"}
        </Text>
      </Box>
      <Box flexDirection="column" alignItems="center" marginTop={1}>
        <BootBar shown={shown} frame={frame} theme={theme} />
        <Text color={theme.muted}>
          {status} · v{pkg.version}
        </Text>
      </Box>
    </StarBackdrop>
  );
}
