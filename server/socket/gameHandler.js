const Session = require("../models/Session");
const Question = require("../models/Question");
const {
  ROUND_VALUES,
  WRONG_ANSWER_PENALTY,
  TOTAL_QUESTIONS_PER_ROUND,
  ROUND_4_ANSWER_SECONDS,
} = require("../config/gameConfig");

// ── AI config ─────────────────────────────────────────────────────────────────
const AI_CONFIG = {
  easy: { correctRate: 0.5, minThink: 2000, maxThink: 4000 },
  medium: { correctRate: 0.7, minThink: 1000, maxThink: 3000 },
  hard: { correctRate: 0.85, minThink: 1000, maxThink: 2000 },
};

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

// ── Helpers ───────────────────────────────────────────────────────────────────

function getActivePlayers(session) {
  return session.players.filter((p) => !p.isEliminated);
}

function getActiveAIs(session) {
  return getActivePlayers(session)
    .filter((p) => !p.isHuman)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function getHuman(session) {
  return session.players.find((p) => p.isHuman);
}

// Fetch a random unused question for the current round and letter(s)
async function fetchQuestion(session, letters) {
  const round = session.currentRound;
  const useLetters = letters || [session.rounds[round - 1]?.letter];

  if (!useLetters.length || !useLetters[0]) return null;

  const askedIds = session.rounds
    .flatMap((r) => r.questionLog)
    .map((q) => q.questionId);

  const [question] = await Question.aggregate([
    {
      $match: {
        validLetters: { $in: useLetters },
        round: round === 4 ? { $in: [1, 2, 3, 4] } : round,
        status: "active",
        _id: { $nin: askedIds },
      },
    },
    { $sample: { size: 1 } },
  ]);

  return question || null;
}

// Process an answer and apply money changes to session.players
function processAnswer(session, playerId, answerText, correctAnswer) {
  const round = session.currentRound;
  const roundValue = ROUND_VALUES[round];
  const penalty = WRONG_ANSWER_PENALTY[round];
  const roundIndex = round - 1;

  const validLetters =
    round === 4 ? session.round4Letters : [session.rounds[roundIndex]?.letter];

  const playerIdx = session.players.findIndex((p) => p.playerId === playerId);
  const player = session.players[playerIdx];

  const submitted = (answerText || "").trim().toUpperCase();
  const correct = correctAnswer.trim().toUpperCase();

  // Break correct answer into words
  const correctWords = correct.split(" ");
  const correctLast = correctWords[correctWords.length - 1];

  // Accept if submitted matches either the full answer or just the surname
  const isMatch =
    submitted === correct ||
    (correctWords.length > 1 && submitted === correctLast);

  // Check alphabet validity against what the player actually typed
  const firstChar = submitted[0] || "";
  const wentOutside = submitted.length > 0 && !validLetters.includes(firstChar);
  const isCorrect = !wentOutside && isMatch;

  const moneyDelta = {};

  if (wentOutside) {
    moneyDelta[playerId] = -player.score;
    session.players[playerIdx].score = 0;
  } else if (isCorrect) {
    moneyDelta[playerId] = roundValue;
    session.players[playerIdx].score += roundValue;
  } else if (penalty > 0) {
    moneyDelta[playerId] = -penalty;
    session.players[playerIdx].score = Math.max(0, player.score - penalty);
  } else {
    moneyDelta[playerId] = 0;
  }

  return { isCorrect, wentOutside, moneyDelta };
}

// Get current scores formatted for broadcasting
function getScores(session) {
  return session.players.map((p) => ({
    playerId: p.playerId,
    name: p.name,
    score: p.score,
    isHuman: p.isHuman,
    isEliminated: p.isEliminated,
  }));
}

// Find the player with the lowest score among active players
function getLowestScorer(session) {
  const active = getActivePlayers(session);
  if (!active.length) return null;
  return active.reduce((min, p) => (p.score < min.score ? p : min));
}

// Advance to the next round
async function advanceRound(io, sessionId, session) {
  const round = session.currentRound;
  const nextRound = round + 1;

  session.rounds[round - 1].status = "finished";
  session.rounds[round - 1].finishedAt = new Date();

  if (nextRound <= 4) {
    session.currentRound = nextRound;
    session.rounds[nextRound - 1].status = "active";
    session.rounds[nextRound - 1].startedAt = new Date();
    session.questionsAskedThisRound = 0;

    // Reset questionsAnsweredThisRound for all active players
    session.players.forEach((p, i) => {
      session.players[i].questionsAnsweredThisRound = 0;
    });

    // Store Round 4 letters when advancing to Round 4
    if (nextRound === 4) {
      session.round4Letters = [...session.lettersUsed];
    }
  }

  session.markModified("players");
  session.markModified("rounds");
  await session.save();

  return nextRound;
}

// ── Round 4 — human turn with 15-second window ────────────────────────────────
async function runRound4HumanTurn(
  io,
  socket,
  sessionId,
  question,
  aiCorrectRate,
) {
  return new Promise((resolve) => {
    const timeoutMs = ROUND_4_ANSWER_SECONDS * 1000;
    let answered = false;

    // Tell the human it's their turn with a countdown
    socket.emit("your_turn_round4", {
      question: question,
      seconds: ROUND_4_ANSWER_SECONDS,
      letters: null, // sent separately via game state
    });

    // Listen for their answer
    const answerHandler = async ({ sessionId: sid, questionId, answer }) => {
      if (sid !== sessionId || answered) return;
      answered = true;
      clearTimeout(timer);
      socket.off("submit_answer_round4", answerHandler);
      resolve({ answer, timedOut: false });
    };

    socket.on("submit_answer_round4", answerHandler);

    // If they don't answer in time, pass to AI
    const timer = setTimeout(() => {
      if (answered) return;
      answered = true;
      socket.off("submit_answer_round4", answerHandler);
      resolve({ answer: null, timedOut: true });
    }, timeoutMs);
  });
}

// ── AI turns runner ───────────────────────────────────────────────────────────
async function runAITurn(io, socket, sessionId, ai, question, letters) {
  let session = await Session.findById(sessionId);
  if (!session || session.status === "finished") return;

  const config = AI_CONFIG[session.difficulty] || AI_CONFIG.medium;
  const thinkTime = Math.floor(
    Math.random() * (config.maxThink - config.minThink) + config.minThink,
  );

  io.to(sessionId).emit("ai_thinking", {
    playerId: ai.playerId,
    name: ai.name,
    thinkTime,
  });
  await sleep(thinkTime);

  session = await Session.findById(sessionId);
  if (!session || session.status === "finished") return;

  const isCorrect = Math.random() < config.correctRate;

  const { moneyDelta, wentOutside } = processAnswer(
    session,
    ai.playerId,
    isCorrect ? question.answer : "",
    question.answer,
  );

  const round = session.currentRound;

  session.rounds[round - 1].questionLog.push({
    questionId: question._id,
    askedTo: ai.playerId,
    answeredBy: ai.playerId,
    isCorrect,
    wentOutsideAlphabet: false,
    moneyDelta,
  });

  session.players.find(
    (p) => p.playerId === ai.playerId,
  ).questionsAnsweredThisRound += 1;
  session.questionsAskedThisRound += 1;
  session.markModified("players");
  session.markModified(`rounds.${round - 1}.questionLog`);
  await session.save();

  io.to(sessionId).emit("answer_result", {
    playerId: ai.playerId,
    playerName: ai.name,
    isHuman: false,
    isCorrect,
    wentOutside: false,
    correctAnswer: isCorrect ? null : question.answer,
    moneyDelta,
    scores: getScores(session),
    questionsAskedThisRound: session.questionsAskedThisRound,
    totalQuestionsThisRound: TOTAL_QUESTIONS_PER_ROUND[round],
  });

  // Round 3 instant elimination check
  if (round === 3 && !isCorrect) {
    // AI going outside alphabet would trigger instant elimination
    // (AI never intentionally goes outside, but we check for safety)
  }

  return session;
}

// ── Main game handler ─────────────────────────────────────────────────────────
module.exports = function gameHandler(io, socket) {
  // ── join_game ──────────────────────────────────────────────────────────────
  socket.on("join_game", async ({ sessionId }) => {
    try {
      const session = await Session.findById(sessionId);
      if (!session)
        return socket.emit("error", { message: "Session not found" });

      socket.join(sessionId);

      socket.emit("game_joined", {
        session: {
          _id: session._id,
          difficulty: session.difficulty,
          players: session.players,
          currentRound: session.currentRound,
          status: session.status,
          rounds: session.rounds,
          lifelineAvailable: session.lifelineAvailable,
          questionsAskedThisRound: session.questionsAskedThisRound,
          round4Letters: session.round4Letters,
        },
      });
    } catch (err) {
      socket.emit("error", { message: err.message });
    }
  });

  // ── select_letter ──────────────────────────────────────────────────────────
  socket.on("select_letter", async ({ sessionId, letter }) => {
    try {
      const session = await Session.findById(sessionId);
      if (!session)
        return socket.emit("error", { message: "Session not found" });

      const upper = letter.toUpperCase();
      if (session.lettersUsed.includes(upper)) {
        return socket.emit("error", {
          message: `${upper} has already been used`,
        });
      }

      const roundIndex = session.currentRound - 1;
      session.rounds[roundIndex].letter = upper;
      session.lettersUsed.push(upper);
      session.questionsAskedThisRound = 0;
      await session.save();

      io.to(sessionId).emit("letter_selected", {
        round: session.currentRound,
        letter: upper,
      });

      // Human always gets first question
      socket.emit("your_turn", {
        round: session.currentRound,
        letter: upper,
        questionsAskedThisRound: 0,
        totalQuestionsThisRound:
          TOTAL_QUESTIONS_PER_ROUND[session.currentRound],
      });
    } catch (err) {
      socket.emit("error", { message: err.message });
    }
  });

  // ── request_lifeline ───────────────────────────────────────────────────────
  // Round 2 only — reveals first letter of the correct answer
  socket.on("request_lifeline", async ({ sessionId, questionId }) => {
    try {
      const session = await Session.findById(sessionId);
      if (!session)
        return socket.emit("error", { message: "Session not found" });
      if (!session.lifelineAvailable)
        return socket.emit("error", { message: "Lifeline already used" });
      if (session.currentRound !== 2)
        return socket.emit("error", {
          message: "Lifeline only available in Round 2",
        });

      const question = await Question.findById(questionId);
      if (!question)
        return socket.emit("error", { message: "Question not found" });

      session.lifelineAvailable = false;
      session.lifelineUsed = true;
      await session.save();

      const firstLetter = question.answer.trim()[0].toUpperCase();

      socket.emit("lifeline_result", {
        hint: `The answer starts with "${firstLetter}"`,
        lifelineAvailable: false,
      });
    } catch (err) {
      socket.emit("error", { message: err.message });
    }
  });

  // ── submit_answer ──────────────────────────────────────────────────────────
  socket.on("submit_answer", async ({ sessionId, questionId, answer }) => {
    try {
      let session = await Session.findById(sessionId);
      if (!session)
        return socket.emit("error", { message: "Session not found" });

      const question = await Question.findById(questionId);
      if (!question)
        return socket.emit("error", { message: "Question not found" });

      const human = getHuman(session);
      const round = session.currentRound;
      const roundIndex = round - 1;

      const { isCorrect, wentOutside, moneyDelta } = processAnswer(
        session,
        human.playerId,
        answer,
        question.answer,
      );

      session.rounds[roundIndex].questionLog.push({
        questionId: question._id,
        askedTo: human.playerId,
        answeredBy: human.playerId,
        isCorrect,
        wentOutsideAlphabet: wentOutside,
        moneyDelta,
      });

      // Increment question counters
      const humanIdx = session.players.findIndex((p) => p.isHuman);
      session.players[humanIdx].questionsAnsweredThisRound += 1;
      session.questionsAskedThisRound += 1;

      // Round 3 instant alphabet elimination
      if (round === 3 && wentOutside) {
        session.players[humanIdx].isEliminated = true;
        session.players[humanIdx].eliminatedInRound = 3;
        session.rounds[roundIndex].instantEliminations.push(human.playerId);
      }

      session.markModified("players");
      session.markModified(`rounds.${roundIndex}.questionLog`);
      await session.save();

      const totalThisRound = TOTAL_QUESTIONS_PER_ROUND[round];

      io.to(sessionId).emit("answer_result", {
        playerId: human.playerId,
        playerName: human.name,
        isHuman: true,
        isCorrect,
        wentOutside,
        correctAnswer: isCorrect ? null : question.answer,
        moneyDelta,
        scores: getScores(session),
        questionsAskedThisRound: session.questionsAskedThisRound,
        totalQuestionsThisRound: totalThisRound,
        instantElimination: round === 3 && wentOutside,
      });

      // If human was instantly eliminated in Round 3, check if round should end
      if (round === 3 && wentOutside) {
        const remaining = getActivePlayers(session);
        if (remaining.length <= 2) {
          // Enough players remain to advance — end round
          await handleRoundEnd(io, socket, sessionId);
          return;
        }
      }

      // Check if all questions for this round have been asked
      /*console.log(
        `Questions asked: ${session.questionsAskedThisRound} / ${totalThisRound}`,
      );*/
      if (session.questionsAskedThisRound >= totalThisRound) {
        console.log("Round end triggered");
        await handleRoundEnd(io, socket, sessionId);
        return;
      }

      // Run AI turns then return control to human
      const ais = getActiveAIs(session);
      for (const ai of ais) {
        session = await Session.findById(sessionId);
        if (!session || session.status === "finished") return;

        // Skip if this AI has answered their quota
        const aiPlayer = session.players.find(
          (p) => p.playerId === ai.playerId,
        );
        if (!aiPlayer || aiPlayer.isEliminated) continue;

        const letters = round === 4 ? session.round4Letters : null;
        const question = await fetchQuestion(session, letters);
        if (!question) break;

        await runAITurn(io, socket, sessionId, ai, question, letters);

        // Check round end after each AI turn
        session = await Session.findById(sessionId);
        if (session.questionsAskedThisRound >= totalThisRound) {
          await handleRoundEnd(io, socket, sessionId);
          return;
        }
      }

      // All AI turns done — human's turn again
      session = await Session.findById(sessionId);
      if (
        session &&
        session.status === "active" &&
        session.questionsAskedThisRound < totalThisRound
      ) {
        const currentLetter = session.rounds[session.currentRound - 1]?.letter;
        socket.emit("your_turn", {
          round: session.currentRound,
          letter: currentLetter,
          questionsAskedThisRound: session.questionsAskedThisRound,
          totalQuestionsThisRound: totalThisRound,
        });
      }
    } catch (err) {
      socket.emit("error", { message: err.message });
    }
  });

  // ── Round end logic ────────────────────────────────────────────────────────
  async function handleRoundEnd(io, socket, sessionId) {
    let session = await Session.findById(sessionId);
    if (!session) return;

    const round = session.currentRound;
    const active = getActivePlayers(session);

    if (round === 3) {
      // Top 2 scorers advance — everyone else eliminated
      const sorted = [...active].sort((a, b) => b.score - a.score);
      const advancing = sorted.slice(0, 2).map((p) => p.playerId);

      session.players.forEach((p, i) => {
        if (!p.isEliminated && !advancing.includes(p.playerId)) {
          session.players[i].isEliminated = true;
          session.players[i].eliminatedInRound = 3;
        }
      });

      session.markModified("players");
      await session.save();

      const nextRound = await advanceRound(io, sessionId, session);

      session = await Session.findById(sessionId);

      io.to(sessionId).emit("round_over", {
        round,
        nextRound,
        advancing: session.players
          .filter((p) => advancing.includes(p.playerId))
          .map((p) => ({ name: p.name, score: p.score, isHuman: p.isHuman })),
        eliminated: session.players
          .filter((p) => p.eliminatedInRound === 3)
          .map((p) => ({ name: p.name, score: p.score })),
        scores: getScores(session),
        round4Letters: session.round4Letters,
      });
    } else if (round === 4) {
      // Game over — highest score wins
      const winner = active.reduce((max, p) => (p.score > max.score ? p : max));

      session.status = "finished";
      session.winnerId = winner.playerId;
      session.finishedAt = new Date();
      session.rounds[3].status = "finished";
      session.rounds[3].finishedAt = new Date();
      await session.save();

      io.to(sessionId).emit("game_over", {
        winner,
        finalScores: getScores(session),
      });
    } else {
      // Rounds 1 and 2 — eliminate lowest scorer
      const lowest = getLowestScorer(session);

      if (lowest) {
        const lowestIdx = session.players.findIndex(
          (p) => p.playerId === lowest.playerId,
        );
        session.players[lowestIdx].isEliminated = true;
        session.players[lowestIdx].eliminatedInRound = round;
        session.rounds[round - 1].eliminatedId = lowest.playerId;
        session.markModified("players");
        await session.save();
      }

      const nextRound = await advanceRound(io, sessionId, session);
      session = await Session.findById(sessionId);

      io.to(sessionId).emit("round_over", {
        round,
        nextRound,
        eliminatedId: lowest?.playerId,
        eliminatedName: lowest?.name,
        scores: getScores(session),
      });
    }
  }

  // ── end_game (manual fallback) ─────────────────────────────────────────────
  socket.on("end_game", async ({ sessionId }) => {
    try {
      const session = await Session.findById(sessionId);
      if (!session)
        return socket.emit("error", { message: "Session not found" });
      await handleRoundEnd(io, socket, sessionId);
    } catch (err) {
      socket.emit("error", { message: err.message });
    }
  });
};
