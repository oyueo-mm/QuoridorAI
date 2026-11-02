import type { GameConfig, GameMode } from '../session/config';
import type { MultiConfig } from '../session/MultiController';

/** What the Play screens need to start a game of any mode (owned by App). */
export interface PlaySetupApi {
  /** Mode being played now. */
  mode: GameMode;
  /** Settings of the two-player game / the multi-player game. */
  config: GameConfig;
  multiConfig: MultiConfig;
  startTwoPlayer: (config: GameConfig) => void;
  startMulti: (config: MultiConfig) => void;
  /** Asked by the home page: open the new-game tab (optionally with this mode selected). Changes with every request. */
  setupRequest: { at: number; mode?: GameMode } | null;
}
