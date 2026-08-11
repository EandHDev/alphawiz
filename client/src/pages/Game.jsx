import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useGame } from "../context/GameContext";
import socket from "../socket/socket";

const ROUND_NAMES = {
  1: "Beginner's Luck",
  2: "United We Stand",
  3: "No Free Lunch",
  4: "All or Nothing!",
};

const ROUND_VALUES = { 1: 100, 2: 200, 3: 300, 4: 500 };
const TOTAL_QUESTIONS = { 1: 15, 2: 12, 3: 9, 4: 5 };

export default function Game() {
  const { state, dispatch } = useGame();
  const navigate = useNavigate();
  const location = useLocation();
  const sessionId = location.state?.sessionId || state.sessionId;

  const [phase, setPhase] = useState("select_letter");
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [answerInput, setAnswerInput] = useState("");
  const [lastResult, setLastResult] = useState(null);
  const [thinkingPlayer, setThinkingPlayer] = useState(null);
  const [availableLetters, setAvailableLetters] = useState([]);
  const [scores, setScores] = useState(state.scores || []);
  const [isMyTurn, setIsMyTurn] = useState(false);
  const [spinningLetter, setSpinningLetter] = useState(null);
  const [isPicking, setIsPicking] = useState(false);
  const [lifelineHint, setLifelineHint] = useState(null);
  const [roundOverData, setRoundOverData] = useState(null);
  const [countdown, setCountdown] = useState(null);
  const [instantElim, setInstantElim] = useState(false);
  const [hasAskedFirst, setHasAskedFirst] = useState(false);
  const [suddenDeathData, setSuddenDeathData] = useState(null);
  const [suddenDeathResult, setSuddenDeathResult] = useState(null);

  const answerRef = useRef(null);
  const countdownRef = useRef(null);

  const round = state.currentRound;
  const letter = state.letter;
  const round4Letters = state.round4Letters || [];
  const activeLetters = round === 4 ? round4Letters : letter ? [letter] : [];

  function saveSessionProgress(updates = {}) {
    const saved = sessionStorage.getItem("alphawiz_session");
    if (!saved) return;
    const parsed = JSON.parse(saved);
    sessionStorage.setItem(
      "alphawiz_session",
      JSON.stringify({
        ...parsed,
        ...updates,
      }),
    );
  }

  function handleSuddenDeathSubmit() {
    if (!answerInput.trim() || !currentQuestion || !isMyTurn) return;
    socket.emit("submit_sudden_death", { answer: answerInput.trim() });
    setIsMyTurn(false);
  }

  // Recover session state after a page refresh
  useEffect(() => {
    if (state.sessionId) return;

    const saved = sessionStorage.getItem("alphawiz_session");
    if (!saved) {
      navigate("/");
      return;
    }

    const parsed = JSON.parse(saved);

    // Restore full session state including progress
    dispatch({ type: "SET_SESSION", payload: parsed });

    // Restore scores if saved
    if (parsed.scores) {
      setScores(parsed.scores);
    }

    // Reconnect socket and rejoin game room
    if (!socket.connected) socket.connect();
    socket.once("connect", () => {
      socket.emit("join_game", { sessionId: parsed.sessionId });
    });
    if (socket.connected) {
      socket.emit("join_game", { sessionId: parsed.sessionId });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch available letters on select_letter phase
  useEffect(() => {
    if (phase !== "select_letter" || !sessionId) return;
    fetch(`${import.meta.env.VITE_API_URL}/api/sessions/${sessionId}/letters`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setAvailableLetters(data.letters);
      })
      .catch(console.error);
  }, [phase, sessionId]);

  // Focus input on human turn
  useEffect(() => {
    if (isMyTurn && phase === "question" && currentQuestion) {
      answerRef.current?.focus();
    }
  }, [isMyTurn, phase, currentQuestion]);

  // Socket listeners
  useEffect(() => {
    socket.on("letter_selected", (data) => {
      dispatch({ type: "LETTER_SELECTED", payload: data });
      setCurrentQuestion(null);
      setLastResult(null);
      setLifelineHint(null);
      setPhase("question");
    });

    socket.on("your_turn", (data) => {
      setIsMyTurn(true);
      setThinkingPlayer(null);
      setAnswerInput("");
      setLastResult(null);
      setLifelineHint(null);
      setCurrentQuestion(null);
      setPhase("question");
    });

    socket.on("ai_thinking", ({ name, thinkTime }) => {
      setIsMyTurn(false);
      setThinkingPlayer({ name, thinkTime });
      setCurrentQuestion(null);
      setLastResult(null);
    });

    socket.on("answer_result", (data) => {
      saveSessionProgress({ scores: data.scores });
      setThinkingPlayer(null);
      setLastResult(data);
      setScores(data.scores);
      dispatch({
        type: "UPDATE_SCORES",
        payload: {
          scores: data.scores,
          questionsAskedThisRound: data.questionsAskedThisRound,
          totalQuestionsThisRound: data.totalQuestionsThisRound,
        },
      });

      if (data.isHuman) {
        setIsMyTurn(false);
        setPhase("result");
        if (data.instantElimination) setInstantElim(true);
      }
    });

    socket.on("sudden_death", (data) => {
      setPhase("sudden_death");
      setLastResult(null);
      setCurrentQuestion(null);
      setThinkingPlayer(null);
      setSuddenDeathData(data);
    });

    socket.on("sudden_death_question", (data) => {
      setCurrentQuestion(data.question);
      setAnswerInput("");
      setIsMyTurn(true);
      setPhase("sudden_death_question");
    });

    socket.on("sudden_death_result", (data) => {
      setSuddenDeathResult(data);
      setIsMyTurn(false);
      setPhase("sudden_death_result");
    });

    socket.on("sudden_death_continue", (data) => {
      setSuddenDeathData((prev) => ({ ...prev, message: data.message }));
      setPhase("sudden_death");
    });

    socket.on("round_over", (data) => {
      saveSessionProgress({
        currentRound: data.nextRound,
        round4Letters: data.round4Letters || [],
        scores: data.scores,
      });
      setHasAskedFirst(false);
      setRoundOverData(data);
      setCurrentQuestion(null);
      setLastResult(null);
      setIsMyTurn(false);
      setThinkingPlayer(null);
      setInstantElim(false);
      setScores(data.scores);

      dispatch({
        type: "ROUND_OVER",
        payload: {
          nextRound: data.nextRound,
          round4Letters: data.round4Letters || [],
          scores: data.scores,
          totalQuestionsThisRound: TOTAL_QUESTIONS[data.nextRound] || 15,
        },
      });

      setPhase("round_over");
    });

    socket.on("game_over", (data) => {
      dispatch({ type: "GAME_OVER" });
      navigate("/results", {
        state: { winner: data.winner, finalScores: data.finalScores },
      });
    });

    socket.on("lifeline_result", (data) => {
      setLifelineHint(data.hint);
      dispatch({ type: "LIFELINE_USED" });
    });
    socket.on("connect", async () => {
      if (!sessionId) return;

      // Rejoin the game room
      socket.emit("join_game", { sessionId });

      // Fetch current session state from REST to resync UI
      try {
        const res = await fetch(
          `${import.meta.env.VITE_API_URL}/api/sessions/${sessionId}`,
        );
        const data = await res.json();
        if (!data.success) return;

        const session = data.session;
        const currentRound = session.currentRound;
        const roundData = session.rounds[currentRound - 1];
        const human = session.players.find((p) => p.isHuman);

        // Update scores
        const freshScores = session.players.map((p) => ({
          playerId: p.playerId,
          name: p.name,
          score: p.score,
          isHuman: p.isHuman,
          isEliminated: p.isEliminated,
        }));
        setScores(freshScores);

        // Update round and letter
        dispatch({
          type: "LETTER_SELECTED",
          payload: { round: currentRound, letter: roundData?.letter },
        });

        // If human is not eliminated, signal it's their turn
        if (human && !human.isEliminated && session.status === "active") {
          setIsMyTurn(true);
          setPhase("question");
          setCurrentQuestion(null);
          setThinkingPlayer(null);
        }
      } catch (err) {
        console.error("Reconnection sync failed:", err);
      }
    });

    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => {
      socket.off("letter_selected");
      socket.off("your_turn");
      socket.off("ai_thinking");
      socket.off("answer_result");
      socket.off("round_over");
      socket.off("game_over");
      socket.off("lifeline_result");
      socket.off("connect");
      socket.off("sudden_death");
      socket.off("sudden_death_question");
      socket.off("sudden_death_result");
      socket.off("sudden_death_continue");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Round 4 countdown timer
  useEffect(() => {
    if (round !== 4 || !isMyTurn || !currentQuestion) return;
    setCountdown(15);
    countdownRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(countdownRef.current);
          // Time's up — submit empty answer
          socket.emit("submit_answer", {
            sessionId,
            questionId: currentQuestion._id,
            answer: "",
          });
          setIsMyTurn(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(countdownRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMyTurn, currentQuestion, round]);

  async function handleRequestQuestion() {
    const res = await fetch(
      `${import.meta.env.VITE_API_URL}/api/sessions/${sessionId}/question`,
    );
    const data = await res.json();
    if (data.success) {
      setCurrentQuestion(data.question);
      setAnswerInput("");
      setLastResult(null);
      setLifelineHint(null);
      setHasAskedFirst(true);
    } else {
      setPhase("round_over");
    }
  }

  function handleSubmitAnswer() {
    if (!answerInput.trim() || !currentQuestion || !isMyTurn) return;
    clearInterval(countdownRef.current);
    socket.emit("submit_answer", {
      sessionId,
      questionId: currentQuestion._id,
      answer: answerInput.trim(),
    });
    setIsMyTurn(false);
  }

  function handleSelectLetter(letter) {
    socket.emit("select_letter", { sessionId, letter });
  }

  function handleLifeline() {
    if (!currentQuestion || !state.lifelineAvailable) return;
    socket.emit("request_lifeline", {
      sessionId,
      questionId: currentQuestion._id,
    });
  }

  function handleStartNextRound() {
    setRoundOverData(null);
    setPhase("select_letter");
  }

  function handleSpinLetter() {
    if (!availableLetters.length || isPicking) return;
    const chosen =
      availableLetters[Math.floor(Math.random() * availableLetters.length)];
    setIsPicking(true);

    let elapsed = 0;
    let interval = 60;
    const totalDuration = 2400;

    function step() {
      const remaining = availableLetters.filter((l) => l !== chosen);
      const highlight = remaining[Math.floor(Math.random() * remaining.length)];
      setSpinningLetter(highlight);
      elapsed += interval;
      interval = Math.min(interval * 1.08, 300);

      if (elapsed < totalDuration) {
        setTimeout(step, interval);
      } else {
        setSpinningLetter(chosen);
        setTimeout(() => {
          setIsPicking(false);
          setSpinningLetter(null);
          handleSelectLetter(chosen);
        }, 600);
      }
    }
    setTimeout(step, interval);
  }

  // Progress bar percentage
  const progressPct = TOTAL_QUESTIONS[round]
    ? Math.min(
        (state.questionsAskedThisRound / TOTAL_QUESTIONS[round]) * 100,
        100,
      )
    : 0;

  return (
    <div style={s.container}>
      {/* Header */}
      <div style={s.header}>
        <span style={s.roundBadge}>Round {round}</span>
        <span style={s.roundName}>{ROUND_NAMES[round]}</span>
        {round < 4 && letter && <span style={s.letterBadge}>{letter}</span>}
        {round === 4 && round4Letters.length > 0 && (
          <div style={s.multiLetters}>
            {round4Letters.map((l) => (
              <span key={l} style={s.letterBadge}>
                {l}
              </span>
            ))}
          </div>
        )}
        {activeLetters.length > 0 && (
          <span style={s.valueTag}>${ROUND_VALUES[round]} / question</span>
        )}
      </div>

      {/* Progress bar */}
      {letter && (
        <div style={s.progressWrap}>
          <div style={{ ...s.progressBar, width: `${progressPct}%` }} />
          <span style={s.progressLabel}>
            {state.questionsAskedThisRound} / {TOTAL_QUESTIONS[round]} questions
          </span>
        </div>
      )}

      {/* Scoreboard */}
      <div style={s.scoreboard}>
        {scores.map((p) => {
          const isThinking = thinkingPlayer?.name === p.name;
          return (
            <div
              key={p.playerId}
              style={{
                ...s.scoreCard,
                opacity: p.isEliminated ? 0.3 : 1,
                borderColor: isThinking ? "#f5c518" : "transparent",
              }}
            >
              <span style={s.scoreName}>
                {p.name}
                {p.isHuman && " 👤"}
                {isThinking && " 💭"}
              </span>
              <span style={s.scoreValue}>${p.score}</span>
            </div>
          );
        })}
      </div>

      {/* Phase: Select Letter */}
      {phase === "select_letter" && (
        <div style={s.card}>
          <h3 style={s.cardTitle}>
            Round {round} — {ROUND_NAMES[round]}
          </h3>
          {round === 4 ? (
            <>
              <p
                style={{
                  color: "#aaa",
                  textAlign: "center",
                  margin: 0,
                  fontSize: "0.9rem",
                }}
              >
                The Final Round. All three previous letters are in play.
              </p>
              <div style={s.multiLetters}>
                {round4Letters.map((l) => (
                  <span
                    key={l}
                    style={{
                      ...s.letterBadge,
                      fontSize: "1.4rem",
                      padding: "0.5rem 1.2rem",
                    }}
                  >
                    {l}
                  </span>
                ))}
              </div>
              <button
                style={s.btnPrimary}
                onClick={() => {
                  // Round 4 uses previous letters — no new letter needed
                  // Emit a special event to start Round 4
                  socket.emit("select_letter", {
                    sessionId,
                    letter: round4Letters[0],
                    isRound4: true,
                  });
                }}
              >
                Begin Final Round
              </button>
            </>
          ) : (
            <>
              <p
                style={{
                  color: "#aaa",
                  textAlign: "center",
                  margin: 0,
                  fontSize: "0.9rem",
                }}
              >
                Press the button and let fate decide your letter.
              </p>
              <div style={s.letterGrid}>
                {availableLetters.map((l) => (
                  <div
                    key={l}
                    style={{
                      ...s.letterDisplay,
                      background: spinningLetter === l ? "#f5c518" : "#0f0f1a",
                      color: spinningLetter === l ? "#0f0f1a" : "#fff",
                      transform:
                        spinningLetter === l ? "scale(1.15)" : "scale(1)",
                      boxShadow:
                        spinningLetter === l ? "0 0 12px #f5c518" : "none",
                    }}
                  >
                    {l}
                  </div>
                ))}
              </div>
              <button
                style={{ ...s.btnPrimary, opacity: isPicking ? 0.5 : 1 }}
                disabled={isPicking}
                onClick={handleSpinLetter}
              >
                {isPicking ? "Picking…" : "Pick a Letter"}
              </button>
            </>
          )}
        </div>
      )}

      {/* Phase: Question */}
      {phase === "question" && (
        <div style={s.card}>
          {!currentQuestion ? (
            <button style={s.btnPrimary} onClick={handleRequestQuestion}>
              {hasAskedFirst ? "Next Question" : "Get First Question"}
            </button>
          ) : (
            <>
              <p style={s.questionText}>{currentQuestion.text}</p>
              <p style={s.hint}>
                Answer must begin with{" "}
                {activeLetters.map((l, i) => (
                  <span key={l}>
                    <strong style={{ color: "#f5c518" }}>{l}</strong>
                    {i < activeLetters.length - 1 && (
                      <span style={{ color: "#aaa" }}> or </span>
                    )}
                  </span>
                ))}
              </p>

              {lifelineHint && (
                <div style={s.hintBox}>
                  <span>🎯 Ask the Audience: {lifelineHint}</span>
                </div>
              )}

              {isMyTurn ? (
                <>
                  {/* Round 4 countdown */}
                  {round === 4 && countdown !== null && (
                    <div style={s.countdown}>
                      <span
                        style={{
                          ...s.countdownNum,
                          color: countdown <= 5 ? "#ff6b6b" : "#f5c518",
                        }}
                      >
                        {countdown}s
                      </span>
                    </div>
                  )}

                  <div style={s.answerRow}>
                    <input
                      ref={answerRef}
                      style={s.input}
                      type="text"
                      placeholder={`${activeLetters[0]}…`}
                      value={answerInput}
                      onChange={(e) => setAnswerInput(e.target.value)}
                      onKeyDown={(e) =>
                        e.key === "Enter" && handleSubmitAnswer()
                      }
                    />
                    <button style={s.btnPrimary} onClick={handleSubmitAnswer}>
                      Submit
                    </button>
                  </div>

                  {/* Lifeline — Round 2 only */}
                  {round === 2 && state.lifelineAvailable && !lifelineHint && (
                    <button style={s.btnLifeline} onClick={handleLifeline}>
                      🎯 Ask the Audience (1 remaining)
                    </button>
                  )}
                </>
              ) : (
                <p style={s.waitingText}>
                  {thinkingPlayer
                    ? `${thinkingPlayer.name} is thinking…`
                    : "Waiting…"}
                </p>
              )}

              {thinkingPlayer && (
                <div style={s.thinkingBanner}>
                  <span style={s.thinkingDots}>●●●</span>
                  <span style={{ color: "#aaa" }}>
                    {thinkingPlayer.name} is thinking…
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Phase: Result */}
      {phase === "result" && lastResult && (
        <div style={s.card}>
          <div
            style={{
              ...s.resultBanner,
              background: lastResult.isCorrect ? "#0d2b0d" : "#2b0d0d",
            }}
          >
            <p
              style={{
                ...s.resultText,
                color: lastResult.isCorrect ? "#4caf50" : "#ff6b6b",
              }}
            >
              {lastResult.wentOutside
                ? instantElim
                  ? "⚠ Outside the alphabet — you are eliminated!"
                  : "⚠ Outside the alphabet — all winnings lost!"
                : lastResult.isCorrect
                  ? "✓ Correct!"
                  : `✗ Wrong. Answer was: ${lastResult.correctAnswer}`}
            </p>
          </div>

          {thinkingPlayer && (
            <div style={s.thinkingBanner}>
              <span style={s.thinkingDots}>●●●</span>
              <span style={{ color: "#aaa" }}>
                {thinkingPlayer.name} is thinking…
              </span>
            </div>
          )}

          {isMyTurn && !instantElim && (
            <button
              style={s.btnPrimary}
              onClick={() => {
                setPhase("question");
                handleRequestQuestion();
              }}
            >
              Next Question
            </button>
          )}

          {instantElim && (
            <p
              style={{
                color: "#aaa",
                textAlign: "center",
                fontSize: "0.9rem",
                margin: 0,
              }}
            >
              Waiting for the round to finish…
            </p>
          )}
        </div>
      )}

      {/* Phase: Round Over */}
      {phase === "round_over" && roundOverData && (
        <div style={s.card}>
          <h3 style={s.cardTitle}>
            Round {roundOverData.round} — {ROUND_NAMES[roundOverData.round]}{" "}
            Complete
          </h3>

          {roundOverData.eliminatedName && (
            <p
              style={{
                color: "#ff6b6b",
                textAlign: "center",
                margin: 0,
                fontWeight: 600,
              }}
            >
              {roundOverData.eliminatedName} has been eliminated
            </p>
          )}

          {roundOverData.advancing && (
            <>
              <p
                style={{
                  color: "#4caf50",
                  textAlign: "center",
                  margin: 0,
                  fontWeight: 600,
                }}
              >
                Advancing to the Final:
              </p>
              {roundOverData.advancing.map((p, i) => (
                <p
                  key={i}
                  style={{ color: "#fff", textAlign: "center", margin: 0 }}
                >
                  {p.name} {p.isHuman ? "👤" : "🤖"} — ${p.score}
                </p>
              ))}
            </>
          )}

          {roundOverData.nextRound === 4 && round4Letters.length > 0 && (
            <div style={{ textAlign: "center" }}>
              <p
                style={{
                  color: "#aaa",
                  fontSize: "0.875rem",
                  margin: "0 0 0.5rem",
                }}
              >
                Final round letters:
              </p>
              <div style={s.multiLetters}>
                {round4Letters.map((l) => (
                  <span key={l} style={s.letterBadge}>
                    {l}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Only show Begin Round button if human is still active */}
          {(() => {
            const human = state.players.find((p) => p.isHuman);
            const humanEliminated =
              roundOverData.eliminatedName === human?.name ||
              scores.find((p) => p.isHuman)?.isEliminated;

            if (humanEliminated) {
              return (
                <div style={{ textAlign: "center" }}>
                  <p style={{ color: "#ff6b6b", fontWeight: 600, margin: 0 }}>
                    You have been eliminated!
                  </p>
                  <p
                    style={{
                      color: "#aaa",
                      fontSize: "0.875rem",
                      margin: "0.5rem 0 0",
                    }}
                  >
                    Better luck next time.
                  </p>
                  <button
                    style={{
                      ...s.btnPrimary,
                      marginTop: "1rem",
                      background: "#333",
                      color: "#fff",
                    }}
                    onClick={() => {
                      sessionStorage.removeItem("alphawiz_session");
                      dispatch({ type: "RESET" });
                      socket.disconnect();
                      navigate("/");
                    }}
                  >
                    Play Again
                  </button>
                </div>
              );
            }

            return (
              <button style={s.btnPrimary} onClick={handleStartNextRound}>
                Begin Round {roundOverData.nextRound}
              </button>
            );
          })()}
        </div>
      )}
      {/* Phase: Sudden Death Announcement */}
      {phase === "sudden_death" && suddenDeathData && (
        <div style={s.card}>
          <h3 style={{ ...s.cardTitle, color: "#ff6b6b" }}>⚡ Sudden Death</h3>
          <p
            style={{
              color: "#fff",
              textAlign: "center",
              margin: 0,
              fontWeight: 600,
            }}
          >
            {suddenDeathData.message}
          </p>
          <p
            style={{
              color: "#aaa",
              textAlign: "center",
              margin: 0,
              fontSize: "0.875rem",
            }}
          >
            One question each. No money. First to answer correctly survives.
          </p>
          {thinkingPlayer && (
            <div style={s.thinkingBanner}>
              <span style={s.thinkingDots}>●●●</span>
              <span style={{ color: "#aaa" }}>
                {thinkingPlayer.name} is thinking…
              </span>
            </div>
          )}
        </div>
      )}

      {/* Phase: Sudden Death Question (human's turn) */}
      {phase === "sudden_death_question" && currentQuestion && (
        <div style={s.card}>
          <h3 style={{ ...s.cardTitle, color: "#ff6b6b" }}>
            ⚡ Sudden Death — Your Turn
          </h3>
          <p style={s.questionText}>{currentQuestion.text}</p>
          <p style={s.hint}>
            Answer must begin with{" "}
            <strong style={{ color: "#f5c518" }}>{letter}</strong>
          </p>
          <div style={s.countdown}>
            <span style={{ ...s.countdownNum, color: "#ff6b6b" }}>15s</span>
          </div>
          <div style={s.answerRow}>
            <input
              ref={answerRef}
              style={s.input}
              type="text"
              placeholder={`${letter}…`}
              value={answerInput}
              onChange={(e) => setAnswerInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSuddenDeathSubmit()}
              autoFocus
            />
            <button style={s.btnPrimary} onClick={handleSuddenDeathSubmit}>
              Submit
            </button>
          </div>
        </div>
      )}

      {/* Phase: Sudden Death Result */}
      {phase === "sudden_death_result" && suddenDeathResult && (
        <div style={s.card}>
          <h3 style={{ ...s.cardTitle, color: "#ff6b6b" }}>
            ⚡ Sudden Death Result
          </h3>
          <div
            style={{
              ...s.resultBanner,
              background: suddenDeathResult.isCorrect ? "#0d2b0d" : "#2b0d0d",
            }}
          >
            <p
              style={{
                ...s.resultText,
                color: suddenDeathResult.isCorrect ? "#4caf50" : "#ff6b6b",
              }}
            >
              {suddenDeathResult.playerName}:{" "}
              {suddenDeathResult.isCorrect
                ? "✓ Correct!"
                : `✗ Wrong. Answer was: ${suddenDeathResult.correctAnswer}`}
            </p>
          </div>
          {thinkingPlayer && (
            <div style={s.thinkingBanner}>
              <span style={s.thinkingDots}>●●●</span>
              <span style={{ color: "#aaa" }}>
                {thinkingPlayer.name} is thinking…
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const s = {
  container: {
    minHeight: "100vh",
    background: "#0f0f1a",
    padding: "1.5rem",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "1.25rem",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
    flexWrap: "wrap",
    justifyContent: "center",
  },
  roundBadge: {
    background: "#f5c518",
    color: "#0f0f1a",
    fontWeight: 700,
    padding: "0.3rem 0.9rem",
    borderRadius: "20px",
    fontSize: "0.85rem",
  },
  roundName: { color: "#fff", fontSize: "1.3rem", fontWeight: 500 },
  letterBadge: {
    border: "2px solid #f5c518",
    color: "#f5c518",
    fontWeight: 700,
    padding: "0.3rem 0.9rem",
    borderRadius: "20px",
    fontSize: "1.1rem",
  },
  multiLetters: {
    display: "flex",
    gap: "0.5rem",
    flexWrap: "wrap",
    justifyContent: "center",
  },
  valueTag: { color: "#555", fontSize: "0.8rem" },
  progressWrap: {
    width: "100%",
    maxWidth: "680px",
    background: "#1a1a2e",
    borderRadius: "20px",
    height: "8px",
    position: "relative",
    overflow: "hidden",
  },
  progressBar: {
    height: "100%",
    background: "#f5c518",
    borderRadius: "20px",
    transition: "width 0.4s ease",
  },
  progressLabel: {
    position: "absolute",
    right: 0,
    top: "-20px",
    fontSize: "0.75rem",
    color: "#555",
  },
  scoreboard: {
    display: "flex",
    gap: "0.75rem",
    flexWrap: "wrap",
    justifyContent: "center",
    width: "100%",
    maxWidth: "680px",
  },
  scoreCard: {
    background: "#1a1a2e",
    borderRadius: "8px",
    padding: "0.6rem 1rem",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    minWidth: "110px",
    border: "1px solid transparent",
    transition: "border-color 0.3s",
  },
  scoreName: { color: "#aaa", fontSize: "0.75rem", marginBottom: "0.25rem" },
  scoreValue: { color: "#f5c518", fontWeight: 700, fontSize: "1.1rem" },
  card: {
    background: "#1a1a2e",
    borderRadius: "12px",
    padding: "2rem",
    width: "100%",
    maxWidth: "580px",
    display: "flex",
    flexDirection: "column",
    gap: "1rem",
  },
  cardTitle: {
    color: "#fff",
    margin: 0,
    textAlign: "center",
    fontSize: "1.1rem",
    fontWeight: 600,
  },
  letterGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(7, 1fr)",
    gap: "0.5rem",
  },
  letterDisplay: {
    padding: "0.65rem 0",
    borderRadius: "6px",
    border: "1px solid #333",
    color: "#fff",
    fontWeight: 700,
    fontSize: "1rem",
    textAlign: "center",
    transition: "background 0.05s, transform 0.05s, box-shadow 0.05s",
    cursor: "default",
  },
  questionText: {
    color: "#fff",
    fontSize: "1.1rem",
    lineHeight: 1.65,
    margin: 0,
  },
  hint: { color: "#888", fontSize: "0.875rem", margin: 0 },
  hintBox: {
    background: "#0f1f0f",
    border: "1px solid #4caf50",
    borderRadius: "8px",
    padding: "0.75rem 1rem",
    color: "#4caf50",
    fontSize: "0.9rem",
    textAlign: "center",
  },
  answerRow: { display: "flex", gap: "0.75rem" },
  input: {
    flex: 1,
    padding: "0.75rem 1rem",
    borderRadius: "8px",
    border: "1px solid #333",
    background: "#0f0f1a",
    color: "#fff",
    fontSize: "1rem",
    outline: "none",
  },
  waitingText: {
    color: "#555",
    fontSize: "0.9rem",
    textAlign: "center",
    margin: 0,
  },
  thinkingBanner: {
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
    padding: "0.6rem 1rem",
    background: "#0f0f1a",
    borderRadius: "8px",
  },
  thinkingDots: { color: "#f5c518", fontSize: "0.6rem", letterSpacing: "3px" },
  countdown: { textAlign: "center" },
  countdownNum: {
    fontSize: "2.5rem",
    fontWeight: 700,
    transition: "color 0.3s",
  },
  btnPrimary: {
    padding: "0.75rem 1.5rem",
    borderRadius: "8px",
    border: "none",
    background: "#f5c518",
    color: "#0f0f1a",
    fontWeight: 700,
    fontSize: "1rem",
    cursor: "pointer",
  },
  btnLifeline: {
    padding: "0.6rem 1rem",
    borderRadius: "8px",
    border: "1px solid #4caf50",
    background: "transparent",
    color: "#4caf50",
    fontWeight: 600,
    fontSize: "0.875rem",
    cursor: "pointer",
  },
  resultBanner: { borderRadius: "8px", padding: "1rem", textAlign: "center" },
  resultText: { margin: 0, fontWeight: 600, fontSize: "1rem" },
};
