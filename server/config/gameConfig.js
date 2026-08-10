const AVAILABLE_LETTERS = [
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
  "H",
  "I",
  "J",
  "K",
  "L",
  "M",
  "N",
  "O",
  "P",
  "R",
  "S",
  "T",
  "V",
  "W",
];

const MIN_QUESTIONS_PER_ROUND = 5;

// Questions per player per round
const QUESTIONS_PER_PLAYER = {
  1: 3,
  2: 3,
  3: 3,
  4: 5, // Round 4 is 5 questions total, not per player
};

// Total questions per round (calculated from player counts)
// Round 1: 3 × 5 players = 15
// Round 2: 3 × 4 players = 12
// Round 3: 3 × 3 players = 9
// Round 4: 5 questions total
const TOTAL_QUESTIONS_PER_ROUND = {
  1: 15,
  2: 12,
  3: 9,
  4: 5,
};

const ROUND_VALUES = {
  1: 100,
  2: 200,
  3: 300,
  4: 500,
};

// Wrong answer penalty per round (0 = no penalty)
const WRONG_ANSWER_PENALTY = {
  1: 0,
  2: 200,
  3: 300,
  4: 0, // Round 4 has no deduction — pure accumulation
};

const CURRENCY = "$";

const ROUND_NAMES = {
  1: "Beginner's Luck",
  2: "United We Stand",
  3: "No Free Lunch",
  4: "All or Nothing!",
};

// Round 4 answer window in seconds
const ROUND_4_ANSWER_SECONDS = 15;

module.exports = {
  AVAILABLE_LETTERS,
  MIN_QUESTIONS_PER_ROUND,
  QUESTIONS_PER_PLAYER,
  TOTAL_QUESTIONS_PER_ROUND,
  ROUND_VALUES,
  WRONG_ANSWER_PENALTY,
  CURRENCY,
  ROUND_NAMES,
  ROUND_4_ANSWER_SECONDS,
};
