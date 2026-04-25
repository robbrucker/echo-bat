import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "xyz.echobat.app",
  appName: "Echo Bat",
  // Capacitor copies the contents of this folder into the native shell on
  // `npx cap sync`. We build the web app to dist/ via `npm run build`.
  webDir: "dist",
  ios: {
    contentInset: "always",
    // Disable the white "splash" so the cave loads straight in.
    backgroundColor: "#050814",
    // Allow gestures to reach the canvas; Capacitor's default is fine but we
    // pin the value so an accidental upstream change can't bring back swipe
    // navigation that would steal touch events from the game.
    allowsLinkPreview: false,
  },
  // No live-reload `server.url` is set: shipped builds and Xcode runs both
  // load the bundled dist/. Add `server: { url: 'http://<your-mac-ip>:5173' }`
  // here temporarily if you want hot-reload from Vite into the simulator.
};

export default config;
