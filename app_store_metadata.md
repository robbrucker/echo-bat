# Echo Bat — App Store Listing

Paste-ready copy for App Store Connect. Counts include spaces.

---

## Name (max 30 chars)

**Echo Bat: Ping the Dark** *(23 chars)*

Backups in case taken:
- Echo Bat: Sonar Flight *(23)*
- Echo Bat: Cave Runner *(22)*
- Echo Bat — Endless *(19)*

---

## Subtitle (max 30 chars)

**Tilt to fly. Sonar to see.** *(26 chars)*

Backups:
- One bat. One cave. One ping. *(28)*
- Sonar through the abyss. *(24)*
- Glow, glide, ping the dark. *(27)*

---

## Promotional Text (max 170 chars — editable any time without resubmission)

> **Glide a glowing bat through endless cave dark. Tilt to fly, tap to ping — the cave reveals itself only where your sonar lands. How deep can you go?**

*(149 chars)*

---

## Description (max 4000 chars)

```
ECHO BAT — PING THE DARK

A bat. A cave that goes on forever. A sonar pulse you can fire to light the world.

Tilt your phone to glide. Tap to send out a ping — the cave reveals itself only where the sonar lands, and only for as long as the wave travels. The rest is shadow.


ENDLESS CAVERN
A procedural cave that never ends. Every run threads new rock, new chambers, new biomes — Abyss blue, Ember orange, Void violet, Verdant green — each with its own glow and atmosphere.


SONAR FLIGHT
Pinging the dark is the whole loop. Every tap is a dash AND a sonar wave. Use them to dive-kill stinger enemies, smash crystals for points, and chain combos that stack up to 5x.


TILT-TO-STEER
Native motion controls calibrated to your hold. After each crash the game resets neutral to your current pose, so you can shift posture between runs without losing the line.


BOSS ENCOUNTERS
Every few kilometres a luminous cave guardian rises out of the dark. It pulses, fires hostile sonar rings, and only dies if you dash straight into it. Three pips. Two hits. One bat.


BUILT TO FEEL
- 4 biomes that crossfade as you travel
- Coordinated boom on every biome change — flash, shake, ring shockwave, audio sting
- Painted parallax backdrops, three variants per biome
- Hand-tuned WebAudio synthesis throughout — every sound generated, no samples
- Universal controls: tilt + tap on phone, arrow keys + space on web


NO ADS. NO IAP. NO TIMERS.
$0.99. One purchase. Endless cave.

How deep can you go?
```

*(~1480 chars — plenty of headroom)*

---

## Keywords (max 100 chars total, comma-separated, no spaces around commas)

```
bat,cave,sonar,tilt,endless,runner,arcade,ping,flight,glow,neon,indie,dash,action,abyss
```

*(85 chars)*

Tip: Apple ignores stop words like "the", "and", and ignores spaces — pack as many distinct nouns as possible.

---

## Category

- **Primary:** Games > Arcade
- **Secondary:** Games > Action

---

## Age Rating

- **4+** is honest — there's no violence (the "boss" is a friendly-looking glowing spirit; stingers shatter into sparks). No text input, no online features.
- The questionnaire will ask about cartoon violence — answer **None**. Realistic violence — None. Profanity — None. Gambling — None. Unrestricted web access — None. User-generated content — None. → 4+.

---

## Pricing

- **Tier 1 — $0.99 USD**, all territories.
- No in-app purchases.

---

## URLs

| Field | Value |
| --- | --- |
| Privacy Policy URL | https://echobat.xyz/privacy |
| Support URL | https://echobat.xyz/support *(or just `mailto:` your email)* |
| Marketing URL | https://echobat.xyz |

The privacy policy page is required even for an app that collects nothing — see `privacy.html` in this repo, drop it at `/privacy` on echobat.xyz.

---

## App Review Information

- **Sign-in required:** No
- **Demo account:** N/A
- **Notes for reviewer:**
  > Echo Bat is a single-player offline endless cave runner. Tilt the device or tap top/bottom to steer the bat; tap anywhere to dash and emit a sonar ping. No accounts, no network, no IAP. Motion access is required for tilt-to-steer (NSMotionUsageDescription); the game also works fully without motion via touch zones.

- **Contact email:** *(your Apple ID email)*

---

## Build Upload Checklist (Xcode)

1. `npm run build` (or `npm run ios:sync`) so `dist/` reflects current source.
2. In Xcode: open `ios/App/App.xcodeproj`.
3. Select **Any iOS Device (arm64)** as destination.
4. **Product → Archive**.
5. When the Organizer window opens: **Distribute App → App Store Connect → Upload → Next** through the prompts (let Xcode handle signing).
6. Wait ~10–30 minutes for App Store Connect to finish processing the build.
7. In App Store Connect → Echo Bat → 1.0 → Build → **Select** the uploaded build.
8. Fill in version notes (e.g. "Initial release.").
9. **Submit for review**. Apple typically reviews in 24–48 hours.

---

## Screenshots Required

Apple now only requires the **6.9" iPhone display** size (iPhone 16 Pro Max). They scale that asset down for smaller-screen devices.

- **6.9" iPhone:** 2868 × 1320 px (landscape, since the app is landscape-locked)
- iPad screenshots are **optional** — skip unless you want to advertise on iPad.
- Up to 10 screenshots, minimum 1.

Suggested set of 5:
1. **Menu** — title hero, painted abyss backdrop, "tap to fly" pulsing
2. **Mid-flight, abyss biome** — bat with cyan trail, sonar pings on cave walls, fireflies
3. **Boss encounter** — luminous guardian, HP pips, hostile ping rings
4. **Biome change moment** — biome boom flash with shockwave ring
5. **Crash overlay** — "CRASHED" with distance + best score
