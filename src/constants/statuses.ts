import type { StatusDef, TagDef } from '../types';

export const PROJECT_STATUSES: StatusDef[] = [
  { id: "planned",    label: "Planned",     color: "#64748b", bg: "#f1f5f9", border: "#cbd5e1", dot: "#94a3b8" },
  { id: "inprogress", label: "In Progress", color: "#2563eb", bg: "#eff4ff", border: "#bfdbfe", dot: "#3b82f6" },
  { id: "completed",  label: "Completed",   color: "#059669", bg: "#ecfdf5", border: "#a7f3d0", dot: "#10b981" },
  { id: "onhold",     label: "On Hold",     color: "#b45309", bg: "#fffbeb", border: "#fde68a", dot: "#f59e0b" },
  { id: "cancelled",  label: "Cancelled",   color: "#6b7280", bg: "#f9fafb", border: "#d1d5db", dot: "#9ca3af" },
];
export const DERIVED_PROJ_STATUSES  = PROJECT_STATUSES.slice(0, 3);
export const OVERRIDE_PROJ_STATUSES = PROJECT_STATUSES.slice(3);
export const projectStatusById = (id: string) => PROJECT_STATUSES.find(s => s.id === id) || PROJECT_STATUSES[0];

export const STATUSES: StatusDef[] = [
  { id: "todo",       label: "To Do",       color: "#64748b", bg: "#f1f5f9", border: "#cbd5e1", dot: "#94a3b8" },
  { id: "inprogress", label: "In Progress", color: "#2563eb", bg: "#eff4ff", border: "#bfdbfe", dot: "#3b82f6" },
  { id: "inreview",   label: "In Review",   color: "#7c3aed", bg: "#f5f3ff", border: "#ddd6fe", dot: "#8b5cf6" },
  { id: "done",       label: "Done",        color: "#059669", bg: "#ecfdf5", border: "#a7f3d0", dot: "#10b981" },
];
export const statusById = (id: string) => STATUSES.find(s => s.id === id) || STATUSES[0];
export const ACTIVE_STATUSES = new Set(["inprogress", "inreview"]);

export const PRESET_TAGS: TagDef[] = [
  { label: "High Risk",    bg: "#fef2f2", color: "#dc2626", border: "#fecaca" },
  { label: "Unestimated",  bg: "#fffbeb", color: "#b45309", border: "#fde68a" },
  { label: "Blocked",      bg: "#fdf4ff", color: "#9333ea", border: "#e9d5ff" },
  { label: "Nice to Have", bg: "#f0fdf4", color: "#16a34a", border: "#bbf7d0" },
  { label: "Needs Review", bg: "#eff6ff", color: "#2563eb", border: "#bfdbfe" },
];
export const tagStyle = (tag: string) => PRESET_TAGS.find(p => p.label === tag) || { bg: "#f4f5f8", color: "#4b5068", border: "#c8cdd9" };
