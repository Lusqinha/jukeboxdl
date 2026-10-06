import type { Job } from "@jukeboxdl/core";
import { Box, Text } from "ink";
import { formatBytes, formatDuration } from "../lib/format";
import { ProgressBar } from "./ProgressBar";
import { Spinner } from "./Spinner";

const STATUS_LABEL: Partial<Record<Job["status"], string>> = {
  converting: "convertendo",
  tagging: "gravando tags",
};

export function jobTitle(job: Job): string {
  const meta = job.result?.metadata;
  if (meta) return meta.artist ? `${meta.artist} - ${meta.title}` : meta.title;
  return job.request.video.title;
}

export function JobRow({
  job,
  selected = false,
  outputDir,
}: {
  job: Job;
  selected?: boolean;
  outputDir?: string;
}) {
  const title = (
    <Box flexGrow={1} flexShrink={1} minWidth={10}>
      <Text wrap="truncate-end" bold={selected}>
        {job.request.index !== undefined && (
          <Text dimColor>{String(job.request.index).padStart(3)} </Text>
        )}
        {jobTitle(job)}
      </Text>
    </Box>
  );
  const pointer = (
    <Box width={2} flexShrink={0}>
      <Text color="cyan">{selected ? "❯" : " "}</Text>
    </Box>
  );
  const path =
    job.path && outputDir && job.path.startsWith(outputDir)
      ? job.path.slice(outputDir.length + 1)
      : job.path;

  let icon: React.ReactNode;
  let detail: React.ReactNode;
  switch (job.status) {
    case "queued":
      icon = <Text dimColor>·</Text>;
      detail = <Text dimColor>na fila</Text>;
      break;
    case "downloading":
    case "converting":
    case "tagging":
      icon = <Spinner />;
      detail = (
        <Text>
          <ProgressBar value={job.progress} width={16} />{" "}
          {String(Math.round(job.progress * 100)).padStart(3)}%{" "}
          <Text dimColor>
            {STATUS_LABEL[job.status] ??
              [
                job.speed ? `${formatBytes(job.speed)}/s` : "",
                job.eta !== undefined ? formatDuration(job.eta) : "",
              ]
                .filter(Boolean)
                .join(" ")}
          </Text>
        </Text>
      );
      break;
    case "done":
      icon = <Text color="green">✔</Text>;
      detail = (
        <Text dimColor wrap="truncate-start">
          {path}
        </Text>
      );
      break;
    case "skipped":
      icon = <Text color="yellow">↷</Text>;
      detail = (
        <Text dimColor>{job.skipReason === "history" ? "já baixada" : "arquivo já existe"}</Text>
      );
      break;
    case "failed":
      icon = <Text color="red">✖</Text>;
      detail = (
        <Text color="red" wrap="truncate-end">
          {job.error}
        </Text>
      );
      break;
    case "canceled":
      icon = <Text dimColor>⊘</Text>;
      detail = <Text dimColor>cancelada</Text>;
      break;
  }

  return (
    <Box>
      {pointer}
      <Box width={2} flexShrink={0}>
        {icon}
      </Box>
      {title}
      <Box marginLeft={2} flexShrink={0} maxWidth="55%">
        {detail}
      </Box>
    </Box>
  );
}

export function summarize(jobs: Job[]) {
  const count = (...statuses: Job["status"][]) =>
    jobs.filter((j) => statuses.includes(j.status)).length;
  return {
    total: jobs.length,
    active: count("downloading", "converting", "tagging"),
    queued: count("queued"),
    done: count("done"),
    skipped: count("skipped"),
    failed: count("failed"),
    canceled: count("canceled"),
  };
}

export function JobSummary({ jobs }: { jobs: Job[] }) {
  const s = summarize(jobs);
  const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? "s" : ""}`;
  const parts: Array<[string, string, string | undefined]> = [];
  if (s.active) parts.push(["a", `${s.active} baixando`, "cyan"]);
  if (s.queued) parts.push(["q", `${s.queued} na fila`, undefined]);
  if (s.done) parts.push(["d", plural(s.done, "concluída"), "green"]);
  if (s.skipped) parts.push(["s", plural(s.skipped, "pulada"), "yellow"]);
  if (s.failed) parts.push(["f", plural(s.failed, "falha"), "red"]);
  if (s.canceled) parts.push(["c", plural(s.canceled, "cancelada"), "gray"]);
  if (parts.length === 0) return <Text dimColor>nenhum download</Text>;
  return (
    <Text>
      {parts.map(([key, label, color], i) => (
        <Text key={key}>
          {i > 0 && <Text dimColor> · </Text>}
          <Text {...(color && { color })}>{label}</Text>
        </Text>
      ))}
    </Text>
  );
}
