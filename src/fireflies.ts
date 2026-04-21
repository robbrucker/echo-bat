import type { Bat } from "./bat";
import type { Cave } from "./cave";
import type { Canvas } from "./render";
import { stampArrival, type Ping } from "./sonar";

export type FireflyKind = "normal" | "golden";

type Firefly = {
  kind: FireflyKind;
  x: number;
  baseY: number;
  y: number;
  phase: number;
  lastLitAt: number;
};

type PopColor = "gold" | "cyan" | "pink";

type Pop = {
  x: number;
  y: number;
  text: string;
  color: PopColor;
  combo: number;
  startTime: number;
};

const PICKUP_RADIUS = 22;
const GOLDEN_PICKUP_RADIUS = 26;
const FIREFLY_FADE_SEC = 1.0;
const POP_DURATION = 0.95;
const MIN_SPAWN_GAP = 520;
const MAX_SPAWN_GAP = 1100;
const AMBIENT_RANGE_PX = 1000;
const AMBIENT_MAX_ALPHA = 0.7;
const GOLDEN_AMBIENT_RANGE_PX = 1200;
const GOLDEN_AMBIENT_MAX_ALPHA = 0.9;

export class Fireflies {
  flies: Firefly[] = [];
  pops: Pop[] = [];
  private distanceSinceSpawn = 0;
  private nextSpawnAt = 500;

  clear(): void {
    this.flies.length = 0;
    this.pops.length = 0;
    this.distanceSinceSpawn = 0;
    this.nextSpawnAt = 500;
  }

  addPop(
    text: string,
    x: number,
    y: number,
    color: PopColor,
    now: number,
    combo = 1,
  ): void {
    this.pops.push({ x, y, text, color, combo, startTime: now });
  }

  update(
    dt: number,
    now: number,
    canvas: Canvas,
    cave: Cave,
    bat: Bat,
    worldScrollPx: number,
    spawnRateMultiplier: number,
    goldenChance: number,
    magnetActive: boolean,
    magnetRange: number,
    magnetPullSpeed: number,
    onPickup: (x: number, y: number, kind: FireflyKind) => void,
  ): void {

    this.distanceSinceSpawn += worldScrollPx * spawnRateMultiplier;
    if (worldScrollPx > 0 && this.distanceSinceSpawn >= this.nextSpawnAt) {
      const spawnX = canvas.width + 40;
      const sample = cave.sampleAt(spawnX);
      if (sample) {
        const gapMid = (sample.ceilY + sample.floorY) * 0.5;
        const gap = sample.floorY - sample.ceilY;
        const safe = Math.max(30, gap * 0.35);
        const baseY = gapMid + (Math.random() - 0.5) * safe * 2;
        const kind: FireflyKind =
          Math.random() < goldenChance ? "golden" : "normal";
        this.flies.push({
          kind,
          x: spawnX,
          baseY,
          y: baseY,
          phase: Math.random() * Math.PI * 2,
          lastLitAt: -Infinity,
        });
      }
      this.distanceSinceSpawn = 0;
      this.nextSpawnAt =
        MIN_SPAWN_GAP + Math.random() * (MAX_SPAWN_GAP - MIN_SPAWN_GAP);
    }

    for (const f of this.flies) {
      f.x -= worldScrollPx;
      f.y = f.baseY + Math.sin(now * 1.6 + f.phase) * 5;

      if (magnetActive) {
        const dx = bat.x - f.x;
        const dy = bat.y - f.y;
        const d = Math.hypot(dx, dy);
        if (d > 0.5 && d < magnetRange) {
          const pull = magnetPullSpeed * dt * (1 - d / magnetRange);
          f.x += (dx / d) * pull;
          f.baseY += (dy / d) * pull;
        }
      }
    }

    for (let i = this.flies.length - 1; i >= 0; i--) {
      const f = this.flies[i]!;
      const r = f.kind === "golden" ? GOLDEN_PICKUP_RADIUS : PICKUP_RADIUS;
      if (Math.hypot(f.x - bat.x, f.y - bat.y) < r) {
        this.flies.splice(i, 1);
        onPickup(f.x, f.y, f.kind);
      }
    }

    for (let i = this.flies.length - 1; i >= 0; i--) {
      if (this.flies[i]!.x < -40) this.flies.splice(i, 1);
    }
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const p = this.pops[i]!;
      p.x -= worldScrollPx;
      if (now - p.startTime > POP_DURATION) this.pops.splice(i, 1);
    }
  }

  applySonar(pings: readonly Ping[], now: number): void {
    for (const f of this.flies) {
      f.lastLitAt = stampArrival(pings, now, f.x, f.y, f.lastLitAt);
    }
  }

  draw(ctx: CanvasRenderingContext2D, now: number, bat: Bat): void {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    for (const f of this.flies) {
      if (f.kind === "golden") this.drawGolden(ctx, f, now, bat);
      else this.drawNormal(ctx, f, now, bat);
    }

    for (const p of this.pops) {
      const t = (now - p.startTime) / POP_DURATION;
      if (t < 0 || t > 1) continue;
      const alpha = Math.pow(1 - t, 1.2);
      const rise = -32 * t;
      const scale = 1 + Math.min(0.5, p.combo * 0.08);
      const colMap = {
        gold: "255, 215, 140",
        cyan: "170, 230, 255",
        pink: "255, 190, 230",
      };
      const glowMap = {
        gold: "255, 180, 90",
        cyan: "140, 210, 255",
        pink: "255, 140, 210",
      };
      ctx.save();
      ctx.translate(p.x, p.y + rise);
      ctx.scale(scale, scale);
      ctx.fillStyle = `rgba(${colMap[p.color]}, ${alpha})`;
      ctx.shadowColor = `rgba(${glowMap[p.color]}, 0.9)`;
      ctx.shadowBlur = 14;
      ctx.font = "600 15px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(p.text, 0, 0);
      ctx.restore();
    }

    ctx.restore();
  }

  private drawNormal(
    ctx: CanvasRenderingContext2D,
    f: Firefly,
    now: number,
    bat: Bat,
  ): void {
    const prox = Math.hypot(f.x - bat.x, f.y - bat.y);
    const ambientAlpha =
      prox < AMBIENT_RANGE_PX
        ? AMBIENT_MAX_ALPHA * (1 - prox / AMBIENT_RANGE_PX)
        : 0;
    const age = now - f.lastLitAt;
    const litAlpha =
      age >= 0 && age < FIREFLY_FADE_SEC
        ? Math.pow(1 - age / FIREFLY_FADE_SEC, 1.4)
        : 0;
    const alpha = Math.max(ambientAlpha, litAlpha);
    if (alpha < 0.02) return;

    ctx.fillStyle = `rgba(255, 210, 130, ${alpha})`;
    ctx.shadowColor = "rgba(255, 180, 90, 1)";
    ctx.shadowBlur = 20 * alpha;
    ctx.beginPath();
    ctx.arc(f.x, f.y, 3.5 + 2 * alpha, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawGolden(
    ctx: CanvasRenderingContext2D,
    f: Firefly,
    now: number,
    bat: Bat,
  ): void {
    const prox = Math.hypot(f.x - bat.x, f.y - bat.y);
    const ambientAlpha =
      prox < GOLDEN_AMBIENT_RANGE_PX
        ? GOLDEN_AMBIENT_MAX_ALPHA * (1 - prox / GOLDEN_AMBIENT_RANGE_PX)
        : 0;
    const age = now - f.lastLitAt;
    const litAlpha =
      age >= 0 && age < FIREFLY_FADE_SEC
        ? Math.pow(1 - age / FIREFLY_FADE_SEC, 1.3)
        : 0;
    const base = Math.max(ambientAlpha, litAlpha);
    if (base < 0.03) return;

    const pulse = 0.75 + 0.25 * Math.sin(now * 3.2 + f.phase);
    const alpha = Math.min(1, base * (0.85 + 0.25 * pulse));

    // wide rainbow-ish halo
    ctx.fillStyle = `rgba(255, 170, 220, ${alpha * 0.6})`;
    ctx.shadowColor = "rgba(255, 140, 200, 1)";
    ctx.shadowBlur = 40 * alpha;
    ctx.beginPath();
    ctx.arc(f.x, f.y, (7 + 3 * alpha) * pulse, 0, Math.PI * 2);
    ctx.fill();

    // tinted secondary
    ctx.fillStyle = `rgba(255, 220, 180, ${alpha * 0.7})`;
    ctx.shadowColor = "rgba(255, 200, 140, 1)";
    ctx.shadowBlur = 20 * alpha;
    ctx.beginPath();
    ctx.arc(f.x, f.y, 4.5 * pulse, 0, Math.PI * 2);
    ctx.fill();

    // bright core
    ctx.fillStyle = `rgba(255, 250, 240, ${alpha})`;
    ctx.shadowBlur = 8 * alpha;
    ctx.beginPath();
    ctx.arc(f.x, f.y, 2.2 * pulse, 0, Math.PI * 2);
    ctx.fill();
  }
}
