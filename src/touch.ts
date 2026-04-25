// Mobile touch controls for Echo Bat. Synthesizes KeyboardEvents so input.ts's
// existing listeners pick them up, keeping touch input coexistent with keyboard.
//
// Two modes:
//   - Tilt active (post-permission-grant): every touch is just a dash tap.
//     Steering comes entirely from the analog tilt source.
//   - Tilt unavailable (denied / desktop touch / pre-grant): top-and-bottom
//     touch zones provide ArrowUp/ArrowDown hold-steering, plus tap = dash.
//
// The tap window is generous because real fingers aren't laser-precise.

import { isTiltActive } from "./tilt";

const TAP_MAX_MS = 300;
const TAP_MAX_MOVE_PX = 40;
const TOP_ZONE_FRAC = 0.4;
const BOTTOM_ZONE_FRAC = 0.4;

type Steer = "ArrowUp" | "ArrowDown" | null;

interface TrackedTouch {
  id: number;
  startX: number;
  startY: number;
  startTime: number;
  maxMove: number;
  steer: Steer;
  isPrimary: boolean;
}

function zoneForY(y: number, height: number): Steer {
  if (y < height * TOP_ZONE_FRAC) return "ArrowUp";
  if (y > height * (1 - BOTTOM_ZONE_FRAC)) return "ArrowDown";
  return null;
}

function dispatchKeyDown(code: string): void {
  window.dispatchEvent(new KeyboardEvent("keydown", { code }));
}

function dispatchKeyUp(code: string): void {
  window.dispatchEvent(new KeyboardEvent("keyup", { code }));
}

export function initTouch(canvas: HTMLCanvasElement): void {
  if (typeof window === "undefined") return;

  const touches = new Map<number, TrackedTouch>();
  let primaryId: number | null = null;
  let activeSteer: Steer = null;

  const setSteer = (next: Steer): void => {
    if (next === activeSteer) return;
    if (activeSteer) dispatchKeyUp(activeSteer);
    if (next) dispatchKeyDown(next);
    activeSteer = next;
  };

  const onTouchStart = (e: TouchEvent): void => {
    e.preventDefault();
    const useZoneSteer = !isTiltActive();
    const rect = canvas.getBoundingClientRect();
    for (const t of Array.from(e.changedTouches)) {
      const localY = t.clientY - rect.top;
      const isPrimary = primaryId === null;
      const steer =
        useZoneSteer && isPrimary ? zoneForY(localY, rect.height) : null;
      touches.set(t.identifier, {
        id: t.identifier,
        startX: t.clientX,
        startY: t.clientY,
        startTime: performance.now(),
        maxMove: 0,
        steer,
        isPrimary,
      });
      if (isPrimary) {
        primaryId = t.identifier;
        if (useZoneSteer) setSteer(steer);
      }
    }
  };

  const onTouchMove = (e: TouchEvent): void => {
    e.preventDefault();
    const useZoneSteer = !isTiltActive();
    const rect = canvas.getBoundingClientRect();
    for (const t of Array.from(e.changedTouches)) {
      const tracked = touches.get(t.identifier);
      if (!tracked) continue;
      const dx = t.clientX - tracked.startX;
      const dy = t.clientY - tracked.startY;
      const dist = Math.hypot(dx, dy);
      if (dist > tracked.maxMove) tracked.maxMove = dist;
      if (useZoneSteer && tracked.isPrimary) {
        const localY = t.clientY - rect.top;
        tracked.steer = zoneForY(localY, rect.height);
        setSteer(tracked.steer);
      }
    }
  };

  const finishTouch = (id: number, cancelled: boolean): void => {
    const tracked = touches.get(id);
    if (!tracked) return;
    touches.delete(id);
    const duration = performance.now() - tracked.startTime;
    const isTap =
      !cancelled &&
      duration <= TAP_MAX_MS &&
      tracked.maxMove <= TAP_MAX_MOVE_PX;
    if (isTap) {
      dispatchKeyDown("Space");
      dispatchKeyUp("Space");
    }
    if (tracked.isPrimary) {
      primaryId = null;
      // Promote another live touch to primary if one exists.
      const next = touches.values().next().value;
      if (next) {
        next.isPrimary = true;
        primaryId = next.id;
        if (!isTiltActive()) setSteer(next.steer);
      } else {
        setSteer(null);
      }
    }
  };

  const onTouchEnd = (e: TouchEvent): void => {
    e.preventDefault();
    for (const t of Array.from(e.changedTouches)) finishTouch(t.identifier, false);
  };

  const onTouchCancel = (e: TouchEvent): void => {
    for (const t of Array.from(e.changedTouches)) finishTouch(t.identifier, true);
  };

  canvas.addEventListener("touchstart", onTouchStart, { passive: false });
  canvas.addEventListener("touchmove", onTouchMove, { passive: false });
  canvas.addEventListener("touchend", onTouchEnd, { passive: false });
  canvas.addEventListener("touchcancel", onTouchCancel, { passive: false });
}
