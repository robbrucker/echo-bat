import { theme } from "./biomes";

export type Canvas = {
  el: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
};

export function setupCanvas(id: string): Canvas {
  const el = document.getElementById(id) as HTMLCanvasElement | null;
  if (!el) throw new Error(`canvas #${id} not found`);
  const ctx = el.getContext("2d");
  if (!ctx) throw new Error("2d context not available");

  const canvas: Canvas = { el, ctx, width: 0, height: 0 };

  const resize = (): void => {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    el.width = Math.floor(canvas.width * dpr);
    el.height = Math.floor(canvas.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  resize();
  window.addEventListener("resize", resize);
  return canvas;
}

export function clear(canvas: Canvas): void {
  const { ctx, width, height } = canvas;
  const grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, theme.bgMid);
  grad.addColorStop(0.5, theme.bgDeep);
  grad.addColorStop(1, theme.bgMid);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);
}

export function drawVignette(canvas: Canvas): void {
  const { ctx, width, height } = canvas;
  const cx = width / 2;
  const cy = height / 2;
  const r = Math.hypot(cx, cy);
  const grad = ctx.createRadialGradient(cx, cy, r * 0.45, cx, cy, r);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(1, "rgba(0,0,0,0.75)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);
}
