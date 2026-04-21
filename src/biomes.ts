// Biome theming: shifts visual palette as the player travels further.
//
// The active `theme` object is a module-level singleton mutated each frame by
// `updateTheme(distance)`. Renderers read from it directly, so no draw-signature
// plumbing is needed. Colors are linearly interpolated over a 2000 raw-px
// window between adjacent biome tiers, and after the last tier the sequence
// cycles back to the first.

import { BIOME_TIER_PX, BIOME_TRANSITION_PX } from "./tuning";

export type BiomeName = "abyss" | "ember" | "void" | "verdant";

export type BiomePalette = {
  /** rgb triple string, e.g. "90, 190, 255" — injected into rgba(...) literals */
  wallHalo: string;
  /** rgb triple string for the wall core stroke */
  wallCore: string;
  /** rgb triple string for particle dust */
  dust: string;
  /** hex color for the deep background gradient stop */
  bgDeep: string;
  /** hex color for the mid background gradient stops */
  bgMid: string;
};

export const BIOME_ORDER: readonly BiomeName[] = [
  "abyss",
  "ember",
  "void",
  "verdant",
] as const;

export const BIOMES: Readonly<Record<BiomeName, BiomePalette>> = {
  abyss: {
    wallHalo: "90, 190, 255",
    wallCore: "235, 250, 255",
    dust: "220, 230, 250",
    bgDeep: "#050814",
    bgMid: "#090e22",
  },
  ember: {
    wallHalo: "255, 150, 70",
    wallCore: "255, 235, 200",
    dust: "255, 220, 190",
    bgDeep: "#140704",
    bgMid: "#221008",
  },
  void: {
    wallHalo: "210, 110, 255",
    wallCore: "250, 220, 255",
    dust: "225, 200, 245",
    bgDeep: "#0d0419",
    bgMid: "#180a2a",
  },
  verdant: {
    wallHalo: "100, 255, 170",
    wallCore: "220, 255, 230",
    dust: "200, 250, 220",
    bgDeep: "#031210",
    bgMid: "#062020",
  },
};

export type Theme = {
  /** interpolated rgb triple (e.g. "170, 170, 160") for wall halo */
  wallHalo: string;
  /** interpolated rgb triple for wall core */
  wallCore: string;
  /** interpolated rgb triple for dust */
  dust: string;
  /** interpolated hex color (#rrggbb) for bg deep */
  bgDeep: string;
  /** interpolated hex color (#rrggbb) for bg mid */
  bgMid: string;
  /** the biome the player is currently in (or leaving) */
  currentBiome: BiomeName;
  /** the biome being lerped toward (== currentBiome when not transitioning) */
  nextBiome: BiomeName;
  /** 0..1 lerp progress toward nextBiome */
  transition: number;
};

export const theme: Theme = {
  wallHalo: BIOMES.abyss.wallHalo,
  wallCore: BIOMES.abyss.wallCore,
  dust: BIOMES.abyss.dust,
  bgDeep: BIOMES.abyss.bgDeep,
  bgMid: BIOMES.abyss.bgMid,
  currentBiome: "abyss",
  nextBiome: "abyss",
  transition: 0,
};

// ---------- parsing & interpolation helpers ----------

function parseRgbTriple(s: string): [number, number, number] {
  const parts = s.split(",");
  const r = Number(parts[0]);
  const g = Number(parts[1]);
  const b = Number(parts[2]);
  return [r, g, b];
}

function parseHex(hex: string): [number, number, number] {
  // accepts #rgb or #rrggbb
  let h = hex.trim();
  if (h.startsWith("#")) h = h.slice(1);
  if (h.length === 3) {
    const r = parseInt(h[0]! + h[0]!, 16);
    const g = parseInt(h[1]! + h[1]!, 16);
    const b = parseInt(h[2]! + h[2]!, 16);
    return [r, g, b];
  }
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return [r, g, b];
}

function toHex2(n: number): string {
  const clamped = Math.max(0, Math.min(255, Math.round(n)));
  const h = clamped.toString(16);
  return h.length === 1 ? "0" + h : h;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpTriple(a: string, b: string, t: number): string {
  const [ar, ag, ab] = parseRgbTriple(a);
  const [br, bg, bb] = parseRgbTriple(b);
  const r = Math.round(lerp(ar, br, t));
  const g = Math.round(lerp(ag, bg, t));
  const bl = Math.round(lerp(ab, bb, t));
  return `${r}, ${g}, ${bl}`;
}

function lerpHex(a: string, b: string, t: number): string {
  const [ar, ag, ab] = parseHex(a);
  const [br, bg, bb] = parseHex(b);
  return "#" + toHex2(lerp(ar, br, t)) + toHex2(lerp(ag, bg, t)) + toHex2(lerp(ab, bb, t));
}

// ---------- biome selection ----------

/** Biome name at a given raw-px distance (cycles after last tier). */
export function biomeAt(distance: number): BiomeName {
  const d = Math.max(0, distance);
  const idx = Math.floor(d / BIOME_TIER_PX) % BIOME_ORDER.length;
  return BIOME_ORDER[idx]!;
}

/**
 * Update the shared `theme` object for the given distance.
 * Call each frame from game.update().
 */
export function updateTheme(distance: number): void {
  const d = Math.max(0, distance);
  const tierFloat = d / BIOME_TIER_PX;
  const tierIdx = Math.floor(tierFloat);
  const intoTier = d - tierIdx * BIOME_TIER_PX; // 0..BIOME_TIER_PX

  const current = BIOME_ORDER[tierIdx % BIOME_ORDER.length]!;
  const next = BIOME_ORDER[(tierIdx + 1) % BIOME_ORDER.length]!;

  // Transition starts `BIOME_TRANSITION_PX` before the tier boundary and
  // finishes exactly at the boundary. While deep inside a tier, transition = 0
  // (pure current biome). Otherwise it ramps 0..1 toward `next`.
  const transitionStartIntoTier = BIOME_TIER_PX - BIOME_TRANSITION_PX;
  let t = 0;
  if (intoTier >= transitionStartIntoTier) {
    t = (intoTier - transitionStartIntoTier) / BIOME_TRANSITION_PX;
    if (t < 0) t = 0;
    if (t > 1) t = 1;
  }

  const a = BIOMES[current];
  const b = BIOMES[next];

  theme.currentBiome = current;
  theme.nextBiome = next;
  theme.transition = t;

  if (t <= 0) {
    theme.wallHalo = a.wallHalo;
    theme.wallCore = a.wallCore;
    theme.dust = a.dust;
    theme.bgDeep = a.bgDeep;
    theme.bgMid = a.bgMid;
    return;
  }

  theme.wallHalo = lerpTriple(a.wallHalo, b.wallHalo, t);
  theme.wallCore = lerpTriple(a.wallCore, b.wallCore, t);
  theme.dust = lerpTriple(a.dust, b.dust, t);
  theme.bgDeep = lerpHex(a.bgDeep, b.bgDeep, t);
  theme.bgMid = lerpHex(a.bgMid, b.bgMid, t);
}

/** Reset the theme to the starting biome (useful on game restart). */
export function resetTheme(): void {
  const a = BIOMES.abyss;
  theme.currentBiome = "abyss";
  theme.nextBiome = "abyss";
  theme.transition = 0;
  theme.wallHalo = a.wallHalo;
  theme.wallCore = a.wallCore;
  theme.dust = a.dust;
  theme.bgDeep = a.bgDeep;
  theme.bgMid = a.bgMid;
}
