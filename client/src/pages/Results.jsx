import { useNavigate, useLocation } from "react-router-dom";
import { useGame } from "../context/GameContext";
import socket from "../socket/socket";

export default function Results() {
  const { dispatch } = useGame();
  const navigate = useNavigate();
  const location = useLocation();
  const { winner, finalScores } = location.state || {};

  function handlePlayAgain() {
    sessionStorage.removeItem("alphawiz_session");
    dispatch({ type: "RESET" });
    socket.disconnect();
    navigate("/");
  }

  return (
    <div style={s.container}>
      <h1 style={s.title}>Game Over</h1>

      {winner && (
        <div style={s.winnerCard}>
          <p style={s.winnerLabel}>Winner</p>
          <p style={s.winnerName}>
            {winner.name}
            {winner.isHuman ? " 👤" : " 🤖"}
          </p>
          <p style={s.winnerScore}>¢{winner.score}</p>
        </div>
      )}

      {finalScores && (
        <div style={s.scoreTable}>
          <p style={s.tableTitle}>Final Scores</p>
          {[...finalScores]
            .sort((a, b) => b.score - a.score)
            .map((p, i) => (
              <div
                key={p.playerId}
                style={{
                  ...s.scoreRow,
                  background: p.isWinner ? "#1f1f0a" : "#1a1a2e",
                  borderColor: p.isWinner ? "#f5c518" : "transparent",
                }}
              >
                <span style={s.rank}>#{i + 1}</span>
                <span style={s.scoreName}>
                  {p.name} {p.isHuman ? "👤" : "🤖"}
                </span>
                <span
                  style={{
                    ...s.scoreVal,
                    color: p.isWinner ? "#f5c518" : "#fff",
                  }}
                >
                  ¢{p.score}
                </span>
              </div>
            ))}
        </div>
      )}

      <button style={s.btn} onClick={handlePlayAgain}>
        Play Again
      </button>
    </div>
  );
}

const s = {
  container: {
    minHeight: "100vh",
    background: "#0f0f1a",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "1.5rem",
    padding: "2rem",
  },
  title: { fontSize: "2.5rem", color: "#f5c518", margin: 0, fontWeight: 700 },
  winnerCard: {
    background: "#1a1a2e",
    borderRadius: "12px",
    padding: "1.5rem 3rem",
    textAlign: "center",
    border: "2px solid #f5c518",
  },
  winnerLabel: {
    color: "#aaa",
    fontSize: "0.85rem",
    margin: "0 0 0.25rem",
    textTransform: "uppercase",
    letterSpacing: "0.1em",
  },
  winnerName: {
    color: "#fff",
    fontSize: "1.8rem",
    fontWeight: 700,
    margin: "0 0 0.25rem",
  },
  winnerScore: {
    color: "#f5c518",
    fontSize: "1.4rem",
    fontWeight: 700,
    margin: 0,
  },
  scoreTable: {
    width: "100%",
    maxWidth: "420px",
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
  },
  tableTitle: {
    color: "#aaa",
    fontSize: "0.85rem",
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    margin: "0 0 0.5rem",
    textAlign: "center",
  },
  scoreRow: {
    display: "flex",
    alignItems: "center",
    gap: "1rem",
    padding: "0.75rem 1rem",
    borderRadius: "8px",
    border: "1px solid transparent",
  },
  rank: { color: "#555", fontSize: "0.85rem", minWidth: "24px" },
  scoreName: { flex: 1, color: "#fff", fontSize: "1rem" },
  scoreVal: { fontWeight: 700, fontSize: "1rem" },
  btn: {
    padding: "0.85rem 2.5rem",
    borderRadius: "8px",
    border: "none",
    background: "#f5c518",
    color: "#0f0f1a",
    fontWeight: 700,
    fontSize: "1rem",
    cursor: "pointer",
  },
};
