import { registerTaskListsTools } from "./tasklists.ts";
import { registerTasksTools } from "./tasks.ts";

const READ_ONLY_TOOLS = new Set([
  "list_task_lists",
  "get_task_list",
  "list_tasks",
  "get_task",
]);

export function registerAllTools(server: any, readOnly: boolean) {
  // 読み取り専用モードでは書き込み系ツールの登録を握りつぶす
  const target = readOnly
    ? {
        registerTool: (name: string, ...rest: any[]) =>
          READ_ONLY_TOOLS.has(name)
            ? server.registerTool(name, ...rest)
            : undefined,
      }
    : server;
  registerTaskListsTools(target);
  registerTasksTools(target);
}
