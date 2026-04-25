// Generates entity sprites via Replicate's Flux Schnell. We ask for a pure
// black background and use globalCompositeOperation = "lighter" at draw time so
// black drops out for free without preprocessing or alpha channels.
//
//   node scripts/generate-sprites.mjs           # generate missing
//   node scripts/generate-sprites.mjs --force   # regenerate all
//   node scripts/generate-sprites.mjs bat       # one sprite

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const OUT_DIR = resolve(ROOT, "public/assets/sprites");

const DEFAULT_MODEL = "black-forest-labs/flux-schnell";

// Every entity prompt ends with this — Flux ignores "no characters" sometimes
// but the black-bg lighter-mode trick still works as long as the bg is dark.
const SPRITE_TAIL =
  "isolated subject perfectly centered, " +
  "PURE SOLID BLACK BACKGROUND, no scenery, no border, no text, no vignette, " +
  "no atmospheric haze, no glow halo around the subject, " +
  "high contrast, sharp edges, clean cutout-friendly, square crop";

const SPRITES = {
  bat: {
    model: "black-forest-labs/flux-dev",
    prompt:
      "stylized magical bat creature in dynamic mid-flight pose with wings spread wide, " +
      "brilliant glowing electric cyan-blue bioluminescent energy radiating through translucent membrane wings, " +
      "blazing white-hot incandescent core at the chest, sharp glowing veins of light tracing the wings, " +
      "arcs of cyan energy crackling around wingtips, piercing white energy eyes, " +
      "fantasy game creature art, vibrant ethereal glow, painterly stylized digital illustration, " +
      "NOT photorealistic, NOT a real bat, magical fantasy creature, dramatic vibrant colors, " +
      SPRITE_TAIL,
  },
  boss: {
    model: "black-forest-labs/flux-dev",
    prompt:
      "ancient luminous cave guardian spirit floating in mid-air, ethereal magical entity, " +
      "BLAZING incandescent amber and warm orange bioluminescent energy radiating outward, " +
      "blinding white-hot energy core at the center, glowing ember veins through wispy translucent tendrils, " +
      "single bright glowing eye or radiant core, drifting flame-like wisps trailing around the body, " +
      "ancient mystical creature, beautiful and powerful, fantasy game guardian, painterly stylized digital illustration, " +
      "NOT photorealistic, NOT demonic, NOT horror, NOT scary, mystical not horrifying, " +
      "magical fantasy creature, vibrant warm colors, ethereal and dreamlike, " +
      SPRITE_TAIL,
  },
  stinger: {
    prompt:
      "small angular hostile flying creature with a barbed stinger tail and pinched wings, " +
      "glowing red and orange bioluminescence with a hot white core, mean compact silhouette, " +
      "side view, simple readable shape, " +
      SPRITE_TAIL,
  },
  firefly_gold: {
    prompt:
      "tiny softly glowing winged firefly, warm gold and amber bioluminescence " +
      "with a bright white-hot core, delicate wisps of light around it, magical mote, " +
      SPRITE_TAIL,
  },
  firefly_pink: {
    prompt:
      "tiny softly glowing winged firefly, vivid pink and magenta bioluminescence " +
      "with a bright white-hot core, delicate wisps of light around it, magical rare mote, " +
      SPRITE_TAIL,
  },
  moth: {
    prompt:
      "small graceful luminous moth with delicate translucent fanned wings, " +
      "warm gold bioluminescent body and bright white-hot core, side view, soft glow, " +
      SPRITE_TAIL,
  },
  crystal: {
    prompt:
      "magical glowing cluster of sharp faceted crystal shards, bright cyan-white core " +
      "radiating soft blue light, jagged geometric crystalline form, gem-like, " +
      SPRITE_TAIL,
  },
  powerup_slow: {
    prompt:
      "glowing cyan hourglass-shaped energy orb floating in space, bright pulsing white core, " +
      "thin energy traceries arcing around it, magical pickup icon, " +
      SPRITE_TAIL,
  },
  powerup_magnet: {
    prompt:
      "glowing golden horseshoe magnet shaped energy icon, bright white core, " +
      "thin energy traceries arcing between the poles, magical pickup icon, " +
      SPRITE_TAIL,
  },
};

function loadEnv() {
  const path = resolve(ROOT, ".env");
  if (!existsSync(path)) throw new Error(`.env not found at ${path}`);
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[m[1]]) process.env[m[1]] = v;
  }
}

async function generate(name, cfg) {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) throw new Error("REPLICATE_API_TOKEN missing");

  const model = cfg.model ?? DEFAULT_MODEL;
  const res = await fetch(`https://api.replicate.com/v1/models/${model}/predictions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "wait=60",
    },
    body: JSON.stringify({
      input: {
        prompt: cfg.prompt,
        aspect_ratio: cfg.aspect_ratio ?? "1:1",
        output_format: "png",
        output_quality: 95,
        num_outputs: 1,
        go_fast: true,
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Replicate ${res.status}: ${body}`);
  }
  const pred = await res.json();
  if (pred.status !== "succeeded") {
    throw new Error(`prediction ${pred.status}: ${JSON.stringify(pred.error)}`);
  }
  const url = Array.isArray(pred.output) ? pred.output[0] : pred.output;
  if (!url) throw new Error("no output url in prediction");

  const img = await fetch(url);
  if (!img.ok) throw new Error(`download failed: ${img.status}`);
  const buf = Buffer.from(await img.arrayBuffer());

  mkdirSync(OUT_DIR, { recursive: true });
  const out = resolve(OUT_DIR, `${name}.png`);
  writeFileSync(out, buf);
  console.log(`wrote ${out} (${(buf.length / 1024).toFixed(0)} KB)`);
}

async function main() {
  loadEnv();
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const requested = args.filter((a) => !a.startsWith("--"));
  const targets = requested.length ? requested : Object.keys(SPRITES);

  for (const name of targets) {
    const cfg = SPRITES[name];
    if (!cfg) {
      console.warn(`unknown sprite: ${name}`);
      continue;
    }
    const out = resolve(OUT_DIR, `${name}.png`);
    if (!force && existsSync(out)) {
      console.log(`skip ${name} (exists, use --force to regenerate)`);
      continue;
    }
    console.log(`generating ${name}...`);
    await generate(name, cfg);
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
