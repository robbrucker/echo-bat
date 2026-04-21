import type { Bat } from "./bat";
import type { Cave } from "./cave";

const BAT_RADIUS = 8;

export function checkCollision(bat: Bat, cave: Cave): boolean {
  const sample = cave.sampleAt(bat.x);
  if (!sample) return false;
  if (bat.y - BAT_RADIUS < sample.ceilY) return true;
  if (bat.y + BAT_RADIUS > sample.floorY) return true;
  return false;
}
