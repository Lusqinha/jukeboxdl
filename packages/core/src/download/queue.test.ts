import { describe, expect, it } from "vitest";
import type { Job, JobOutcome, JobWorker } from "./queue";
import { DownloadQueue } from "./queue";
import type { TrackRequest } from "./track";

const request = (id: string): TrackRequest => ({
  video: { id, title: id, url: `https://youtu.be/${id}` },
});

function deferred() {
  let resolve!: (outcome: JobOutcome) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<JobOutcome>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const done = (id: string): JobOutcome => ({
  kind: "done",
  result: { status: "downloaded", path: `/${id}.mp3`, metadata: { id, title: id } },
});

const tick = () => new Promise((resolve) => setImmediate(resolve));

describe("DownloadQueue", () => {
  it("respeita a concorrência", async () => {
    const pending = new Map<string, ReturnType<typeof deferred>>();
    let active = 0;
    let maxActive = 0;
    const worker: JobWorker = async (req) => {
      active++;
      maxActive = Math.max(maxActive, active);
      const d = deferred();
      pending.set(req.video.id, d);
      try {
        return await d.promise;
      } finally {
        active--;
      }
    };

    const queue = new DownloadQueue(worker, 2);
    queue.add(["a", "b", "c", "d"].map(request));
    await tick();
    expect([...pending.keys()]).toEqual(["a", "b"]);

    pending.get("a")?.resolve(done("a"));
    await tick();
    expect([...pending.keys()]).toEqual(["a", "b", "c"]);

    for (const id of ["b", "c"]) pending.get(id)?.resolve(done(id));
    await tick();
    pending.get("d")?.resolve(done("d"));
    await queue.onIdle();

    expect(maxActive).toBe(2);
    expect(queue.jobs.map((j) => j.status)).toEqual(["done", "done", "done", "done"]);
  });

  it("emite progresso por fase e resultado final", async () => {
    const worker: JobWorker = async (req, { onProgress }) => {
      onProgress({ phase: "download", downloaded: 50, total: 100, speed: 1000, eta: 3 });
      onProgress({ phase: "convert" });
      onProgress({ phase: "tag" });
      return done(req.video.id);
    };
    const queue = new DownloadQueue(worker);
    const updates: Job[] = [];
    queue.on("update", (job) => updates.push(job));
    queue.add([request("a")]);
    await queue.onIdle();

    expect(updates.map((j) => [j.status, j.progress])).toEqual([
      ["queued", 0],
      ["downloading", 0],
      ["downloading", 0.45],
      ["converting", 0.9],
      ["tagging", 0.95],
      ["done", 1],
    ]);
    expect(updates[2]).toMatchObject({ speed: 1000, eta: 3 });
    expect(updates.at(-1)?.path).toBe("/a.mp3");
    // Cada update é um objeto novo (necessário para o React re-renderizar).
    expect(new Set(updates).size).toBe(updates.length);
  });

  it("marca falhas e pulos sem parar a fila", async () => {
    const worker: JobWorker = async (req) => {
      if (req.video.id === "bad") throw new Error("Video unavailable");
      if (req.video.id === "dup") return { kind: "skipped", reason: "history", path: "/dup.mp3" };
      return done(req.video.id);
    };
    const queue = new DownloadQueue(worker, 1);
    queue.add(["bad", "dup", "ok"].map(request));
    await queue.onIdle();
    expect(queue.jobs.map((j) => [j.status, j.error ?? j.skipReason ?? null])).toEqual([
      ["failed", "Video unavailable"],
      ["skipped", "history"],
      ["done", null],
    ]);
  });

  it("cancela trabalhos pendentes e em andamento", async () => {
    const worker: JobWorker = (_req, { signal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("aborted")));
      });
    const queue = new DownloadQueue(worker, 1);
    const [running, waiting] = queue.add([request("a"), request("b")]);
    await tick();

    queue.cancel(waiting?.id ?? "");
    expect(queue.jobs[1]?.status).toBe("canceled");
    queue.cancel(running?.id ?? "");
    await queue.onIdle();
    expect(queue.jobs.map((j) => j.status)).toEqual(["canceled", "canceled"]);
  });

  it("limpa finalizados e resolve onIdle imediatamente quando vazia", async () => {
    const queue = new DownloadQueue(async (req) => done(req.video.id));
    await queue.onIdle();
    queue.add([request("a")]);
    await queue.onIdle();
    queue.clearFinished();
    expect(queue.jobs).toEqual([]);
  });
});
