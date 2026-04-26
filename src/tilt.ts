// Tilt-to-steer using gravity-vector accelerometer data.
//
// Two source paths:
//   - Native iOS: a tiny custom Capacitor plugin (MotionBridge in Swift)
//     pumps CMMotionManager raw accelerometer data straight to JS,
//     bypassing WKWebView's flaky DeviceMotionEvent permission flow.
//   - Web / Android: window.devicemotion with iOS's requestPermission()
//     dance for Safari 13+.
// Both feed the same calibrate-and-map pipeline.
//
// Why gravity-vector instead of orientation: works in any device orientation
// (portrait/landscape/upside-down), and any axis the user tilts (forward/back
// or side-to-side) drives steering — we pick whichever axis moves most.

import { Capacitor, registerPlugin } from "@capacitor/core";

interface MotionBridgePlugin {
  start(): Promise<void>;
  stop(): Promise<void>;
  addListener(
    eventName: "accel",
    listener: (event: { x: number; y: number; z: number }) => void,
  ): Promise<{ remove: () => Promise<void> }>;
}
const MotionBridge = registerPlugin<MotionBridgePlugin>("MotionBridge");

const DEADZONE_DEG = 6;
const FULL_RANGE_DEG = 22;
const RECALIBRATE_ALPHA = 0.0015;

type TiltStatus = "unsupported" | "pending" | "denied" | "granted" | "no-events";

let enabled = false;
let analogSteer = 0;
let receivedEvent = false;
let permissionState: "pending" | "granted" | "denied" = "pending";
let neutralVec: { x: number; y: number; z: number } | null = null;
let lastNormalized: { x: number; y: number; z: number } | null = null;

type MaybePermissionDME = {
  requestPermission?: () => Promise<"granted" | "denied">;
};

function processAccel(ax: number, ay: number, az: number): void {
  receivedEvent = true;
  const mag = Math.sqrt(ax * ax + ay * ay + az * az);
  if (!isFinite(mag) || mag < 0.5) return; // noise / freefall guard

  // Normalize so we don't depend on whether the source emits g-units or m/s².
  const n = { x: ax / mag, y: ay / mag, z: az / mag };
  lastNormalized = n;

  if (neutralVec === null) {
    neutralVec = { x: n.x, y: n.y, z: n.z };
    return;
  }

  const dx = n.x - neutralVec.x;
  const dy = n.y - neutralVec.y;
  const dz = n.z - neutralVec.z;

  // Pick whichever axis moved most from neutral. That way ANY tilt
  // direction registers — forward/back, side-to-side, doesn't matter.
  let dominant = dz;
  let absDom = Math.abs(dz);
  if (Math.abs(dx) > absDom) {
    dominant = dx;
    absDom = Math.abs(dx);
  }
  if (Math.abs(dy) > absDom) {
    dominant = dy;
    absDom = Math.abs(dy);
  }

  // Slow recalibration in deadzone to absorb posture drift.
  const dzFrac = Math.sin((DEADZONE_DEG * Math.PI) / 180);
  if (absDom < dzFrac * 0.5) {
    neutralVec.x += dx * RECALIBRATE_ALPHA;
    neutralVec.y += dy * RECALIBRATE_ALPHA;
    neutralVec.z += dz * RECALIBRATE_ALPHA;
  }

  // Map normalized component shift -> degrees via asin.
  const ratio = Math.max(-1, Math.min(1, dominant));
  const deltaDeg = (Math.asin(ratio) * 180) / Math.PI;
  const sign = Math.sign(deltaDeg);
  const absDeg = Math.abs(deltaDeg);
  if (absDeg <= DEADZONE_DEG) {
    analogSteer = 0;
    return;
  }
  const t = Math.min(1, (absDeg - DEADZONE_DEG) / (FULL_RANGE_DEG - DEADZONE_DEG));
  // Convention: bat goes UP for negative input, DOWN for positive. We pick
  // the sign so tilting "forward" (top of screen away) sends bat up, but
  // since we use whichever-axis-moves-most, the sign is just a discoverable
  // convention; flip it once and it's symmetric.
  analogSteer = -sign * t;
}

function onWebDeviceMotion(e: DeviceMotionEvent): void {
  const a = e.accelerationIncludingGravity;
  if (!a) return;
  processAccel(a.x ?? 0, a.y ?? 0, a.z ?? 0);
}

// Native iOS: subscribe to our custom MotionBridge plugin. It uses
// CMMotionManager directly, no permission prompt for raw accelerometer.
function enableNativeBridge(): void {
  if (enabled) return;
  MotionBridge.addListener("accel", (event) => {
    processAccel(event.x, event.y, event.z);
  })
    .then(() => MotionBridge.start())
    .then(() => {
      enabled = true;
      permissionState = "granted";
    })
    .catch(() => {
      permissionState = "denied";
    });
}

// Web fallback: synchronously called from a user gesture handler — must be
// inside the user activation context for iOS Safari / WKWebView to accept
// requestPermission().
function syncEnableWeb(): void {
  if (enabled) return;
  if (typeof DeviceMotionEvent === "undefined") return;
  const anyEvt = DeviceMotionEvent as unknown as MaybePermissionDME;

  if (typeof anyEvt.requestPermission !== "function") {
    // Android, older iOS, desktop browsers — no permission needed.
    window.addEventListener("devicemotion", onWebDeviceMotion);
    enabled = true;
    permissionState = "granted";
    return;
  }

  try {
    anyEvt
      .requestPermission()
      .then((result) => {
        if (result === "granted") {
          window.addEventListener("devicemotion", onWebDeviceMotion);
          enabled = true;
          permissionState = "granted";
        } else {
          permissionState = "denied";
        }
      })
      .catch(() => {
        permissionState = "denied";
      });
  } catch {
    permissionState = "denied";
  }
}

export function initTilt(): void {
  if (typeof window === "undefined") return;

  // Native iOS / Capacitor: bypass WKWebView's flaky DeviceMotion permission
  // entirely and pump CMMotionManager data through our custom plugin. No
  // user-gesture requirement, no permission prompt for raw accelerometer.
  if (Capacitor.isNativePlatform()) {
    enableNativeBridge();
  } else {
    // Web: try on first user gesture; non-passive so transient activation
    // isn't dropped by Safari when calling requestPermission().
    const attempt = (): void => {
      window.removeEventListener("touchstart", attempt);
      window.removeEventListener("pointerdown", attempt);
      window.removeEventListener("keydown", attempt);
      syncEnableWeb();
    };
    window.addEventListener("touchstart", attempt, { once: true });
    window.addEventListener("pointerdown", attempt, { once: true });
    window.addEventListener("keydown", attempt, { once: true });
  }

  // Recalibrate on rotation so the user doesn't end up biased.
  window.addEventListener("orientationchange", () => {
    neutralVec = null;
  });
  if (typeof screen !== "undefined" && screen.orientation) {
    screen.orientation.addEventListener?.("change", () => {
      neutralVec = null;
    });
  }
}

export function recalibrateTilt(): void {
  neutralVec = null;
}

export function isTiltActive(): boolean {
  return enabled;
}

/** Analog steer in [-1, 1]. Negative = up, positive = down. */
export function getTiltSteer(): number {
  return enabled ? analogSteer : 0;
}

/** Detailed status for the menu HUD. */
export function getTiltStatus(): TiltStatus {
  if (
    !Capacitor.isNativePlatform() &&
    typeof DeviceMotionEvent === "undefined"
  ) {
    return "unsupported";
  }
  if (permissionState === "denied") return "denied";
  if (!enabled) return "pending";
  if (!receivedEvent) return "no-events";
  return "granted";
}

/** For on-screen diagnostics. Returns normalized gravity vector or null. */
export function getLastAccel(): { x: number; y: number; z: number } | null {
  return lastNormalized;
}
