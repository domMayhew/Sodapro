import { useState, useMemo, useEffect } from 'react';
import { C } from '../constants/colors';
import { projectStatusById, statusById } from '../constants/statuses';
import { computePts, collectLeafTasks, collectAllLeafTasks, collectAllAssignees, getTaskBreadcrumb, uid, deepClone } from '../models/task';
import { effectiveProjectStatus } from '../models/project';
import { resolveProjectGoalScope, resolveTeamGoalSummary } from '../models/goals';
import { workingDaysBetween } from '../models/ordering';
import type { Team, Project, Task, GoalSnapshot, ProjectSnapshot } from '../types';
import { ProgressBar, StatusBadge, SpPill, DeltaPill, Section, ReviewRow, EmptyRow, Avatar, Stepper } from './ui';
import { TaskDetailModal } from './TaskDetail';

/* ── SetGoalModal ──────────────────────────────────────────────── */
export function SetGoalModal({ team, onConfirm, onCancel }: {
  team: Team;
  onConfirm: (snap: GoalSnapshot) => void;
  onCancel: () => void;
}) {
  const today = new Date().toISOString().slice(0,10);
  const [label, setLabel] = useState(() => { const d = new Date(); return `${d.toLocaleDateString("en-US", { month: "long" })} ${d.getFullYear()} Goal`; });
  const [targetDate, setTargetDate] = useState(() => { const d = new Date(); d.setMonth(d.getMonth() + 1); d.setDate(0); return d.toISOString().slice(0,10); });
  const [velocity, setVelocity] = useState(2);

  const activeProjects = team.projects.filter(p => { const eff = effectiveProjectStatus(p); return eff !== "completed" && eff !== "cancelled" && eff !== "onhold"; });
  const availableDays = workingDaysBetween(today, targetDate);
  const availablePoints = availableDays * velocity;

  const perProjectSummary = activeProjects.map(p => {
    const leaves = collectLeafTasks(p.root);
    const inScopeIds = new Set<string>();
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
              const projectSnapshots: ProjectSnapshot[] = activeProjects.map(p => ({
                projectId: p.id, projectName: p.name,
                ratio: deepClone(p.ratio) as number[], root: deepClone(p.root) as Task,
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

/* ── ProjectGoalDetail ─────────────────────────────────────────── */
export function ProjectGoalDetail({ projectSnapshot, currentProject, onBack, projects, onUpdateTaskInProject }: {
  projectSnapshot: ProjectSnapshot;
  currentProject: Project | undefined;
  onBack: () => void;
  projects: Project[];
  onUpdateTaskInProject?: ((projectId: string, taskId: string, fn: (t: Task) => Task) => void) | null;
}) {
  const resolved = resolveProjectGoalScope(projectSnapshot, currentProject);
  const { scopeItems, addedSince, statusCounts, totalEstPts, totalDonePts, completionPct, currentRatio } = resolved;

  const estimateDriftTasks = scopeItems.filter(x => x.estimateDrifted);
  const statusOrder: Record<string, number> = { done: 0, inreview: 1, inprogress: 2, todo: 3 };
  const sortedScope = [...scopeItems].sort((a, b) => {
    const aOrd = a.isArchived ? -1 : (statusOrder[a.status] ?? 9);
    const bOrd = b.isArchived ? -1 : (statusOrder[b.status] ?? 9);
    return aOrd - bOrd || a.name.localeCompare(b.name);
  });

  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);
  const detailInfo = useMemo(() => {
    if (!detailTaskId || !currentProject) return null;
    const { collectAllLeafTasks: cal } = { collectAllLeafTasks };
    const allLeaves = cal(currentProject.root);
    const task = allLeaves.find(t => t.id === detailTaskId);
    if (!task) return null;
    const pts = computePts(task, currentRatio, true);
    const breadcrumb = { projectName: currentProject.name, path: getTaskBreadcrumb(currentProject.root, detailTaskId) };
    const allNames = [...collectAllAssignees(currentProject.root, new Set(), true)].sort();
    return { task, pts, breadcrumb, allNames };
  }, [detailTaskId, currentProject, currentRatio]);

  const clickableRow: React.CSSProperties = { cursor: "pointer" };

  return (
    <div style={{ maxWidth: 1100, margin: "24px auto", padding: "0 24px" }}>
      <button onClick={onBack}
        style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 18, padding: "5px 12px 5px 8px", border: `1px solid ${C.border}`, borderRadius: 7, background: C.surface, color: C.textMid, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = C.accent; (e.currentTarget as HTMLElement).style.color = C.accent; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = C.border; (e.currentTarget as HTMLElement).style.color = C.textMid; }}>
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
          onUpdate={onUpdateTaskInProject ? (fn => onUpdateTaskInProject(currentProject!.id, detailInfo.task.id, fn)) : null}
          allAssignees={detailInfo.allNames} allNames={detailInfo.allNames}
          breadcrumb={detailInfo.breadcrumb}
          open={true} onClose={() => setDetailTaskId(null)}
          readOnly={!onUpdateTaskInProject} />
      )}
    </div>
  );
}

/* ── GoalsView ─────────────────────────────────────────────────── */
export function GoalsView({ team, onDeleteSnapshot, onSelectProjectGoal, onCloseSnapshot }: {
  team: Team;
  onDeleteSnapshot: (id: string) => void;
  onSelectProjectGoal: (snapshotId: string, projectId: string) => void;
  onCloseSnapshot?: (id: string) => void;
}) {
  const { snapshots, projects } = team;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => {
    if (snapshots.length > 0 && !selectedId) setSelectedId(snapshots[snapshots.length - 1].id);
  }, [snapshots]);

  if (snapshots.length === 0) {
    return (
      <div style={{ maxWidth: 1100, margin: "48px auto", padding: "0 24px", textAlign: "center" }}>
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
  const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  const summary = resolveTeamGoalSummary(snapshot, projects, elapsedDays);
  const { projectSummaries, barCounts, totalScopeCount, totalEstPts, totalDonePts, completionPct, teamThroughput, expectedPtsDone } = summary;

  const renderCard = (s: typeof projectSummaries[0], muted = false) => {
    const { pSnap, resolved, currentEffectiveStatus, expectedPts, throughput } = s;
    const pct = resolved.completionPct;
    const pDonePts = resolved.totalDonePts;
    const overrideStatus = currentEffectiveStatus === "onhold" || currentEffectiveStatus === "cancelled" ? projectStatusById(currentEffectiveStatus) : null;
    const paceColor = pDonePts >= (expectedPts ?? 0) ? C.green : pDonePts >= (expectedPts ?? 0) * 0.75 ? C.amber : C.red;
    const paceLabel = pDonePts >= (expectedPts ?? 0) ? "On track" : pDonePts >= (expectedPts ?? 0) * 0.75 ? "Slightly behind" : "Behind";
    return (
      <div key={pSnap.projectId} onClick={() => onSelectProjectGoal(snapshot.id, pSnap.projectId)}
        style={{ background: muted ? C.stripe : C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "14px 16px", cursor: "pointer", transition: "all 0.15s", boxShadow: "0 1px 4px rgba(0,0,0,0.04)", opacity: muted ? 0.75 : 1 }}
        onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.boxShadow = "0 4px 16px rgba(0,0,0,0.1)"; el.style.borderColor = muted ? C.borderDark : C.teal; el.style.opacity = "1"; }}
        onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.boxShadow = "0 1px 4px rgba(0,0,0,0.04)"; el.style.borderColor = C.border; el.style.opacity = muted ? "0.75" : "1"; }}>
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
            { label: "DELIVERED", actual: pDonePts, expected: expectedPts ?? 0, suffix: "sp", invertColor: false },
            { label: "REMAINING", actual: Math.max(0, resolved.totalEstPts - pDonePts), expected: Math.max(0, resolved.totalEstPts - (expectedPts ?? 0)), suffix: "sp", invertColor: true },
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

  const active  = projectSummaries.filter(s => !s.isPaused);
  const paused  = projectSummaries.filter(s => s.isPaused);

  return (
    <div style={{ maxWidth: 1400, margin: "24px auto", padding: "0 24px" }}>
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
          {snapshot.closedAt ? (
            <span style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", fontSize: 11, fontWeight: 600, borderRadius: 6, background: C.stripe, border: `1px solid ${C.border}`, color: C.textSub }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.textSub, flexShrink: 0 }} />
              Closed {new Date(snapshot.closedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </span>
          ) : (
            <button onClick={() => onCloseSnapshot?.(snapshot.id)}
              style={{ padding: "4px 10px", fontSize: 11, fontWeight: 600, border: `1px solid ${C.border}`, borderRadius: 6, background: C.surface, color: C.textMid, cursor: "pointer", fontFamily: "inherit" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = C.amber; (e.currentTarget as HTMLElement).style.color = C.amber; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = C.border; (e.currentTarget as HTMLElement).style.color = C.textMid; }}
              title="Close goal — freezes story points completed">
              Close Goal
            </button>
          )}
          <button onClick={() => setConfirmDelete(snapshot.id)} style={{ padding: "4px 8px", fontSize: 11, border: `1px solid ${C.border}`, borderRadius: 6, background: C.surface, color: C.textSub, cursor: "pointer", fontFamily: "inherit" }} title="Delete goal">🗑</button>
        </div>
      </div>

      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "14px 18px", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 9, background: C.tealLight, border: `1px solid ${C.teal}30`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>🎯</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{snapshot.label}</div>
              {snapshot.closedAt && <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 3, background: C.stripe, color: C.textSub, border: `1px solid ${C.border}`, letterSpacing: "0.06em" }}>CLOSED</span>}
            </div>
            <div style={{ fontSize: 11, color: C.textSub }}>Set {fmt(snapshot.createdAt)} · Target {fmt(snapshot.targetDate)}{isPastDue && !snapshot.closedAt && <span style={{ color: C.red, fontWeight: 600, marginLeft: 6 }}>· Past due</span>}</div>
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
