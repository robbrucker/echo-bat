import { setupCanvas, clear } from "./render";
import { clearPressed } from "./input";
import { Game } from "./game";
import { initTouch } from "./touch";
import { initTilt } from "./tilt";

const canvas = setupCanvas("game");
const game = new Game(canvas);
initTouch(canvas.el);
initTilt();

let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  game.update(dt);

  clear(canvas);
  game.draw(canvas.ctx);

  clearPressed();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
