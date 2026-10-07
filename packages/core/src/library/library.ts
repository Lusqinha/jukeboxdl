import { execFile } from "node:child_process";
import { EventEmitter } from "node:events";
import { readdir, stat } from "node:fs/promises";
import { basename, dirname, extname, join, relative } from "node:path";
import { promisify } from "node:util";
import type { History, LibraryRow } from "../history/history";
import { debug } from "../log";

const execFileAsync = promisify(execFile);

export const AUDIO_EXTENSIONS = new Set([".mp3", ".opus", ".m4a", ".ogg", ".flac", ".wav", ".aac"]);
const PROBE_CONCURRENCY = 4;

export interface LibraryTrack {
  path: string;
  /** Pasta raiz de onde a faixa veio (pasta de música, pendrive…). */
  root: string;
  /** Pasta da faixa relativa à raiz ("" quando está na raiz). */
  folder: string;
  title: string;
  artist?: string | undefined;
  album?: string | undefined;
  track?: number | undefined;
  year?: number | undefined;
  /** Segundos. */
  duration?: number | undefined;
  youtubeId?: string | undefined;
}

export interface ScanProgress {
  scanned: number;
  total: number;
}

interface LibraryEvents {
  update: [];
  progress: [progress: ScanProgress];
}

function toTrack(row: LibraryRow): LibraryTrack {
  return {
    path: row.path,
    root: row.root,
    folder: relative(row.root, dirname(row.path)),
    title: row.title,
    artist: row.artist ?? undefined,
    album: row.album ?? undefined,
    track: row.track ?? undefined,
    year: row.year ?? undefined,
    duration: row.duration ?? undefined,
    youtubeId: row.youtube_id ?? undefined,
  };
}

/** Ordena por artista, álbum, número da faixa e título. */
export function compareTracks(a: LibraryTrack, b: LibraryTrack): number {
  const text = (x?: string) => (x ?? "").toLocaleLowerCase();
  return (
    text(a.artist).localeCompare(text(b.artist)) ||
    text(a.album).localeCompare(text(b.album)) ||
    (a.track ?? 0) - (b.track ?? 0) ||
    text(a.title).localeCompare(text(b.title))
  );
}

async function walk(dir: string, files: string[]): Promise<void> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await walk(path, files);
    else if (entry.isFile() && AUDIO_EXTENSIONS.has(extname(entry.name).toLowerCase()))
      files.push(path);
  }
}

interface Probe {
  format?: { duration?: string; tags?: Record<string, string> };
  streams?: Array<{ codec_type?: string; tags?: Record<string, string> }>;
}

/** Tags e duração de um arquivo de áudio. */
export async function probeAudio(
  ffprobe: string,
  file: string,
): Promise<{ tags: Record<string, string>; duration?: number | undefined }> {
  const { stdout } = await execFileAsync(ffprobe, [
    "-v",
    "error",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    file,
  ]);
  const probe = JSON.parse(stdout) as Probe;
  const audio = probe.streams?.find((stream) => stream.codec_type === "audio");
  const merged = { ...probe.format?.tags, ...audio?.tags };
  const tags = Object.fromEntries(
    Object.entries(merged).map(([key, value]) => [key.toLowerCase(), value]),
  );
  const duration = Number(probe.format?.duration);
  return { tags, duration: Number.isFinite(duration) ? duration : undefined };
}

/**
 * Faixas das pastas de música, lidas com o ffprobe e guardadas em cache no SQLite;
 * numa nova varredura só arquivos novos ou alterados são lidos de novo.
 */
export class Library extends EventEmitter<LibraryEvents> {
  private cache: LibraryTrack[];
  private scanning: Promise<void> | null = null;

  constructor(
    private readonly history: History,
    private readonly ffprobe: string,
  ) {
    super();
    this.cache = history.libraryRows().map(toTrack).sort(compareTracks);
  }

  get tracks(): LibraryTrack[] {
    return this.cache;
  }

  get isScanning(): boolean {
    return this.scanning !== null;
  }

  /** Varre as pastas (uma varredura por vez; chamadas durante uma varredura esperam por ela). */
  scan(roots: string[]): Promise<void> {
    this.scanning ??= this.runScan([...new Set(roots)]).finally(() => {
      this.scanning = null;
    });
    return this.scanning;
  }

  private async runScan(roots: string[]): Promise<void> {
    const known = new Map(this.history.libraryRows().map((row) => [row.path, row]));
    const found: Array<{ path: string; root: string }> = [];
    for (const root of roots) {
      const files: string[] = [];
      await walk(root, files);
      for (const path of files) found.push({ path, root });
    }

    const changed: LibraryRow[] = [];
    let scanned = 0;
    const queue = [...found];
    const worker = async () => {
      for (let item = queue.shift(); item; item = queue.shift()) {
        try {
          const info = await stat(item.path);
          const cached = known.get(item.path);
          if (
            !cached ||
            cached.mtime !== info.mtimeMs ||
            cached.size !== info.size ||
            cached.root !== item.root
          ) {
            const { tags, duration } = await probeAudio(this.ffprobe, item.path);
            const track = Number.parseInt(tags.track ?? "", 10);
            const year = Number.parseInt((tags.date ?? tags.year ?? "").slice(0, 4), 10);
            changed.push({
              path: item.path,
              root: item.root,
              mtime: info.mtimeMs,
              size: info.size,
              title: tags.title || basename(item.path, extname(item.path)),
              artist: tags.artist || null,
              album: tags.album || null,
              track: Number.isFinite(track) ? track : null,
              year: Number.isFinite(year) ? year : null,
              duration: duration ?? null,
              youtube_id: /youtu\.be\/([\w-]{11})/.exec(tags.comment ?? "")?.[1] ?? null,
            });
          }
        } catch (error) {
          debug(`biblioteca: falhou ao ler ${item.path}: ${String(error)}`);
        }
        scanned++;
        if (scanned % 10 === 0 || scanned === found.length)
          this.emit("progress", { scanned, total: found.length });
      }
    };
    await Promise.all(Array.from({ length: PROBE_CONCURRENCY }, worker));

    // Arquivos que sumiram das pastas varridas saem da biblioteca.
    const present = new Set(found.map((item) => item.path));
    const rootSet = new Set(roots);
    const missing = [...known.values()]
      .filter((row) => rootSet.has(row.root) && !present.has(row.path))
      .map((row) => row.path);
    if (changed.length > 0) this.history.libraryUpsert(changed);
    if (missing.length > 0) this.history.libraryRemove(missing);
    this.cache = this.history.libraryRows().map(toTrack).sort(compareTracks);
    this.emit("update");
  }
}

export interface TrackGroup {
  key: string;
  label: string;
  tracks: LibraryTrack[];
}

/** Agrupa por álbum, artista ou pasta. */
export function groupTracks(
  tracks: LibraryTrack[],
  by: "album" | "artist" | "folder",
): TrackGroup[] {
  const groups = new Map<string, TrackGroup>();
  for (const track of tracks) {
    const label =
      by === "album"
        ? track.album || "—"
        : by === "artist"
          ? track.artist?.split(/,| & | feat\.? /i)[0]?.trim() || "—"
          : join(basename(track.root), track.folder);
    const key = by === "folder" ? join(track.root, track.folder) : label.toLocaleLowerCase();
    let group = groups.get(key);
    if (!group) {
      group = { key, label, tracks: [] };
      groups.set(key, group);
    }
    group.tracks.push(track);
  }
  return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label));
}
