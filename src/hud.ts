import type { Canvas } from "./render";
import { formatMeters } from "./score";
import { POWERUP_COLOR, type PowerupKind } from "./powerups";

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

export function drawPowerupIndicators(
  ctx: CanvasRenderingContext2D,
  _canvas: Canvas,
  uiNow: number,
  powerupUntil: Record<PowerupKind, number>,
  durations: Record<PowerupKind, number>,
): void {
  const active: PowerupKind[] = [];
  if (powerupUntil.slow > uiNow) active.push("slow");
  if (powerupUntil.magnet > uiNow) active.push("magnet");
  if (active.length === 0) return;

  ctx.save();
  let x = 28;
  const y = 28;
  const r = 16;
  for (const kind of active) {
    const remaining = powerupUntil[kind] - uiNow;
    const frac = Math.max(0, Math.min(1, remaining / durations[kind]));
    const col = POWERUP_COLOR[kind];

    // ring background
    ctx.strokeStyle = `rgba(${col.accent}, 0.25)`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, r + 6, 0, Math.PI * 2);
    ctx.stroke();

    // progress arc
    ctx.strokeStyle = `rgba(${col.core}, 0.95)`;
    ctx.lineWidth = 3;
    ctx.shadowColor = `rgba(${col.halo}, 0.8)`;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(x, y, r + 6, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
    ctx.stroke();

    // inner crystal
    ctx.fillStyle = `rgba(${col.core}, 0.95)`;
    ctx.shadowColor = `rgba(${col.halo}, 1)`;
    ctx.shadowBlur = 14;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      const px = x + Math.cos(a) * r * 0.7;
      const py = y + Math.sin(a) * r * 0.7;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();

    x += r * 2.8;
  }
  ctx.restore();
}

export function drawSlowTint(
  ctx: CanvasRenderingContext2D,
  canvas: Canvas,
  slowUntil: number,
  uiNow: number,
): void {
  if (slowUntil <= uiNow) return;
  const remaining = slowUntil - uiNow;
  const intensity = Math.min(1, remaining / 0.4) * Math.min(1, (slowUntil - uiNow) * 3);
  const alpha = 0.085 * intensity;
  ctx.save();
  const grad = ctx.createRadialGradient(
    canvas.width / 2,
    canvas.height / 2,
    0,
    canvas.width / 2,
    canvas.height / 2,
    Math.max(canvas.width, canvas.height) * 0.75,
  );
  grad.addColorStop(0, `rgba(150, 100, 255, ${alpha * 0.5})`);
  grad.addColorStop(1, `rgba(90, 40, 180, ${alpha})`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
}

export function drawHud(
  ctx: CanvasRenderingContext2D,
  canvas: Canvas,
  distance: number,
  best: number,
  combo: { count: number; expireAt: number },
  now: number,
): void {
  ctx.save();
  ctx.textAlign = "right";
  ctx.textBaseline = "top";

  ctx.font = `600 22px ${MONO}`;
  ctx.fillStyle = "rgba(230, 240, 255, 0.88)";
  ctx.shadowColor = "rgba(140, 200, 255, 0.55)";
  ctx.shadowBlur = 6;
  ctx.fillText(formatMeters(distance), canvas.width - 24, 20);

  ctx.font = `11px ${MONO}`;
  ctx.fillStyle = "rgba(170, 185, 210, 0.55)";
  ctx.shadowBlur = 0;
  ctx.fillText(`best ${formatMeters(best)}`, canvas.width - 24, 50);

  // combo badge
  if (combo.count > 1 && now < combo.expireAt) {
    const remaining = combo.expireAt - now;
    const fade = Math.min(1, remaining / 0.5);
    const pulse = 0.7 + 0.3 * Math.sin(now * 12);
    ctx.fillStyle = `rgba(255, 210, 130, ${fade * pulse})`;
    ctx.shadowColor = "rgba(255, 180, 90, 0.8)";
    ctx.shadowBlur = 12;
    ctx.font = `700 24px ${MONO}`;
    ctx.textAlign = "right";
    ctx.fillText(`COMBO x${combo.count}`, canvas.width - 24, 72);
  }
  ctx.restore();
}

export function drawMilestone(
  ctx: CanvasRenderingContext2D,
  canvas: Canvas,
  now: number,
  firedAt: number,
  text: string,
): void {
  const age = now - firedAt;
  const total = 1.4;
  if (age < 0 || age > total) return;
  let alpha = 1;
  if (age < 0.18) alpha = age / 0.18;
  else if (age > total - 0.4) alpha = (total - age) / 0.4;

  const cx = canvas.width / 2;
  const cy = canvas.height * 0.28;
  const slide = (1 - Math.min(1, age / 0.2)) * 40;

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = `rgba(255, 220, 150, ${alpha})`;
  ctx.shadowColor = "rgba(255, 180, 90, 0.9)";
  ctx.shadowBlur = 24;
  ctx.font = `700 44px ${MONO}`;
  ctx.fillText(text, cx - slide, cy);
  ctx.restore();
}

export function drawCrashFlash(
  ctx: CanvasRenderingContext2D,
  canvas: Canvas,
  now: number,
  firedAt: number,
): void {
  const age = now - firedAt;
  if (age < 0 || age > 0.35) return;
  const alpha = Math.pow(1 - age / 0.35, 1.6) * 0.55;
  ctx.save();
  const grad = ctx.createRadialGradient(
    canvas.width / 2,
    canvas.height / 2,
    60,
    canvas.width / 2,
    canvas.height / 2,
    Math.max(canvas.width, canvas.height) * 0.75,
  );
  grad.addColorStop(0, `rgba(255, 120, 130, ${alpha})`);
  grad.addColorStop(1, `rgba(120, 10, 20, 0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
}

export function drawMenuOverlay(
  ctx: CanvasRenderingContext2D,
  canvas: Canvas,
  time: number,
  best: number,
): void {
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  // title
  ctx.fillStyle = "rgba(220, 240, 255, 0.95)";
  ctx.shadowColor = "rgba(120, 200, 255, 0.7)";
  ctx.shadowBlur = 24;
  ctx.font = `600 72px ${MONO}`;
  ctx.fillText("ECHO  BAT", cx, cy - 60);

  // tagline
  ctx.shadowBlur = 0;
  ctx.fillStyle = "rgba(180, 200, 225, 0.6)";
  ctx.font = `13px ${MONO}`;
  ctx.fillText("ping the dark", cx, cy - 20);

  // controls
  ctx.fillStyle = "rgba(160, 180, 210, 0.5)";
  ctx.font = `12px ${MONO}`;
  ctx.fillText("space — dash     ↑ ↓ — steer", cx, cy + 46);

  // best
  if (best > 0) {
    ctx.fillStyle = "rgba(150, 255, 190, 0.7)";
    ctx.fillText(`best  ${formatMeters(best)}`, cx, cy + 68);
  }

  // prompt
  const pulse = 0.5 + 0.5 * Math.sin(time * 2.4);
  ctx.fillStyle = `rgba(210, 235, 255, ${0.35 + 0.6 * pulse})`;
  ctx.shadowColor = "rgba(140, 220, 255, 0.8)";
  ctx.shadowBlur = 10 * pulse;
  ctx.font = `16px ${MONO}`;
  ctx.fillText("press space to fly", cx, cy + 116);
  ctx.restore();
}

export function drawCrashOverlay(
  ctx: CanvasRenderingContext2D,
  canvas: Canvas,
  time: number,
  distance: number,
  best: number,
  isNewBest: boolean,
  acceptInput: boolean,
): void {
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const pulse = 0.55 + 0.45 * Math.sin(time * 3.2);

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  // "crashed"
  ctx.fillStyle = "rgba(255, 110, 130, 0.92)";
  ctx.shadowColor = "rgba(255, 110, 130, 0.85)";
  ctx.shadowBlur = 22;
  ctx.font = `bold 30px ${MONO}`;
  ctx.fillText("CRASHED", cx, cy - 62);

  // score
  ctx.shadowColor = "rgba(140, 200, 255, 0.55)";
  ctx.shadowBlur = 14;
  ctx.fillStyle = "rgba(230, 240, 255, 0.95)";
  ctx.font = `600 58px ${MONO}`;
  ctx.fillText(formatMeters(distance), cx, cy);

  ctx.shadowBlur = 0;
  if (isNewBest) {
    ctx.fillStyle = "rgba(150, 255, 190, 0.95)";
    ctx.shadowColor = "rgba(150, 255, 190, 0.7)";
    ctx.shadowBlur = 12;
    ctx.font = `600 13px ${MONO}`;
    ctx.fillText("NEW  BEST", cx, cy + 28);
  } else {
    ctx.fillStyle = "rgba(170, 185, 210, 0.6)";
    ctx.font = `12px ${MONO}`;
    ctx.fillText(`best  ${formatMeters(best)}`, cx, cy + 28);
  }

  if (acceptInput) {
    ctx.shadowBlur = 0;
    ctx.fillStyle = `rgba(210, 235, 255, ${0.35 + 0.55 * pulse})`;
    ctx.shadowColor = "rgba(140, 220, 255, 0.6)";
    ctx.shadowBlur = 8 * pulse;
    ctx.font = `14px ${MONO}`;
    ctx.fillText("space to retry", cx, cy + 82);
  }

  ctx.restore();
}
