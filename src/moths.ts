import type { Bat } from "./bat";
import type { Cave } from "./cave";
import type { Canvas } from "./render";
import { stampArrival, type Ping } from "./sonar";
import {
  MOTH_FIRST_AT,
  MOTH_MIN_SPAWN_GAP,
  MOTH_MAX_SPAWN_GAP,
  MOTH_PICKUP_RADIUS,
  MOTH_AMBIENT_RANGE_PX,
  MOTH_AMBIENT_MAX_ALPHA,
} from "./tuning";

type Moth = {
  x: number;
  baseY: number;
  y: number;
  vyAmp: number;
  vyHz: number;
  xWobble: number;
  xPhase: number;
  phase: number;
  flapTime: number;
  lastLitAt: number;
};

const FADE_SEC = 1.0;

const SPRITE_SIZE = 96;
let spriteImg: HTMLImageElement | null = null;
let spriteFailed = false;

// Moths use the procedural draw — sprite path disabled per design.
function getSprite(): HTMLImageElement | null {
  void spriteImg;
  void spriteFailed;
  void SPRITE_SIZE;
  return null;
}

export class Moths {
  items: Moth[] = [];
  private spawnedDistance = 0;
  private nextSpawnAt = MOTH_FIRST_AT;

  clear(): void {
    this.items.length = 0;
    this.spawnedDistance = 0;
    this.nextSpawnAt = MOTH_FIRST_AT;
  }

  update(
    dt: number,
    now: number,
    canvas: Canvas,
    cave: Cave,
    bat: Bat,
    worldScrollPx: number,
    magnetActive: boolean,
    magnetRange: number,
    magnetPullSpeed: number,
    onPickup: (x: number, y: number) => void,
  ): void {
    this.spawnedDistance += worldScrollPx;
    if (worldScrollPx > 0 && this.spawnedDistance >= this.nextSpawnAt) {
      const spawnX = canvas.width + 50;
      const sample = cave.sampleAt(spawnX);
      if (sample) {
        const mid = (sample.ceilY + sample.floorY) * 0.5;
        const gap = sample.floorY - sample.ceilY;
        const safe = Math.max(40, gap * 0.38);
        this.items.push({
          x: spawnX,
          baseY: mid + (Math.random() - 0.5) * safe * 1.4,
          y: mid,
          vyAmp: 28 + Math.random() * 36,
          vyHz: 0.45 + Math.random() * 0.55,
          xWobble: 12 + Math.random() * 16,
          xPhase: Math.random() * Math.PI * 2,
          phase: Math.random() * Math.PI * 2,
          flapTime: Math.random() * 10,
          lastLitAt: -Infinity,
        });
      }
      this.spawnedDistance = 0;
      this.nextSpawnAt =
        MOTH_MIN_SPAWN_GAP +
        Math.random() * (MOTH_MAX_SPAWN_GAP - MOTH_MIN_SPAWN_GAP);
    }

    for (const m of this.items) {
      m.x -= worldScrollPx;
      m.y = m.baseY + Math.sin(now * Math.PI * 2 * m.vyHz + m.phase) * m.vyAmp;
      m.flapTime += dt;

      if (magnetActive) {
        const dx = bat.x - m.x;
        const dy = bat.y - m.y;
        const d = Math.hypot(dx, dy);
        if (d > 0.5 && d < magnetRange) {
          const pull = magnetPullSpeed * dt * (1 - d / magnetRange);
          m.x += (dx / d) * pull;
          m.baseY += (dy / d) * pull;
        }
      }
    }

    for (let i = this.items.length - 1; i >= 0; i--) {
      const m = this.items[i]!;
      if (Math.hypot(m.x - bat.x, m.y - bat.y) < MOTH_PICKUP_RADIUS) {
        this.items.splice(i, 1);
        onPickup(m.x, m.y);
      }
    }

    for (let i = this.items.length - 1; i >= 0; i--) {
      if (this.items[i]!.x < -40) this.items.splice(i, 1);
    }
  }

  applySonar(pings: readonly Ping[], now: number): void {
    for (const m of this.items) {
      m.lastLitAt = stampArrival(pings, now, m.x, m.y, m.lastLitAt);
    }
  }

  draw(ctx: CanvasRenderingContext2D, now: number, bat: Bat): void {
    if (this.items.length === 0) return;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    for (const m of this.items) {
      const prox = Math.hypot(m.x - bat.x, m.y - bat.y);
      const ambientAlpha =
        prox < MOTH_AMBIENT_RANGE_PX
          ? MOTH_AMBIENT_MAX_ALPHA * (1 - prox / MOTH_AMBIENT_RANGE_PX)
          : 0;

      const age = now - m.lastLitAt;
      const litAlpha =
        age >= 0 && age < FADE_SEC ? Math.pow(1 - age / FADE_SEC, 1.3) : 0;
      const alpha = Math.max(ambientAlpha, litAlpha);
      if (alpha < 0.02) continue;

      const flap = Math.sin(m.flapTime * Math.PI * 2 * 6.5);
      const wingY = 1 + flap * 0.45;

      ctx.save();
      ctx.translate(m.x, m.y);

      const img = getSprite();
      if (img) {
        // wingY drives a vertical squash so the flap animation reads on the sprite.
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.scale(1, wingY);
        ctx.drawImage(
          img,
          -SPRITE_SIZE / 2,
          -SPRITE_SIZE / 2,
          SPRITE_SIZE,
          SPRITE_SIZE,
        );
        ctx.restore();
      } else {
        // halo
        ctx.fillStyle = `rgba(255, 180, 210, ${alpha * 0.5})`;
        ctx.shadowColor = "rgba(255, 140, 180, 1)";
        ctx.shadowBlur = 26 * alpha;
        ctx.beginPath();
        ctx.arc(0, 0, 10 + 4 * alpha, 0, Math.PI * 2);
        ctx.fill();

        // wings (two triangles, flapping)
        ctx.fillStyle = `rgba(255, 210, 170, ${alpha})`;
        ctx.shadowBlur = 10 * alpha;
        ctx.save();
        ctx.scale(1, wingY);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-9, -7);
        ctx.lineTo(-5, -2);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(9, -7);
        ctx.lineTo(5, -2);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-9, 7);
        ctx.lineTo(-5, 2);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(9, 7);
        ctx.lineTo(5, 2);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        // body core
        ctx.fillStyle = `rgba(255, 240, 220, ${alpha})`;
        ctx.shadowBlur = 6 * alpha;
        ctx.beginPath();
        ctx.arc(0, 0, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }

    ctx.restore();
  }
}
