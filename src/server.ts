import { tool, type Hooks, type PluginInput, type PluginModule } from "@opencode-ai/plugin";
import { HANDLED_SENTINEL, PLUGIN_ID, SCHEDULE_COMMAND_OPEN } from "./constants.ts";
import { createScheduledPrompt, saveDraftPrompt, updateStore } from "./store.ts";
import { formatRunAt } from "./time.ts";

const MAX_DELAY_MINUTES = 7 * 24 * 60;
const MAX_PROMPT_LENGTH = 4_000;

function isScheduleCommand(command: string): boolean {
  return command.replace(/^\//, "") === "schedule";
}

async function openScheduler(input: PluginInput, prompt: string): Promise<void> {
  if (prompt.trim()) {
    await saveDraftPrompt(prompt);
  }

  const result = await input.client.tui.executeCommand({
    body: { command: SCHEDULE_COMMAND_OPEN },
  });

  if (result.error || result.data !== true) {
    throw new Error("Scheduled prompt dialog unavailable. Ensure the TUI plugin is loaded.");
  }
}

export async function ScheduledPromptPlugin(pluginInput: PluginInput): Promise<Hooks> {
  return {
    tool: {
      schedule_followup: tool({
        description:
          "Schedule one non-recurring follow-up prompt in this same session. Use only when the user explicitly asks for future follow-up. Never call this tool from a scheduled follow-up unless the user sends a new request asking for another schedule.",
        args: {
          delay_minutes: tool.schema
            .number()
            .int()
            .min(1)
            .max(MAX_DELAY_MINUTES)
            .describe("Whole minutes from now, between 1 minute and 7 days"),
          prompt: tool.schema
            .string()
            .trim()
            .min(1)
            .max(MAX_PROMPT_LENGTH)
            .describe("The complete one-shot follow-up instruction to send later"),
        },
        async execute(args, context) {
          const runAt = Date.now() + args.delay_minutes * 60_000;
          const job = createScheduledPrompt({
            prompt: args.prompt,
            runAt,
            sessionID: context.sessionID,
            source: "agent",
          });

          await updateStore((store) => {
            const alreadyPending = store.jobs.some(
              (item) => item.status === "pending" && item.source === "agent" && item.sessionID === context.sessionID,
            );
            if (alreadyPending) {
              throw new Error("This session already has a pending agent-scheduled follow-up");
            }

            return {
              ...store,
              jobs: [job, ...store.jobs],
            };
          });

          return {
            title: "Follow-up scheduled",
            output: `One follow-up is scheduled for ${formatRunAt(runAt)} in this session. It will run only once and requires OpenCode to be running.`,
            metadata: {
              scheduleID: job.id,
              runAt,
              sessionID: context.sessionID,
            },
          };
        },
      }),
    },
    "command.execute.before": async (input) => {
      if (!isScheduleCommand(input.command)) {
        return;
      }

      await openScheduler(pluginInput, input.arguments);
      throw new Error(HANDLED_SENTINEL);
    },
  };
}

const module: PluginModule & { id: string } = {
  id: PLUGIN_ID,
  server: ScheduledPromptPlugin,
};

export default module;
