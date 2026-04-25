import { isHeld } from "./input";
import type { Canvas } from "./render";
import { PALETTE } from "./palette";
import { getTiltSteer } from "./tilt";
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

// Drawn size of the bat sprite. The PNG occupies ~60% of its 1024px frame, so
// at 52px the visible creature reads ~31px wide — bigger than the original
// procedural 22px, the painted detail can carry the screen.
const SPRITE_SIZE = 52;
const AURA_RADIUS = 14;
const AURA_BLUR = 36;
const TRAIL_LEN = 10;
const TRAIL_SAMPLE_EVERY = 2; // every other update frame
let spriteImg: HTMLImageElement | null = null;
let spriteFailed = false;

function getSprite(): HTMLImageElement | null {
  if (spriteImg) return spriteImg.complete && spriteImg.naturalWidth > 0 ? spriteImg : null;
  if (spriteFailed) return null;
  const img = new Image();
  img.onerror = (): void => {
    spriteFailed = true;
  };
  img.src = "/assets/sprites/bat.png";
  spriteImg = img;
  return null;
}

type TrailSample = { y: number; tilt: number };

export class Bat {
  x: number;
  y: number;
  vy = 0;
  flapTime = 0;
  private flashTime = -Infinity;
  private dashCooldown = 0;
  private dashActiveUntil = -Infinity;
  private trail: TrailSample[] = [];
  private trailTick = 0;

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
    const tilt = getTiltSteer();
    if (Math.abs(tilt) > 0.15) dir = tilt < 0 ? -1 : 1;
    else if (isHeld("ArrowUp") || isHeld("KeyW")) dir = -1;
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

    // Analog tilt overrides keyboard when present, so a small phone tilt
    // produces a small input — no more "binary key held = max accel".
    let input = 0;
    const tilt = getTiltSteer();
    if (Math.abs(tilt) > 0.01) {
      input = tilt;
    } else {
      if (isHeld("ArrowUp") || isHeld("KeyW")) input -= 1;
      if (isHeld("ArrowDown") || isHeld("KeyS")) input += 1;
    }

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

    this.trailTick++;
    if (this.trailTick % TRAIL_SAMPLE_EVERY === 0) {
      const tilt = Math.max(-0.35, Math.min(0.35, this.vy / 550));
      this.trail.push({ y: this.y, tilt });
      if (this.trail.length > TRAIL_LEN) this.trail.shift();
    }

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

    // sonar wake — fading echoes of recent positions, drawn before the main bat
    // so they sit behind it. Stronger when dashing.
    const dashing = this.isDashing(now);
    const trailBoost = dashing ? 1.4 : 1;
    const N = this.trail.length;
    if (N > 0) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < N; i++) {
        const t = (i + 1) / N; // 0..1, newest = 1
        const sample = this.trail[i]!;
        const alpha = Math.pow(t, 1.6) * 0.18 * trailBoost;
        const r = (3 + 4 * t) * trailBoost;
        ctx.fillStyle = `rgba(180, 230, 255, ${alpha})`;
        ctx.shadowColor = "rgba(150, 220, 255, 1)";
        ctx.shadowBlur = 16 * t * trailBoost;
        ctx.beginPath();
        ctx.arc(this.x, sample.y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    ctx.translate(this.x, this.y);

    // base aura
    ctx.save();
    ctx.fillStyle = PALETTE.batGlow;
    ctx.shadowColor = PALETTE.batGlow;
    ctx.shadowBlur = AURA_BLUR;
    ctx.beginPath();
    ctx.arc(0, 0, AURA_RADIUS, 0, Math.PI * 2);
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

    const img = getSprite();
    if (img) {
      // Black background of the source PNG drops out under "lighter" — no
      // alpha-channel preprocessing needed. Vertical squash drives the flap.
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.scale(1, wingSpread);
      ctx.drawImage(
        img,
        -SPRITE_SIZE / 2,
        -SPRITE_SIZE / 2,
        SPRITE_SIZE,
        SPRITE_SIZE,
      );
      ctx.restore();
    } else {
      // Procedural fallback while the sprite loads (also runs if it fails).
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
    }

    ctx.restore();
  }
}
