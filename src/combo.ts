import { COMBO_MAX, COMBO_WINDOW_SEC } from "./tuning";

export class Combo {
  count = 0;
  expireAt = -Infinity;

  tick(now: number): void {
    if (now > this.expireAt) this.count = 0;
  }

  hit(now: number): number {
    if (now < this.expireAt) {
      this.count = Math.min(COMBO_MAX, this.count + 1);
    } else {
      this.count = 1;
    }
    this.expireAt = now + COMBO_WINDOW_SEC;
    return this.count;
  }

  clear(): void {
    this.count = 0;
    this.expireAt = -Infinity;
  }
}
