// Analog tilt-to-steer with two backends:
//   - Native (Capacitor on iOS): uses CoreMotion via @capacitor/motion. The
//     bridge handles permission natively (NSMotionUsageDescription prompt),
//     bypassing Safari's flaky DeviceOrientationEvent.requestPermission flow.
//   - Web (browser): standard window DeviceOrientation events with iOS 13+
//     permission handling.
//
// Either backend feeds the same calibrate-and-map pipeline below. Output is
// an analog value in [-1, 1].
//
// Calibrates the neutral posture to the orientation at enable time and
// auto-recalibrates inside the deadzone so posture shifts self-correct.
// Also recalibrates on orientationchange so portrait↔landscape rotation
// doesn't leave the user stuck off-axis.

import { Capacitor } from "@capacitor/core";
import { Motion } from "@capacitor/motion";

const DEADZONE_DEG = 6;
const FULL_RANGE_DEG = 22; // tilt past this for full input
const RECALIBRATE_ALPHA = 0.0015;

type TiltStatus = "unsupported" | "pending" | "denied" | "granted" | "no-events";

let enabled = false;
let neutralRaw: number | null = null;
let analogSteer = 0;
let receivedEvent = false;
let permissionState: "pending" | "granted" | "denied" = "pending";
let lastAngle = 0;

type MaybePermissionDOE = {
  requestPermission?: () => Promise<"granted" | "denied">;
};

// Returns the current screen orientation in degrees (0, 90, 180, 270).
function getOrientationAngle(): number {
  const so = (typeof screen !== "undefined" ? screen : null)?.orientation;
  if (so && typeof so.angle === "number") return so.angle;
  // legacy iOS path
  const wo = (window as unknown as { orientation?: number }).orientation;
  if (typeof wo === "number") return wo;
  return 0;
}

// Map device beta/gamma to a single "user perceives this as tilt-forward/back"
// axis based on which way the device is currently rotated.
function rawTiltFor(e: DeviceOrientationEvent): number | null {
  const beta = e.beta;
  const gamma = e.gamma;
  if (beta == null || gamma == null) return null;
  const angle = getOrientationAngle();
  if (angle === 90) return -gamma;
  if (angle === -90 || angle === 270) return gamma;
  if (angle === 180) return -beta;
  return beta;
}

function onOrientation(e: DeviceOrientationEvent): void {
  receivedEvent = true;

  const raw = rawTiltFor(e);
  if (raw == null) return;

  // Recalibrate when the device rotation changes — neutral posture differs
  // between portrait and landscape.
  const angle = getOrientationAngle();
  if (angle !== lastAngle) {
    lastAngle = angle;
    neutralRaw = null;
  }

  if (neutralRaw === null) {
    neutralRaw = raw;
    return;
  }
  const delta = raw - neutralRaw;

  if (Math.abs(delta) < DEADZONE_DEG * 0.5) {
    neutralRaw += delta * RECALIBRATE_ALPHA;
  }

  const sign = Math.sign(delta);
  const mag = Math.abs(delta);
  if (mag <= DEADZONE_DEG) {
    analogSteer = 0;
    return;
  }
  const t = Math.min(1, (mag - DEADZONE_DEG) / (FULL_RANGE_DEG - DEADZONE_DEG));
  // tilt-back -> bat UP (negative input); tilt-forward -> DOWN.
  analogSteer = -sign * t;
}

// Native path: subscribe to Capacitor's Motion plugin. The plugin emits
// DeviceOrientationEvent-shaped events from CoreMotion. iOS shows a
// system motion-access prompt the first time, governed by
// NSMotionUsageDescription in Info.plist.
function enableNativeTilt(): void {
  if (enabled) return;
  Motion.addListener("orientation", (event) => {
    onOrientation(event as unknown as DeviceOrientationEvent);
  })
    .then(() => {
      enabled = true;
      permissionState = "granted";
    })
    .catch(() => {
      permissionState = "denied";
    });
}

// Synchronously called from the gesture handler — must be inside the user
// activation context for iOS Safari to even consider showing the prompt.
function syncEnableTilt(): void {
  if (enabled) return;
  if (typeof DeviceOrientationEvent === "undefined") return;
  const anyEvt = DeviceOrientationEvent as unknown as MaybePermissionDOE;

  if (typeof anyEvt.requestPermission !== "function") {
    // Android / older iOS — no permission required.
    window.addEventListener("deviceorientation", onOrientation);
    enabled = true;
    permissionState = "granted";
    return;
  }

  // iOS 13+ Safari: synchronous Promise — keeps requestPermission() inside
  // the gesture activation. Don't async/await across function boundaries.
  try {
    anyEvt
      .requestPermission()
      .then((result) => {
        if (result === "granted") {
          window.addEventListener("deviceorientation", onOrientation);
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

  // Native iOS/Android via Capacitor: skip the Safari permission dance and
  // subscribe directly to the Motion plugin. The native bridge handles
  // CoreMotion permission via Info.plist's NSMotionUsageDescription.
  if (Capacitor.isNativePlatform()) {
    enableNativeTilt();
  } else {
    // Web fallback. Try on the first user gesture; non-passive so transient
    // activation isn't dropped by Safari.
    const attempt = (): void => {
      window.removeEventListener("touchstart", attempt);
      window.removeEventListener("pointerdown", attempt);
      window.removeEventListener("keydown", attempt);
      syncEnableTilt();
    };
    window.addEventListener("touchstart", attempt, { once: true });
    window.addEventListener("pointerdown", attempt, { once: true });
    window.addEventListener("keydown", attempt, { once: true });
  }

  // Force recalibration on rotation so the user doesn't end up biased.
  window.addEventListener("orientationchange", () => {
    neutralRaw = null;
  });
  if (typeof screen !== "undefined" && screen.orientation) {
    screen.orientation.addEventListener?.("change", () => {
      neutralRaw = null;
    });
  }
}

export function recalibrateTilt(): void {
  neutralRaw = null;
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
    typeof DeviceOrientationEvent === "undefined"
  ) {
    return "unsupported";
  }
  if (permissionState === "denied") return "denied";
  if (!enabled) return "pending";
  if (!receivedEvent) return "no-events";
  return "granted";
}
