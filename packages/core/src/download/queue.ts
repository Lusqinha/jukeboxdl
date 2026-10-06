import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import type { DownloadProgress } from "../ytdlp/types";
import type { TrackRequest, TrackResult } from "./track";

export type JobStatus =
  | "queued"
  | "downloading"
  | "converting"
  | "tagging"
  | "done"
  | "skipped"
  | "failed"
  | "canceled";

export type SkipReason = "history" | "exists";

export interface Job {
  id: string;
  request: TrackRequest;
  status: JobStatus;
  /** De 0 a 1. */
  progress: number;
  speed?: number | undefined;
  eta?: number | undefined;
  result?: TrackResult | undefined;
  skipReason?: SkipReason | undefined;
  /** Caminho do arquivo final (baixado ou já existente). */
  path?: string | undefined;
  error?: string | undefined;
}

export type JobOutcome =
  | { kind: "done"; result: TrackResult }
  | { kind: "skipped"; reason: SkipReason; path: string };

export type JobWorker = (
  request: TrackRequest,
  context: { signal: AbortSignal; onProgress: (progress: DownloadProgress) => void },
) => Promise<JobOutcome>;

export const FINISHED_STATUSES: ReadonlySet<JobStatus> = new Set([
  "done",
  "skipped",
  "failed",
  "canceled",
]);

interface QueueEvents {
  /** Disparado a cada mudança; o objeto `Job` é sempre uma nova referência. */
  update: [job: Job];
  /** A fila ficou sem trabalhos pendentes ou em andamento. */
  idle: [];
}

// O download ocupa 90% da barra; conversão e tags ficam com o resto.
const DOWNLOAD_SHARE = 0.9;

/** Fila de downloads com concorrência configurável e cancelamento por faixa. */
export class DownloadQueue extends EventEmitter<QueueEvents> {
  private readonly jobsById = new Map<string, Job>();
  private readonly pending: string[] = [];
  private readonly running = new Map<string, AbortController>();

  constructor(
    private readonly worker: JobWorker,
    private concurrency = 3,
  ) {
    super();
  }

  get jobs(): Job[] {
    return [...this.jobsById.values()];
  }

  get isIdle(): boolean {
    return this.running.size === 0 && this.pending.length === 0;
  }

  setConcurrency(concurrency: number): void {
    this.concurrency = Math.max(1, concurrency);
    this.pump();
  }

  add(requests: TrackRequest[]): Job[] {
    const added = requests.map((request) => {
      const job: Job = { id: randomUUID(), request, status: "queued", progress: 0 };
      this.jobsById.set(job.id, job);
      this.pending.push(job.id);
      this.emit("update", job);
      return job;
    });
    this.pump();
    return added;
  }

  cancel(id: string): void {
    const pendingIndex = this.pending.indexOf(id);
    if (pendingIndex !== -1) {
      this.pending.splice(pendingIndex, 1);
      this.update(id, { status: "canceled" });
      if (this.isIdle) this.emit("idle");
      return;
    }
    this.running.get(id)?.abort();
  }

  cancelAll(): void {
    for (const id of [...this.pending]) this.cancel(id);
    for (const controller of this.running.values()) controller.abort();
  }

  /** Recoloca na fila um trabalho que falhou ou foi cancelado. */
  retry(id: string): void {
    const job = this.jobsById.get(id);
    if (!job || (job.status !== "failed" && job.status !== "canceled")) return;
    this.update(id, {
      status: "queued",
      progress: 0,
      error: undefined,
      speed: undefined,
      eta: undefined,
    });
    this.pending.push(id);
    this.pump();
  }

  /** Remove da lista os trabalhos já finalizados. */
  clearFinished(): void {
    for (const job of this.jobsById.values()) {
      if (FINISHED_STATUSES.has(job.status)) this.jobsById.delete(job.id);
    }
  }

  onIdle(): Promise<void> {
    if (this.isIdle) return Promise.resolve();
    return new Promise((resolve) => this.once("idle", resolve));
  }

  private update(id: string, patch: Partial<Job>): void {
    const current = this.jobsById.get(id);
    if (!current) return;
    const job = { ...current, ...patch };
    this.jobsById.set(id, job);
    this.emit("update", job);
  }

  private pump(): void {
    while (this.running.size < this.concurrency && this.pending.length > 0) {
      const id = this.pending.shift();
      if (id) void this.run(id);
    }
  }

  private onProgress(id: string, progress: DownloadProgress): void {
    if (progress.phase === "convert") {
      this.update(id, {
        status: "converting",
        progress: DOWNLOAD_SHARE,
        speed: undefined,
        eta: undefined,
      });
    } else if (progress.phase === "tag") {
      this.update(id, { status: "tagging", progress: 0.95 });
    } else {
      const fraction = progress.total ? Math.min(progress.downloaded / progress.total, 1) : 0;
      this.update(id, {
        status: "downloading",
        progress: fraction * DOWNLOAD_SHARE,
        speed: progress.speed ?? undefined,
        eta: progress.eta ?? undefined,
      });
    }
  }

  private async run(id: string): Promise<void> {
    const job = this.jobsById.get(id);
    if (!job) return;
    const controller = new AbortController();
    this.running.set(id, controller);
    this.update(id, { status: "downloading" });

    try {
      const outcome = await this.worker(job.request, {
        signal: controller.signal,
        onProgress: (progress) => this.onProgress(id, progress),
      });
      if (outcome.kind === "skipped") {
        this.update(id, {
          status: "skipped",
          skipReason: outcome.reason,
          path: outcome.path,
          progress: 1,
        });
      } else {
        this.update(id, {
          status: "done",
          result: outcome.result,
          path: outcome.result.path,
          progress: 1,
        });
      }
    } catch (error) {
      if (controller.signal.aborted) {
        this.update(id, { status: "canceled" });
      } else {
        this.update(id, {
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    } finally {
      this.running.delete(id);
      this.pump();
      if (this.isIdle) this.emit("idle");
    }
  }
}
