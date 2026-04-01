import type { Project } from '../types';
import { pid, uid, mkTask, collectLeafTasks, collectAllLeafTasks } from './task';

export const mkProject = (name: string): Project => ({
  id: pid(), name,
  statusOverride: null,
  root: { id: uid(), name: "root", _isRoot: true, children: [], collapsed: false, points: 0, description: "", assignee: "", tags: [], status: "todo", changeLog: [], archived: false },
  ratio: [1, 1, 1],
  createdAt: new Date().toISOString(),
});

export function deriveProjectStatus(project: Project): string {
  const activeLeaves = collectLeafTasks(project.root);
  if (activeLeaves.length === 0) {
    const allLeaves = collectAllLeafTasks(project.root);
    if (allLeaves.length === 0) return "planned";
    return allLeaves.some(t => t.status === "done") ? "completed" : "planned";
  }
  if (activeLeaves.every(t => t.status === "done")) return "completed";
  if (activeLeaves.some(t => t.status !== "todo"))  return "inprogress";
  return "planned";
}

export function effectiveProjectStatus(project: Project): string {
  return project.statusOverride || deriveProjectStatus(project);
}
