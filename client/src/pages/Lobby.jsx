import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useGame } from "../context/GameContext";
import socket from "../socket/socket";

export default function Lobby() {
  const { dispatch } = useGame();
  const navigate = useNavigate();

  const [playerName, setPlayerName] = useState("");
  const [difficulty, setDifficulty] = useState("medium");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handlePlay() {
    if (!playerName.trim()) return setError("Enter your name to play");
    setLoading(true);
    setError(null);

    try {
      // Connect socket first so we have a socket.id
      socket.connect();

      await new Promise((resolve, reject) => {
        socket.once("connect", resolve);
        socket.once("connect_error", reject);
        setTimeout(reject, 5000);
      });

      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerName: playerName.trim(),
          playerSocketId: socket.id,
          difficulty,
        }),
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.message);

      const { session } = data;
      const humanPlayer = session.players.find((p) => p.isHuman);

      dispatch({
        type: "SET_SESSION",
        payload: {
          sessionId: session._id,
          playerId: humanPlayer.playerId,
          playerName: humanPlayer.name,
          difficulty: session.difficulty,
          players: session.players,
        },
      });

      // Join the socket room
      socket.emit("join_game", { sessionId: session._id });

      socket.once("game_joined", () => {
        // Save critical state so a page refresh can recover
        sessionStorage.setItem(
          "alphawiz_session",
          JSON.stringify({
            sessionId: session._id,
            playerId: humanPlayer.playerId,
            playerName: humanPlayer.name,
            difficulty: session.difficulty,
            players: session.players,
          }),
        );
        navigate("/game", { state: { sessionId: session._id } });
      });
    } catch (err) {
      setError(err.message || "Could not connect. Is the server running?");
      socket.disconnect();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={s.container}>
      <h1 style={s.title}>AlphaWiz</h1>
      <br></br>
      <p style={s.subtitle}>The Alphabetical Wizard Quiz</p>

      <div style={s.card}>
        <input
          style={s.input}
          type="text"
          placeholder="Your name"
          value={playerName}
          onChange={(e) => setPlayerName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handlePlay()}
          autoFocus
        />

        <div style={s.difficultyRow}>
          {["easy", "medium", "hard"].map((d) => (
            <button
              key={d}
              style={{
                ...s.diffBtn,
                ...(difficulty === d ? s.diffBtnActive : {}),
              }}
              onClick={() => setDifficulty(d)}
            >
              {d.charAt(0).toUpperCase() + d.slice(1)}
            </button>
          ))}
        </div>

        <p style={s.diffHint}>
          {difficulty === "easy" &&
            "AI opponents answer correctly ~50% of the time"}
          {difficulty === "medium" &&
            "AI opponents answer correctly ~70% of the time"}
          {difficulty === "hard" &&
            "AI opponents answer correctly ~85% of the time"}
        </p>

        <button style={s.btnPlay} onClick={handlePlay} disabled={loading}>
          {loading ? "Starting…" : "Play"}
        </button>

        {error && <p style={s.error}>{error}</p>}
      </div>
    </div>
  );
}

const s = {
  container: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    background: "#0f0f1a",
    padding: "2rem",
  },
  title: {
    fontSize: "3.5rem",
    fontWeight: 700,
    color: "#f5c518",
    margin: 0,
    letterSpacing: "0.05em",
  },
  subtitle: { color: "#aaa", marginBottom: "2rem", fontSize: "1rem" },
  card: {
    background: "#1a1a2e",
    borderRadius: "12px",
    padding: "2rem",
    width: "100%",
    maxWidth: "400px",
    display: "flex",
    flexDirection: "column",
    gap: "1rem",
  },
  input: {
    padding: "0.75rem 1rem",
    borderRadius: "8px",
    border: "1px solid #333",
    background: "#0f0f1a",
    color: "#fff",
    fontSize: "1rem",
    outline: "none",
  },
  difficultyRow: { display: "flex", gap: "0.5rem" },
  diffBtn: {
    flex: 1,
    padding: "0.6rem",
    borderRadius: "8px",
    border: "1px solid #333",
    background: "transparent",
    color: "#aaa",
    fontSize: "0.9rem",
    cursor: "pointer",
  },
  diffBtnActive: {
    border: "1px solid #f5c518",
    color: "#f5c518",
    background: "#1f1f0a",
  },
  diffHint: {
    color: "#555",
    fontSize: "0.8rem",
    margin: 0,
    textAlign: "center",
  },
  btnPlay: {
    padding: "0.85rem",
    borderRadius: "8px",
    border: "none",
    background: "#f5c518",
    color: "#0f0f1a",
    fontWeight: 700,
    fontSize: "1.1rem",
    cursor: "pointer",
  },
  error: {
    color: "#ff6b6b",
    fontSize: "0.875rem",
    textAlign: "center",
    margin: 0,
  },
};
