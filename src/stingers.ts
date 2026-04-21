import type { Bat } from "./bat";
import type { Cave } from "./cave";
import type { Canvas } from "./render";
import { stampArrival, type Ping } from "./sonar";
import {
  STINGER_MIN_SPAWN_GAP,
  STINGER_MAX_SPAWN_GAP,
  STINGER_RADIUS,
  STINGER_FIRST_AT,
  STINGER_AMBIENT_RANGE_PX,
  STINGER_AMBIENT_MAX_ALPHA,
} from "./tuning";

type Stinger = {
  x: number;
  baseY: number;
  y: number;
  vyAmp: number;
  vyHz: number;
  phase: number;
  lastLitAt: number;
};

const FADE_SEC = 1.1;
const HIT_RADIUS_BAT = 8;

export class Stingers {
  items: Stinger[] = [];
  private spawnedDistance = 0;
  private nextSpawnAt = STINGER_FIRST_AT;

  clear(): void {
    this.items.length = 0;
    this.spawnedDistance = 0;
    this.nextSpawnAt = STINGER_FIRST_AT;
  }

  update(
    dt: number,
    now: number,
    canvas: Canvas,
    cave: Cave,
    worldScrollPx: number,
  ): void {
    void dt;

    this.spawnedDistance += worldScrollPx;
    if (worldScrollPx > 0 && this.spawnedDistance >= this.nextSpawnAt) {
      const spawnX = canvas.width + 60;
      const sample = cave.sampleAt(spawnX);
      if (sample) {
        const mid = (sample.ceilY + sample.floorY) * 0.5;
        const gap = sample.floorY - sample.ceilY;
        const safe = Math.max(40, gap * 0.35);
        this.items.push({
          x: spawnX,
          baseY: mid + (Math.random() - 0.5) * safe * 1.6,
          y: mid,
          vyAmp: 14 + Math.random() * 26,
          vyHz: 0.7 + Math.random() * 0.9,
          phase: Math.random() * Math.PI * 2,
          lastLitAt: -Infinity,
        });
      }
      this.spawnedDistance = 0;
      this.nextSpawnAt =
        STINGER_MIN_SPAWN_GAP +
        Math.random() * (STINGER_MAX_SPAWN_GAP - STINGER_MIN_SPAWN_GAP);
    }

    for (const s of this.items) {
      s.x -= worldScrollPx;
      s.y = s.baseY + Math.sin(now * Math.PI * 2 * s.vyHz + s.phase) * s.vyAmp;
    }

    for (let i = this.items.length - 1; i >= 0; i--) {
      if (this.items[i]!.x < -40) this.items.splice(i, 1);
    }
  }

  applySonar(pings: readonly Ping[], now: number): void {
    for (const s of this.items) {
      s.lastLitAt = stampArrival(pings, now, s.x, s.y, s.lastLitAt);
    }
  }

  checkCollision(bat: Bat): Stinger | null {
    for (const s of this.items) {
      if (Math.hypot(s.x - bat.x, s.y - bat.y) < STINGER_RADIUS + HIT_RADIUS_BAT) {
        return s;
      }
    }
    return null;
  }

  destroy(stinger: Stinger): void {
    const i = this.items.indexOf(stinger);
    if (i >= 0) this.items.splice(i, 1);
  }

  draw(ctx: CanvasRenderingContext2D, now: number, bat: Bat): void {
    if (this.items.length === 0) return;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    for (const s of this.items) {
      const dist = Math.hypot(s.x - bat.x, s.y - bat.y);
      const proxBase =
        dist < STINGER_AMBIENT_RANGE_PX
          ? STINGER_AMBIENT_MAX_ALPHA * (1 - dist / STINGER_AMBIENT_RANGE_PX)
          : 0;
      const pulse = 0.6 + 0.4 * Math.sin(now * 5.5 + s.phase);
      const proxAlpha = proxBase * pulse;

      const age = now - s.lastLitAt;
      const litAlpha =
        age >= 0 && age < FADE_SEC
          ? Math.pow(1 - age / FADE_SEC, 1.3)
          : 0;

      const alpha = Math.max(proxAlpha, litAlpha);
      if (alpha < 0.02) continue;

      // halo
      ctx.fillStyle = `rgba(255, 70, 90, ${alpha * 0.45})`;
      ctx.shadowColor = "rgba(255, 60, 80, 1)";
      ctx.shadowBlur = 22 * alpha;
      ctx.beginPath();
      ctx.arc(s.x, s.y, STINGER_RADIUS * (0.8 + 0.6 * alpha), 0, Math.PI * 2);
      ctx.fill();

      // core
      ctx.fillStyle = `rgba(255, 180, 190, ${alpha})`;
      ctx.shadowBlur = 10 * alpha;
      ctx.beginPath();
      ctx.arc(s.x, s.y, STINGER_RADIUS * 0.45, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}
