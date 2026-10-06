import { join } from "node:path";
import { runCommand } from "../process";

export interface PreparedCover {
  path: string;
  width: number;
  height: number;
}

const SQUARE_SIZE = 600;
const WIDE_WIDTH = 800;

/**
 * Converte a thumbnail na capa final. Faixas do YouTube Music trazem a arte quadrada
 * centralizada no quadro 16:9, então ali o recorte central pega a capa inteira; nos
 * demais vídeos o quadro é mantido, só reduzido.
 */
export async function prepareCover(
  ffmpeg: string,
  thumbnail: string,
  workdir: string,
  { square, signal }: { square: boolean; signal?: AbortSignal | undefined },
): Promise<PreparedCover | undefined> {
  const path = join(workdir, "cover-final.jpg");
  const filter = square
    ? `crop='min(iw,ih)':'min(iw,ih)',scale=${SQUARE_SIZE}:${SQUARE_SIZE}`
    : `scale=${WIDE_WIDTH}:-2`;
  const result = await runCommand(
    ffmpeg,
    ["-hide_banner", "-loglevel", "error", "-y", "-i", thumbnail, "-vf", filter, "-q:v", "2", path],
    { signal },
  );
  if (result.code !== 0) return undefined;
  // A altura do quadro reduzido não é conhecida sem medir; 0 é aceito como "desconhecido".
  return square
    ? { path, width: SQUARE_SIZE, height: SQUARE_SIZE }
    : { path, width: WIDE_WIDTH, height: 0 };
}
