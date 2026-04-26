// Replicate Kling 2.5 Turbo Pro image-to-video. Uses our existing 9:16
// vertical poster as the start frame and animates dramatic forward flight
// motion. Output is a TikTok / Reels-shaped MP4.
//
//   node scripts/generate-video.mjs

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const OUT_DIR = resolve(ROOT, "public/marketing");
const SOURCE_IMAGE = resolve(ROOT, "public/marketing/poster.png");
const RESIZED_TMP = "/tmp/echobat-start-frame.png";

const MODEL = "kwaivgi/kling-v2.5-turbo-pro";

const PROMPT =
  "Magical glowing electric-blue bat creature flies forward through a vast " +
  "underground cave. Wings flap dramatically, leaving streaks of cyan energy " +
  "and motion trails. Glowing fireflies and dust motes blur past with " +
  "parallax depth. Cave walls and stalactites rush by. Cinematic forward " +
  "camera dolly through the cave. Sense of speed, flight, magic. Vibrant " +
  "blue bioluminescence. Dramatic chiaroscuro lighting. Smooth motion.";

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

function prepareStartFrame() {
  // Kling can take large images but the JSON request gets huge. Downscale to
  // 1280 max dimension — plenty for a video start frame.
  execSync(`sips -Z 1280 "${SOURCE_IMAGE}" --out "${RESIZED_TMP}"`, { stdio: "pipe" });
  const buf = readFileSync(RESIZED_TMP);
  console.log(`start frame: ${(buf.length / 1024).toFixed(0)} KB`);
  return `data:image/png;base64,${buf.toString("base64")}`;
}

async function main() {
  loadEnv();
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) throw new Error("REPLICATE_API_TOKEN missing");

  const startImage = prepareStartFrame();

  console.log("submitting prediction (Kling 2.5 Turbo Pro)...");
  const res = await fetch(`https://api.replicate.com/v1/models/${MODEL}/predictions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "wait=60",
    },
    body: JSON.stringify({
      input: {
        prompt: PROMPT,
        start_image: startImage,
        duration: 10, // 5 or 10 seconds
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Replicate ${res.status}: ${body}`);
  }
  let pred = await res.json();
  console.log(`prediction ${pred.id} - ${pred.status}`);

  // Kling video gen takes ~2-5 minutes.
  while (pred.status !== "succeeded" && pred.status !== "failed" && pred.status !== "canceled") {
    await new Promise((r) => setTimeout(r, 5000));
    const poll = await fetch(`https://api.replicate.com/v1/predictions/${pred.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!poll.ok) throw new Error(`poll ${poll.status}: ${await poll.text()}`);
    pred = await poll.json();
    process.stdout.write(`  status: ${pred.status}\r`);
  }
  console.log();

  if (pred.status !== "succeeded") {
    throw new Error(`prediction ${pred.status}: ${JSON.stringify(pred.error)}`);
  }
  const url = Array.isArray(pred.output) ? pred.output[0] : pred.output;
  if (!url) throw new Error("no output url in prediction");

  console.log("downloading...");
  const vid = await fetch(url);
  if (!vid.ok) throw new Error(`download failed: ${vid.status}`);
  const buf = Buffer.from(await vid.arrayBuffer());

  mkdirSync(OUT_DIR, { recursive: true });
  const out = resolve(OUT_DIR, "echobat-tiktok.mp4");
  writeFileSync(out, buf);
  console.log(`wrote ${out} (${(buf.length / 1024 / 1024).toFixed(1)} MB)`);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
