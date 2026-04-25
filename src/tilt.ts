// Analog tilt-to-steer using DeviceOrientation.
//
// Calibrates the neutral posture to the orientation at enable time, then
// auto-recalibrates inside the deadzone so posture shifts self-correct.
// Tilting the top of the phone BACK (away from user) = bat UP; TOWARD user = DOWN.
//
// The output is an analog value in [-1, 1]. Bat input convention: negative =
// up (matches keyboard ArrowUp's `input -= 1`). Consumers read via getTiltSteer().

const DEADZONE_DEG = 6;
const FULL_RANGE_DEG = 22; // tilt past this for full input
const RECALIBRATE_ALPHA = 0.0015;

let enabled = false;
let neutralBeta: number | null = null;
let analogSteer = 0;

type MaybePermissionDOE = {
  requestPermission?: () => Promise<"granted" | "denied">;
};

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

  const sign = Math.sign(delta);
  const mag = Math.abs(delta);
  if (mag <= DEADZONE_DEG) {
    analogSteer = 0;
    return;
  }
  const t = Math.min(1, (mag - DEADZONE_DEG) / (FULL_RANGE_DEG - DEADZONE_DEG));
  // tilt-back (delta > 0) -> bat UP (negative input); tilt-forward -> DOWN.
  analogSteer = -sign * t;
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

/** Analog steer in [-1, 1]. Negative = up, positive = down. 0 when in deadzone or tilt unavailable. */
export function getTiltSteer(): number {
  return enabled ? analogSteer : 0;
}
