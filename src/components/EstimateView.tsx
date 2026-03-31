import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { C } from '../constants/colors';
import { computePts, mapTask, archiveTask, withStatusChange, addChild, collectAllAssignees, mkTask } from '../models/task';
import { effectiveProjectStatus } from '../models/project';
import type { Project, Task } from '../types';
import { Summary } from './ui';
import { TaskRow, RatioEditor } from './TaskDetail';
import { ProjectStatusPicker } from './ProjectsView';

export function EstimateView({ project, onUpdateProject, onDeleteProject }: {
  project: Project;
  onUpdateProject: (fn: (p: Project) => Project) => void;
  onDeleteProject: () => void;
}) {
  const { root, ratio } = project;
  const onUpdate   = useCallback((id: string, fn: (t: Task) => Task) => onUpdateProject(p => ({ ...p, root: mapTask(p.root, id, fn) })), [onUpdateProject]);
  const onArchive  = useCallback((id: string) => onUpdateProject(p => ({ ...p, root: archiveTask(p.root, id) })), [onUpdateProject]);
  const onMarkDone = useCallback((id: string) => onUpdateProject(p => ({
    ...p, root: mapTask(p.root, id, t => {
      const newStatus = t.status === "done" ? "todo" : "done";
      return withStatusChange(t, newStatus);
    })
  })), [onUpdateProject]);
  const onAddChild = useCallback((pid_: string) => onUpdateProject(p => ({ ...p, root: addChild(p.root, pid_) })), [onUpdateProject]);
  const onRatioChange = useCallback((r: number[]) => onUpdateProject(p => ({ ...p, ratio: r })), [onUpdateProject]);

  const totals = computePts(root, ratio, true);
  const allAssignees = useMemo(() => [...collectAllAssignees(root, new Set(), true)].sort(), [root]);
  const allNames = allAssignees;

  const [editingName, setEditingName] = useState(project.name === "New Project");
  const [nameDraft, setNameDraft] = useState(project.name);
  const nameInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { setNameDraft(project.name); }, [project.name]);
  useEffect(() => { if (editingName) nameInputRef.current?.select(); }, [editingName]);
  const commitName = () => {
    if (nameDraft.trim()) onUpdateProject(p => ({ ...p, name: nameDraft.trim() }));
    else setNameDraft(project.name);
    setEditingName(false);
  };

  const [pendingAdd, setPendingAdd] = useState<{ type: "group" } | { type: "child"; pid: string } | null>(null);
  const isCompleted = effectiveProjectStatus(project) === "completed";

  const guardedAddGroup = () => {
    if (isCompleted) { setPendingAdd({ type: "group" }); return; }
    onUpdateProject(p => ({ ...p, root: { ...p.root, children: [...p.root.children, mkTask("New Feature Group")] } }));
  };

  const guardedAddChild = useCallback((pid_: string) => {
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
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = C.accent; (e.currentTarget as HTMLElement).style.color = C.accent; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = C.borderDark; (e.currentTarget as HTMLElement).style.color = C.textMid; }}
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
