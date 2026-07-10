/** @jsxImportSource @opentui/solid */
import { TextAttributes, type KeyEvent, type MouseEvent, type Renderable } from "@opentui/core";
import { useKeyboard, useTerminalDimensions } from "@opentui/solid";
import type { TuiPluginApi } from "@opencode-ai/plugin/tui";
import { createEffect, createSignal, For, onCleanup, Show } from "solid-js";
import { SCHEDULE_COMMAND_OPEN } from "../constants.ts";
import { formatCompactDate, taskID } from "../format.ts";
import type { ScheduledPrompt } from "../types.ts";
import { clickPrimary } from "./ui.ts";

export interface SchedulerManagerDialogProps {
  api: TuiPluginApi;
  initialJobs: ScheduledPrompt[];
  initialPaused: boolean;
  loadJobs: () => Promise<{ jobs: ScheduledPrompt[]; paused: boolean }>;
  onAdd: () => void;
  onCancel: (job: ScheduledPrompt) => void;
  onTogglePause: () => Promise<boolean>;
}

export function SchedulerManagerDialog(props: SchedulerManagerDialogProps) {
  const theme = props.api.theme.current;
  const dimensions = useTerminalDimensions();
  const [jobs, setJobs] = createSignal(props.initialJobs);
  const [paused, setPaused] = createSignal(props.initialPaused);
  const [selectedIndex, setSelectedIndex] = createSignal(0);
  const [busy, setBusy] = createSignal(false);
  const [hoveredAction, setHoveredAction] = createSignal<string | undefined>();
  const handledKeys = new WeakSet<KeyEvent>();
  let root: Renderable | undefined;

  const selected = () => jobs()[selectedIndex()];

  const moveSelection = (direction: number) => {
    setSelectedIndex((current) => Math.max(0, Math.min(current + direction, Math.max(0, jobs().length - 1))));
  };

  const loadCurrentJobs = async () => {
    const state = await props.loadJobs();
    setJobs(state.jobs);
    setPaused(state.paused);
    setSelectedIndex((current) => Math.max(0, Math.min(current, Math.max(0, state.jobs.length - 1))));
  };

  const addPrompt = () => {
    if (!busy()) {
      props.onAdd();
    }
  };

  const toggleDialogPause = () => {
    if (busy()) {
      return;
    }

    setBusy(true);
    void props
      .onTogglePause()
      .then((nextPaused) => setPaused(nextPaused))
      .finally(() => setBusy(false));
  };

  const cancelSelected = () => {
    const job = selected();
    if (job && !busy()) {
      props.onCancel(job);
    }
  };

  void loadCurrentJobs();
  setTimeout(() => {
    if (!root || root.isDestroyed) {
      return;
    }

    root.focus();
  }, 25);

  createEffect(() => {
    props.api.ui.dialog.setSize(dimensions().width >= 120 ? "large" : "medium");
  });

  const handleKeyDown = (event: KeyEvent) => {
    if (handledKeys.has(event) || event.eventType !== "press" || busy()) {
      return;
    }

    const key = event.name.toLowerCase();

    if (!event.ctrl && !event.meta && !event.option && key === "a") {
      if (event.repeated) {
        return;
      }

      handledKeys.add(event);
      event.preventDefault();
      event.stopPropagation();
      addPrompt();
      return;
    }

    if (!event.ctrl && !event.meta && !event.option && key === "p") {
      if (event.repeated) {
        return;
      }

      handledKeys.add(event);
      event.preventDefault();
      event.stopPropagation();
      toggleDialogPause();
      return;
    }

    if (event.ctrl && key === "d") {
      if (event.repeated) {
        return;
      }

      handledKeys.add(event);
      event.preventDefault();
      event.stopPropagation();
      cancelSelected();
      return;
    }

    if (event.defaultPrevented) {
      return;
    }

    if (key === "down" || key === "arrowdown") {
      handledKeys.add(event);
      event.preventDefault();
      event.stopPropagation();
      moveSelection(1);
      return;
    }

    if (key === "up" || key === "arrowup") {
      handledKeys.add(event);
      event.preventDefault();
      event.stopPropagation();
      moveSelection(-1);
      return;
    }

    if (key === "return" || key === "enter") {
      if (event.repeated) {
        return;
      }

      handledKeys.add(event);
      event.preventDefault();
      event.stopPropagation();
      cancelSelected();
    }
  };

  const disposeKeybinds = props.api.keymap.registerLayer({
    priority: 10,
    commands: [
      {
        name: "dialog.select.prev",
        title: "Previous scheduled prompt",
        category: "Dialog",
        run: () => moveSelection(-1),
      },
      {
        name: "dialog.select.next",
        title: "Next scheduled prompt",
        category: "Dialog",
        run: () => moveSelection(1),
      },
      {
        name: "dialog.select.submit",
        title: "Cancel scheduled prompt",
        category: "Dialog",
        run: cancelSelected,
      },
      {
        name: `${SCHEDULE_COMMAND_OPEN}.add`,
        title: "Add scheduled prompt",
        category: "Dialog",
        run: addPrompt,
      },
      {
        name: `${SCHEDULE_COMMAND_OPEN}.pause`,
        title: "Pause scheduled prompts",
        category: "Dialog",
        run: toggleDialogPause,
      },
      {
        name: `${SCHEDULE_COMMAND_OPEN}.delete`,
        title: "Cancel scheduled prompt",
        category: "Dialog",
        run: cancelSelected,
      },
    ],
    bindings: [
      ...props.api.tuiConfig.keybinds.gather("dialog.select", [
        "dialog.select.prev",
        "dialog.select.next",
        "dialog.select.submit",
      ]),
      { key: "a", cmd: `${SCHEDULE_COMMAND_OPEN}.add`, desc: "Add scheduled prompt" },
      { key: "p", cmd: `${SCHEDULE_COMMAND_OPEN}.pause`, desc: "Pause scheduled prompts" },
      { key: "ctrl+d", cmd: `${SCHEDULE_COMMAND_OPEN}.delete`, desc: "Cancel scheduled prompt" },
    ],
  });
  onCleanup(disposeKeybinds);

  useKeyboard(handleKeyDown);

  return (
    <box width="100%" flexDirection="column" gap={0} focusable focused onKeyDown={handleKeyDown} ref={(value) => (root = value)}>
      <box paddingLeft={4} paddingRight={4} paddingBottom={1} flexDirection="column" gap={1}>
        <box flexDirection="row" justifyContent="space-between">
          <box flexDirection="column" gap={0}>
            <text fg={theme.text} attributes={TextAttributes.BOLD}>
              Scheduled Prompts
            </text>
            <text fg={theme.textMuted}>enter cancel · a add · p {paused() ? "resume" : "pause"}</text>
          </box>
          <box flexDirection="row" gap={2}>
            <text
              fg={hoveredAction() === "add" ? theme.text : theme.primary}
              onMouseOver={() => setHoveredAction("add")}
              onMouseOut={() => setHoveredAction(undefined)}
              onMouseUp={(event: MouseEvent) => {
                if (clickPrimary(event)) {
                  addPrompt();
                }
              }}
            >
              add
            </text>
            <text
              fg={hoveredAction() === "pause" ? theme.text : paused() ? theme.success : theme.warning}
              onMouseOver={() => setHoveredAction("pause")}
              onMouseOut={() => setHoveredAction(undefined)}
              onMouseUp={(event: MouseEvent) => {
                if (clickPrimary(event)) {
                  toggleDialogPause();
                }
              }}
            >
              {paused() ? "resume" : "pause"}
            </text>
            <text
              fg={hoveredAction() === "esc" ? theme.text : theme.textMuted}
              onMouseOver={() => setHoveredAction("esc")}
              onMouseOut={() => setHoveredAction(undefined)}
              onMouseUp={() => props.api.ui.dialog.clear()}
            >
              esc
            </text>
          </box>
        </box>

        <Show when={busy()}>
          <text fg={theme.warning}>Working...</text>
        </Show>
      </box>

      <scrollbox paddingLeft={4} paddingRight={4} maxHeight={Math.max(10, Math.floor(dimensions().height * 0.45))}>
        <Show
          when={jobs().length > 0}
          fallback={
            <box width="100%" paddingTop={2} paddingBottom={2} flexDirection="row" justifyContent="center">
              <text fg={theme.textMuted}>No scheduled prompts</text>
            </box>
          }
        >
          <box flexDirection="column" gap={1}>
            <For each={jobs()}>
              {(job, index) => {
                const isSelected = () => index() === selectedIndex();
                const cardBackground = () => (isSelected() ? theme.backgroundElement : theme.backgroundPanel);
                return (
                  <box
                    paddingLeft={0}
                    paddingRight={0}
                    paddingTop={0}
                    paddingBottom={0}
                    flexDirection="row"
                    onMouseMove={() => setSelectedIndex(index())}
                    onMouseOver={() => setSelectedIndex(index())}
                    onMouseDown={(event: MouseEvent) => {
                      if (clickPrimary(event)) {
                        setSelectedIndex(index());
                      }
                    }}
                    onMouseUp={(event: MouseEvent) => {
                      if (clickPrimary(event)) {
                        setSelectedIndex(index());
                        props.onCancel(job);
                      }
                    }}
                  >
                    <box width={1} backgroundColor={isSelected() ? theme.primary : theme.borderSubtle} />
                    <box
                      paddingLeft={2}
                      paddingRight={2}
                      paddingTop={1}
                      paddingBottom={1}
                      flexDirection="row"
                      justifyContent="space-between"
                      alignItems="center"
                      flexGrow={1}
                      backgroundColor={cardBackground()}
                    >
                      <text fg={isSelected() ? theme.text : theme.textMuted}>{taskID(job)}</text>
                      <box flexDirection="row" gap={2}>
                        <text fg={isSelected() ? theme.text : theme.textMuted}>{formatCompactDate(job.runAt)}</text>
                        <text
                          fg={hoveredAction() === `delete:${job.id}` ? theme.text : theme.textMuted}
                          onMouseOver={() => setHoveredAction(`delete:${job.id}`)}
                          onMouseOut={() => setHoveredAction(undefined)}
                          onMouseUp={(event: MouseEvent) => {
                            if (clickPrimary(event)) {
                              setSelectedIndex(index());
                              props.onCancel(job);
                            }
                          }}
                        >
                          cancel
                        </text>
                      </box>
                    </box>
                  </box>
                );
              }}
            </For>
          </box>
        </Show>
      </scrollbox>
    </box>
  );
}
