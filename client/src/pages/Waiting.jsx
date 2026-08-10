import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useGame } from "../context/GameContext";
import socket from "../socket/socket";

export default function Waiting() {
  const { state, dispatch } = useGame();
  const navigate = useNavigate();
  const location = useLocation();
  const sessionId = location.state?.sessionId || state.sessionId;

  useEffect(() => {
    socket.on("session_update", (data) => {
      dispatch({ type: "SESSION_UPDATE", payload: data });
    });

    socket.on("game_started", () => {
      dispatch({ type: "GAME_STARTED" });
      navigate("/game", { state: { sessionId } });
    });

    return () => {
      socket.off("session_update");
      socket.off("game_started");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleStart() {
    socket.emit("start_game", { sessionId });
  }

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>Waiting Room</h2>

      <div style={styles.sessionBox}>
        <p style={styles.label}>Session ID — share this with players:</p>
        <p style={styles.sessionId}>{sessionId}</p>
      </div>

      <div style={styles.card}>
        <p style={styles.label}>Players joined ({state.players.length} / 5)</p>
        {state.players.length === 0 && (
          <p style={styles.muted}>Waiting for players…</p>
        )}
        {state.players.map((p, i) => (
          <div key={i} style={styles.playerRow}>
            <span style={styles.dot} />
            <span style={styles.playerName}>{p.name}</span>
          </div>
        ))}
      </div>

      {state.players.length === 5 && (
        <button style={styles.btn} onClick={handleStart}>
          Start Game
        </button>
      )}

      {state.players.length < 5 && (
        <p style={styles.muted}>
          Need {5 - state.players.length} more player
          {5 - state.players.length !== 1 ? "s" : ""} to start
        </p>
      )}
    </div>
  );
}

const styles = {
  container: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    background: "#0f0f1a",
    padding: "2rem",
    gap: "1.5rem",
  },
  title: { fontSize: "2rem", color: "#f5c518", margin: 0 },
  sessionBox: {
    background: "#1a1a2e",
    borderRadius: "10px",
    padding: "1rem 2rem",
    textAlign: "center",
  },
  sessionId: {
    fontSize: "1.1rem",
    color: "#f5c518",
    fontFamily: "monospace",
    wordBreak: "break-all",
    margin: "0.5rem 0 0",
  },
  card: {
    background: "#1a1a2e",
    borderRadius: "12px",
    padding: "1.5rem 2rem",
    width: "100%",
    maxWidth: "420px",
    display: "flex",
    flexDirection: "column",
    gap: "0.75rem",
  },
  label: { color: "#aaa", fontSize: "0.875rem", margin: 0 },
  muted: { color: "#555", fontSize: "0.875rem", margin: 0 },
  playerRow: { display: "flex", alignItems: "center", gap: "0.6rem" },
  dot: {
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    background: "#4caf50",
  },
  playerName: { color: "#fff", fontSize: "1rem" },
  btn: {
    padding: "0.8rem 2.5rem",
    borderRadius: "8px",
    border: "none",
    background: "#f5c518",
    color: "#0f0f1a",
    fontWeight: 700,
    fontSize: "1rem",
    cursor: "pointer",
  },
};
