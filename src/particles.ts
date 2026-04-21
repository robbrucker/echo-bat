import type { Canvas } from "./render";
import { theme } from "./biomes";

type Mote = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  phase: number;
};

export class ParticleField {
  private motes: Mote[] = [];
  private time = 0;

  constructor(canvas: Canvas, count = 90) {
    for (let i = 0; i < count; i++) {
      this.motes.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: -15 - Math.random() * 25,
        vy: (Math.random() - 0.5) * 6,
        r: 0.5 + Math.random() * 1.4,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  update(dt: number, canvas: Canvas): void {
    this.time += dt;
    for (const m of this.motes) {
      m.x += m.vx * dt;
      m.y += m.vy * dt + Math.sin(this.time * 0.6 + m.phase) * 0.25;
      if (m.x < -5) {
        m.x = canvas.width + 5;
        m.y = Math.random() * canvas.height;
      }
      if (m.y < -5) m.y = canvas.height + 5;
      if (m.y > canvas.height + 5) m.y = -5;
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.fillStyle = `rgba(${theme.dust}, 1)`;
    for (const m of this.motes) {
      const alpha = 0.12 + 0.22 * Math.abs(Math.sin(this.time + m.phase));
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}
