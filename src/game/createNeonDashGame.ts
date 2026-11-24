import Phaser from 'phaser';
import { GameScene } from './GameScene';
import type { GameCallbacks } from './types';

import type { RunnerSkinId, TrailStyleId } from './cosmetics';

export interface NeonDashController {
  startGame: () => void;
  pauseGame: () => void;
  resumeGame: () => void;
  returnToMenu: () => void;
  setCosmetics: (skinId: RunnerSkinId, trailId: TrailStyleId) => void;
  mobileAction: (action: 'LEFT' | 'RIGHT' | 'JUMP' | 'SLIDE') => void;
  destroy: () => void;
}

export function createNeonDashGame(
  parent: HTMLElement,
  callbacks: GameCallbacks
): NeonDashController {
  const scene = new GameScene(callbacks);

  const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    parent,
    width: parent.clientWidth || window.innerWidth,
    height: parent.clientHeight || window.innerHeight,
    backgroundColor: '#060714',
    antialias: true,
    powerPreference: 'high-performance',
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    render: {
      pixelArt: false,
      roundPixels: false,
    },
    scene: [scene],
  };

  const game = new Phaser.Game(config);

  const handleVisibility = () => {
    if (document.hidden) {
      scene.pauseGame();
    }
  };
  document.addEventListener('visibilitychange', handleVisibility);

  return {
    startGame: () => scene.startNewGame(),
    pauseGame: () => scene.pauseGame(),
    resumeGame: () => scene.resumeGame(),
    returnToMenu: () => scene.enterAttractMode(),
    setCosmetics: (skinId, trailId) => scene.setCosmetics(skinId, trailId),
    mobileAction: (action) => scene.mobileAction(action),
    destroy: () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      game.destroy(true);
    },
  };
}
