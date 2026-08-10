const mongoose = require("mongoose");

const questionLogSchema = new mongoose.Schema(
  {
    questionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Question",
      required: true,
    },
    askedTo: { type: String, required: true },
    answeredBy: { type: String, default: null },
    isCorrect: { type: Boolean, default: null },
    wentOutsideAlphabet: { type: Boolean, default: false },
    moneyDelta: { type: Map, of: Number, default: {} },
    answeredAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const roundSchema = new mongoose.Schema(
  {
    roundNumber: { type: Number, required: true, min: 1, max: 4 },
    letter: { type: String, default: null },
    status: {
      type: String,
      enum: ["pending", "active", "finished"],
      default: "pending",
    },
    questionLog: { type: [questionLogSchema], default: [] },
    eliminatedId: { type: String, default: null },
    // Round 3 can have multiple instant eliminations
    instantEliminations: { type: [String], default: [] },
    startedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
  },
  { _id: false },
);

const playerSchema = new mongoose.Schema(
  {
    playerId: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    isHuman: { type: Boolean, default: false },
    score: { type: Number, default: 0 },
    isEliminated: { type: Boolean, default: false },
    eliminatedInRound: { type: Number, default: null },
    // Tracks how many questions this player has answered in the current round
    questionsAnsweredThisRound: { type: Number, default: 0 },
  },
  { _id: false },
);

const sessionSchema = new mongoose.Schema(
  {
    status: { type: String, enum: ["active", "finished"], default: "active" },
    difficulty: {
      type: String,
      enum: ["easy", "medium", "hard"],
      default: "medium",
    },
    players: { type: [playerSchema], default: [] },

    currentRound: { type: Number, default: 1, min: 1, max: 4 },
    rounds: { type: [roundSchema], default: [] },
    lettersUsed: { type: [String], default: [] },

    // Tracks total questions asked in the current round
    questionsAskedThisRound: { type: Number, default: 0 },

    // Round 4 uses all 3 previous letters
    round4Letters: { type: [String], default: [] },

    // Lifeline — one per game, used in Round 2
    lifelineAvailable: { type: Boolean, default: true },
    lifelineUsed: { type: Boolean, default: false },

    winnerId: { type: String, default: null },
    finishedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

sessionSchema.index({ status: 1 });
sessionSchema.index({ "players.playerId": 1 });

module.exports = mongoose.model("Session", sessionSchema);
