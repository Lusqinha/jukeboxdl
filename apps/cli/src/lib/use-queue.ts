import type { DownloadQueue, Job } from "@jukeboxdl/core";
import { useEffect, useState } from "react";

/** Lista de jobs da fila, atualizada no máximo a cada `interval` ms. */
export function useQueueJobs(queue: DownloadQueue | undefined, interval = 100): Job[] {
  const [jobs, setJobs] = useState<Job[]>(() => queue?.jobs ?? []);

  useEffect(() => {
    if (!queue) return;
    let timer: NodeJS.Timeout | undefined;
    const flush = () => {
      timer = undefined;
      setJobs(queue.jobs);
    };
    const onUpdate = () => {
      timer ??= setTimeout(flush, interval);
    };
    queue.on("update", onUpdate);
    flush();
    return () => {
      queue.off("update", onUpdate);
      if (timer) clearTimeout(timer);
    };
  }, [queue, interval]);

  return jobs;
}
