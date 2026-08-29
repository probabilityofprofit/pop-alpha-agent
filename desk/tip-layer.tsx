"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";

type TipState = {
  text: string;
  top: number;
  left: number;
  pos: "above" | "below" | "right";
};

const PAD = 8;
const MAX_W = 240;

function place(el: HTMLElement): TipState | null {
  const text = el.getAttribute("data-tip")?.trim();
  if (!text) return null;
  const posAttr = el.getAttribute("data-tip-pos");
  const pos: TipState["pos"] = posAttr === "below" ? "below" : posAttr === "right" ? "right" : "above";
  const r = el.getBoundingClientRect();
  let top = r.top - PAD;
  let left = r.left + r.width / 2;
  if (pos === "below") {
    top = r.bottom + PAD;
    left = r.left + r.width / 2;
  } else if (pos === "right") {
    top = r.top + r.height / 2;
    left = r.right + PAD;
  }

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (pos === "right") {
    left = Math.min(left, vw - MAX_W - PAD);
    left = Math.max(PAD, left);
    top = Math.min(Math.max(PAD, top), vh - PAD);
  } else {
    left = Math.min(Math.max(PAD + MAX_W / 2, left), vw - PAD - MAX_W / 2);
    if (pos === "above" && top < 48) {
      top = r.bottom + PAD;
      return { text, top, left, pos: "below" };
    }
    if (pos === "below" && top > vh - 48) {
      top = r.top - PAD;
      return { text, top, left, pos: "above" };
    }
  }
  return { text, top, left, pos };
}

/** Fixed portal tooltips so panel overflow cannot clip them. */
export function TipLayer() {
  const [tip, setTip] = useState<TipState | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
    let showTimer: ReturnType<typeof setTimeout> | null = null;
    let active: HTMLElement | null = null;

    const clear = () => {
      if (showTimer) clearTimeout(showTimer);
      showTimer = null;
      active = null;
      setTip(null);
    };

    const schedule = (el: HTMLElement) => {
      if (active === el) return;
      if (showTimer) clearTimeout(showTimer);
      active = el;
      showTimer = setTimeout(() => {
        const next = place(el);
        setTip(next);
      }, 280);
    };

    const onOver = (e: Event) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      const el = t.closest("[data-tip]") as HTMLElement | null;
      if (!el || !el.getAttribute("data-tip")?.trim()) {
        clear();
        return;
      }
      schedule(el);
    };

    const onOut = (e: Event) => {
      const ev = e as MouseEvent;
      const from = ev.target;
      const to = ev.relatedTarget;
      if (!(from instanceof Element)) return;
      const el = from.closest("[data-tip]");
      if (!el) return;
      if (to instanceof Node && el.contains(to)) return;
      clear();
    };

    const onFocusIn = (e: FocusEvent) => {
      const t = e.target;
      if (!(t instanceof HTMLElement)) return;
      const el = t.closest("[data-tip]") as HTMLElement | null;
      if (el?.getAttribute("data-tip")?.trim()) schedule(el);
    };

    const onFocusOut = () => clear();
    const onScroll = () => clear();

    document.addEventListener("pointerover", onOver, true);
    document.addEventListener("pointerout", onOut, true);
    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("focusout", onFocusOut, true);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);

    return () => {
      clear();
      document.removeEventListener("pointerover", onOver, true);
      document.removeEventListener("pointerout", onOut, true);
      document.removeEventListener("focusin", onFocusIn, true);
      document.removeEventListener("focusout", onFocusOut, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  if (!ready || !tip) return null;

  const style: CSSProperties =
    tip.pos === "right"
      ? { top: tip.top, left: tip.left, transform: "translateY(-50%)" }
      : tip.pos === "below"
        ? { top: tip.top, left: tip.left, transform: "translateX(-50%)" }
        : { top: tip.top, left: tip.left, transform: "translate(-50%, -100%)" };

  return createPortal(
    <div className="tip-float" data-pos={tip.pos} style={style} role="tooltip">
      {tip.text}
    </div>,
    document.body,
  );
}
