import type { TrackMetadata } from "../metadata";
import type { YtDlpInfo } from "../ytdlp/types";

const NOISE_WORDS =
  /\b(?:official|oficial|lyrics?|letra|audio|áudio|video|vídeo|clipe|visuali[sz]er|hd|hq|4k|mv|m\/v|ncs release)\b/i;

/** Remove marcações como "(Official Video)" ou "[HD]" do título. */
export function cleanTitle(title: string): string {
  return title
    .replace(/\s*[([]([^)\]]*)[)\]]/g, (group, inner: string) =>
      NOISE_WORDS.test(inner) ? "" : group,
    )
    .replace(/\s+/g, " ")
    .trim();
}

/** Nome do canal sem sufixos automáticos do YouTube ("Artista - Topic", "ArtistaVEVO"). */
export function cleanChannel(channel: string): string {
  return channel
    .replace(/\s+-\s+Topic$/i, "")
    .replace(/VEVO$/, "")
    .trim();
}

/** Separa "Artista - Título" quando o vídeo não traz metadados de música. */
export function splitArtistTitle(title: string): { artist: string; title: string } | null {
  const match = /^(.+?)\s+[-–—]\s+(.+)$/.exec(title);
  if (!match?.[1] || !match[2]) return null;
  return { artist: match[1].trim(), title: match[2].trim() };
}

function text(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export interface MetadataContext {
  playlist?: string | undefined;
  index?: number | undefined;
}

/**
 * Monta os metadados da faixa a partir do JSON do yt-dlp. Usa os campos de música do
 * YouTube Music quando existem; senão, tenta "Artista - Título" e, por último, o canal.
 */
export function metadataFromInfo(info: YtDlpInfo, context: MetadataContext = {}): TrackMetadata {
  const rawTitle = text(info.title) ?? text(info.id) ?? "";
  const uploader = text(info.uploader) ?? text(info.channel);
  const musicArtist = info.artists?.length
    ? info.artists.join(", ")
    : (text(info.artist) ?? text(info.creator));
  const musicTitle = text(info.track);

  let title = musicTitle ?? cleanTitle(rawTitle);
  let artist = musicArtist;
  if (!musicTitle && !musicArtist) {
    const split = splitArtistTitle(title);
    if (split) ({ artist, title } = split);
  }
  artist ??= uploader ? cleanChannel(uploader) : undefined;

  const year = info.release_year ?? (Number(info.release_date?.slice(0, 4)) || undefined);

  return {
    id: text(info.id) ?? "",
    title: title || rawTitle,
    artist,
    album: text(info.album),
    track: info.track_number ?? undefined,
    year,
    uploader,
    playlist: context.playlist,
    index: context.index,
  };
}
