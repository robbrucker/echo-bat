import type { Bat } from "./bat";
import {
  SONAR_SPEED,
  MAX_SONAR_RADIUS,
  PING_COOLDOWN_S,
} from "./tuning";

export type Ping = {
  originX: number;
  originY: number;
  startTime: number;
};

export class Sonar {
  readonly pings: Ping[] = [];
  private lastPingAt = -Infinity;

  canPing(now: number): boolean {
    return now - this.lastPingAt >= PING_COOLDOWN_S;
  }

  emit(bat: Bat, now: number): boolean {
    if (!this.canPing(now)) return false;
    this.pings.push({
      originX: bat.x,
      originY: bat.y,
      startTime: now,
    });
    this.lastPingAt = now;
    return true;
  }

  clear(): void {
    this.pings.length = 0;
    this.lastPingAt = -Infinity;
  }

  update(now: number, worldScrollPx: number): void {
    const lifetime = MAX_SONAR_RADIUS / SONAR_SPEED;
    for (const p of this.pings) p.originX -= worldScrollPx;
    // cull retired
    for (let i = this.pings.length - 1; i >= 0; i--) {
      if (now - this.pings[i]!.startTime >= lifetime) this.pings.splice(i, 1);
    }
  }

  drawRings(ctx: CanvasRenderingContext2D, now: number): void {
    if (this.pings.length === 0) return;
    const lifetime = MAX_SONAR_RADIUS / SONAR_SPEED;

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const ping of this.pings) {
      const elapsed = now - ping.startTime;
      const t = elapsed / lifetime;
      if (t < 0 || t > 1) continue;
      const r = SONAR_SPEED * elapsed;
      const alpha = Math.pow(1 - t, 1.2) * 0.35;

      ctx.strokeStyle = `rgba(120, 210, 255, ${alpha})`;
      ctx.lineWidth = 3;
      ctx.shadowColor = "rgba(140, 220, 255, 1)";
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.arc(ping.originX, ping.originY, r, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = `rgba(230, 248, 255, ${alpha * 1.4})`;
      ctx.lineWidth = 1.2;
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(ping.originX, ping.originY, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
}

export function stampArrival(
  pings: readonly Ping[],
  now: number,
  x: number,
  y: number,
  currentLitAt: number,
): number {
  let litAt = currentLitAt;
  for (const ping of pings) {
    const d = Math.hypot(x - ping.originX, y - ping.originY);
    if (d > MAX_SONAR_RADIUS) continue;
    const arrive = ping.startTime + d / SONAR_SPEED;
    if (now >= arrive && litAt < arrive) litAt = arrive;
  }
  return litAt;
}
