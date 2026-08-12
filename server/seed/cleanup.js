require("dotenv").config({ path: "../.env" });
const mongoose = require("mongoose");
const Question = require("../models/Question");

async function cleanup() {
  const mongoUri =
    process.env.MONGO_URI || "mongodb://localhost:27017/alphawiz";
  console.log("Connecting to MongoDB…");
  await mongoose.connect(mongoUri);
  console.log("Connected.\n");

  // Reject questions whose answers are meaningless without options
  const nonsenseAnswers = [
    "all of the above",
    "none of the above",
    "both a and b",
    "both b and c",
    "both a and c",
    "a and b",
    "b and c",
  ];

  // Check a sample of answers to see what's in the database
  const sample = await Question.find({}).limit(10).select("answer");
  console.log(
    "Sample answers:",
    sample.map((q) => q.answer),
  );

  const result = await Question.updateMany(
    {
      answer: {
        $regex:
          "^(all of the above|none of the above|both a and b|both b and c|both a and c|a and b|b and c)$",
        $options: "i",
      },
    },
    { $set: { status: "rejected" } },
  );

  console.log(
    `Rejected ${result.modifiedCount} questions with nonsense answers`,
  );

  const phrasingResult = await Question.updateMany(
    { text: { $regex: "which of the following", $options: "i" } },
    { $set: { status: "rejected" } },
  );
  console.log(
    `Rejected ${phrasingResult.modifiedCount} "which of the following" questions`,
  );

  await mongoose.disconnect();
  console.log("Done.");
}

cleanup().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
