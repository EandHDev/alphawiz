require("dotenv").config({ path: "./.env" });
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
const Question = require("../models/Question");

async function importLetter(letter) {
  const filePath = path.join(__dirname, "generated", `${letter}.json`);

  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  const questions = JSON.parse(fs.readFileSync(filePath, "utf8"));
  console.log(`Found ${questions.length} questions for letter ${letter}`);

  try {
    const result = await Question.insertMany(questions, {
      ordered: false,
      rawResult: true,
    });
    console.log(`Inserted: ${result.insertedCount}`);
  } catch (err) {
    if (err.name === "MongoBulkWriteError") {
      console.log(`Inserted: ${err.result?.nInserted ?? 0}`);
      console.log(
        `Duplicates skipped: ${questions.length - (err.result?.nInserted ?? 0)}`,
      );
    } else {
      throw err;
    }
  }
}

async function main() {
  const letter = process.argv[2]?.toUpperCase();
  if (!letter || !/^[A-Z]$/.test(letter)) {
    console.error("Usage: node importQuestions.js <letter>");
    process.exit(1);
  }

  const mongoUri =
    process.env.MONGO_URI || "mongodb://localhost:27017/alphawiz";
  console.log(`Connecting to MongoDB…`);
  await mongoose.connect(mongoUri);
  console.log("Connected.\n");

  await importLetter(letter);

  await mongoose.disconnect();
  console.log("Done.");
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
