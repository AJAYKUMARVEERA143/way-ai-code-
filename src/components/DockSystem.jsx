/**
 * Way AI Code — DockSystem.jsx
 * Universal floating-panel / docking engine.
 * Provides: useDockPanel hook + FloatingPanel component + DockPlaceholder
 */
import { useState, useRef, useEffect, useCallback } from "react";

// ── Persistence ───────────────────────────────────────────────────────────────
const DOCK_STORE = "wayai_dock_layout_v2";

export function loadDockLayout() {
  try { return JSON.parse(localStorage.getItem(DOCK_STORE) || "{}"); } catch { return {}; }
}
export function saveDockLayout(state) {
  try { localStorage.setItem(DOCK_STORE, JSON.stringify(state)); } catch {}
}
export function resetDockLayout() {
  try { localStorage.removeItem(DOCK_STORE); } catch {}
}

// ── useDockPanel ──────────────────────────────────────────────────────────────
export function useDockPanel(id, defaults = {}) {
  const stored = loadDockLayout()[id] || {};
  const [detached, setDetachedRaw] = useState(stored.detached ?? false);
  const [pos,      setPos]         = useState({ x: stored.x ?? defaults.x ?? Math.max(0, window.innerWidth - 440), y: stored.y ?? defaults.y ?? 60 });
  const [size,     setSize]        = useState({ w: stored.w ?? defaults.w ?? 420, h: stored.h ?? defaults.h ?? 540 });

  // persist on every change
  useEffect(() => {
    const all = loadDockLayout();
    all[id] = { detached, x: pos.x, y: pos.y, w: size.w, h: size.h };
    saveDockLayout(all);
  }, [id, detached, pos.x, pos.y, size.w, size.h]);

  const setDetached = useCallback((val) => setDetachedRaw(val), []);
  const dock   = useCallback(() => setDetachedRaw(false), []);
  const undock = useCallback(() => setDetachedRaw(true),  []);

  return { detached, setDetached, pos, setPos, size, setSize, dock, undock };
}

// ── Inline SVG helpers ────────────────────────────────────────────────────────
const PopoutSvg = () => (
  <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
    <path d="M15 3h6v6"/><path d="M10 14L21 3"/>
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
  </svg>
);
const AttachSvg = () => (
  <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
    <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/>
  </svg>
);

// ── FloatingPanel ─────────────────────────────────────────────────────────────
export function FloatingPanel({
  id, title, icon, detached,
  pos, setPos, size, setSize,
  onDock, onClose,
  minW = 280, minH = 260,
  zIndex = 8000,
  children,
}) {
  const dragRef   = useRef({ active: false, ox: 0, oy: 0 });
  const resizeRef = useRef({ active: false, edge: "", ox: 0, oy: 0, sw: 0, sh: 0, sx: 0, sy: 0 });

  // ── drag header ────────────────────────────────────────────────────────────
  const onDragStart = useCallback((e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    dragRef.current = { active: true, ox: e.clientX - pos.x, oy: e.clientY - pos.y };

    const onMove = (ev) => {
      if (!dragRef.current.active) return;
      const x = Math.max(0, Math.min(window.innerWidth  - size.w, ev.clientX - dragRef.current.ox));
      const y = Math.max(0, Math.min(window.innerHeight - 40,     ev.clientY - dragRef.current.oy));
      setPos({ x, y });
    };
    const onUp = () => {
      dragRef.current.active = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup",   onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup",   onUp);
  }, [pos.x, pos.y, size.w, setPos]);

  // ── resize edges ───────────────────────────────────────────────────────────
  const onResizeStart = useCallback((e, edge) => {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    resizeRef.current = { active: true, edge, ox: e.clientX, oy: e.clientY, sw: size.w, sh: size.h, sx: pos.x, sy: pos.y };

    const onMove = (ev) => {
      const r = resizeRef.current;
      if (!r.active) return;
      const dx = ev.clientX - r.ox, dy = ev.clientY - r.oy;
      let nw = r.sw, nh = r.sh, nx = r.sx, ny = r.sy;
      if (r.edge.includes("e")) nw = Math.max(minW, r.sw + dx);
      if (r.edge.includes("w")) { nw = Math.max(minW, r.sw - dx); nx = r.sx + r.sw - nw; }
      if (r.edge.includes("s")) nh = Math.max(minH, r.sh + dy);
      if (r.edge.includes("n")) { nh = Math.max(minH, r.sh - dy); ny = r.sy + r.sh - nh; }
      setSize({ w: nw, h: nh });
      if (r.edge.includes("w") || r.edge.includes("n")) setPos({ x: nx, y: ny });
    };
    const onUp = () => {
      resizeRef.current.active = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup",   onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup",   onUp);
  }, [pos.x, pos.y, size.w, size.h, setSize, setPos, minW, minH]);

  if (!detached) return null;

  return (
    <div
      className="fp-window"
      style={{ left: pos.x, top: pos.y, width: size.w, height: size.h, zIndex }}
      onMouseDown={() => {}} // bring-to-front hook (future)
    >
      {/* Resize handles – all 8 edges */}
      <div className="fp-rz fp-rz-n"  onMouseDown={e => onResizeStart(e, "n")}/>
      <div className="fp-rz fp-rz-s"  onMouseDown={e => onResizeStart(e, "s")}/>
      <div className="fp-rz fp-rz-e"  onMouseDown={e => onResizeStart(e, "e")}/>
      <div className="fp-rz fp-rz-w"  onMouseDown={e => onResizeStart(e, "w")}/>
      <div className="fp-rz fp-rz-ne" onMouseDown={e => onResizeStart(e, "ne")}/>
      <div className="fp-rz fp-rz-nw" onMouseDown={e => onResizeStart(e, "nw")}/>
      <div className="fp-rz fp-rz-se" onMouseDown={e => onResizeStart(e, "se")}/>
      <div className="fp-rz fp-rz-sw" onMouseDown={e => onResizeStart(e, "sw")}/>

      {/* Header (drag zone) */}
      <div className="fp-header" onMouseDown={onDragStart}>
        {icon && <span className="fp-icon">{icon}</span>}
        <span className="fp-title">{title}</span>
        <div className="fp-hd-actions">
          {onDock  && <button className="fp-btn"       title="Dock back"  onClick={onDock}><AttachSvg/></button>}
          {onClose && <button className="fp-btn fp-x"  title="Close"      onClick={onClose}>×</button>}
        </div>
      </div>

      {/* Content */}
      <div className="fp-body">{children}</div>
    </div>
  );
}

// ── DockPlaceholder – shown in sidebar when panel is floating ─────────────────
export function DockPlaceholder({ title, onDock }) {
  return (
    <div className="dp-placeholder">
      <span className="dp-ph-title">{title} is in floating window</span>
      <button className="dp-ph-btn" onClick={onDock}><AttachSvg/> Dock back</button>
    </div>
  );
}

// ── PanelHeader – sidebar section title row with detach button ────────────────
export function PanelHeader({ title, onDetach, extra }) {
  return (
    <div className="dp-panel-header">
      <span className="dp-panel-title">{title}</span>
      <div className="dp-panel-actions">
        {extra}
        {onDetach && (
          <button className="dp-panel-btn" title="Detach to floating window" onClick={onDetach}>
            <PopoutSvg/>
          </button>
        )}
      </div>
    </div>
  );
}
