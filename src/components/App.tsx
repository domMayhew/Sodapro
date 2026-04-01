import { useState, useCallback } from 'react';
import { C } from '../constants/colors';
import { mapTask, collectAllLeafTasks } from '../models/task';
import { mkProject } from '../models/project';
import { mkTeam } from '../models/team';
import { reorderTaskInColumn } from '../models/ordering';
import { useWindowWidth } from '../hooks';
import type { Team, Project, Task } from '../types';
import { INITIAL_TEAMS } from '../data/initialTeams';
import { Sidebar } from './Sidebar';
import { EstimateView } from './EstimateView';
import { TimelineView } from './TimelineView';
import { KanbanView } from './KanbanView';
import { ProjectsView } from './ProjectsView';
import { GoalsView, ProjectGoalDetail, SetGoalModal } from './GoalsView';
import { DailyJournalView } from './DailyJournalView';

const TEAM_VIEWS = [
  { id: "projects", label: "Projects", icon: "⊡" },
  { id: "kanban",   label: "Kanban",   icon: "⊞" },
  { id: "timeline", label: "Timeline", icon: "▬" },
  { id: "goals",    label: "Goals",    icon: "◎" },
  { id: "journal",  label: "Journal",  icon: "✏" },
] as const;

type TeamViewId = typeof TEAM_VIEWS[number]["id"];

export default function App() {
  const [teams, setTeams] = useState<Team[]>(INITIAL_TEAMS);
  const [selectedTeamId, setSelectedTeamId] = useState(INITIAL_TEAMS[0].id);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [teamView, setTeamView] = useState<TeamViewId>("projects");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [goalDrilldown, setGoalDrilldown] = useState<{ snapshotId: string; projectId: string } | null>(null);

  const selectedTeam = teams.find(t => t.id === selectedTeamId) || teams[0];
  const selectedProject = selectedProjectId ? selectedTeam?.projects.find(p => p.id === selectedProjectId) : null;

  const updateTeam = useCallback((teamId: string, fn: (t: Team) => Team) => {
    setTeams(ts => ts.map(t => t.id === teamId ? fn(t) : t));
  }, []);

  const updateProject = useCallback((teamId: string, projectId: string, fn: (p: Project) => Project) => {
    updateTeam(teamId, t => ({ ...t, projects: t.projects.map(p => p.id === projectId ? fn(p) : p) }));
  }, [updateTeam]);

  const onUpdateTaskInProject = useCallback((projectId: string, taskId: string, fn: (t: Task) => Task) => {
    updateProject(selectedTeamId, projectId, p => ({ ...p, root: mapTask(p.root, taskId, fn) }));
  }, [selectedTeamId, updateProject]);

  const onReorderTask = useCallback((assignee: string, columnTaskIds: string[], fromIndex: number, toIndex: number) => {
    updateTeam(selectedTeamId, t => ({
      ...t,
      taskOrder: reorderTaskInColumn(t.taskOrder || {}, assignee, columnTaskIds, fromIndex, toIndex),
    }));
  }, [selectedTeamId, updateTeam]);

  const selectProject = (projectId: string) => { setSelectedProjectId(projectId); setGoalDrilldown(null); };
  const backToTeam = () => { setSelectedProjectId(null); setGoalDrilldown(null); };

  const addTeam = () => {
    const team = mkTeam("New Team");
    setTeams(ts => [...ts, team]);
    setSelectedTeamId(team.id);
    setSelectedProjectId(null);
    setTeamView("projects");
  };

  const addProject = () => {
    const p = mkProject("New Project");
    updateTeam(selectedTeamId, t => ({ ...t, projects: [...t.projects, p] }));
    selectProject(p.id);
  };

  const deleteProject = useCallback((projectId: string) => {
    updateTeam(selectedTeamId, t => ({ ...t, projects: t.projects.filter(p => p.id !== projectId) }));
    if (selectedProjectId === projectId) backToTeam();
  }, [selectedTeamId, selectedProjectId, updateTeam]);

  const handleSelectTeam = (teamId: string) => {
    setSelectedTeamId(teamId);
    setSelectedProjectId(null);
    setTeamView("projects");
    setGoalDrilldown(null);
  };

  const handleSelectProjectGoal = (snapshotId: string, projectId: string) => {
    setGoalDrilldown({ snapshotId, projectId });
  };

  const handleDeleteSnapshot = (id: string) => {
    updateTeam(selectedTeamId, t => ({ ...t, snapshots: t.snapshots.filter(s => s.id !== id) }));
  };

  const handleCloseSnapshot = useCallback((snapshotId: string) => {
    updateTeam(selectedTeamId, t => ({
      ...t,
      snapshots: t.snapshots.map(snap => {
        if (snap.id !== snapshotId) return snap;
        return {
          ...snap,
          closedAt: new Date().toISOString(),
          projectSnapshots: snap.projectSnapshots.map(pSnap => {
            const currentProject = t.projects.find(p => p.id === pSnap.projectId);
            const closedTaskStatuses: Record<string, string> = {};
            if (currentProject) {
              collectAllLeafTasks(currentProject.root).forEach(task => {
                closedTaskStatuses[task.id] = task.status;
              });
            }
            return { ...pSnap, closedTaskStatuses };
          }),
        };
      }),
    }));
  }, [selectedTeamId, updateTeam]);

  let goalDrilldownData: { snap: NonNullable<Team["snapshots"][0]>; pSnap: NonNullable<Team["snapshots"][0]["projectSnapshots"][0]>; currentProject: Project | undefined } | null = null;
  if (goalDrilldown && teamView === "goals") {
    const snap = selectedTeam?.snapshots.find(s => s.id === goalDrilldown.snapshotId);
    if (snap) {
      const pSnap = snap.projectSnapshots?.find(p => p.projectId === goalDrilldown.projectId);
      const currentProject = selectedTeam?.projects.find(p => p.id === goalDrilldown.projectId);
      if (pSnap) goalDrilldownData = { snap, pSnap, currentProject };
    }
  }

  const goalsCount = selectedTeam?.snapshots.length || 0;

  const windowWidth = useWindowWidth();
  const isMobile = windowWidth < 640;
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", flexDirection: "column", fontFamily: "'Instrument Sans', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600;700&family=Instrument+Sans:wght@400;500;600&display=swap" rel="stylesheet" />

      {isMobile && drawerOpen && (
        <>
          <div onClick={() => setDrawerOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,0.4)" }} />
          <div style={{ position: "fixed", top: 0, left: 0, bottom: 0, width: 260, zIndex: 51, background: C.sidebar, display: "flex", flexDirection: "column", boxShadow: "4px 0 24px rgba(0,0,0,0.25)" }}>
            <div style={{ padding: "18px 16px 12px", borderBottom: `1px solid ${C.sidebarBorder}`, display: "flex", alignItems: "center", gap: 10 }}>
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none"><rect x="1" y="1" width="8" height="8" rx="2" fill={C.accent}/><rect x="11" y="1" width="8" height="8" rx="2" fill={C.accent} fillOpacity=".3"/><rect x="1" y="11" width="8" height="8" rx="2" fill={C.accent} fillOpacity=".3"/><rect x="11" y="11" width="8" height="8" rx="2" fill={C.accent}/></svg>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.sidebarText, letterSpacing: "0.01em" }}>Teams</span>
              <button onClick={() => setDrawerOpen(false)} style={{ marginLeft: "auto", background: "none", border: "none", color: C.sidebarSub, fontSize: 20, cursor: "pointer", padding: "0 4px", lineHeight: 1 }}>×</button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "8px 8px" }}>
              {teams.map(team => {
                const isSelected = team.id === selectedTeamId;
                const hue = [...team.name].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
                return (
                  <div key={team.id} onClick={() => { handleSelectTeam(team.id); setDrawerOpen(false); }}
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", borderRadius: 7, marginBottom: 2, cursor: "pointer", background: isSelected ? `hsl(${hue},80%,94%)` : "transparent", border: `1px solid ${isSelected ? `hsl(${hue},50%,78%)` : "transparent"}` }}
                    onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = "rgba(0,0,0,0.04)"; }}
                    onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = isSelected ? `hsl(${hue},80%,94%)` : "transparent"; }}>
                    <div style={{ width: 28, height: 28, borderRadius: 7, flexShrink: 0, background: `hsl(${hue},45%,35%)`, color: `hsl(${hue},45%,90%)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700 }}>{team.name.charAt(0).toUpperCase()}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: isSelected ? 600 : 400, color: isSelected ? C.text : C.sidebarSub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{team.name}</div>
                      <div style={{ fontSize: 10, color: C.sidebarSub }}>{team.projects.length} project{team.projects.length !== 1 ? "s" : ""}</div>
                    </div>
                    {isSelected && <span style={{ width: 6, height: 6, borderRadius: "50%", background: `hsl(${hue},55%,45%)`, flexShrink: 0 }} />}
                  </div>
                );
              })}
            </div>
            <div style={{ padding: "8px 8px 20px", borderTop: `1px solid ${C.sidebarBorder}` }}>
              <button onClick={() => { addTeam(); setDrawerOpen(false); }}
                style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 10px", background: "none", border: "none", cursor: "pointer", color: C.sidebarSub, fontSize: 13, fontFamily: "inherit", borderRadius: 6 }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = C.sidebarText}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = C.sidebarSub}>
                <span style={{ fontSize: 16 }}>+</span> New Team
              </button>
            </div>
          </div>
        </>
      )}

      {/* Top navbar */}
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, position: "sticky", top: 0, zIndex: 30, boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: isMobile ? "9px 12px 7px" : "10px 16px 8px" }}>
          {isMobile ? (
            <button onClick={() => setDrawerOpen(true)} style={{ flexShrink: 0, background: "none", border: "none", cursor: "pointer", padding: "2px 4px", display: "flex", flexDirection: "column", justifyContent: "center", gap: 4, color: C.text }}>
              <span style={{ display: "block", width: 18, height: 2, borderRadius: 1, background: C.text }} />
              <span style={{ display: "block", width: 18, height: 2, borderRadius: 1, background: C.text }} />
              <span style={{ display: "block", width: 18, height: 2, borderRadius: 1, background: C.text }} />
            </button>
          ) : (
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" style={{ flexShrink: 0 }}><rect x="1" y="1" width="8" height="8" rx="2" fill={C.accent}/><rect x="11" y="1" width="8" height="8" rx="2" fill={C.accent} fillOpacity=".3"/><rect x="1" y="11" width="8" height="8" rx="2" fill={C.accent} fillOpacity=".3"/><rect x="11" y="11" width="8" height="8" rx="2" fill={C.accent}/></svg>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 4, flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: isMobile ? 13 : 15, fontWeight: 700, color: selectedProject ? C.textSub : C.text, cursor: selectedProject ? "pointer" : "default", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flexShrink: selectedProject ? 1 : 0 }}
              onClick={selectedProject ? backToTeam : undefined}>
              {selectedTeam?.name}
            </span>
            {selectedProject && (
              <>
                <span style={{ color: C.border, fontSize: 14, flexShrink: 0 }}>›</span>
                <span style={{ fontSize: isMobile ? 13 : 15, fontWeight: 700, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selectedProject.name}</span>
              </>
            )}
          </div>

          {!isMobile && (
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
              {!selectedProject && (
                <button onClick={() => setShowGoalModal(true)}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = C.teal; (e.currentTarget as HTMLElement).style.color = C.teal; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = C.border; (e.currentTarget as HTMLElement).style.color = C.textMid; }}
                  style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 12px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.surface, color: C.textMid, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}>
                  🎯 Set Goal
                </button>
              )}
              {!selectedProject ? (
                <div style={{ display: "flex", gap: 2, background: C.bg, borderRadius: 7, padding: 2, border: `1px solid ${C.border}` }}>
                  {TEAM_VIEWS.map(({ id, label, icon }) => (
                    <button key={id} onClick={() => { setTeamView(id); setGoalDrilldown(null); }} style={{
                      position: "relative", display: "flex", alignItems: "center", gap: 5, padding: "4px 12px", borderRadius: 5, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit",
                      background: teamView === id ? C.surface : "transparent", color: teamView === id ? C.text : C.textSub,
                      boxShadow: teamView === id ? "0 1px 3px rgba(0,0,0,0.08)" : "none", transition: "all 0.15s",
                    }}>
                      <span style={{ fontSize: 10, opacity: 0.7 }}>{icon}</span>{label}
                      {id === "goals" && goalsCount > 0 && <span style={{ position: "absolute", top: 1, right: 1, width: 14, height: 14, borderRadius: "50%", background: C.teal, color: "#fff", fontSize: 8, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{goalsCount}</span>}
                    </button>
                  ))}
                </div>
              ) : (
                <button onClick={backToTeam}
                  style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 12px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.surface, color: C.textMid, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = C.accent; (e.currentTarget as HTMLElement).style.color = C.accent; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = C.border; (e.currentTarget as HTMLElement).style.color = C.textMid; }}>
                  ← Back to Team
                </button>
              )}
            </div>
          )}
        </div>

        {isMobile && (
          <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 12px 7px", borderTop: `1px solid ${C.border}` }}>
            {!selectedProject ? (
              <>
                {TEAM_VIEWS.map(({ id, label, icon }) => (
                  <button key={id} onClick={() => { setTeamView(id); setGoalDrilldown(null); }} style={{
                    position: "relative", flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 3,
                    padding: "6px 4px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: "inherit",
                    background: teamView === id ? C.accentLight : "transparent", color: teamView === id ? C.accent : C.textSub, transition: "all 0.12s",
                  }}>
                    <span style={{ fontSize: 11 }}>{icon}</span><span>{label}</span>
                    {id === "goals" && goalsCount > 0 && <span style={{ position: "absolute", top: 2, right: 2, width: 12, height: 12, borderRadius: "50%", background: C.teal, color: "#fff", fontSize: 7, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{goalsCount}</span>}
                  </button>
                ))}
                <button onClick={() => setShowGoalModal(true)} style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: "6px 10px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.surface, color: C.textMid, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>🎯</button>
              </>
            ) : (
              <button onClick={backToTeam} style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.surface, color: C.textMid, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>← Back to Team</button>
            )}
          </div>
        )}
      </div>

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {!isMobile && <Sidebar teams={teams} selectedTeamId={selectedTeamId} onSelectTeam={handleSelectTeam} onAddTeam={addTeam} collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(v => !v)} />}
        <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
          {selectedProject ? (
            <EstimateView project={selectedProject} onUpdateProject={fn => updateProject(selectedTeamId, selectedProject.id, fn)} onDeleteProject={() => deleteProject(selectedProject.id)} />
          ) : (
            <>
              {teamView === "projects" && <ProjectsView projects={selectedTeam?.projects || []} onSelectProject={selectProject} onUpdateProject={(projectId, fn) => updateProject(selectedTeamId, projectId, fn)} onDeleteProject={deleteProject} onAddProject={addProject} />}
              {teamView === "kanban" && <KanbanView projects={selectedTeam?.projects || []} onUpdateTaskInProject={onUpdateTaskInProject} taskOrder={selectedTeam?.taskOrder || {}} onReorderTask={onReorderTask} />}
              {teamView === "timeline" && <TimelineView projects={selectedTeam?.projects || []} taskOrder={selectedTeam?.taskOrder || {}} />}
              {teamView === "goals" && (
                goalDrilldownData ? (
                  <ProjectGoalDetail projectSnapshot={goalDrilldownData.pSnap} currentProject={goalDrilldownData.currentProject} onBack={() => setGoalDrilldown(null)} projects={selectedTeam?.projects || []} onUpdateTaskInProject={goalDrilldownData.snap.closedAt ? null : onUpdateTaskInProject} />
                ) : (
                  <GoalsView team={selectedTeam} onDeleteSnapshot={handleDeleteSnapshot} onSelectProjectGoal={handleSelectProjectGoal} onCloseSnapshot={handleCloseSnapshot} />
                )
              )}
              {teamView === "journal" && (
                <DailyJournalView team={selectedTeam} onUpdateTeam={fn => updateTeam(selectedTeamId, fn)} />
              )}
            </>
          )}
        </div>
      </div>

      {showGoalModal && selectedTeam && (
        <SetGoalModal team={selectedTeam}
          onConfirm={snap => { updateTeam(selectedTeamId, t => ({ ...t, snapshots: [...t.snapshots, snap] })); setShowGoalModal(false); setTeamView("goals"); }}
          onCancel={() => setShowGoalModal(false)} />
      )}
    </div>
  );
}
