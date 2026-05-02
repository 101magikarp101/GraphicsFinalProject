import battleThemeUrl from "@/assets/sounds/battle-theme.mp3";

const PLAYER_HIT_VOLUME = 0.7;
const BATTLE_MUSIC_VOLUME = 0.38;

export interface SoundEffects {
  playPlayerHit(): void;
  startBattleMusic(): void;
  stopBattleMusic(): void;
  dispose(): void;
}

export function createSoundEffects(): SoundEffects {
  const playerHitSound = new Audio(battleThemeUrl);
  const battleMusic = new Audio(battleThemeUrl);
  playerHitSound.preload = "auto";
  playerHitSound.volume = PLAYER_HIT_VOLUME;
  battleMusic.preload = "auto";
  battleMusic.volume = BATTLE_MUSIC_VOLUME;
  battleMusic.loop = true;
  playerHitSound.load();
  battleMusic.load();

  if (typeof window !== "undefined") {
    const unlock = () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);

      const wasMuted = playerHitSound.muted;
      playerHitSound.muted = true;
      void playerHitSound
        .play()
        .then(() => {
          playerHitSound.pause();
          playerHitSound.currentTime = 0;
        })
        .catch(() => {})
        .finally(() => {
          playerHitSound.muted = wasMuted;
        });

      const battleWasMuted = battleMusic.muted;
      battleMusic.muted = true;
      void battleMusic
        .play()
        .then(() => {
          battleMusic.pause();
          battleMusic.currentTime = 0;
        })
        .catch(() => {})
        .finally(() => {
          battleMusic.muted = battleWasMuted;
        });
    };

    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("keydown", unlock);
  }

  return {
    playPlayerHit() {
      playerHitSound.pause();
      playerHitSound.currentTime = 0;
      void playerHitSound.play().catch(() => {});
    },
    startBattleMusic() {
      if (!battleMusic.paused) return;
      battleMusic.currentTime = 0;
      void battleMusic.play().catch(() => {});
    },
    stopBattleMusic() {
      battleMusic.pause();
      battleMusic.currentTime = 0;
    },
    dispose() {
      battleMusic.pause();
      battleMusic.currentTime = 0;
      playerHitSound.pause();
      playerHitSound.currentTime = 0;
    },
  };
}
