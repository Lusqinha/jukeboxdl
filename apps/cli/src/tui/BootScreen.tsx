import { Box, Text, useAnimation, useWindowSize } from "ink";
import { useEffect, useRef, useState } from "react";
import pkg from "../../package.json" with { type: "json" };
import { gradientAt } from "./theme";

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

const NOTES = ["♪", "♫", "♬", "♩"];

/** Jukebox com notas saltitantes e luzes que piscam. */
function JukeboxArt({ frame }: { frame: number }) {
  const note = (offset: number) => NOTES[(Math.floor(frame / 4) + offset) % NOTES.length];
  const bounce = (offset: number) => (Math.floor(frame / 3 + offset) % 2 === 0 ? 0 : 1);
  const light = (offset: number) => gradientAt(frame / 2 + offset);
  const notesRow = [0, 1, 2].map((i) => (bounce(i) === 0 ? note(i) : " "));
  const notesRowLow = [0, 1, 2].map((i) => (bounce(i) === 1 ? note(i) : " "));
  const eq = [0, 1, 2, 3, 4].map((i) => "▁▂▃▄▅▆▇█"[(Math.floor(frame / 2) * (i + 3) + i * 5) % 8]);

  return (
    <Box flexDirection="column" alignItems="center">
      <Text color={light(0)}> {notesRow.join("   ")}</Text>
      <Text color={light(2)}>{notesRowLow.join("   ")} </Text>
      <Text color={light(1)}>╭───────────╮</Text>
      <Text>
        <Text color={light(1)}>│</Text>
        <Text color={light(3)}> ◜ </Text>
        <Text color="#d7d7ff">{eq.join("")}</Text>
        <Text color={light(3)}> ◝ </Text>
        <Text color={light(1)}>│</Text>
      </Text>
      <Text>
        <Text color={light(2)}>│</Text>
        <Text dimColor> ╞═══════╡ </Text>
        <Text color={light(2)}>│</Text>
      </Text>
      <Text>
        <Text color={light(3)}>│</Text>
        <Text color={light(4)}> ● </Text>
        <Text dimColor>▤▤▤▤▤</Text>
        <Text color={light(5)}> ● </Text>
        <Text color={light(3)}>│</Text>
      </Text>
      <Text color={light(4)}>╰─┬───────┬─╯</Text>
    </Box>
  );
}

/** Wordmark com revelação letra a letra e gradiente que corre da esquerda para a direita. */
function Wordmark({ frame }: { frame: number }) {
  const revealed = Math.min(WORD.length, Math.floor(frame / 2));
  return (
    <Box flexDirection="column">
      {[0, 1, 2].map((row) => (
        <Text key={row}>
          {[...WORD].map((char, i) => {
            const glyph = LETTERS[char]?.[row] ?? "    ";
            const visible = i < revealed;
            return (
              <Text key={char + String(i)} color={gradientAt(i - frame / 3)}>
                {visible ? glyph : "    "}
                {i < WORD.length - 1 ? " " : ""}
              </Text>
            );
          })}
        </Text>
      ))}
    </Box>
  );
}

interface BarRun {
  start: number;
  length: number;
  color: string | undefined;
}

/** Trechos da barra agrupados por cor: gradiente, brilho que percorre o preenchido e o vazio. */
function barRuns(filled: number, width: number, shimmer: number): BarRun[] {
  const runs: BarRun[] = [];
  for (let i = 0; i < width; i++) {
    const color =
      i >= filled ? undefined : Math.abs(i - shimmer) < 2 ? "#ffffff" : gradientAt(i / 6);
    const last = runs.at(-1);
    if (last && last.color === color) last.length++;
    else runs.push({ start: i, length: 1, color });
  }
  return runs;
}

export function BootScreen({ progress, status }: { progress: number; status: string }) {
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

  const width = 36;
  const filled = Math.round(Math.min(1, shown) * width);
  const shimmer = frame % (width + 8);

  return (
    <Box
      width={columns}
      height={rows}
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      gap={1}
    >
      <JukeboxArt frame={frame} />
      <Wordmark frame={frame} />
      <Text dimColor>músicas do YouTube direto para MP3 · v{pkg.version}</Text>
      <Box flexDirection="column" alignItems="center" marginTop={1}>
        <Text>
          {barRuns(filled, width, shimmer).map((run) => (
            <Text key={run.start} {...(run.color ? { color: run.color } : { dimColor: true })}>
              {"━".repeat(run.length)}
            </Text>
          ))}
        </Text>
        <Text dimColor>{status}</Text>
      </Box>
    </Box>
  );
}
