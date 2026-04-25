import type { Canvas } from "./render";
import { theme } from "./biomes";

// Each biome has 3 variants. The first is `${biome}.png`, the rest are
// `${biome}-2.png`, `${biome}-3.png`. Variants share palette and mood; only the
// cave composition varies, so cycling between them across tile-pairs breaks the
// obvious repeat without changing perceived biome.
const BIOMES = ["abyss", "ember", "void", "verdant"] as const;
const VARIANT_COUNT = 3;

function sourceFor(biome: string, variantIdx: number): string {
  const suffix = variantIdx === 0 ? "" : `-${variantIdx + 1}`;
  return `/assets/backgrounds/${biome}${suffix}.png`;
}

const SOURCES: Record<string, string[]> = {};
for (const b of BIOMES) {
  SOURCES[b] = Array.from({ length: VARIANT_COUNT }, (_, i) => sourceFor(b, i));
}

const FALLBACK = "abyss";
const PARALLAX_FACTOR = 0.18;
const ALPHA = 0.55;

// Cache and failed-set keyed by `${biome}:${variantIdx}` so each variant loads
// independently (matches the existing lazy-load pattern).
const cache = new Map<string, HTMLImageElement>();
const failed = new Set<string>();

function get(biome: string, variantIdx: number): HTMLImageElement | null {
  const sources = SOURCES[biome];
  if (!sources) return null;
  const src = sources[variantIdx];
  if (!src) return null;
  const key = `${biome}:${variantIdx}`;
  let img = cache.get(key);
  if (img) return img.complete && img.naturalWidth > 0 ? img : null;
  if (failed.has(key)) return null;
  img = new Image();
  img.onerror = (): void => {
    failed.add(key);
  };
  img.src = src;
  cache.set(key, img);
  return null;
}

// Pick a loaded variant for `biome`, preferring `preferred`. Falls back across
// other variants of the same biome, then to FALLBACK biome's variants. Returns
// null if nothing has loaded yet.
function pickVariant(biome: string, preferred: number): HTMLImageElement | null {
  for (let i = 0; i < VARIANT_COUNT; i++) {
    const idx = (preferred + i) % VARIANT_COUNT;
    const img = get(biome, idx);
    if (img) return img;
  }
  if (biome !== FALLBACK) {
    for (let i = 0; i < VARIANT_COUNT; i++) {
      const idx = (preferred + i) % VARIANT_COUNT;
      const img = get(FALLBACK, idx);
      if (img) return img;
    }
  }
  return null;
}

function drawTiled(
  ctx: CanvasRenderingContext2D,
  biome: string,
  width: number,
  height: number,
  scrolled: number,
  alpha: number,
): void {
  if (alpha <= 0) return;

  // Use the first available variant to size the tile period. All Replicate
  // outputs share aspect ratio (21:9), so drawW is effectively constant across
  // variants and edges still align.
  const sizing = pickVariant(biome, 0);
  if (!sizing) return;
  const scale = height / sizing.naturalHeight;
  const drawW = sizing.naturalWidth * scale;
  const period = drawW * 2;
  const offset = ((scrolled % period) + period) % period;

  // tileIndex of the leftmost tile in world space, used to keep variant
  // selection stable as the camera scrolls.
  const baseTileIndex = Math.floor(scrolled / drawW);

  ctx.save();
  ctx.globalAlpha = alpha;
  let x = -offset;
  let i = 0;
  while (x < width) {
    const tileIndex = baseTileIndex + i;
    // Same variant within a mirror-pair (so the flipped seam matches), new
    // variant for each new pair.
    const variantIdx = ((Math.floor(tileIndex / 2) % VARIANT_COUNT) + VARIANT_COUNT) % VARIANT_COUNT;
    const img = pickVariant(biome, variantIdx) ?? sizing;
    const mirrored = ((tileIndex % 2) + 2) % 2 === 1;
    if (mirrored) {
      ctx.save();
      ctx.translate(x + drawW, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(img, 0, 0, drawW, height);
      ctx.restore();
    } else {
      ctx.drawImage(img, x, 0, drawW, height);
    }
    x += drawW;
    i++;
  }
  ctx.restore();
}

export function drawBackground(canvas: Canvas, distance: number): void {
  const currentBiome = SOURCES[theme.currentBiome] ? theme.currentBiome : FALLBACK;
  // Trigger lazy load and bail until at least one variant of the chosen biome
  // (or fallback) is ready.
  if (!pickVariant(currentBiome, 0)) return;

  const scrolled = distance * PARALLAX_FACTOR;
  drawTiled(canvas.ctx, currentBiome, canvas.width, canvas.height, scrolled, ALPHA);

  if (theme.transition > 0 && theme.nextBiome !== theme.currentBiome) {
    const nextBiome = SOURCES[theme.nextBiome] ? theme.nextBiome : FALLBACK;
    if (pickVariant(nextBiome, 0)) {
      drawTiled(canvas.ctx, nextBiome, canvas.width, canvas.height, scrolled, ALPHA * theme.transition);
    }
  }
}
