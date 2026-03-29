import type { Task } from '../types';

const STATUS_BAND: Record<string, number> = { inreview: 0, inprogress: 1, todo: 2, done: 3 };
function getStatusBand(status: string): number { return STATUS_BAND[status] ?? 2; }

export function sortTasksByOrder(tasks: Task[], priorityList: string[] = []): Task[] {
  const prioIndex: Record<string, number> = {};
  priorityList.forEach((id, i) => { prioIndex[id] = i; });

  return [...tasks].sort((a, b) => {
    const bandA = getStatusBand(a.status || "todo");
    const bandB = getStatusBand(b.status || "todo");
    if (bandA !== bandB) return bandA - bandB;
    const pA = prioIndex[a.id] ?? 999999;
    const pB = prioIndex[b.id] ?? 999999;
    return pA - pB;
  });
}

export function reorderTaskInColumn(
  taskOrder: Record<string, string[]>,
  assignee: string,
  columnTaskIds: string[],
  fromIndex: number,
  toIndex: number,
): Record<string, string[]> {
  const currentOrder = [...(taskOrder[assignee] || [])];
  const movedId = columnTaskIds[fromIndex];

  const filtered = currentOrder.filter(id => id !== movedId);

  if (toIndex >= columnTaskIds.length) {
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

  columnTaskIds.forEach(id => {
    if (!filtered.includes(id)) filtered.push(id);
  });

  return { ...taskOrder, [assignee]: filtered };
}

export function workingDaysBetweenDates(from: Date, to: Date): number {
  let count = 0;
  const d = new Date(from); d.setHours(0, 0, 0, 0);
  const end = new Date(to); end.setHours(0, 0, 0, 0);
  while (d <= end) {
    if (d.getDay() !== 0 && d.getDay() !== 6) count++;
    d.setDate(d.getDate() + 1);
  }
  return Math.max(count, 0);
}

export function workingDaysBetween(from: string | Date, to: string | Date): number {
  return workingDaysBetweenDates(new Date(from), new Date(to));
}
