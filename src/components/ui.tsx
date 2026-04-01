import { useState, useRef, ReactNode, CSSProperties } from 'react';
import { C } from '../constants/colors';
import { STATUSES, PRESET_TAGS, tagStyle, statusById } from '../constants/statuses';
import { collectLeafStatuses } from '../models/task';
import { useClickOutside, useFixedPosition } from '../hooks';
import type { Task, Points } from '../types';

/* ── FixedPopover ──────────────────────────────────────────────── */
export function FixedPopover({ anchorRef, open, onClose, width = 288, children }: {
  anchorRef: React.RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  width?: number;
  children: ReactNode;
}) {
  const pos = useFixedPosition(anchorRef, open, width);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, onClose);
  if (!open) return null;
  return (
    <div ref={ref} style={{
      position: "fixed", top: pos.top, left: pos.left, width,
      zIndex: 9999, background: C.surface, border: `1px solid ${C.border}`,
      borderRadius: 10, padding: "14px 16px",
      boxShadow: "0 4px 24px rgba(0,0,0,0.13), 0 1px 4px rgba(0,0,0,0.06)",
      maxHeight: "80vh", overflowY: "auto",
    }}>
      {children}
    </div>
  );
}

/* ── Avatar ────────────────────────────────────────────────────── */
export function getInitials(name: string, allNames: string[] = []) {
  if (!name) return "";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  const first = parts[0][0].toUpperCase();
  const last  = parts[parts.length - 1][0].toUpperCase();
  const collision = allNames.some(n => n !== name && n.trim().split(/\s+/)[0][0].toUpperCase() === first);
  return collision ? first + last : first;
}

export function Avatar({ name, allNames = [], size = 20, extraStyle = {} }: {
  name: string;
  allNames?: string[];
  size?: number;
  extraStyle?: CSSProperties;
}) {
  if (!name) return null;
  const initials = getInitials(name, allNames);
  const hue = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return (
    <span title={name} style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      background: `hsl(${hue},50%,87%)`, color: `hsl(${hue},50%,30%)`,
      fontSize: initials.length > 1 ? size * 0.38 : size * 0.44,
      fontWeight: 700, letterSpacing: "0.01em", ...extraStyle,
    }}>{initials}</span>
  );
}

/* ── AssigneeStack ─────────────────────────────────────────────── */
const MAX_SHOWN = 3;
export function AssigneeStack({ assignees, allNames }: { assignees: string[]; allNames: string[] }) {
  if (!assignees.length) return null;
  const shown = assignees.slice(0, MAX_SHOWN);
  const extra = assignees.length - MAX_SHOWN;
  return (
    <div style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
      {shown.map((a, i) => (
        <Avatar key={a} name={a} allNames={allNames} size={18}
          extraStyle={{ marginLeft: i === 0 ? 0 : -5, border: `1.5px solid ${C.surface}`, zIndex: shown.length - i }} />
      ))}
      {extra > 0 && (
        <span title={assignees.slice(MAX_SHOWN).join(", ")} style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: 18, height: 18, borderRadius: "50%", marginLeft: -5,
          background: C.stripe, border: `1.5px solid ${C.border}`,
          fontSize: 9, fontWeight: 700, color: C.textSub,
        }}>+{extra}</span>
      )}
    </div>
  );
}

/* ── TagChip ───────────────────────────────────────────────────── */
export function TagChip({ label, onRemove }: { label: string; onRemove?: () => void }) {
  const s = tagStyle(label);
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, fontWeight: 600,
      padding: "1px 6px", borderRadius: 4, border: `1px solid ${s.border}`,
      background: s.bg, color: s.color, whiteSpace: "nowrap", flexShrink: 0,
    }}>
      {label}
      {onRemove && <span onClick={e => { e.stopPropagation(); onRemove(); }} style={{ cursor: "pointer", opacity: 0.6, fontSize: 11 }}>×</span>}
    </span>
  );
}

/* ── Stepper ───────────────────────────────────────────────────── */
const sBtn: CSSProperties = {
  width: 22, height: 24, border: `1px solid ${C.border}`, background: C.stripe,
  color: C.textMid, cursor: "pointer", fontSize: 14,
  display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
};
export function Stepper({ value, onChange, color }: { value: number; onChange: (v: number) => void; color: string }) {
  return (
    <div style={{ display: "flex" }} onMouseDown={e => e.stopPropagation()}>
      <button onClick={() => onChange(Math.max(0, value - 1))} style={sBtn}>−</button>
      <input type="number" min={0} value={value}
        onChange={e => onChange(Math.max(0, parseInt(e.target.value) || 0))}
        style={{
          width: 36, textAlign: "center", border: `1px solid ${C.border}`,
          borderLeft: "none", borderRight: "none", outline: "none",
          fontSize: 12, fontFamily: "'IBM Plex Mono', monospace",
          fontWeight: 600, color, background: C.surface, padding: "2px 0",
        }} />
      <button onClick={() => onChange(value + 1)} style={sBtn}>+</button>
    </div>
  );
}

/* ── StatusDot ─────────────────────────────────────────────────── */
export function StatusDot({ status, size = 8, onClick }: { status: string; size?: number; onClick?: () => void }) {
  const s = statusById(status);
  return (
    <span onClick={onClick} title={s.label} style={{
      display: "inline-block", width: size, height: size, borderRadius: "50%",
      background: s.dot, flexShrink: 0, cursor: onClick ? "pointer" : "default",
      boxShadow: `0 0 0 2px ${s.bg}`, transition: "transform 0.1s",
    }} />
  );
}

/* ── StatusPie ─────────────────────────────────────────────────── */
export function StatusPie({ node, size = 12 }: { node: Task; size?: number }) {
  const { counts, total } = collectLeafStatuses(node);
  if (total === 0) return null;
  const r = size / 2; const cx = r; const cy = r;
  const tipLines = STATUSES.filter(s => counts[s.id] > 0).map(s => `${s.label}: ${counts[s.id]}`).join("\n");
  const nonZero = STATUSES.filter(s => counts[s.id] > 0);
  if (nonZero.length === 1) {
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
        <title>{tipLines}</title>
        <circle cx={cx} cy={cy} r={r - 0.5} fill={nonZero[0].dot} />
      </svg>
    );
  }
  const slices: ReactNode[] = [];
  let angle = -Math.PI / 2;
  STATUSES.forEach(s => {
    const count = counts[s.id];
    if (!count) return;
    const sweep = (count / total) * 2 * Math.PI;
    const x1 = cx + (r - 0.5) * Math.cos(angle); const y1 = cy + (r - 0.5) * Math.sin(angle);
    const x2 = cx + (r - 0.5) * Math.cos(angle + sweep); const y2 = cy + (r - 0.5) * Math.sin(angle + sweep);
    const large = sweep > Math.PI ? 1 : 0;
    slices.push(<path key={s.id} d={`M ${cx} ${cy} L ${x1} ${y1} A ${r - 0.5} ${r - 0.5} 0 ${large} 1 ${x2} ${y2} Z`} fill={s.dot} />);
    angle += sweep;
  });
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      <title>{tipLines}</title>{slices}
    </svg>
  );
}

/* ── StatusPicker ──────────────────────────────────────────────── */
export function StatusPicker({ status, onChange }: { status: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false));
  const cur = statusById(status);
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <div onClick={e => { e.stopPropagation(); setOpen(v => !v); }}
        style={{
          display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer",
          padding: "2px 7px 2px 5px", borderRadius: 5, background: cur.bg,
          border: `1px solid ${cur.border}`, fontSize: 10, fontWeight: 600, color: cur.color,
          userSelect: "none", whiteSpace: "nowrap",
        }}>
        <StatusDot status={status} size={6} />{cur.label}
        <span style={{ fontSize: 8, opacity: 0.6 }}>▾</span>
      </div>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 500,
          background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8,
          boxShadow: "0 6px 20px rgba(0,0,0,0.12)", overflow: "hidden", minWidth: 130,
        }}>
          {STATUSES.map(s => (
            <div key={s.id} onMouseDown={e => { e.stopPropagation(); onChange(s.id); setOpen(false); }}
              style={{
                display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", cursor: "pointer", fontSize: 12,
                background: s.id === status ? s.bg : "transparent", color: s.id === status ? s.color : C.textMid,
                fontWeight: s.id === status ? 600 : 400,
              }}
              onMouseEnter={e => { if (s.id !== status) (e.currentTarget as HTMLElement).style.background = C.stripe; }}
              onMouseLeave={e => { if (s.id !== status) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
            >
              <StatusDot status={s.id} size={7} />{s.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── AssigneeInput ─────────────────────────────────────────────── */
export function AssigneeInput({ value, onChange, allAssignees, allNames }: {
  value: string;
  onChange: (v: string) => void;
  allAssignees: string[];
  allNames: string[];
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false));
  const filtered = allAssignees.filter(a => a !== draft && a.toLowerCase().includes(draft.toLowerCase()));
  const commit = (val: string) => { onChange(val.trim()); setDraft(val.trim()); setOpen(false); };
  return (
    <div ref={ref} style={{ position: "relative", flex: 1 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <Avatar name={draft} allNames={allNames} size={18} />
        <input value={draft} placeholder="Unassigned"
          onChange={e => { setDraft(e.target.value); setOpen(true); onChange(e.target.value.trim()); }}
          onFocus={() => setOpen(true)}
          onKeyDown={e => { if (e.key === "Enter") commit(draft); if (e.key === "Escape") setOpen(false); }}
          style={{ flex: 1, border: "none", outline: "none", fontSize: 12, color: C.text, background: "transparent", fontFamily: "inherit" }}
        />
        {draft && <span onClick={() => { setDraft(""); onChange(""); }} style={{ cursor: "pointer", color: C.textSub, fontSize: 14 }}>×</span>}
      </div>
      {open && filtered.length > 0 && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 400,
          background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6,
          boxShadow: "0 4px 12px rgba(0,0,0,0.08)", overflow: "hidden",
        }}>
          {filtered.map(a => (
            <div key={a} onMouseDown={() => commit(a)} style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "7px 10px", cursor: "pointer", fontSize: 12, color: C.text,
            }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = C.stripe}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}
            ><Avatar name={a} allNames={allNames} size={18} />{a}</div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── TagPicker ─────────────────────────────────────────────────── */
export function TagPicker({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const addTag = (label: string) => { const t = label.trim(); if (t && !tags.includes(t)) onChange([...tags, t]); setDraft(""); };
  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
        {PRESET_TAGS.map(({ label }) => {
          const active = tags.includes(label);
          const s = tagStyle(label);
          return (
            <span key={label} onClick={() => active ? onChange(tags.filter(t => t !== label)) : addTag(label)} style={{
              fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 4, cursor: "pointer",
              border: `1px solid ${active ? s.border : C.border}`,
              background: active ? s.bg : C.stripe, color: active ? s.color : C.textSub,
              transition: "all 0.12s",
            }}>{label}</span>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 4 }}>
        <input value={draft} placeholder="Custom tag…" onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") addTag(draft); if (e.key === "Escape") setDraft(""); }}
          style={{
            flex: 1, fontSize: 11, border: `1px solid ${C.border}`, borderRadius: 5,
            padding: "3px 7px", outline: "none", color: C.text, fontFamily: "inherit", background: C.surface,
          }} />
        <button onClick={() => addTag(draft)} style={{
          fontSize: 11, padding: "3px 8px", border: `1px solid ${C.border}`, borderRadius: 5,
          background: C.stripe, color: C.textMid, cursor: "pointer", fontFamily: "inherit",
        }}>Add</button>
      </div>
    </div>
  );
}

/* ── ProgressBar ───────────────────────────────────────────────── */
export function ProgressBar({ counts, total, height = 10 }: {
  counts: Record<string, number>;
  total: number;
  height?: number;
}) {
  if (total === 0) return null;
  return (
    <div style={{ display: "flex", borderRadius: height / 2, overflow: "hidden", height, width: "100%", background: C.stripe, border: `1px solid ${C.border}` }}>
      {STATUSES.map(s => {
        const pct = (counts[s.id] || 0) / total * 100;
        if (pct === 0) return null;
        return <div key={s.id} title={`${s.label}: ${counts[s.id]}`} style={{ width: `${pct}%`, background: s.dot, minWidth: 4 }} />;
      })}
    </div>
  );
}

/* ── StatusBadge ───────────────────────────────────────────────── */
export function StatusBadge({ status }: { status: string }) {
  const s = statusById(status);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 600, padding: "2px 7px 2px 5px", borderRadius: 5, background: s.bg, border: `1px solid ${s.border}`, color: s.color, whiteSpace: "nowrap", flexShrink: 0 }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.dot, flexShrink: 0 }} />{s.label}
    </span>
  );
}

/* ── DeltaPill ─────────────────────────────────────────────────── */
export function DeltaPill({ delta, unit = "sp", invert = false }: { delta: number; unit?: string; invert?: boolean }) {
  if (delta === 0) return <span style={{ fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", color: C.textSub }}>±0{unit}</span>;
  const good = invert ? delta < 0 : delta > 0;
  const color = good ? C.green : C.red; const bg = good ? C.greenLight : C.redLight;
  return <span style={{ fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, padding: "1px 6px", borderRadius: 4, background: bg, color }}>{delta > 0 ? "+" : ""}{delta}{unit}</span>;
}

/* ── SpPill ────────────────────────────────────────────────────── */
export function SpPill({ est, actual }: { est: number; actual: number | null }) {
  if (actual == null || actual === est) return <span style={{ display: "inline-flex", alignItems: "center", fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, color: C.textSub, flexShrink: 0 }}>{est}sp</span>;
  const delta = actual - est; const color = delta <= 0 ? C.green : C.red; const bg = delta <= 0 ? C.greenLight : C.redLight;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, flexShrink: 0 }}>
      <span style={{ color: C.textSub, textDecoration: "line-through", opacity: 0.6 }}>{est}</span>
      <span style={{ color: C.textSub, fontSize: 8 }}>→</span>
      <span style={{ color, fontWeight: 700, padding: "1px 4px", borderRadius: 3, background: bg, border: `1px solid ${color}25` }}>{actual}sp</span>
    </span>
  );
}

/* ── Section ───────────────────────────────────────────────────── */
export function Section({ title, count, color, icon, children }: {
  title: string;
  count: number;
  color: string;
  icon: string;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div style={{ marginBottom: 14, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
      <div onClick={() => setCollapsed(v => !v)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 14px", borderBottom: collapsed ? "none" : `1px solid ${C.border}`, background: C.stripe, cursor: "pointer", userSelect: "none" }}>
        <span style={{ width: 20, height: 20, borderRadius: 5, background: color + "20", color, fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{icon}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: C.text, flex: 1 }}>{title}</span>
        <span style={{ fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, color, padding: "1px 7px", borderRadius: 4, background: color + "15" }}>{count}</span>
        <span style={{ fontSize: 9, color: C.textSub, marginLeft: 4 }}>{collapsed ? "▶" : "▼"}</span>
      </div>
      {!collapsed && <div>{children}</div>}
    </div>
  );
}

/* ── ReviewRow ─────────────────────────────────────────────────── */
export function ReviewRow({ children, onClick, style: extraStyle }: {
  children: ReactNode;
  onClick?: () => void;
  style?: CSSProperties;
}) {
  return (
    <div onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderBottom: `1px solid ${C.border}`, ...extraStyle }}
      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = C.stripe}
      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}>
      {children}
    </div>
  );
}

/* ── EmptyRow ──────────────────────────────────────────────────── */
export function EmptyRow({ children }: { children: ReactNode }) {
  return <div style={{ padding: "12px 14px", fontSize: 12, color: C.textSub, fontStyle: "italic" }}>{children}</div>;
}

/* ── Summary ───────────────────────────────────────────────────── */
export function Summary({ pts }: { pts: Points }) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {[
        { label: "Impl",   val: pts.impl,   color: C.accent, bg: C.accentLight },
        { label: "Test",   val: pts.test,   color: C.green,  bg: C.greenLight  },
        { label: "Review", val: pts.review, color: C.amber,  bg: C.amberLight  },
        { label: "Total",  val: pts.total,  color: C.purple, bg: C.purpleLight },
      ].map(({ label, val, color, bg }) => (
        <div key={label} style={{ background: bg, border: `1px solid ${color}28`, borderRadius: 7, padding: "5px 12px", textAlign: "center", minWidth: 54 }}>
          <div style={{ fontSize: 10, color, letterSpacing: "0.07em", fontWeight: 600 }}>{label.toUpperCase()}</div>
          <div style={{ fontSize: 17, fontWeight: 700, color, fontFamily: "'IBM Plex Mono', monospace", lineHeight: 1.4 }}>{val}</div>
        </div>
      ))}
    </div>
  );
}
