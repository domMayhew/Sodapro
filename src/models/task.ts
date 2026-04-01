import type { Task, Points, ChangeLogEntry, TimeEntry } from '../types';
import { STATUSES } from '../constants';

let _id = 100;
export const uid  = () => `t${++_id}`;
export const pid  = () => `p${++_id}`;
export const tid  = () => `team${++_id}`;

export const mkTask = (name = "New Task", points = 0): Task => ({
  id: uid(), name, points, children: [], collapsed: false,
  description: "", assignee: "", tags: [], status: "todo",
  changeLog: [{ field: "created", from: null, to: name, at: new Date().toISOString() }],
  archived: false,
});

export function trackChange(task: Task, field: string, newVal: unknown): Task {
  const oldVal = (task as unknown as Record<string, unknown>)[field];
  if (field === "tags") {
    if (JSON.stringify(oldVal) === JSON.stringify(newVal)) return { ...task, [field]: newVal } as Task;
  } else {
    if (oldVal === newVal) return { ...task, [field]: newVal } as Task;
  }
  const entry: ChangeLogEntry = { field, from: oldVal, to: newVal, at: new Date().toISOString() };
  return { ...task, [field]: newVal, changeLog: [...(task.changeLog || []), entry] } as Task;
}

export function withStatusChange(task: Task, newStatus: string): Task {
  const updated = trackChange(task, "status", newStatus);
  return isTimerRunning(updated) ? stopTimer(updated) : updated;
}

export function getTrackedMinutes(task: Task, phase?: 'work' | 'review'): number {
  return (task.timeEntries || [])
    .filter(e => phase == null || e.phase === phase)
    .reduce((sum, e) => {
      const ms = (e.stoppedAt ? new Date(e.stoppedAt).getTime() : Date.now()) - new Date(e.startedAt).getTime();
      return sum + Math.floor(ms / 60000);
    }, 0);
}

export function formatTrackedTime(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60), m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function isTimerRunning(task: Task): boolean {
  return (task.timeEntries || []).some(e => !e.stoppedAt);
}

export function activeTimerPhase(task: Task): 'work' | 'review' | null {
  return (task.timeEntries || []).find(e => !e.stoppedAt)?.phase ?? null;
}

export function startTimer(task: Task, phase: 'work' | 'review'): Task {
  const stopped = (task.timeEntries || []).map(e => e.stoppedAt ? e : { ...e, stoppedAt: new Date().toISOString() });
  const entry: TimeEntry = { phase, startedAt: new Date().toISOString() };
  return { ...task, timeEntries: [...stopped, entry] };
}

export function stopTimer(task: Task): Task {
  const now = new Date().toISOString();
  return { ...task, timeEntries: (task.timeEntries || []).map(e => e.stoppedAt ? e : { ...e, stoppedAt: now }) };
}

export function computePts(task: Task, ratio: number[], includeArchived = false): Points {
  const [, tr, rr] = ratio;
  if (!task.children?.length) {
    const i = task.points || 0;
    return { impl: i, test: Math.round(i * tr), review: Math.round(i * rr), total: i + Math.round(i * tr) + Math.round(i * rr) };
  }
  let impl = 0, test = 0, review = 0;
  for (const c of task.children) {
    if (!includeArchived && c.archived) continue;
    const p = computePts(c, ratio, includeArchived);
    impl += p.impl; test += p.test; review += p.review;
  }
  return { impl, test, review, total: impl + test + review };
}

export function mapTask(root: Task, id: string, fn: (t: Task) => Task): Task {
  if (root.id === id) return fn(root);
  return { ...root, children: root.children.map(c => mapTask(c, id, fn)) };
}

export function addChild(root: Task, pid_: string): Task {
  return mapTask(root, pid_, p => {
    const isLeaf = !p.children?.length;
    return { ...p, points: 0, collapsed: false, children: [...p.children, mkTask("New Task", isLeaf ? (p.points || 0) : 0)] };
  });
}

export function archiveTask(root: Task, id: string): Task {
  return mapTask(root, id, t => trackChange({ ...t, archived: true }, "archived", true));
}

export function collectAllLeafTasks(node: Task, acc: Task[] = []): Task[] {
  if (node._isRoot) { node.children?.forEach(c => collectAllLeafTasks(c, acc)); return acc; }
  if (!node.children?.length) acc.push(node);
  else node.children.forEach(c => collectAllLeafTasks(c, acc));
  return acc;
}

export function collectLeafTasks(node: Task, acc: Task[] = []): Task[] {
  if (node._isRoot) { node.children?.forEach(c => collectLeafTasks(c, acc)); return acc; }
  if (node.archived) return acc;
  if (!node.children?.length) acc.push(node);
  else node.children.forEach(c => collectLeafTasks(c, acc));
  return acc;
}

export function collectLeafAssignees(task: Task): string[] {
  if (task.archived) return [];
  if (!task.children?.length) return task.assignee ? [task.assignee] : [];
  const seen = new Set<string>(); const result: string[] = [];
  for (const c of task.children)
    for (const a of collectLeafAssignees(c))
      if (!seen.has(a)) { seen.add(a); result.push(a); }
  return result;
}

export function collectAllAssignees(task: Task, set = new Set<string>(), includeArchived = false): Set<string> {
  if (!includeArchived && task.archived) return set;
  if (task.assignee) set.add(task.assignee);
  task.children?.forEach(c => collectAllAssignees(c, set, includeArchived));
  return set;
}

export function getTaskBreadcrumb(root: Task, taskId: string): string[] {
  const path: string[] = [];
  function walk(node: Task): boolean {
    if (node.id === taskId) return true;
    if (node.children) {
      for (const c of node.children) {
        if (walk(c)) {
          if (!node._isRoot) path.unshift(node.name);
          return true;
        }
      }
    }
    return false;
  }
  walk(root);
  return path;
}

export function getTaskBreadcrumbAcrossProjects(projects: { root: Task; name: string }[], taskId: string): { projectName: string; path: string[] } | null {
  for (const p of projects) {
    const found = (function check(node: Task): boolean {
      if (node.id === taskId) return true;
      return node.children?.some(c => check(c)) || false;
    })(p.root);
    if (found) return { projectName: p.name, path: getTaskBreadcrumb(p.root, taskId) };
  }
  return null;
}

export function collectLeafStatuses(node: Task): { counts: Record<string, number>; total: number } {
  const leaves = collectLeafTasks(node);
  const counts: Record<string, number> = {};
  STATUSES.forEach(s => { counts[s.id] = 0; });
  leaves.forEach(t => { const s = t.status || "todo"; counts[s] = (counts[s] || 0) + 1; });
  return { counts, total: leaves.length };
}

export function deepClone<T>(obj: T): T { return JSON.parse(JSON.stringify(obj)); }
