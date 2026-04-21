// Tilt-to-steer controls using DeviceOrientation.
// Calibrates the neutral posture to the orientation at enable time.
// Slowly auto-recalibrates inside the deadzone so posture shifts self-correct.
// Tilting the top of the phone BACK (away from user) = bat UP; TOWARD user = DOWN.

const DEADZONE_DEG = 5;
const RECALIBRATE_ALPHA = 0.0015;

let enabled = false;
let neutralBeta: number | null = null;
let upHeld = false;
let downHeld = false;

type MaybePermissionDOE = {
  requestPermission?: () => Promise<"granted" | "denied">;
};

function dispatchKey(type: "keydown" | "keyup", code: string): void {
  window.dispatchEvent(new KeyboardEvent(type, { code, key: code }));
}

function onOrientation(e: DeviceOrientationEvent): void {
  const beta = e.beta;
  if (beta == null) return;
  if (neutralBeta === null) {
    neutralBeta = beta;
    return;
  }
  const delta = beta - neutralBeta;

  // drift neutral toward current while in deadzone (handles posture shifts)
  if (Math.abs(delta) < DEADZONE_DEG * 0.5) {
    neutralBeta += delta * RECALIBRATE_ALPHA;
  }

  const up = delta > DEADZONE_DEG;
  const down = delta < -DEADZONE_DEG;

  if (up !== upHeld) {
    upHeld = up;
    dispatchKey(up ? "keydown" : "keyup", "ArrowUp");
  }
  if (down !== downHeld) {
    downHeld = down;
    dispatchKey(down ? "keydown" : "keyup", "ArrowDown");
  }
}

async function requestPermissionIfNeeded(): Promise<boolean> {
  if (typeof DeviceOrientationEvent === "undefined") return false;
  const anyEvt = DeviceOrientationEvent as unknown as MaybePermissionDOE;
  if (typeof anyEvt.requestPermission !== "function") return true;
  try {
    const result = await anyEvt.requestPermission();
    return result === "granted";
  } catch {
    return false;
  }
}

async function enableTilt(): Promise<boolean> {
  if (enabled) return true;
  const granted = await requestPermissionIfNeeded();
  if (!granted) return false;
  window.addEventListener("deviceorientation", onOrientation);
  enabled = true;
  return true;
}

export function initTilt(): void {
  if (typeof window === "undefined") return;
  // iOS 13+ requires a user gesture to grant orientation permission.
  // Attach one-shot listeners on the earliest gesture; remove after attempt.
  const attempt = (): void => {
    window.removeEventListener("touchstart", attempt);
    window.removeEventListener("pointerdown", attempt);
    window.removeEventListener("keydown", attempt);
    void enableTilt();
  };
  window.addEventListener("touchstart", attempt, { passive: true, once: true });
  window.addEventListener("pointerdown", attempt, { passive: true, once: true });
  window.addEventListener("keydown", attempt, { once: true });
}

export function recalibrateTilt(): void {
  neutralBeta = null;
}

export function isTiltActive(): boolean {
  return enabled;
}
