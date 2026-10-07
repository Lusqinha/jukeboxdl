import { debug } from "../log";
import { lookupRelease, normalize } from "../metadata/musicbrainz";

export const COVER_SOURCES = ["auto", "musicbrainz", "deezer", "itunes", "youtube"] as const;
export type CoverSource = (typeof COVER_SOURCES)[number];
type ApiSource = "musicbrainz" | "deezer" | "itunes";

export interface CoverQuery {
  title: string;
  artist?: string | undefined;
  album?: string | undefined;
}

export interface FoundCover {
  source: ApiSource;
  image: Buffer;
  url: string;
}

interface ProviderOptions {
  fetch: typeof fetch;
  signal?: AbortSignal | undefined;
}

const CAA = "https://coverartarchive.org";
const MIN_IMAGE_BYTES = 2000;

const withTimeout = (signal?: AbortSignal) => {
  const timeout = AbortSignal.timeout(10_000);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
};

/** Título e artista conferem com a busca (evita embutir a capa de outra música). */
export function sameTrack(query: CoverQuery, title: string, artist: string): boolean {
  const wantedTitle = normalize(query.title);
  const foundTitle = normalize(title);
  const titleOk = foundTitle === wantedTitle || foundTitle.startsWith(`${wantedTitle} `);
  if (!titleOk || !query.artist) return titleOk;
  const wantedArtist = normalize(query.artist.split(/,| & | feat\.? /i)[0] ?? query.artist);
  const foundArtist = normalize(artist);
  return foundArtist.includes(wantedArtist) || wantedArtist.includes(foundArtist);
}

async function musicbrainzUrls(
  query: CoverQuery,
  { fetch, signal }: ProviderOptions,
): Promise<string[]> {
  if (!query.artist) return [];
  const release = await lookupRelease(
    { title: query.title, artist: query.artist },
    { fetch, signal },
  );
  const urls: string[] = [];
  if (release?.id) urls.push(`${CAA}/release/${release.id}/front-500`);
  const group = release?.["release-group"]?.id;
  if (group) urls.push(`${CAA}/release-group/${group}/front-500`);
  return urls;
}

interface DeezerTrack {
  title?: string;
  artist?: { name?: string };
  album?: { cover_xl?: string };
}

async function deezerUrls(
  query: CoverQuery,
  { fetch, signal }: ProviderOptions,
): Promise<string[]> {
  const term = [query.artist, query.title].filter(Boolean).join(" ");
  const response = await fetch(
    `https://api.deezer.com/search?q=${encodeURIComponent(term)}&limit=10`,
    {
      signal: withTimeout(signal),
    },
  );
  if (!response.ok) return [];
  const data = (await response.json()) as { data?: DeezerTrack[] };
  const match = (data.data ?? []).find((track) =>
    sameTrack(query, track.title ?? "", track.artist?.name ?? ""),
  );
  return match?.album?.cover_xl ? [match.album.cover_xl] : [];
}

interface ItunesTrack {
  trackName?: string;
  artistName?: string;
  artworkUrl100?: string;
}

async function itunesUrls(
  query: CoverQuery,
  { fetch, signal }: ProviderOptions,
): Promise<string[]> {
  const term = [query.artist, query.title].filter(Boolean).join(" ");
  const response = await fetch(
    `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=song&limit=10`,
    { signal: withTimeout(signal) },
  );
  if (!response.ok) return [];
  const data = (await response.json()) as { results?: ItunesTrack[] };
  const match = (data.results ?? []).find((track) =>
    sameTrack(query, track.trackName ?? "", track.artistName ?? ""),
  );
  // A URL traz o tamanho no nome; trocar 100x100 pede a imagem grande.
  return match?.artworkUrl100
    ? [match.artworkUrl100.replace(/\/\d+x\d+bb\./, "/1000x1000bb.")]
    : [];
}

const PROVIDERS: Record<
  ApiSource,
  (query: CoverQuery, options: ProviderOptions) => Promise<string[]>
> = {
  musicbrainz: musicbrainzUrls,
  deezer: deezerUrls,
  itunes: itunesUrls,
};

/** Ordem de tentativa por fonte. "auto" não inclui o iTunes, cujos termos de uso são restritivos. */
export function providerOrder(source: CoverSource): ApiSource[] {
  if (source === "auto") return ["musicbrainz", "deezer"];
  if (source === "youtube") return [];
  return [source];
}

async function downloadImage(
  url: string,
  { fetch, signal }: ProviderOptions,
): Promise<Buffer | null> {
  const response = await fetch(url, { signal: withTimeout(signal) });
  if (!response.ok || !response.headers.get("content-type")?.startsWith("image/")) return null;
  const image = Buffer.from(await response.arrayBuffer());
  return image.length >= MIN_IMAGE_BYTES ? image : null;
}

/**
 * Procura a capa nas fontes configuradas, na ordem. Nunca lança erro: sem capa
 * confiável, devolve `null` e quem chamou usa a thumbnail do YouTube.
 */
export async function findCover(
  query: CoverQuery,
  source: CoverSource,
  {
    fetch: fetchImpl = fetch,
    signal,
  }: { fetch?: typeof fetch; signal?: AbortSignal | undefined } = {},
): Promise<FoundCover | null> {
  const options = { fetch: fetchImpl, signal };
  for (const provider of providerOrder(source)) {
    try {
      for (const url of await PROVIDERS[provider](query, options)) {
        const image = await downloadImage(url, options);
        if (image) {
          debug(`capa: ${provider} → ${url}`);
          return { source: provider, image, url };
        }
      }
    } catch (error) {
      if (signal?.aborted) throw error;
      debug(`capa: ${provider} falhou para "${query.title}": ${String(error)}`);
    }
  }
  return null;
}
