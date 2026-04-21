type SparkColor = "gold" | "red" | "cyan" | "pink";

type Spark = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  birth: number;
  life: number;
  color: SparkColor;
};

const COLOR_RGB: Record<SparkColor, string> = {
  gold: "255, 210, 130",
  red: "255, 110, 120",
  cyan: "160, 220, 255",
  pink: "255, 180, 225",
};

export class Sparks {
  private sparks: Spark[] = [];

  burst(
    x: number,
    y: number,
    now: number,
    count: number,
    color: SparkColor,
    speed = 120,
  ): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.8);
      this.sparks.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        birth: now,
        life: 0.45 + Math.random() * 0.35,
        color,
      });
    }
  }

  clear(): void {
    this.sparks.length = 0;
  }

  update(dt: number, now: number, worldScrollPx: number): void {
    for (const s of this.sparks) {
      s.x += s.vx * dt - worldScrollPx;
      s.y += s.vy * dt;
      s.vx *= Math.pow(0.12, dt);
      s.vy = s.vy * Math.pow(0.25, dt) + 160 * dt;
    }
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      if (now - this.sparks[i]!.birth > this.sparks[i]!.life) {
        this.sparks.splice(i, 1);
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D, now: number): void {
    if (this.sparks.length === 0) return;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const s of this.sparks) {
      const t = (now - s.birth) / s.life;
      if (t < 0 || t > 1) continue;
      const alpha = Math.pow(1 - t, 1.3);
      const col = COLOR_RGB[s.color];
      ctx.fillStyle = `rgba(${col}, ${alpha})`;
      ctx.shadowColor = `rgba(${col}, 1)`;
      ctx.shadowBlur = 10 * alpha;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 1.4 + alpha * 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}
