import type {
  DownloadProgress,
  PlaylistItem,
  ResolveResult,
  VideoSummary,
  YtDlpInfo,
} from "./types";

const UNAVAILABLE_TITLES = new Set(["[Private video]", "[Deleted video]", "[Unavailable video]"]);
const VIDEO_ID = /^[\w-]{11}$/;

function text(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/** Converte uma entrada do yt-dlp em `VideoSummary`, ou `null` se não for um vídeo disponível. */
export function toVideoSummary(entry: YtDlpInfo): VideoSummary | null {
  const id = text(entry.id);
  const title = text(entry.title);
  if (!id || !title || !VIDEO_ID.test(id) || UNAVAILABLE_TITLES.has(title)) return null;
  if (entry._type === "playlist" || (entry.ie_key && entry.ie_key !== "Youtube")) return null;

  const url = text(entry.webpage_url) ?? text(entry.url);
  return {
    id,
    title,
    url: url?.startsWith("http") ? url : `https://www.youtube.com/watch?v=${id}`,
    duration: entry.duration ?? undefined,
    channel: text(entry.channel) ?? text(entry.uploader),
    thumbnail: text(entry.thumbnail) ?? text(entry.thumbnails?.at(-1)?.url),
  };
}

export function parseSearchResult(json: YtDlpInfo): VideoSummary[] {
  return (json.entries ?? []).flatMap((entry) => toVideoSummary(entry) ?? []);
}

export function parseResolveResult(json: YtDlpInfo): ResolveResult | null {
  if (json._type !== "playlist") {
    const video = toVideoSummary(json);
    return video ? { kind: "video", video } : null;
  }

  const entries = json.entries ?? [];
  const items: PlaylistItem[] = [];
  entries.forEach((entry, i) => {
    const video = toVideoSummary(entry);
    if (video) items.push({ ...video, index: i + 1 });
  });

  return {
    kind: "playlist",
    id: text(json.id) ?? "",
    title: text(json.title) ?? "Playlist",
    channel: text(json.channel) ?? text(json.uploader),
    items,
    unavailable: entries.length - items.length,
  };
}

export const PROGRESS_PREFIX = "[jukeboxdl]";

/** Interpreta uma linha de saída do download do yt-dlp. */
export function parseProgressLine(line: string): DownloadProgress | null {
  if (line.startsWith(PROGRESS_PREFIX)) {
    try {
      const data = JSON.parse(line.slice(PROGRESS_PREFIX.length)) as Record<string, unknown>;
      const num = (key: string) => (typeof data[key] === "number" ? (data[key] as number) : null);
      return {
        phase: "download",
        downloaded: num("downloaded_bytes") ?? 0,
        total: num("total_bytes") ?? num("total_bytes_estimate"),
        speed: num("speed"),
        eta: num("eta"),
      };
    } catch {
      return null;
    }
  }
  if (/^\[(?:ExtractAudio|SponsorBlock|ModifyChapters|SplitChapters)\]/.test(line))
    return { phase: "convert" };
  return null;
}

/** Extrai a mensagem de erro mais útil do stderr do yt-dlp. */
export function extractError(stderr: string): string | undefined {
  const lines = stderr.split(/\r?\n/);
  const error = lines.findLast((line) => line.startsWith("ERROR:"));
  return error?.slice("ERROR:".length).trim() ?? text(lines.findLast((line) => line.trim()));
}
