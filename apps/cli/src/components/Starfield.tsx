import { Box, Text, useAnimation } from "ink";
import type { ReactNode } from "react";
import { colorRuns, range, useTheme } from "../tui/theme";

/** Pseudoaleatório determinístico por célula: as estrelas ficam no lugar entre quadros. */
function hash(x: number, y: number, seed: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 2246822519)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const STAR_CHARS = ["·", "·", "·", "+", "⋆", "✦"];

/** Campo de estrelas coloridas que piscam. */
export function Starfield({
  width,
  height,
  seed = 1,
  density = 0.03,
}: {
  width: number;
  height: number;
  seed?: number;
  density?: number;
}) {
  const theme = useTheme();
  const { frame } = useAnimation({ interval: 300 });
  if (width <= 0 || height <= 0) return null;
  const colors = ["#ffffff", theme.link, theme.accent, theme.notice, theme.meta, "#ffffff"];

  return (
    <Box flexDirection="column" width={width} height={height} flexShrink={0}>
      {range(height).map((y) => {
        const runs = colorRuns(width, (x) => {
          if (hash(x, y, seed) >= density) return { char: " ", color: undefined };
          const phase = (frame + Math.floor(hash(x, y, seed + 13) * 10)) % 10;
          if (phase === 0) return { char: " ", color: undefined };
          const char = STAR_CHARS[Math.floor(hash(y, x, seed + 7) * STAR_CHARS.length)] ?? "·";
          const color =
            phase === 1 ? theme.muted : colors[Math.floor(hash(x + 3, y, seed) * colors.length)];
          return { char, color };
        });
        return (
          <Text key={`${seed}-${y}`} wrap="truncate">
            {runs.map((run) => (
              <Text key={run.start} {...(run.color && { color: run.color })}>
                {run.text}
              </Text>
            ))}
          </Text>
        );
      })}
    </Box>
  );
}

/** Centraliza o conteúdo e preenche o espaço em volta com estrelas (só no tema retrô). */
export function StarBackdrop({
  width,
  height,
  contentWidth,
  contentHeight,
  seed = 1,
  children,
}: {
  width: number;
  height: number;
  contentWidth: number;
  contentHeight: number;
  seed?: number;
  children: ReactNode;
}) {
  const theme = useTheme();
  const innerHeight = Math.min(contentHeight, height);
  const innerWidth = Math.min(contentWidth, width);
  const center = (
    <Box
      width={innerWidth}
      height={innerHeight}
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      flexShrink={0}
    >
      {children}
    </Box>
  );
  if (!theme.retro) {
    return (
      <Box width={width} height={height} alignItems="center" justifyContent="center">
        {center}
      </Box>
    );
  }
  const top = Math.floor((height - innerHeight) / 2);
  const left = Math.floor((width - innerWidth) / 2);
  return (
    <Box flexDirection="column" width={width} height={height}>
      <Starfield width={width} height={top} seed={seed} />
      <Box>
        <Starfield width={left} height={innerHeight} seed={seed + 1} />
        {center}
        <Starfield width={width - innerWidth - left} height={innerHeight} seed={seed + 2} />
      </Box>
      <Starfield width={width} height={height - innerHeight - top} seed={seed + 3} />
    </Box>
  );
}
