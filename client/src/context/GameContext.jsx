import { createContext, useContext, useReducer } from "react";

const GameContext = createContext(null);

const initialState = {
  sessionId: null,
  playerId: null,
  playerName: null,
  difficulty: "medium",
  players: [],
  currentRound: 1,
  letter: null,
  round4Letters: [],
  scores: [],
  status: "idle",
  lifelineAvailable: true,
  questionsAskedThisRound: 0,
  totalQuestionsThisRound: 15,
};

function gameReducer(state, action) {
  switch (action.type) {
    case "SET_SESSION":
      return {
        ...state,
        sessionId: action.payload.sessionId,
        playerId: action.payload.playerId,
        playerName: action.payload.playerName,
        difficulty: action.payload.difficulty,
        players: action.payload.players,
        lifelineAvailable: true,
        scores: action.payload.players.map((p) => ({
          playerId: p.playerId,
          name: p.name,
          score: 0,
          isHuman: p.isHuman,
          isEliminated: false,
        })),
        status: "active",
      };
    case "LETTER_SELECTED":
      return {
        ...state,
        letter: action.payload.letter,
        currentRound: action.payload.round,
      };
    case "UPDATE_SCORES":
      return {
        ...state,
        scores: action.payload.scores,
        questionsAskedThisRound:
          action.payload.questionsAskedThisRound ??
          state.questionsAskedThisRound,
        totalQuestionsThisRound:
          action.payload.totalQuestionsThisRound ??
          state.totalQuestionsThisRound,
      };
    case "LIFELINE_USED":
      return { ...state, lifelineAvailable: false };
    case "ROUND_OVER":
      return {
        ...state,
        currentRound: action.payload.nextRound,
        letter: null,
        round4Letters: action.payload.round4Letters || [],
        questionsAskedThisRound: 0,
        totalQuestionsThisRound: action.payload.totalQuestionsThisRound || 15,
        scores: action.payload.scores || state.scores,
      };
    case "GAME_OVER":
      return { ...state, status: "finished" };
    case "RESET":
      return initialState;
    default:
      return state;
  }
}

// eslint-disable-next-line react-refresh/only-export-components
export function GameProvider({ children }) {
  const [state, dispatch] = useReducer(gameReducer, initialState);
  return (
    <GameContext.Provider value={{ state, dispatch }}>
      {children}
    </GameContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useGame() {
  const context = useContext(GameContext);
  if (!context) throw new Error("useGame must be used within a GameProvider");
  return context;
}
