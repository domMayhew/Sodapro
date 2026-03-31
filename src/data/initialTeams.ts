import { mkTask, deepClone } from '../models/task';
import { mkTeam } from '../models/team';
import { mkProject } from '../models/project';
import type { Team, Task, GoalSnapshot } from '../types';

export const INITIAL_TEAMS: Team[] = (() => {
  const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
  const cl = (field: string, from: unknown, to: unknown, dAgo: number) => ({ field, from, to, at: daysAgo(dAgo) });

  const loginTask     = Object.assign(mkTask("Login page"),              { points: 3, assignee: "Alice Chen", tags: [] as string[], status: "done", changeLog: [cl("created", null, "Login page", 30), cl("status", "todo", "inprogress", 26), cl("status", "inprogress", "done", 22)] });
  const oauthTask     = Object.assign(mkTask("OAuth integration"),       { points: 8, assignee: "Bob Smith", tags: ["High Risk"], status: "inprogress", changeLog: [cl("created", null, "OAuth integration", 30), cl("status", "todo", "inprogress", 20), cl("points", 5, 7, 16), cl("points", 7, 8, 10)] });
  const pwResetTask   = Object.assign(mkTask("Password reset flow"),     { points: 2, assignee: "Amy Lee", tags: ["Unestimated"], status: "todo", changeLog: [cl("created", null, "Password reset flow", 30)] });
  const chartsTask    = Object.assign(mkTask("Charts & analytics"),      { points: 5, assignee: "Alice Chen", status: "inreview", changeLog: [cl("created", null, "Charts & analytics", 30), cl("status", "todo", "inprogress", 18), cl("points", 3, 5, 12), cl("status", "inprogress", "inreview", 5)] });
  const dataTableTask = Object.assign(mkTask("Data table with filters"), { points: 3, assignee: "Bob Smith", status: "todo", changeLog: [cl("created", null, "Data table with filters", 30)] });
  const restTask      = Object.assign(mkTask("REST endpoints"),          { points: 6, assignee: "Bob Smith", status: "inprogress", changeLog: [cl("created", null, "REST endpoints", 30), cl("status", "todo", "inprogress", 14), cl("points", 8, 6, 11)] });
  const authMwTask    = Object.assign(mkTask("Auth middleware"),         { points: 3, assignee: "Alice Chen", tags: ["Needs Review"], status: "done", changeLog: [cl("created", null, "Auth middleware", 30), cl("status", "todo", "inprogress", 25), cl("status", "inprogress", "done", 20)] });
  const errBoundaryTask = Object.assign(mkTask("Error boundary components"), { points: 4, assignee: "Alice Chen", tags: ["Nice to Have"], status: "todo", changeLog: [cl("created", null, "Error boundary components", 10)] });
  const notifTask     = Object.assign(mkTask("Email notifications"),     { points: 6, assignee: "Amy Lee", status: "inprogress", changeLog: [cl("created", null, "Email notifications", 12), cl("status", "todo", "inprogress", 7)] });

  const p1Root: Task = {
    id: "root-p1", name: "root", _isRoot: true, collapsed: false,
    points: 0, description: "", assignee: "", tags: [], status: "todo", changeLog: [], archived: false,
    children: [
      { ...mkTask("Frontend"), id: "fg-fe", children: [
        { ...mkTask("Authentication"), id: "fg-auth", children: [loginTask, oauthTask, pwResetTask] },
        { ...mkTask("Dashboard"), id: "fg-dash", children: [chartsTask, dataTableTask, errBoundaryTask] },
      ]},
      { ...mkTask("Backend"), id: "fg-be", children: [
        { ...mkTask("API Layer"), id: "fg-api", children: [restTask, authMwTask, notifTask] },
      ]},
    ],
  };

  const p1SnapRoot = deepClone(p1Root) as Task;
  const resetStatuses = (node: Task): Task => ({ ...node, status: "todo", archived: false, changeLog: node.changeLog?.slice(0,1) || [], children: (node.children || []).map(resetStatuses) });
  const p1SnapRootClean = resetStatuses(p1SnapRoot);
  const patchSnapPts = (node: Task, patchMap: Record<string, number>): Task => ({ ...node, points: patchMap[node.id] ?? node.points, children: (node.children || []).map(c => patchSnapPts(c, patchMap)) });
  const p1SnapRootPatched = patchSnapPts(p1SnapRootClean, {
    [oauthTask.id]:  5,
    [chartsTask.id]: 3,
    [restTask.id]:   8,
  });

  const p1 = { id: "proj-1", name: "Q1 Web Platform", statusOverride: null, root: p1Root, ratio: [1, 1, 1], createdAt: daysAgo(60) };

  const navTask      = Object.assign(mkTask("Bottom nav redesign"),  { points: 3, assignee: "Diana Park", status: "done", changeLog: [cl("created", null, "Bottom nav redesign", 45), cl("status", "todo", "done", 30)] });
  const onboardTask  = Object.assign(mkTask("Onboarding flow"),      { points: 8, assignee: "Diana Park", status: "inprogress", changeLog: [cl("created", null, "Onboarding flow", 45), cl("status", "todo", "inprogress", 15)] });
  const pushTask     = Object.assign(mkTask("Push notifications"),   { points: 5, assignee: "Carlos Wu", status: "inreview", changeLog: [cl("created", null, "Push notifications", 45), cl("status", "todo", "inprogress", 20), cl("status", "inprogress", "inreview", 8)] });
  const profileTask  = Object.assign(mkTask("Profile settings"),     { points: 3, assignee: "Diana Park", tags: ["Needs Review"], status: "todo", changeLog: [cl("created", null, "Profile settings", 45)] });
  const deepLinkTask = Object.assign(mkTask("Deep linking"),         { points: 4, assignee: "Carlos Wu", status: "todo", changeLog: [cl("created", null, "Deep linking", 45)] });
  const offlineTask  = Object.assign(mkTask("Offline mode"),         { points: 6, assignee: "Carlos Wu", tags: ["High Risk"], status: "todo", changeLog: [cl("created", null, "Offline mode", 45)] });

  const p2Root: Task = {
    id: "root-p2", name: "root", _isRoot: true, collapsed: false,
    points: 0, description: "", assignee: "", tags: [], status: "todo", changeLog: [], archived: false,
    children: [
      { ...mkTask("UX"), id: "fg-ux", children: [navTask, onboardTask, profileTask] },
      { ...mkTask("Platform"), id: "fg-platform", children: [pushTask, deepLinkTask, offlineTask] },
    ],
  };

  const p2 = { id: "proj-2", name: "Mobile App Redesign", statusOverride: null, root: p2Root, ratio: [1, 0.5, 0.5], createdAt: daysAgo(50) };

  const tokensTask = Object.assign(mkTask("Color & spacing tokens"), { points: 2, assignee: "Alice Chen", status: "done", changeLog: [cl("created", null, "Color & spacing tokens", 90), cl("status", "todo", "done", 70)] });
  const buttonTask = Object.assign(mkTask("Button components"),      { points: 3, assignee: "Diana Park", status: "done", changeLog: [cl("created", null, "Button components", 90), cl("status", "todo", "done", 60)] });
  const formTask   = Object.assign(mkTask("Form components"),        { points: 5, assignee: "Diana Park", status: "done", changeLog: [cl("created", null, "Form components", 90), cl("status", "todo", "done", 40)] });
  const docTask    = Object.assign(mkTask("Storybook docs"),         { points: 4, assignee: "Alice Chen", status: "done", changeLog: [cl("created", null, "Storybook docs", 90), cl("status", "todo", "done", 20)] });

  const p3Root: Task = {
    id: "root-p3", name: "root", _isRoot: true, collapsed: false,
    points: 0, description: "", assignee: "", tags: [], status: "todo", changeLog: [], archived: false,
    children: [
      { ...mkTask("Core"), id: "fg-core", children: [tokensTask, buttonTask, formTask, docTask] },
    ],
  };

  const p3 = { id: "proj-3", name: "Design System v2", statusOverride: null, root: p3Root, ratio: [1, 0.5, 1], createdAt: daysAgo(100) };

  const goalProjectSnapshots = [
    { projectId: p1.id, projectName: p1.name, ratio: [1, 1, 1] as number[], root: p1SnapRootPatched, inScopeIds: [loginTask.id, oauthTask.id, chartsTask.id, restTask.id, authMwTask.id] },
    { projectId: p2.id, projectName: p2.name, ratio: [1, 0.5, 0.5] as number[], root: deepClone(p2Root) as Task, inScopeIds: [navTask.id, onboardTask.id, pushTask.id] },
  ];

  const teamGoal: GoalSnapshot = {
    id: "goal-demo-1", label: "March 2025 Sprint Goal",
    createdAt: daysAgo(28),
    targetDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    velocity: 2,
    projectSnapshots: goalProjectSnapshots,
  };

  const team: Team = { id: "team-acme", name: "Acme Engineering", projects: [p1, p2, p3], snapshots: [teamGoal], taskOrder: {}, createdAt: daysAgo(120) };
  const team2: Team = { id: "team-data", name: "Data Platform", projects: [], snapshots: [], taskOrder: {}, createdAt: daysAgo(30) };
  return [team, team2];
})();
