import { useCallback, useMemo, useReducer } from 'react';
import { applyAction, createInitialState, isLegalAction } from '../engine';
import type { Action, GameState, PlayerId } from '../engine';
import { DEFAULT_CONFIG, seatControllers } from './config';
import type { GameConfig, SeatController } from './config';

export interface HistoryEntry {
  player: PlayerId;
  action: Action;
}

interface SessionState {
  config: GameConfig;
  game: GameState;
  history: HistoryEntry[];
}

type SessionEvent =
  | { type: 'play'; action: Action }
  | { type: 'restart'; config: GameConfig };

function reducer(session: SessionState, event: SessionEvent): SessionState {
  switch (event.type) {
    case 'play': {
      // Ignore stale or illegal input (e.g. a double click) instead of crashing the UI.
      if (!isLegalAction(session.game, event.action)) return session;
      const player = session.game.currentPlayer;
      const game = applyAction(session.game, event.action);
      return { ...session, game, history: [...session.history, { player, action: event.action }] };
    }
    case 'restart':
      return { config: event.config, game: createInitialState(), history: [] };
  }
}

export interface GameSession {
  config: GameConfig;
  game: GameState;
  history: readonly HistoryEntry[];
  controllers: [SeatController, SeatController];
  /** True if the player to move is controlled by a person on this device. */
  humanToMove: boolean;
  play: (action: Action) => void;
  restart: (config: GameConfig) => void;
}

export function useGameSession(initialConfig: GameConfig = DEFAULT_CONFIG): GameSession {
  const [session, dispatch] = useReducer(reducer, initialConfig, (config) => ({
    config,
    game: createInitialState(),
    history: [],
  }));

  const play = useCallback((action: Action) => dispatch({ type: 'play', action }), []);
  const restart = useCallback((config: GameConfig) => dispatch({ type: 'restart', config }), []);
  const controllers = useMemo(() => seatControllers(session.config), [session.config]);

  return {
    ...session,
    controllers,
    humanToMove:
      session.game.winner === null && controllers[session.game.currentPlayer].kind === 'human',
    play,
    restart,
  };
}
