const express = require("express");
const router = express.Router();
const {
  createSession,
  getSession,
  getNextQuestion,
  getAvailableLetters,
} = require("../controllers/sessionController");

router.post("/", createSession);
router.get("/:id", getSession);
router.get("/:id/question", getNextQuestion);
router.get("/:id/letters", getAvailableLetters);

module.exports = router;
