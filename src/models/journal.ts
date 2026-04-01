import type { Project, Task, PersonalTimer, JournalEntry } from '../types';
import { collectAllLeafTasks, collectLeafTasks } from './task';

/* ── Date helpers ──────────────────────────────────────────────── */

export function toLocalDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function todayStr(): string { return toLocalDate(new Date().toISOString()); }

export function fmtDate(date: string): string {
  return new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export function fmtTracked(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60), m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** Returns Monday YYYY-MM-DD of the week containing `date`. */
export function getWeekStart(date: string): string {
  const d = new Date(date + 'T00:00:00');
  const offset = d.getDay() === 0 ? 6 : d.getDay() - 1;
  d.setDate(d.getDate() - offset);
  return toLocalDate(d.toISOString());
}

/** Returns Mon–Fri date strings for the week whose Monday is `weekStart`. */
export function weekDays(weekStart: string): string[] {
  const days: string[] = [];
  const d = new Date(weekStart + 'T00:00:00');
  for (let i = 0; i < 7; i++) {
    const day = new Date(d); day.setDate(d.getDate() + i);
    if (day.getDay() !== 0 && day.getDay() !== 6) days.push(toLocalDate(day.toISOString()));
  }
  return days;
}

/* ── Activity derivation ───────────────────────────────────────── */

export type ActivityItem =
  | { kind: 'status';  taskId: string; taskName: string; from: string; to: string;   at: string }
  | { kind: 'points';  taskId: string; taskName: string; from: number; to: number;   at: string }
  | { kind: 'created'; taskId: string; taskName: string;                              at: string }
  | { kind: 'time';    taskId: string; taskName: string; phase: string; mins: number; at: string };

/**
 * Scans all task changeLogs and timeEntries across projects for a given
 * assignee on a specific local date, returning sorted ActivityItems.
 */
export function deriveActivityForDate(
  projects: Project[],
  assignee: string,
  date: string,
): ActivityItem[] {
  const items: ActivityItem[] = [];

  for (const project of projects) {
    for (const task of collectAllLeafTasks(project.root)) {
      if (task.assignee !== assignee) continue;

      // changeLog events
      for (const cl of (task.changeLog || [])) {
        if (toLocalDate(cl.at) !== date) continue;
        if (cl.field === 'status') {
          items.push({ kind: 'status', taskId: task.id, taskName: task.name, from: String(cl.from ?? ''), to: String(cl.to ?? ''), at: cl.at });
        } else if (cl.field === 'points' && cl.from !== null) {
          items.push({ kind: 'points', taskId: task.id, taskName: task.name, from: Number(cl.from), to: Number(cl.to), at: cl.at });
        } else if (cl.field === 'created') {
          items.push({ kind: 'created', taskId: task.id, taskName: task.name, at: cl.at });
        }
      }

      // timeEntries — aggregate per phase, only completed sessions on this date
      const phaseMap: Record<string, { mins: number; lastAt: string }> = {};
      for (const te of ((task as Task & { timeEntries?: { phase: string; startedAt: string; stoppedAt?: string }[] }).timeEntries || [])) {
        if (!te.stoppedAt || toLocalDate(te.stoppedAt) !== date) continue;
        const mins = Math.floor((new Date(te.stoppedAt).getTime() - new Date(te.startedAt).getTime()) / 60000);
        if (!phaseMap[te.phase]) phaseMap[te.phase] = { mins: 0, lastAt: te.stoppedAt };
        phaseMap[te.phase].mins += mins;
        if (te.stoppedAt > phaseMap[te.phase].lastAt) phaseMap[te.phase].lastAt = te.stoppedAt;
      }
      for (const [phase, { mins, lastAt }] of Object.entries(phaseMap)) {
        if (mins > 0) items.push({ kind: 'time', taskId: task.id, taskName: task.name, phase, mins, at: lastAt });
      }
    }
  }

  return items.sort((a, b) => a.at.localeCompare(b.at));
}

/* ── "What's Next" derivation ──────────────────────────────────── */

export function deriveWhatNext(projects: Project[], assignee: string) {
  const inProgress: Task[] = [], upNext: Task[] = [];
  for (const p of projects) {
    for (const t of collectLeafTasks(p.root)) {
      if (t.assignee !== assignee) continue;
      if (t.status === 'inprogress' || t.status === 'inreview') inProgress.push(t);
      else if (!t.status || t.status === 'todo') upNext.push(t);
    }
  }
  return { inProgress, upNext };
}

/* ── Summary clipboard formatting ─────────────────────────────── */

export function formatDailySummary(
  date: string,
  activity: ActivityItem[],
  entries: JournalEntry[],
  inProgress: Task[],
  upNext: Task[],
): string {
  const lines: string[] = [];
  lines.push(new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }));

  const actLines = activity.map(item => {
    if (item.kind === 'status') return `${item.to === 'done' ? '✓' : '→'} ${item.taskName}${item.to !== 'done' ? ` → ${item.to}` : ''}`;
    if (item.kind === 'points') return `~ ${item.taskName} ${item.from}sp → ${item.to}sp`;
    if (item.kind === 'time')   return `⏱ ${fmtTracked(item.mins)} on ${item.taskName} (${item.phase})`;
    if (item.kind === 'created') return `+ ${item.taskName} created`;
    return '';
  }).filter(Boolean);
  if (actLines.length) { lines.push(''); lines.push(...actLines); }

  const pub = entries.filter(e => !e.private);
  if (pub.length) {
    lines.push('');
    pub.forEach(e => {
      if (e.type === 'todo') lines.push(`${e.resolvedAt ? '☑' : '☐'} ${e.text}`);
      else if (e.type === 'time' && e.durationMinutes) lines.push(`⏱ ${fmtTracked(e.durationMinutes)} — ${e.text}`);
      else lines.push(`📝 ${e.text}`);
    });
  }

  if (inProgress.length || upNext.length) {
    lines.push('');
    if (inProgress.length) lines.push(`In progress: ${inProgress.map(t => t.name).join(', ')}`);
    if (upNext.length) lines.push(`Up next: ${upNext.slice(0, 3).map(t => t.name).join(', ')}${upNext.length > 3 ? ` +${upNext.length - 3} more` : ''}`);
  }

  return lines.join('\n').trim();
}

/* ── Personal timer helpers ────────────────────────────────────── */

export function ptIsRunning(timer: PersonalTimer): boolean {
  return timer.entries.some(e => !e.stoppedAt);
}

export function ptMinutesForDate(timer: PersonalTimer, date: string): number {
  return timer.entries.reduce((sum, e) => {
    if (toLocalDate(e.startedAt) !== date && (!e.stoppedAt || toLocalDate(e.stoppedAt) !== date)) return sum;
    const ms = (e.stoppedAt ? new Date(e.stoppedAt).getTime() : Date.now()) - new Date(e.startedAt).getTime();
    return sum + Math.floor(ms / 60000);
  }, 0);
}

export function ptTotalMinutes(timer: PersonalTimer): number {
  return timer.entries.reduce((sum, e) => {
    const ms = (e.stoppedAt ? new Date(e.stoppedAt).getTime() : Date.now()) - new Date(e.startedAt).getTime();
    return sum + Math.floor(ms / 60000);
  }, 0);
}

/** Stops all running timers then starts the one with the given id. */
export function ptStartTimer(timers: PersonalTimer[], id: string): PersonalTimer[] {
  const now = new Date().toISOString();
  return timers.map(t => {
    const stopped = { ...t, entries: t.entries.map(e => e.stoppedAt ? e : { ...e, stoppedAt: now }) };
    return stopped.id === id ? { ...stopped, entries: [...stopped.entries, { startedAt: now }] } : stopped;
  });
}

/** Stops the running entry on the timer with the given id. */
export function ptStopTimer(timers: PersonalTimer[], id: string): PersonalTimer[] {
  const now = new Date().toISOString();
  return timers.map(t => t.id !== id ? t : { ...t, entries: t.entries.map(e => e.stoppedAt ? e : { ...e, stoppedAt: now }) });
}
