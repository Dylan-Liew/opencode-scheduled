import type { Hooks, PluginInput, PluginModule } from "@opencode-ai/plugin";
import { HANDLED_SENTINEL, PLUGIN_ID, SCHEDULE_COMMAND_OPEN } from "./constants.ts";
import { saveDraftPrompt } from "./store.ts";

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
