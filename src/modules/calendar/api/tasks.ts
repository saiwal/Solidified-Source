import { apiFetch, apiError } from "@utsukta/spa-core/lib/fetch";

/** One to-do from either store (see Api/Handlers/Tasks.php). */
export type Task = {
  summary: string;
  done: boolean;
  percent: number;
  /** iCal PRIORITY: 0 none, 1 highest … 9 lowest. */
  priority: number;
  /** YYYY-MM-DD */
  due: string | null;
  created: string;
  editable: boolean;
} & (
  | { source: "channel"; id: number }
  | { source: "caldav"; calendarId: number; uri: string; calendar: string; color: string }
);

export async function fetchTasks(all: boolean): Promise<Task[]> {
  const res = await apiFetch(`/spa/tasks${all ? "?all=1" : ""}`);
  if (!res.ok) throw await apiError(res);
  return (await res.json()).data as Task[];
}

export async function createTask(input: {
  summary: string; due?: string; priority?: number; calendarId: number | "channel";
}): Promise<void> {
  const res = await apiFetch("/spa/tasks", { method: "POST", body: JSON.stringify(input) });
  if (!res.ok) throw await apiError(res);
}

/** The ref the complete/delete endpoints take for a task. */
export const taskRef = (t: Task) =>
  t.source === "channel" ? { source: t.source, id: t.id } : { source: t.source, calendarId: t.calendarId, uri: t.uri };

export async function toggleTask(t: Task): Promise<void> {
  const res = await apiFetch("/spa/tasks/complete", { method: "POST", body: JSON.stringify(taskRef(t)) });
  if (!res.ok) throw await apiError(res);
}

export async function editTask(t: Task, fields: { summary: string; due?: string; priority?: number }): Promise<void> {
  const res = await apiFetch("/spa/tasks/edit", { method: "POST", body: JSON.stringify({ ...taskRef(t), ...fields }) });
  if (!res.ok) throw await apiError(res);
}
