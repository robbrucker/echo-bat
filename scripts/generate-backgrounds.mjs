// Offline asset generator. Calls Replicate's Flux Schnell to produce parallax
// cave backdrops, saves PNGs into public/assets/backgrounds/. Run manually:
//
//   node scripts/generate-backgrounds.mjs              # generate all missing
//   node scripts/generate-backgrounds.mjs --force      # regenerate everything
//   node scripts/generate-backgrounds.mjs abyss        # generate one biome

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const OUT_DIR = resolve(ROOT, "public/assets/backgrounds");

const MODEL = "black-forest-labs/flux-schnell";

const SHARED =
  ", drifting fog and dust particles, atmospheric depth, painterly digital art, " +
  "no characters, no foreground obstacles, horizontal game background, moody, vignette, high detail";

// Each biome has 3 prompts: original (index 0) + 2 variants. Variants share the
// same palette/mood as the original but vary cave composition to break the
// obvious tile repetition when scrolling.
const BIOMES = {
  abyss: {
    prompts: [
      "ultra-wide cinematic backdrop of a vast deep underground cave interior, " +
        "bioluminescent cyan and deep blue glow on distant stalactites and crystals, " +
        "abyssal blue-black palette" + SHARED,
      "ultra-wide cinematic backdrop of a deep underground cave seen from below looking up, " +
        "towering stalactites pierce the frame, faint cyan bioluminescence, " +
        "abyssal blue-black palette, distant pinpoints of glowing crystal" + SHARED,
      "ultra-wide cinematic backdrop of a vast underwater-feeling cavern chamber, " +
        "narrow passage flanked by tall blue crystal columns, distant cyan glow at the far end, " +
        "abyssal blue-black palette, deep negative space" + SHARED,
    ],
  },
  ember: {
    prompts: [
      "ultra-wide cinematic backdrop of a vast volcanic cave interior, " +
        "molten orange and crimson glow seeping from cracks in distant stalactites, " +
        "warm ember light, drifting ash, dark red-black palette" + SHARED,
      "ultra-wide cinematic backdrop of a volcanic cave with a wide chamber and a distant lava river, " +
        "orange and crimson glow reflecting off jagged rock walls, drifting embers and ash, " +
        "warm ember light, dark red-black palette" + SHARED,
      "ultra-wide cinematic backdrop of a narrow volcanic passage flanked by basalt columns, " +
        "molten cracks streak the columns with crimson glow, smoke and ash drift across the frame, " +
        "warm ember light, dark red-black palette" + SHARED,
    ],
  },
  void: {
    prompts: [
      "ultra-wide cinematic backdrop of a vast otherworldly cave interior, " +
        "violet and magenta bioluminescence on distant amethyst stalactites and crystals, " +
        "deep purple-black palette, surreal cosmic mood" + SHARED,
      "ultra-wide cinematic backdrop of an otherworldly cavern seen from below looking up, " +
        "enormous amethyst stalactites bristle overhead with violet and magenta glow, " +
        "deep purple-black palette, surreal cosmic mood, dust motes drifting" + SHARED,
      "ultra-wide cinematic backdrop of a wide otherworldly chamber with a distant violet starlit aperture, " +
        "tall magenta crystal columns frame the view, faint cosmic haze, " +
        "deep purple-black palette, surreal cosmic mood" + SHARED,
    ],
  },
  verdant: {
    prompts: [
      "ultra-wide cinematic backdrop of a vast overgrown cave interior, " +
        "emerald green bioluminescent moss and glowing spores on distant stalactites, " +
        "deep teal-black palette, lush damp atmosphere" + SHARED,
      "ultra-wide cinematic backdrop of an overgrown cavern seen from below looking up, " +
        "moss-laden stalactites drip with glowing emerald spores, hanging vines, " +
        "deep teal-black palette, lush damp atmosphere" + SHARED,
      "ultra-wide cinematic backdrop of a narrow mossy passage flanked by glowing green crystal columns, " +
        "ferns and luminous fungi cluster on rocky walls, drifting spore particles, " +
        "deep teal-black palette, lush damp atmosphere" + SHARED,
    ],
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

async function generate(filename, prompt) {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) throw new Error("REPLICATE_API_TOKEN missing");

  const res = await fetch(`https://api.replicate.com/v1/models/${MODEL}/predictions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "wait=60",
    },
    body: JSON.stringify({
      input: {
        prompt,
        aspect_ratio: "21:9",
        output_format: "png",
        output_quality: 90,
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
  const out = resolve(OUT_DIR, filename);
  writeFileSync(out, buf);
  console.log(`wrote ${out} (${(buf.length / 1024).toFixed(0)} KB)`);
}

// Variant index 0 -> `${biome}.png`, 1 -> `${biome}-2.png`, 2 -> `${biome}-3.png`.
function variantFilename(biome, idx) {
  return idx === 0 ? `${biome}.png` : `${biome}-${idx + 1}.png`;
}

async function main() {
  loadEnv();
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const requested = args.filter((a) => !a.startsWith("--"));
  const targets = requested.length ? requested : Object.keys(BIOMES);

  for (const biome of targets) {
    const cfg = BIOMES[biome];
    if (!cfg) {
      console.warn(`unknown biome: ${biome}`);
      continue;
    }
    for (let i = 0; i < cfg.prompts.length; i++) {
      const filename = variantFilename(biome, i);
      const out = resolve(OUT_DIR, filename);
      if (!force && existsSync(out)) {
        console.log(`skip ${filename} (exists, use --force to regenerate)`);
        continue;
      }
      console.log(`generating ${filename}...`);
      await generate(filename, cfg.prompts[i]);
    }
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
