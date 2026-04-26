import { Bat } from "./bat";
import { Cave } from "./cave";
import { checkCollision } from "./collision";
import { wasPressed } from "./input";
import { drawVignette, type Canvas } from "./render";
import { ParticleField } from "./particles";
import { Sonar } from "./sonar";
import { Fireflies, type FireflyKind } from "./fireflies";
import { Moths } from "./moths";
import { Stingers } from "./stingers";
import { Boss } from "./boss";
import { Crystals } from "./crystals";
import { Powerups, type PowerupKind } from "./powerups";
import { Sparks } from "./fx";
import { Combo } from "./combo";
import {
  drawHud,
  drawMenuOverlay,
  drawCrashOverlay,
  drawMilestone,
  drawCrashFlash,
  drawBiomeBoom,
  drawPowerupIndicators,
  drawSlowTint,
} from "./hud";
import { loadBest, saveBest, formatMeters } from "./score";
import { updateTheme, resetTheme, biomeAt, BIOMES, type BiomeName } from "./biomes";
import { recalibrateTilt } from "./tilt";
import {
  playPing,
  playCrash,
  playChime,
  playGoldenChime,
  playMilestone,
  playNearMiss,
  playStingerKill,
  playPowerup,
  playDash,
  playBossIntro,
  playBossPing,
  playBossHit,
  playBossKill,
  playCrystalShatter,
  playBiomeBoom,
} from "./audio";
import {
  START_WORLD_SPEED,
  MAX_WORLD_SPEED,
  DIFFICULTY_FULL_DISTANCE,
  SPEED_ACCEL_PER_PX,
  CAVE_START_MIN_GAP,
  CAVE_END_MIN_GAP,
  CAVE_START_NOISE,
  CAVE_END_NOISE,
  MENU_DRIFT_FACTOR,
  MENU_AUTO_PING_SEC,
  CHAMBER_SPAWN_MULTIPLIER,
  NEAR_MISS_MIN_PX,
  NEAR_MISS_MAX_PX,
  NEAR_MISS_BONUS,
  FIREFLY_BASE_BONUS,
  GOLDEN_BASE_BONUS,
  GOLDEN_CHANCE_MIN,
  GOLDEN_CHANCE_MAX,
  GOLDEN_CHANCE_RAMP_PX,
  MOTH_BASE_BONUS,
  DIVE_KILL_MIN_VY,
  DIVE_KILL_BONUS,
  SLOW_FACTOR,
  SLOW_DURATION_SEC,
  MAGNET_DURATION_SEC,
  MAGNET_RANGE_PX,
  MAGNET_PULL_SPEED,
  BOSS_HIT_BONUS,
  BOSS_KILL_BONUS,
  BOSS_PING_INTERVAL_SEC,
  CRYSTAL_BASE_BONUS,
} from "./tuning";

export type State = "menu" | "playing" | "dead";

const SHAKE_DECAY = 7;
const DEATH_RESTART_GRACE = 0.45;
const MILESTONE_INTERVAL_PX = 1000;

const POWERUP_DURATIONS: Record<PowerupKind, number> = {
  slow: SLOW_DURATION_SEC,
  magnet: MAGNET_DURATION_SEC,
};

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export class Game {
  state: State = "menu";
  bat: Bat;
  cave: Cave;
  sonar: Sonar;
  fireflies: Fireflies;
  moths: Moths;
  stingers: Stingers;
  boss: Boss;
  crystals: Crystals;
  powerups: Powerups;
  sparks: Sparks;
  particles: ParticleField;
  combo: Combo;
  distance = 0;
  best: number;
  isNewBest = false;
  deadTime = 0;
  shake = 0;
  time = 0;
  uiTime = 0;
  powerupUntil: Record<PowerupKind, number> = { slow: -Infinity, magnet: -Infinity };
  private lastAutoPing = 0;
  private lastMilestone = 0;
  private milestoneAt = -Infinity;
  private milestoneText = "";
  private crashFlashAt = -Infinity;
  private biomeBoomAt = -Infinity;
  private biomeBoomColor = "200, 220, 255";
  private inNearMissZone = false;
  private lastBiome: BiomeName = "abyss";
  private lastBossPingSfx = -Infinity;

  constructor(private canvas: Canvas) {
    const batX = canvas.width * 0.28;
    this.bat = new Bat(batX, canvas.height * 0.5);
    this.cave = new Cave(canvas, batX);
    this.sonar = new Sonar();
    this.fireflies = new Fireflies();
    this.moths = new Moths();
    this.stingers = new Stingers();
    this.boss = new Boss();
    this.crystals = new Crystals();
    this.powerups = new Powerups();
    this.sparks = new Sparks();
    this.combo = new Combo();
    this.particles = new ParticleField(canvas);
    this.best = loadBest();
  }

  private difficulty(): number {
    return Math.min(1, this.distance / DIFFICULTY_FULL_DISTANCE);
  }

  private goldenChance(): number {
    const t = Math.min(1, this.distance / GOLDEN_CHANCE_RAMP_PX);
    return lerp(GOLDEN_CHANCE_MIN, GOLDEN_CHANCE_MAX, t);
  }

  private caveProfile(): { speed: number; minGap: number; noiseStep: number } {
    const d = this.difficulty();
    const baseSpeed = lerp(START_WORLD_SPEED, MAX_WORLD_SPEED, d);
    const extra =
      Math.max(0, this.distance - DIFFICULTY_FULL_DISTANCE) * SPEED_ACCEL_PER_PX;
    return {
      speed: baseSpeed + extra,
      minGap: lerp(CAVE_START_MIN_GAP, CAVE_END_MIN_GAP, d),
      noiseStep: lerp(CAVE_START_NOISE, CAVE_END_NOISE, d),
    };
  }

  private isActive(kind: PowerupKind): boolean {
    return this.powerupUntil[kind] > this.uiTime;
  }

  private startPlaying(): void {
    const batX = this.canvas.width * 0.28;
    this.bat = new Bat(batX, this.canvas.height * 0.5);
    this.cave.reset(this.canvas, batX, CAVE_START_MIN_GAP, CAVE_START_NOISE);
    this.sonar.clear();
    this.fireflies.clear();
    this.moths.clear();
    this.stingers.clear();
    this.boss.clear();
    this.crystals.clear();
    this.powerups.clear();
    this.sparks.clear();
    this.combo.clear();
    this.distance = 0;
    this.deadTime = 0;
    this.isNewBest = false;
    this.lastMilestone = 0;
    this.milestoneAt = -Infinity;
    this.crashFlashAt = -Infinity;
    this.biomeBoomAt = -Infinity;
    this.inNearMissZone = false;
    this.powerupUntil = { slow: -Infinity, magnet: -Infinity };
    resetTheme();
    // Reset tilt neutral so the player's current posture becomes the new
    // zero — useful after a crash where they may have shifted hands.
    recalibrateTilt();
    this.lastBiome = "abyss";
    this.lastBossPingSfx = -Infinity;
    this.state = "playing";
  }

  update(dt: number): void {
    this.uiTime += dt;
    const timeScale = this.isActive("slow") ? SLOW_FACTOR : 1;
    const gameDt = dt * timeScale;
    this.time += gameDt;

    updateTheme(this.distance);
    const currentBiome = biomeAt(this.distance);
    if (this.state === "playing" && currentBiome !== this.lastBiome) {
      this.announceBiome(currentBiome);
      this.lastBiome = currentBiome;
    }

    this.particles.update(gameDt, this.canvas);
    this.shake *= Math.max(0, 1 - SHAKE_DECAY * dt);
    this.combo.tick(this.time);

    if (this.state === "menu") this.updateMenu(gameDt);
    else if (this.state === "playing") this.updatePlaying(gameDt);
    else this.updateDead(gameDt);
  }

  private announceBiome(name: BiomeName): void {
    const label = `ENTERING ${name.toUpperCase()}`;
    const x = this.canvas.width * 0.5;
    const y = this.canvas.height * 0.35;
    const color = name === "ember" ? "gold" : "cyan";
    this.fireflies.addPop(label, x, y, color, this.time, 1);

    this.biomeBoomAt = this.uiTime;
    this.biomeBoomColor = BIOMES[name].wallHalo;
    this.shake = Math.max(this.shake, 14);
    const sparkColor = name === "ember" ? "gold" : name === "void" ? "pink" : "cyan";
    this.sparks.burst(x, y, this.time, 36, sparkColor, 320);
    this.sparks.burst(x, y, this.time, 18, "gold", 220);
    playBiomeBoom();
  }

  private handleFireflyPickup(x: number, y: number, kind: FireflyKind): void {
    const level = this.combo.hit(this.time);
    const base = kind === "golden" ? GOLDEN_BASE_BONUS : FIREFLY_BASE_BONUS;
    const bonus = base * level;
    this.distance += bonus;
    const suffix = level > 1 ? ` x${level}` : "";
    const color = kind === "golden" ? "pink" : "gold";
    this.fireflies.addPop(
      `+${Math.floor(bonus / 10)}${suffix}`,
      x,
      y,
      color,
      this.time,
      level,
    );
    if (kind === "golden") {
      playGoldenChime();
      this.sparks.burst(x, y, this.time, 28, "pink", 260);
      this.sparks.burst(x, y, this.time, 14, "gold", 180);
      this.shake = Math.max(this.shake, 8);
    } else {
      playChime(level);
      this.sparks.burst(x, y, this.time, 14, "gold", 180);
    }
  }

  private handleMothPickup(x: number, y: number): void {
    const level = this.combo.hit(this.time);
    const bonus = MOTH_BASE_BONUS * level;
    this.distance += bonus;
    const suffix = level > 1 ? ` x${level}` : "";
    this.fireflies.addPop(
      `+${Math.floor(bonus / 10)}${suffix}`,
      x,
      y,
      "gold",
      this.time,
      level,
    );
    playChime(level);
    this.sparks.burst(x, y, this.time, 20, "gold", 220);
  }

  private handleCrystalShatter(x: number, y: number): void {
    const level = this.combo.hit(this.time);
    const bonus = CRYSTAL_BASE_BONUS * level;
    this.distance += bonus;
    const suffix = level > 1 ? ` x${level}` : "";
    this.fireflies.addPop(
      `+${Math.floor(bonus / 10)}${suffix}`,
      x,
      y,
      "gold",
      this.time,
      level,
    );
    this.sparks.burst(x, y, this.time, 10, "gold", 180);
    playCrystalShatter();
  }

  private handleStingerKill(x: number, y: number): void {
    const level = this.combo.hit(this.time);
    const bonus = DIVE_KILL_BONUS * level;
    this.distance += bonus;
    const suffix = level > 1 ? ` x${level}` : "";
    this.fireflies.addPop(
      `KILL +${Math.floor(bonus / 10)}${suffix}`,
      x,
      y - 8,
      "cyan",
      this.time,
      level,
    );
    this.sparks.burst(x, y, this.time, 18, "red", 240);
    this.sparks.burst(x, y, this.time, 10, "gold", 180);
    this.shake = Math.max(this.shake, 10);
    playStingerKill();
  }

  private handlePowerupPickup(x: number, y: number, kind: PowerupKind): void {
    this.powerupUntil[kind] = this.uiTime + POWERUP_DURATIONS[kind];
    const label = kind === "slow" ? "SLOW-MO" : "MAGNET";
    this.fireflies.addPop(label, x, y, kind === "slow" ? "cyan" : "gold", this.time);
    const sparkColor = kind === "slow" ? "cyan" : "gold";
    this.sparks.burst(x, y, this.time, 22, sparkColor, 240);
    this.sparks.burst(x, y, this.time, 14, "pink", 180);
    this.shake = Math.max(this.shake, 10);
    playPowerup(kind);
  }

  private updateMenu(gameDt: number): void {
    this.bat.flapTime += gameDt;
    this.bat.y = this.canvas.height * 0.5 + Math.sin(this.time * 1.5) * 10;

    const drift = START_WORLD_SPEED * MENU_DRIFT_FACTOR;
    const scrollPx = drift * gameDt;
    this.cave.update(gameDt, this.canvas, drift, CAVE_START_MIN_GAP, CAVE_START_NOISE);

    if (this.time - this.lastAutoPing > MENU_AUTO_PING_SEC) {
      if (this.sonar.emit(this.bat, this.time)) {
        this.bat.flash(this.time);
        playPing();
      }
      this.lastAutoPing = this.time;
    }
    this.sonar.update(this.time, scrollPx);
    this.cave.applySonar(this.sonar.pings, this.time);
    this.sparks.update(gameDt, this.time, scrollPx);

    if (wasPressed("Space")) this.startPlaying();
  }

  private updatePlaying(gameDt: number): void {
    if (wasPressed("Space")) {
      // Always ping on tap so the player gets feedback even when the dash
      // is on cooldown — sonar reveal is the core "ping the dark" mechanic
      // and shouldn't be gated on the dash being available.
      this.sonar.emit(this.bat, this.time);
      this.bat.flash(this.time);
      playPing();
      // Dash if it's off cooldown.
      if (this.bat.dash(this.time)) {
        playDash();
        this.sparks.burst(this.bat.x, this.bat.y, this.time, 10, "cyan", 220);
      }
    }

    const profile = this.caveProfile();
    const scrollPx = profile.speed * gameDt;
    const magnetActive = this.isActive("magnet");

    this.bat.update(gameDt, this.canvas);
    this.cave.update(gameDt, this.canvas, profile.speed, profile.minGap, profile.noiseStep);
    this.sonar.update(this.time, scrollPx);
    this.cave.applySonar(this.sonar.pings, this.time);

    const spawnMult = this.cave.inChamber ? CHAMBER_SPAWN_MULTIPLIER : 1;
    this.fireflies.update(
      gameDt,
      this.time,
      this.canvas,
      this.cave,
      this.bat,
      scrollPx,
      spawnMult,
      this.goldenChance(),
      magnetActive,
      MAGNET_RANGE_PX,
      MAGNET_PULL_SPEED,
      (x, y, kind) => this.handleFireflyPickup(x, y, kind),
    );
    this.fireflies.applySonar(this.sonar.pings, this.time);

    this.moths.update(
      gameDt,
      this.time,
      this.canvas,
      this.cave,
      this.bat,
      scrollPx,
      magnetActive,
      MAGNET_RANGE_PX,
      MAGNET_PULL_SPEED,
      (x, y) => this.handleMothPickup(x, y),
    );
    this.moths.applySonar(this.sonar.pings, this.time);

    this.stingers.update(gameDt, this.time, this.canvas, this.cave, scrollPx);
    this.stingers.applySonar(this.sonar.pings, this.time);

    this.crystals.update(
      gameDt,
      this.time,
      this.canvas,
      this.cave,
      this.bat,
      scrollPx,
      this.cave.inChamber,
      (x, y) => this.handleCrystalShatter(x, y),
    );
    this.crystals.applySonar(this.sonar.pings, this.time);

    this.boss.update(gameDt, this.time, this.canvas, this.cave, scrollPx, profile.speed);
    this.boss.applySonar(this.sonar.pings, this.time);
    if (this.boss.consumeSpawnedFlag()) {
      playBossIntro();
      this.lastBossPingSfx = this.time;
    }
    if (this.boss.isAlive() && this.time - this.lastBossPingSfx >= BOSS_PING_INTERVAL_SEC) {
      playBossPing();
      this.lastBossPingSfx = this.time;
    }

    this.powerups.update(
      gameDt,
      this.time,
      this.canvas,
      this.cave,
      this.bat,
      scrollPx,
      (x, y, kind) => this.handlePowerupPickup(x, y, kind),
    );
    this.powerups.applySonar(this.sonar.pings, this.time);

    this.sparks.update(gameDt, this.time, scrollPx);
    this.distance += scrollPx;

    this.checkNearMiss();

    const reached = Math.floor(this.distance / MILESTONE_INTERVAL_PX);
    if (reached > this.lastMilestone) {
      this.lastMilestone = reached;
      this.milestoneAt = this.uiTime;
      this.milestoneText = formatMeters(reached * MILESTONE_INTERVAL_PX);
      playMilestone();
    }

    // stinger collision
    const stung = this.stingers.checkCollision(this.bat);
    if (stung) {
      const canKill =
        Math.abs(this.bat.vy) >= DIVE_KILL_MIN_VY ||
        this.bat.isDashing(this.time);
      if (canKill) {
        this.stingers.destroy(stung);
        this.handleStingerKill(stung.x, stung.y);
      } else {
        this.crash();
        return;
      }
    }

    // boss hostile ping-wave hit (dodge by dashing)
    if (this.boss.checkPingHitBat(this.bat, this.time)) {
      this.crash();
      return;
    }

    // boss physical collision
    const bossResult = this.boss.resolveBatCollision(
      this.bat,
      this.time,
      this.combo.count > 0 ? this.combo.count : 1,
    );
    if (bossResult.kind === "batDies") {
      this.crash();
      return;
    } else if (bossResult.kind === "hit") {
      const level = this.combo.hit(this.time);
      const bonus = BOSS_HIT_BONUS * level;
      this.distance += bonus;
      const suffix = level > 1 ? ` x${level}` : "";
      this.fireflies.addPop(
        `HIT +${Math.floor(bonus / 10)}${suffix}`,
        bossResult.x,
        bossResult.y - 10,
        "pink",
        this.time,
        level,
      );
      this.sparks.burst(bossResult.x, bossResult.y, this.time, 12, "gold", 220);
      this.sparks.burst(bossResult.x, bossResult.y, this.time, 8, "red", 180);
      this.shake = Math.max(this.shake, 8);
      playBossHit();
    } else if (bossResult.kind === "kill") {
      const level = this.combo.count > 0 ? this.combo.count : 1;
      const bonus = BOSS_KILL_BONUS * level;
      this.distance += bonus;
      this.sparks.burst(bossResult.x, bossResult.y, this.time, 40, "gold", 320);
      this.sparks.burst(bossResult.x, bossResult.y, this.time, 20, "red", 280);
      this.fireflies.addPop(
        "BOSS DOWN",
        bossResult.x,
        bossResult.y - 20,
        "cyan",
        this.time,
        level,
      );
      this.shake = Math.max(this.shake, 20);
      playBossKill();
    }

    if (checkCollision(this.bat, this.cave)) {
      this.crash();
    }
  }

  private crash(): void {
    this.state = "dead";
    this.shake = 24;
    this.crashFlashAt = this.uiTime;
    this.sparks.burst(this.bat.x, this.bat.y, this.time, 22, "red", 220);
    this.sparks.burst(this.bat.x, this.bat.y, this.time, 10, "cyan", 120);
    playCrash();
    if (this.distance > this.best) {
      this.best = Math.floor(this.distance);
      this.isNewBest = true;
      saveBest(this.best);
    }
  }

  private checkNearMiss(): void {
    const sample = this.cave.sampleAt(this.bat.x);
    if (!sample) {
      this.inNearMissZone = false;
      return;
    }
    const ceilD = this.bat.y - sample.ceilY;
    const floorD = sample.floorY - this.bat.y;
    const nearest = Math.min(ceilD, floorD);
    const inZone = nearest >= NEAR_MISS_MIN_PX && nearest <= NEAR_MISS_MAX_PX;

    if (inZone && !this.inNearMissZone) {
      this.inNearMissZone = true;
      this.distance += NEAR_MISS_BONUS;
      const wallY = ceilD < floorD ? sample.ceilY : sample.floorY;
      this.sparks.burst(this.bat.x, wallY, this.time, 6, "cyan", 90);
      this.fireflies.addPop(
        "NICE",
        this.bat.x,
        this.bat.y - 26,
        "cyan",
        this.time,
      );
      playNearMiss();
    } else if (!inZone) {
      this.inNearMissZone = false;
    }
  }

  private updateDead(gameDt: number): void {
    this.deadTime += gameDt;
    this.sonar.update(this.time, 0);
    this.cave.applySonar(this.sonar.pings, this.time);
    this.fireflies.applySonar(this.sonar.pings, this.time);
    this.moths.applySonar(this.sonar.pings, this.time);
    this.stingers.applySonar(this.sonar.pings, this.time);
    this.crystals.applySonar(this.sonar.pings, this.time);
    this.boss.applySonar(this.sonar.pings, this.time);
    this.powerups.applySonar(this.sonar.pings, this.time);
    this.sparks.update(gameDt, this.time, 0);
    if (this.deadTime > DEATH_RESTART_GRACE && wasPressed("Space")) {
      this.startPlaying();
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    if (this.shake > 0.1) {
      ctx.translate(
        (Math.random() - 0.5) * this.shake,
        (Math.random() - 0.5) * this.shake,
      );
    }
    this.particles.draw(ctx);
    this.cave.drawLit(ctx, this.time, this.bat);
    this.fireflies.draw(ctx, this.time, this.bat);
    this.moths.draw(ctx, this.time, this.bat);
    this.stingers.draw(ctx, this.time, this.bat);
    this.crystals.draw(ctx, this.time, this.bat);
    this.boss.draw(ctx, this.time, this.bat);
    this.powerups.draw(ctx, this.time, this.bat);
    this.sparks.draw(ctx, this.time);
    this.sonar.drawRings(ctx, this.time);
    if (this.state !== "dead") this.bat.draw(ctx, this.time);
    ctx.restore();

    drawSlowTint(ctx, this.canvas, this.powerupUntil.slow, this.uiTime);
    drawVignette(this.canvas);
    drawBiomeBoom(ctx, this.canvas, this.uiTime, this.biomeBoomAt, this.biomeBoomColor);
    drawCrashFlash(ctx, this.canvas, this.uiTime, this.crashFlashAt);

    if (this.state === "menu") {
      drawMenuOverlay(ctx, this.canvas, this.uiTime, this.best);
    } else if (this.state === "playing") {
      drawHud(
        ctx,
        this.canvas,
        this.distance,
        this.best,
        { count: this.combo.count, expireAt: this.combo.expireAt },
        this.uiTime,
      );
      drawMilestone(ctx, this.canvas, this.uiTime, this.milestoneAt, this.milestoneText);
      drawPowerupIndicators(
        ctx,
        this.canvas,
        this.uiTime,
        this.powerupUntil,
        POWERUP_DURATIONS,
      );
    } else {
      drawCrashOverlay(
        ctx,
        this.canvas,
        this.uiTime,
        this.distance,
        this.best,
        this.isNewBest,
        this.deadTime > DEATH_RESTART_GRACE,
      );
    }
  }
}
