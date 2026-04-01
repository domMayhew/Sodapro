import { useState, useMemo, useCallback, useRef } from 'react';
import { C } from '../constants/colors';
import { STATUSES } from '../constants/statuses';
import { withStatusChange, collectLeafTasks, computePts, getTaskBreadcrumbAcrossProjects } from '../models/task';
import { effectiveProjectStatus } from '../models/project';
import { sortTasksByOrder } from '../models/ordering';
import { useClickOutside } from '../hooks';
import type { Project, Task } from '../types';
import { Avatar, TagChip, StatusDot } from './ui';
import { TaskDetailModal } from './TaskDetail';

/* ── KanbanContextMenu ─────────────────────────────────────────── */
function KanbanContextMenu({ anchorPos, task, onStatusChange, onClose }: {
  anchorPos: { x: number; y: number };
  task: Task;
  onStatusChange: (id: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
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
  ].filter(Boolean) as { label: string; color: string; bg: string; action: () => void }[];
  return (
    <div ref={ref} style={{ position: "fixed", left, top, zIndex: 9999, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", overflow: "hidden", minWidth: menuW }}>
      <div style={{ padding: "7px 14px 6px", borderBottom: `1px solid ${C.border}`, fontSize: 10, fontWeight: 700, color: C.textSub, letterSpacing: "0.08em" }}>
        {task.name.length > 22 ? task.name.slice(0, 22) + "…" : task.name}
      </div>
      {items.map(({ label, color, bg, action }) => (
        <button key={label} onClick={action} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "9px 14px", border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", fontSize: 13, color: C.text, textAlign: "left" }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = bg}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}>
          <span style={{ width: 22, height: 22, borderRadius: 5, background: bg, color, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, border: `1px solid ${color}30`, flexShrink: 0 }}>
            {label.startsWith("←") ? "←" : "→"}
          </span>
          <span>{label.replace(/^← /, "").replace(/ →$/, "")}</span>
        </button>
      ))}
    </div>
  );
}

/* ── KanbanCard ────────────────────────────────────────────────── */
function KanbanCard({ task, allNames, projectName, onStatusChange, onUpdateTask, index, onDragStart, projects }: {
  task: Task & { _projectId?: string; _projectName?: string };
  allNames: string[];
  projectName: string | null;
  onStatusChange: (id: string) => void;
  onUpdateTask: (projectId: string, taskId: string, fn: (t: Task) => Task) => void;
  index: number;
  onDragStart: (index: number, e: React.PointerEvent) => void;
  projects: Project[];
}) {
  const pts = task.points || 0;
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openMenu = (x: number, y: number) => setMenu({ x, y });
  const startPress = (e: React.MouseEvent | React.TouchEvent) => {
    const src = 'touches' in e ? e.touches[0] : e;
    pressTimer.current = setTimeout(() => openMenu(src.clientX, src.clientY), 500);
  };
  const cancelPress = () => { if (pressTimer.current) clearTimeout(pressTimer.current); };

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
        onMouseDown={startPress} onMouseUp={cancelPress}
        onMouseLeave={e => { cancelPress(); (e.currentTarget as HTMLElement).style.boxShadow = "0 1px 3px rgba(0,0,0,0.05)"; }}
        onTouchStart={startPress} onTouchEnd={cancelPress} onTouchMove={cancelPress}
        onContextMenu={e => { e.preventDefault(); openMenu(e.clientX, e.clientY); }}
        style={{
          flex: 1, background: C.surface, border: `1px solid ${C.border}`, borderLeft: "none",
          borderRadius: "0 8px 8px 0", padding: "9px 11px",
          cursor: "pointer", boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
          userSelect: "none", WebkitUserSelect: "none",
        }}
        onMouseEnter={e => (e.currentTarget as HTMLElement).style.boxShadow = "0 3px 10px rgba(0,0,0,0.1)"}
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
          onUpdate={fn => onUpdateTask(task._projectId!, task.id, fn)}
          allAssignees={allNames} allNames={allNames}
          breadcrumb={breadcrumb} open={true} onClose={() => setDetailOpen(false)} readOnly={false} />
      )}
    </div>
  );
}

/* ── KanbanColumn ──────────────────────────────────────────────── */
function KanbanColumn({ assignee, statusId, tasks, allNames, activeProjects, onUpdateTaskInProject, onReorderTask, isLast, si, ai, projects }: {
  assignee: string;
  statusId: string;
  tasks: (Task & { _projectId?: string; _projectName?: string })[];
  allNames: string[];
  activeProjects: Project[];
  onUpdateTaskInProject: (projectId: string, taskId: string, fn: (t: Task) => Task) => void;
  onReorderTask: (assignee: string, columnTaskIds: string[], fromIndex: number, toIndex: number) => void;
  isLast: boolean;
  si: number;
  ai: number;
  projects: Project[];
}) {
  const [dragState, setDragState] = useState<{ fromIndex: number; currentIndex: number } | null>(null);
  const columnRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const COL_MIN_W = 200;

  const handleDragStart = useCallback((index: number, e: React.PointerEvent) => {
    setDragState({ fromIndex: index, currentIndex: index });
    const startY = e.clientY;

    const handleMove = (moveE: PointerEvent) => {
      const y = moveE.clientY ?? startY;
      const cards = cardRefs.current.filter(Boolean) as HTMLDivElement[];
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
      borderLeft: `3px solid ${STATUSES.find(s => s.id === statusId)?.border || C.border}`,
      borderTop: `1px solid ${C.border}`,
      borderRight: si === STATUSES.length - 1 ? `1px solid ${C.border}` : "none",
      borderRadius: isLast && si === STATUSES.length - 1 ? "0 0 10px 0" : "0",
      minHeight: 100, display: "flex", flexDirection: "column", gap: 6,
    }}>
      {displayTasks.map((task, i) => {
        const isDragging = dragState && displayTasks[i]?.id === tasks[dragState.fromIndex]?.id && dragState.fromIndex !== dragState.currentIndex;
        return (
          <div key={task.id} ref={el => { cardRefs.current[i] = el; }} data-kanban-card
            style={{ opacity: isDragging ? 0.85 : 1, transform: isDragging ? "scale(1.02)" : "none", transition: dragState ? "transform 0.1s" : "none" }}>
            <KanbanCard task={task} allNames={allNames}
              projectName={activeProjects.length > 1 ? (task._projectName || null) : null}
              onStatusChange={newStatus => onUpdateTaskInProject(task._projectId!, task.id, t => withStatusChange(t, newStatus))}
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

/* ── KanbanView ────────────────────────────────────────────────── */
export function KanbanView({ projects, onUpdateTaskInProject, taskOrder, onReorderTask }: {
  projects: Project[];
  onUpdateTaskInProject: (projectId: string, taskId: string, fn: (t: Task) => Task) => void;
  taskOrder: Record<string, string[]>;
  onReorderTask: (assignee: string, columnTaskIds: string[], fromIndex: number, toIndex: number) => void;
}) {
  const activeProjects = useMemo(() => projects.filter(p => {
    const eff = effectiveProjectStatus(p);
    return eff !== "completed" && eff !== "cancelled" && eff !== "onhold";
  }), [projects]);

  const allTasks = useMemo(() => {
    const tasks: (Task & { _projectId: string; _projectName: string })[] = [];
    activeProjects.forEach(p => { collectLeafTasks(p.root).forEach(t => tasks.push({ ...t, _projectId: p.id, _projectName: p.name })); });
    return tasks;
  }, [activeProjects]);

  const allNames = useMemo(() => { const seen = new Set<string>(); allTasks.forEach(t => { if (t.assignee) seen.add(t.assignee); }); return [...seen]; }, [allTasks]);
  const assignees = useMemo(() => { const seen = new Set<string>(); const result: string[] = []; allTasks.forEach(t => { const k = t.assignee || "Unassigned"; if (!seen.has(k)) { seen.add(k); result.push(k); } }); return result; }, [allTasks]);

  const getColumnTasks = useCallback((assignee: string, statusId: string) => {
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
              <span style={{ fontSize: 11, fontWeight: 500, color: C.textMid, textAlign: "center", lineHeight: 1.3, maxWidth: 110, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" } as React.CSSProperties}>{assignee}</span>
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
