import {
  type Config,
  ConfigError,
  expandHome,
  FINISHED_STATUSES,
  type Job,
  type Jukebox,
  setConfigValue,
} from "@jukeboxdl/core";
import { Box, render, Static, Text, useApp, useInput, useStdin } from "ink";
import { useEffect, useRef, useState } from "react";
import { JobRow, JobSummary, summarize } from "../components/JobRow";
import { Spinner } from "../components/Spinner";
import { isUrl, parseItems } from "../lib/format";
import { fail, loadConfigOrFail, openJukebox } from "../lib/session";
import { useQueueJobs } from "../lib/use-queue";

export interface GetOptions {
  output?: string;
  template?: string;
  playlistTemplate?: string;
  bitrate?: string;
  concurrency?: string;
  items?: string;
  playlist: boolean;
  force?: boolean;
  cover: boolean;
}

type Line =
  | { key: string; kind: "log"; text: string; color?: string }
  | { key: string; kind: "job"; job: Job };

const MAX_VISIBLE_QUEUED = 3;

function GetApp({
  jukebox,
  inputs,
  options,
}: {
  jukebox: Jukebox;
  inputs: string[];
  options: GetOptions;
}) {
  const { exit } = useApp();
  const { isRawModeSupported } = useStdin();
  const jobs = useQueueJobs(jukebox.queue);
  const [resolving, setResolving] = useState<string | null>(null);
  const [resolved, setResolved] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const lines = useRef<Line[]>([]);
  const printed = useRef(new Set<string>());
  const [, forceRender] = useState(0);

  const log = (text: string, color?: string) => {
    lines.current = [
      ...lines.current,
      { key: `log${lines.current.length}`, kind: "log", text, ...(color && { color }) },
    ];
    forceRender((n) => n + 1);
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: roda uma única vez, ao montar
  useEffect(() => {
    const items = options.items ? parseItems(options.items) : undefined;
    (async () => {
      for (const input of inputs) {
        if (canceling) break;
        setResolving(input);
        try {
          if (!isUrl(input)) {
            const [video] = await jukebox.search(input, 1);
            if (!video) {
              log(`✖ Nada encontrado para "${input}"`, "red");
              continue;
            }
            log(`🔎 "${input}" → ${video.title}`);
            jukebox.enqueue([video]);
            continue;
          }
          const result = await jukebox.resolve(input, { noPlaylist: !options.playlist });
          if (result.kind === "video") {
            jukebox.enqueue([result.video]);
            continue;
          }
          let selected = result.items;
          if (items) selected = selected.filter((item) => items.has(item.index));
          const extra = result.unavailable
            ? ` (${result.unavailable} indisponíve${result.unavailable > 1 ? "is" : "l"})`
            : "";
          log(
            `▶ Playlist "${result.title}": ${selected.length} de ${result.items.length} faixas${extra}`,
            "cyan",
          );
          jukebox.enqueuePlaylist(result, selected);
        } catch (error) {
          log(`✖ ${input}: ${error instanceof Error ? error.message : String(error)}`, "red");
        }
      }
      setResolving(null);
      setResolved(true);
    })();
  }, []);

  useEffect(() => {
    if (resolved && jukebox.queue.isIdle) {
      const s = summarize(jobs);
      process.exitCode =
        s.failed > 0 ||
        (s.total === 0 && lines.current.some((l) => l.kind === "log" && l.color === "red"))
          ? 1
          : 0;
      setTimeout(() => exit(), 0);
    }
  }, [resolved, jobs, exit, jukebox]);

  useInput(
    (input, key) => {
      if (!(key.ctrl && input === "c")) return;
      if (canceling) {
        process.exitCode = 130;
        exit();
        return;
      }
      setCanceling(true);
      jukebox.queue.cancelAll();
    },
    { isActive: isRawModeSupported === true },
  );

  for (const job of jobs) {
    if (FINISHED_STATUSES.has(job.status) && !printed.current.has(job.id)) {
      printed.current.add(job.id);
      lines.current = [...lines.current, { key: job.id, kind: "job", job }];
    }
  }

  const outputDir = expandHome(jukebox.config.outputDir);
  const active = jobs.filter((j) => j.status !== "queued" && !FINISHED_STATUSES.has(j.status));
  const queued = jobs.filter((j) => j.status === "queued");

  return (
    <>
      <Static items={lines.current}>
        {(line) =>
          line.kind === "log" ? (
            <Text key={line.key} {...(line.color && { color: line.color })}>
              {line.text}
            </Text>
          ) : (
            <JobRow key={line.key} job={line.job} outputDir={outputDir} />
          )
        }
      </Static>
      <Box flexDirection="column">
        {active.map((job) => (
          <JobRow key={job.id} job={job} outputDir={outputDir} />
        ))}
        {queued.slice(0, MAX_VISIBLE_QUEUED).map((job) => (
          <JobRow key={job.id} job={job} />
        ))}
        {queued.length > MAX_VISIBLE_QUEUED && (
          <Text dimColor> … e mais {queued.length - MAX_VISIBLE_QUEUED} na fila</Text>
        )}
        {resolving && (
          <Text>
            <Spinner /> {isUrl(resolving) ? "Lendo" : "Buscando"} <Text dimColor>{resolving}</Text>
          </Text>
        )}
        {jobs.length > 0 && (
          <Box marginTop={1}>
            <JobSummary jobs={jobs} />
            {canceling && <Text color="yellow"> · cancelando (ctrl+c de novo para forçar)</Text>}
          </Box>
        )}
      </Box>
    </>
  );
}

function applyOverrides(config: Config, options: GetOptions): Config {
  const overrides: Array<[string, string | undefined]> = [
    ["outputDir", options.output],
    ["filenameTemplate", options.template],
    ["playlistTemplate", options.playlistTemplate ?? options.template],
    ["audio.bitrate", options.bitrate],
    ["concurrency", options.concurrency],
    ["skipDuplicates", options.force ? "false" : undefined],
    ["audio.embedCover", options.cover ? undefined : "false"],
  ];
  try {
    return overrides.reduce(
      (current, [key, value]) =>
        value === undefined ? current : setConfigValue(current, key, value),
      config,
    );
  } catch (error) {
    if (error instanceof ConfigError) fail(error.message);
    throw error;
  }
}

export async function getCommand(inputs: string[], options: GetOptions): Promise<void> {
  if (options.items) {
    try {
      parseItems(options.items);
    } catch (error) {
      fail((error as Error).message);
    }
  }
  const config = applyOverrides(await loadConfigOrFail(), options);
  const jukebox = await openJukebox(config);
  const app = render(<GetApp jukebox={jukebox} inputs={inputs} options={options} />, {
    exitOnCtrlC: false,
  });
  try {
    await app.waitUntilExit();
  } finally {
    await jukebox.close();
  }
}
