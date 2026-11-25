import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AchievementsModal,
  type AchievementsModalTab,
} from './components/AchievementsModal';
import { GameHud } from './components/GameHud';
import { GameOverOverlay } from './components/GameOverOverlay';
import { InstructionsModal } from './components/InstructionsModal';
import { MainMenu } from './components/MainMenu';
import { PauseOverlay } from './components/PauseOverlay';
import { SkinStoreModal } from './components/SkinStoreModal';
import type { AchievementId, CareerProfileStats } from './game/achievements';
import { AudioManager } from './game/AudioManager';
import type {
  RunnerSkinId,
  RunnerSkinSpec,
  TrailStyleId,
  TrailStyleSpec,
} from './game/cosmetics';
import { createNeonDashGame, type NeonDashController } from './game/createNeonDashGame';
import { SDKBridge } from './game/SDKBridge';
import { StorageManager } from './game/StorageManager';
import type { GameOverSummary, GameScreen, HudSnapshot } from './game/types';

const INITIAL_HUD: HudSnapshot = {
  score: 0,
  bestScore: 0,
  distance: 0,
  coins: 0,
  speedKmh: 80,
  multiplier: 1,
  isNewBest: false,
  nearMissCount: 0,
  activePowerUps: {
    shield: false,
    magnetRemaining: 0,
    magnetDuration: 8.5,
    multiplierRemaining: 0,
    multiplierDuration: 10,
    boostRemaining: 0,
    boostDuration: 5,
  },
};

export default function App() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<NeonDashController | null>(null);
  const bannerTimerRef = useRef<number | null>(null);
  const hintTimerRef = useRef<number | null>(null);
  const isRestartingRef = useRef(false);

  const [screen, setScreen] = useState<GameScreen>('MENU');
  const [achievementsTab, setAchievementsTab] = useState<AchievementsModalTab>('PROFILE');
  const [hud, setHud] = useState<HudSnapshot>(() => ({
    ...INITIAL_HUD,
    bestScore: StorageManager.getBestScore(),
  }));
  const [gameOverSummary, setGameOverSummary] = useState<GameOverSummary | null>(null);
  const [muted, setMuted] = useState<boolean>(() => AudioManager.isMuted());
  const [careerStats, setCareerStats] = useState<CareerProfileStats>(() =>
    StorageManager.getCareerProfileStats()
  );
  const [playerName, setPlayerName] = useState<string>(() =>
    StorageManager.getPlayerName()
  );
  const [unlockedAchievements, setUnlockedAchievements] = useState<AchievementId[]>(() =>
    StorageManager.evaluateAchievements().allUnlocked
  );
  const [featuredBadge, setFeaturedBadge] = useState<AchievementId | null>(() =>
    StorageManager.getFeaturedBadge()
  );
  const [unlockedSkins, setUnlockedSkins] = useState<RunnerSkinId[]>(() =>
    StorageManager.getUnlockedSkins()
  );
  const [equippedSkin, setEquippedSkin] = useState<RunnerSkinId>(() =>
    StorageManager.getEquippedSkin()
  );
  const [unlockedTrails, setUnlockedTrails] = useState<TrailStyleId[]>(() =>
    StorageManager.getUnlockedTrails()
  );
  const [equippedTrail, setEquippedTrail] = useState<TrailStyleId>(() =>
    StorageManager.getEquippedTrail()
  );
  const [banner, setBanner] = useState<{
    id: number;
    label: string;
    accent: 'cyan' | 'pink' | 'purple' | 'gold';
  } | null>(null);
  const [showSwipeHint, setShowSwipeHint] = useState(false);

  const refreshProfileAndAchievements = useCallback(() => {
    const { allUnlocked } = StorageManager.evaluateAchievements();
    setCareerStats(StorageManager.getCareerProfileStats());
    setUnlockedAchievements(allUnlocked);
    setFeaturedBadge(StorageManager.getFeaturedBadge());
  }, []);

  const clearTimers = useCallback(() => {
    if (bannerTimerRef.current !== null) {
      window.clearTimeout(bannerTimerRef.current);
      bannerTimerRef.current = null;
    }
    if (hintTimerRef.current !== null) {
      window.clearTimeout(hintTimerRef.current);
      hintTimerRef.current = null;
    }
  }, []);

  // Boot Phaser 3 game instance once
  useEffect(() => {
    if (!containerRef.current) return;
    SDKBridge.init();

    const controller = createNeonDashGame(containerRef.current, {
      onHudUpdate: (snapshot) => {
        setHud(snapshot);
      },
      onGameOver: (summary) => {
        setGameOverSummary(summary);
        refreshProfileAndAchievements();
        setScreen('GAMEOVER');
      },
      onPauseToggle: (paused) => {
        setScreen(paused ? 'PAUSED' : 'PLAYING');
      },
      onMuteToggle: (isMuted) => {
        setMuted(isMuted);
      },
      onBannerEvent: (label, accent) => {
        if (bannerTimerRef.current !== null) {
          window.clearTimeout(bannerTimerRef.current);
        }
        setBanner({ id: Date.now(), label, accent });
        bannerTimerRef.current = window.setTimeout(() => {
          setBanner(null);
          bannerTimerRef.current = null;
        }, 2100);
      },
    });

    controllerRef.current = controller;

    return () => {
      clearTimers();
      AudioManager.stopMusic();
      controller.destroy();
      controllerRef.current = null;
    };
  }, [clearTimers, refreshProfileAndAchievements]);

  const startRun = useCallback(
    async (fromGameOver = false) => {
      if (isRestartingRef.current) return;
      isRestartingRef.current = true;

      try {
        AudioManager.unlock();
        AudioManager.playButton();

        if (fromGameOver) {
          await SDKBridge.commercialBreak();
        }

        clearTimers();
        setBanner(null);
        setGameOverSummary(null);
        setScreen('PLAYING');
        setShowSwipeHint(true);

        hintTimerRef.current = window.setTimeout(() => {
          setShowSwipeHint(false);
          hintTimerRef.current = null;
        }, 3200);

        controllerRef.current?.startGame();
      } finally {
        isRestartingRef.current = false;
      }
    },
    [clearTimers]
  );

  const handlePause = useCallback(() => {
    AudioManager.playButton();
    controllerRef.current?.pauseGame();
  }, []);

  const handleResume = useCallback(() => {
    AudioManager.playButton();
    controllerRef.current?.resumeGame();
  }, []);

  const handleOpenInstructions = useCallback(() => {
    AudioManager.playButton();
    setScreen('INSTRUCTIONS');
  }, []);

  const handleOpenStore = useCallback(() => {
    AudioManager.playButton();
    refreshProfileAndAchievements();
    setScreen('STORE');
  }, [refreshProfileAndAchievements]);

  const handleOpenAchievements = useCallback(
    (tab: AchievementsModalTab = 'PROFILE') => {
      AudioManager.playButton();
      refreshProfileAndAchievements();
      controllerRef.current?.returnToMenu();
      setAchievementsTab(tab);
      setScreen('ACHIEVEMENTS');
    },
    [refreshProfileAndAchievements]
  );

  const handleReturnHome = useCallback(() => {
    AudioManager.playButton();
    clearTimers();
    setBanner(null);
    setShowSwipeHint(false);
    setGameOverSummary(null);
    refreshProfileAndAchievements();
    controllerRef.current?.returnToMenu();
    setScreen('MENU');
  }, [clearTimers, refreshProfileAndAchievements]);

  const handleToggleMute = useCallback(() => {
    const nextMuted = AudioManager.toggleMute();
    setMuted(nextMuted);
  }, []);

  const handleRenamePlayer = useCallback((name: string) => {
    AudioManager.playButton();
    const cleaned = StorageManager.setPlayerName(name);
    setPlayerName(cleaned);
  }, []);

  const handleSelectFeaturedBadge = useCallback((id: AchievementId) => {
    AudioManager.playButton();
    StorageManager.setFeaturedBadge(id);
    setFeaturedBadge(id);
  }, []);

  const handleSelectOrUnlockSkin = useCallback(
    (skin: RunnerSkinSpec) => {
      const alreadyUnlocked = unlockedSkins.includes(skin.id);
      if (alreadyUnlocked) {
        AudioManager.playButton();
        StorageManager.setEquippedSkin(skin.id);
        setEquippedSkin(skin.id);
        controllerRef.current?.setCosmetics(skin.id, equippedTrail);
        return;
      }

      if (!StorageManager.spendCoins(skin.price)) return;

      AudioManager.playPurchase();
      const nextUnlocked = StorageManager.unlockSkin(skin.id);
      StorageManager.setEquippedSkin(skin.id);
      setUnlockedSkins(nextUnlocked);
      setEquippedSkin(skin.id);
      refreshProfileAndAchievements();
      controllerRef.current?.setCosmetics(skin.id, equippedTrail);
    },
    [unlockedSkins, equippedTrail, refreshProfileAndAchievements]
  );

  const handleSelectOrUnlockTrail = useCallback(
    (trail: TrailStyleSpec) => {
      const alreadyUnlocked = unlockedTrails.includes(trail.id);
      if (alreadyUnlocked) {
        AudioManager.playButton();
        StorageManager.setEquippedTrail(trail.id);
        setEquippedTrail(trail.id);
        controllerRef.current?.setCosmetics(equippedSkin, trail.id);
        return;
      }

      if (!StorageManager.spendCoins(trail.price)) return;

      AudioManager.playPurchase();
      const nextUnlocked = StorageManager.unlockTrail(trail.id);
      StorageManager.setEquippedTrail(trail.id);
      setUnlockedTrails(nextUnlocked);
      setEquippedTrail(trail.id);
      refreshProfileAndAchievements();
      controllerRef.current?.setCosmetics(equippedSkin, trail.id);
    },
    [unlockedTrails, equippedSkin, refreshProfileAndAchievements]
  );

  // Convenient keyboard triggers on Menu, Instructions, Store, Achievements, and Game Over screens
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return;
      }

      if (screen === 'MENU' && (e.code === 'Enter' || e.code === 'Space')) {
        e.preventDefault();
        startRun(false);
      } else if (screen === 'GAMEOVER' && (e.code === 'Enter' || e.code === 'Space')) {
        e.preventDefault();
        startRun(true);
      } else if (
        (screen === 'INSTRUCTIONS' || screen === 'STORE' || screen === 'ACHIEVEMENTS') &&
        e.code === 'Escape'
      ) {
        e.preventDefault();
        handleReturnHome();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [screen, startRun, handleReturnHome]);

  return (
    <main className="relative w-full h-full overflow-hidden bg-[#060714]">
      {/* Live Full-Viewport Phaser 3 WebGL/Canvas Stage */}
      <div
        ref={containerRef}
        className="fixed inset-0 w-full h-full z-10"
        aria-label="Neon Dash game canvas"
      />

      {/* Screen Overlays */}
      {screen === 'MENU' && (
        <MainMenu
          playerName={playerName}
          equippedSkin={equippedSkin}
          bestScore={careerStats.bestScore}
          bestDistance={careerStats.bestDistance}
          totalCoins={careerStats.walletCoins}
          unlockedAchievements={unlockedAchievements}
          featuredBadge={featuredBadge}
          muted={muted}
          onPlay={() => startRun(false)}
          onOpenStore={handleOpenStore}
          onOpenAchievements={() => handleOpenAchievements('PROFILE')}
          onInstructions={handleOpenInstructions}
          onToggleMute={handleToggleMute}
        />
      )}

      {screen === 'STORE' && (
        <SkinStoreModal
          coins={careerStats.walletCoins}
          unlockedSkins={unlockedSkins}
          equippedSkin={equippedSkin}
          unlockedTrails={unlockedTrails}
          equippedTrail={equippedTrail}
          onSelectOrUnlockSkin={handleSelectOrUnlockSkin}
          onSelectOrUnlockTrail={handleSelectOrUnlockTrail}
          onBack={handleReturnHome}
          onPlay={() => startRun(false)}
        />
      )}

      {screen === 'ACHIEVEMENTS' && (
        <AchievementsModal
          initialTab={achievementsTab}
          playerName={playerName}
          equippedSkin={equippedSkin}
          stats={careerStats}
          unlockedAchievements={unlockedAchievements}
          featuredBadge={featuredBadge}
          onRenamePlayer={handleRenamePlayer}
          onSelectFeaturedBadge={handleSelectFeaturedBadge}
          onBack={handleReturnHome}
          onPlay={() => startRun(false)}
        />
      )}

      {screen === 'INSTRUCTIONS' && (
        <InstructionsModal
          onBack={handleReturnHome}
          onPlay={() => startRun(false)}
        />
      )}

      {(screen === 'PLAYING' || screen === 'PAUSED') && (
        <GameHud
          hud={hud}
          muted={muted}
          banner={banner}
          showSwipeHint={showSwipeHint && screen === 'PLAYING'}
          onPause={handlePause}
          onToggleMute={handleToggleMute}
        />
      )}

      {screen === 'PAUSED' && (
        <PauseOverlay
          hud={hud}
          muted={muted}
          onResume={handleResume}
          onRestart={() => startRun(false)}
          onHome={handleReturnHome}
          onToggleMute={handleToggleMute}
        />
      )}

      {screen === 'GAMEOVER' && gameOverSummary && (
        <GameOverOverlay
          summary={gameOverSummary}
          equippedSkin={equippedSkin}
          onRestart={() => startRun(true)}
          onHome={handleReturnHome}
          onViewAchievements={() => handleOpenAchievements('PROFILE')}
          onViewLeaderboard={() => handleOpenAchievements('LEADERBOARD')}
        />
      )}
    </main>
  );
}
