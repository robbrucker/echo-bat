import { resumeAudio } from "./audio";

const held = new Set<string>();
const pressedThisFrame = new Set<string>();

window.addEventListener("keydown", (e) => {
  resumeAudio();
  if (!held.has(e.code)) pressedThisFrame.add(e.code);
  held.add(e.code);
  if (e.code === "Space" || e.code === "ArrowUp" || e.code === "ArrowDown") {
    e.preventDefault();
  }
});

window.addEventListener("keyup", (e) => {
  held.delete(e.code);
});

export const isHeld = (code: string): boolean => held.has(code);
export const wasPressed = (code: string): boolean => pressedThisFrame.has(code);
export const clearPressed = (): void => pressedThisFrame.clear();
