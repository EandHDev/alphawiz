const Session = require("../models/Session");
const Question = require("../models/Question");
const { AVAILABLE_LETTERS } = require("../config/gameConfig");

const AI_NAMES = [
  "Alice",
  "Bernard",
  "Clara",
  "Derek",
  "Elena",
  "Felix",
  "Grace",
  "Hugo",
  "Iris",
  "James",
];

function pickAINames(humanName) {
  // Pick 4 AI names that don't clash with the human's name
  const available = AI_NAMES.filter(
    (n) => n.toLowerCase() !== humanName.toLowerCase(),
  );
  // Shuffle and take 4
  return available.sort(() => Math.random() - 0.5).slice(0, 4);
}

// POST /api/sessions
const createSession = async (req, res) => {
  try {
    const { playerName, playerSocketId, difficulty = "medium" } = req.body;

    if (!playerName?.trim()) {
      return res
        .status(400)
        .json({ success: false, message: "Player name is required" });
    }
    if (!playerSocketId) {
      return res
        .status(400)
        .json({ success: false, message: "Socket ID is required" });
    }

    const aiNames = pickAINames(playerName.trim());

    // Build player list: human first, then 4 AI opponents
    const humanPlayer = {
      playerId: playerSocketId,
      name: playerName.trim(),
      isHuman: true,
      score: 0,
    };

    const aiPlayers = aiNames.map((name, i) => ({
      playerId: `ai_${i}_${Date.now()}`,
      name,
      isHuman: false,
      score: 0,
    }));

    const allPlayers = [humanPlayer, ...aiPlayers];

    const session = await Session.create({
      status: "active",
      difficulty,
      players: allPlayers,
      currentRound: 1,
      rounds: [1, 2, 3, 4].map((n) => ({
        roundNumber: n,
        status: n === 1 ? "active" : "pending",
        startedAt: n === 1 ? new Date() : null,
      })),
      lettersUsed: [],
    });

    res.status(201).json({ success: true, session });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/sessions/:id
const getSession = async (req, res) => {
  try {
    const session = await Session.findById(req.params.id);
    if (!session) {
      return res
        .status(404)
        .json({ success: false, message: "Session not found" });
    }
    res.json({ success: true, session });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/sessions/:id/question
const getNextQuestion = async (req, res) => {
  try {
    const session = await Session.findById(req.params.id);
    if (!session) {
      return res
        .status(404)
        .json({ success: false, message: "Session not found" });
    }

    const round = session.currentRound;
    const letter = session.rounds[round - 1]?.letter;

    if (!letter) {
      return res
        .status(400)
        .json({ success: false, message: "No letter selected for this round" });
    }

    const askedIds = session.rounds
      .flatMap((r) => r.questionLog)
      .map((q) => q.questionId);

    const [question] = await Question.aggregate([
      {
        $match: {
          validLetters: letter,
          round,
          status: "active",
          _id: { $nin: askedIds },
        },
      },
      { $sample: { size: 1 } },
    ]);

    if (!question) {
      return res
        .status(404)
        .json({
          success: false,
          message: `No more questions for letter ${letter} in round ${round}`,
        });
    }

    const { answer, ...safeQuestion } = question;
    res.json({ success: true, question: safeQuestion });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/sessions/:id/letters
const getAvailableLetters = async (req, res) => {
  try {
    const session = await Session.findById(req.params.id);
    if (!session) {
      return res
        .status(404)
        .json({ success: false, message: "Session not found" });
    }
    const available = AVAILABLE_LETTERS.filter(
      (l) => !session.lettersUsed.includes(l),
    );
    res.json({ success: true, letters: available });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = {
  createSession,
  getSession,
  getNextQuestion,
  getAvailableLetters,
};
