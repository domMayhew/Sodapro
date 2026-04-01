import { useState, useMemo, useCallback } from 'react';
import { C } from '../constants/colors';
import { ACTIVE_STATUSES, statusById } from '../constants/statuses';
import { computePts, collectLeafTasks } from '../models/task';
import { effectiveProjectStatus } from '../models/project';
import { sortTasksByOrder } from '../models/ordering';
import { TL, tlGetHue, tlWorkingDaysArr, tlIsMonday, tlBuildConcurrencyMap, tlComputeBurnedDays } from '../models/timeline';
import { useWindowWidth } from '../hooks';
import type { Project, Task, TimelineItem } from '../types';
import { Avatar, Stepper } from './ui';

/* ── TimelineBlock ─────────────────────────────────────────────── */
function TimelineBlock({ item, hue }: { item: TimelineItem; hue: number }) {
  const W = Math.max(item.duration * TL.DAY_W - 8, 28);
  const H = TL.LANE_H - 22;
  const isActive = ACTIVE_STATUSES.has(item.task.status);
  const bg      = isActive ? `hsl(${hue},55%,89%)` : `hsl(${hue},40%,94%)`;
  const border  = isActive ? `2px solid hsl(${hue},55%,68%)` : `1.5px solid hsl(${hue},40%,82%)`;
  const txtMain = isActive ? `hsl(${hue},55%,20%)` : `hsl(${hue},40%,30%)`;
  const txtSub  = isActive ? `hsl(${hue},45%,38%)` : `hsl(${hue},35%,50%)`;
  const spLabel = item.burned > 0 ? `${item.pts.total}sp · ${item.remainingDays}d left` : `${item.pts.total}sp`;
  const statusDot = isActive ? <span style={{ width: 6, height: 6, borderRadius: "50%", background: statusById(item.task.status).dot, flexShrink: 0 }} /> : null;

  return (
    <div title={`${item.task.name} · ${item.pts.total}sp${item.burned > 0 ? ` · ~${item.remainingDays}d remaining (${item.burned.toFixed(1)}d burned)` : ""}`}
      style={{ position: "absolute", left: item.startDay * TL.DAY_W + 4, top: 11, width: W, height: H, borderRadius: 7, background: bg, border, display: "flex", alignItems: "center", padding: "0 8px", gap: 5, overflow: "hidden", userSelect: "none", transition: "box-shadow 0.12s" }}
      onMouseEnter={e => (e.currentTarget as HTMLElement).style.boxShadow = "0 2px 10px rgba(0,0,0,0.13)"}
      onMouseLeave={e => (e.currentTarget as HTMLElement).style.boxShadow = "none"}>
      {statusDot}
      <span style={{ fontSize: 11, fontWeight: isActive ? 700 : 600, color: txtMain, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>{item.task.name}</span>
      {W > 80 && <span style={{ fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, color: txtSub, flexShrink: 0 }}>{spLabel}</span>}
    </div>
  );
}

/* ── LaneSidebar ───────────────────────────────────────────────── */
function LaneSidebar({ assignee, totalLaneDays, taskCount, allNames, compact }: {
  assignee: string;
  totalLaneDays: number;
  taskCount: number;
  allNames: string[];
  compact: boolean;
}) {
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

/* ── TimelineView ──────────────────────────────────────────────── */
export function TimelineView({ projects, taskOrder }: {
  projects: Project[];
  taskOrder: Record<string, string[]>;
}) {
  const [velocity, setVelocity] = useState(2);
  const [startDate, setStartDate] = useState(() => { const d = new Date(); d.setHours(0,0,0,0); return d; });
  const windowWidth = useWindowWidth();
  const compact = windowWidth < 600;
  const sidebarW = compact ? TL.SIDEBAR_W_COMPACT : TL.SIDEBAR_W;

  const allLeafs = useMemo(() => {
    const all: (Task & { _projectName: string; _ratio: number[] })[] = [];
    projects.forEach(p => {
      const eff = effectiveProjectStatus(p);
      if (eff === "completed" || eff === "cancelled" || eff === "onhold") return;
      collectLeafTasks(p.root).forEach(t => all.push({ ...t, _projectName: p.name, _ratio: p.ratio }));
    });
    return all;
  }, [projects]);

  const defaultRatio = projects[0]?.ratio || [1, 1, 1];
  const taskById = useMemo(() => { const m: Record<string, typeof allLeafs[0]> = {}; allLeafs.forEach(t => { m[t.id] = t; }); return m; }, [allLeafs]);

  const assigneeGroups = useMemo(() => {
    const m = new Map<string, typeof allLeafs>();
    allLeafs.forEach(t => { const k = t.assignee || "Unassigned"; if (!m.has(k)) m.set(k, []); m.get(k)!.push(t); });
    return m;
  }, [allLeafs]);

  const orderMap = useMemo(() => {
    const m: Record<string, typeof allLeafs> = {};
    allLeafs.forEach(t => { const k = t.assignee || "Unassigned"; if (!m[k]) m[k] = []; m[k].push(t); });
    const sorted: Record<string, string[]> = {};
    Object.keys(m).forEach(assignee => {
      const prioList = taskOrder[assignee] || [];
      sorted[assignee] = sortTasksByOrder(m[assignee], prioList).map(t => t.id);
    });
    return sorted;
  }, [allLeafs, taskOrder]);

  const getLayout = useCallback((assignee: string): TimelineItem[] => {
    const ids = orderMap[assignee] || [];
    const assigneeTasks = ids.map(id => taskById[id]).filter(Boolean);
    const concurrencyMap = tlBuildConcurrencyMap(assigneeTasks);
    let day = 0;
    return ids.reduce((acc: TimelineItem[], id) => {
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
    const groups: { label: string; days: number }[] = []; let cur: string | null = null, cnt = 0;
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
            <input type="date" value={startDate.toISOString().slice(0,10)} onChange={e => { const d = new Date(e.target.value + "T00:00:00"); if (!isNaN(d.getTime())) setStartDate(d); }}
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
