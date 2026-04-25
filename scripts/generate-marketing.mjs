// Marketing-grade hero artwork via Replicate's Flux 1.1 Pro Ultra (highest
// quality available, ~4MP output). Distinct from the in-game sprite/background
// pipeline because (a) much higher cost, (b) different aspect ratios, (c)
// goes into public/marketing/ for use on the App Store, web, and social.
//
//   node scripts/generate-marketing.mjs                  # missing only
//   node scripts/generate-marketing.mjs --force          # regenerate all
//   node scripts/generate-marketing.mjs icon hero        # specific names

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const OUT_DIR = resolve(ROOT, "public/marketing");

const MODEL = "black-forest-labs/flux-1.1-pro-ultra";

const SHARED_STYLE =
  "cinematic painterly digital illustration, ultra high detail, dramatic atmospheric " +
  "lighting, vibrant ethereal glow, professional video-game key art quality, " +
  "rich color depth, polished render, no text, no watermarks, no UI elements";

const ASSETS = {
  // App icon. Strong silhouette at any scale.
  icon: {
    aspect_ratio: "1:1",
    prompt:
      "iconic logo-style mark for a mobile game called Echo Bat. " +
      "A single fierce magical bat creature silhouette, wings dramatically spread, " +
      "glowing electric cyan-blue bioluminescent veins running through translucent wings, " +
      "blazing white-hot core at the chest, piercing white energy eyes, " +
      "facing the viewer in dynamic flight pose, " +
      "centered against a dark deep navy cave-mouth backdrop with subtle cyan rim glow, " +
      "bold readable shape that works at small sizes, " +
      "high contrast, vibrant magical fantasy creature, NOT photorealistic, " +
      "minimal background, focused composition, app icon style, " +
      SHARED_STYLE,
  },
  // Cinematic landscape hero. For website / OpenGraph / App Store featured banner.
  hero: {
    aspect_ratio: "16:9",
    prompt:
      "epic cinematic key art for a mobile game called Echo Bat. " +
      "A glowing magical electric-blue bat creature soaring through a vast bioluminescent cave, " +
      "translucent wings with crackling cyan energy, blazing white core at the chest, " +
      "trailing wisps of light behind it, dramatic flight pose, " +
      "the cavern stretches into the distance with stalactites, hanging crystals, drifting glowing motes, " +
      "moody deep blue-black palette punctuated by cyan and amber bioluminescence, " +
      "negative space on the upper third for title placement, " +
      "movie poster composition, " +
      SHARED_STYLE,
  },
  // Vertical poster. App Store hero / Instagram story / TikTok screen.
  poster: {
    aspect_ratio: "9:16",
    prompt:
      "vertical cinematic poster for a mobile game called Echo Bat. " +
      "A glowing magical electric-blue bat creature in dramatic upward dive pose, " +
      "translucent wings with cyan bioluminescent veins, blazing white-hot core, " +
      "soaring through a deep underground cave with hanging stalactites and crystal formations, " +
      "luminous fireflies and motes drift around it, distant cave glow rises from below, " +
      "dramatic vertical composition leading the eye upward, " +
      "deep navy and cyan palette, dramatic chiaroscuro lighting, " +
      "vertical poster composition with negative space at top for a title, " +
      SHARED_STYLE,
  },
  // Square social card / Instagram / avatar variant.
  social: {
    aspect_ratio: "1:1",
    prompt:
      "square cinematic key art for a mobile game called Echo Bat. " +
      "A glowing magical electric-blue bat creature centered, wings spread, " +
      "translucent membrane wings with crackling cyan energy veins, " +
      "blazing white-hot incandescent core, piercing white-energy eyes, " +
      "ethereal sonar ring pulses radiating outward from the bat through the dark cave around it, " +
      "stylized, vibrant, magical fantasy game illustration, " +
      "deep navy background with cyan bioluminescent accents, " +
      "tight focused composition with the creature filling 60% of the frame, " +
      SHARED_STYLE,
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

  const res = await fetch(`https://api.replicate.com/v1/models/${MODEL}/predictions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "wait=60", // Replicate caps the synchronous wait at 60s
    },
    body: JSON.stringify({
      input: {
        prompt: cfg.prompt,
        aspect_ratio: cfg.aspect_ratio,
        output_format: "png",
        safety_tolerance: 5,
        raw: false,
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Replicate ${res.status}: ${body}`);
  }
  let pred = await res.json();

  // Pro Ultra can exceed the 60s synchronous window. Poll until done.
  while (pred.status !== "succeeded" && pred.status !== "failed" && pred.status !== "canceled") {
    await new Promise((r) => setTimeout(r, 2500));
    const poll = await fetch(`https://api.replicate.com/v1/predictions/${pred.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!poll.ok) throw new Error(`poll ${poll.status}: ${await poll.text()}`);
    pred = await poll.json();
  }

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
  const targets = requested.length ? requested : Object.keys(ASSETS);

  for (const name of targets) {
    const cfg = ASSETS[name];
    if (!cfg) {
      console.warn(`unknown asset: ${name}`);
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
