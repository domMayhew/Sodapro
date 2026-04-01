export interface Task {
  id: string;
  name: string;
  points: number;
  children: Task[];
  collapsed: boolean;
  description: string;
  assignee: string;
  tags: string[];
  status: string;
  changeLog: ChangeLogEntry[];
  archived: boolean;
  _isRoot?: boolean;
  // Added by Kanban/Timeline views
  _projectId?: string;
  _projectName?: string;
  _ratio?: number[];
}

export interface ChangeLogEntry {
  field: string;
  from: unknown;
  to: unknown;
  at: string;
}

export interface Project {
  id: string;
  name: string;
  statusOverride: string | null;
  root: Task;
  ratio: number[];
  createdAt: string;
}

export interface Team {
  id: string;
  name: string;
  projects: Project[];
  snapshots: GoalSnapshot[];
  taskOrder: Record<string, string[]>;
  createdAt: string;
}

export interface GoalSnapshot {
  id: string;
  label: string;
  createdAt: string;
  targetDate: string;
  velocity: number;
  projectSnapshots: ProjectSnapshot[];
  closedAt?: string;
}

export interface ProjectSnapshot {
  projectId: string;
  projectName: string;
  ratio: number[];
  root: Task;
  inScopeIds: string[];
  closedTaskStatuses?: Record<string, string>;
}

export interface Points {
  impl: number;
  test: number;
  review: number;
  total: number;
}

export interface StatusDef {
  id: string;
  label: string;
  color: string;
  bg: string;
  border: string;
  dot: string;
}

export interface TagDef {
  label: string;
  bg: string;
  color: string;
  border: string;
}

export interface ScopeItem {
  id: string;
  name: string;
  assignee: string;
  estPts: number;
  currPts: number;
  status: string;
  isDone: boolean;
  isArchived: boolean;
  isMissing: boolean;
  estimateDrifted: boolean;
  ptsDelta: number;
}

export interface ResolvedProjectGoal {
  scopeItems: ScopeItem[];
  addedSince: Task[];
  statusCounts: Record<string, number>;
  totalEstPts: number;
  totalDonePts: number;
  completionPct: number;
  driftPts: number;
  creepCount: number;
  currentRatio: number[];
}

export interface TeamGoalSummaryProject {
  pSnap: ProjectSnapshot;
  currentProject: Project | undefined;
  resolved: ResolvedProjectGoal;
  currentEffectiveStatus: string | null;
  isPaused: boolean;
  throughput: string | null;
  expectedPts?: number;
}

export interface TeamGoalSummary {
  projectSummaries: TeamGoalSummaryProject[];
  barCounts: Record<string, number>;
  totalScopeCount: number;
  totalEstPts: number;
  totalDonePts: number;
  completionPct: number;
  teamThroughput: string | null;
  expectedPtsDone: number;
  totalDrift: number;
  totalCreep: number;
}

export interface TimelineItem {
  id: string;
  task: Task;
  pts: Points;
  duration: number;
  remainingDays: number;
  burned: number;
  startDay: number;
  endDay: number;
}
