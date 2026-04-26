import { Capacitor } from "@capacitor/core";
import { setupCanvas, clear } from "./render";
import { clearPressed } from "./input";
import { Game } from "./game";
import { initTouch } from "./touch";
import { initTilt } from "./tilt";
import { drawBackground } from "./background";

const canvas = setupCanvas("game");
const game = new Game(canvas);
initTouch(canvas.el);
initTilt();

// Hide the "source" link in the native app — feels out of place there and
// links out of the App Store sandbox. Web build keeps the link.
if (Capacitor.isNativePlatform()) {
  const ghLink = document.querySelector<HTMLElement>(".gh-link");
  if (ghLink) ghLink.style.display = "none";
}

let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  game.update(dt);

  clear(canvas);
  drawBackground(canvas, game.distance);
  game.draw(canvas.ctx);

  clearPressed();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
