import type { Job } from "@jukeboxdl/core";
import { Box, Text, useWindowSize } from "ink";
import { displayText, formatBytes, formatDuration } from "../lib/format";
import { t } from "../lib/i18n";
import { useTheme } from "../tui/theme";
import { ProgressBar } from "./ProgressBar";
import { Spinner } from "./Spinner";

const STATUS_LABEL: Partial<Record<Job["status"], () => string>> = {
  converting: () => t("job.converting"),
  tagging: () => t("job.tagging"),
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
  const theme = useTheme();
  const title = (
    <Box flexGrow={1} flexShrink={1} minWidth={10}>
      <Text wrap="truncate-end" bold={selected}>
        {job.request.index !== undefined && (
          <Text color={theme.muted}>{String(job.request.index).padStart(3)} </Text>
        )}
        {displayText(jobTitle(job))}
      </Text>
    </Box>
  );
  const { columns } = useWindowSize();
  const pointer = (
    <Box width={2} flexShrink={0}>
      <Text color={theme.link}>{selected ? "❯" : " "}</Text>
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
      icon = <Text color={theme.muted}>·</Text>;
      detail = <Text color={theme.muted}>{t("job.queued")}</Text>;
      break;
    case "downloading":
    case "converting":
    case "tagging":
      icon = <Spinner />;
      detail = (
        <Text>
          <ProgressBar value={job.progress} width={16} />{" "}
          {String(Math.round(job.progress * 100)).padStart(3)}%{" "}
          <Text color={theme.meta}>
            {STATUS_LABEL[job.status]?.() ??
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
      icon = <Text color={theme.success}>✔</Text>;
      detail = (
        <Text color={theme.meta} wrap="truncate-start">
          {path}
        </Text>
      );
      break;
    case "skipped":
      icon = <Text color={theme.warning}>↷</Text>;
      detail = (
        <Text color={theme.muted}>
          {job.skipReason === "history" ? t("job.skippedHistory") : t("job.skippedExists")}
        </Text>
      );
      break;
    case "failed":
      icon = <Text color={theme.danger}>✖</Text>;
      detail = (
        <Text color={theme.danger} wrap="truncate-end">
          {job.error}
        </Text>
      );
      break;
    case "canceled":
      icon = <Text color={theme.muted}>⊘</Text>;
      detail = <Text color={theme.muted}>{t("job.canceled")}</Text>;
      break;
  }

  return (
    <Box>
      {pointer}
      <Box width={2} flexShrink={0}>
        {icon}
      </Box>
      {title}
      <Box marginLeft={2} flexShrink={0} maxWidth={Math.max(20, Math.floor(columns * 0.55))}>
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
  const theme = useTheme();
  const s = summarize(jobs);
  const parts: Array<[string, string, string | undefined]> = [];
  if (s.active) parts.push(["a", t("summary.active", { n: s.active }), theme.link]);
  if (s.queued) parts.push(["q", t("summary.queued", { n: s.queued }), undefined]);
  if (s.done) parts.push(["d", t("summary.done", { n: s.done }), theme.success]);
  if (s.skipped) parts.push(["s", t("summary.skipped", { n: s.skipped }), theme.warning]);
  if (s.failed) parts.push(["f", t("summary.failed", { n: s.failed }), theme.danger]);
  if (s.canceled) parts.push(["c", t("summary.canceled", { n: s.canceled }), theme.muted]);
  if (parts.length === 0) return <Text color={theme.muted}>{t("summary.none")}</Text>;
  return (
    <Text>
      {parts.map(([key, label, color], i) => (
        <Text key={key}>
          {i > 0 && <Text color={theme.muted}> · </Text>}
          <Text {...(color && { color })}>{label}</Text>
        </Text>
      ))}
    </Text>
  );
}
