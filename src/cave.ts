import type { Canvas } from "./render";
import {
  CAVE_START_MIN_GAP,
  CAVE_START_NOISE,
  CHAMBER_MIN_INTERVAL,
  CHAMBER_MAX_INTERVAL,
  CHAMBER_MIN_LEN,
  CHAMBER_MAX_LEN,
  CHAMBER_RAMP,
  CHAMBER_EXTRA_GAP,
  FADE_SEC,
  AMBIENT_WALL_ALPHA,
  AMBIENT_WALL_NEAR_ALPHA,
  AMBIENT_WALL_NEAR_RANGE,
} from "./tuning";
import { stampArrival, type Ping } from "./sonar";
import type { Bat } from "./bat";
import { theme } from "./biomes";

export type Slice = {
  x: number;
  ceilY: number;
  floorY: number;
  ceilLitAt: number;
  floorLitAt: number;
};

const SLICE_SPACING = 40;
const CEILING_MIN = 20;
const FLOOR_MAX_MARGIN = 20;
const LEAD_IN_PX = 220;

function clampStep(prev: number, min: number, max: number, noiseStep: number): number {
  let next = prev + (Math.random() - 0.5) * noiseStep * 2;
  if (next < min) next = min;
  if (next > max) next = max;
  return next;
}

function enforceGap(
  ceilY: number,
  floorY: number,
  minGap: number,
): { ceilY: number; floorY: number } {
  if (floorY - ceilY < minGap) {
    const mid = (ceilY + floorY) * 0.5;
    return { ceilY: mid - minGap * 0.5, floorY: mid + minGap * 0.5 };
  }
  return { ceilY, floorY };
}

function smoothstep(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

function newSlice(x: number, ceilY: number, floorY: number): Slice {
  return {
    x,
    ceilY,
    floorY,
    ceilLitAt: -Infinity,
    floorLitAt: -Infinity,
  };
}

export class Cave {
  slices: Slice[] = [];
  inChamber = false;
  private generationCursor = 0;
  private chamberStartCursor = 0;
  private chamberLen = 0;
  private nextChamberAt = 0;

  constructor(canvas: Canvas, batX: number) {
    this.reset(canvas, batX);
  }

  reset(
    canvas: Canvas,
    batX: number,
    minGap: number = CAVE_START_MIN_GAP,
    noiseStep: number = CAVE_START_NOISE,
  ): void {
    this.slices = [];
    this.inChamber = false;
    this.generationCursor = 0;
    this.chamberStartCursor = 0;
    this.chamberLen = 0;
    this.nextChamberAt =
      CHAMBER_MIN_INTERVAL +
      Math.random() * (CHAMBER_MAX_INTERVAL - CHAMBER_MIN_INTERVAL);

    const midY = canvas.height * 0.5;
    let ceilY = midY - 220;
    let floorY = midY + 220;
    const count = Math.ceil(canvas.width / SLICE_SPACING) + 4;
    const maxFloor = canvas.height - FLOOR_MAX_MARGIN;

    // pre-fill is always calm — no chambers in the lead-in
    for (let i = 0; i < count; i++) {
      const x = i * SLICE_SPACING;
      if (x > batX + LEAD_IN_PX) {
        ceilY = clampStep(ceilY, CEILING_MIN, midY - minGap * 0.5, noiseStep);
        floorY = clampStep(floorY, midY + minGap * 0.5, maxFloor, noiseStep);
        ({ ceilY, floorY } = enforceGap(ceilY, floorY, minGap));
      }
      this.slices.push(newSlice(x, ceilY, floorY));
    }
  }

  private chamberEnv(): number {
    if (!this.inChamber) return 0;
    const into = this.generationCursor - this.chamberStartCursor;
    if (into < CHAMBER_RAMP) return smoothstep(into / CHAMBER_RAMP);
    if (into > this.chamberLen - CHAMBER_RAMP) {
      return smoothstep((this.chamberLen - into) / CHAMBER_RAMP);
    }
    return 1;
  }

  private advanceChamberSchedule(): void {
    const cursor = this.generationCursor;
    if (this.inChamber) {
      if (cursor >= this.chamberStartCursor + this.chamberLen) {
        this.inChamber = false;
        this.nextChamberAt =
          cursor +
          CHAMBER_MIN_INTERVAL +
          Math.random() * (CHAMBER_MAX_INTERVAL - CHAMBER_MIN_INTERVAL);
      }
    } else if (cursor >= this.nextChamberAt) {
      this.inChamber = true;
      this.chamberStartCursor = cursor;
      this.chamberLen =
        CHAMBER_MIN_LEN +
        Math.random() * (CHAMBER_MAX_LEN - CHAMBER_MIN_LEN);
    }
  }

  update(
    dt: number,
    canvas: Canvas,
    speed: number,
    minGap: number,
    noiseStep: number,
  ): void {
    const dx = speed * dt;
    for (const s of this.slices) s.x -= dx;

    while (this.slices.length > 0 && this.slices[0]!.x < -SLICE_SPACING * 2) {
      this.slices.shift();
    }

    const midY = canvas.height * 0.5;
    const maxFloor = canvas.height - FLOOR_MAX_MARGIN;

    while (
      this.slices[this.slices.length - 1]!.x <
      canvas.width + SLICE_SPACING * 2
    ) {
      const last = this.slices[this.slices.length - 1]!;
      let ceilY = clampStep(last.ceilY, CEILING_MIN, midY - minGap * 0.5, noiseStep);
      let floorY = clampStep(last.floorY, midY + minGap * 0.5, maxFloor, noiseStep);
      ({ ceilY, floorY } = enforceGap(ceilY, floorY, minGap));

      const env = this.chamberEnv();
      if (env > 0) {
        const push = env * CHAMBER_EXTRA_GAP * 0.5;
        ceilY = Math.max(CEILING_MIN, ceilY - push);
        floorY = Math.min(maxFloor, floorY + push);
      }

      this.slices.push(newSlice(last.x + SLICE_SPACING, ceilY, floorY));
      this.generationCursor += SLICE_SPACING;
      this.advanceChamberSchedule();
    }
  }

  applySonar(pings: readonly Ping[], now: number): void {
    for (let i = 0; i < this.slices.length - 1; i++) {
      const a = this.slices[i]!;
      const b = this.slices[i + 1]!;
      const mx = (a.x + b.x) * 0.5;
      a.ceilLitAt = stampArrival(pings, now, mx, (a.ceilY + b.ceilY) * 0.5, a.ceilLitAt);
      a.floorLitAt = stampArrival(pings, now, mx, (a.floorY + b.floorY) * 0.5, a.floorLitAt);
    }
  }

  sampleAt(x: number): { ceilY: number; floorY: number } | null {
    const n = this.slices.length;
    if (n < 2) return null;
    if (x < this.slices[0]!.x || x > this.slices[n - 1]!.x) return null;
    for (let i = 0; i < n - 1; i++) {
      const a = this.slices[i]!;
      const b = this.slices[i + 1]!;
      if (x >= a.x && x <= b.x) {
        const t = (x - a.x) / (b.x - a.x);
        return {
          ceilY: a.ceilY + (b.ceilY - a.ceilY) * t,
          floorY: a.floorY + (b.floorY - a.floorY) * t,
        };
      }
    }
    return null;
  }

  drawLit(ctx: CanvasRenderingContext2D, now: number, bat: Bat): void {
    if (this.slices.length < 2) return;

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < this.slices.length - 1; i++) {
        const a = this.slices[i]!;
        const b = this.slices[i + 1]!;
        const mx = (a.x + b.x) * 0.5;

        const ceilMid = (a.ceilY + b.ceilY) * 0.5;
        const ceilAmbient = this.ambientAlphaAt(mx, ceilMid, bat);
        this.strokeLitSegment(
          ctx, now, pass,
          a.x, a.ceilY, b.x, b.ceilY,
          a.ceilLitAt, ceilAmbient,
        );

        const floorMid = (a.floorY + b.floorY) * 0.5;
        const floorAmbient = this.ambientAlphaAt(mx, floorMid, bat);
        this.strokeLitSegment(
          ctx, now, pass,
          a.x, a.floorY, b.x, b.floorY,
          a.floorLitAt, floorAmbient,
        );
      }
    }
    ctx.restore();
  }

  private ambientAlphaAt(x: number, y: number, bat: Bat): number {
    const d = Math.hypot(x - bat.x, y - bat.y);
    if (d >= AMBIENT_WALL_NEAR_RANGE) return AMBIENT_WALL_ALPHA;
    const prox = 1 - d / AMBIENT_WALL_NEAR_RANGE;
    return AMBIENT_WALL_ALPHA + prox * (AMBIENT_WALL_NEAR_ALPHA - AMBIENT_WALL_ALPHA);
  }

  private strokeLitSegment(
    ctx: CanvasRenderingContext2D,
    now: number,
    pass: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    litAt: number,
    ambientAlpha: number,
  ): void {
    const age = now - litAt;
    const litAlpha =
      age >= 0 && age <= FADE_SEC ? Math.pow(1 - age / FADE_SEC, 1.4) : 0;
    const alpha = Math.max(ambientAlpha, litAlpha);
    if (alpha <= 0.015) return;

    if (pass === 0) {
      // halo — only kicks in strongly on pings, not ambient
      if (litAlpha < 0.12) return;
      ctx.strokeStyle = `rgba(${theme.wallHalo}, ${litAlpha * 0.55})`;
      ctx.lineWidth = 6;
      ctx.shadowColor = `rgba(${theme.wallHalo}, 1)`;
      ctx.shadowBlur = 16 * litAlpha;
    } else {
      // core — always drawn at effective alpha (ambient or lit)
      ctx.strokeStyle = `rgba(${theme.wallCore}, ${alpha})`;
      ctx.lineWidth = 1.6;
      ctx.shadowBlur = 0;
    }
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
}
