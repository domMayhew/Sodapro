import { useState, useRef, useEffect } from 'react';
import { C } from '../constants/colors';
import type { Team } from '../types';

export function Sidebar({ teams, selectedTeamId, onSelectTeam, onAddTeam, collapsed, onToggle }: {
  teams: Team[];
  selectedTeamId: string;
  onSelectTeam: (id: string) => void;
  onAddTeam: () => void;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editingTeamId && inputRef.current) inputRef.current.select(); }, [editingTeamId]);
  const W = collapsed ? 48 : 200;

  return (
    <div style={{ width: W, flexShrink: 0, background: C.sidebar, borderRight: `1px solid ${C.sidebarBorder}`, display: "flex", flexDirection: "column", transition: "width 0.2s ease", overflow: "hidden", position: "relative", zIndex: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: collapsed ? "center" : "space-between", padding: collapsed ? "14px 0" : "14px 12px 12px", borderBottom: `1px solid ${C.sidebarBorder}` }}>
        {!collapsed && <span style={{ fontSize: 11, fontWeight: 700, color: C.sidebarSub, letterSpacing: "0.12em" }}>TEAMS</span>}
        <button onClick={onToggle} style={{ background: "none", border: "none", cursor: "pointer", color: C.sidebarSub, fontSize: 14, padding: 4, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 4 }}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = C.sidebarText}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = C.sidebarSub}>
          {collapsed ? "›" : "‹"}
        </button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: collapsed ? "8px 0" : "8px 6px" }}>
        {teams.map(team => {
          const isSelected = team.id === selectedTeamId;
          const isEditing = editingTeamId === team.id;
          const hue = [...team.name].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
          return (
            <div key={team.id} onClick={() => { if (!isEditing) onSelectTeam(team.id); }}
              onDoubleClick={() => { if (!collapsed) { setEditingTeamId(team.id); setDraft(team.name); } }}
              title={collapsed ? team.name : undefined}
              style={{ display: "flex", alignItems: "center", gap: collapsed ? 0 : 8, padding: collapsed ? "8px 0" : "7px 8px", justifyContent: collapsed ? "center" : "flex-start", borderRadius: 6, cursor: "pointer", marginBottom: 2, background: isSelected ? `hsl(${hue},35%,22%)` : "transparent", border: `1px solid ${isSelected ? `hsl(${hue},45%,30%)` : "transparent"}`, transition: "all 0.1s" }}
              onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)"; }}
              onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = isSelected ? `hsl(${hue},35%,22%)` : "transparent"; }}>
              <div style={{ width: collapsed ? 28 : 24, height: collapsed ? 28 : 24, borderRadius: collapsed ? 7 : 6, flexShrink: 0, background: `hsl(${hue},45%,35%)`, color: `hsl(${hue},45%,90%)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: collapsed ? 12 : 11, fontWeight: 700 }}>
                {team.name.charAt(0).toUpperCase()}
              </div>
              {!collapsed && (
                isEditing ? (
                  <input ref={inputRef} value={draft} onChange={e => setDraft(e.target.value)}
                    onBlur={() => { if (draft.trim()) onSelectTeam(team.id); setEditingTeamId(null); }}
                    onKeyDown={e => { if (e.key === "Enter") { setEditingTeamId(null); } if (e.key === "Escape") { setDraft(team.name); setEditingTeamId(null); } }}
                    onClick={e => e.stopPropagation()}
                    style={{ flex: 1, background: "transparent", border: "none", borderBottom: `1px solid ${C.sidebarSub}`, color: C.sidebarText, fontSize: 13, fontFamily: "inherit", outline: "none", padding: "0 0 2px" }} />
                ) : (
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: isSelected ? 600 : 400, color: isSelected ? C.sidebarText : C.sidebarSub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{team.name}</div>
                    <div style={{ fontSize: 10, color: C.sidebarSub }}>{team.projects.length} project{team.projects.length !== 1 ? "s" : ""}</div>
                  </div>
                )
              )}
              {!collapsed && isSelected && !isEditing && <span style={{ width: 6, height: 6, borderRadius: "50%", background: `hsl(${hue},70%,65%)`, flexShrink: 0 }} />}
            </div>
          );
        })}
      </div>
      <div style={{ padding: collapsed ? "8px 0" : "8px 6px 16px", borderTop: `1px solid ${C.sidebarBorder}` }}>
        <button onClick={onAddTeam}
          style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", justifyContent: collapsed ? "center" : "flex-start", padding: collapsed ? "8px 0" : "7px 8px", background: "none", border: "none", cursor: "pointer", color: C.sidebarSub, fontSize: 13, fontFamily: "inherit", borderRadius: 6 }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = C.sidebarText}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = C.sidebarSub}>
          <span style={{ fontSize: 16 }}>+</span>
          {!collapsed && " New Team"}
        </button>
      </div>
    </div>
  );
}
