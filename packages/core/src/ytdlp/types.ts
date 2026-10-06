/** Resumo de um vídeo, como aparece em buscas e playlists. */
export interface VideoSummary {
  id: string;
  title: string;
  url: string;
  /** Duração em segundos. */
  duration?: number | undefined;
  channel?: string | undefined;
  thumbnail?: string | undefined;
}

export interface PlaylistItem extends VideoSummary {
  /** Posição na playlist original (começando em 1). */
  index: number;
}

export type ResolveResult =
  | { kind: "video"; video: VideoSummary }
  | {
      kind: "playlist";
      id: string;
      title: string;
      channel?: string | undefined;
      items: PlaylistItem[];
      /** Vídeos privados, removidos ou que não são faixas (ex.: sub-playlists). */
      unavailable: number;
    };

export type DownloadProgress =
  | {
      phase: "download";
      downloaded: number;
      total: number | null;
      /** Bytes por segundo. */
      speed: number | null;
      /** Segundos restantes. */
      eta: number | null;
    }
  | { phase: "convert" }
  | { phase: "tag" };

/** Campos do JSON do yt-dlp que o app usa. Todos podem vir nulos. */
export interface YtDlpInfo {
  _type?: string | null;
  ie_key?: string | null;
  id?: string | null;
  title?: string | null;
  url?: string | null;
  webpage_url?: string | null;
  duration?: number | null;
  channel?: string | null;
  uploader?: string | null;
  thumbnail?: string | null;
  thumbnails?: Array<{ url?: string | null }> | null;
  track?: string | null;
  artist?: string | null;
  artists?: string[] | null;
  creator?: string | null;
  album?: string | null;
  track_number?: number | null;
  release_year?: number | null;
  release_date?: string | null;
  entries?: YtDlpInfo[] | null;
}
