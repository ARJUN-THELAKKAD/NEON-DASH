import {
  ACHIEVEMENTS,
  type AchievementId,
  type CareerProfileStats,
} from './achievements';
import type { RunnerSkinId, TrailStyleId } from './cosmetics';

const KEYS = {
  BEST_SCORE: 'neon_dash_best_score_v1',
  BEST_DISTANCE: 'neon_dash_best_distance_v1',
  TOTAL_DISTANCE: 'neon_dash_total_distance_v1',
  TOTAL_COINS: 'neon_dash_total_coins_v1',
  LIFETIME_COINS: 'neon_dash_lifetime_coins_v1',
  TOTAL_RUNS: 'neon_dash_total_runs_v1',
  TOTAL_NEAR_MISSES: 'neon_dash_total_nearmisses_v1',
  TOTAL_SMASHES: 'neon_dash_total_smashes_v1',
  TOP_SPEED: 'neon_dash_top_speed_v1',
  MUTED: 'neon_dash_muted_v1',
  UNLOCKED_SKINS: 'neon_dash_unlocked_skins_v1',
  EQUIPPED_SKIN: 'neon_dash_equipped_skin_v1',
  UNLOCKED_TRAILS: 'neon_dash_unlocked_trails_v1',
  EQUIPPED_TRAIL: 'neon_dash_equipped_trail_v1',
  UNLOCKED_ACHIEVEMENTS: 'neon_dash_unlocked_achievements_v1',
  FEATURED_BADGE: 'neon_dash_featured_badge_v1',
  PLAYER_NAME: 'neon_dash_player_name_v1',
} as const;

function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage quota or private-browsing restrictions
  }
}

function getPositiveInt(key: string): number {
  const raw = safeGet(key);
  const parsed = raw ? parseInt(raw, 10) : 0;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function parseIdList<T extends string>(raw: string | null, fallback?: T): T[] {
  if (!raw) return fallback ? [fallback] : [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const cleaned = parsed.filter((item): item is T => typeof item === 'string');
      if (fallback && !cleaned.includes(fallback)) cleaned.unshift(fallback);
      return cleaned;
    }
  } catch {
    // Fallback to default
  }
  return fallback ? [fallback] : [];
}

export const StorageManager = {
  getBestScore(): number {
    return getPositiveInt(KEYS.BEST_SCORE);
  },

  setBestScore(score: number): number {
    const current = this.getBestScore();
    const next = Math.max(current, Math.floor(score));
    safeSet(KEYS.BEST_SCORE, String(next));
    return next;
  },

  getBestDistance(): number {
    return getPositiveInt(KEYS.BEST_DISTANCE);
  },

  setBestDistance(distance: number): number {
    const current = this.getBestDistance();
    const next = Math.max(current, Math.floor(distance));
    safeSet(KEYS.BEST_DISTANCE, String(next));
    return next;
  },

  getTotalDistance(): number {
    return Math.max(getPositiveInt(KEYS.TOTAL_DISTANCE), this.getBestDistance());
  },

  addDistance(distance: number): number {
    const next = this.getTotalDistance() + Math.max(0, Math.floor(distance));
    safeSet(KEYS.TOTAL_DISTANCE, String(next));
    return next;
  },

  getTotalCoins(): number {
    return getPositiveInt(KEYS.TOTAL_COINS);
  },

  getLifetimeCoins(): number {
    return Math.max(getPositiveInt(KEYS.LIFETIME_COINS), this.getTotalCoins());
  },

  addCoins(amount: number): number {
    const gain = Math.max(0, Math.floor(amount));
    const nextWallet = this.getTotalCoins() + gain;
    const nextLifetime = this.getLifetimeCoins() + gain;
    safeSet(KEYS.TOTAL_COINS, String(nextWallet));
    safeSet(KEYS.LIFETIME_COINS, String(nextLifetime));
    return nextWallet;
  },

  spendCoins(amount: number): boolean {
    const cost = Math.max(0, Math.floor(amount));
    const current = this.getTotalCoins();
    if (current < cost) return false;
    // Preserve lifetime coins before spending from wallet
    safeSet(KEYS.LIFETIME_COINS, String(this.getLifetimeCoins()));
    safeSet(KEYS.TOTAL_COINS, String(current - cost));
    return true;
  },

  getTotalRuns(): number {
    return getPositiveInt(KEYS.TOTAL_RUNS);
  },

  incrementRuns(): number {
    const next = this.getTotalRuns() + 1;
    safeSet(KEYS.TOTAL_RUNS, String(next));
    return next;
  },

  getTotalNearMisses(): number {
    return getPositiveInt(KEYS.TOTAL_NEAR_MISSES);
  },

  addNearMisses(count: number): number {
    const next = this.getTotalNearMisses() + Math.max(0, Math.floor(count));
    safeSet(KEYS.TOTAL_NEAR_MISSES, String(next));
    return next;
  },

  getTotalObstaclesSmashed(): number {
    return getPositiveInt(KEYS.TOTAL_SMASHES);
  },

  addObstaclesSmashed(count: number): number {
    const next = this.getTotalObstaclesSmashed() + Math.max(0, Math.floor(count));
    safeSet(KEYS.TOTAL_SMASHES, String(next));
    return next;
  },

  getTopSpeedKmh(): number {
    return getPositiveInt(KEYS.TOP_SPEED);
  },

  recordTopSpeedKmh(speed: number): number {
    const next = Math.max(this.getTopSpeedKmh(), Math.floor(speed));
    safeSet(KEYS.TOP_SPEED, String(next));
    return next;
  },

  getUnlockedSkins(): RunnerSkinId[] {
    return parseIdList<RunnerSkinId>(safeGet(KEYS.UNLOCKED_SKINS), 'cyber_pulse');
  },

  unlockSkin(skinId: RunnerSkinId): RunnerSkinId[] {
    const current = this.getUnlockedSkins();
    if (!current.includes(skinId)) {
      current.push(skinId);
      safeSet(KEYS.UNLOCKED_SKINS, JSON.stringify(current));
    }
    return current;
  },

  getEquippedSkin(): RunnerSkinId {
    const saved = safeGet(KEYS.EQUIPPED_SKIN) as RunnerSkinId | null;
    const unlocked = this.getUnlockedSkins();
    if (saved && unlocked.includes(saved)) return saved;
    return 'cyber_pulse';
  },

  setEquippedSkin(skinId: RunnerSkinId): void {
    safeSet(KEYS.EQUIPPED_SKIN, skinId);
  },

  getUnlockedTrails(): TrailStyleId[] {
    return parseIdList<TrailStyleId>(safeGet(KEYS.UNLOCKED_TRAILS), 'neon_ghost');
  },

  unlockTrail(trailId: TrailStyleId): TrailStyleId[] {
    const current = this.getUnlockedTrails();
    if (!current.includes(trailId)) {
      current.push(trailId);
      safeSet(KEYS.UNLOCKED_TRAILS, JSON.stringify(current));
    }
    return current;
  },

  getEquippedTrail(): TrailStyleId {
    const saved = safeGet(KEYS.EQUIPPED_TRAIL) as TrailStyleId | null;
    const unlocked = this.getUnlockedTrails();
    if (saved && unlocked.includes(saved)) return saved;
    return 'neon_ghost';
  },

  setEquippedTrail(trailId: TrailStyleId): void {
    safeSet(KEYS.EQUIPPED_TRAIL, trailId);
  },

  getCareerProfileStats(): CareerProfileStats {
    const extraSkins = Math.max(0, this.getUnlockedSkins().length - 1);
    const extraTrails = Math.max(0, this.getUnlockedTrails().length - 1);
    return {
      bestScore: this.getBestScore(),
      bestDistance: this.getBestDistance(),
      totalDistance: this.getTotalDistance(),
      lifetimeCoins: this.getLifetimeCoins(),
      walletCoins: this.getTotalCoins(),
      totalRuns: this.getTotalRuns(),
      totalNearMisses: this.getTotalNearMisses(),
      totalObstaclesSmashed: this.getTotalObstaclesSmashed(),
      topSpeedKmh: this.getTopSpeedKmh(),
      unlockedCosmeticsCount: extraSkins + extraTrails,
    };
  },

  getUnlockedAchievements(): AchievementId[] {
    return parseIdList<AchievementId>(safeGet(KEYS.UNLOCKED_ACHIEVEMENTS));
  },

  evaluateAchievements(): {
    allUnlocked: AchievementId[];
    newlyUnlocked: AchievementId[];
  } {
    const stats = this.getCareerProfileStats();
    const existing = new Set<AchievementId>(this.getUnlockedAchievements());
    const newlyUnlocked: AchievementId[] = [];

    for (const ach of ACHIEVEMENTS) {
      if (!existing.has(ach.id) && ach.getCurrent(stats) >= ach.target) {
        existing.add(ach.id);
        newlyUnlocked.push(ach.id);
      }
    }

    const allUnlocked = Array.from(existing);
    if (newlyUnlocked.length > 0) {
      safeSet(KEYS.UNLOCKED_ACHIEVEMENTS, JSON.stringify(allUnlocked));
      // Auto-feature the first badge unlocked if player hasn't selected one yet
      if (!safeGet(KEYS.FEATURED_BADGE)) {
        safeSet(KEYS.FEATURED_BADGE, newlyUnlocked[0]);
      }
    }

    return { allUnlocked, newlyUnlocked };
  },

  getFeaturedBadge(): AchievementId | null {
    const unlocked = this.getUnlockedAchievements();
    if (unlocked.length === 0) return null;
    const saved = safeGet(KEYS.FEATURED_BADGE) as AchievementId | null;
    if (saved && unlocked.includes(saved)) return saved;
    return unlocked[unlocked.length - 1];
  },

  setFeaturedBadge(id: AchievementId): void {
    safeSet(KEYS.FEATURED_BADGE, id);
  },

  getPlayerName(): string {
    const saved = safeGet(KEYS.PLAYER_NAME)?.trim();
    return saved && saved.length > 0 ? saved.slice(0, 18) : 'Neon Runner';
  },

  setPlayerName(name: string): string {
    const cleaned = name.trim().slice(0, 18) || 'Neon Runner';
    safeSet(KEYS.PLAYER_NAME, cleaned);
    return cleaned;
  },

  getMuted(): boolean {
    return safeGet(KEYS.MUTED) === 'true';
  },

  setMuted(muted: boolean): void {
    safeSet(KEYS.MUTED, muted ? 'true' : 'false');
  },
};
