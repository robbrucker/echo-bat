const KEY = "echo-bat:best";

export function loadBest(): number {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return 0;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

export function saveBest(distance: number): void {
  try {
    localStorage.setItem(KEY, String(Math.floor(distance)));
  } catch {
    // localStorage may be unavailable (privacy mode, quota) — silently skip
  }
}

export function formatMeters(distance: number): string {
  return `${Math.floor(distance / 10)} m`;
}
