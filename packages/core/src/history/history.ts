import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";

export interface LibraryRow {
  path: string;
  root: string;
  mtime: number;
  size: number;
  title: string;
  artist: string | null;
  album: string | null;
  track: number | null;
  year: number | null;
  duration: number | null;
  youtube_id: string | null;
}

export interface HistoryEntry {
  videoId: string;
  path: string;
  title: string;
  artist?: string | undefined;
  album?: string | undefined;
  playlist?: string | undefined;
  /** ISO 8601. */
  downloadedAt: string;
}

interface Row {
  video_id: string;
  path: string;
  title: string;
  artist: string | null;
  album: string | null;
  playlist: string | null;
  downloaded_at: string;
}

const MIGRATIONS: string[] = [
  `CREATE TABLE downloads (
     id INTEGER PRIMARY KEY,
     video_id TEXT NOT NULL,
     path TEXT NOT NULL,
     title TEXT NOT NULL,
     artist TEXT,
     album TEXT,
     playlist TEXT,
     downloaded_at TEXT NOT NULL
   );
   CREATE INDEX downloads_video_id ON downloads (video_id);`,
  `CREATE TABLE queue (
     id TEXT PRIMARY KEY,
     request TEXT NOT NULL,
     position INTEGER NOT NULL
   );`,
  `CREATE TABLE library (
     path TEXT PRIMARY KEY,
     root TEXT NOT NULL,
     mtime REAL NOT NULL,
     size INTEGER NOT NULL,
     title TEXT NOT NULL,
     artist TEXT,
     album TEXT,
     track INTEGER,
     year INTEGER,
     duration REAL,
     youtube_id TEXT
   );
   CREATE INDEX library_root ON library (root);`,
];

function fromRow(row: Row): HistoryEntry {
  return {
    videoId: row.video_id,
    path: row.path,
    title: row.title,
    artist: row.artist ?? undefined,
    album: row.album ?? undefined,
    playlist: row.playlist ?? undefined,
    downloadedAt: row.downloaded_at,
  };
}

/** Registro dos downloads em SQLite, usado para pular faixas já baixadas. */
export class History {
  private readonly db: Database.Database;

  constructor(file: string) {
    if (file !== ":memory:") mkdirSync(dirname(file), { recursive: true });
    this.db = new Database(file);
    this.db.pragma("journal_mode = WAL");
    this.migrate();
  }

  private migrate(): void {
    const current = this.db.pragma("user_version", { simple: true }) as number;
    for (let version = current; version < MIGRATIONS.length; version++) {
      this.db.transaction(() => {
        this.db.exec(MIGRATIONS[version] ?? "");
        this.db.pragma(`user_version = ${version + 1}`);
      })();
    }
  }

  /** Download mais recente do vídeo. */
  find(videoId: string): HistoryEntry | undefined {
    const row = this.db
      .prepare<[string], Row>("SELECT * FROM downloads WHERE video_id = ? ORDER BY id DESC LIMIT 1")
      .get(videoId);
    return row && fromRow(row);
  }

  record(entry: Omit<HistoryEntry, "downloadedAt"> & { downloadedAt?: string }): void {
    this.db
      .prepare(
        `INSERT INTO downloads (video_id, path, title, artist, album, playlist, downloaded_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        entry.videoId,
        entry.path,
        entry.title,
        entry.artist ?? null,
        entry.album ?? null,
        entry.playlist ?? null,
        entry.downloadedAt ?? new Date().toISOString(),
      );
  }

  /** Lista do mais recente para o mais antigo, filtrando por título/artista/álbum. */
  list({
    limit = 50,
    offset = 0,
    search,
  }: {
    limit?: number;
    offset?: number;
    search?: string;
  } = {}): HistoryEntry[] {
    const filter = search ? `%${search.replace(/[%_\\]/g, "\\$&")}%` : null;
    const rows = this.db
      .prepare<[string | null, string | null, string | null, string | null, number, number], Row>(
        `SELECT * FROM downloads
         WHERE ? IS NULL OR title LIKE ? ESCAPE '\\' OR artist LIKE ? ESCAPE '\\' OR album LIKE ? ESCAPE '\\'
         ORDER BY id DESC LIMIT ? OFFSET ?`,
      )
      .all(filter, filter, filter, filter, limit, offset);
    return rows.map(fromRow);
  }

  remove(videoId: string): number {
    return this.db.prepare("DELETE FROM downloads WHERE video_id = ?").run(videoId).changes;
  }

  /** Guarda um download pendente, para retomar ao reabrir o app. */
  saveQueued(id: string, request: unknown): void {
    this.db
      .prepare("INSERT OR IGNORE INTO queue (id, request, position) VALUES (?, ?, ?)")
      .run(id, JSON.stringify(request), Date.now());
  }

  removeQueued(id: string): void {
    this.db.prepare("DELETE FROM queue WHERE id = ?").run(id);
  }

  /** Downloads pendentes de sessões anteriores, na ordem em que foram adicionados. */
  loadQueued<T>(): Array<{ id: string; request: T }> {
    const rows = this.db
      .prepare<[], { id: string; request: string }>(
        "SELECT id, request FROM queue ORDER BY position, rowid",
      )
      .all();
    return rows.map((row) => ({ id: row.id, request: JSON.parse(row.request) as T }));
  }

  /** Faixas da biblioteca (cache da varredura das pastas de música). */
  libraryRows(): LibraryRow[] {
    return this.db.prepare<[], LibraryRow>("SELECT * FROM library").all();
  }

  libraryUpsert(rows: LibraryRow[]): void {
    const insert = this.db.prepare(
      `INSERT OR REPLACE INTO library (path, root, mtime, size, title, artist, album, track, year, duration, youtube_id)
       VALUES (@path, @root, @mtime, @size, @title, @artist, @album, @track, @year, @duration, @youtube_id)`,
    );
    this.db.transaction((items: LibraryRow[]) => {
      for (const row of items) insert.run(row);
    })(rows);
  }

  libraryRemove(paths: string[]): void {
    const remove = this.db.prepare("DELETE FROM library WHERE path = ?");
    this.db.transaction((items: string[]) => {
      for (const path of items) remove.run(path);
    })(paths);
  }

  close(): void {
    this.db.close();
  }
}
