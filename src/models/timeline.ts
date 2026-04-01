import type { Task } from '../types';
import { ACTIVE_STATUSES } from '../constants';

export const TL = { DAY_W: 48, LANE_H: 70, SIDEBAR_W: 172, SIDEBAR_W_COMPACT: 52 };

export function tlAddDays(d: Date, n: number): Date { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
export function tlIsWeekend(d: Date): boolean  { const w = d.getDay(); return w === 0 || w === 6; }
export function tlIsMonday(d: Date): boolean   { return d.getDay() === 1; }

export function tlWorkingDaysArr(from: Date, count: number): Date[] {
  const days: Date[] = [];
  const d = new Date(from); d.setHours(0, 0, 0, 0);
  while (days.length < count) {
    if (!tlIsWeekend(d)) days.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return days;
}

export function tlGetHue(name: string): number {
  if (!name || name === "Unassigned") return 215;
  return [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
}

export function tlGetActiveIntervals(task: Task): { from: Date; to: Date }[] {
  const log = (task.changeLog || []).filter(e => e.field === "status");
  if (log.length === 0) return [];
  const now = new Date();
  const intervals: { from: Date; to: Date }[] = [];
  for (let i = 0; i < log.length; i++) {
    if (ACTIVE_STATUSES.has(log[i].to as string)) {
      const from = new Date(log[i].at);
      const to   = i + 1 < log.length ? new Date(log[i + 1].at) : now;
      intervals.push({ from, to });
    }
  }
  return intervals;
}

export function tlBuildConcurrencyMap(tasks: Task[]): Record<string, number> {
  const map: Record<string, number> = {};
  tasks.forEach(task => {
    tlGetActiveIntervals(task).forEach(({ from, to }) => {
      const d = new Date(from); d.setHours(0, 0, 0, 0);
      const end = new Date(to); end.setHours(0, 0, 0, 0);
      while (d <= end) {
        if (!tlIsWeekend(d)) {
          const key = d.toISOString().slice(0, 10);
          map[key] = (map[key] || 0) + 1;
        }
        d.setDate(d.getDate() + 1);
      }
    });
  });
  return map;
}

export function tlComputeBurnedDays(task: Task, concurrencyMap: Record<string, number>): number {
  let burned = 0;
  tlGetActiveIntervals(task).forEach(({ from, to }) => {
    const d = new Date(from); d.setHours(0, 0, 0, 0);
    const end = new Date(to); end.setHours(0, 0, 0, 0);
    while (d <= end) {
      if (!tlIsWeekend(d)) {
        const key = d.toISOString().slice(0, 10);
        burned += 1 / (concurrencyMap[key] || 1);
      }
      d.setDate(d.getDate() + 1);
    }
  });
  return burned;
}
