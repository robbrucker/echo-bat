import { isHeld } from "./input";
import type { Canvas } from "./render";
import { PALETTE } from "./palette";
import {
  PING_FLASH_SEC,
  DASH_VY,
  DASH_COOLDOWN_SEC,
  DASH_ACTIVE_SEC,
} from "./tuning";

const ACCEL = 1400;
const MAX_SPEED = 360;
const DAMPING_PER_SEC = 6;
const FLAP_HZ = 4.5;

export class Bat {
  x: number;
  y: number;
  vy = 0;
  flapTime = 0;
  private flashTime = -Infinity;
  private dashCooldown = 0;
  private dashActiveUntil = -Infinity;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }

  flash(now: number): void {
    this.flashTime = now;
  }

  dash(now: number): boolean {
    if (this.dashCooldown > 0) return false;
    let dir = 0;
    if (isHeld("ArrowUp") || isHeld("KeyW")) dir = -1;
    else if (isHeld("ArrowDown") || isHeld("KeyS")) dir = 1;
    else dir = -1; // default upward
    this.vy = dir * DASH_VY;
    this.dashCooldown = DASH_COOLDOWN_SEC;
    this.dashActiveUntil = now + DASH_ACTIVE_SEC;
    this.flash(now);
    return true;
  }

  isDashing(now: number): boolean {
    return now < this.dashActiveUntil;
  }

  update(dt: number, canvas: Canvas): void {
    this.dashCooldown = Math.max(0, this.dashCooldown - dt);

    let input = 0;
    if (isHeld("ArrowUp") || isHeld("KeyW")) input -= 1;
    if (isHeld("ArrowDown") || isHeld("KeyS")) input += 1;

    const speedCap = Math.max(MAX_SPEED, Math.abs(this.vy));
    if (input !== 0) {
      this.vy += input * ACCEL * dt;
      if (this.vy > speedCap) this.vy = speedCap;
      if (this.vy < -speedCap) this.vy = -speedCap;
    } else {
      this.vy -= this.vy * Math.min(1, DAMPING_PER_SEC * dt);
    }

    this.y += this.vy * dt;
    this.flapTime += dt;

    const margin = 20;
    if (this.y < margin) {
      this.y = margin;
      this.vy = 0;
    }
    if (this.y > canvas.height - margin) {
      this.y = canvas.height - margin;
      this.vy = 0;
    }
  }

  draw(ctx: CanvasRenderingContext2D, now: number): void {
    const flashAge = now - this.flashTime;
    const flashStrength =
      flashAge >= 0 && flashAge <= PING_FLASH_SEC
        ? Math.pow(1 - flashAge / PING_FLASH_SEC, 1.5)
        : 0;

    const tilt = Math.max(-0.35, Math.min(0.35, this.vy / 550));
    const flap = Math.sin(this.flapTime * Math.PI * 2 * FLAP_HZ);
    const wingSpread = 1 + flap * 0.28;

    ctx.save();
    ctx.translate(this.x, this.y);

    // base aura
    ctx.save();
    ctx.fillStyle = PALETTE.batGlow;
    ctx.shadowColor = PALETTE.batGlow;
    ctx.shadowBlur = 24;
    ctx.beginPath();
    ctx.arc(0, 0, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // flash burst when pinging
    if (flashStrength > 0.01) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = `rgba(200, 240, 255, ${flashStrength * 0.55})`;
      ctx.shadowColor = "rgba(180, 230, 255, 1)";
      ctx.shadowBlur = 40 * flashStrength;
      ctx.beginPath();
      ctx.arc(0, 0, 14 + 20 * flashStrength, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.rotate(tilt);

    ctx.fillStyle = PALETTE.bat;
    ctx.shadowColor = PALETTE.bat;
    ctx.shadowBlur = 6;

    ctx.beginPath();
    ctx.moveTo(9, 0);
    ctx.lineTo(-5, -3.5);
    ctx.lineTo(-5, 3.5);
    ctx.closePath();
    ctx.fill();

    ctx.save();
    ctx.scale(1, wingSpread);
    ctx.beginPath();
    ctx.moveTo(-1, -2.5);
    ctx.lineTo(-13, -9);
    ctx.lineTo(-9, -1);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(-1, 2.5);
    ctx.lineTo(-13, 9);
    ctx.lineTo(-9, 1);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.restore();
  }
}
