/** @jsxImportSource @opentui/solid */
import { TextAttributes, type MouseEvent } from "@opentui/core";
import type { TuiPluginApi } from "@opencode-ai/plugin/tui";
import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { formatCompactDate, taskID } from "../format.ts";
import { onSchedulerChange } from "../scheduler-events.ts";
import { readStore } from "../store.ts";
import type { ScheduledPrompt } from "../types.ts";
import { SIDEBAR_MAX_JOBS, sortPending, TICK_MS } from "../scheduler.ts";
import { clickPrimary } from "./ui.ts";

export function SidebarScheduledPrompts(props: { api: TuiPluginApi; sessionID: string; onOpenManager: () => void }) {
  const theme = props.api.theme.current;
  const [jobs, setJobs] = createSignal<ScheduledPrompt[]>([]);
  const [paused, setPaused] = createSignal(false);
  const [expanded, setExpanded] = createSignal(true);

  const refresh = async () => {
    const store = await readStore();
    setJobs(
      store.jobs
        .filter((job) => job.status === "pending" && job.sessionID === props.sessionID)
        .sort(sortPending)
        .slice(0, SIDEBAR_MAX_JOBS),
    );
    setPaused(store.settings.paused);
  };

  onMount(() => {
    void refresh();
  });

  const timer = setInterval(() => {
    void refresh();
  }, TICK_MS);
  const disposeSchedulerChange = onSchedulerChange(() => {
    void refresh();
  });

  onCleanup(() => {
    clearInterval(timer);
    disposeSchedulerChange();
  });

  return (
    <box flexDirection="column" gap={0} paddingTop={1} paddingBottom={1}>
      <box
        flexDirection="row"
        gap={1}
        alignItems="center"
        onMouseDown={(event: MouseEvent) => {
          if (clickPrimary(event)) {
            setExpanded((value) => !value);
          }
        }}
      >
        <text fg={theme.text}>{expanded() ? "▼" : "▶"}</text>
        <text fg={theme.text} attributes={TextAttributes.BOLD}>
          Scheduled
        </text>
        <Show when={paused()}>
          <text fg={theme.warning}>paused</text>
        </Show>
      </box>

      <Show when={expanded()}>
        <Show when={jobs().length > 0} fallback={<text fg={theme.textMuted}>  none</text>}>
          <scrollbox maxHeight={SIDEBAR_MAX_JOBS}>
            <box flexDirection="column" gap={0}>
              <For each={jobs()}>
                {(job) => (
                  <box
                    flexDirection="row"
                    gap={1}
                    onMouseDown={(event: MouseEvent) => {
                      if (clickPrimary(event)) {
                        props.onOpenManager();
                      }
                    }}
                  >
                    <text fg={theme.primary}>{`  ${taskID(job)}`}</text>
                    <text fg={theme.textMuted}>{formatCompactDate(job.runAt)}</text>
                  </box>
                )}
              </For>
            </box>
          </scrollbox>
        </Show>
      </Show>
    </box>
  );
}
