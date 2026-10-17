import { getValidAccessToken } from "../auth.ts";
import { createLogger } from "../utils/logger.ts";

const logger = createLogger({ component: "google-api" });

const GOOGLE_TASKS_API_BASE = "https://tasks.googleapis.com/tasks/v1";

async function makeGoogleRequest(
  endpoint: string,
  options?: RequestInit
): Promise<any> {
  const accessToken = await getValidAccessToken();

  const response = await fetch(`${GOOGLE_TASKS_API_BASE}${endpoint}`, {
    ...options,
    headers: {
      ...options?.headers,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const error = await response.text();
    logger.error("Google API request failed", { status: response.status });
    throw new Error(`Google API error: ${response.status} - ${error}`);
  }

  // DELETE / clear は 204 で本文が空
  const text = await response.text();
  return text ? JSON.parse(text) : { success: true };
}

export function listTaskLists(maxResults?: number, pageToken?: string) {
  const params = new URLSearchParams();
  if (maxResults) params.append("maxResults", maxResults.toString());
  if (pageToken) params.append("pageToken", pageToken);

  const query = params.toString() ? `?${params.toString()}` : "";
  return makeGoogleRequest(`/users/@me/lists${query}`);
}

export function getTaskList(taskListId: string) {
  return makeGoogleRequest(`/users/@me/lists/${encodeURIComponent(taskListId)}`);
}

export function insertTaskList(title: string) {
  return makeGoogleRequest(`/users/@me/lists`, {
    method: "POST",
    body: JSON.stringify({ title }),
  });
}

export function updateTaskList(taskListId: string, title: string) {
  return makeGoogleRequest(`/users/@me/lists/${encodeURIComponent(taskListId)}`, {
    method: "PUT",
    body: JSON.stringify({ id: taskListId, title }),
  });
}

export function patchTaskList(taskListId: string, updates: any) {
  return makeGoogleRequest(`/users/@me/lists/${encodeURIComponent(taskListId)}`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
}

export function deleteTaskList(taskListId: string) {
  return makeGoogleRequest(`/users/@me/lists/${encodeURIComponent(taskListId)}`, {
    method: "DELETE",
  });
}

export function listTasks(
  taskListId: string,
  options?: {
    completedMax?: string;
    completedMin?: string;
    dueMax?: string;
    dueMin?: string;
    maxResults?: number;
    pageToken?: string;
    showCompleted?: boolean;
    showDeleted?: boolean;
    showHidden?: boolean;
    updatedMin?: string;
  }
) {
  const params = new URLSearchParams();
  if (options?.completedMax) params.append("completedMax", options.completedMax);
  if (options?.completedMin) params.append("completedMin", options.completedMin);
  if (options?.dueMax) params.append("dueMax", options.dueMax);
  if (options?.dueMin) params.append("dueMin", options.dueMin);
  if (options?.maxResults) params.append("maxResults", options.maxResults.toString());
  if (options?.pageToken) params.append("pageToken", options.pageToken);
  if (options?.showCompleted !== undefined) params.append("showCompleted", options.showCompleted.toString());
  if (options?.showDeleted !== undefined) params.append("showDeleted", options.showDeleted.toString());
  if (options?.showHidden !== undefined) params.append("showHidden", options.showHidden.toString());
  if (options?.updatedMin) params.append("updatedMin", options.updatedMin);

  const query = params.toString() ? `?${params.toString()}` : "";
  return makeGoogleRequest(`/lists/${encodeURIComponent(taskListId)}/tasks${query}`);
}

export function getTask(taskListId: string, taskId: string) {
  return makeGoogleRequest(`/lists/${encodeURIComponent(taskListId)}/tasks/${encodeURIComponent(taskId)}`);
}

export function insertTask(taskListId: string, task: any, parent?: string, previous?: string) {
  const params = new URLSearchParams();
  if (parent) params.append("parent", parent);
  if (previous) params.append("previous", previous);

  const query = params.toString() ? `?${params.toString()}` : "";
  return makeGoogleRequest(`/lists/${encodeURIComponent(taskListId)}/tasks${query}`, {
    method: "POST",
    body: JSON.stringify(task),
  });
}

export function updateTask(taskListId: string, taskId: string, task: any) {
  return makeGoogleRequest(`/lists/${encodeURIComponent(taskListId)}/tasks/${encodeURIComponent(taskId)}`, {
    method: "PUT",
    body: JSON.stringify({ ...task, id: taskId }),
  });
}

export function patchTask(taskListId: string, taskId: string, updates: any) {
  return makeGoogleRequest(`/lists/${encodeURIComponent(taskListId)}/tasks/${encodeURIComponent(taskId)}`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
}

export function deleteTask(taskListId: string, taskId: string) {
  return makeGoogleRequest(`/lists/${encodeURIComponent(taskListId)}/tasks/${encodeURIComponent(taskId)}`, {
    method: "DELETE",
  });
}

export function clearTasks(taskListId: string) {
  return makeGoogleRequest(`/lists/${encodeURIComponent(taskListId)}/clear`, {
    method: "POST",
  });
}

export function moveTask(
  taskListId: string,
  taskId: string,
  parent?: string,
  previous?: string
) {
  const params = new URLSearchParams();
  if (parent) params.append("parent", parent);
  if (previous) params.append("previous", previous);

  const query = params.toString() ? `?${params.toString()}` : "";
  return makeGoogleRequest(`/lists/${encodeURIComponent(taskListId)}/tasks/${encodeURIComponent(taskId)}/move${query}`, {
    method: "POST",
  });
}
