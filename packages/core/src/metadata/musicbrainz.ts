import { debug } from "../log";
import type { TrackMetadata } from "../metadata";
import { sleep } from "../retry";

const API = "https://musicbrainz.org/ws/2/recording";
const USER_AGENT = "jukeboxdl/0.1 (personal music downloader)";
/** A API pede no máximo 1 requisição por segundo. */
const MIN_INTERVAL_MS = 1100;
const MIN_SCORE = 90;

let queue: Promise<unknown> = Promise.resolve();
let lastRequest = 0;

/** Serializa as chamadas respeitando o limite de taxa. */
function rateLimited<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = lastRequest + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequest = Date.now();
    return task();
  });
  queue = run.catch(() => undefined);
  return run;
}

const escapeLucene = (text: string) => text.replace(/([+\-&|!(){}[\]^"~*?:\\/])/g, "\\$1");
export const normalize = (text: string) =>
  text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

export interface MbRelease {
  id?: string;
  title?: string;
  status?: string;
  date?: string;
  "release-group"?: { id?: string; "primary-type"?: string; "secondary-types"?: string[] };
  media?: Array<{ track?: Array<{ number?: string }> }>;
}

interface MbRecording {
  score?: number;
  title?: string;
  "artist-credit"?: Array<{ name?: string }>;
  releases?: MbRelease[];
}

/** Escolhe o lançamento mais "canônico": álbum oficial de estúdio, o mais antigo. */
export function pickRelease(releases: MbRelease[]): MbRelease | undefined {
  const rank = (release: MbRelease) => {
    const group = release["release-group"];
    let score = 0;
    if (release.status === "Official") score += 4;
    if (group?.["primary-type"] === "Album") score += 2;
    if (!group?.["secondary-types"]?.length) score += 1;
    return score;
  };
  return [...releases].sort(
    (a, b) => rank(b) - rank(a) || (a.date ?? "9999").localeCompare(b.date ?? "9999"),
  )[0];
}

export function matchRecording(
  recordings: MbRecording[],
  title: string,
  artist: string,
): MbRecording | undefined {
  const wantedTitle = normalize(title);
  const wantedArtist = normalize(artist);
  return recordings.find((recording) => {
    if ((recording.score ?? 0) < MIN_SCORE) return false;
    if (normalize(recording.title ?? "") !== wantedTitle) return false;
    const credits = normalize(
      (recording["artist-credit"] ?? []).map((c) => c.name ?? "").join(" "),
    );
    return credits.includes(wantedArtist) || wantedArtist.includes(credits);
  });
}

export interface MbLookupOptions {
  fetch?: typeof fetch;
  signal?: AbortSignal | undefined;
}

/** Primeiro artista de créditos como "A, B" ou "A feat. B". */
const mainArtist = (artist: string) => artist.split(/,| & | feat\.? /i)[0]?.trim() || artist;

/** Lançamento mais provável para a faixa, ou `undefined` sem resposta confiável. */
export async function lookupRelease(
  { title, artist }: { title: string; artist: string },
  { fetch: fetchImpl = fetch, signal }: MbLookupOptions = {},
): Promise<MbRelease | undefined> {
  const primary = mainArtist(artist);
  const query = `recording:"${escapeLucene(title)}" AND artist:"${escapeLucene(primary)}"`;
  const url = `${API}?query=${encodeURIComponent(query)}&fmt=json&limit=5`;
  const timeout = AbortSignal.timeout(8000);
  const response = await rateLimited(() =>
    fetchImpl(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    }),
  );
  if (!response.ok) return undefined;
  const data = (await response.json()) as { recordings?: MbRecording[] };
  const recording = matchRecording(data.recordings ?? [], title, primary);
  return recording && pickRelease(recording.releases ?? []);
}

/**
 * Completa álbum, ano e número da faixa pelo MusicBrainz. Só preenche campos vazios e
 * nunca falha: sem resposta confiável, devolve os metadados como estavam.
 */
export async function enrichFromMusicBrainz(
  metadata: TrackMetadata,
  options: MbLookupOptions = {},
): Promise<TrackMetadata> {
  if (!metadata.artist || (metadata.album && metadata.year && metadata.track)) return metadata;
  try {
    const release = await lookupRelease(
      { title: metadata.title, artist: metadata.artist },
      options,
    );
    if (!release) return metadata;
    const trackNumber = Number(release.media?.[0]?.track?.[0]?.number);
    debug(`musicbrainz: "${metadata.title}" → ${release.title} (${release.date ?? "?"})`);
    return {
      ...metadata,
      album: metadata.album ?? release.title,
      year: metadata.year ?? (Number(release.date?.slice(0, 4)) || undefined),
      track:
        metadata.track ??
        (Number.isInteger(trackNumber) && trackNumber > 0 ? trackNumber : undefined),
    };
  } catch (error) {
    debug(`musicbrainz: falhou para "${metadata.title}": ${String(error)}`);
    return metadata;
  }
}
