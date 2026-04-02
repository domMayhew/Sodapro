import { useState, useMemo, useCallback, useEffect } from 'react';
import { C } from '../constants/colors';
import { collectAllLeafTasks } from '../models/task';
import {
  todayStr, fmtTracked, getWeekStart, weekDays, toLocalDate,
  deriveActivityForDate, deriveWhatNext, formatDailySummary,
  ptIsRunning, ptMinutesForDate, ptStartTimer, ptStopTimer,
} from '../models/journal';
import type { Team, JournalEntry, PersonalTimer } from '../types';
import { Avatar } from './ui';

interface Props {
  team: Team;
  onUpdateTeam: (fn: (t: Team) => Team) => void;
}

export function DailyJournalView({ team, onUpdateTeam }: Props) {
  const today = todayStr();

  const assignees = useMemo(() => {
    const set = new Set<string>();
    for (const p of team.projects) {
      for (const t of collectAllLeafTasks(p.root)) {
        if (t.assignee) set.add(t.assignee);
      }
    }
    return Array.from(set).sort();
  }, [team.projects]);

  const [selectedAssignee, setSelectedAssignee] = useState<string>(
    team.activeJournalAssignee || assignees[0] || ''
  );
  const [selectedDate, setSelectedDate] = useState<string>(today);
  const [weekStart, setWeekStart] = useState(() => getWeekStart(today));
  const [addingType, setAddingType] = useState<'note' | 'todo' | 'time' | null>(null);
  const [newText, setNewText] = useState('');
  const [newMins, setNewMins] = useState('');
  const [newPrivate, setNewPrivate] = useState(false);
  const [copied, setCopied] = useState(false);
  const [newTimerLabel, setNewTimerLabel] = useState('');
  const [addingTimer, setAddingTimer] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 700);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 700);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  const days = useMemo(() => weekDays(weekStart), [weekStart]);

  const journalEntries = useMemo(() =>
    (team.journalEntries || []).filter(e => e.assignee === selectedAssignee && e.date === selectedDate),
    [team.journalEntries, selectedAssignee, selectedDate]
  );

  const activity = useMemo(() =>
    deriveActivityForDate(team.projects, selectedAssignee, selectedDate),
    [team.projects, selectedAssignee, selectedDate]
  );

  const { inProgress, upNext } = useMemo(() =>
    deriveWhatNext(team.projects, selectedAssignee),
    [team.projects, selectedAssignee]
  );

  const timers = useMemo(() =>
    (team.personalTimers || {})[selectedAssignee] || [],
    [team.personalTimers, selectedAssignee]
  );

  const handleSelectAssignee = (name: string) => {
    setSelectedAssignee(name);
    onUpdateTeam(t => ({ ...t, activeJournalAssignee: name }));
  };

  const navigateWeek = (direction: -1 | 1) => {
    const d = new Date(selectedDate + 'T00:00:00');
    d.setDate(d.getDate() + direction * 7);
    const newDate = toLocalDate(d.toISOString());
    setSelectedDate(newDate);
    setWeekStart(getWeekStart(newDate));
  };

  const addEntry = () => {
    if (!newText.trim()) return;
    const mins = addingType === 'time' && newMins ? parseInt(newMins) : undefined;
    const entry: JournalEntry = {
      id: crypto.randomUUID(),
      assignee: selectedAssignee,
      date: selectedDate,
      type: addingType!,
      text: newText.trim(),
      private: newPrivate,
      durationMinutes: mins && !isNaN(mins) ? mins : undefined,
      createdAt: new Date().toISOString(),
    };
    onUpdateTeam(t => ({ ...t, journalEntries: [...(t.journalEntries || []), entry] }));
    setNewText('');
    setNewMins('');
    setNewPrivate(false);
    setAddingType(null);
  };

  const deleteEntry = (id: string) => {
    onUpdateTeam(t => ({ ...t, journalEntries: (t.journalEntries || []).filter(e => e.id !== id) }));
  };

  const toggleTodo = (id: string) => {
    onUpdateTeam(t => ({
      ...t,
      journalEntries: (t.journalEntries || []).map(e =>
        e.id === id ? { ...e, resolvedAt: e.resolvedAt ? undefined : new Date().toISOString() } : e
      ),
    }));
  };

  const updateTimers = useCallback((newTimers: PersonalTimer[]) => {
    onUpdateTeam(t => ({
      ...t,
      personalTimers: { ...(t.personalTimers || {}), [selectedAssignee]: newTimers },
    }));
  }, [onUpdateTeam, selectedAssignee]);

  const addTimer = () => {
    if (!newTimerLabel.trim()) return;
    const timer: PersonalTimer = {
      id: crypto.randomUUID(),
      label: newTimerLabel.trim(),
      entries: [],
    };
    updateTimers([...timers, timer]);
    setNewTimerLabel('');
    setAddingTimer(false);
  };

  const deleteTimer = (id: string) => {
    updateTimers(timers.filter(t => t.id !== id));
  };

  const copySummary = async () => {
    const text = formatDailySummary(selectedDate, activity, journalEntries, inProgress, upNext);
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const fmtDay = (d: string) => {
    const dt = new Date(d + 'T00:00:00');
    return { dow: dt.toLocaleDateString('en-US', { weekday: 'short' }), day: dt.getDate() };
  };

  return (
    <div style={{ padding: isMobile ? "12px 12px 40px" : "20px 20px 40px", maxWidth: 900, margin: "0 auto" }}>
      {/* Assignee selector */}
      {assignees.length === 0 ? (
        <div style={{ padding: "40px 20px", textAlign: "center", color: C.textSub, fontSize: 13 }}>
          No team members found. Assign tasks to people to get started.
        </div>
      ) : (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
          {assignees.map(name => {
            const hue = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
            const isSelected = name === selectedAssignee;
            return (
              <button key={name} onClick={() => handleSelectAssignee(name)} style={{
                display: "flex", alignItems: "center", gap: 7, padding: "6px 13px 6px 8px",
                borderRadius: 20, border: `1.5px solid ${isSelected ? `hsl(${hue},55%,55%)` : C.border}`,
                background: isSelected ? `hsl(${hue},60%,95%)` : C.surface,
                color: isSelected ? `hsl(${hue},50%,30%)` : C.textMid,
                fontSize: 13, fontWeight: isSelected ? 700 : 500, cursor: "pointer",
                fontFamily: "inherit", transition: "all 0.15s",
              }}>
                <Avatar name={name} allNames={assignees} size={22} />
                {name}
              </button>
            );
          })}
        </div>
      )}

      {selectedAssignee && (
        <>
          {/* Week navigation */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 24 }}>
            <button onClick={() => navigateWeek(-1)} style={{ padding: "5px 10px", border: `1px solid ${C.border}`, borderRadius: 6, background: C.surface, color: C.textMid, fontSize: 14, cursor: "pointer", fontFamily: "inherit", lineHeight: 1 }}>‹</button>
            <div style={{ display: "flex", gap: 4, flex: 1 }}>
              {days.map(d => {
                const { dow, day } = fmtDay(d);
                const isToday = d === today;
                const isSelected = d === selectedDate;
                return (
                  <button key={d} onClick={() => setSelectedDate(d)} style={{
                    flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                    padding: "8px 4px", borderRadius: 8, cursor: "pointer", fontFamily: "inherit",
                    border: `1.5px solid ${isSelected ? C.accent : isToday ? C.accent + "40" : C.border}`,
                    background: isSelected ? C.accentLight : C.surface,
                    color: isSelected ? C.accent : isToday ? C.accent : C.textMid,
                    transition: "all 0.12s",
                  }}>
                    <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.06em" }}>{dow.toUpperCase()}</span>
                    <span style={{ fontSize: 15, fontWeight: isSelected ? 700 : 500, fontFamily: "'IBM Plex Mono', monospace" }}>{day}</span>
                  </button>
                );
              })}
            </div>
            <button onClick={() => navigateWeek(1)} style={{ padding: "5px 10px", border: `1px solid ${C.border}`, borderRadius: 6, background: C.surface, color: C.textMid, fontSize: 14, cursor: "pointer", fontFamily: "inherit", lineHeight: 1 }}>›</button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 20, alignItems: "start" }}>
            {/* Left column: Activity + What's Next */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.textSub, letterSpacing: "0.08em", marginBottom: 10 }}>ACTIVITY</div>
              {activity.length === 0 ? (
                <div style={{ padding: "16px 14px", background: C.stripe, borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 12, color: C.textSub }}>
                  No activity recorded for this day.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {activity.map((item, i) => {
                    let icon = '•', label = '', color = C.textMid;
                    if (item.kind === 'status') {
                      icon = item.to === 'done' ? '✓' : '→';
                      color = item.to === 'done' ? C.green : C.accent;
                      label = `${item.taskName} → ${item.to}`;
                    } else if (item.kind === 'points') {
                      icon = '~'; color = C.amber;
                      label = `${item.taskName}: ${item.from}sp → ${item.to}sp`;
                    } else if (item.kind === 'time') {
                      icon = '⏱'; color = C.teal;
                      label = `${fmtTracked(item.mins)} on ${item.taskName} (${item.phase})`;
                    } else if (item.kind === 'created') {
                      icon = '+'; color = C.purple;
                      label = `${item.taskName} created`;
                    }
                    return (
                      <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "9px 12px", background: C.surface, borderRadius: 7, border: `1px solid ${C.border}` }}>
                        <span style={{ fontSize: 13, color, flexShrink: 0, width: 16, textAlign: "center", lineHeight: 1.4 }}>{icon}</span>
                        <span style={{ fontSize: 12, color: C.text, flex: 1 }}>{label}</span>
                        <span style={{ fontSize: 10, color: C.textSub, whiteSpace: "nowrap", flexShrink: 0 }}>
                          {new Date(item.at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              {(inProgress.length > 0 || upNext.length > 0) && (
                <div style={{ marginTop: 20 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.textSub, letterSpacing: "0.08em", marginBottom: 10 }}>WHAT'S NEXT</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    {inProgress.map(t => (
                      <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", background: C.amberLight, borderRadius: 7, border: `1px solid ${C.amber}30` }}>
                        <span style={{ fontSize: 9, color: C.amber, fontWeight: 700, letterSpacing: "0.06em", flexShrink: 0 }}>IN PROGRESS</span>
                        <span style={{ fontSize: 12, color: C.text }}>{t.name}</span>
                      </div>
                    ))}
                    {upNext.slice(0, 4).map(t => (
                      <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", background: C.stripe, borderRadius: 7, border: `1px solid ${C.border}` }}>
                        <span style={{ fontSize: 9, color: C.textSub, fontWeight: 700, letterSpacing: "0.06em", flexShrink: 0 }}>UP NEXT</span>
                        <span style={{ fontSize: 12, color: C.text }}>{t.name}</span>
                      </div>
                    ))}
                    {upNext.length > 4 && (
                      <div style={{ fontSize: 11, color: C.textSub, padding: "4px 12px" }}>
                        +{upNext.length - 4} more
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Right column: Journal entries + Timers */}
            <div>
              {/* Journal entries header */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.textSub, letterSpacing: "0.08em" }}>JOURNAL</div>
                <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
                  {(['note', 'todo', 'time'] as const).map(type => (
                    <button key={type} onClick={() => setAddingType(addingType === type ? null : type)} style={{
                      padding: "3px 10px", borderRadius: 5,
                      border: `1px solid ${addingType === type ? C.accent : C.border}`,
                      background: addingType === type ? C.accentLight : C.surface,
                      color: addingType === type ? C.accent : C.textSub,
                      fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                    }}>
                      {type === 'note' ? '📝' : type === 'todo' ? '☐' : '⏱'} {type}
                    </button>
                  ))}
                </div>
              </div>

              {/* Add entry form */}
              {addingType && (
                <div style={{ padding: "12px", background: C.accentLight, borderRadius: 8, border: `1px solid ${C.accent}40`, marginBottom: 10 }}>
                  <textarea
                    autoFocus
                    value={newText}
                    onChange={e => setNewText(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addEntry(); }
                      if (e.key === 'Escape') { setAddingType(null); setNewText(''); }
                    }}
                    placeholder={addingType === 'note' ? "Write a note…" : addingType === 'todo' ? "Add a to-do…" : "What did you work on?"}
                    style={{ width: "100%", minHeight: 64, padding: "8px 10px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13, fontFamily: "inherit", background: C.surface, color: C.text, resize: "vertical", outline: "none", boxSizing: "border-box" }}
                  />
                  {addingType === 'time' && (
                    <input
                      value={newMins}
                      onChange={e => setNewMins(e.target.value)}
                      placeholder="Duration (minutes)"
                      type="number"
                      min={1}
                      style={{ width: "100%", marginTop: 6, padding: "6px 10px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13, fontFamily: "inherit", background: C.surface, color: C.text, outline: "none", boxSizing: "border-box" }}
                    />
                  )}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: C.textMid, cursor: "pointer" }}>
                      <input type="checkbox" checked={newPrivate} onChange={e => setNewPrivate(e.target.checked)} style={{ cursor: "pointer" }} />
                      Private
                    </label>
                    <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                      <button onClick={() => { setAddingType(null); setNewText(''); setNewMins(''); }} style={{ padding: "5px 12px", border: `1px solid ${C.border}`, borderRadius: 6, background: C.surface, color: C.textMid, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
                      <button onClick={addEntry} disabled={!newText.trim()} style={{ padding: "5px 12px", border: "none", borderRadius: 6, background: newText.trim() ? C.accent : C.border, color: "#fff", fontSize: 12, fontWeight: 600, cursor: newText.trim() ? "pointer" : "default", fontFamily: "inherit" }}>Add</button>
                    </div>
                  </div>
                </div>
              )}

              {journalEntries.length === 0 && !addingType && (
                <div style={{ padding: "14px 12px", background: C.stripe, borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 12, color: C.textSub, marginBottom: 16 }}>
                  No entries for this day yet.
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
                {journalEntries.map(e => (
                  <div key={e.id} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "9px 12px", background: C.surface, borderRadius: 7, border: `1px solid ${C.border}` }}>
                    {e.type === 'todo' ? (
                      <button onClick={() => toggleTodo(e.id)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 15, color: e.resolvedAt ? C.green : C.textSub, flexShrink: 0, lineHeight: 1.3 }}>
                        {e.resolvedAt ? '☑' : '☐'}
                      </button>
                    ) : e.type === 'note' ? (
                      <span style={{ fontSize: 13, color: C.textSub, flexShrink: 0, lineHeight: 1.3 }}>📝</span>
                    ) : (
                      <span style={{ fontSize: 13, color: C.teal, flexShrink: 0, lineHeight: 1.3 }}>⏱</span>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 12, color: e.type === 'todo' && e.resolvedAt ? C.textSub : C.text, textDecoration: e.type === 'todo' && e.resolvedAt ? 'line-through' : 'none' }}>
                        {e.text}
                      </span>
                      {e.type === 'time' && e.durationMinutes && (
                        <span style={{ marginLeft: 6, fontSize: 11, color: C.teal, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600 }}>
                          {fmtTracked(e.durationMinutes)}
                        </span>
                      )}
                      {e.private && <span style={{ marginLeft: 6, fontSize: 10, color: C.textSub, fontStyle: "italic" }}>private</span>}
                    </div>
                    <button
                      onClick={() => deleteEntry(e.id)}
                      style={{ background: "none", border: "none", padding: "0 2px", cursor: "pointer", color: C.textSub, fontSize: 14, flexShrink: 0, lineHeight: 1, opacity: 0.4 }}
                      onMouseEnter={ev => (ev.currentTarget as HTMLElement).style.opacity = '1'}
                      onMouseLeave={ev => (ev.currentTarget as HTMLElement).style.opacity = '0.4'}>
                      ×
                    </button>
                  </div>
                ))}
              </div>

              {/* Personal Timers */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.textSub, letterSpacing: "0.08em" }}>TIMERS</div>
                <button onClick={() => setAddingTimer(!addingTimer)} style={{ padding: "3px 10px", borderRadius: 5, border: `1px solid ${C.border}`, background: C.surface, color: C.textSub, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                  + Add
                </button>
              </div>

              {addingTimer && (
                <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                  <input
                    autoFocus
                    value={newTimerLabel}
                    onChange={e => setNewTimerLabel(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') addTimer();
                      if (e.key === 'Escape') { setAddingTimer(false); setNewTimerLabel(''); }
                    }}
                    placeholder="Timer label…"
                    style={{ flex: 1, padding: "6px 10px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13, fontFamily: "inherit", background: C.surface, color: C.text, outline: "none" }}
                  />
                  <button onClick={addTimer} disabled={!newTimerLabel.trim()} style={{ padding: "6px 12px", border: "none", borderRadius: 6, background: newTimerLabel.trim() ? C.accent : C.border, color: "#fff", fontSize: 12, fontWeight: 600, cursor: newTimerLabel.trim() ? "pointer" : "default", fontFamily: "inherit" }}>
                    Add
                  </button>
                </div>
              )}

              {timers.length === 0 && !addingTimer ? (
                <div style={{ padding: "14px 12px", background: C.stripe, borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 12, color: C.textSub }}>
                  No timers yet.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {timers.map(timer => {
                    const running = ptIsRunning(timer);
                    const minsToday = ptMinutesForDate(timer, selectedDate);
                    return (
                      <div key={timer.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: running ? C.tealLight : C.surface, borderRadius: 7, border: `1px solid ${running ? C.teal : C.border}`, transition: "all 0.15s" }}>
                        <button
                          onClick={() => updateTimers(running ? ptStopTimer(timers, timer.id) : ptStartTimer(timers, timer.id))}
                          style={{ width: 28, height: 28, borderRadius: "50%", border: "none", background: running ? C.teal : C.bg, color: running ? "#fff" : C.textMid, fontSize: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          {running ? '■' : '▶'}
                        </button>
                        <span style={{ flex: 1, fontSize: 12, color: C.text, fontWeight: running ? 600 : 400 }}>{timer.label}</span>
                        {minsToday > 0 && (
                          <span style={{ fontSize: 11, color: C.teal, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600 }}>
                            {fmtTracked(minsToday)}
                          </span>
                        )}
                        <button
                          onClick={() => deleteTimer(timer.id)}
                          style={{ background: "none", border: "none", padding: "0 2px", cursor: "pointer", color: C.textSub, fontSize: 14, flexShrink: 0, lineHeight: 1, opacity: 0.4 }}
                          onMouseEnter={ev => (ev.currentTarget as HTMLElement).style.opacity = '1'}
                          onMouseLeave={ev => (ev.currentTarget as HTMLElement).style.opacity = '0.4'}>
                          ×
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Copy summary */}
          <div style={{ marginTop: 24, display: "flex", justifyContent: "flex-end" }}>
            <button onClick={copySummary} style={{
              display: "flex", alignItems: "center", gap: 6, padding: "7px 16px",
              border: `1px solid ${copied ? C.green : C.border}`, borderRadius: 7,
              background: copied ? C.greenLight : C.surface,
              color: copied ? C.green : C.textMid,
              fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", transition: "all 0.2s",
            }}>
              {copied ? '✓ Copied!' : '📋 Copy daily summary'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
