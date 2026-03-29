import type { Task, Project, ProjectSnapshot, GoalSnapshot, ResolvedProjectGoal, TeamGoalSummary } from '../types';
import { computePts, collectAllLeafTasks, collectLeafTasks } from './task';
import { effectiveProjectStatus } from './project';

export function resolveProjectGoalScope(pSnap: ProjectSnapshot, currentProject: Project | undefined): ResolvedProjectGoal {
  const currentRoot  = currentProject?.root  || pSnap.root;
  const currentRatio = currentProject?.ratio || pSnap.ratio;
  const snapRatio    = pSnap.ratio;

  const snapLeaves   = collectAllLeafTasks(pSnap.root);
  const currentAll   = collectAllLeafTasks(currentRoot);
  const currentActive = collectLeafTasks(currentRoot);

  const snapIds    = new Set(snapLeaves.map(t => t.id));
  const inScopeIds = new Set(pSnap.inScopeIds || snapLeaves.map(t => t.id));

  const snapById: Record<string, Task>    = {}; snapLeaves.forEach(t  => snapById[t.id] = t);
  const currentById: Record<string, Task> = {}; currentAll.forEach(t  => currentById[t.id] = t);

  const scopeTasks = snapLeaves.filter(t => inScopeIds.has(t.id));
  const scopeItems = scopeTasks.map(t => {
    const snapT = snapById[t.id];
    const curr  = currentById[t.id] || null;

    const estPts  = computePts(snapT, snapRatio, true).total;
    const currPts = curr ? computePts(curr, currentRatio, true).total : estPts;

    const isMissing  = !curr;
    const isArchived = curr?.archived ?? false;
    const status     = curr?.status || "todo";
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

  const addedSince = currentActive.filter(t => !snapIds.has(t.id));

  const statusCounts: Record<string, number> = { todo: 0, inprogress: 0, inreview: 0, done: 0 };
  scopeItems.forEach(x => {
    if (x.isMissing || x.isArchived) { statusCounts.todo++; return; }
    statusCounts[x.status] = (statusCounts[x.status] || 0) + 1;
  });

  const totalEstPts  = scopeItems.reduce((s, x) => s + x.estPts, 0);
  const totalDonePts = scopeItems.filter(x => x.isDone).reduce((s, x) => s + x.estPts, 0);
  const completionPct = totalEstPts > 0 ? Math.round(totalDonePts / totalEstPts * 100) : 0;

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

export function resolveTeamGoalSummary(snapshot: GoalSnapshot, projects: Project[], elapsedDays: number): TeamGoalSummary {
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
