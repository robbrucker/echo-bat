import type { Bat } from "./bat";
import type { Cave } from "./cave";
import type { Canvas } from "./render";
import { stampArrival, type Ping } from "./sonar";
import {
  POWERUP_FIRST_AT,
  POWERUP_MIN_SPAWN_GAP,
  POWERUP_MAX_SPAWN_GAP,
  POWERUP_PICKUP_RADIUS,
  POWERUP_AMBIENT_RANGE_PX,
  POWERUP_AMBIENT_MAX_ALPHA,
} from "./tuning";

export type PowerupKind = "slow" | "magnet";

type Powerup = {
  kind: PowerupKind;
  x: number;
  baseY: number;
  y: number;
  phase: number;
  spin: number;
  lastLitAt: number;
};

const FADE_SEC = 1.1;

const SPRITE_SIZE = 130;
const sprites: Record<PowerupKind, { img: HTMLImageElement | null; failed: boolean }> = {
  slow: { img: null, failed: false },
  magnet: { img: null, failed: false },
};
const SPRITE_PATH: Record<PowerupKind, string> = {
  slow: "/assets/sprites/powerup_slow.png",
  magnet: "/assets/sprites/powerup_magnet.png",
};

function getPowerupSprite(kind: PowerupKind): HTMLImageElement | null {
  const slot = sprites[kind];
  if (slot.img) return slot.img.complete && slot.img.naturalWidth > 0 ? slot.img : null;
  if (slot.failed) return null;
  const img = new Image();
  img.onerror = (): void => {
    slot.failed = true;
  };
  img.src = SPRITE_PATH[kind];
  slot.img = img;
  return null;
}

export const POWERUP_COLOR: Record<
  PowerupKind,
  { halo: string; core: string; accent: string }
> = {
  slow: {
    halo: "180, 130, 255",
    core: "220, 190, 255",
    accent: "170, 110, 255",
  },
  magnet: {
    halo: "140, 255, 180",
    core: "200, 255, 220",
    accent: "110, 220, 150",
  },
};

export class Powerups {
  items: Powerup[] = [];
  private spawnedDistance = 0;
  private nextSpawnAt = POWERUP_FIRST_AT;
  private spinTime = 0;

  clear(): void {
    this.items.length = 0;
    this.spawnedDistance = 0;
    this.nextSpawnAt = POWERUP_FIRST_AT;
    this.spinTime = 0;
  }

  update(
    dt: number,
    now: number,
    canvas: Canvas,
    cave: Cave,
    bat: Bat,
    worldScrollPx: number,
    onPickup: (x: number, y: number, kind: PowerupKind) => void,
  ): void {
    this.spinTime += dt;

    this.spawnedDistance += worldScrollPx;
    if (worldScrollPx > 0 && this.spawnedDistance >= this.nextSpawnAt) {
      const spawnX = canvas.width + 60;
      const sample = cave.sampleAt(spawnX);
      if (sample) {
        const mid = (sample.ceilY + sample.floorY) * 0.5;
        const gap = sample.floorY - sample.ceilY;
        const safe = Math.max(40, gap * 0.3);
        const kind: PowerupKind = Math.random() < 0.5 ? "slow" : "magnet";
        this.items.push({
          kind,
          x: spawnX,
          baseY: mid + (Math.random() - 0.5) * safe * 1.2,
          y: mid,
          phase: Math.random() * Math.PI * 2,
          spin: Math.random() * Math.PI * 2,
          lastLitAt: -Infinity,
        });
      }
      this.spawnedDistance = 0;
      this.nextSpawnAt =
        POWERUP_MIN_SPAWN_GAP +
        Math.random() * (POWERUP_MAX_SPAWN_GAP - POWERUP_MIN_SPAWN_GAP);
    }

    for (const p of this.items) {
      p.x -= worldScrollPx;
      p.y = p.baseY + Math.sin(now * 1.2 + p.phase) * 8;
      p.spin += dt * 1.1;
    }

    for (let i = this.items.length - 1; i >= 0; i--) {
      const p = this.items[i]!;
      if (Math.hypot(p.x - bat.x, p.y - bat.y) < POWERUP_PICKUP_RADIUS) {
        this.items.splice(i, 1);
        onPickup(p.x, p.y, p.kind);
      }
    }

    for (let i = this.items.length - 1; i >= 0; i--) {
      if (this.items[i]!.x < -60) this.items.splice(i, 1);
    }
  }

  applySonar(pings: readonly Ping[], now: number): void {
    for (const p of this.items) {
      p.lastLitAt = stampArrival(pings, now, p.x, p.y, p.lastLitAt);
    }
  }

  draw(ctx: CanvasRenderingContext2D, now: number, bat: Bat): void {
    if (this.items.length === 0) return;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    for (const p of this.items) {
      const prox = Math.hypot(p.x - bat.x, p.y - bat.y);
      const ambient =
        prox < POWERUP_AMBIENT_RANGE_PX
          ? POWERUP_AMBIENT_MAX_ALPHA * (1 - prox / POWERUP_AMBIENT_RANGE_PX)
          : 0;
      const age = now - p.lastLitAt;
      const litAlpha =
        age >= 0 && age < FADE_SEC ? Math.pow(1 - age / FADE_SEC, 1.3) : 0;
      const base = Math.max(ambient, litAlpha);
      if (base < 0.03) continue;

      const pulse = 0.7 + 0.3 * Math.sin(now * 3 + p.phase);
      const alpha = Math.min(1, base * (0.8 + 0.3 * pulse));
      const col = POWERUP_COLOR[p.kind];

      const r = 14;

      const img = getPowerupSprite(p.kind);
      if (img) {
        // Pulse drives scale; spin keeps the existing rotation animation.
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.spin);
        ctx.scale(pulse, pulse);
        ctx.drawImage(
          img,
          -SPRITE_SIZE / 2,
          -SPRITE_SIZE / 2,
          SPRITE_SIZE,
          SPRITE_SIZE,
        );
        ctx.restore();
      } else {
        // outer glow hex
        ctx.fillStyle = `rgba(${col.halo}, ${alpha * 0.45})`;
        ctx.shadowColor = `rgba(${col.halo}, 1)`;
        ctx.shadowBlur = 36 * alpha;
        drawHex(ctx, p.x, p.y, r * 1.4 * pulse, p.spin);

        // crystal
        ctx.fillStyle = `rgba(${col.core}, ${alpha})`;
        ctx.shadowColor = `rgba(${col.accent}, 1)`;
        ctx.shadowBlur = 14 * alpha;
        drawHex(ctx, p.x, p.y, r * pulse, p.spin);

        // inner glyph
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.fillStyle = `rgba(30, 20, 50, ${alpha * 0.85})`;
        ctx.shadowBlur = 0;
        if (p.kind === "slow") drawSlowGlyph(ctx, r * 0.55);
        else drawMagnetGlyph(ctx, r * 0.6);
        ctx.restore();
      }
    }

    ctx.restore();
  }
}

function drawHex(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  rotation: number,
): void {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = rotation + (i * Math.PI) / 3;
    const x = cx + Math.cos(a) * radius;
    const y = cy + Math.sin(a) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

function drawSlowGlyph(ctx: CanvasRenderingContext2D, size: number): void {
  // hourglass: two stacked triangles pointing at each other
  ctx.beginPath();
  ctx.moveTo(-size, -size);
  ctx.lineTo(size, -size);
  ctx.lineTo(0, 0);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-size, size);
  ctx.lineTo(size, size);
  ctx.lineTo(0, 0);
  ctx.closePath();
  ctx.fill();
}

function drawMagnetGlyph(ctx: CanvasRenderingContext2D, size: number): void {
  // horseshoe: U-shape made of thick arc
  ctx.strokeStyle = ctx.fillStyle;
  ctx.lineWidth = size * 0.45;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.75, Math.PI, 0, true);
  ctx.stroke();
  // tips
  ctx.beginPath();
  ctx.moveTo(-size * 0.75, 0);
  ctx.lineTo(-size * 0.75, size * 0.4);
  ctx.moveTo(size * 0.75, 0);
  ctx.lineTo(size * 0.75, size * 0.4);
  ctx.stroke();
}
