import { useState, useMemo, useRef } from 'react';
import { C } from '../constants/colors';
import { PROJECT_STATUSES, DERIVED_PROJ_STATUSES, OVERRIDE_PROJ_STATUSES, projectStatusById, STATUSES } from '../constants/statuses';
import { computePts, collectLeafTasks, collectAllLeafTasks, collectLeafAssignees, collectAllAssignees } from '../models/task';
import { deriveProjectStatus, effectiveProjectStatus } from '../models/project';
import { useClickOutside } from '../hooks';
import type { Project } from '../types';
import { ProgressBar, AssigneeStack, StatusDot } from './ui';

/* ── ProjectStatusPicker ───────────────────────────────────────── */
export function ProjectStatusPicker({ project, onChange, onDelete }: {
  project: Project;
  onChange: (override: string | null) => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [confirmPending, setConfirmPending] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false));

  const derived   = deriveProjectStatus(project);
  const override  = project.statusOverride || null;
  const effective = override || derived;
  const cur       = projectStatusById(effective);
  const inFlightTasks = collectLeafTasks(project.root).filter(t => t.status === "inprogress" || t.status === "inreview");
  const applyOverride = (statusId: string) => { onChange(statusId); setOpen(false); };
  const handleOverrideClick = (statusId: string) => { setOpen(false); if (inFlightTasks.length > 0) setConfirmPending(statusId); else applyOverride(statusId); };

  const sectionLabel = (text: string) => (
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
                  onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = C.stripe; }}
                  onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
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
                  onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = C.stripe; }}
                  onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: s.dot, flexShrink: 0 }} />{s.label}
                  {isActive && <span style={{ marginLeft: "auto", fontSize: 9, color: s.color }}>●</span>}
                </div>
              );
            })}
            <div style={{ height: 1, background: C.border, margin: "2px 0" }} />
            <div onClick={() => { setOpen(false); setConfirmDelete(true); }}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", fontSize: 12, cursor: "pointer", color: C.red }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = C.redLight}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}>
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

/* ── ProjectCard ───────────────────────────────────────────────── */
function ProjectCard({ project, onSelect, onUpdateProject, onDeleteProject }: {
  project: Project;
  onSelect: (id: string) => void;
  onUpdateProject: (fn: (p: Project) => Project) => void;
  onDeleteProject: () => void;
}) {
  const pts = computePts(project.root, project.ratio, true);
  const activeLeaves = collectLeafTasks(project.root);
  const allLeaves = collectAllLeafTasks(project.root);
  const archivedCount = allLeaves.length - activeLeaves.length;
  const counts: Record<string, number> = {};
  STATUSES.forEach(s => { counts[s.id] = 0; });
  activeLeaves.forEach(t => { counts[t.status || "todo"]++; });
  counts.done += archivedCount;
  const total = allLeaves.length;
  const doneCount = counts["done"] || 0;
  const completionPct = total > 0 ? Math.round(doneCount / total * 100) : 0;
  const assignees = collectLeafAssignees(project.root);
  const allNames = [...collectAllAssignees(project.root)].sort();

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "16px 18px", cursor: "pointer", transition: "all 0.15s", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 16px rgba(0,0,0,0.1)"; (e.currentTarget as HTMLElement).style.borderColor = C.borderDark; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = "0 1px 4px rgba(0,0,0,0.04)"; (e.currentTarget as HTMLElement).style.borderColor = C.border; }}
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

/* ── ProjectsView ──────────────────────────────────────────────── */
export function ProjectsView({ projects, onSelectProject, onUpdateProject, onDeleteProject, onAddProject }: {
  projects: Project[];
  onSelectProject: (id: string) => void;
  onUpdateProject: (projectId: string, fn: (p: Project) => Project) => void;
  onDeleteProject: (id: string) => void;
  onAddProject: () => void;
}) {
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
    const m: Record<string, Project[]> = {};
    PROJECT_STATUSES.forEach(s => { m[s.id] = projects.filter(p => effectiveProjectStatus(p) === s.id); });
    return m;
  }, [projects]);

  return (
    <div style={{ maxWidth: 1400, margin: "24px auto", padding: "0 24px" }}>
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
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = C.accent; (e.currentTarget as HTMLElement).style.color = C.accent; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = C.borderDark; (e.currentTarget as HTMLElement).style.color = C.textMid; }}
        style={{ marginTop: 8, background: "none", border: `1px dashed ${C.borderDark}`, borderRadius: 8, color: C.textMid, cursor: "pointer", padding: "10px 20px", fontSize: 13, fontFamily: "inherit", display: "flex", alignItems: "center", gap: 8, transition: "all 0.15s" }}>
        + New Project
      </button>
    </div>
  );
}
