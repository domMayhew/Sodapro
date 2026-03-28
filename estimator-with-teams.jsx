import { useState, useCallback, useRef, useEffect, useMemo } from "react";

/* ═══════════════════════════════════════════════════════════════
   SECTION 1: DESIGN TOKENS
   All visual constants in one place.
═══════════════════════════════════════════════════════════════ */
const C = {
  bg: "#f4f5f8", surface: "#ffffff", border: "#e4e7ee", borderDark: "#c8cdd9",
  stripe: "#f9fafb", text: "#1a1d27", textMid: "#4b5068", textSub: "#8b91aa",
  accent: "#2563eb", accentLight: "#eff4ff",
  green: "#059669", greenLight: "#ecfdf5",
  amber: "#b45309", amberLight: "#fffbeb",
  purple: "#7c3aed", purpleLight: "#f5f3ff",
  red: "#dc2626", redLight: "#fef2f2",
  teal: "#0d9488", tealLight: "#f0fdfa",
  sidebar: "#16181f", sidebarBorder: "#2a2d38", sidebarText: "#c8cdd9", sidebarSub: "#6b7280",
};

/* ═══════════════════════════════════════════════════════════════
   SECTION 2: STATUS & TAG DEFINITIONS
   Canonical status lists, lookup helpers, and tag presets.
═══════════════════════════════════════════════════════════════ */
const PROJECT_STATUSES = [
  { id: "planned",    label: "Planned",     color: "#64748b", bg: "#f1f5f9", border: "#cbd5e1", dot: "#94a3b8" },
  { id: "inprogress", label: "In Progress", color: "#2563eb", bg: "#eff4ff", border: "#bfdbfe", dot: "#3b82f6" },
  { id: "completed",  label: "Completed",   color: "#059669", bg: "#ecfdf5", border: "#a7f3d0", dot: "#10b981" },
  { id: "onhold",     label: "On Hold",     color: "#b45309", bg: "#fffbeb", border: "#fde68a", dot: "#f59e0b" },
  { id: "cancelled",  label: "Cancelled",   color: "#6b7280", bg: "#f9fafb", border: "#d1d5db", dot: "#9ca3af" },
];
const DERIVED_PROJ_STATUSES  = PROJECT_STATUSES.slice(0, 3);
const OVERRIDE_PROJ_STATUSES = PROJECT_STATUSES.slice(3);
const projectStatusById = id => PROJECT_STATUSES.find(s => s.id === id) || PROJECT_STATUSES[0];

const STATUSES = [
  { id: "todo",       label: "To Do",       color: "#64748b", bg: "#f1f5f9", border: "#cbd5e1", dot: "#94a3b8" },
  { id: "inprogress", label: "In Progress", color: "#2563eb", bg: "#eff4ff", border: "#bfdbfe", dot: "#3b82f6" },
  { id: "inreview",   label: "In Review",   color: "#7c3aed", bg: "#f5f3ff", border: "#ddd6fe", dot: "#8b5cf6" },
  { id: "done",       label: "Done",        color: "#059669", bg: "#ecfdf5", border: "#a7f3d0", dot: "#10b981" },
];
const statusById = id => STATUSES.find(s => s.id === id) || STATUSES[0];
const ACTIVE_STATUSES = new Set(["inprogress", "inreview"]);

const PRESET_TAGS = [
  { label: "High Risk",    bg: "#fef2f2", color: "#dc2626", border: "#fecaca" },
  { label: "Unestimated",  bg: "#fffbeb", color: "#b45309", border: "#fde68a" },
  { label: "Blocked",      bg: "#fdf4ff", color: "#9333ea", border: "#e9d5ff" },
  { label: "Nice to Have", bg: "#f0fdf4", color: "#16a34a", border: "#bbf7d0" },
  { label: "Needs Review", bg: "#eff6ff", color: "#2563eb", border: "#bfdbfe" },
];
const tagStyle = tag => PRESET_TAGS.find(p => p.label === tag) || { bg: "#f4f5f8", color: "#4b5068", border: "#c8cdd9" };

/* ═══════════════════════════════════════════════════════════════
   SECTION 3: DATA MODEL — factories, tree ops, point computation
   Pure functions only. No React. No side effects.
═══════════════════════════════════════════════════════════════ */

// ── ID generators ────────────────────────────────────────────
let _id = 100;
const uid  = () => `t${++_id}`;
const pid  = () => `p${++_id}`;
const tid  = () => `team${++_id}`;

// ── Factories ────────────────────────────────────────────────
const mkTask = (name = "New Task", points = 0) => ({
  id: uid(), name, points, children: [], collapsed: false,
  description: "", assignee: "", tags: [], status: "todo",
  changeLog: [{ field: "created", from: null, to: name, at: new Date().toISOString() }],
  archived: false,
});

const mkProject = (name) => ({
  id: pid(), name,
  statusOverride: null,
  root: { id: uid(), name: "root", _isRoot: true, children: [], collapsed: false },
  ratio: [1, 1, 1],
  createdAt: new Date().toISOString(),
});

const mkTeam = (name) => ({
  id: tid(), name,
  projects: [],
  snapshots: [],
  // Per-assignee task priority: { [assignee]: [taskId, ...] }
  // Within each status band (inreview > inprogress > todo), tasks follow this order.
  // Tasks not in the list are appended at the end of their status band.
  taskOrder: {},
  createdAt: new Date().toISOString(),
});

// ── Change tracking ──────────────────────────────────────────
function trackChange(task, field, newVal) {
  const oldVal = task[field];
  if (field === "tags") {
    if (JSON.stringify(oldVal) === JSON.stringify(newVal)) return { ...task, [field]: newVal };
  } else {
    if (oldVal === newVal) return { ...task, [field]: newVal };
  }
  const entry = { field, from: oldVal, to: newVal, at: new Date().toISOString() };
  return { ...task, [field]: newVal, changeLog: [...(task.changeLog || []), entry] };
}

function withStatusChange(task, newStatus) {
  return trackChange(task, "status", newStatus);
}

// ── Point computation ────────────────────────────────────────
// includeArchived: false (default) = EstimateView behavior (skip archived children)
//                  true = Goal scope behavior (count all children regardless)
function computePts(task, ratio, includeArchived = false) {
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

// ── Tree operations ──────────────────────────────────────────
function mapTask(root, id, fn) {
  if (root.id === id) return fn(root);
  return { ...root, children: root.children.map(c => mapTask(c, id, fn)) };
}

function addChild(root, pid_) {
  return mapTask(root, pid_, p => {
    const isLeaf = !p.children?.length;
    return { ...p, points: 0, collapsed: false, children: [...p.children, mkTask("New Task", isLeaf ? (p.points || 0) : 0)] };
  });
}

function archiveTask(root, id) {
  return mapTask(root, id, t => trackChange({ ...t, archived: true }, "archived", true));
}

// ── Tree traversal ───────────────────────────────────────────
// collectAllLeafTasks: ALL leaves, including archived
function collectAllLeafTasks(node, acc = []) {
  if (node._isRoot) { node.children?.forEach(c => collectAllLeafTasks(c, acc)); return acc; }
  if (!node.children?.length) acc.push(node);
  else node.children.forEach(c => collectAllLeafTasks(c, acc));
  return acc;
}

// collectLeafTasks: non-archived leaves (done tasks ARE included — they're completed work, not hidden)
function collectLeafTasks(node, acc = []) {
  if (node._isRoot) { node.children?.forEach(c => collectLeafTasks(c, acc)); return acc; }
  if (node.archived) return acc;
  if (!node.children?.length) acc.push(node);
  else node.children.forEach(c => collectLeafTasks(c, acc));
  return acc;
}

function collectLeafAssignees(task) {
  if (task.archived) return [];
  if (!task.children?.length) return task.assignee ? [task.assignee] : [];
  const seen = new Set(); const result = [];
  for (const c of task.children)
    for (const a of collectLeafAssignees(c))
      if (!seen.has(a)) { seen.add(a); result.push(a); }
  return result;
}

function collectAllAssignees(task, set = new Set(), includeArchived = false) {
  if (!includeArchived && task.archived) return set;
  if (task.assignee) set.add(task.assignee);
  task.children?.forEach(c => collectAllAssignees(c, set, includeArchived));
  return set;
}

// ── Breadcrumb path ──────────────────────────────────────────
/** Returns an array of ancestor names for a task within a project root */
function getTaskBreadcrumb(root, taskId) {
  const path = [];
  function walk(node) {
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

/** Finds breadcrumb for a task across all projects. Returns { projectName, path } or null */
function getTaskBreadcrumbAcrossProjects(projects, taskId) {
  for (const p of projects) {
    const found = (function check(node) {
      if (node.id === taskId) return true;
      return node.children?.some(c => check(c)) || false;
    })(p.root);
    if (found) return { projectName: p.name, path: getTaskBreadcrumb(p.root, taskId) };
  }
  return null;
}
function collectLeafStatuses(node) {
  const leaves = collectLeafTasks(node);
  const counts = {};
  STATUSES.forEach(s => { counts[s.id] = 0; });
  leaves.forEach(t => { const s = t.status || "todo"; counts[s] = (counts[s] || 0) + 1; });
  return { counts, total: leaves.length };
}

// ── Project status derivation ────────────────────────────────
function deriveProjectStatus(project) {
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

function effectiveProjectStatus(project) {
  return project.statusOverride || deriveProjectStatus(project);
}

// ── Date / working-day helpers ───────────────────────────────
function workingDaysBetweenDates(from, to) {
  let count = 0;
  let d = new Date(from); d.setHours(0, 0, 0, 0);
  const end = new Date(to); end.setHours(0, 0, 0, 0);
  while (d <= end) {
    if (d.getDay() !== 0 && d.getDay() !== 6) count++;
    d.setDate(d.getDate() + 1);
  }
  return Math.max(count, 0);
}

function workingDaysBetween(from, to) {
  return workingDaysBetweenDates(new Date(from), new Date(to));
}

function deepClone(obj) { return JSON.parse(JSON.stringify(obj)); }

// ── Task ordering ────────────────────────────────────────────
// Status priority bands: inreview (0) > inprogress (1) > todo (2) > done (3)
const STATUS_BAND = { inreview: 0, inprogress: 1, todo: 2, done: 3 };
function getStatusBand(status) { return STATUS_BAND[status] ?? 2; }

/**
 * Given a flat list of tasks and a user-defined priority list,
 * returns task IDs sorted by: status band first, then user priority within each band.
 * Tasks not in the priority list are appended at the end of their band.
 */
function sortTasksByOrder(tasks, priorityList = []) {
  const prioIndex = {};
  priorityList.forEach((id, i) => { prioIndex[id] = i; });

  return [...tasks].sort((a, b) => {
    const bandA = getStatusBand(a.status || "todo");
    const bandB = getStatusBand(b.status || "todo");
    if (bandA !== bandB) return bandA - bandB;
    // Within same band, use priority list order (unlisted tasks go to end)
    const pA = prioIndex[a.id] ?? 999999;
    const pB = prioIndex[b.id] ?? 999999;
    return pA - pB;
  });
}

/**
 * Moves a task within an assignee's priority list.
 * `fromIndex` and `toIndex` are positions within the VISIBLE (status-filtered) list
 * for the given status column.
 */
function reorderTaskInColumn(taskOrder, assignee, columnTaskIds, fromIndex, toIndex) {
  const currentOrder = [...(taskOrder[assignee] || [])];
  const movedId = columnTaskIds[fromIndex];

  // Remove the moved task from the priority list if present
  const filtered = currentOrder.filter(id => id !== movedId);

  // Find where to insert: put it relative to the task at toIndex
  if (toIndex >= columnTaskIds.length) {
    // Dropped at the end
    filtered.push(movedId);
  } else {
    const targetId = columnTaskIds[toIndex > fromIndex ? toIndex : toIndex];
    const targetPos = filtered.indexOf(targetId);
    if (targetPos >= 0) {
      filtered.splice(toIndex > fromIndex ? targetPos + 1 : targetPos, 0, movedId);
    } else {
      filtered.push(movedId);
    }
  }

  // Ensure all column task IDs are in the list
  columnTaskIds.forEach(id => {
    if (!filtered.includes(id)) filtered.push(id);
  });

  return { ...taskOrder, [assignee]: filtered };
}

/* ═══════════════════════════════════════════════════════════════
   SECTION 4: GOAL SCOPE RESOLUTION
   Single source of truth for comparing a goal snapshot against
   the current state of a project. Used by GoalsView AND
   ProjectGoalDetail — never duplicated.
═══════════════════════════════════════════════════════════════ */

/**
 * Resolves a single project's goal scope against its current state.
 *
 * Returns:
 *   scopeItems[]     — one per originally-scoped task, with est/actual pts, status, drift
 *   addedSince[]     — tasks in current project that weren't in the snapshot
 *   statusCounts     — { todo, inprogress, inreview, done }
 *   totalEstPts      — sum of estimated pts (snapshot ratio) for all scoped tasks
 *   totalDonePts     — sum of estimated pts for DONE scoped tasks (same ratio = consistent %)
 *   completionPct    — % of original scope delivered (by est pts, not current pts)
 *   driftPts         — total absolute estimate drift across all scoped tasks
 *   creepCount       — number of tasks added since goal
 */
function resolveProjectGoalScope(pSnap, currentProject) {
  const currentRoot  = currentProject?.root  || pSnap.root;
  const currentRatio = currentProject?.ratio || pSnap.ratio;
  const snapRatio    = pSnap.ratio;

  // Build lookup maps
  const snapLeaves   = collectAllLeafTasks(pSnap.root);
  const currentAll   = collectAllLeafTasks(currentRoot);
  const currentActive = collectLeafTasks(currentRoot);

  const snapIds    = new Set(snapLeaves.map(t => t.id));
  const inScopeIds = new Set(pSnap.inScopeIds || snapLeaves.map(t => t.id));

  const snapById    = {}; snapLeaves.forEach(t  => snapById[t.id] = t);
  const currentById = {}; currentAll.forEach(t  => currentById[t.id] = t);

  // Resolve each scoped task
  const scopeTasks = snapLeaves.filter(t => inScopeIds.has(t.id));
  const scopeItems = scopeTasks.map(t => {
    const snapT = snapById[t.id];
    const curr  = currentById[t.id] || null;

    // Use snapshot ratio for "estimated" (what was planned)
    const estPts  = computePts(snapT, snapRatio, true).total;
    // Use current ratio for "actual" (what it costs now)
    const currPts = curr ? computePts(curr, currentRatio, true).total : estPts;

    const isMissing  = !curr;
    const isArchived = curr?.archived ?? false;
    const status     = curr?.status || "todo";
    // done = task status is "done" (completed work)
    // archived = soft-deleted/descoped — does NOT count as done
    // missing = removed from tree entirely — does NOT count as done
    const isDone     = !isMissing && !isArchived && status === "done";

    return {
      id: t.id,
      name: curr?.name || snapT.name,
      assignee: curr?.assignee || snapT.assignee,
      estPts,
      currPts,
      status,
      isDone,
      isArchived,
      isMissing,
      estimateDrifted: currPts !== estPts,
      ptsDelta: currPts - estPts,
    };
  });

  // Tasks added since the goal was set
  const addedSince = currentActive.filter(t => !snapIds.has(t.id));

  // Status counts (for progress bars)
  const statusCounts = { todo: 0, inprogress: 0, inreview: 0, done: 0 };
  scopeItems.forEach(x => {
    if (x.isMissing || x.isArchived) { statusCounts.todo++; return; }  // archived/missing = unfinished
    statusCounts[x.status] = (statusCounts[x.status] || 0) + 1;
  });

  // FIX: Use estPts consistently for completion % so ratio changes don't distort it
  const totalEstPts  = scopeItems.reduce((s, x) => s + x.estPts, 0);
  const totalDonePts = scopeItems.filter(x => x.isDone).reduce((s, x) => s + x.estPts, 0);
  const completionPct = totalEstPts > 0 ? Math.round(totalDonePts / totalEstPts * 100) : 0;

  // Drift & creep
  const driftPts  = scopeItems.filter(x => x.ptsDelta !== 0).reduce((s, x) => s + Math.abs(x.ptsDelta), 0);
  const creepCount = addedSince.length;

  return {
    scopeItems,
    addedSince,
    statusCounts,
    totalEstPts,
    totalDonePts,
    completionPct,
    driftPts,
    creepCount,
    currentRatio,
  };
}

/**
 * Aggregates goal scope across all project snapshots for team-level summary.
 * Skips paused/cancelled projects from totals.
 */
function resolveTeamGoalSummary(snapshot, projects, elapsedDays) {
  let totalScopeCount = 0, doneCount = 0, inProgressCount = 0, inReviewCount = 0, todoCount = 0;
  let totalEstPts = 0, totalDonePts = 0, totalDrift = 0, totalCreep = 0;
  const expectedPtsDone = elapsedDays * snapshot.velocity;

  const projectSummaries = (snapshot.projectSnapshots || []).map(pSnap => {
    const currentProject = projects.find(p => p.id === pSnap.projectId);
    const resolved = resolveProjectGoalScope(pSnap, currentProject);
    const currEff = currentProject ? effectiveProjectStatus(currentProject) : null;
    const isPaused = currEff === "onhold" || currEff === "cancelled";

    if (!isPaused) {
      totalScopeCount += resolved.scopeItems.length;
      doneCount       += resolved.statusCounts.done;
      inProgressCount += resolved.statusCounts.inprogress;
      inReviewCount   += resolved.statusCounts.inreview;
      todoCount       += resolved.statusCounts.todo;
      totalEstPts     += resolved.totalEstPts;
      totalDonePts    += resolved.totalDonePts;
      totalDrift      += resolved.driftPts;
      totalCreep      += resolved.creepCount;
    }

    return {
      pSnap,
      currentProject,
      resolved,
      currentEffectiveStatus: currEff,
      isPaused,
      throughput: elapsedDays > 0 ? (resolved.totalDonePts / elapsedDays).toFixed(1) : null,
    };
  });

  const completionPct = totalEstPts > 0 ? Math.round(totalDonePts / totalEstPts * 100) : 0;
  const teamThroughput = elapsedDays > 0 ? (totalDonePts / elapsedDays).toFixed(1) : null;

  // Second pass: compute per-project expectedPts now that totalEstPts is known
  const projectSummariesWithExpected = projectSummaries.map(s => ({
    ...s,
    expectedPts: totalEstPts > 0 ? Math.round((s.resolved.totalEstPts / totalEstPts) * expectedPtsDone) : 0,
  }));

  const barCounts = { todo: todoCount, inprogress: inProgressCount, inreview: inReviewCount, done: doneCount };

  return {
    projectSummaries: projectSummariesWithExpected,
    barCounts,
    totalScopeCount,
    totalEstPts,
    totalDonePts,
    completionPct,
    teamThroughput,
    expectedPtsDone,
    totalDrift,
    totalCreep,
  };
}

/* ═══════════════════════════════════════════════════════════════
   SECTION 5: TIMELINE ENGINE
   Interval analysis, concurrency, and layout computation.
═══════════════════════════════════════════════════════════════ */
const TL = { DAY_W: 48, LANE_H: 70, SIDEBAR_W: 172, SIDEBAR_W_COMPACT: 52 };

function tlAddDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function tlIsWeekend(d)  { const w = d.getDay(); return w === 0 || w === 6; }
function tlIsMonday(d)   { return d.getDay() === 1; }

function tlWorkingDaysArr(from, count) {
  const days = [];
  let d = new Date(from); d.setHours(0, 0, 0, 0);
  while (days.length < count) {
    if (!tlIsWeekend(d)) days.push(new Date(d));
    d = tlAddDays(d, 1);
  }
  return days;
}

function tlGetHue(name) {
  if (!name || name === "Unassigned") return 215;
  return [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
}

function tlGetActiveIntervals(task) {
  const log = (task.changeLog || []).filter(e => e.field === "status");
  if (log.length === 0) return [];
  const now = new Date();
  const intervals = [];
  for (let i = 0; i < log.length; i++) {
    if (ACTIVE_STATUSES.has(log[i].to)) {
      const from = new Date(log[i].at);
      const to   = i + 1 < log.length ? new Date(log[i + 1].at) : now;
      intervals.push({ from, to });
    }
  }
  return intervals;
}

function tlBuildConcurrencyMap(tasks) {
  const map = {};
  tasks.forEach(task => {
    tlGetActiveIntervals(task).forEach(({ from, to }) => {
      let d = new Date(from); d.setHours(0, 0, 0, 0);
      const end = new Date(to); end.setHours(0, 0, 0, 0);
      while (d <= end) {
        if (!tlIsWeekend(d)) {
          const key = d.toISOString().slice(0, 10);
          map[key] = (map[key] || 0) + 1;
        }
        d = new Date(d); d.setDate(d.getDate() + 1);
      }
    });
  });
  return map;
}

function tlComputeBurnedDays(task, concurrencyMap) {
  let burned = 0;
  tlGetActiveIntervals(task).forEach(({ from, to }) => {
    let d = new Date(from); d.setHours(0, 0, 0, 0);
    const end = new Date(to); end.setHours(0, 0, 0, 0);
    while (d <= end) {
      if (!tlIsWeekend(d)) {
        const key = d.toISOString().slice(0, 10);
        burned += 1 / (concurrencyMap[key] || 1);
      }
      d = new Date(d); d.setDate(d.getDate() + 1);
    }
  });
  return burned;
}

/* ═══════════════════════════════════════════════════════════════
   SECTION 6: HOOKS
═══════════════════════════════════════════════════════════════ */
function useClickOutside(ref, cb) {
  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) cb(); };
    document.addEventListener("mousedown", h);
    document.addEventListener("touchstart", h);
    return () => { document.removeEventListener("mousedown", h); document.removeEventListener("touchstart", h); };
  }, [ref, cb]);
}

function useWindowWidth() {
  const [w, setW] = useState(() => typeof window !== "undefined" ? window.innerWidth : 1024);
  useEffect(() => {
    const h = () => setW(window.innerWidth);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  return w;
}

function useFixedPosition(anchorRef, open, width = 288) {
  const [pos, setPos] = useState({ top: -9999, left: -9999 });
  useEffect(() => {
    if (!open || !anchorRef.current) return;
    const calc = () => {
      const r = anchorRef.current.getBoundingClientRect();
      const vw = window.innerWidth; const vh = window.innerHeight;
      const popH = 480;
      let top = r.bottom + 8;
      let left = r.right - width;
      if (left < 8) left = 8;
      if (left + width > vw - 8) left = vw - width - 8;
      if (top + popH > vh - 8) top = Math.max(8, r.top - popH - 8);
      setPos({ top, left });
    };
    calc();
    window.addEventListener("scroll", calc, true);
    window.addEventListener("resize", calc);
    return () => { window.removeEventListener("scroll", calc, true); window.removeEventListener("resize", calc); };
  }, [open, anchorRef, width]);
  return pos;
}

/* ═══════════════════════════════════════════════════════════════
   SECTION 7: SHARED UI PRIMITIVES
   Small, reusable components used across multiple views.
═══════════════════════════════════════════════════════════════ */

function FixedPopover({ anchorRef, open, onClose, width = 288, children }) {
  const pos = useFixedPosition(anchorRef, open, width);
  const ref = useRef();
  useClickOutside(ref, onClose);
  if (!open) return null;
  return (
    <div ref={ref} style={{
      position: "fixed", top: pos.top, left: pos.left, width,
      zIndex: 9999, background: C.surface, border: `1px solid ${C.border}`,
      borderRadius: 10, padding: "14px 16px",
      boxShadow: "0 4px 24px rgba(0,0,0,0.13), 0 1px 4px rgba(0,0,0,0.06)",
      maxHeight: "80vh", overflowY: "auto",
    }}>
      {children}
    </div>
  );
}

function getInitials(name, allNames = []) {
  if (!name) return "";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  const first = parts[0][0].toUpperCase();
  const last  = parts[parts.length - 1][0].toUpperCase();
  const collision = allNames.some(n => n !== name && n.trim().split(/\s+/)[0][0].toUpperCase() === first);
  return collision ? first + last : first;
}

function Avatar({ name, allNames = [], size = 20, extraStyle = {} }) {
  if (!name) return null;
  const initials = getInitials(name, allNames);
  const hue = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return (
    <span title={name} style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      background: `hsl(${hue},50%,87%)`, color: `hsl(${hue},50%,30%)`,
      fontSize: initials.length > 1 ? size * 0.38 : size * 0.44,
      fontWeight: 700, letterSpacing: "0.01em", ...extraStyle,
    }}>{initials}</span>
  );
}

const MAX_SHOWN = 3;
function AssigneeStack({ assignees, allNames }) {
  if (!assignees.length) return null;
  const shown = assignees.slice(0, MAX_SHOWN);
  const extra = assignees.length - MAX_SHOWN;
  return (
    <div style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
      {shown.map((a, i) => (
        <Avatar key={a} name={a} allNames={allNames} size={18}
          extraStyle={{ marginLeft: i === 0 ? 0 : -5, border: `1.5px solid ${C.surface}`, zIndex: shown.length - i }} />
      ))}
      {extra > 0 && (
        <span title={assignees.slice(MAX_SHOWN).join(", ")} style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: 18, height: 18, borderRadius: "50%", marginLeft: -5,
          background: C.stripe, border: `1.5px solid ${C.border}`,
          fontSize: 9, fontWeight: 700, color: C.textSub,
        }}>+{extra}</span>
      )}
    </div>
  );
}

function TagChip({ label, onRemove }) {
  const s = tagStyle(label);
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, fontWeight: 600,
      padding: "1px 6px", borderRadius: 4, border: `1px solid ${s.border}`,
      background: s.bg, color: s.color, whiteSpace: "nowrap", flexShrink: 0,
    }}>
      {label}
      {onRemove && <span onClick={e => { e.stopPropagation(); onRemove(); }} style={{ cursor: "pointer", opacity: 0.6, fontSize: 11 }}>×</span>}
    </span>
  );
}

const sBtn = {
  width: 22, height: 24, border: `1px solid ${C.border}`, background: C.stripe,
  color: C.textMid, cursor: "pointer", fontSize: 14,
  display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
};
function Stepper({ value, onChange, color }) {
  return (
    <div style={{ display: "flex" }} onMouseDown={e => e.stopPropagation()}>
      <button onClick={() => onChange(Math.max(0, value - 1))} style={sBtn}>−</button>
      <input type="number" min={0} value={value}
        onChange={e => onChange(Math.max(0, parseInt(e.target.value) || 0))}
        style={{
          width: 36, textAlign: "center", border: `1px solid ${C.border}`,
          borderLeft: "none", borderRight: "none", outline: "none",
          fontSize: 12, fontFamily: "'IBM Plex Mono', monospace",
          fontWeight: 600, color, background: C.surface, padding: "2px 0",
        }} />
      <button onClick={() => onChange(value + 1)} style={sBtn}>+</button>
    </div>
  );
}

function StatusDot({ status, size = 8, onClick }) {
  const s = statusById(status);
  return (
    <span onClick={onClick} title={s.label} style={{
      display: "inline-block", width: size, height: size, borderRadius: "50%",
      background: s.dot, flexShrink: 0, cursor: onClick ? "pointer" : "default",
      boxShadow: `0 0 0 2px ${s.bg}`, transition: "transform 0.1s",
    }} />
  );
}

function StatusPie({ node, size = 12 }) {
  const { counts, total } = collectLeafStatuses(node);
  if (total === 0) return null;
  const r = size / 2; const cx = r; const cy = r;
  const tipLines = STATUSES.filter(s => counts[s.id] > 0).map(s => `${s.label}: ${counts[s.id]}`).join("\n");
  const nonZero = STATUSES.filter(s => counts[s.id] > 0);
  if (nonZero.length === 1) {
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
        <title>{tipLines}</title>
        <circle cx={cx} cy={cy} r={r - 0.5} fill={nonZero[0].dot} />
      </svg>
    );
  }
  const slices = [];
  let angle = -Math.PI / 2;
  STATUSES.forEach(s => {
    const count = counts[s.id];
    if (!count) return;
    const sweep = (count / total) * 2 * Math.PI;
    const x1 = cx + (r - 0.5) * Math.cos(angle); const y1 = cy + (r - 0.5) * Math.sin(angle);
    const x2 = cx + (r - 0.5) * Math.cos(angle + sweep); const y2 = cy + (r - 0.5) * Math.sin(angle + sweep);
    const large = sweep > Math.PI ? 1 : 0;
    slices.push(<path key={s.id} d={`M ${cx} ${cy} L ${x1} ${y1} A ${r - 0.5} ${r - 0.5} 0 ${large} 1 ${x2} ${y2} Z`} fill={s.dot} />);
    angle += sweep;
  });
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      <title>{tipLines}</title>{slices}
    </svg>
  );
}

function StatusPicker({ status, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef();
  useClickOutside(ref, () => setOpen(false));
  const cur = statusById(status);
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <div onClick={e => { e.stopPropagation(); setOpen(v => !v); }}
        style={{
          display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer",
          padding: "2px 7px 2px 5px", borderRadius: 5, background: cur.bg,
          border: `1px solid ${cur.border}`, fontSize: 10, fontWeight: 600, color: cur.color,
          userSelect: "none", whiteSpace: "nowrap",
        }}>
        <StatusDot status={status} size={6} />{cur.label}
        <span style={{ fontSize: 8, opacity: 0.6 }}>▾</span>
      </div>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 500,
          background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8,
          boxShadow: "0 6px 20px rgba(0,0,0,0.12)", overflow: "hidden", minWidth: 130,
        }}>
          {STATUSES.map(s => (
            <div key={s.id} onMouseDown={e => { e.stopPropagation(); onChange(s.id); setOpen(false); }}
              style={{
                display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", cursor: "pointer", fontSize: 12,
                background: s.id === status ? s.bg : "transparent", color: s.id === status ? s.color : C.textMid,
                fontWeight: s.id === status ? 600 : 400,
              }}
              onMouseEnter={e => { if (s.id !== status) e.currentTarget.style.background = C.stripe; }}
              onMouseLeave={e => { if (s.id !== status) e.currentTarget.style.background = "transparent"; }}
            >
              <StatusDot status={s.id} size={7} />{s.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AssigneeInput({ value, onChange, allAssignees, allNames }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef();
  useClickOutside(ref, () => setOpen(false));
  const filtered = allAssignees.filter(a => a !== draft && a.toLowerCase().includes(draft.toLowerCase()));
  const commit = val => { onChange(val.trim()); setDraft(val.trim()); setOpen(false); };
  return (
    <div ref={ref} style={{ position: "relative", flex: 1 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <Avatar name={draft} allNames={allNames} size={18} />
        <input value={draft} placeholder="Unassigned"
          onChange={e => { setDraft(e.target.value); setOpen(true); onChange(e.target.value.trim()); }}
          onFocus={() => setOpen(true)}
          onKeyDown={e => { if (e.key === "Enter") commit(draft); if (e.key === "Escape") setOpen(false); }}
          style={{ flex: 1, border: "none", outline: "none", fontSize: 12, color: C.text, background: "transparent", fontFamily: "inherit" }}
        />
        {draft && <span onClick={() => { setDraft(""); onChange(""); }} style={{ cursor: "pointer", color: C.textSub, fontSize: 14 }}>×</span>}
      </div>
      {open && filtered.length > 0 && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 400,
          background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6,
          boxShadow: "0 4px 12px rgba(0,0,0,0.08)", overflow: "hidden",
        }}>
          {filtered.map(a => (
            <div key={a} onMouseDown={() => commit(a)} style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "7px 10px", cursor: "pointer", fontSize: 12, color: C.text,
            }}
              onMouseEnter={e => e.currentTarget.style.background = C.stripe}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            ><Avatar name={a} allNames={allNames} size={18} />{a}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function TagPicker({ tags, onChange }) {
  const [draft, setDraft] = useState("");
  const addTag = label => { const t = label.trim(); if (t && !tags.includes(t)) onChange([...tags, t]); setDraft(""); };
  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
        {PRESET_TAGS.map(({ label }) => {
          const active = tags.includes(label);
          const s = tagStyle(label);
          return (
            <span key={label} onClick={() => active ? onChange(tags.filter(t => t !== label)) : addTag(label)} style={{
              fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 4, cursor: "pointer",
              border: `1px solid ${active ? s.border : C.border}`,
              background: active ? s.bg : C.stripe, color: active ? s.color : C.textSub,
              transition: "all 0.12s",
            }}>{label}</span>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 4 }}>
        <input value={draft} placeholder="Custom tag…" onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") addTag(draft); if (e.key === "Escape") setDraft(""); }}
          style={{
            flex: 1, fontSize: 11, border: `1px solid ${C.border}`, borderRadius: 5,
            padding: "3px 7px", outline: "none", color: C.text, fontFamily: "inherit", background: C.surface,
          }} />
        <button onClick={() => addTag(draft)} style={{
          fontSize: 11, padding: "3px 8px", border: `1px solid ${C.border}`, borderRadius: 5,
          background: C.stripe, color: C.textMid, cursor: "pointer", fontFamily: "inherit",
        }}>Add</button>
      </div>
    </div>
  );
}

function ProgressBar({ counts, total, height = 10 }) {
  if (total === 0) return null;
  return (
    <div style={{ display: "flex", borderRadius: height / 2, overflow: "hidden", height, width: "100%", background: C.stripe, border: `1px solid ${C.border}` }}>
      {STATUSES.map(s => {
        const pct = (counts[s.id] || 0) / total * 100;
        if (pct === 0) return null;
        return <div key={s.id} title={`${s.label}: ${counts[s.id]}`} style={{ width: `${pct}%`, background: s.dot, minWidth: 4 }} />;
      })}
    </div>
  );
}

// Goal review primitives
function StatusBadge({ status }) {
  const s = statusById(status);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 600, padding: "2px 7px 2px 5px", borderRadius: 5, background: s.bg, border: `1px solid ${s.border}`, color: s.color, whiteSpace: "nowrap", flexShrink: 0 }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.dot, flexShrink: 0 }} />{s.label}
    </span>
  );
}

function DeltaPill({ delta, unit = "sp", invert = false }) {
  if (delta === 0) return <span style={{ fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", color: C.textSub }}>±0{unit}</span>;
  const good = invert ? delta < 0 : delta > 0;
  const color = good ? C.green : C.red; const bg = good ? C.greenLight : C.redLight;
  return <span style={{ fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, padding: "1px 6px", borderRadius: 4, background: bg, color }}>{delta > 0 ? "+" : ""}{delta}{unit}</span>;
}

function SpPill({ est, actual }) {
  if (actual == null || actual === est) return <span style={{ display: "inline-flex", alignItems: "center", fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, color: C.textSub, flexShrink: 0 }}>{est}sp</span>;
  const delta = actual - est; const color = delta <= 0 ? C.green : C.red; const bg = delta <= 0 ? C.greenLight : C.redLight;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, flexShrink: 0 }}>
      <span style={{ color: C.textSub, textDecoration: "line-through", opacity: 0.6 }}>{est}</span>
      <span style={{ color: C.textSub, fontSize: 8 }}>→</span>
      <span style={{ color, fontWeight: 700, padding: "1px 4px", borderRadius: 3, background: bg, border: `1px solid ${color}25` }}>{actual}sp</span>
    </span>
  );
}

function Section({ title, count, color, icon, children }) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div style={{ marginBottom: 14, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
      <div onClick={() => setCollapsed(v => !v)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 14px", borderBottom: collapsed ? "none" : `1px solid ${C.border}`, background: C.stripe, cursor: "pointer", userSelect: "none" }}>
        <span style={{ width: 20, height: 20, borderRadius: 5, background: color + "20", color, fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{icon}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: C.text, flex: 1 }}>{title}</span>
        <span style={{ fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, color, padding: "1px 7px", borderRadius: 4, background: color + "15" }}>{count}</span>
        <span style={{ fontSize: 9, color: C.textSub, marginLeft: 4 }}>{collapsed ? "▶" : "▼"}</span>
      </div>
      {!collapsed && <div>{children}</div>}
    </div>
  );
}

function ReviewRow({ children, onClick, style: extraStyle }) {
  return (
    <div onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderBottom: `1px solid ${C.border}`, ...extraStyle }}
      onMouseEnter={e => e.currentTarget.style.background = C.stripe}
      onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
      {children}
    </div>
  );
}

function EmptyRow({ children }) {
  return <div style={{ padding: "12px 14px", fontSize: 12, color: C.textSub, fontStyle: "italic" }}>{children}</div>;
}

function Summary({ pts }) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {[
        { label: "Impl",   val: pts.impl,   color: C.accent, bg: C.accentLight },
        { label: "Test",   val: pts.test,   color: C.green,  bg: C.greenLight  },
        { label: "Review", val: pts.review, color: C.amber,  bg: C.amberLight  },
        { label: "Total",  val: pts.total,  color: C.purple, bg: C.purpleLight },
      ].map(({ label, val, color, bg }) => (
        <div key={label} style={{ background: bg, border: `1px solid ${color}28`, borderRadius: 7, padding: "5px 12px", textAlign: "center", minWidth: 54 }}>
          <div style={{ fontSize: 10, color, letterSpacing: "0.07em", fontWeight: 600 }}>{label.toUpperCase()}</div>
          <div style={{ fontSize: 17, fontWeight: 700, color, fontFamily: "'IBM Plex Mono', monospace", lineHeight: 1.4 }}>{val}</div>
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SECTION 8: TASK DETAIL (shared content, popover, and modal)
═══════════════════════════════════════════════════════════════ */

/** Centered modal container — used by kanban/goals task detail */
function CenteredModal({ open, onClose, width = 340, children }) {
  const ref = useRef();
  useClickOutside(ref, onClose);
  if (!open) return null;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 10000, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div ref={ref} style={{
        background: C.surface, borderRadius: 12, width: "100%", maxWidth: width,
        boxShadow: "0 16px 48px rgba(0,0,0,0.2)", maxHeight: "85vh", overflowY: "auto",
        padding: "18px 20px",
      }}>
        {children}
      </div>
    </div>
  );
}

/** Breadcrumb display for task hierarchy */
function TaskBreadcrumb({ projectName, path }) {
  if (!projectName && (!path || path.length === 0)) return null;
  const parts = [projectName, ...(path || [])].filter(Boolean);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap", marginBottom: 10 }}>
      {parts.map((p, i) => (
        <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          {i > 0 && <span style={{ fontSize: 9, color: C.textSub }}>›</span>}
          <span style={{ fontSize: 10, fontWeight: 600, color: i === 0 ? C.accent : C.textSub, letterSpacing: "0.04em" }}>{p}</span>
        </span>
      ))}
    </div>
  );
}

/** Shared task detail body — used by both popover (estimate) and modal (kanban/goals) */
function TaskDetailContent({ task, pts, isLeaf, onUpdate, allAssignees, allNames, breadcrumb, readOnly }) {
  const fl = { fontSize: 10, fontWeight: 600, color: C.textSub, letterSpacing: "0.07em", marginBottom: 4 };
  const sec = { marginBottom: 12 };
  const divider = { height: 1, background: C.border, margin: "10px 0" };
  const rolledAssignees = !isLeaf ? collectLeafAssignees(task) : [];
  const [nameDraft, setNameDraft] = useState(task.name);
  const [descDraft, setDescDraft] = useState(task.description || "");
  useEffect(() => { setNameDraft(task.name); }, [task.name]);
  useEffect(() => { setDescDraft(task.description || ""); }, [task.description]);
  const commitName = () => { if (nameDraft.trim() && onUpdate) onUpdate(t => trackChange(t, "name", nameDraft.trim())); else setNameDraft(task.name); };
  const commitDesc = () => { if (onUpdate) onUpdate(t => trackChange(t, "description", descDraft)); };

  return (
    <>
      {breadcrumb && <TaskBreadcrumb projectName={breadcrumb.projectName} path={breadcrumb.path} />}

      <div style={{ ...sec, marginBottom: 10 }}>
        <div style={fl}>TASK NAME</div>
        {readOnly ? (
          <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{task.name}</div>
        ) : (
          <input value={nameDraft} onChange={e => setNameDraft(e.target.value)} onBlur={commitName}
            onKeyDown={e => { if (e.key === "Enter") { commitName(); e.target.blur(); } if (e.key === "Escape") { setNameDraft(task.name); e.target.blur(); } }}
            style={{ width: "100%", border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 8px", fontSize: 13, fontWeight: 600, color: C.text, fontFamily: "inherit", background: C.surface, outline: "none", boxSizing: "border-box" }}
          />
        )}
      </div>
      <div style={divider} />
      <div style={sec}>
        <div style={fl}>BREAKDOWN</div>
        {[
          { label: "Implementation", val: pts.impl, color: C.accent, editable: true },
          { label: "Testing", val: pts.test, color: C.green, editable: false },
          { label: "Review", val: pts.review, color: C.amber, editable: false },
        ].map(({ label, val, color, editable }) => (
          <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
            <span style={{ fontSize: 12, color: C.textMid }}>{label}</span>
            {editable && isLeaf && !readOnly
              ? <Stepper value={val} onChange={v => onUpdate(t => trackChange(t, "points", v))} color={color} />
              : <span style={{ fontSize: 12, fontWeight: 600, color, fontFamily: "'IBM Plex Mono', monospace" }}>{val}</span>}
          </div>
        ))}
        <div style={divider} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>Total</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: C.purple, fontFamily: "'IBM Plex Mono', monospace" }}>{pts.total}</span>
        </div>
      </div>
      <div style={divider} />
      <div style={sec}>
        <div style={fl}>ASSIGNEE{!isLeaf ? " (ROLLED UP)" : ""}</div>
        {isLeaf && !readOnly ? (
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: "5px 8px", background: C.surface }}>
            <AssigneeInput value={task.assignee || ""} onChange={v => onUpdate(t => trackChange(t, "assignee", v))} allAssignees={allAssignees} allNames={allNames} />
          </div>
        ) : isLeaf ? (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Avatar name={task.assignee} allNames={allNames} size={18} />
            <span style={{ fontSize: 12, color: C.textMid }}>{task.assignee || "Unassigned"}</span>
          </div>
        ) : rolledAssignees.length > 0 ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {rolledAssignees.map(a => (
              <div key={a} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: C.textMid }}>
                <Avatar name={a} allNames={allNames} size={18} />{a}
              </div>
            ))}
          </div>
        ) : <span style={{ fontSize: 12, color: C.textSub }}>No assignees yet.</span>}
      </div>
      <div style={sec}>
        <div style={fl}>DESCRIPTION</div>
        {readOnly ? (
          <div style={{ fontSize: 12, color: task.description ? C.text : C.textSub, lineHeight: 1.5 }}>{task.description || "No description."}</div>
        ) : (
          <textarea value={descDraft} onChange={e => setDescDraft(e.target.value)} onBlur={commitDesc}
            placeholder="Add a description…" rows={3}
            style={{ width: "100%", border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 8px", fontSize: 12, color: C.text, fontFamily: "inherit", background: C.surface, outline: "none", lineHeight: 1.5, minHeight: 60, resize: "vertical", boxSizing: "border-box" }} />
        )}
      </div>
      <div>
        <div style={fl}>TAGS</div>
        {readOnly ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {(task.tags || []).length > 0
              ? task.tags.map(tag => <TagChip key={tag} label={tag} />)
              : <span style={{ fontSize: 12, color: C.textSub }}>None</span>}
          </div>
        ) : (
          <TagPicker tags={task.tags || []} onChange={tags => onUpdate(t => trackChange(t, "tags", tags))} />
        )}
      </div>
      <div style={divider} />
      <div>
        <div style={fl}>STATUS</div>
        {readOnly ? (
          <StatusBadge status={task.status || "todo"} />
        ) : (
          <StatusPicker status={task.status || "todo"} onChange={s => onUpdate(t => withStatusChange(t, s))} />
        )}
      </div>
    </>
  );
}

/** Popover wrapper for estimate view (anchored to pill) */
function DetailPopover({ task, pts, isLeaf, onUpdate, allAssignees, allNames, open, onClose, anchorRef }) {
  return (
    <FixedPopover anchorRef={anchorRef} open={open} onClose={onClose}>
      <TaskDetailContent task={task} pts={pts} isLeaf={isLeaf} onUpdate={onUpdate}
        allAssignees={allAssignees} allNames={allNames} readOnly={false} />
    </FixedPopover>
  );
}

/** Modal wrapper for kanban/goals (centered) */
function TaskDetailModal({ task, pts, isLeaf, onUpdate, allAssignees, allNames, breadcrumb, open, onClose, readOnly }) {
  return (
    <CenteredModal open={open} onClose={onClose} width={360}>
      <TaskDetailContent task={task} pts={pts} isLeaf={isLeaf} onUpdate={onUpdate}
        allAssignees={allAssignees} allNames={allNames} breadcrumb={breadcrumb} readOnly={readOnly} />
    </CenteredModal>
  );
}

function PtsPill({ task, pts, isLeaf, onUpdate, allAssignees, allNames }) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef();
  return (
    <div style={{ position: "relative", flexShrink: 0 }} ref={anchorRef}>
      <div onClick={() => setOpen(v => !v)} style={{
        display: "inline-flex", alignItems: "center", borderRadius: 5,
        border: `1px solid ${open ? C.borderDark : C.border}`,
        overflow: "hidden", cursor: "pointer", userSelect: "none",
      }}>
        <span style={{ fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, color: C.accent, padding: "2px 8px", background: open ? C.accentLight : C.stripe, borderRight: `1px solid ${C.border}` }}>{pts.impl}</span>
        <span style={{ fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, color: C.purple, padding: "2px 8px", background: open ? C.purpleLight : C.stripe }}>{pts.total}</span>
      </div>
      <DetailPopover task={task} pts={pts} isLeaf={isLeaf} onUpdate={onUpdate} allAssignees={allAssignees} allNames={allNames} open={open} onClose={() => setOpen(false)} anchorRef={anchorRef} />
    </div>
  );
}

function ContextMenu({ anchorPos, task, onAddChild, onMarkDone, onReopen, onArchive, onClose }) {
  const ref = useRef();
  useClickOutside(ref, onClose);
  const menuW = 175, menuH = 140;
  const left = Math.min(Math.max(anchorPos.x - menuW, 8), window.innerWidth - menuW - 8);
  const top  = Math.max(anchorPos.y - menuH - 12, 8);
  const isDone = task.status === "done";
  const items = [
    { label: "Add subtask", icon: "+", color: C.accent, action: () => { onAddChild(); onClose(); } },
    isDone
      ? { label: "Reopen task", icon: "↺", color: C.amber, action: () => { onReopen(); onClose(); } }
      : { label: "Mark done", icon: "✓", color: C.green, action: () => { onMarkDone(); onClose(); } },
    { label: "Archive", icon: "⊘", color: C.textSub, action: () => { onArchive(); onClose(); } },
  ];
  return (
    <div ref={ref} style={{ position: "fixed", left, top, zIndex: 9999, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", overflow: "hidden", minWidth: menuW }}>
      {items.map(({ label, icon, color, action }) => (
        <button key={label} onClick={action} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "9px 14px", border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", fontSize: 13, color: C.text, textAlign: "left" }}
          onMouseEnter={e => e.currentTarget.style.background = C.stripe}
          onMouseLeave={e => e.currentTarget.style.background = "transparent"}
        >
          <span style={{ width: 20, height: 20, borderRadius: 5, background: color + "20", color, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>{icon}</span>
          {label}
        </button>
      ))}
    </div>
  );
}

function RatioEditor({ ratio, onChange }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(ratio.map(String));
  const ref = useRef();
  useClickOutside(ref, () => setEditing(false));
  const commit = () => { const parsed = draft.map(v => Math.max(0, parseFloat(v) || 0)); parsed[0] = 1; onChange(parsed); setEditing(false); };
  const labels = ["impl", "test", "review"];
  const colors = [C.accent, C.green, C.amber];
  if (!editing) return (
    <div onClick={() => { setDraft(ratio.map(String)); setEditing(true); }} title="Click to edit ratio"
      style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer", fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, padding: "3px 8px", borderRadius: 5, border: `1px solid ${C.border}`, background: C.stripe, color: C.textMid }}>
      {ratio.map((v, i) => <span key={i}><span style={{ color: colors[i] }}>{v % 1 === 0 ? v : v.toFixed(1)}</span>{i < 2 && <span style={{ color: C.textSub, margin: "0 2px" }}>:</span>}</span>)}
    </div>
  );
  return (
    <div ref={ref} style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 5, border: `1px solid ${C.accent}`, background: C.accentLight }}>
      {draft.map((v, i) => (
        <span key={i} style={{ display: "flex", alignItems: "center", gap: 3 }}>
          <span style={{ fontSize: 10, color: colors[i], fontWeight: 600, letterSpacing: "0.05em" }}>{labels[i].toUpperCase()}</span>
          {i === 0
            ? <span style={{ fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, color: C.accent }}>1</span>
            : <input value={v} onChange={e => { const d = [...draft]; d[i] = e.target.value; setDraft(d); }}
                onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
                style={{ width: 32, textAlign: "center", border: `1px solid ${C.border}`, borderRadius: 4, fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, color: colors[i], background: C.surface, outline: "none", padding: "1px 0" }} />
          }
          {i < 2 && <span style={{ color: C.textSub }}>:</span>}
        </span>
      ))}
      <button onClick={commit} style={{ marginLeft: 2, fontSize: 10, padding: "1px 6px", border: `1px solid ${C.accent}`, borderRadius: 4, background: C.accent, color: "#fff", cursor: "pointer", fontFamily: "inherit" }}>✓</button>
    </div>
  );
}

function TaskRow({ task, depth, onUpdate, onDelete, onArchive, onMarkDone, onAddChild, allAssignees, allNames, ratio }) {
  const isArchived = task.archived;
  const isDone = task.status === "done";
  const isMuted = isArchived || isDone;
  const pts = computePts(task, ratio, true);
  // Show all children: active first, done next, archived last
  const allChildren = (task.children || []);
  const liveChildren = allChildren.filter(c => !c.archived && c.status !== "done");
  const doneChildren = allChildren.filter(c => !c.archived && c.status === "done");
  const archivedChildren = allChildren.filter(c => c.archived);
  const orderedChildren = [...liveChildren, ...doneChildren, ...archivedChildren];
  const isLeaf = !allChildren.length;
  const hasKids = orderedChildren.length > 0;
  const paddingLeft = 14 + depth * 22;
  const nameColor  = isArchived ? C.textSub : isDone ? C.green : depth === 0 ? C.text : depth === 1 ? C.textMid : C.textSub;
  const nameWeight = isMuted ? 400 : depth === 0 ? 600 : depth === 1 ? 500 : 400;
  const pressTimer = useRef(null);
  const [menu, setMenu] = useState(null);
  const [pressing, setPressing] = useState(false);
  const startPress = e => { if (isArchived) return; const src = e.touches ? e.touches[0] : e; pressTimer.current = setTimeout(() => setMenu({ x: src.clientX, y: src.clientY }), 500); };
  const cancelPress = () => clearTimeout(pressTimer.current);
  const handleUpdate = useCallback(fn => onUpdate(task.id, fn), [task.id, onUpdate]);
  const rolledAssignees = !isLeaf ? collectLeafAssignees(task) : [];

  const rowBg = isArchived ? "#f7f7f9" : isDone ? "#f6faf6" : pressing ? C.stripe : depth === 0 ? "#fcfcfd" : C.surface;
  const rowOpacity = isArchived ? 0.5 : isDone ? 0.7 : 1;

  return (
    <div>
      <div
        onMouseDown={e => { startPress(e); setPressing(true); }}
        onMouseUp={() => { cancelPress(); setPressing(false); }}
        onMouseLeave={() => { cancelPress(); setPressing(false); }}
        onTouchStart={e => { startPress(e); setPressing(true); }}
        onTouchEnd={() => { cancelPress(); setPressing(false); }}
        onTouchMove={() => { cancelPress(); setPressing(false); }}
        style={{ display: "flex", alignItems: "center", gap: 6, paddingLeft, paddingRight: 12, paddingTop: 5, paddingBottom: 5, borderBottom: `1px solid ${C.border}`, background: rowBg, transition: "background 0.1s", minHeight: 34, cursor: "default", userSelect: "none", opacity: rowOpacity }}
      >
        <button onMouseDown={e => e.stopPropagation()}
          onClick={() => onUpdate(task.id, t => ({ ...t, collapsed: !t.collapsed }))}
          style={{ width: 14, height: 14, border: "none", background: "none", padding: 0, flexShrink: 0, cursor: hasKids ? "pointer" : "default", color: hasKids ? C.textSub : "transparent", fontSize: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {hasKids ? (task.collapsed ? "▶" : "▼") : ""}
        </button>
        {depth > 0 && <div style={{ width: 2, height: 14, borderRadius: 1, background: isDone ? C.green + "40" : isArchived ? C.textSub + "30" : C.border, flexShrink: 0 }} />}
        {isDone && !isArchived && <span style={{ fontSize: 11, flexShrink: 0, color: C.green }}>✓</span>}
        {isArchived && <span style={{ fontSize: 10, flexShrink: 0, color: C.textSub }}>⊘</span>}
        <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: nameWeight, color: nameColor, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", userSelect: "none", textDecoration: isMuted ? "line-through" : "none" }}>{task.name}</span>
        <div onMouseDown={e => e.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
          {isLeaf ? <StatusDot status={task.status || "todo"} size={7} onClick={() => {}} /> : <StatusPie node={task} size={12} />}
          {isLeaf ? <Avatar name={task.assignee} allNames={allNames} size={18} /> : <AssigneeStack assignees={rolledAssignees} allNames={allNames} />}
          {!isMuted && (task.tags || []).map(tag => <TagChip key={tag} label={tag} />)}
        </div>
        {isMuted ? (
          <span style={{ fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, color: isDone ? C.green : C.textSub, padding: "2px 8px", background: isDone ? C.greenLight : C.stripe, borderRadius: 5, border: `1px solid ${isDone ? C.green : C.textSub}20`, flexShrink: 0 }}>{pts.total}</span>
        ) : (
          <div onMouseDown={e => e.stopPropagation()}>
            <PtsPill task={task} pts={pts} isLeaf={isLeaf} onUpdate={handleUpdate} allAssignees={allAssignees} allNames={allNames} />
          </div>
        )}
      </div>
      {menu && <ContextMenu anchorPos={menu} task={task}
        onAddChild={() => onAddChild(task.id)}
        onMarkDone={() => onMarkDone(task.id)}
        onReopen={() => onMarkDone(task.id)}
        onArchive={() => onArchive(task.id)}
        onClose={() => setMenu(null)} />}
      {!task.collapsed && hasKids && orderedChildren.map(c => (
        <TaskRow key={c.id} task={c} depth={depth + 1} onUpdate={onUpdate} onDelete={onDelete} onArchive={onArchive} onMarkDone={onMarkDone} onAddChild={onAddChild} allAssignees={allAssignees} allNames={allNames} ratio={ratio} />
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SECTION 9: ESTIMATE VIEW (single project detail)
═══════════════════════════════════════════════════════════════ */
function EstimateView({ project, onUpdateProject, onDeleteProject }) {
  const { root, ratio } = project;
  const onUpdate   = useCallback((id, fn) => onUpdateProject(p => ({ ...p, root: mapTask(p.root, id, fn) })), [onUpdateProject]);
  const onArchive  = useCallback((id)     => onUpdateProject(p => ({ ...p, root: archiveTask(p.root, id) })), [onUpdateProject]);
  const onMarkDone = useCallback((id)     => onUpdateProject(p => ({
    ...p, root: mapTask(p.root, id, t => {
      const newStatus = t.status === "done" ? "todo" : "done";
      return withStatusChange(t, newStatus);
    })
  })), [onUpdateProject]);
  const onAddChild = useCallback((pid_)   => onUpdateProject(p => ({ ...p, root: addChild(p.root, pid_) })), [onUpdateProject]);
  const onRatioChange = useCallback(r => onUpdateProject(p => ({ ...p, ratio: r })), [onUpdateProject]);

  const totals = computePts(root, ratio, true);  // include archived so totals match all visible rows
  const allAssignees = useMemo(() => [...collectAllAssignees(root, new Set(), true)].sort(), [root]);
  const allNames = allAssignees;

  const [editingName, setEditingName] = useState(project.name === "New Project");
  const [nameDraft, setNameDraft] = useState(project.name);
  const nameInputRef = useRef();
  useEffect(() => { setNameDraft(project.name); }, [project.name]);
  useEffect(() => { if (editingName) nameInputRef.current?.select(); }, [editingName]);
  const commitName = () => {
    if (nameDraft.trim()) onUpdateProject(p => ({ ...p, name: nameDraft.trim() }));
    else setNameDraft(project.name);
    setEditingName(false);
  };

  const [pendingAdd, setPendingAdd] = useState(null);
  const isCompleted = effectiveProjectStatus(project) === "completed";

  const guardedAddGroup = () => {
    if (isCompleted) { setPendingAdd({ type: "group" }); return; }
    onUpdateProject(p => ({ ...p, root: { ...p.root, children: [...p.root.children, mkTask("New Feature Group")] } }));
  };
  const guardedAddChild = useCallback((pid_) => {
    if (isCompleted) { setPendingAdd({ type: "child", pid: pid_ }); return; }
    onAddChild(pid_);
  }, [isCompleted, onAddChild]);

  const confirmAdd = () => {
    if (!pendingAdd) return;
    if (pendingAdd.type === "group") {
      onUpdateProject(p => ({ ...p, root: { ...p.root, children: [...p.root.children, mkTask("New Feature Group")] } }));
    } else {
      onAddChild(pendingAdd.pid);
    }
    setPendingAdd(null);
  };

  return (
    <div style={{ maxWidth: 860, margin: "24px auto", padding: "0 16px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
        <div>
          {editingName ? (
            <input ref={nameInputRef} value={nameDraft} onChange={e => setNameDraft(e.target.value)} onBlur={commitName}
              onKeyDown={e => { if (e.key === "Enter") commitName(); if (e.key === "Escape") { setNameDraft(project.name); setEditingName(false); } }}
              style={{ fontSize: 18, fontWeight: 600, color: C.text, border: "none", borderBottom: `2px solid ${C.accent}`, outline: "none", background: "transparent", fontFamily: "inherit", width: "100%", marginBottom: 2 }} />
          ) : (
            <h2 onClick={() => setEditingName(true)} title="Click to rename"
              style={{ margin: "0 0 2px", fontSize: 18, fontWeight: 600, color: C.text, cursor: "text" }}>
              {project.name}
            </h2>
          )}
          <p style={{ margin: 0, fontSize: 12, color: C.textSub }}>
            Click the <span style={{ fontFamily: "'IBM Plex Mono',monospace", color: C.accent, fontWeight: 600 }}>impl · total</span> pill to edit. Hold a row to add/remove tasks.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <ProjectStatusPicker project={project} onChange={override => onUpdateProject(p => ({ ...p, statusOverride: override }))} onDelete={onDeleteProject} />
          <div style={{ width: 1, height: 20, background: C.border }} />
          <span style={{ fontSize: 10, color: C.textSub, fontWeight: 600, letterSpacing: "0.06em" }}>RATIO</span>
          <RatioEditor ratio={ratio} onChange={onRatioChange} />
          <div style={{ width: 1, height: 26, background: C.border }} />
          {[{ label: "Impl", val: totals.impl, color: C.accent }, { label: "Test", val: totals.test, color: C.green }, { label: "Review", val: totals.review, color: C.amber }, { label: "Total", val: totals.total, color: C.purple }].map(({ label, val, color }) => (
            <div key={label} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 9, color: C.textSub, letterSpacing: "0.08em", fontWeight: 600 }}>{label.toUpperCase()}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color, fontFamily: "'IBM Plex Mono', monospace", lineHeight: 1.2 }}>{val}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ marginBottom: 16 }}><Summary pts={totals} /></div>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "visible", boxShadow: "0 1px 6px rgba(0,0,0,0.05)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 12px 6px 50px", borderBottom: `1px solid ${C.border}`, background: C.stripe, borderRadius: "10px 10px 0 0" }}>
          <span style={{ fontSize: 10, fontWeight: 600, color: C.textSub, letterSpacing: "0.08em" }}>TASK</span>
          <span style={{ fontSize: 10, fontWeight: 600, color: C.textSub, letterSpacing: "0.08em", paddingRight: 2 }}>IMPL · TOTAL</span>
        </div>
        <div style={{ borderRadius: "0 0 10px 10px", overflow: "hidden" }}>
          {root.children.length === 0
            ? <div style={{ padding: 40, textAlign: "center", color: C.textSub, fontSize: 13 }}>No feature groups yet.</div>
            : root.children.map(c => <TaskRow key={c.id} task={c} depth={0} onUpdate={onUpdate} onDelete={onArchive} onArchive={onArchive} onMarkDone={onMarkDone} onAddChild={guardedAddChild} allAssignees={allAssignees} allNames={allNames} ratio={ratio} />)
          }
          <div style={{ padding: "9px 12px", borderTop: `1px solid ${C.border}`, background: C.stripe }}>
            <button onClick={guardedAddGroup}
              onMouseEnter={e => { e.currentTarget.style.borderColor = C.accent; e.currentTarget.style.color = C.accent; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = C.borderDark; e.currentTarget.style.color = C.textMid; }}
              style={{ background: "none", border: `1px dashed ${C.borderDark}`, borderRadius: 6, color: C.textMid, cursor: "pointer", padding: "4px 12px", fontSize: 12, fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6, transition: "all 0.15s" }}>
              + Add Feature Group
            </button>
          </div>
        </div>
      </div>

      {pendingAdd && (
        <div style={{ position: "fixed", inset: 0, zIndex: 10000, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: C.surface, borderRadius: 12, padding: 24, maxWidth: 380, width: "100%", boxShadow: "0 16px 48px rgba(0,0,0,0.2)" }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 8 }}>Reopen completed project?</div>
            <div style={{ fontSize: 13, color: C.textSub, marginBottom: 20, lineHeight: 1.5 }}>
              <strong style={{ color: C.text }}>{project.name}</strong> is marked as completed. Adding a new task will automatically reopen it to <em>In Progress</em>.
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setPendingAdd(null)} style={{ padding: "7px 16px", border: `1px solid ${C.border}`, borderRadius: 7, background: C.surface, color: C.textMid, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
              <button onClick={confirmAdd} style={{ padding: "7px 16px", border: `1px solid ${C.accent}`, borderRadius: 7, background: C.accent, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Add task &amp; reopen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SECTION 10: TIMELINE VIEW
═══════════════════════════════════════════════════════════════ */
function TimelineBlock({ item, hue }) {
  const W = Math.max(item.duration * TL.DAY_W - 8, 28);
  const H = TL.LANE_H - 22;
  const isActive = ACTIVE_STATUSES.has(item.task.status);
  const bg     = isActive ? `hsl(${hue},55%,89%)` : `hsl(${hue},40%,94%)`;
  const border  = isActive ? `2px solid hsl(${hue},55%,68%)` : `1.5px solid hsl(${hue},40%,82%)`;
  const txtMain = isActive ? `hsl(${hue},55%,20%)` : `hsl(${hue},40%,30%)`;
  const txtSub  = isActive ? `hsl(${hue},45%,38%)` : `hsl(${hue},35%,50%)`;
  const spLabel = item.burned > 0 ? `${item.pts.total}sp · ${item.remainingDays}d left` : `${item.pts.total}sp`;
  const statusDot = isActive ? <span style={{ width: 6, height: 6, borderRadius: "50%", background: statusById(item.task.status).dot, flexShrink: 0 }} /> : null;

  return (
    <div title={`${item.task.name} · ${item.pts.total}sp${item.burned > 0 ? ` · ~${item.remainingDays}d remaining (${item.burned.toFixed(1)}d burned)` : ""}`}
      style={{ position: "absolute", left: item.startDay * TL.DAY_W + 4, top: 11, width: W, height: H, borderRadius: 7, background: bg, border, display: "flex", alignItems: "center", padding: "0 8px", gap: 5, overflow: "hidden", userSelect: "none", transition: "box-shadow 0.12s" }}
      onMouseEnter={e => e.currentTarget.style.boxShadow = "0 2px 10px rgba(0,0,0,0.13)"}
      onMouseLeave={e => e.currentTarget.style.boxShadow = "none"}>
      {statusDot}
      <span style={{ fontSize: 11, fontWeight: isActive ? 700 : 600, color: txtMain, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>{item.task.name}</span>
      {W > 80 && <span style={{ fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, color: txtSub, flexShrink: 0 }}>{spLabel}</span>}
    </div>
  );
}

function LaneSidebar({ assignee, totalLaneDays, taskCount, allNames, compact }) {
  const hue = tlGetHue(assignee);
  const avatarEl = assignee !== "Unassigned"
    ? <Avatar name={assignee} allNames={allNames} size={compact ? 28 : 24} />
    : <div style={{ width: compact ? 28 : 24, height: compact ? 28 : 24, borderRadius: "50%", background: C.border, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><span style={{ fontSize: compact ? 12 : 11, color: C.textSub }}>?</span></div>;
  if (compact) return (
    <div style={{ width: TL.SIDEBAR_W_COMPACT, flexShrink: 0, borderRight: `1px solid ${C.border}`, background: C.stripe, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 5, padding: "8px 0", position: "sticky", left: 0, zIndex: 5 }}>
      {avatarEl}
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 9, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, color: `hsl(${hue},45%,38%)`, lineHeight: 1.4 }}>{totalLaneDays}d</div>
        <div style={{ fontSize: 9, fontFamily: "'IBM Plex Mono', monospace", color: C.textSub, lineHeight: 1.4 }}>{taskCount}t</div>
      </div>
    </div>
  );
  return (
    <div style={{ width: TL.SIDEBAR_W, flexShrink: 0, padding: "0 12px 0 14px", borderRight: `1px solid ${C.border}`, background: C.stripe, display: "flex", alignItems: "center", gap: 8, position: "sticky", left: 0, zIndex: 5 }}>
      {avatarEl}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{assignee}</div>
        <div style={{ fontSize: 10, color: C.textSub, fontFamily: "'IBM Plex Mono', monospace" }}>{totalLaneDays}d · {taskCount} task{taskCount !== 1 ? "s" : ""}</div>
      </div>
    </div>
  );
}

function TimelineView({ projects, taskOrder }) {
  const [velocity, setVelocity] = useState(2);
  const [startDate, setStartDate] = useState(() => { const d = new Date(); d.setHours(0,0,0,0); return d; });
  const windowWidth = useWindowWidth();
  const compact = windowWidth < 600;
  const sidebarW = compact ? TL.SIDEBAR_W_COMPACT : TL.SIDEBAR_W;

  const allLeafs = useMemo(() => {
    const all = [];
    projects.forEach(p => {
      const eff = effectiveProjectStatus(p);
      if (eff === "completed" || eff === "cancelled" || eff === "onhold") return;
      collectLeafTasks(p.root).forEach(t => all.push({ ...t, _projectName: p.name, _ratio: p.ratio }));
    });
    return all;
  }, [projects]);

  const defaultRatio = projects[0]?.ratio || [1, 1, 1];
  const taskById = useMemo(() => { const m = {}; allLeafs.forEach(t => m[t.id] = t); return m; }, [allLeafs]);

  const assigneeGroups = useMemo(() => {
    const m = new Map();
    allLeafs.forEach(t => { const k = t.assignee || "Unassigned"; if (!m.has(k)) m.set(k, []); m.get(k).push(t); });
    return m;
  }, [allLeafs]);

  const orderMap = useMemo(() => {
    const m = {};
    // Group tasks by assignee
    allLeafs.forEach(t => { const k = t.assignee || "Unassigned"; if (!m[k]) m[k] = []; m[k].push(t); });
    // Sort each group using canonical order (status band + user priority)
    const sorted = {};
    Object.keys(m).forEach(assignee => {
      const prioList = taskOrder[assignee] || [];
      sorted[assignee] = sortTasksByOrder(m[assignee], prioList).map(t => t.id);
    });
    return sorted;
  }, [allLeafs, taskOrder]);

  const getLayout = useCallback(assignee => {
    const ids = orderMap[assignee] || [];
    const assigneeTasks = ids.map(id => taskById[id]).filter(Boolean);
    const concurrencyMap = tlBuildConcurrencyMap(assigneeTasks);
    let day = 0;
    return ids.reduce((acc, id) => {
      const task = taskById[id];
      if (!task) return acc;
      if (task.status === "done" || task.archived) return acc;
      const ratio = task._ratio || defaultRatio;
      const pts = computePts(task, ratio);
      const fullDuration = Math.max(1, Math.ceil(pts.total / velocity));
      let remainingDays = fullDuration;
      let burned = 0;
      if (ACTIVE_STATUSES.has(task.status)) {
        burned = tlComputeBurnedDays(task, concurrencyMap);
        remainingDays = Math.max(1, Math.ceil(fullDuration - burned));
      }
      acc.push({ id, task, pts, duration: remainingDays, remainingDays, burned, startDay: day, endDay: day + remainingDays });
      day += remainingDays;
      return acc;
    }, []);
  }, [orderMap, taskById, velocity, defaultRatio]);

  const totalWorkingDays = useMemo(() => {
    let max = 0;
    for (const a of assigneeGroups.keys()) { const l = getLayout(a); if (l.length) max = Math.max(max, l[l.length - 1].endDay); }
    return Math.max(max + 5, 25);
  }, [assigneeGroups, getLayout]);

  const dates = useMemo(() => tlWorkingDaysArr(startDate, totalWorkingDays), [startDate, totalWorkingDays]);
  const todayOff = useMemo(() => { const t = new Date(); t.setHours(0,0,0,0); return dates.findIndex(d => d.getTime() === t.getTime()); }, [dates]);
  const monthGroups = useMemo(() => {
    const groups = []; let cur = null, cnt = 0;
    dates.forEach(d => { const key = d.toLocaleDateString("en-US", { month: "short", year: "numeric" }); if (key !== cur) { if (cur) groups.push({ label: cur, days: cnt }); cur = key; cnt = 0; } cnt++; });
    if (cur) groups.push({ label: cur, days: cnt });
    return groups;
  }, [dates]);
  const assignees = [...assigneeGroups.keys()];
  const allNames = assignees.filter(a => a !== "Unassigned");
  const dayMeta = useMemo(() => dates.map((d, i) => ({ mon: tlIsMonday(d), isToday: i === todayOff })), [dates, todayOff]);

  return (
    <div style={{ maxWidth: 1080, margin: "24px auto", padding: "0 16px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 600, color: C.text }}>Timeline</h1>
          <p style={{ margin: 0, fontSize: 12, color: C.textSub }}>Done tasks hidden · in-progress tasks show remaining days after accounting for time already spent · concurrent tasks split each day equally.</p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: C.textSub, letterSpacing: "0.07em" }}>START</span>
            <input type="date" value={startDate.toISOString().slice(0,10)} onChange={e => { const d = new Date(e.target.value + "T00:00:00"); if (!isNaN(d)) setStartDate(d); }}
              style={{ fontSize: 12, border: `1px solid ${C.border}`, borderRadius: 5, padding: "3px 8px", color: C.text, fontFamily: "inherit", background: C.surface, outline: "none" }} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: C.textSub, letterSpacing: "0.07em" }}>VELOCITY</span>
            <Stepper value={velocity} onChange={v => setVelocity(Math.max(1, v))} color={C.accent} />
            <span style={{ fontSize: 11, color: C.textSub }}>pts / day</span>
          </div>
        </div>
      </div>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden", boxShadow: "0 1px 6px rgba(0,0,0,0.05)", overflowX: "auto" }}>
        <div style={{ minWidth: sidebarW + totalWorkingDays * TL.DAY_W }}>
          <div style={{ display: "flex", borderBottom: `1px solid ${C.border}`, background: C.stripe }}>
            <div style={{ width: sidebarW, flexShrink: 0, borderRight: `1px solid ${C.border}`, position: "sticky", left: 0, background: C.stripe, zIndex: 12 }} />
            {monthGroups.map(({ label, days }, mi) => (
              <div key={mi} style={{ width: days * TL.DAY_W, flexShrink: 0, padding: "4px 8px", borderLeft: mi > 0 ? `2px solid ${C.accent}30` : "none", fontSize: 9, fontWeight: 700, color: C.accent, letterSpacing: "0.12em" }}>{label.toUpperCase()}</div>
            ))}
          </div>
          <div style={{ display: "flex", borderBottom: `2px solid ${C.border}`, background: C.stripe }}>
            <div style={{ width: sidebarW, flexShrink: 0, padding: "7px 14px", borderRight: `1px solid ${C.border}`, display: "flex", alignItems: "center", position: "sticky", left: 0, background: C.stripe, zIndex: 12 }}>
              {!compact && <span style={{ fontSize: 10, fontWeight: 600, color: C.textSub, letterSpacing: "0.08em" }}>ASSIGNEE</span>}
            </div>
            {dayMeta.map(({ mon, isToday }, i) => {
              const d = dates[i];
              return (
                <div key={i} style={{ width: TL.DAY_W, flexShrink: 0, textAlign: "center", padding: "4px 0", background: isToday ? C.accentLight : "transparent", borderLeft: mon ? `2.5px solid ${C.borderDark}` : `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 9, letterSpacing: "0.04em", fontWeight: 600, color: isToday ? C.accent : C.textSub }}>{d.toLocaleDateString("en-US", { weekday: "narrow" })}</div>
                  <div style={{ fontSize: 11, fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace", color: isToday ? C.accent : C.text }}>{d.getDate()}</div>
                </div>
              );
            })}
          </div>
          {assignees.length === 0
            ? <div style={{ padding: 48, textAlign: "center", color: C.textSub, fontSize: 13 }}>No assignees yet.</div>
            : assignees.map((a, li) => {
              const hue = tlGetHue(a);
              const layout = getLayout(a);
              const totalLaneDays = layout.reduce((s, l) => s + l.duration, 0);
              return (
                <div key={a} style={{ display: "flex", borderBottom: li < assignees.length - 1 ? `1px solid ${C.border}` : "none", minHeight: TL.LANE_H }}>
                  <LaneSidebar assignee={a} totalLaneDays={totalLaneDays} taskCount={layout.length} allNames={allNames} compact={compact} />
                  <div style={{ flex: 1, position: "relative", minHeight: TL.LANE_H, minWidth: totalWorkingDays * TL.DAY_W }}>
                    {dayMeta.map(({ mon }, i) => mon && <div key={i} style={{ position: "absolute", left: i * TL.DAY_W, top: 0, width: 0, height: "100%", borderLeft: `2.5px solid ${C.borderDark}`, pointerEvents: "none", zIndex: 0 }} />)}
                    {todayOff >= 0 && todayOff < totalWorkingDays && <div style={{ position: "absolute", left: todayOff * TL.DAY_W + TL.DAY_W / 2 - 1, top: 0, width: 2, height: "100%", background: C.accent + "22", pointerEvents: "none", zIndex: 1 }} />}
                    {layout.map(item => <TimelineBlock key={item.id} item={item} hue={hue} />)}
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SECTION 11: KANBAN VIEW
═══════════════════════════════════════════════════════════════ */
function KanbanContextMenu({ anchorPos, task, onStatusChange, onClose }) {
  const ref = useRef();
  useClickOutside(ref, onClose);
  const statusIdx = STATUSES.findIndex(s => s.id === (task.status || "todo"));
  const prevStatus = statusIdx > 0 ? STATUSES[statusIdx - 1] : null;
  const nextStatus = statusIdx < STATUSES.length - 1 ? STATUSES[statusIdx + 1] : null;
  const menuW = 180;
  const left = Math.min(Math.max(anchorPos.x - menuW, 8), window.innerWidth - menuW - 8);
  const top  = Math.max(anchorPos.y - 100, 8);
  const items = [
    prevStatus && { label: `← ${prevStatus.label}`, color: prevStatus.color, bg: prevStatus.bg, action: () => { onStatusChange(prevStatus.id); onClose(); } },
    nextStatus && { label: `${nextStatus.label} →`, color: nextStatus.color, bg: nextStatus.bg, action: () => { onStatusChange(nextStatus.id); onClose(); } },
  ].filter(Boolean);
  return (
    <div ref={ref} style={{ position: "fixed", left, top, zIndex: 9999, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", overflow: "hidden", minWidth: menuW }}>
      <div style={{ padding: "7px 14px 6px", borderBottom: `1px solid ${C.border}`, fontSize: 10, fontWeight: 700, color: C.textSub, letterSpacing: "0.08em" }}>
        {task.name.length > 22 ? task.name.slice(0, 22) + "…" : task.name}
      </div>
      {items.map(({ label, color, bg, action }) => (
        <button key={label} onClick={action} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "9px 14px", border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", fontSize: 13, color: C.text, textAlign: "left" }}
          onMouseEnter={e => e.currentTarget.style.background = bg}
          onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
          <span style={{ width: 22, height: 22, borderRadius: 5, background: bg, color, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, border: `1px solid ${color}30`, flexShrink: 0 }}>
            {label.startsWith("←") ? "←" : "→"}
          </span>
          <span>{label.replace(/^← /, "").replace(/ →$/, "")}</span>
        </button>
      ))}
    </div>
  );
}

function KanbanCard({ task, allNames, projectName, onStatusChange, onUpdateTask, index, onDragStart, projects }) {
  const pts = task.points || 0;
  const [menu, setMenu] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const pressTimer = useRef(null);
  const openMenu = (x, y) => setMenu({ x, y });
  const startPress = e => { const src = e.touches ? e.touches[0] : e; pressTimer.current = setTimeout(() => openMenu(src.clientX, src.clientY), 500); };
  const cancelPress = () => clearTimeout(pressTimer.current);

  const breadcrumb = useMemo(() => getTaskBreadcrumbAcrossProjects(projects || [], task.id), [projects, task.id]);
  const ratio = useMemo(() => {
    const p = (projects || []).find(pr => pr.id === task._projectId);
    return p?.ratio || [1, 1, 1];
  }, [projects, task._projectId]);
  const fullPts = computePts(task, ratio, true);

  return (
    <div style={{ display: "flex", gap: 0, alignItems: "stretch" }}>
      <div
        onPointerDown={e => { e.preventDefault(); onDragStart(index, e); }}
        style={{
          width: 20, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "grab", touchAction: "none", borderRadius: "8px 0 0 8px",
          background: C.stripe, border: `1px solid ${C.border}`, borderRight: "none",
          color: C.textSub, fontSize: 10, letterSpacing: "0.05em", userSelect: "none",
        }}
        title="Drag to reorder"
      >
        ⠿
      </div>
      <div
        onClick={() => { cancelPress(); setDetailOpen(true); }}
        onMouseDown={startPress} onMouseUp={cancelPress} onMouseLeave={cancelPress}
        onTouchStart={startPress} onTouchEnd={cancelPress} onTouchMove={cancelPress}
        onContextMenu={e => { e.preventDefault(); openMenu(e.clientX, e.clientY); }}
        style={{
          flex: 1, background: C.surface, border: `1px solid ${C.border}`, borderLeft: "none",
          borderRadius: "0 8px 8px 0", padding: "9px 11px",
          cursor: "pointer", boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
          userSelect: "none", WebkitUserSelect: "none",
        }}
        onMouseEnter={e => e.currentTarget.style.boxShadow = "0 3px 10px rgba(0,0,0,0.1)"}
        onMouseLeave={e => e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.05)"}
      >
        {projectName && <div style={{ fontSize: 9, fontWeight: 700, color: C.accent, letterSpacing: "0.07em", marginBottom: 4, textTransform: "uppercase" }}>{projectName}</div>}
        <div style={{ fontSize: 12, fontWeight: 600, color: C.text, lineHeight: 1.4, marginBottom: 7, wordBreak: "break-word" }}>{task.name}</div>
        {(task.tags || []).length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginBottom: 6 }}>
            {task.tags.slice(0, 2).map(tag => <TagChip key={tag} label={tag} />)}
            {task.tags.length > 2 && <span style={{ fontSize: 9, color: C.textSub, padding: "1px 4px" }}>+{task.tags.length - 2}</span>}
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
          <Avatar name={task.assignee} allNames={allNames} size={18} />
          {pts > 0 && <span style={{ fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, color: C.accent, background: C.accentLight, padding: "1px 5px", borderRadius: 3, border: `1px solid ${C.border}` }}>{pts}sp</span>}
        </div>
        {menu && <KanbanContextMenu anchorPos={menu} task={task} onStatusChange={onStatusChange} onClose={() => setMenu(null)} />}
      </div>
      {detailOpen && (
        <TaskDetailModal task={task} pts={fullPts} isLeaf={true}
          onUpdate={fn => onUpdateTask(task._projectId, task.id, fn)}
          allAssignees={allNames} allNames={allNames}
          breadcrumb={breadcrumb} open={true} onClose={() => setDetailOpen(false)} readOnly={false} />
      )}
    </div>
  );
}

/** Drag-and-drop column: reorder cards within a single assignee+status column */
function KanbanColumn({ assignee, statusId, tasks, allNames, activeProjects, onUpdateTaskInProject, onReorderTask, isLast, si, ai, projects }) {
  const [dragState, setDragState] = useState(null); // { fromIndex, currentIndex }
  const columnRef = useRef();
  const cardRefs = useRef([]);
  const COL_MIN_W = 200;

  const handleDragStart = useCallback((index, e) => {
    setDragState({ fromIndex: index, currentIndex: index });
    const el = e.currentTarget.closest('[data-kanban-card]') || e.currentTarget.parentElement;
    const startY = e.clientY;

    const handleMove = (moveE) => {
      const y = moveE.clientY ?? moveE.touches?.[0]?.clientY ?? startY;
      // Find which card slot we're hovering over
      const cards = cardRefs.current.filter(Boolean);
      let newIndex = tasks.length - 1;
      for (let i = 0; i < cards.length; i++) {
        const rect = cards[i].getBoundingClientRect();
        if (y < rect.top + rect.height / 2) { newIndex = i; break; }
      }
      setDragState(prev => prev ? { ...prev, currentIndex: newIndex } : null);
    };

    const handleEnd = () => {
      setDragState(prev => {
        if (prev && prev.fromIndex !== prev.currentIndex) {
          onReorderTask(assignee, tasks.map(t => t.id), prev.fromIndex, prev.currentIndex);
        }
        return null;
      });
      document.removeEventListener("pointermove", handleMove);
      document.removeEventListener("pointerup", handleEnd);
      document.removeEventListener("pointercancel", handleEnd);
    };

    document.addEventListener("pointermove", handleMove);
    document.addEventListener("pointerup", handleEnd);
    document.addEventListener("pointercancel", handleEnd);
  }, [tasks, assignee, onReorderTask]);

  // Build display order: if dragging, show the reordered preview
  const displayTasks = useMemo(() => {
    if (!dragState || dragState.fromIndex === dragState.currentIndex) return tasks;
    const arr = [...tasks];
    const [moved] = arr.splice(dragState.fromIndex, 1);
    arr.splice(dragState.currentIndex, 0, moved);
    return arr;
  }, [tasks, dragState]);

  return (
    <div ref={columnRef} style={{
      flex: 1, minWidth: COL_MIN_W, padding: "8px 8px",
      background: ai % 2 === 0 ? C.surface : "#fafbfc",
      borderLeft: `3px solid ${statusById(statusId).border}`,
      borderTop: `1px solid ${C.border}`,
      borderRight: si === STATUSES.length - 1 ? `1px solid ${C.border}` : "none",
      borderRadius: isLast && si === STATUSES.length - 1 ? "0 0 10px 0" : "0",
      minHeight: 100, display: "flex", flexDirection: "column", gap: 6,
    }}>
      {displayTasks.map((task, i) => {
        const isDragging = dragState && displayTasks[i]?.id === tasks[dragState.fromIndex]?.id && dragState.fromIndex !== dragState.currentIndex;
        return (
          <div key={task.id} ref={el => cardRefs.current[i] = el} data-kanban-card
            style={{ opacity: isDragging ? 0.85 : 1, transform: isDragging ? "scale(1.02)" : "none", transition: dragState ? "transform 0.1s" : "none" }}>
            <KanbanCard task={task} allNames={allNames}
              projectName={activeProjects.length > 1 ? task._projectName : null}
              onStatusChange={newStatus => onUpdateTaskInProject(task._projectId, task.id, t => withStatusChange(t, newStatus))}
              onUpdateTask={onUpdateTaskInProject}
              projects={projects}
              index={i}
              onDragStart={handleDragStart} />
          </div>
        );
      })}
      {tasks.length === 0 && <div style={{ flex: 1, minHeight: 56, borderRadius: 7, border: `2px dashed ${C.border}` }} />}
    </div>
  );
}

function KanbanView({ projects, onUpdateTaskInProject, taskOrder, onReorderTask }) {
  const activeProjects = useMemo(() => projects.filter(p => {
    const eff = effectiveProjectStatus(p);
    return eff !== "completed" && eff !== "cancelled" && eff !== "onhold";
  }), [projects]);

  const allTasks = useMemo(() => {
    const tasks = [];
    activeProjects.forEach(p => { collectLeafTasks(p.root).forEach(t => tasks.push({ ...t, _projectId: p.id, _projectName: p.name })); });
    return tasks;
  }, [activeProjects]);

  const allNames = useMemo(() => { const seen = new Set(); allTasks.forEach(t => { if (t.assignee) seen.add(t.assignee); }); return [...seen]; }, [allTasks]);
  const assignees = useMemo(() => { const seen = new Set(); const result = []; allTasks.forEach(t => { const k = t.assignee || "Unassigned"; if (!seen.has(k)) { seen.add(k); result.push(k); } }); return result; }, [allTasks]);

  // Sort tasks per assignee+status using canonical order
  const getColumnTasks = useCallback((assignee, statusId) => {
    const assigneeTasks = allTasks.filter(t => (t.assignee || "Unassigned") === assignee && (t.status || "todo") === statusId);
    const prioList = taskOrder[assignee] || [];
    return sortTasksByOrder(assigneeTasks, prioList);
  }, [allTasks, taskOrder]);

  const COL_MIN_W = 200;

  return (
    <div style={{ padding: "24px 16px 48px", maxWidth: "100%", overflowX: "auto" }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 600, color: C.text }}>Kanban</h1>
        <p style={{ margin: 0, fontSize: 12, color: C.textSub }}>All active projects aggregated. Drag the grip handle to reorder tasks within a column.</p>
      </div>
      <div style={{ display: "flex", gap: 0, marginBottom: 0, minWidth: `${assignees.length > 0 ? 140 + STATUSES.length * COL_MIN_W : 0}px` }}>
        <div style={{ width: 140, flexShrink: 0 }} />
        {STATUSES.map((s, si) => (
          <div key={s.id} style={{
            flex: 1, minWidth: COL_MIN_W, padding: "7px 14px 9px",
            background: s.bg, borderLeft: `3px solid ${s.border}`,
            borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`,
            borderRight: si === STATUSES.length - 1 ? `1px solid ${C.border}` : "none",
            borderRadius: si === 0 ? "10px 0 0 0" : si === STATUSES.length - 1 ? "0 10px 0 0" : "0",
            display: "flex", alignItems: "center", gap: 7,
          }}>
            <StatusDot status={s.id} size={8} />
            <span style={{ fontSize: 11, fontWeight: 700, color: s.color, letterSpacing: "0.06em" }}>{s.label.toUpperCase()}</span>
            <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace", color: s.color, background: s.bg, padding: "1px 6px", borderRadius: 4, border: `1px solid ${s.border}` }}>
              {allTasks.filter(t => (t.status || "todo") === s.id).length}
            </span>
          </div>
        ))}
      </div>
      {assignees.map((assignee, ai) => {
        const isLast = ai === assignees.length - 1;
        return (
          <div key={assignee} style={{ display: "flex", gap: 0, minWidth: `${140 + STATUSES.length * COL_MIN_W}px`, borderBottom: isLast ? `1px solid ${C.border}` : "none" }}>
            <div style={{ width: 140, flexShrink: 0, padding: "14px 10px 14px 14px", background: C.surface, borderLeft: `1px solid ${C.border}`, borderRight: `1px solid ${C.border}`, borderTop: `1px solid ${C.border}`, borderRadius: isLast ? "0 0 0 10px" : "0", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", gap: 6, paddingTop: 16 }}>
              {assignee !== "Unassigned"
                ? <Avatar name={assignee} allNames={allNames} size={30} />
                : <div style={{ width: 30, height: 30, borderRadius: "50%", background: C.stripe, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ fontSize: 14 }}>?</span></div>}
              <span style={{ fontSize: 11, fontWeight: 500, color: C.textMid, textAlign: "center", lineHeight: 1.3, maxWidth: 110, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{assignee}</span>
              <span style={{ fontSize: 9, fontFamily: "'IBM Plex Mono', monospace", color: C.textSub }}>{allTasks.filter(t => (t.assignee || "Unassigned") === assignee).length} tasks</span>
            </div>
            {STATUSES.map((s, si) => {
              const tasks = getColumnTasks(assignee, s.id);
              return (
                <KanbanColumn key={s.id} assignee={assignee} statusId={s.id} tasks={tasks} allNames={allNames}
                  activeProjects={activeProjects} onUpdateTaskInProject={onUpdateTaskInProject}
                  onReorderTask={onReorderTask} projects={projects}
                  isLast={isLast} si={si} ai={ai} />
              );
            })}
          </div>
        );
      })}
      {assignees.length === 0 && (
        <div style={{ padding: 48, textAlign: "center", color: C.textSub, fontSize: 13, background: C.surface, border: `1px solid ${C.border}`, borderTop: "none", borderRadius: "0 0 10px 10px" }}>
          No tasks yet — add tasks in a project's Estimate view.
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SECTION 12: PROJECTS VIEW (team-level project list)
═══════════════════════════════════════════════════════════════ */
function ProjectStatusPicker({ project, onChange, onDelete }) {
  const [open, setOpen] = useState(false);
  const [confirmPending, setConfirmPending] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const ref = useRef();
  useClickOutside(ref, () => setOpen(false));

  const derived   = deriveProjectStatus(project);
  const override  = project.statusOverride || null;
  const effective = override || derived;
  const cur       = projectStatusById(effective);
  const inFlightTasks = collectLeafTasks(project.root).filter(t => t.status === "inprogress" || t.status === "inreview");
  const applyOverride = (statusId) => { onChange(statusId); setOpen(false); };
  const handleOverrideClick = (statusId) => { setOpen(false); if (inFlightTasks.length > 0) setConfirmPending(statusId); else applyOverride(statusId); };

  const sectionLabel = (text) => (
    <div style={{ padding: "5px 10px 3px", fontSize: 9, fontWeight: 700, color: C.textSub, letterSpacing: "0.12em", userSelect: "none" }}>{text}</div>
  );

  return (
    <>
      <div ref={ref} style={{ position: "relative" }}>
        <div onClick={e => { e.stopPropagation(); setOpen(v => !v); }}
          style={{ display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer", padding: "2px 7px 2px 5px", borderRadius: 5, background: cur.bg, border: `1px solid ${cur.border}`, fontSize: 10, fontWeight: 600, color: cur.color, userSelect: "none", whiteSpace: "nowrap" }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: cur.dot, flexShrink: 0 }} />{cur.label}
          <span style={{ fontSize: 8, opacity: 0.6 }}>▾</span>
        </div>
        {open && (
          <div style={{ position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 500, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, boxShadow: "0 6px 20px rgba(0,0,0,0.12)", overflow: "hidden", minWidth: 180 }}>
            {sectionLabel("AUTO-DERIVED")}
            {DERIVED_PROJ_STATUSES.map(s => {
              const isActive = !override && derived === s.id;
              return (
                <div key={s.id} onClick={() => { onChange(null); setOpen(false); }}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", cursor: "pointer", fontSize: 12, background: isActive ? s.bg : "transparent", color: isActive ? s.color : C.textMid, fontWeight: isActive ? 600 : 400, opacity: s.id === derived ? 1 : 0.5 }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = C.stripe; }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "transparent"; }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: s.dot, flexShrink: 0 }} />{s.label}
                  {isActive && <span style={{ marginLeft: "auto", fontSize: 9, color: s.color }}>●</span>}
                </div>
              );
            })}
            <div style={{ height: 1, background: C.border, margin: "2px 0" }} />
            {sectionLabel("MANUAL OVERRIDE")}
            {OVERRIDE_PROJ_STATUSES.map(s => {
              const isActive = override === s.id;
              return (
                <div key={s.id} onClick={() => handleOverrideClick(s.id)}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", cursor: "pointer", fontSize: 12, background: isActive ? s.bg : "transparent", color: isActive ? s.color : C.textMid, fontWeight: isActive ? 600 : 400 }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = C.stripe; }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "transparent"; }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: s.dot, flexShrink: 0 }} />{s.label}
                  {isActive && <span style={{ marginLeft: "auto", fontSize: 9, color: s.color }}>●</span>}
                </div>
              );
            })}
            <div style={{ height: 1, background: C.border, margin: "2px 0" }} />
            <div onClick={() => { setOpen(false); setConfirmDelete(true); }}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", fontSize: 12, cursor: "pointer", color: C.red }}
              onMouseEnter={e => e.currentTarget.style.background = C.redLight}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              <span style={{ fontSize: 13 }}>🗑</span> Delete project
            </div>
          </div>
        )}
      </div>

      {confirmPending && (
        <div style={{ position: "fixed", inset: 0, zIndex: 10000, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={e => e.stopPropagation()}>
          <div style={{ background: C.surface, borderRadius: 12, padding: 24, maxWidth: 400, width: "100%", boxShadow: "0 16px 48px rgba(0,0,0,0.2)" }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 6 }}>{projectStatusById(confirmPending).label} — tasks still in flight</div>
            <div style={{ fontSize: 13, color: C.textSub, marginBottom: 14, lineHeight: 1.5 }}>{inFlightTasks.length} task{inFlightTasks.length !== 1 ? "s are" : " is"} still in progress or review. You may want to update them before proceeding.</div>
            <div style={{ background: C.stripe, borderRadius: 7, border: `1px solid ${C.border}`, padding: "8px 12px", marginBottom: 18, maxHeight: 140, overflowY: "auto" }}>
              {inFlightTasks.map(t => (
                <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0" }}>
                  <StatusDot status={t.status} size={6} />
                  <span style={{ fontSize: 12, color: C.textMid }}>{t.name}</span>
                  <span style={{ marginLeft: "auto", fontSize: 10, color: C.textSub }}>{t.assignee || "Unassigned"}</span>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setConfirmPending(null)} style={{ padding: "7px 16px", border: `1px solid ${C.border}`, borderRadius: 7, background: C.surface, color: C.textMid, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
              <button onClick={() => { applyOverride(confirmPending); setConfirmPending(null); }} style={{ padding: "7px 16px", border: `1px solid ${C.borderDark}`, borderRadius: 7, background: C.text, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Proceed anyway</button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div style={{ position: "fixed", inset: 0, zIndex: 10000, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={e => e.stopPropagation()}>
          <div style={{ background: C.surface, borderRadius: 12, padding: 24, maxWidth: 380, width: "100%", boxShadow: "0 16px 48px rgba(0,0,0,0.2)" }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 8 }}>Delete "{project.name}"?</div>
            <div style={{ fontSize: 13, color: C.textSub, marginBottom: 20, lineHeight: 1.5 }}>This will permanently remove the project and all its tasks. This cannot be undone.</div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setConfirmDelete(false)} style={{ padding: "7px 16px", border: `1px solid ${C.border}`, borderRadius: 7, background: C.surface, color: C.textMid, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
              <button onClick={() => { setConfirmDelete(false); onDelete(); }} style={{ padding: "7px 16px", border: `1px solid ${C.red}`, borderRadius: 7, background: C.red, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ProjectCard({ project, onSelect, onUpdateProject, onDeleteProject }) {
  const pts = computePts(project.root, project.ratio, true);  // include archived for consistent totals
  // Count all tasks: active statuses + archived as done
  const activeLeaves = collectLeafTasks(project.root);
  const allLeaves = collectAllLeafTasks(project.root);
  const archivedCount = allLeaves.length - activeLeaves.length;
  const counts = {};
  STATUSES.forEach(s => { counts[s.id] = 0; });
  activeLeaves.forEach(t => { counts[t.status || "todo"]++; });
  counts.done += archivedCount;  // archived tasks count as done
  const total = allLeaves.length;
  const doneCount = counts["done"] || 0;
  const completionPct = total > 0 ? Math.round(doneCount / total * 100) : 0;
  const assignees = collectLeafAssignees(project.root);
  const allNames = [...collectAllAssignees(project.root)].sort();

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "16px 18px", cursor: "pointer", transition: "all 0.15s", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.1)"; e.currentTarget.style.borderColor = C.borderDark; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = "0 1px 4px rgba(0,0,0,0.04)"; e.currentTarget.style.borderColor = C.border; }}
      onClick={() => onSelect(project.id)}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 10, gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{project.name}</div>
        </div>
        <div onClick={e => e.stopPropagation()}>
          <ProjectStatusPicker project={project} onChange={override => onUpdateProject(p => ({ ...p, statusOverride: override }))} onDelete={onDeleteProject} />
        </div>
      </div>
      <div style={{ marginBottom: 10 }}>
        <ProgressBar counts={counts} total={total} height={8} />
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5 }}>
          <span style={{ fontSize: 10, color: C.textSub }}>{doneCount}/{total} tasks done</span>
          <span style={{ fontSize: 10, fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace", color: completionPct === 100 ? C.green : completionPct > 0 ? C.accent : C.textSub }}>{completionPct}%</span>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ display: "flex", gap: 10 }}>
          {[{ label: "Impl", val: pts.impl, color: C.accent }, { label: "Total", val: pts.total, color: C.purple }].map(({ label, val, color }) => (
            <div key={label} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 8, color: C.textSub, letterSpacing: "0.07em", fontWeight: 600 }}>{label.toUpperCase()}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color, fontFamily: "'IBM Plex Mono', monospace" }}>{val}</div>
            </div>
          ))}
        </div>
        <AssigneeStack assignees={assignees} allNames={allNames} />
      </div>
    </div>
  );
}

function ProjectsView({ projects, onSelectProject, onUpdateProject, onDeleteProject, onAddProject }) {
  const totalPts = useMemo(() => {
    let impl = 0, total = 0;
    projects.forEach(p => { const pts = computePts(p.root, p.ratio, true); impl += pts.impl; total += pts.total; });
    return { impl, total };
  }, [projects]);

  const totalTasks = useMemo(() => {
    let done = 0, all = 0;
    projects.forEach(p => {
      const active = collectLeafTasks(p.root);
      const allLeaves = collectAllLeafTasks(p.root);
      const archivedCount = allLeaves.length - active.length;
      const activeDone = active.filter(t => t.status === "done").length;
      done += activeDone + archivedCount;
      all += allLeaves.length;
    });
    return { done, all };
  }, [projects]);

  const byStatus = useMemo(() => {
    const m = {};
    PROJECT_STATUSES.forEach(s => m[s.id] = projects.filter(p => effectiveProjectStatus(p) === s.id));
    return m;
  }, [projects]);

  return (
    <div style={{ maxWidth: 900, margin: "24px auto", padding: "0 16px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 600, color: C.text }}>Projects</h1>
          <p style={{ margin: 0, fontSize: 12, color: C.textSub }}>Click a project to open its estimates. Double-click a name to rename.</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {[{ label: "Total Story Points", val: totalPts.total, color: C.purple }, { label: "Tasks Complete", val: `${totalTasks.done}/${totalTasks.all}`, color: C.green }].map(({ label, val, color }) => (
            <div key={label} style={{ textAlign: "right" }}>
              <div style={{ fontSize: 9, color: C.textSub, fontWeight: 600, letterSpacing: "0.07em" }}>{label.toUpperCase()}</div>
              <div style={{ fontSize: 16, fontWeight: 700, color, fontFamily: "'IBM Plex Mono', monospace" }}>{val}</div>
            </div>
          ))}
        </div>
      </div>

      {PROJECT_STATUSES.map(s => {
        const group = byStatus[s.id] || [];
        if (group.length === 0) return null;
        return (
          <div key={s.id} style={{ marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: s.dot, flexShrink: 0 }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: s.color, letterSpacing: "0.08em" }}>{s.label.toUpperCase()}</span>
              <span style={{ fontSize: 10, color: C.textSub, fontFamily: "'IBM Plex Mono', monospace" }}>{group.length}</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
              {group.map(p => (
                <ProjectCard key={p.id} project={p} onSelect={onSelectProject} onUpdateProject={fn => onUpdateProject(p.id, fn)} onDeleteProject={() => onDeleteProject(p.id)} />
              ))}
            </div>
          </div>
        );
      })}

      {projects.length === 0 && (
        <div style={{ padding: 48, textAlign: "center", color: C.textSub, fontSize: 13, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12 }}>No projects yet. Add your first project below.</div>
      )}

      <button onClick={onAddProject}
        onMouseEnter={e => { e.currentTarget.style.borderColor = C.accent; e.currentTarget.style.color = C.accent; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = C.borderDark; e.currentTarget.style.color = C.textMid; }}
        style={{ marginTop: 8, background: "none", border: `1px dashed ${C.borderDark}`, borderRadius: 8, color: C.textMid, cursor: "pointer", padding: "10px 20px", fontSize: 13, fontFamily: "inherit", display: "flex", alignItems: "center", gap: 8, transition: "all 0.15s" }}>
        + New Project
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SECTION 13: GOALS VIEW
   Both the team-level summary and per-project drilldown.
   Uses resolveProjectGoalScope / resolveTeamGoalSummary
   from Section 4 — single source of truth, no duplication.
═══════════════════════════════════════════════════════════════ */

function SetGoalModal({ team, onConfirm, onCancel }) {
  const today = new Date().toISOString().slice(0,10);
  const [label, setLabel] = useState(() => { const d = new Date(); return `${d.toLocaleDateString("en-US", { month: "long" })} ${d.getFullYear()} Goal`; });
  const [targetDate, setTargetDate] = useState(() => { const d = new Date(); d.setMonth(d.getMonth() + 1); d.setDate(0); return d.toISOString().slice(0,10); });
  const [velocity, setVelocity] = useState(2);

  const activeProjects = team.projects.filter(p => { const eff = effectiveProjectStatus(p); return eff !== "completed" && eff !== "cancelled" && eff !== "onhold"; });
  const availableDays = workingDaysBetween(today, targetDate);
  const availablePoints = availableDays * velocity;

  const perProjectSummary = activeProjects.map(p => {
    const leaves = collectLeafTasks(p.root);
    const inScopeIds = new Set();
    let pts = 0;
    leaves.forEach(t => { const tp = computePts(t, p.ratio).total; if (pts + tp <= availablePoints) { inScopeIds.add(t.id); pts += tp; } });
    return { project: p, inScopeIds: [...inScopeIds], inScopeCount: inScopeIds.size, totalCount: leaves.length };
  });

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 10000, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: C.surface, borderRadius: 14, width: "100%", maxWidth: 520, boxShadow: "0 20px 60px rgba(0,0,0,0.2)", overflow: "hidden" }}>
        <div style={{ padding: "18px 22px 14px", borderBottom: `1px solid ${C.border}`, background: C.stripe }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: C.tealLight, border: `1px solid ${C.teal}30`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>🎯</div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>Set a Team Goal</div>
              <div style={{ fontSize: 11, color: C.textSub }}>Snapshot {team.name}'s current plan across all active projects</div>
            </div>
          </div>
        </div>
        <div style={{ padding: "18px 22px", maxHeight: "70vh", overflowY: "auto" }}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: "block", fontSize: 10, fontWeight: 600, color: C.textSub, letterSpacing: "0.07em", marginBottom: 5 }}>GOAL NAME</label>
            <input value={label} onChange={e => setLabel(e.target.value)} style={{ width: "100%", border: `1px solid ${C.border}`, borderRadius: 7, padding: "7px 10px", fontSize: 13, fontWeight: 500, color: C.text, fontFamily: "inherit", background: C.surface, outline: "none", boxSizing: "border-box" }} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: "block", fontSize: 10, fontWeight: 600, color: C.textSub, letterSpacing: "0.07em", marginBottom: 5 }}>TARGET DATE</label>
            <input type="date" value={targetDate} onChange={e => setTargetDate(e.target.value)} style={{ width: "100%", border: `1px solid ${C.border}`, borderRadius: 7, padding: "7px 10px", fontSize: 13, color: C.text, fontFamily: "inherit", background: C.surface, outline: "none", boxSizing: "border-box" }} />
          </div>
          <div style={{ marginBottom: 18 }}>
            <label style={{ display: "block", fontSize: 10, fontWeight: 600, color: C.textSub, letterSpacing: "0.07em", marginBottom: 5 }}>TEAM VELOCITY (pts / day)</label>
            <Stepper value={velocity} onChange={v => setVelocity(Math.max(1, v))} color={C.accent} />
          </div>

          <div style={{ background: C.tealLight, border: `1px solid ${C.teal}30`, borderRadius: 8, padding: "12px 14px", marginBottom: 18 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.teal, letterSpacing: "0.1em", marginBottom: 10 }}>SCOPE PREVIEW</div>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 10 }}>
              {[{ label: "Working days", val: availableDays }, { label: "Capacity (pts)", val: availablePoints }, { label: "Projects", val: activeProjects.length }].map(({ label, val }) => (
                <div key={label}>
                  <div style={{ fontSize: 9, color: C.teal, fontWeight: 600, letterSpacing: "0.06em" }}>{label.toUpperCase()}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: C.teal, fontFamily: "'IBM Plex Mono', monospace" }}>{val}</div>
                </div>
              ))}
            </div>
            {perProjectSummary.map(({ project, inScopeCount, totalCount }) => (
              <div key={project.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderTop: `1px solid ${C.teal}20` }}>
                <span style={{ flex: 1, fontSize: 12, color: C.teal, fontWeight: 500 }}>{project.name}</span>
                <span style={{ fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", color: C.teal }}>{inScopeCount}/{totalCount} tasks in scope</span>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button onClick={onCancel} style={{ padding: "7px 16px", border: `1px solid ${C.border}`, borderRadius: 7, background: C.surface, color: C.textMid, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
            <button onClick={() => {
              if (!label.trim()) return;
              const projectSnapshots = activeProjects.map(p => ({
                projectId: p.id, projectName: p.name,
                ratio: deepClone(p.ratio), root: deepClone(p.root),
                inScopeIds: perProjectSummary.find(x => x.project.id === p.id)?.inScopeIds || [],
              }));
              onConfirm({ id: uid(), label: label.trim(), createdAt: new Date().toISOString(), targetDate, velocity, projectSnapshots });
            }} style={{ padding: "7px 16px", border: `1px solid ${C.teal}`, borderRadius: 7, background: C.teal, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              Save Goal
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── ProjectGoalDetail: per-project drilldown (uses shared resolver) ─ */
function ProjectGoalDetail({ projectSnapshot, currentProject, onBack, projects, onUpdateTaskInProject }) {
  const resolved = resolveProjectGoalScope(projectSnapshot, currentProject);
  const { scopeItems, addedSince, statusCounts, totalEstPts, totalDonePts, completionPct, currentRatio } = resolved;

  const estimateDriftTasks = scopeItems.filter(x => x.estimateDrifted);
  const statusOrder = { done: 0, inreview: 1, inprogress: 2, todo: 3 };
  const sortedScope = [...scopeItems].sort((a, b) => {
    const aOrd = a.isArchived ? -1 : (statusOrder[a.status] ?? 9);
    const bOrd = b.isArchived ? -1 : (statusOrder[b.status] ?? 9);
    return aOrd - bOrd || a.name.localeCompare(b.name);
  });

  // Task detail modal state
  const [detailTaskId, setDetailTaskId] = useState(null);
  const detailInfo = useMemo(() => {
    if (!detailTaskId || !currentProject) return null;
    const allLeaves = collectAllLeafTasks(currentProject.root);
    const task = allLeaves.find(t => t.id === detailTaskId);
    if (!task) return null;
    const pts = computePts(task, currentRatio, true);
    const breadcrumb = { projectName: currentProject.name, path: getTaskBreadcrumb(currentProject.root, detailTaskId) };
    const allNames = [...collectAllAssignees(currentProject.root, new Set(), true)].sort();
    return { task, pts, breadcrumb, allNames };
  }, [detailTaskId, currentProject, currentRatio]);

  const clickableRow = { cursor: "pointer" };

  return (
    <div style={{ maxWidth: 860, margin: "24px auto", padding: "0 16px" }}>
      <button onClick={onBack}
        style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 18, padding: "5px 12px 5px 8px", border: `1px solid ${C.border}`, borderRadius: 7, background: C.surface, color: C.textMid, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = C.accent; e.currentTarget.style.color = C.accent; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.textMid; }}>
        ← Back to Goal Summary
      </button>

      <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 700, color: C.text }}>{projectSnapshot.projectName}</h2>
      <div style={{ fontSize: 12, color: C.textSub, marginBottom: 16 }}>{scopeItems.length} scoped tasks · {totalEstPts}sp estimated</div>

      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "14px 18px", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Delivery Progress</div>
          <span style={{ fontSize: 22, fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace", color: completionPct === 100 ? C.green : C.accent }}>{completionPct}%</span>
        </div>
        <ProgressBar counts={statusCounts} total={scopeItems.length} height={10} />
        <div style={{ display: "flex", gap: 16, marginTop: 8 }}>
          {[{ label: "Done", count: statusCounts.done, color: statusById("done").dot }, { label: "In Review", count: statusCounts.inreview, color: statusById("inreview").dot }, { label: "In Progress", count: statusCounts.inprogress, color: statusById("inprogress").dot }, { label: "To Do", count: statusCounts.todo, color: statusById("todo").dot }].map(({ label, count, color }) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: C.textMid }}>{label}</span>
              <span style={{ fontSize: 11, fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace", color: C.text }}>{count}</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 10, padding: "8px 10px", background: C.stripe, borderRadius: 6, border: `1px solid ${C.border}`, display: "flex", gap: 16 }}>
          <div>
            <div style={{ fontSize: 9, fontWeight: 600, color: C.textSub, letterSpacing: "0.07em" }}>PTS DELIVERED</div>
            <div style={{ fontSize: 14, fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace", color: C.green }}>{totalDonePts}<span style={{ fontSize: 11, color: C.textSub }}> / {totalEstPts}sp</span></div>
          </div>
        </div>
      </div>

      <Section title="Scoped Tasks" count={sortedScope.length} color={C.teal} icon={"◉"}>
        {sortedScope.map(x => (
          <ReviewRow key={x.id} onClick={() => !x.isMissing && setDetailTaskId(x.id)} style={x.isMissing ? undefined : clickableRow}>
            <Avatar name={x.assignee} size={18} />
            <span style={{ flex: 1, fontSize: 12, color: x.isArchived ? C.textMid : x.isMissing ? C.red : C.text, fontWeight: 500, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {x.name}{x.isMissing && <span style={{ fontSize: 10, color: C.red, marginLeft: 4 }}>(removed)</span>}
            </span>
            <SpPill est={x.estPts} actual={x.currPts} />
            <StatusBadge status={x.isArchived ? "done" : x.isMissing ? "todo" : x.status} />
          </ReviewRow>
        ))}
        {sortedScope.length === 0 && <EmptyRow>No scoped tasks.</EmptyRow>}
      </Section>

      <Section title="Estimate Drift" count={estimateDriftTasks.length} color={C.purple} icon={"≠"}>
        {estimateDriftTasks.length === 0
          ? <EmptyRow>All estimates held.</EmptyRow>
          : estimateDriftTasks.map(x => (
            <ReviewRow key={x.id} onClick={() => !x.isMissing && setDetailTaskId(x.id)} style={x.isMissing ? undefined : clickableRow}>
              <Avatar name={x.assignee} size={18} />
              <span style={{ flex: 1, fontSize: 12, color: C.text, fontWeight: 500, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.name}</span>
              <DeltaPill delta={x.ptsDelta} unit="sp" invert />
              <SpPill est={x.estPts} actual={x.currPts} />
              <StatusBadge status={x.isArchived ? "done" : x.status} />
            </ReviewRow>
          ))}
      </Section>

      {addedSince.length > 0 && (
        <Section title="Added Since Goal" count={addedSince.length} color={C.accent} icon="+">
          {addedSince.map(t => {
            const pts = computePts(t, currentRatio);
            return (
              <ReviewRow key={t.id} onClick={() => setDetailTaskId(t.id)} style={clickableRow}>
                <StatusBadge status={t.status || "todo"} />
                <Avatar name={t.assignee} size={18} />
                <span style={{ flex: 1, fontSize: 12, color: C.text, fontWeight: 500 }}>{t.name}</span>
                <span style={{ fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", color: C.textSub }}>{pts.total}sp</span>
              </ReviewRow>
            );
          })}
        </Section>
      )}

      {detailInfo && (
        <TaskDetailModal
          task={detailInfo.task} pts={detailInfo.pts} isLeaf={true}
          onUpdate={onUpdateTaskInProject ? (fn => onUpdateTaskInProject(currentProject.id, detailInfo.task.id, fn)) : null}
          allAssignees={detailInfo.allNames} allNames={detailInfo.allNames}
          breadcrumb={detailInfo.breadcrumb}
          open={true} onClose={() => setDetailTaskId(null)}
          readOnly={!onUpdateTaskInProject} />
      )}
    </div>
  );
}

/* ── GoalsView: team-level goal summary (uses shared resolver) ─ */
function GoalsView({ team, onDeleteSnapshot, onSelectProjectGoal }) {
  const { snapshots, projects } = team;
  const [selectedId, setSelectedId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  useEffect(() => {
    if (snapshots.length > 0 && !selectedId) setSelectedId(snapshots[snapshots.length - 1].id);
  }, [snapshots]);

  if (snapshots.length === 0) {
    return (
      <div style={{ maxWidth: 860, margin: "48px auto", padding: "0 16px", textAlign: "center" }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🎯</div>
        <div style={{ fontSize: 18, fontWeight: 600, color: C.text, marginBottom: 8 }}>No goals yet</div>
        <div style={{ fontSize: 13, color: C.textSub, maxWidth: 360, margin: "0 auto" }}>Set a goal using the 🎯 Set Goal button to snapshot your team's current plan. Then come back here to review progress.</div>
      </div>
    );
  }

  const snapshot = snapshots.find(s => s.id === selectedId) || snapshots[snapshots.length - 1];
  if (!snapshot) return null;

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const goalCreated = new Date(snapshot.createdAt); goalCreated.setHours(0, 0, 0, 0);
  const targetDate = new Date(snapshot.targetDate + "T00:00:00");
  const elapsedDays = workingDaysBetween(goalCreated, today);
  const totalGoalDays = workingDaysBetween(goalCreated, targetDate);
  const isPastDue = today > targetDate;
  const fmt = iso => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  // Use shared resolver — single source of truth
  const summary = resolveTeamGoalSummary(snapshot, projects, elapsedDays);
  const { projectSummaries, barCounts, totalScopeCount, totalEstPts, totalDonePts, completionPct, teamThroughput, expectedPtsDone } = summary;

  return (
    <div style={{ maxWidth: 900, margin: "24px auto", padding: "0 16px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 600, color: C.text }}>Goals</h1>
          <p style={{ margin: 0, fontSize: 12, color: C.textSub }}>Team-scoped delivery tracking. Click a project to drill down.</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 600, color: C.textSub, letterSpacing: "0.07em" }}>GOAL</span>
          <select value={snapshot.id} onChange={e => setSelectedId(e.target.value)} style={{ fontSize: 12, border: `1px solid ${C.border}`, borderRadius: 6, padding: "4px 8px", color: C.text, fontFamily: "inherit", background: C.surface, outline: "none", cursor: "pointer" }}>
            {snapshots.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <button onClick={() => setConfirmDelete(snapshot.id)} style={{ padding: "4px 8px", fontSize: 11, border: `1px solid ${C.border}`, borderRadius: 6, background: C.surface, color: C.textSub, cursor: "pointer", fontFamily: "inherit" }} title="Delete goal">🗑</button>
        </div>
      </div>

      {/* Goal meta */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "14px 18px", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 9, background: C.tealLight, border: `1px solid ${C.teal}30`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>🎯</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{snapshot.label}</div>
            <div style={{ fontSize: 11, color: C.textSub }}>Set {fmt(snapshot.createdAt)} · Target {fmt(snapshot.targetDate)}{isPastDue && <span style={{ color: C.red, fontWeight: 600, marginLeft: 6 }}>· Past due</span>}</div>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
          {[{ label: "Elapsed", val: `${elapsedDays}d`, color: isPastDue ? C.amber : C.accent }, { label: "Goal span", val: `${totalGoalDays}d`, color: C.teal }, { label: "Velocity", val: `${snapshot.velocity} pts/d`, color: C.accent }, { label: "Scope", val: `${totalEstPts}sp`, color: C.purple }].map(({ label, val, color }) => (
            <div key={label} style={{ textAlign: "center", padding: "6px 8px", borderRadius: 7, background: C.stripe, border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 9, color: C.textSub, fontWeight: 600, letterSpacing: "0.07em", marginBottom: 2 }}>{label.toUpperCase()}</div>
              <div style={{ fontSize: 11, fontWeight: 700, color, fontFamily: "'IBM Plex Mono', monospace" }}>{val}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Team progress */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "16px 18px", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Team Delivery Progress</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 22, fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace", color: completionPct === 100 ? C.green : completionPct >= 75 ? C.teal : C.accent }}>{completionPct}%</span>
            <span style={{ fontSize: 11, color: C.textSub }}>complete</span>
          </div>
        </div>
        <ProgressBar counts={barCounts} total={totalScopeCount} height={12} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 12px", marginTop: 10 }}>
          {[{ label: "Done", count: barCounts.done, color: statusById("done").dot }, { label: "In Review", count: barCounts.inreview, color: statusById("inreview").dot }, { label: "In Progress", count: barCounts.inprogress, color: statusById("inprogress").dot }, { label: "To Do", count: barCounts.todo, color: statusById("todo").dot }].map(({ label, count, color }) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: C.textMid, whiteSpace: "nowrap" }}>{label}</span>
              <span style={{ fontSize: 11, fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace", color: C.text }}>{count}</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {[
            { label: "DELIVERED", actual: totalDonePts, expected: expectedPtsDone, suffix: "sp" },
            { label: "REMAINING", actual: Math.max(0, totalEstPts - totalDonePts), expected: Math.max(0, totalEstPts - expectedPtsDone), suffix: "sp", invertColor: true },
          ].map(({ label, actual, expected, suffix, invertColor }) => {
            const onTrack = invertColor ? actual <= expected * 1.05 : actual >= expected;
            const slightlyOff = invertColor ? actual <= expected * 1.3 : actual >= expected * 0.75;
            const statusColor = onTrack ? C.green : slightlyOff ? C.amber : C.red;
            const delta = actual - expected;
            const deltaStr = delta === 0 ? "on target" : `${delta > 0 ? "+" : ""}${delta}sp`;
            return (
              <div key={label} style={{ padding: "9px 12px", background: C.stripe, borderRadius: 7, border: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 9, fontWeight: 600, color: C.textSub, letterSpacing: "0.07em", marginBottom: 4 }}>{label}</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                  <span style={{ fontSize: 17, fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace", color: statusColor, lineHeight: 1 }}>{actual}</span>
                  <span style={{ fontSize: 11, color: C.textSub, fontFamily: "'IBM Plex Mono', monospace" }}>{suffix}</span>
                </div>
                <div style={{ fontSize: 10, color: C.textSub, marginTop: 2, fontFamily: "'IBM Plex Mono', monospace" }}>
                  <span style={{ color: C.textSub }}>{expected}{suffix} exp </span>
                  <span style={{ color: statusColor, fontWeight: 600 }}>({deltaStr})</span>
                </div>
              </div>
            );
          })}
          <div style={{ padding: "9px 12px", background: C.stripe, borderRadius: 7, border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 9, fontWeight: 600, color: C.textSub, letterSpacing: "0.07em", marginBottom: 4 }}>THROUGHPUT</div>
            <div style={{ fontSize: 17, fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace", color: C.teal, lineHeight: 1 }}>{teamThroughput ?? "—"}</div>
            <div style={{ fontSize: 10, color: C.textSub, marginTop: 2 }}>pts / day</div>
          </div>
          <div style={{ padding: "9px 12px", background: C.stripe, borderRadius: 7, border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 9, fontWeight: 600, color: C.textSub, letterSpacing: "0.07em", marginBottom: 4 }}>PACE</div>
            <div style={{ fontSize: 17, fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace", lineHeight: 1, color: totalDonePts >= expectedPtsDone ? C.green : totalDonePts >= expectedPtsDone * 0.75 ? C.amber : C.red }}>
              {totalDonePts >= expectedPtsDone ? "On track" : "Behind"}
            </div>
            <div style={{ fontSize: 10, color: C.textSub, marginTop: 2 }}>vs plan</div>
          </div>
        </div>
      </div>

      {/* Per-project cards */}
      {(() => {
        const active  = projectSummaries.filter(s => !s.isPaused);
        const paused  = projectSummaries.filter(s => s.isPaused);

        const renderCard = (s, muted = false) => {
          const { pSnap, resolved, currentEffectiveStatus, expectedPts, throughput } = s;
          const pct = resolved.completionPct;
          const pDonePts = resolved.totalDonePts;
          const overrideStatus = currentEffectiveStatus === "onhold" || currentEffectiveStatus === "cancelled" ? projectStatusById(currentEffectiveStatus) : null;
          const paceColor = pDonePts >= expectedPts ? C.green : pDonePts >= expectedPts * 0.75 ? C.amber : C.red;
          const paceLabel = pDonePts >= expectedPts ? "On track" : pDonePts >= expectedPts * 0.75 ? "Slightly behind" : "Behind";
          return (
            <div key={pSnap.projectId} onClick={() => onSelectProjectGoal(snapshot.id, pSnap.projectId)}
              style={{ background: muted ? C.stripe : C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "14px 16px", cursor: "pointer", transition: "all 0.15s", boxShadow: "0 1px 4px rgba(0,0,0,0.04)", opacity: muted ? 0.75 : 1 }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.1)"; e.currentTarget.style.borderColor = muted ? C.borderDark : C.teal; e.currentTarget.style.opacity = "1"; }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = "0 1px 4px rgba(0,0,0,0.04)"; e.currentTarget.style.borderColor = C.border; e.currentTarget.style.opacity = muted ? "0.75" : "1"; }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, gap: 6 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: muted ? C.textMid : C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pSnap.projectName}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
                  {overrideStatus && <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 3, background: overrideStatus.bg, color: overrideStatus.color, border: `1px solid ${overrideStatus.border}` }}>{overrideStatus.label}</span>}
                  <span style={{ fontSize: 16, fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace", color: pct === 100 ? C.green : pct > 0 ? C.accent : C.textSub }}>{pct}%</span>
                </div>
              </div>
              <div style={{ marginBottom: 10 }}>
                <ProgressBar counts={resolved.statusCounts} total={resolved.scopeItems.length} height={6} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 8 }}>
                {[
                  { label: "DELIVERED", actual: pDonePts, expected: expectedPts, suffix: "sp", invertColor: false },
                  { label: "REMAINING", actual: Math.max(0, resolved.totalEstPts - pDonePts), expected: Math.max(0, resolved.totalEstPts - expectedPts), suffix: "sp", invertColor: true },
                ].map(({ label, actual, expected, suffix, invertColor }) => {
                  const onTrack = invertColor ? actual <= expected * 1.05 : actual >= expected;
                  const slightlyOff = invertColor ? actual <= expected * 1.3 : actual >= expected * 0.75;
                  const col = muted ? C.textSub : (onTrack ? C.green : slightlyOff ? C.amber : C.red);
                  const delta = actual - expected;
                  const deltaStr = delta === 0 ? "on target" : `${delta > 0 ? "+" : ""}${delta}sp`;
                  return (
                    <div key={label} style={{ padding: "7px 9px", background: muted ? C.surface : C.stripe, borderRadius: 6, border: `1px solid ${C.border}` }}>
                      <div style={{ fontSize: 8, fontWeight: 600, color: C.textSub, letterSpacing: "0.06em", marginBottom: 3 }}>{label}</div>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
                        <span style={{ fontSize: 14, fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace", color: col, lineHeight: 1 }}>{actual}</span>
                        <span style={{ fontSize: 10, color: C.textSub, fontFamily: "'IBM Plex Mono', monospace" }}>{suffix}</span>
                      </div>
                      <div style={{ fontSize: 9, marginTop: 1, fontFamily: "'IBM Plex Mono', monospace" }}>
                        <span style={{ color: C.textSub }}>{expected}{suffix} exp </span>
                        <span style={{ color: col, fontWeight: 600 }}>({deltaStr})</span>
                      </div>
                    </div>
                  );
                })}
                <div style={{ padding: "7px 9px", background: muted ? C.surface : C.stripe, borderRadius: 6, border: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 8, fontWeight: 600, color: C.textSub, letterSpacing: "0.06em", marginBottom: 3 }}>THROUGHPUT</div>
                  <div style={{ fontSize: 14, fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace", color: muted ? C.textSub : C.teal, lineHeight: 1 }}>{throughput ?? "—"}</div>
                  <div style={{ fontSize: 9, color: C.textSub, marginTop: 1 }}>pts / day</div>
                </div>
                <div style={{ padding: "7px 9px", background: muted ? C.surface : C.stripe, borderRadius: 6, border: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 8, fontWeight: 600, color: C.textSub, letterSpacing: "0.06em", marginBottom: 3 }}>PACE</div>
                  <div style={{ fontSize: 14, fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace", color: muted ? C.textSub : paceColor, lineHeight: 1 }}>{paceLabel}</div>
                  <div style={{ fontSize: 9, color: C.textSub, marginTop: 1 }}>vs plan</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {resolved.driftPts > 0 && <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 3, background: C.purpleLight, color: C.purple, fontWeight: 600 }}>{resolved.driftPts}sp drift</span>}
                {resolved.creepCount > 0 && <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 3, background: C.amberLight, color: C.amber, fontWeight: 600 }}>+{resolved.creepCount} tasks</span>}
                {resolved.driftPts === 0 && resolved.creepCount === 0 && <span style={{ fontSize: 9, color: C.textSub }}>No drift or creep</span>}
              </div>
              <div style={{ marginTop: 6, fontSize: 10, color: muted ? C.textSub : C.teal, fontWeight: 500 }}>Click to drill down →</div>
            </div>
          );
        };

        return (
          <>
            {active.length > 0 && (
              <>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.textSub, letterSpacing: "0.08em", marginBottom: 10 }}>PROJECT BREAKDOWN</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12, marginBottom: 20 }}>
                  {active.map(s => renderCard(s, false))}
                </div>
              </>
            )}
            {paused.length > 0 && (
              <>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.textSub, letterSpacing: "0.08em", marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
                  PAUSED / CANCELLED
                  <span style={{ fontSize: 10, color: C.textSub, fontWeight: 400, letterSpacing: 0 }}>— excluded from team totals above</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12, marginBottom: 20 }}>
                  {paused.map(s => renderCard(s, true))}
                </div>
              </>
            )}
          </>
        );
      })()}

      {confirmDelete && (
        <div style={{ position: "fixed", inset: 0, zIndex: 10000, background: "rgba(0,0,0,0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: C.surface, borderRadius: 12, padding: 24, maxWidth: 340, width: "100%", margin: 16, boxShadow: "0 12px 40px rgba(0,0,0,0.2)" }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 8 }}>Delete this goal?</div>
            <div style={{ fontSize: 12, color: C.textSub, marginBottom: 20 }}>This will permanently remove the snapshot. This cannot be undone.</div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setConfirmDelete(null)} style={{ padding: "6px 14px", border: `1px solid ${C.border}`, borderRadius: 6, background: C.surface, color: C.textMid, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
              <button onClick={() => { onDeleteSnapshot(confirmDelete); setConfirmDelete(null); setSelectedId(null); }} style={{ padding: "6px 14px", border: `1px solid ${C.red}`, borderRadius: 6, background: C.red, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SECTION 14: DEMO DATA
═══════════════════════════════════════════════════════════════ */
const INITIAL_TEAMS = (() => {
  const daysAgo = n => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
  const cl = (field, from, to, dAgo) => ({ field, from, to, at: daysAgo(dAgo) });

  const loginTask     = Object.assign(mkTask("Login page"),              { points: 3, assignee: "Alice Chen", tags: [], status: "done", changeLog: [cl("created", null, "Login page", 30), cl("status", "todo", "inprogress", 26), cl("status", "inprogress", "done", 22)] });
  const oauthTask     = Object.assign(mkTask("OAuth integration"),       { points: 8, assignee: "Bob Smith", tags: ["High Risk"], status: "inprogress", changeLog: [cl("created", null, "OAuth integration", 30), cl("status", "todo", "inprogress", 20), cl("points", 5, 7, 16), cl("points", 7, 8, 10)] });
  const pwResetTask   = Object.assign(mkTask("Password reset flow"),     { points: 2, assignee: "Amy Lee", tags: ["Unestimated"], status: "todo", changeLog: [cl("created", null, "Password reset flow", 30)] });
  const chartsTask    = Object.assign(mkTask("Charts & analytics"),      { points: 5, assignee: "Alice Chen", status: "inreview", changeLog: [cl("created", null, "Charts & analytics", 30), cl("status", "todo", "inprogress", 18), cl("points", 3, 5, 12), cl("status", "inprogress", "inreview", 5)] });
  const dataTableTask = Object.assign(mkTask("Data table with filters"), { points: 3, assignee: "Bob Smith", status: "todo", changeLog: [cl("created", null, "Data table with filters", 30)] });
  const restTask      = Object.assign(mkTask("REST endpoints"),          { points: 6, assignee: "Bob Smith", status: "inprogress", changeLog: [cl("created", null, "REST endpoints", 30), cl("status", "todo", "inprogress", 14), cl("points", 8, 6, 11)] });
  const authMwTask    = Object.assign(mkTask("Auth middleware"),         { points: 3, assignee: "Alice Chen", tags: ["Needs Review"], status: "done", changeLog: [cl("created", null, "Auth middleware", 30), cl("status", "todo", "inprogress", 25), cl("status", "inprogress", "done", 20)] });
  const errBoundaryTask = Object.assign(mkTask("Error boundary components"), { points: 4, assignee: "Alice Chen", tags: ["Nice to Have"], status: "todo", changeLog: [cl("created", null, "Error boundary components", 10)] });
  const notifTask     = Object.assign(mkTask("Email notifications"),     { points: 6, assignee: "Amy Lee", status: "inprogress", changeLog: [cl("created", null, "Email notifications", 12), cl("status", "todo", "inprogress", 7)] });

  const p1Root = {
    id: "root-p1", name: "root", _isRoot: true, children: [
      { ...mkTask("Frontend"), id: "fg-fe", children: [
        { ...mkTask("Authentication"), id: "fg-auth", children: [loginTask, oauthTask, pwResetTask] },
        { ...mkTask("Dashboard"), id: "fg-dash", children: [chartsTask, dataTableTask, errBoundaryTask] },
      ]},
      { ...mkTask("Backend"), id: "fg-be", children: [
        { ...mkTask("API Layer"), id: "fg-api", children: [restTask, authMwTask, notifTask] },
      ]},
    ], collapsed: false,
  };

  const p1SnapRoot = deepClone(p1Root);
  const resetStatuses = node => ({ ...node, status: "todo", archived: false, changeLog: node.changeLog?.slice(0,1) || [], children: node.children?.map(resetStatuses) || [] });
  const p1SnapRootClean = resetStatuses(p1SnapRoot);
  const patchSnapPts = (node, patchMap) => ({ ...node, points: patchMap[node.id] ?? node.points, children: node.children?.map(c => patchSnapPts(c, patchMap)) || [] });
  const p1SnapRootPatched = patchSnapPts(p1SnapRootClean, {
    [oauthTask.id]:  5,
    [chartsTask.id]: 3,
    [restTask.id]:   8,
  });

  const p1 = { id: "proj-1", name: "Q1 Web Platform", statusOverride: null, root: p1Root, ratio: [1, 1, 1], createdAt: daysAgo(60) };

  const navTask      = Object.assign(mkTask("Bottom nav redesign"),  { points: 3, assignee: "Diana Park", status: "done", changeLog: [cl("created", null, "Bottom nav redesign", 45), cl("status", "todo", "done", 30)] });
  const onboardTask  = Object.assign(mkTask("Onboarding flow"),      { points: 8, assignee: "Diana Park", status: "inprogress", changeLog: [cl("created", null, "Onboarding flow", 45), cl("status", "todo", "inprogress", 15)] });
  const pushTask     = Object.assign(mkTask("Push notifications"),   { points: 5, assignee: "Carlos Wu", status: "inreview", changeLog: [cl("created", null, "Push notifications", 45), cl("status", "todo", "inprogress", 20), cl("status", "inprogress", "inreview", 8)] });
  const profileTask  = Object.assign(mkTask("Profile settings"),     { points: 3, assignee: "Diana Park", tags: ["Needs Review"], status: "todo", changeLog: [cl("created", null, "Profile settings", 45)] });
  const deepLinkTask = Object.assign(mkTask("Deep linking"),         { points: 4, assignee: "Carlos Wu", status: "todo", changeLog: [cl("created", null, "Deep linking", 45)] });
  const offlineTask  = Object.assign(mkTask("Offline mode"),         { points: 6, assignee: "Carlos Wu", tags: ["High Risk"], status: "todo", changeLog: [cl("created", null, "Offline mode", 45)] });

  const p2Root = { id: "root-p2", name: "root", _isRoot: true, children: [
    { ...mkTask("UX"), id: "fg-ux", children: [navTask, onboardTask, profileTask] },
    { ...mkTask("Platform"), id: "fg-platform", children: [pushTask, deepLinkTask, offlineTask] },
  ], collapsed: false };

  const p2 = { id: "proj-2", name: "Mobile App Redesign", statusOverride: null, root: p2Root, ratio: [1, 0.5, 0.5], createdAt: daysAgo(50) };

  const tokensTask = Object.assign(mkTask("Color & spacing tokens"), { points: 2, assignee: "Alice Chen", status: "done", changeLog: [cl("created", null, "Color & spacing tokens", 90), cl("status", "todo", "done", 70)] });
  const buttonTask = Object.assign(mkTask("Button components"),      { points: 3, assignee: "Diana Park", status: "done", changeLog: [cl("created", null, "Button components", 90), cl("status", "todo", "done", 60)] });
  const formTask   = Object.assign(mkTask("Form components"),        { points: 5, assignee: "Diana Park", status: "done", changeLog: [cl("created", null, "Form components", 90), cl("status", "todo", "done", 40)] });
  const docTask    = Object.assign(mkTask("Storybook docs"),         { points: 4, assignee: "Alice Chen", status: "done", changeLog: [cl("created", null, "Storybook docs", 90), cl("status", "todo", "done", 20)] });

  const p3Root = { id: "root-p3", name: "root", _isRoot: true, children: [
    { ...mkTask("Core"), id: "fg-core", children: [tokensTask, buttonTask, formTask, docTask] },
  ], collapsed: false };

  const p3 = { id: "proj-3", name: "Design System v2", statusOverride: null, root: p3Root, ratio: [1, 0.5, 1], createdAt: daysAgo(100) };

  const goalProjectSnapshots = [
    { projectId: p1.id, projectName: p1.name, ratio: [1, 1, 1], root: p1SnapRootPatched, inScopeIds: [loginTask.id, oauthTask.id, chartsTask.id, restTask.id, authMwTask.id] },
    { projectId: p2.id, projectName: p2.name, ratio: [1, 0.5, 0.5], root: deepClone(p2Root), inScopeIds: [navTask.id, onboardTask.id, pushTask.id] },
  ];

  const teamGoal = {
    id: "goal-demo-1", label: "March 2025 Sprint Goal",
    createdAt: daysAgo(28),
    targetDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    velocity: 2,
    projectSnapshots: goalProjectSnapshots,
  };

  const team = { id: "team-acme", name: "Acme Engineering", projects: [p1, p2, p3], snapshots: [teamGoal], taskOrder: {}, createdAt: daysAgo(120) };
  const team2 = { id: "team-data", name: "Data Platform", projects: [], snapshots: [], taskOrder: {}, createdAt: daysAgo(30) };
  return [team, team2];
})();

/* ═══════════════════════════════════════════════════════════════
   SECTION 15: SIDEBAR
═══════════════════════════════════════════════════════════════ */
function Sidebar({ teams, selectedTeamId, onSelectTeam, onAddTeam, collapsed, onToggle }) {
  const [editingTeamId, setEditingTeamId] = useState(null);
  const [draft, setDraft] = useState("");
  const inputRef = useRef();
  useEffect(() => { if (editingTeamId && inputRef.current) inputRef.current.select(); }, [editingTeamId]);
  const W = collapsed ? 48 : 200;

  return (
    <div style={{ width: W, flexShrink: 0, background: C.sidebar, borderRight: `1px solid ${C.sidebarBorder}`, display: "flex", flexDirection: "column", transition: "width 0.2s ease", overflow: "hidden", position: "relative", zIndex: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: collapsed ? "center" : "space-between", padding: collapsed ? "14px 0" : "14px 12px 12px", borderBottom: `1px solid ${C.sidebarBorder}` }}>
        {!collapsed && <span style={{ fontSize: 11, fontWeight: 700, color: C.sidebarSub, letterSpacing: "0.12em" }}>TEAMS</span>}
        <button onClick={onToggle} style={{ background: "none", border: "none", cursor: "pointer", color: C.sidebarSub, fontSize: 14, padding: 4, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 4 }}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          onMouseEnter={e => e.currentTarget.style.color = C.sidebarText}
          onMouseLeave={e => e.currentTarget.style.color = C.sidebarSub}>
          {collapsed ? "›" : "‹"}
        </button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: collapsed ? "8px 0" : "8px 6px" }}>
        {teams.map(team => {
          const isSelected = team.id === selectedTeamId;
          const isEditing = editingTeamId === team.id;
          const hue = [...team.name].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
          return (
            <div key={team.id} onClick={() => { if (!isEditing) onSelectTeam(team.id); }}
              onDoubleClick={() => { if (!collapsed) { setEditingTeamId(team.id); setDraft(team.name); } }}
              title={collapsed ? team.name : undefined}
              style={{ display: "flex", alignItems: "center", gap: collapsed ? 0 : 8, padding: collapsed ? "8px 0" : "7px 8px", justifyContent: collapsed ? "center" : "flex-start", borderRadius: 6, cursor: "pointer", marginBottom: 2, background: isSelected ? `hsl(${hue},35%,22%)` : "transparent", border: `1px solid ${isSelected ? `hsl(${hue},45%,30%)` : "transparent"}`, transition: "all 0.1s" }}
              onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
              onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = isSelected ? `hsl(${hue},35%,22%)` : "transparent"; }}>
              <div style={{ width: collapsed ? 28 : 24, height: collapsed ? 28 : 24, borderRadius: collapsed ? 7 : 6, flexShrink: 0, background: `hsl(${hue},45%,35%)`, color: `hsl(${hue},45%,90%)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: collapsed ? 12 : 11, fontWeight: 700 }}>
                {team.name.charAt(0).toUpperCase()}
              </div>
              {!collapsed && (
                isEditing ? (
                  <input ref={inputRef} value={draft} onChange={e => setDraft(e.target.value)}
                    onBlur={() => { if (draft.trim()) onSelectTeam(team.id); setEditingTeamId(null); }}
                    onKeyDown={e => { if (e.key === "Enter") { setEditingTeamId(null); } if (e.key === "Escape") { setDraft(team.name); setEditingTeamId(null); } }}
                    onClick={e => e.stopPropagation()}
                    style={{ flex: 1, background: "transparent", border: "none", borderBottom: `1px solid ${C.sidebarSub}`, color: C.sidebarText, fontSize: 13, fontFamily: "inherit", outline: "none", padding: "0 0 2px" }} />
                ) : (
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: isSelected ? 600 : 400, color: isSelected ? C.sidebarText : C.sidebarSub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{team.name}</div>
                    <div style={{ fontSize: 10, color: C.sidebarSub }}>{team.projects.length} project{team.projects.length !== 1 ? "s" : ""}</div>
                  </div>
                )
              )}
              {!collapsed && isSelected && !isEditing && <span style={{ width: 6, height: 6, borderRadius: "50%", background: `hsl(${hue},70%,65%)`, flexShrink: 0 }} />}
            </div>
          );
        })}
      </div>
      <div style={{ padding: collapsed ? "8px 0" : "8px 6px 16px", borderTop: `1px solid ${C.sidebarBorder}` }}>
        <button onClick={onAddTeam}
          style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", justifyContent: collapsed ? "center" : "flex-start", padding: collapsed ? "8px 0" : "7px 8px", background: "none", border: "none", cursor: "pointer", color: C.sidebarSub, fontSize: 13, fontFamily: "inherit", borderRadius: 6 }}
          onMouseEnter={e => e.currentTarget.style.color = C.sidebarText}
          onMouseLeave={e => e.currentTarget.style.color = C.sidebarSub}>
          <span style={{ fontSize: 16 }}>+</span>
          {!collapsed && " New Team"}
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SECTION 16: ROOT APP
═══════════════════════════════════════════════════════════════ */
export default function App() {
  const [teams, setTeams] = useState(INITIAL_TEAMS);
  const [selectedTeamId, setSelectedTeamId] = useState(INITIAL_TEAMS[0].id);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [teamView, setTeamView] = useState("projects");
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [goalDrilldown, setGoalDrilldown] = useState(null);

  const selectedTeam = teams.find(t => t.id === selectedTeamId) || teams[0];
  const selectedProject = selectedProjectId ? selectedTeam?.projects.find(p => p.id === selectedProjectId) : null;

  const updateTeam = useCallback((teamId, fn) => { setTeams(ts => ts.map(t => t.id === teamId ? fn(t) : t)); }, []);
  const updateProject = useCallback((teamId, projectId, fn) => { updateTeam(teamId, t => ({ ...t, projects: t.projects.map(p => p.id === projectId ? fn(p) : p) })); }, [updateTeam]);
  const onUpdateTaskInProject = useCallback((projectId, taskId, fn) => { updateProject(selectedTeamId, projectId, p => ({ ...p, root: mapTask(p.root, taskId, fn) })); }, [selectedTeamId, updateProject]);

  const onReorderTask = useCallback((assignee, columnTaskIds, fromIndex, toIndex) => {
    updateTeam(selectedTeamId, t => ({
      ...t,
      taskOrder: reorderTaskInColumn(t.taskOrder || {}, assignee, columnTaskIds, fromIndex, toIndex),
    }));
  }, [selectedTeamId, updateTeam]);

  const addTeam = () => { const team = mkTeam("New Team"); setTeams(ts => [...ts, team]); setSelectedTeamId(team.id); setSelectedProjectId(null); setTeamView("projects"); };
  const addProject = () => { const p = mkProject("New Project"); updateTeam(selectedTeamId, t => ({ ...t, projects: [...t.projects, p] })); selectProject(p.id); };
  const deleteProject = useCallback((projectId) => { updateTeam(selectedTeamId, t => ({ ...t, projects: t.projects.filter(p => p.id !== projectId) })); if (selectedProjectId === projectId) backToTeam(); }, [selectedTeamId, selectedProjectId, updateTeam]);
  const selectProject = (projectId) => { setSelectedProjectId(projectId); setGoalDrilldown(null); };
  const backToTeam = () => { setSelectedProjectId(null); setGoalDrilldown(null); };
  const handleSelectTeam = (teamId) => { setSelectedTeamId(teamId); setSelectedProjectId(null); setTeamView("projects"); setGoalDrilldown(null); };
  const handleSelectProjectGoal = (snapshotId, projectId) => { setGoalDrilldown({ snapshotId, projectId }); };
  const handleDeleteSnapshot = (id) => { updateTeam(selectedTeamId, t => ({ ...t, snapshots: t.snapshots.filter(s => s.id !== id) })); };

  const TEAM_VIEWS = [
    { id: "projects", label: "Projects", icon: "⊡" },
    { id: "kanban",   label: "Kanban",   icon: "⊞" },
    { id: "timeline", label: "Timeline", icon: "▬" },
    { id: "goals",    label: "Goals",    icon: "◎", badge: selectedTeam?.snapshots.length || null },
  ];

  let goalDrilldownData = null;
  if (goalDrilldown && teamView === "goals") {
    const snap = selectedTeam?.snapshots.find(s => s.id === goalDrilldown.snapshotId);
    if (snap) {
      const pSnap = snap.projectSnapshots?.find(p => p.projectId === goalDrilldown.projectId);
      const currentProject = selectedTeam?.projects.find(p => p.id === goalDrilldown.projectId);
      if (pSnap) goalDrilldownData = { snap, pSnap, currentProject };
    }
  }

  const windowWidth = useWindowWidth();
  const isMobile = windowWidth < 640;
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", flexDirection: "column" }}>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600;700&family=Instrument+Sans:wght@400;500;600&display=swap" rel="stylesheet" />

      {isMobile && drawerOpen && (
        <>
          <div onClick={() => setDrawerOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,0.4)" }} />
          <div style={{ position: "fixed", top: 0, left: 0, bottom: 0, width: 260, zIndex: 51, background: C.sidebar, display: "flex", flexDirection: "column", boxShadow: "4px 0 24px rgba(0,0,0,0.25)" }}>
            <div style={{ padding: "18px 16px 12px", borderBottom: `1px solid ${C.sidebarBorder}`, display: "flex", alignItems: "center", gap: 10 }}>
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none"><rect x="1" y="1" width="8" height="8" rx="2" fill={C.accent}/><rect x="11" y="1" width="8" height="8" rx="2" fill={C.accent} fillOpacity=".3"/><rect x="1" y="11" width="8" height="8" rx="2" fill={C.accent} fillOpacity=".3"/><rect x="11" y="11" width="8" height="8" rx="2" fill={C.accent}/></svg>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.sidebarText, letterSpacing: "0.01em" }}>Teams</span>
              <button onClick={() => setDrawerOpen(false)} style={{ marginLeft: "auto", background: "none", border: "none", color: C.sidebarSub, fontSize: 20, cursor: "pointer", padding: "0 4px", lineHeight: 1 }}>×</button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "8px 8px" }}>
              {teams.map(team => {
                const isSelected = team.id === selectedTeamId;
                const hue = [...team.name].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
                return (
                  <div key={team.id} onClick={() => { handleSelectTeam(team.id); setDrawerOpen(false); }}
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", borderRadius: 7, marginBottom: 2, cursor: "pointer", background: isSelected ? `hsl(${hue},35%,22%)` : "transparent", border: `1px solid ${isSelected ? `hsl(${hue},45%,30%)` : "transparent"}` }}
                    onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
                    onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = isSelected ? `hsl(${hue},35%,22%)` : "transparent"; }}>
                    <div style={{ width: 28, height: 28, borderRadius: 7, flexShrink: 0, background: `hsl(${hue},45%,35%)`, color: `hsl(${hue},45%,90%)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700 }}>{team.name.charAt(0).toUpperCase()}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: isSelected ? 600 : 400, color: isSelected ? C.sidebarText : C.sidebarSub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{team.name}</div>
                      <div style={{ fontSize: 10, color: C.sidebarSub }}>{team.projects.length} project{team.projects.length !== 1 ? "s" : ""}</div>
                    </div>
                    {isSelected && <span style={{ width: 6, height: 6, borderRadius: "50%", background: `hsl(${hue},70%,65%)`, flexShrink: 0 }} />}
                  </div>
                );
              })}
            </div>
            <div style={{ padding: "8px 8px 20px", borderTop: `1px solid ${C.sidebarBorder}` }}>
              <button onClick={() => { addTeam(); setDrawerOpen(false); }}
                style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 10px", background: "none", border: "none", cursor: "pointer", color: C.sidebarSub, fontSize: 13, fontFamily: "inherit", borderRadius: 6 }}
                onMouseEnter={e => e.currentTarget.style.color = C.sidebarText}
                onMouseLeave={e => e.currentTarget.style.color = C.sidebarSub}>
                <span style={{ fontSize: 16 }}>+</span> New Team
              </button>
            </div>
          </div>
        </>
      )}

      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, position: "sticky", top: 0, zIndex: 30, boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: isMobile ? "9px 12px 7px" : "10px 16px 8px" }}>
          {isMobile ? (
            <button onClick={() => setDrawerOpen(true)} style={{ flexShrink: 0, background: "none", border: "none", cursor: "pointer", padding: "2px 4px", display: "flex", flexDirection: "column", justifyContent: "center", gap: 4, color: C.text }}>
              <span style={{ display: "block", width: 18, height: 2, borderRadius: 1, background: C.text }} />
              <span style={{ display: "block", width: 18, height: 2, borderRadius: 1, background: C.text }} />
              <span style={{ display: "block", width: 18, height: 2, borderRadius: 1, background: C.text }} />
            </button>
          ) : (
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" style={{ flexShrink: 0 }}><rect x="1" y="1" width="8" height="8" rx="2" fill={C.accent}/><rect x="11" y="1" width="8" height="8" rx="2" fill={C.accent} fillOpacity=".3"/><rect x="1" y="11" width="8" height="8" rx="2" fill={C.accent} fillOpacity=".3"/><rect x="11" y="11" width="8" height="8" rx="2" fill={C.accent}/></svg>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 4, flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: isMobile ? 13 : 15, fontWeight: 700, color: selectedProject ? C.textSub : C.text, cursor: selectedProject ? "pointer" : "default", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flexShrink: selectedProject ? 1 : 0 }}
              onClick={selectedProject ? backToTeam : undefined}>
              {selectedTeam?.name}
            </span>
            {selectedProject && (
              <>
                <span style={{ color: C.border, fontSize: 14, flexShrink: 0 }}>›</span>
                <span style={{ fontSize: isMobile ? 13 : 15, fontWeight: 700, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selectedProject.name}</span>
              </>
            )}
          </div>

          {!isMobile && (
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
              {!selectedProject && (
                <button onClick={() => setShowGoalModal(true)}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = C.teal; e.currentTarget.style.color = C.teal; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.textMid; }}
                  style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 12px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.surface, color: C.textMid, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}>
                  🎯 Set Goal
                </button>
              )}
              {!selectedProject ? (
                <div style={{ display: "flex", gap: 2, background: C.bg, borderRadius: 7, padding: 2, border: `1px solid ${C.border}` }}>
                  {TEAM_VIEWS.map(({ id, label, icon, badge }) => (
                    <button key={id} onClick={() => { setTeamView(id); setGoalDrilldown(null); }} style={{
                      position: "relative", display: "flex", alignItems: "center", gap: 5, padding: "4px 12px", borderRadius: 5, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit",
                      background: teamView === id ? C.surface : "transparent", color: teamView === id ? C.text : C.textSub,
                      boxShadow: teamView === id ? "0 1px 3px rgba(0,0,0,0.08)" : "none", transition: "all 0.15s",
                    }}>
                      <span style={{ fontSize: 10, opacity: 0.7 }}>{icon}</span>{label}
                      {badge != null && <span style={{ position: "absolute", top: 1, right: 1, width: 14, height: 14, borderRadius: "50%", background: C.teal, color: "#fff", fontSize: 8, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{badge}</span>}
                    </button>
                  ))}
                </div>
              ) : (
                <button onClick={backToTeam}
                  style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 12px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.surface, color: C.textMid, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = C.accent; e.currentTarget.style.color = C.accent; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.textMid; }}>
                  ← Back to Team
                </button>
              )}
            </div>
          )}
        </div>

        {isMobile && (
          <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 12px 7px", borderTop: `1px solid ${C.border}` }}>
            {!selectedProject ? (
              <>
                {TEAM_VIEWS.map(({ id, label, icon, badge }) => (
                  <button key={id} onClick={() => { setTeamView(id); setGoalDrilldown(null); }} style={{
                    position: "relative", flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 3,
                    padding: "6px 4px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: "inherit",
                    background: teamView === id ? C.accentLight : "transparent", color: teamView === id ? C.accent : C.textSub, transition: "all 0.12s",
                  }}>
                    <span style={{ fontSize: 11 }}>{icon}</span><span>{label}</span>
                    {badge != null && <span style={{ position: "absolute", top: 2, right: 2, width: 12, height: 12, borderRadius: "50%", background: C.teal, color: "#fff", fontSize: 7, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{badge}</span>}
                  </button>
                ))}
                <button onClick={() => setShowGoalModal(true)} style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: "6px 10px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.surface, color: C.textMid, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>🎯</button>
              </>
            ) : (
              <button onClick={backToTeam} style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.surface, color: C.textMid, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>← Back to Team</button>
            )}
          </div>
        )}
      </div>

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {!isMobile && <Sidebar teams={teams} selectedTeamId={selectedTeamId} onSelectTeam={handleSelectTeam} onAddTeam={addTeam} collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(v => !v)} />}
        <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
          {selectedProject ? (
            <EstimateView project={selectedProject} onUpdateProject={fn => updateProject(selectedTeamId, selectedProject.id, fn)} onDeleteProject={() => deleteProject(selectedProject.id)} />
          ) : (
            <>
              {teamView === "projects" && <ProjectsView projects={selectedTeam?.projects || []} onSelectProject={selectProject} onUpdateProject={(projectId, fn) => updateProject(selectedTeamId, projectId, fn)} onDeleteProject={deleteProject} onAddProject={addProject} />}
              {teamView === "kanban" && <KanbanView projects={selectedTeam?.projects || []} onUpdateTaskInProject={onUpdateTaskInProject} taskOrder={selectedTeam?.taskOrder || {}} onReorderTask={onReorderTask} />}
              {teamView === "timeline" && <TimelineView projects={selectedTeam?.projects || []} taskOrder={selectedTeam?.taskOrder || {}} />}
              {teamView === "goals" && (
                goalDrilldownData ? (
                  <ProjectGoalDetail projectSnapshot={goalDrilldownData.pSnap} currentProject={goalDrilldownData.currentProject} onBack={() => setGoalDrilldown(null)} projects={selectedTeam?.projects || []} onUpdateTaskInProject={onUpdateTaskInProject} />
                ) : (
                  <GoalsView team={selectedTeam} onDeleteSnapshot={handleDeleteSnapshot} onSelectProjectGoal={handleSelectProjectGoal} />
                )
              )}
            </>
          )}
        </div>
      </div>

      {showGoalModal && selectedTeam && (
        <SetGoalModal team={selectedTeam}
          onConfirm={snap => { updateTeam(selectedTeamId, t => ({ ...t, snapshots: [...t.snapshots, snap] })); setShowGoalModal(false); setTeamView("goals"); }}
          onCancel={() => setShowGoalModal(false)} />
      )}
    </div>
  );
}
