import { useState } from 'react';
import { ArrowLeft, Check, Lock, Play, Sparkles, User } from 'lucide-react';
import {
  RUNNER_SKINS,
  TRAIL_STYLES,
  type RunnerSkinId,
  type RunnerSkinSpec,
  type TrailStyleId,
  type TrailStyleSpec,
} from '../game/cosmetics';
import { CharacterAvatar } from './CharacterAvatar';

interface SkinStoreModalProps {
  coins: number;
  unlockedSkins: RunnerSkinId[];
  equippedSkin: RunnerSkinId;
  unlockedTrails: TrailStyleId[];
  equippedTrail: TrailStyleId;
  onSelectOrUnlockSkin: (skin: RunnerSkinSpec) => void;
  onSelectOrUnlockTrail: (trail: TrailStyleSpec) => void;
  onBack: () => void;
  onPlay: () => void;
}

export function SkinStoreModal({
  coins,
  unlockedSkins,
  equippedSkin,
  unlockedTrails,
  equippedTrail,
  onSelectOrUnlockSkin,
  onSelectOrUnlockTrail,
  onBack,
  onPlay,
}: SkinStoreModalProps) {
  const [tab, setTab] = useState<'AVATARS' | 'TRAILS'>('AVATARS');

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-4 sm:p-6 bg-[#060714]/76 backdrop-blur-sm overflow-y-auto">
      <div className="neon-panel w-full max-w-3xl rounded-2xl p-5 sm:p-7 animate-screen-in my-auto max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-cyan-400/15 pb-4 shrink-0">
          <div>
            <h2 className="font-display font-bold text-2xl sm:text-3xl tracking-wide text-white">
              Skin Store
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
              Unlock neon runner avatars and trails with your collected coins.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-white/[0.04] border border-amber-400/25">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-300 shadow-[0_0_8px_#ffd166]" />
              <span className="font-mono-num font-bold text-sm sm:text-base text-amber-300">
                {coins.toLocaleString()}
              </span>
              <span className="text-xs text-slate-400">Coins</span>
            </div>

            <button
              type="button"
              onClick={onBack}
              className="min-h-[42px] px-3.5 py-2 rounded-lg border border-slate-700 text-slate-300 hover:text-white hover:border-cyan-400/50 transition-colors flex items-center gap-1.5 text-sm font-medium cursor-pointer whitespace-nowrap shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back</span>
            </button>
          </div>
        </div>

        {/* Category Tabs */}
        <div className="mt-4 flex items-center justify-between gap-3 shrink-0">
          <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-white/[0.04] border border-white/10">
            <button
              type="button"
              onClick={() => setTab('AVATARS')}
              className={`min-h-[40px] px-4 py-1.5 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                tab === 'AVATARS'
                  ? 'bg-cyan-400/18 text-white border border-cyan-400/40'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              <User className="w-4 h-4 text-cyan-300" />
              <span>Runner Avatars</span>
            </button>
            <button
              type="button"
              onClick={() => setTab('TRAILS')}
              className={`min-h-[40px] px-4 py-1.5 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                tab === 'TRAILS'
                  ? 'bg-pink-500/20 text-white border border-pink-400/40'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              <Sparkles className="w-4 h-4 text-pink-400" />
              <span>Visual Trails</span>
            </button>
          </div>

          <div className="hidden sm:block text-xs text-slate-400 font-mono-num">
            {tab === 'AVATARS'
              ? `${unlockedSkins.length}/${RUNNER_SKINS.length} Unlocked`
              : `${unlockedTrails.length}/${TRAIL_STYLES.length} Unlocked`}
          </div>
        </div>

        {/* Scrollable Store Items Grid */}
        <div className="mt-5 overflow-y-auto pr-1 flex-1">
          {tab === 'AVATARS' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {RUNNER_SKINS.map((skin) => {
                const isUnlocked = unlockedSkins.includes(skin.id);
                const isEquipped = equippedSkin === skin.id;
                const canAfford = coins >= skin.price;

                return (
                  <div
                    key={skin.id}
                    className={`rounded-xl p-4 flex flex-col justify-between transition-colors border ${
                      isEquipped
                        ? 'bg-cyan-400/[0.08] border-cyan-400/60'
                        : 'bg-white/[0.03] border-white/10 hover:border-white/25'
                    }`}
                  >
                    <div>
                      <RunnerAvatarPreview skin={skin} isEquipped={isEquipped} />
                      <div className="mt-3 flex items-center justify-between gap-2">
                        <h3 className="font-display font-bold text-base text-white">
                          {skin.name}
                        </h3>
                        {!isUnlocked && (
                          <span className="font-mono-num text-xs font-bold text-amber-300">
                            {skin.price}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-slate-400 leading-relaxed">
                        {skin.description}
                      </p>
                    </div>

                    <div className="mt-4">
                      <StoreActionButton
                        isUnlocked={isUnlocked}
                        isEquipped={isEquipped}
                        canAfford={canAfford}
                        price={skin.price}
                        coins={coins}
                        onClick={() => onSelectOrUnlockSkin(skin)}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {TRAIL_STYLES.map((trail) => {
                const isUnlocked = unlockedTrails.includes(trail.id);
                const isEquipped = equippedTrail === trail.id;
                const canAfford = coins >= trail.price;

                return (
                  <div
                    key={trail.id}
                    className={`rounded-xl p-4 flex flex-col justify-between transition-colors border ${
                      isEquipped
                        ? 'bg-pink-500/[0.09] border-pink-400/60'
                        : 'bg-white/[0.03] border-white/10 hover:border-white/25'
                    }`}
                  >
                    <div>
                      <TrailPreview trail={trail} />
                      <div className="mt-3 flex items-center justify-between gap-2">
                        <h3 className="font-display font-bold text-base text-white">
                          {trail.name}
                        </h3>
                        {!isUnlocked && (
                          <span className="font-mono-num text-xs font-bold text-amber-300">
                            {trail.price}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-slate-400 leading-relaxed">
                        {trail.description}
                      </p>
                    </div>

                    <div className="mt-4">
                      <StoreActionButton
                        isUnlocked={isUnlocked}
                        isEquipped={isEquipped}
                        canAfford={canAfford}
                        price={trail.price}
                        coins={coins}
                        onClick={() => onSelectOrUnlockTrail(trail)}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-5 pt-4 border-t border-cyan-400/15 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <span className="text-xs text-slate-400">
            Changes apply immediately to your runner on the highway.
          </span>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBack}
              className="min-h-[44px] px-5 py-2 rounded-xl border border-slate-700 text-slate-200 hover:bg-white/5 transition-colors text-sm font-medium cursor-pointer whitespace-nowrap shrink-0"
            >
              Done
            </button>
            <button
              type="button"
              onClick={onPlay}
              className="neon-btn-primary min-h-[44px] px-6 py-2 rounded-xl font-display font-bold text-sm tracking-wider text-white flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Start Run</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function StoreActionButton({
  isUnlocked,
  isEquipped,
  canAfford,
  price,
  coins,
  onClick,
}: {
  isUnlocked: boolean;
  isEquipped: boolean;
  canAfford: boolean;
  price: number;
  coins: number;
  onClick: () => void;
}) {
  if (isEquipped) {
    return (
      <button
        type="button"
        disabled
        className="w-full min-h-[42px] px-4 py-2 rounded-lg bg-cyan-400/15 border border-cyan-400/45 text-cyan-200 font-semibold text-sm flex items-center justify-center gap-1.5 cursor-default whitespace-nowrap"
      >
        <Check className="w-4 h-4" />
        <span>Equipped</span>
      </button>
    );
  }

  if (isUnlocked) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="w-full min-h-[42px] px-4 py-2 rounded-lg bg-white/[0.06] border border-white/20 hover:border-cyan-300/60 hover:bg-white/[0.12] text-white font-semibold text-sm transition-colors cursor-pointer whitespace-nowrap"
      >
        Equip
      </button>
    );
  }

  if (canAfford) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="neon-btn-primary w-full min-h-[42px] px-4 py-2 rounded-lg font-display font-bold text-sm tracking-wide text-white flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
      >
        <span>Unlock</span>
        <span aria-hidden="true">·</span>
        <span className="font-mono-num">{price}</span>
      </button>
    );
  }

  const missing = price - coins;
  return (
    <button
      type="button"
      disabled
      title={`Collect ${missing} more coins to unlock`}
      className="w-full min-h-[42px] px-4 py-2 rounded-lg bg-white/[0.02] border border-white/10 text-slate-500 font-medium text-xs sm:text-sm flex items-center justify-center gap-1.5 cursor-not-allowed whitespace-nowrap"
    >
      <Lock className="w-3.5 h-3.5 shrink-0" />
      <span>Need {missing.toLocaleString()} more</span>
    </button>
  );
}

function RunnerAvatarPreview({
  skin,
  isEquipped,
}: {
  skin: RunnerSkinSpec;
  isEquipped: boolean;
}) {
  return (
    <div
      className="relative h-32 rounded-lg bg-[#07091a] border border-white/5 flex items-center justify-center overflow-hidden p-2"
      style={{
        backgroundImage: `radial-gradient(circle at 50% 58%, ${skin.auraRgba}, transparent 72%)`,
      }}
    >
      <CharacterAvatar
        pose="idle_front"
        skinId={skin.id}
        animated={isEquipped}
        className="w-28 h-28"
        alt={`${skin.name} runner avatar`}
      />
    </div>
  );
}

function TrailPreview({ trail }: { trail: TrailStyleSpec }) {
  return (
    <div className="relative h-24 rounded-lg bg-[#07091a] border border-white/5 overflow-hidden flex items-center justify-center px-4">
      {trail.id === 'neon_ghost' && (
        <div className="flex items-center gap-3">
          {[0.18, 0.35, 0.58, 0.92].map((opacity, idx) => (
            <div
              key={idx}
              className="w-7 h-12 rounded-md border"
              style={{
                opacity,
                borderColor: trail.primaryHex,
                backgroundColor: `${trail.primaryHex}26`,
                boxShadow: `0 0 14px ${trail.primaryHex}66`,
              }}
            />
          ))}
        </div>
      )}

      {trail.id === 'plasma_sparks' && (
        <div className="relative w-full h-full flex items-center justify-center">
          <div
            className="w-full h-1 rounded-full opacity-50"
            style={{
              background: `linear-gradient(90deg, transparent, ${trail.primaryHex}, ${trail.secondaryHex})`,
            }}
          />
          {[14, 28, 42, 56, 68, 80, 88].map((left, idx) => (
            <span
              key={idx}
              className="absolute w-2.5 h-2.5 rotate-45"
              style={{
                left: `${left}%`,
                top: `${idx % 2 === 0 ? 34 : 58}%`,
                backgroundColor: idx % 2 === 0 ? trail.primaryHex : trail.secondaryHex,
                boxShadow: `0 0 10px ${idx % 2 === 0 ? trail.primaryHex : trail.secondaryHex}`,
              }}
            />
          ))}
        </div>
      )}

      {trail.id === 'solar_ribbon' && (
        <div className="w-full flex flex-col gap-2.5">
          <div
            className="h-2 rounded-full"
            style={{
              background: `linear-gradient(90deg, transparent 5%, ${trail.secondaryHex}, ${trail.primaryHex}, #ffffff)`,
              boxShadow: `0 0 14px ${trail.primaryHex}`,
            }}
          />
          <div
            className="h-2 rounded-full"
            style={{
              background: `linear-gradient(90deg, transparent 10%, ${trail.secondaryHex}, ${trail.primaryHex}, #ffffff)`,
              boxShadow: `0 0 14px ${trail.secondaryHex}`,
            }}
          />
        </div>
      )}

      {trail.id === 'prism_overdrive' && (
        <div className="w-full flex flex-col gap-2.5">
          <div
            className="h-2.5 rounded-full"
            style={{
              background:
                'linear-gradient(90deg, transparent 4%, #ff2a85, #ffd166, #38f9d7, #00f0ff, #c77dff, #ffffff)',
              boxShadow: '0 0 18px rgba(0, 240, 255, 0.7)',
            }}
          />
          <div
            className="h-1.5 rounded-full opacity-80"
            style={{
              background:
                'linear-gradient(90deg, transparent 12%, #c77dff, #00f0ff, #38f9d7, #ffd166, #ff2a85)',
            }}
          />
        </div>
      )}
    </div>
  );
}
