# NEON DASH

A futuristic 3-lane endless runner built with Phaser 3, React, TypeScript, Tailwind CSS, Web Audio synthesis, and Firebase Firestore global leaderboards.

## Features
- **3-Lane Endless Runner**: Smooth lane switching, jumping, fast-fall slam, and sliding with desktop keyboard (`Arrow Keys` / `WASD` / `Space`) and mobile touch swipe controls.
- **Progressive Difficulty**: Welcoming opening pace (`80 km/h`) that scales progressively through 4 distance phases into high-speed overdrive (`300+ km/h`).
- **Power-Ups**: Energy Shield, Coin Magnet, 2x Score Multiplier, and Hyper Boost Overdrive.
- **Skin & Trail Store**: Spend collected coins to unlock neon runner avatars and visual trails.
- **Achievements & Profile**: 10 lifetime milestones with unlockable featured profile badges and editable callsign.
- **Global Top 10 Leaderboard**: Live Firestore leaderboard with Google Sign-In and verified score submission.
- **Procedural Synthwave Audio**: Built-in Web Audio API background music and sound effects with mute toggle.

## Local Setup

```bash
npm install
npm run dev
```

Open `http://localhost:3000` in your browser.

## Production Build

```bash
npm run build
```

The compiled HTML5 output is generated in `dist/`, ready for static hosting or Poki / CrazyGames SDK integration.
