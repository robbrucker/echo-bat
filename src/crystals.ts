import type { Bat } from "./bat";
import type { Cave } from "./cave";
import type { Canvas } from "./render";
import { stampArrival, type Ping } from "./sonar";
import {
  CRYSTAL_FIRST_AT,
  CRYSTAL_MIN_SPAWN_GAP,
  CRYSTAL_MAX_SPAWN_GAP,
  CRYSTAL_CHAMBER_SPAWN_BOOST,
  CRYSTAL_SIZE,
  CRYSTAL_HIT_RADIUS,
  CRYSTAL_AMBIENT_ALPHA,
  CRYSTAL_PROX_ALPHA,
  CRYSTAL_PROX_RANGE_PX,
  CRYSTAL_BOB_AMP,
  CRYSTAL_BOB_HZ,
  CRYSTAL_FADE_SEC,
} from "./tuning";

export type CrystalAttach = "ceiling" | "floor";

export type Crystal = {
  x: number;
  /** y of the anchor point on the wall (the base of the crystal). */
  anchorY: number;
  /** y of the crystal tip (center), with bob applied in update(). */
  tipY: number;
  attach: CrystalAttach;
  phase: number;
  lastLitAt: number;
};

export class Crystals {
  items: Crystal[] = [];
  private spawnedDistance = 0;
  private nextSpawnAt = CRYSTAL_FIRST_AT;

  clear(): void {
    this.items.length = 0;
    this.spawnedDistance = 0;
    this.nextSpawnAt = CRYSTAL_FIRST_AT;
  }

  update(
    dt: number,
    now: number,
    canvas: Canvas,
    cave: Cave,
    bat: Bat,
    worldScrollPx: number,
    chamberBoost: boolean,
    onShatter: (x: number, y: number) => void,
  ): void {
    void dt;

    const boost = chamberBoost ? CRYSTAL_CHAMBER_SPAWN_BOOST : 1;
    this.spawnedDistance += worldScrollPx * boost;
    if (worldScrollPx > 0 && this.spawnedDistance >= this.nextSpawnAt) {
      const spawnX = canvas.width + 30;
      const sample = cave.sampleAt(spawnX);
      if (sample) {
        const attach: CrystalAttach = Math.random() < 0.5 ? "ceiling" : "floor";
        const anchorY = attach === "ceiling" ? sample.ceilY : sample.floorY;
        this.items.push({
          x: spawnX,
          anchorY,
          tipY: anchorY + (attach === "ceiling" ? CRYSTAL_SIZE : -CRYSTAL_SIZE),
          attach,
          phase: Math.random() * Math.PI * 2,
          lastLitAt: -Infinity,
        });
      }
      this.spawnedDistance = 0;
      this.nextSpawnAt =
        CRYSTAL_MIN_SPAWN_GAP +
        Math.random() * (CRYSTAL_MAX_SPAWN_GAP - CRYSTAL_MIN_SPAWN_GAP);
    }

    // scroll + bob
    for (const c of this.items) {
      c.x -= worldScrollPx;
      const inward = c.attach === "ceiling" ? 1 : -1;
      const bob =
        Math.sin(now * Math.PI * 2 * CRYSTAL_BOB_HZ + c.phase) *
        CRYSTAL_BOB_AMP;
      // tip sits CRYSTAL_SIZE inward from anchor, plus a small bob along the inward axis
      c.tipY = c.anchorY + inward * (CRYSTAL_SIZE + bob);
    }

    // collision check (against the tip — that's the reachable part)
    for (let i = this.items.length - 1; i >= 0; i--) {
      const c = this.items[i]!;
      const d = Math.hypot(c.x - bat.x, c.tipY - bat.y);
      if (d < CRYSTAL_HIT_RADIUS) {
        const shatterX = c.x;
        const shatterY = c.tipY;
        this.items.splice(i, 1);
        onShatter(shatterX, shatterY);
      }
    }

    // offscreen cull
    for (let i = this.items.length - 1; i >= 0; i--) {
      if (this.items[i]!.x < -30) this.items.splice(i, 1);
    }
  }

  applySonar(pings: readonly Ping[], now: number): void {
    for (const c of this.items) {
      c.lastLitAt = stampArrival(pings, now, c.x, c.tipY, c.lastLitAt);
    }
  }

  draw(ctx: CanvasRenderingContext2D, now: number, bat: Bat): void {
    if (this.items.length === 0) return;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    for (const c of this.items) {
      const dist = Math.hypot(c.x - bat.x, c.tipY - bat.y);
      const proxT =
        dist < CRYSTAL_PROX_RANGE_PX
          ? 1 - dist / CRYSTAL_PROX_RANGE_PX
          : 0;
      const proxAlpha =
        CRYSTAL_AMBIENT_ALPHA +
        (CRYSTAL_PROX_ALPHA - CRYSTAL_AMBIENT_ALPHA) * proxT;

      const age = now - c.lastLitAt;
      const litAlpha =
        age >= 0 && age < CRYSTAL_FADE_SEC
          ? Math.pow(1 - age / CRYSTAL_FADE_SEC, 1.3)
          : 0;

      const alpha = Math.max(proxAlpha, litAlpha);
      if (alpha < 0.02) continue;

      // subtle twinkle on the proximity portion
      const twinkle = 0.9 + 0.1 * Math.sin(now * 4.2 + c.phase);
      const a = Math.min(1, alpha * twinkle);

      const inward = c.attach === "ceiling" ? 1 : -1;
      const longAxis = CRYSTAL_SIZE; // pointing into the cave gap
      const shortAxis = CRYSTAL_SIZE * 0.42;

      // diamond: anchor on wall, tip into the gap, two side points at the mid
      const cx = c.x;
      const anchorY = c.anchorY;
      const tipY = c.tipY;
      const midY = anchorY + inward * longAxis * 0.5;

      ctx.save();

      // outer glow halo (wider when lit by sonar)
      ctx.fillStyle = `rgba(255, 220, 140, ${a * 0.22})`;
      ctx.shadowColor = "rgba(255, 210, 120, 1)";
      ctx.shadowBlur = 18 * a;
      ctx.beginPath();
      ctx.arc(cx, (anchorY + tipY) * 0.5, longAxis * 1.1, 0, Math.PI * 2);
      ctx.fill();

      // diamond fill
      ctx.beginPath();
      ctx.moveTo(cx, anchorY);               // base on wall
      ctx.lineTo(cx + shortAxis, midY);      // right shoulder
      ctx.lineTo(cx, tipY);                  // tip into gap
      ctx.lineTo(cx - shortAxis, midY);      // left shoulder
      ctx.closePath();

      ctx.fillStyle = `rgba(255, 220, 140, ${a})`;
      ctx.shadowColor = "rgba(255, 210, 120, 1)";
      ctx.shadowBlur = 12 * a;
      ctx.fill();

      // cyan rim
      ctx.strokeStyle = `rgba(170, 255, 240, ${a})`;
      ctx.lineWidth = 1.4;
      ctx.shadowColor = "rgba(150, 240, 255, 1)";
      ctx.shadowBlur = 8 * a;
      ctx.stroke();

      // bright inner highlight (small pale triangle near the tip)
      ctx.beginPath();
      ctx.moveTo(cx, tipY);
      ctx.lineTo(cx + shortAxis * 0.4, midY + inward * longAxis * 0.12);
      ctx.lineTo(cx - shortAxis * 0.4, midY + inward * longAxis * 0.12);
      ctx.closePath();
      ctx.fillStyle = `rgba(255, 250, 220, ${a * 0.85})`;
      ctx.shadowBlur = 0;
      ctx.fill();

      ctx.restore();
    }

    ctx.restore();
  }
}
