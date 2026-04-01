import { useState, useCallback, useRef, useEffect } from 'react';

export function useClickOutside(ref: React.RefObject<HTMLElement | null>, cb: () => void) {
  useEffect(() => {
    const h = (e: Event) => { if (ref.current && !ref.current.contains(e.target as Node)) cb(); };
    document.addEventListener("mousedown", h);
    document.addEventListener("touchstart", h);
    return () => { document.removeEventListener("mousedown", h); document.removeEventListener("touchstart", h); };
  }, [ref, cb]);
}

export function useWindowWidth() {
  const [w, setW] = useState(() => typeof window !== "undefined" ? window.innerWidth : 1024);
  useEffect(() => {
    const h = () => setW(window.innerWidth);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  return w;
}

export function useFixedPosition(anchorRef: React.RefObject<HTMLElement | null>, open: boolean, width = 288) {
  const [pos, setPos] = useState({ top: -9999, left: -9999 });
  useEffect(() => {
    if (!open || !anchorRef.current) return;
    const calc = () => {
      const r = anchorRef.current!.getBoundingClientRect();
      const vw = window.innerWidth; const vh = window.innerHeight;
      const popH = 480;
      let top = r.bottom + 8;
      let left = r.right - width;
      if (left < 8) left = 8;
      if (left + width > vw - 8) left = vw - width - 8;
      if (top + popH > vh - 8) top = Math.max(8, r.top - popH - 8);
      setPos({ top, left });
    };
    calc();
    window.addEventListener("scroll", calc, true);
    window.addEventListener("resize", calc);
    return () => { window.removeEventListener("scroll", calc, true); window.removeEventListener("resize", calc); };
  }, [open, anchorRef, width]);
  return pos;
}
