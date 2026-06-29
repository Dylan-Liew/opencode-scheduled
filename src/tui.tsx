/** @jsxImportSource @opentui/solid */
import type { TuiPlugin, TuiPluginModule } from "@opencode-ai/plugin/tui";
import { PLUGIN_ID, SCHEDULE_COMMAND_OPEN } from "./constants.ts";
import { startScheduler } from "./scheduler.ts";
import { openManager, openScheduler } from "./tui/dialogs.tsx";
import { SidebarScheduledPrompts } from "./tui/SidebarScheduledPrompts.tsx";

const tui: TuiPlugin = async (api) => {
  const disposeCommands = api.keymap.registerLayer({
    commands: [
      {
        namespace: "palette",
        name: SCHEDULE_COMMAND_OPEN,
        title: "Schedule Prompt",
        category: "Plugin",
        slashName: "schedule",
        run: () => {
          void openScheduler(api);
        },
      },
    ],
  });

  api.slots.register({
    order: 180,
    slots: {
      sidebar_content(_ctx, props) {
        return <SidebarScheduledPrompts api={api} sessionID={props.session_id} onOpenManager={() => void openManager(api)} />;
      },
    },
  });

  const disposeScheduler = startScheduler(api);
  api.lifecycle.onDispose(disposeCommands);
  api.lifecycle.onDispose(disposeScheduler);
};

const module: TuiPluginModule & { id: string } = {
  id: PLUGIN_ID,
  tui,
};

export default module;
