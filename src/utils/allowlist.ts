import { t } from "./i18n.ts";

// GOOGLE_TASKS_ALLOWED_LISTS（カンマ区切りのタスクリスト ID）。未設定なら null で制限なし
export function allowedLists(): Set<string> | null {
  const raw = process.env.GOOGLE_TASKS_ALLOWED_LISTS;
  if (raw === undefined || raw === "") return null;
  const ids = raw.split(",").map((s) => s.trim()).filter(Boolean);
  // 設定されているのに ID が 0 件なら、制限なしにせず起動を止める
  if (!ids.length) throw new Error(t("GOOGLE_TASKS_ALLOWED_LISTS に有効な ID がありません", "GOOGLE_TASKS_ALLOWED_LISTS has no valid IDs"));
  return new Set(ids);
}

function denied(text: string) {
  return { content: [{ type: "text", text }], isError: true };
}

// ツールのハンドラを包み、Google を呼ぶ前にリスト ID を検査する（"@default" も文字どおり扱う）
export function guardLists(name: string, handler: (...a: any[]) => any) {
  return (args: any, ...rest: any[]) => {
    const allowed = allowedLists();
    if (allowed) {
      if (name === "insert_task_list") {
        return denied(t("許可リスト外のため、タスクリストは作成できません", "Creating task lists is not allowed"));
      }
      const id = args?.taskListId;
      if (id !== undefined && !allowed.has(id)) {
        return denied(`${t("このタスクリストは許可されていません", "Task list not allowed")}: ${id}`);
      }
    }
    return handler(args, ...rest);
  };
}
