import type { VideoSummary } from "../ytdlp/types";

export const DURATION_FILTERS = ["any", "short", "long"] as const;
export type DurationFilter = (typeof DURATION_FILTERS)[number];

export interface SearchFilters {
  /** short: até 10 min · long: mais de 10 min. */
  duration: DurationFilter;
  /** Esconde versões ao vivo, lyrics, karaokê, covers, slowed/nightcore e afins. */
  hideVersions: boolean;
}

export const DEFAULT_FILTERS: SearchFilters = { duration: "any", hideVersions: false };

const LONG_SECONDS = 10 * 60;
const VERSION_WORDS =
  /\b(?:live|ao vivo|en vivo|lyrics?|letra|karaok[eê]|cover|8d audio|slowed|sped up|nightcore|reverb|1 hour|1 hora|10 hours)\b/i;

export function matchesFilters(video: VideoSummary, filters: SearchFilters): boolean {
  const { duration } = video;
  if (filters.duration === "short" && duration !== undefined && duration > LONG_SECONDS)
    return false;
  if (filters.duration === "long" && (duration === undefined || duration <= LONG_SECONDS))
    return false;
  if (filters.hideVersions && VERSION_WORDS.test(video.title)) return false;
  return true;
}

export function applyFilters(videos: VideoSummary[], filters: SearchFilters): VideoSummary[] {
  return videos.filter((video) => matchesFilters(video, filters));
}
