import { registerTaskListsTools } from "./tasklists.ts";
import { registerTasksTools } from "./tasks.ts";
import { allowedLists, guardLists } from "../utils/allowlist.ts";
import { t } from "../utils/i18n.ts";

const READ_ONLY_TOOLS = new Set(["list_task_lists", "get_task_list", "list_tasks", "get_task"]);

function registerAll(target: any) {
  registerTaskListsTools(target);
  registerTasksTools(target);
}

export function registerAllTools(server: any, readOnly: boolean) {
  allowedLists(); // 設定ミス（ID が 0 件）なら起動時に止める
  // 登録されるツール名を先に集めて、GOOGLE_TASKS_TOOLS を検証する
  const all = new Set<string>();
  registerAll({ registerTool: (name: string) => all.add(name) });

  const requested = (process.env.GOOGLE_TASKS_TOOLS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const unknown = requested.filter((n) => !all.has(n));
  if (unknown.length) {
    throw new Error(
      `${t("GOOGLE_TASKS_TOOLS に未知のツール名があります", "Unknown tool name in GOOGLE_TASKS_TOOLS")}: ${unknown.join(", ")}\n` +
        `${t("使えるツール", "Valid tools")}: ${[...all].join(", ")}`
    );
  }
  const writes = readOnly ? requested.filter((n) => !READ_ONLY_TOOLS.has(n)) : [];
  if (writes.length) {
    throw new Error(
      `${t("GOOGLE_TASKS_READONLY=1 では書き込み系ツールを許可できません", "Write tools cannot be enabled with GOOGLE_TASKS_READONLY=1")}: ${writes.join(", ")}`
    );
  }

  // 読み取り専用・許可ツールに含まれないものは登録しない
  const enabled = (name: string) =>
    (!readOnly || READ_ONLY_TOOLS.has(name)) && (!requested.length || requested.includes(name));
  registerAll({
    registerTool: (name: string, config: any, handler: any) =>
      enabled(name) ? server.registerTool(name, config, guardLists(name, handler)) : undefined,
  });
}
