const mongoose = require("mongoose");

const questionSchema = new mongoose.Schema(
  {
    text: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    answer: {
      type: String,
      required: true,
      trim: true,
    },
    validLetters: {
      type: [String],
      required: true,
    },
    round: {
      type: Number,
      required: true,
      min: 1,
      max: 4,
    },
    category: {
      type: String,
      required: true,
      enum: [
        "general",
        "history",
        "science",
        "geography",
        "sports",
        "entertainment",
      ],
    },
    source: {
      type: String,
      default: "opentdb",
      enum: ["opentdb", "manual", "user_submitted"],
    },
    status: {
      type: String,
      default: "active",
      enum: ["active", "pending", "rejected"],
    },
    submittedBy: {
      type: String,
      default: null,
    },
    stats: {
      timesUsed: { type: Number, default: 0 },
      timesCorrect: { type: Number, default: 0 },
      timesWrong: { type: Number, default: 0 },
      successRate: { type: Number, default: 0 },
    },
  },
  { timestamps: true },
);

// Primary game query index
questionSchema.index({ validLetters: 1, round: 1, status: 1 });

// Admin moderation queue index
questionSchema.index({ status: 1, source: 1 });

module.exports = mongoose.model("Question", questionSchema);
