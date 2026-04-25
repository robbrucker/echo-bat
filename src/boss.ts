import type { Bat } from "./bat";
import type { Cave } from "./cave";
import type { Canvas } from "./render";
import { stampArrival, type Ping } from "./sonar";
import {
  BOSS_SPAWN_INTERVAL_PX,
  BOSS_RADIUS,
  BOSS_HP,
  BOSS_DRIFT_FACTOR,
  BOSS_AMBIENT_ALPHA,
  BOSS_PULSE_HZ,
  BOSS_FLASH_SEC,
  BOSS_INVULN_SEC,
  BOSS_HIT_KNOCKBACK_PX,
  BOSS_PING_INTERVAL_SEC,
  BOSS_PING_SPEED,
  BOSS_PING_MAX_RADIUS,
  BOSS_PING_FADE_SEC,
  BOSS_BAT_COLLISION_RADIUS,
} from "./tuning";

// Boss sprite is much larger than BOSS_RADIUS — the creature's wingspan and
// tendrils extend well past the collision body so it reads as a real threat.
const SPRITE_SIZE = 200;
let spriteImg: HTMLImageElement | null = null;
let spriteFailed = false;

function getSprite(): HTMLImageElement | null {
  if (spriteImg) return spriteImg.complete && spriteImg.naturalWidth > 0 ? spriteImg : null;
  if (spriteFailed) return null;
  const img = new Image();
  img.onerror = (): void => {
    spriteFailed = true;
  };
  img.src = "/assets/sprites/boss.png";
  spriteImg = img;
  return null;
}

type BossPing = {
  originX: number;
  originY: number;
  startTime: number;
  lastRadius: number;
  hasHurt: boolean;
};

type BossState = {
  x: number;
  y: number;
  hp: number;
  lastLitAt: number;
  spawnedAt: number;
  invulnUntil: number;
  flashUntil: number;
  nextPingAt: number;
  comboAtSpawn: number;
};

export type BossHitResult =
  | { kind: "none" }
  | { kind: "hit"; x: number; y: number; hpRemaining: number }
  | { kind: "kill"; x: number; y: number; comboAtKill: number }
  | { kind: "batDies" };

export class Boss {
  private boss: BossState | null = null;
  private pings: BossPing[] = [];
  private distanceSinceLastSpawn = 0;
  private justSpawned = false;

  clear(): void {
    this.boss = null;
    this.pings.length = 0;
    this.distanceSinceLastSpawn = 0;
    this.justSpawned = false;
  }

  isAlive(): boolean {
    return this.boss !== null;
  }

  /**
   * Returns true exactly once when a boss spawn just happened (for playing intro sfx).
   * Caller should poll this after update().
   */
  consumeSpawnedFlag(): boolean {
    const v = this.justSpawned;
    this.justSpawned = false;
    return v;
  }

  update(
    dt: number,
    now: number,
    canvas: Canvas,
    cave: Cave,
    worldScrollPx: number,
    worldSpeed: number,
  ): void {
    void dt;

    // spawn scheduling
    if (worldScrollPx > 0) this.distanceSinceLastSpawn += worldScrollPx;

    if (
      this.boss === null &&
      !cave.inChamber &&
      this.distanceSinceLastSpawn >= BOSS_SPAWN_INTERVAL_PX
    ) {
      this.boss = {
        x: canvas.width + 100,
        y: canvas.height * 0.5,
        hp: BOSS_HP,
        lastLitAt: -Infinity,
        spawnedAt: now,
        invulnUntil: -Infinity,
        flashUntil: -Infinity,
        nextPingAt: now + BOSS_PING_INTERVAL_SEC,
        comboAtSpawn: 0,
      };
      this.pings.length = 0;
      this.distanceSinceLastSpawn = 0;
      this.justSpawned = true;
    }

    const b = this.boss;
    if (b) {
      // drift with world scroll + extra leftward motion (scrolls at 60% of world speed relative drift)
      // The world scrolls past at worldScrollPx per frame. Boss should move at 60% of world speed,
      // i.e. move left 60% of worldScrollPx relative to camera — meaning stays on screen longer.
      // With canvas-fixed coords, x should decrease by worldScrollPx * BOSS_DRIFT_FACTOR.
      void worldSpeed;
      b.x -= worldScrollPx * BOSS_DRIFT_FACTOR;

      // off-screen despawn
      if (b.x < -40) {
        this.boss = null;
        this.pings.length = 0;
        return;
      }

      // emit pings
      if (now >= b.nextPingAt) {
        this.pings.push({
          originX: b.x,
          originY: b.y,
          startTime: now,
          lastRadius: 0,
          hasHurt: false,
        });
        b.nextPingAt = now + BOSS_PING_INTERVAL_SEC;
      }
    }

    // update ping positions (they are anchored in world, so scroll with the world)
    for (const p of this.pings) {
      p.originX -= worldScrollPx;
    }

    // retire old pings
    for (let i = this.pings.length - 1; i >= 0; i--) {
      const p = this.pings[i]!;
      const r = (now - p.startTime) * BOSS_PING_SPEED;
      if (r > BOSS_PING_MAX_RADIUS + BOSS_PING_FADE_SEC * BOSS_PING_SPEED) {
        this.pings.splice(i, 1);
      }
    }
  }

  applySonar(pings: readonly Ping[], now: number): void {
    const b = this.boss;
    if (!b) return;
    b.lastLitAt = stampArrival(pings, now, b.x, b.y, b.lastLitAt);
  }

  /**
   * Returns true if a ping crossed over the bat this frame and bat is not dashing.
   * Marks the responsible ping as hasHurt so it can only damage once.
   */
  checkPingHitBat(bat: Bat, now: number): boolean {
    for (const p of this.pings) {
      if (p.hasHurt) continue;
      const prev = p.lastRadius;
      const curr = (now - p.startTime) * BOSS_PING_SPEED;
      p.lastRadius = curr;
      if (curr > BOSS_PING_MAX_RADIUS) {
        p.hasHurt = true;
        continue;
      }
      const dist = Math.hypot(bat.x - p.originX, bat.y - p.originY);
      if (dist >= prev && dist <= curr) {
        p.hasHurt = true;
        if (!bat.isDashing(now)) return true;
      }
    }
    return false;
  }

  /**
   * Resolve bat-boss physical collision. Returns a BossHitResult describing what happened.
   * - "none": no collision or boss invulnerable (safe non-event)
   * - "hit": bat damaged boss (boss still alive)
   * - "kill": bat damaged boss to 0 HP
   * - "batDies": bat touched boss without being in dash/dive — bat should crash
   */
  resolveBatCollision(bat: Bat, now: number, comboLevel: number): BossHitResult {
    const b = this.boss;
    if (!b) return { kind: "none" };
    const dist = Math.hypot(bat.x - b.x, bat.y - b.y);
    if (dist > BOSS_RADIUS + BOSS_BAT_COLLISION_RADIUS) return { kind: "none" };

    const isAttacking =
      bat.isDashing(now) || Math.abs(bat.vy) >= 260;

    if (!isAttacking) {
      return { kind: "batDies" };
    }

    // boss invulnerable window — bat bounces (treat as non-event so bat doesn't die)
    if (now < b.invulnUntil) return { kind: "none" };

    b.hp -= 1;
    b.invulnUntil = now + BOSS_INVULN_SEC;
    b.flashUntil = now + BOSS_FLASH_SEC;
    b.x += BOSS_HIT_KNOCKBACK_PX;

    if (b.hp <= 0) {
      const killX = b.x;
      const killY = b.y;
      b.comboAtSpawn = comboLevel; // unused but retained
      this.boss = null;
      this.pings.length = 0;
      return { kind: "kill", x: killX, y: killY, comboAtKill: comboLevel };
    }

    return { kind: "hit", x: b.x, y: b.y, hpRemaining: b.hp };
  }

  draw(ctx: CanvasRenderingContext2D, now: number, bat: Bat): void {
    // draw hostile ping rings first (under boss body)
    this.drawPings(ctx, now);

    const b = this.boss;
    if (!b) return;

    void bat;

    // reveal alpha (from sonar)
    const age = now - b.lastLitAt;
    const litAlpha =
      age >= 0 && age < BOSS_PING_FADE_SEC
        ? Math.pow(1 - age / BOSS_PING_FADE_SEC, 1.2)
        : 0;
    const ambient = BOSS_AMBIENT_ALPHA;
    const pulse = 0.88 + 0.12 * Math.sin(now * Math.PI * 2 * BOSS_PULSE_HZ);
    const alpha = Math.max(ambient * pulse, litAlpha);
    if (alpha < 0.02) return;

    const flashing = now < b.flashUntil;
    const flashT = flashing
      ? 1 - (now - (b.flashUntil - BOSS_FLASH_SEC)) / BOSS_FLASH_SEC
      : 0;
    const flashAmt = Math.max(0, Math.min(1, flashT));

    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    const img = getSprite();
    if (img) {
      // Sprite replaces the procedural orb. Pulse drives a subtle scale.
      // Alpha drives the sonar-lit fade. Black bg drops out under "lighter".
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.scale(pulse, pulse);
      ctx.globalAlpha = alpha;
      ctx.drawImage(
        img,
        -SPRITE_SIZE / 2,
        -SPRITE_SIZE / 2,
        SPRITE_SIZE,
        SPRITE_SIZE,
      );
      ctx.restore();
    } else {
      // Procedural fallback during the sprite load window.
      // Procedural fallback during the sprite load window.
      // outer halo
      ctx.fillStyle = `rgba(255, 100, 60, ${alpha * 0.4})`;
      ctx.shadowColor = "rgba(255, 110, 70, 1)";
      ctx.shadowBlur = 44 * alpha;
      ctx.beginPath();
      ctx.arc(b.x, b.y, BOSS_RADIUS * (1.05 + 0.15 * pulse), 0, Math.PI * 2);
      ctx.fill();

      // main body
      ctx.fillStyle = `rgba(255, 100, 60, ${alpha * 0.85})`;
      ctx.shadowColor = "rgba(255, 100, 60, 1)";
      ctx.shadowBlur = 28 * alpha;
      ctx.beginPath();
      ctx.arc(b.x, b.y, BOSS_RADIUS, 0, Math.PI * 2);
      ctx.fill();

      // core
      ctx.fillStyle = `rgba(255, 200, 160, ${alpha})`;
      ctx.shadowColor = "rgba(255, 220, 180, 1)";
      ctx.shadowBlur = 16 * alpha;
      ctx.beginPath();
      ctx.arc(b.x, b.y, BOSS_RADIUS * 0.45, 0, Math.PI * 2);
      ctx.fill();
    }

    // flash overlay
    if (flashAmt > 0.01) {
      ctx.fillStyle = `rgba(255, 255, 255, ${flashAmt * 0.85})`;
      ctx.shadowColor = "rgba(255, 255, 255, 1)";
      ctx.shadowBlur = 40 * flashAmt;
      ctx.beginPath();
      ctx.arc(b.x, b.y, BOSS_RADIUS * (1 + 0.15 * flashAmt), 0, Math.PI * 2);
      ctx.fill();
    }

    // HP pips above boss
    const pipR = 3;
    const pipGap = 10;
    const totalW = (BOSS_HP - 1) * pipGap;
    for (let i = 0; i < BOSS_HP; i++) {
      const lit = i < b.hp;
      const px = b.x - totalW * 0.5 + i * pipGap;
      const py = b.y - BOSS_RADIUS - 14;
      ctx.fillStyle = lit
        ? `rgba(255, 220, 180, ${alpha})`
        : `rgba(255, 100, 60, ${alpha * 0.35})`;
      ctx.shadowColor = lit ? "rgba(255, 200, 150, 1)" : "rgba(255, 80, 60, 1)";
      ctx.shadowBlur = lit ? 10 * alpha : 4 * alpha;
      ctx.beginPath();
      ctx.arc(px, py, pipR, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  private drawPings(ctx: CanvasRenderingContext2D, now: number): void {
    if (this.pings.length === 0) return;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const p of this.pings) {
      const elapsed = now - p.startTime;
      const r = elapsed * BOSS_PING_SPEED;
      if (r > BOSS_PING_MAX_RADIUS) continue;
      const t = r / BOSS_PING_MAX_RADIUS;
      const alpha = Math.pow(1 - t, 1.2) * 0.55;

      ctx.strokeStyle = `rgba(255, 90, 70, ${alpha})`;
      ctx.lineWidth = 4;
      ctx.shadowColor = "rgba(255, 80, 60, 1)";
      ctx.shadowBlur = 22;
      ctx.beginPath();
      ctx.arc(p.originX, p.originY, r, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = `rgba(255, 200, 180, ${alpha * 1.3})`;
      ctx.lineWidth = 1.4;
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(p.originX, p.originY, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
}
