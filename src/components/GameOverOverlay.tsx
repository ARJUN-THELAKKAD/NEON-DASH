import { Award, Globe, Home, RotateCcw, Trophy } from 'lucide-react';
import { getAchievementSpec } from '../game/achievements';
import type { RunnerSkinId } from '../game/cosmetics';
import type { GameOverSummary } from '../game/types';
import { BadgeMedallion } from './BadgeMedallion';
import { CharacterAvatar } from './CharacterAvatar';

interface GameOverOverlayProps {
  summary: GameOverSummary;
  equippedSkin: RunnerSkinId;
  onRestart: () => void;
  onHome: () => void;
  onViewAchievements: () => void;
  onViewLeaderboard: () => void;
}

export function GameOverOverlay({
  summary,
  equippedSkin,
  onRestart,
  onHome,
  onViewAchievements,
  onViewLeaderboard,
}: GameOverOverlayProps) {
  const newBadges = summary.newlyUnlockedBadges
    .map((id) => getAchievementSpec(id))
    .filter((spec): spec is NonNullable<typeof spec> => Boolean(spec));

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-[#060714]/78 backdrop-blur-sm overflow-y-auto">
      <div className="neon-panel w-full max-w-md rounded-2xl p-6 sm:p-7 text-center animate-screen-in my-auto">
        <div className="flex justify-center mb-1">
          <CharacterAvatar
            pose={summary.isNewBest ? 'victory' : 'death'}
            skinId={equippedSkin}
            animated={summary.isNewBest}
            className="w-28 h-28"
            alt={summary.isNewBest ? 'Runner celebrating victory' : 'Runner defeated'}
          />
        </div>

        {summary.isNewBest && (
          <div className="inline-flex items-center gap-1.5 text-amber-300 text-sm font-semibold mb-1">
            <Trophy className="w-4 h-4" />
            <span>New Personal Best</span>
          </div>
        )}

        <h2
          className={`font-display font-bold text-3xl sm:text-4xl tracking-wide text-white ${
            summary.isNewBest ? 'neon-title-glow' : 'neon-pink-glow'
          }`}
        >
          {summary.isNewBest ? 'Victory Run!' : 'Game Over'}
        </h2>

        {/* Final Score & Best Score */}
        <div className="mt-6 grid grid-cols-2 gap-4 py-4 border-y border-cyan-400/15">
          <div>
            <div className="text-xs text-slate-400 font-medium">Final Score</div>
            <div className="mt-1 font-mono-num font-bold text-3xl text-[#00f0ff]">
              {summary.score.toLocaleString()}
            </div>
          </div>
          <div className="border-l border-white/10">
            <div className="text-xs text-slate-400 font-medium">Best Score</div>
            <div className="mt-1 font-mono-num font-bold text-3xl text-white">
              {summary.bestScore.toLocaleString()}
            </div>
          </div>
        </div>

        {/* Clean Run Metrics */}
        <div className="mt-5 grid grid-cols-2 gap-y-3 gap-x-4 text-sm text-left">
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Distance</span>
            <span className="font-mono-num font-semibold text-slate-100">
              {summary.distance.toLocaleString()}m
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Coins</span>
            <span className="font-mono-num font-semibold text-amber-300">
              {summary.coins.toLocaleString()}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Top Speed</span>
            <span className="font-mono-num font-semibold text-cyan-300">
              {summary.topSpeedKmh} km/h
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Near Misses</span>
            <span className="font-mono-num font-semibold text-pink-300">
              {summary.nearMissCount}
            </span>
          </div>
        </div>

        {/* Newly Unlocked Badges Callout */}
        {newBadges.length > 0 && (
          <div className="mt-5 pt-4 border-t border-cyan-400/15 text-left">
            <div className="flex items-center justify-between gap-2 mb-2.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-cyan-300">
                <Award className="w-4 h-4" />
                <span>
                  {newBadges.length === 1 ? 'New Badge Unlocked' : `${newBadges.length} New Badges Unlocked`}
                </span>
              </div>
              <button
                type="button"
                onClick={onViewAchievements}
                className="text-xs text-slate-300 hover:text-white underline underline-offset-2 cursor-pointer"
              >
                View Profile
              </button>
            </div>
            <div className="flex flex-col gap-2">
              {newBadges.slice(0, 3).map((badge) => (
                <div
                  key={badge.id}
                  className="flex items-center gap-3 p-2 rounded-lg bg-white/[0.04] border border-white/10"
                >
                  <BadgeMedallion achievement={badge} unlocked size="sm" />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white truncate">
                      {badge.badgeName}
                    </div>
                    <div className="text-xs text-slate-400 truncate">{badge.title}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="mt-6 flex flex-col gap-2.5">
          <div className="flex flex-col sm:flex-row gap-2.5">
            <button
              type="button"
              onClick={onRestart}
              className="neon-btn-primary flex-1 min-h-[50px] px-6 py-3 rounded-xl font-display font-bold text-base tracking-wider text-white flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Play Again</span>
            </button>

            <button
              type="button"
              onClick={onHome}
              className="min-h-[50px] px-5 py-3 rounded-xl bg-white/[0.04] border border-slate-700 hover:border-cyan-400/50 hover:text-white text-slate-200 font-medium text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Home className="w-4 h-4" />
              <span>Home</span>
            </button>
          </div>

          <button
            type="button"
            onClick={onViewLeaderboard}
            className="min-h-[46px] w-full px-5 py-2.5 rounded-xl bg-cyan-400/[0.08] border border-cyan-400/35 hover:bg-cyan-400/15 hover:border-cyan-300/60 text-cyan-200 font-medium text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
          >
            <Globe className="w-4 h-4 text-[#00f0ff]" />
            <span>Submit Score &amp; Global Top 10</span>
          </button>
        </div>
      </div>
    </div>
  );
}
