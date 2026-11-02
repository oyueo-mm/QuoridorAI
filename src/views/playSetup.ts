import type { GameConfig, GameMode } from '../session/config';
import type { MultiRules } from '../engine';
import type { MultiConfig } from '../session/MultiController';

/** What the Play screens need to start a game of any mode (owned by App). */
export interface PlaySetupApi {
  /** Mode being played now. */
  mode: GameMode;
  /** Settings of the two-player game / the multi-player game. */
  config: GameConfig;
  multiConfig: MultiConfig;
  startTwoPlayer: (config: GameConfig) => void;
  /** `obstacleMap` = the map the mode preview already generated for these settings (reused, not generated again). */
  startMulti: (config: MultiConfig, options?: { obstacleMap?: MultiRules }) => void;
}
