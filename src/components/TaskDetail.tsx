import { useState, useRef, useEffect, useCallback, ReactNode } from 'react';
import { C } from '../constants/colors';
import { STATUSES } from '../constants/statuses';
import { computePts, trackChange, withStatusChange, collectLeafAssignees } from '../models/task';
import { useClickOutside } from '../hooks';
import type { Task, Points } from '../types';
import {
  Avatar, AssigneeInput, TagChip, TagPicker, StatusBadge, StatusPicker, StatusDot,
  StatusPie, AssigneeStack, FixedPopover,
} from './ui';

/* ── CenteredModal ─────────────────────────────────────────────── */
export function CenteredModal({ open, onClose, width = 340, children }: {
  open: boolean;
  onClose: () => void;
  width?: number;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
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

/* ── TaskBreadcrumb ────────────────────────────────────────────── */
export function TaskBreadcrumb({ projectName, path }: { projectName?: string; path?: string[] }) {
  if (!projectName && (!path || path.length === 0)) return null;
  const parts = [projectName, ...(path || [])].filter(Boolean) as string[];
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

/* ── TaskDetailContent ─────────────────────────────────────────── */
export function TaskDetailContent({ task, pts, isLeaf, onUpdate, allAssignees, allNames, breadcrumb, readOnly }: {
  task: Task;
  pts: Points;
  isLeaf: boolean;
  onUpdate?: ((fn: (t: Task) => Task) => void) | null;
  allAssignees: string[];
  allNames: string[];
  breadcrumb?: { projectName: string; path: string[] } | null;
  readOnly?: boolean;
}) {
  const fl: React.CSSProperties = { fontSize: 10, fontWeight: 600, color: C.textSub, letterSpacing: "0.07em", marginBottom: 4 };
  const sec: React.CSSProperties = { marginBottom: 12 };
  const divider: React.CSSProperties = { height: 1, background: C.border, margin: "10px 0" };
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
            onKeyDown={e => { if (e.key === "Enter") { commitName(); (e.target as HTMLInputElement).blur(); } if (e.key === "Escape") { setNameDraft(task.name); (e.target as HTMLInputElement).blur(); } }}
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
            {editable && isLeaf && !readOnly && onUpdate
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
        {isLeaf && !readOnly && onUpdate ? (
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
          <TagPicker tags={task.tags || []} onChange={tags => onUpdate && onUpdate(t => trackChange(t, "tags", tags))} />
        )}
      </div>
      <div style={divider} />
      <div>
        <div style={fl}>STATUS</div>
        {readOnly ? (
          <StatusBadge status={task.status || "todo"} />
        ) : (
          <StatusPicker status={task.status || "todo"} onChange={s => onUpdate && onUpdate(t => withStatusChange(t, s))} />
        )}
      </div>
    </>
  );
}

/* Stepper re-exported for use in TaskDetailContent */
function Stepper({ value, onChange, color }: { value: number; onChange: (v: number) => void; color: string }) {
  const sBtn: React.CSSProperties = {
    width: 22, height: 24, border: `1px solid ${C.border}`, background: C.stripe,
    color: C.textMid, cursor: "pointer", fontSize: 14,
    display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
  };
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

/* ── DetailPopover ─────────────────────────────────────────────── */
export function DetailPopover({ task, pts, isLeaf, onUpdate, allAssignees, allNames, open, onClose, anchorRef }: {
  task: Task;
  pts: Points;
  isLeaf: boolean;
  onUpdate: (fn: (t: Task) => Task) => void;
  allAssignees: string[];
  allNames: string[];
  open: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
}) {
  return (
    <FixedPopover anchorRef={anchorRef} open={open} onClose={onClose}>
      <TaskDetailContent task={task} pts={pts} isLeaf={isLeaf} onUpdate={onUpdate}
        allAssignees={allAssignees} allNames={allNames} readOnly={false} />
    </FixedPopover>
  );
}

/* ── TaskDetailModal ───────────────────────────────────────────── */
export function TaskDetailModal({ task, pts, isLeaf, onUpdate, allAssignees, allNames, breadcrumb, open, onClose, readOnly }: {
  task: Task;
  pts: Points;
  isLeaf: boolean;
  onUpdate?: ((fn: (t: Task) => Task) => void) | null;
  allAssignees: string[];
  allNames: string[];
  breadcrumb?: { projectName: string; path: string[] } | null;
  open: boolean;
  onClose: () => void;
  readOnly?: boolean;
}) {
  return (
    <CenteredModal open={open} onClose={onClose} width={360}>
      <TaskDetailContent task={task} pts={pts} isLeaf={isLeaf} onUpdate={onUpdate}
        allAssignees={allAssignees} allNames={allNames} breadcrumb={breadcrumb} readOnly={readOnly} />
    </CenteredModal>
  );
}

/* ── PtsPill ───────────────────────────────────────────────────── */
export function PtsPill({ task, pts, isLeaf, onUpdate, allAssignees, allNames }: {
  task: Task;
  pts: Points;
  isLeaf: boolean;
  onUpdate: (fn: (t: Task) => Task) => void;
  allAssignees: string[];
  allNames: string[];
}) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
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

/* ── ContextMenu ───────────────────────────────────────────────── */
export function ContextMenu({ anchorPos, task, onAddChild, onMarkDone, onReopen, onArchive, onClose }: {
  anchorPos: { x: number; y: number };
  task: Task;
  onAddChild: () => void;
  onMarkDone: () => void;
  onReopen: () => void;
  onArchive: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
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
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = C.stripe}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}
        >
          <span style={{ width: 20, height: 20, borderRadius: 5, background: color + "20", color, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>{icon}</span>
          {label}
        </button>
      ))}
    </div>
  );
}

/* ── RatioEditor ───────────────────────────────────────────────── */
export function RatioEditor({ ratio, onChange }: { ratio: number[]; onChange: (r: number[]) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(ratio.map(String));
  const ref = useRef<HTMLDivElement>(null);
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

/* ── TaskRow ───────────────────────────────────────────────────── */
export function TaskRow({ task, depth, onUpdate, onDelete, onArchive, onMarkDone, onAddChild, allAssignees, allNames, ratio }: {
  task: Task;
  depth: number;
  onUpdate: (id: string, fn: (t: Task) => Task) => void;
  onDelete: (id: string) => void;
  onArchive: (id: string) => void;
  onMarkDone: (id: string) => void;
  onAddChild: (pid: string) => void;
  allAssignees: string[];
  allNames: string[];
  ratio: number[];
}) {
  const isArchived = task.archived;
  const isDone = task.status === "done";
  const isMuted = isArchived || isDone;
  const pts = computePts(task, ratio, true);
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
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [pressing, setPressing] = useState(false);

  type TouchOrMouseEvent = React.MouseEvent | React.TouchEvent;
  const startPress = (e: TouchOrMouseEvent) => {
    if (isArchived) return;
    const src = 'touches' in e ? e.touches[0] : e;
    pressTimer.current = setTimeout(() => setMenu({ x: src.clientX, y: src.clientY }), 500);
  };
  const cancelPress = () => { if (pressTimer.current) clearTimeout(pressTimer.current); };
  const handleUpdate = useCallback((fn: (t: Task) => Task) => onUpdate(task.id, fn), [task.id, onUpdate]);
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
