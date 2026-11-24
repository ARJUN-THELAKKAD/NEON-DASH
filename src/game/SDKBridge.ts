/**
 * Portal SDK Bridge ready for Poki and CrazyGames HTML5 distribution.
 * Detects host SDKs automatically at runtime and safely falls back to no-op in standalone mode.
 */

interface PokiSDKGlobal {
  init?: () => Promise<void>;
  gameLoadingFinished?: () => void;
  gameplayStart?: () => void;
  gameplayStop?: () => void;
  commercialBreak?: () => Promise<void>;
  happyTime?: (intensity?: number) => void;
}

interface CrazyGamesSDKGlobal {
  SDK?: {
    init?: () => Promise<void>;
    game?: {
      gameplayStart?: () => void;
      gameplayStop?: () => void;
      happytime?: () => void;
      loadingStart?: () => void;
      loadingStop?: () => void;
    };
    ad?: {
      requestAd?: (type: 'midgame' | 'rewarded') => Promise<void>;
    };
  };
}

declare global {
  interface Window {
    PokiSDK?: PokiSDKGlobal;
    CrazyGames?: CrazyGamesSDKGlobal;
  }
}

class PortalSDKBridge {
  private initialized = false;
  private isGameplayActive = false;

  async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    try {
      if (window.PokiSDK?.init) {
        await window.PokiSDK.init();
      } else if (window.CrazyGames?.SDK?.init) {
        await window.CrazyGames.SDK.init();
      }
    } catch {
      // Standalone mode or blocked SDK script
    }
  }

  loadingFinished(): void {
    try {
      window.PokiSDK?.gameLoadingFinished?.();
      window.CrazyGames?.SDK?.game?.loadingStop?.();
    } catch {
      // Ignore portal errors
    }
  }

  gameplayStart(): void {
    if (this.isGameplayActive) return;
    this.isGameplayActive = true;
    try {
      window.PokiSDK?.gameplayStart?.();
      window.CrazyGames?.SDK?.game?.gameplayStart?.();
    } catch {
      // Ignore portal errors
    }
  }

  gameplayStop(): void {
    if (!this.isGameplayActive) return;
    this.isGameplayActive = false;
    try {
      window.PokiSDK?.gameplayStop?.();
      window.CrazyGames?.SDK?.game?.gameplayStop?.();
    } catch {
      // Ignore portal errors
    }
  }

  happyTime(intensity = 0.6): void {
    try {
      window.PokiSDK?.happyTime?.(intensity);
      window.CrazyGames?.SDK?.game?.happytime?.();
    } catch {
      // Ignore portal errors
    }
  }

  async commercialBreak(): Promise<void> {
    try {
      if (window.PokiSDK?.commercialBreak) {
        await window.PokiSDK.commercialBreak();
      } else if (window.CrazyGames?.SDK?.ad?.requestAd) {
        await window.CrazyGames.SDK.ad.requestAd('midgame');
      }
    } catch {
      // Ad blocked or standalone
    }
  }
}

export const SDKBridge = new PortalSDKBridge();
