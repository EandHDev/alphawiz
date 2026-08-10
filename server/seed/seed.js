require("dotenv").config({ path: "../.env" });
const mongoose = require("mongoose");
const axios = require("axios");
const he = require("he");
const Question = require("../models/Question");

const OPENTDB_BASE = "https://opentdb.com/api.php";
const OPENTDB_TOKEN = "https://opentdb.com/api_token.php?command=request";
const BATCH_SIZE = 50;
const DELAY_MS = 5200;

const RESPONSE = {
  SUCCESS: 0,
  NO_RESULTS: 1,
  INVALID_PARAM: 2,
  TOKEN_MISSING: 3,
  TOKEN_EMPTY: 4,
};

const CATEGORY_MAP = {
  9: "general",
  10: "entertainment",
  11: "entertainment",
  12: "entertainment",
  14: "entertainment",
  17: "science",
  18: "science",
  19: "science",
  21: "sports",
  22: "geography",
  23: "history",
  24: "general",
  25: "entertainment",
  26: "entertainment",
  27: "science",
};

const DIFFICULTY_TO_ROUND = {
  easy: 1,
  medium: 2,
  hard: 3,
};

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const decode = (str) => he.decode(str ?? "").trim();

function getValidLetters(answer) {
  const first = answer[0]?.toUpperCase();
  if (!first || !/[A-Z]/.test(first)) return null;
  return [first];
}

function mapToSchema(item, categoryId) {
  const text = decode(item.question);
  const answer = decode(item.correct_answer);
  const validLetters = getValidLetters(answer);

  if (!validLetters) return null;

  return {
    text,
    answer,
    validLetters,
    round: DIFFICULTY_TO_ROUND[item.difficulty] ?? 2,
    category: CATEGORY_MAP[categoryId] ?? "general",
    source: "opentdb",
    status: "active",
    submittedBy: null,
    stats: { timesUsed: 0, timesCorrect: 0, timesWrong: 0, successRate: 0 },
  };
}

async function requestToken() {
  const { data } = await axios.get(OPENTDB_TOKEN);
  if (data.response_code !== RESPONSE.SUCCESS) {
    throw new Error(`Token request failed (code ${data.response_code})`);
  }
  console.log("Session token acquired.\n");
  return data.token;
}

async function fetchBatch(categoryId, difficulty, token) {
  const { data } = await axios.get(OPENTDB_BASE, {
    params: {
      amount: BATCH_SIZE,
      category: categoryId,
      difficulty,
      type: "multiple",
      token,
    },
  });

  switch (data.response_code) {
    case RESPONSE.SUCCESS:
      return data.results;
    case RESPONSE.TOKEN_EMPTY:
      console.log("    Token empty — skipping.");
      return [];
    case RESPONSE.NO_RESULTS:
      console.log("    No results — skipping.");
      return [];
    default:
      throw new Error(`Unexpected response code: ${data.response_code}`);
  }
}

async function bulkInsert(docs) {
  if (!docs.length) return { inserted: 0, duplicates: 0 };
  try {
    const result = await Question.insertMany(docs, {
      ordered: false,
      rawResult: true,
    });
    return { inserted: result.insertedCount, duplicates: 0 };
  } catch (err) {
    if (err.name === "MongoBulkWriteError") {
      const inserted = err.result?.nInserted ?? 0;
      const duplicates = docs.length - inserted;
      return { inserted, duplicates };
    }
    throw err;
  }
}

async function seed() {
  const mongoUri =
    process.env.MONGO_URI || "mongodb://localhost:27017/alphawiz";
  console.log("Connecting to MongoDB…");
  await mongoose.connect(mongoUri);
  console.log("Connected.\n");

  console.log("Requesting OpenTDB session token…");
  const token = await requestToken();

  const categories = Object.keys(CATEGORY_MAP).map(Number);
  const difficulties = ["easy", "medium", "hard"];
  const totals = { inserted: 0, duplicates: 0, skipped: 0, errors: 0 };

  for (const categoryId of categories) {
    for (const difficulty of difficulties) {
      const label = `[cat ${categoryId} · ${CATEGORY_MAP[categoryId]} · ${difficulty}]`;
      process.stdout.write(`${label}  fetching… `);

      try {
        const raw = await fetchBatch(categoryId, difficulty, token);

        if (!raw.length) {
          await sleep(DELAY_MS);
          continue;
        }

        const docs = raw
          .map((item) => mapToSchema(item, categoryId))
          .filter(Boolean);
        const skipped = raw.length - docs.length;
        const { inserted, duplicates } = await bulkInsert(docs);

        totals.inserted += inserted;
        totals.duplicates += duplicates;
        totals.skipped += skipped;

        process.stdout.write(
          `inserted ${inserted}  dupes ${duplicates}  skipped ${skipped}\n`,
        );
      } catch (err) {
        process.stdout.write(`ERROR: ${err.message}\n`);
        totals.errors++;
      }

      await sleep(DELAY_MS);
    }
  }

  console.log("\n────────────────────────────────");
  console.log("Seeding complete");
  console.log(`  Inserted:          ${totals.inserted}`);
  console.log(`  Duplicates:        ${totals.duplicates}`);
  console.log(`  Non-alpha skipped: ${totals.skipped}`);
  console.log(`  Errors:            ${totals.errors}`);
  console.log("────────────────────────────────");

  console.log("\nLetter coverage (active questions per letter × round):");
  const coverage = await Question.aggregate([
    { $match: { status: "active" } },
    { $unwind: "$validLetters" },
    {
      $group: {
        _id: { letter: "$validLetters", round: "$round" },
        count: { $sum: 1 },
      },
    },
    { $sort: { "_id.letter": 1, "_id.round": 1 } },
  ]);

  const table = {};
  for (const row of coverage) {
    const { letter, round } = row._id;
    if (!table[letter]) table[letter] = {};
    table[letter][round] = row.count;
  }

  const header = "Letter |  R1  |  R2  |  R3";
  console.log(header);
  console.log("-".repeat(header.length));
  for (const letter of "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("")) {
    const row = table[letter] ?? {};
    const r1 = String(row[1] ?? 0).padStart(4);
    const r2 = String(row[2] ?? 0).padStart(4);
    const r3 = String(row[3] ?? 0).padStart(4);
    console.log(`  ${letter}    | ${r1} | ${r2} | ${r3}`);
  }

  await mongoose.disconnect();
  console.log("\nDone.");
}

seed().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
