import type { AchievementId } from './achievements';

export type GameScreen =
  | 'MENU'
  | 'INSTRUCTIONS'
  | 'STORE'
  | 'ACHIEVEMENTS'
  | 'PLAYING'
  | 'PAUSED'
  | 'GAMEOVER';

export type PowerUpType = 'SHIELD' | 'MAGNET' | 'MULTIPLIER' | 'BOOST';

export type ObstacleType = 'LOW' | 'HIGH' | 'FULL' | 'DRONE';

export interface ActivePowerUps {
  shield: boolean;
  magnetRemaining: number;
  magnetDuration: number;
  multiplierRemaining: number;
  multiplierDuration: number;
  boostRemaining: number;
  boostDuration: number;
}

export interface HudSnapshot {
  score: number;
  bestScore: number;
  distance: number;
  coins: number;
  speedKmh: number;
  multiplier: number;
  isNewBest: boolean;
  nearMissCount: number;
  activePowerUps: ActivePowerUps;
}

export interface GameOverSummary {
  score: number;
  bestScore: number;
  isNewBest: boolean;
  distance: number;
  coins: number;
  nearMissCount: number;
  topSpeedKmh: number;
  newlyUnlockedBadges: AchievementId[];
}

export interface GameCallbacks {
  onHudUpdate: (hud: HudSnapshot) => void;
  onGameOver: (summary: GameOverSummary) => void;
  onPauseToggle: (paused: boolean) => void;
  onMuteToggle: (muted: boolean) => void;
  onBannerEvent: (label: string, accent: 'cyan' | 'pink' | 'purple' | 'gold') => void;
}
