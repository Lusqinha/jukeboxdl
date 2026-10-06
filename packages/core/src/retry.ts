/** Espera `ms`, interrompendo se o sinal for abortado. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

const TRANSIENT =
  /HTTP Error (?:429|5\d\d)|timed? ?out|Temporary failure|Connection (?:reset|refused|aborted)|IncompleteRead|ECONNRESET|ETIMEDOUT|EAI_AGAIN|Unable to download (?:webpage|API page|video data)|Got error|fragment/i;

/** Erros de rede ou de limite de requisições, que costumam passar numa nova tentativa. */
export function isTransientError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return TRANSIENT.test(message);
}
