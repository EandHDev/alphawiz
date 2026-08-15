require("dotenv").config({ path: "./.env" });
const Anthropic = require("@anthropic-ai/sdk");
const fs = require("fs");
const path = require("path");

const client = new Anthropic.default({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const CATEGORIES = [
  "history",
  "politics",
  "geography",
  "science",
  "sports",
  "entertainment",
  "mythology",
  "general",
];

const DIFFICULTY_LABELS = {
  1: "easy",
  2: "medium",
  3: "hard",
};

const DIFFICULTY_GUIDANCE = {
  1: "Easy questions — suitable for general audience, widely known facts, basic knowledge. Primary school to early secondary school level.",
  2: "Medium questions — require some knowledge, not immediately obvious but knowable to an engaged adult. Secondary school to general trivia level.",
  3: "Hard questions — specialist knowledge, obscure facts, deep trivia. University level or dedicated enthusiast.",
};

const CATEGORY_EXAMPLES = {
  history:
    "world history, ancient civilisations, wars, empires, historical figures",
  politics:
    "world leaders, governments, political parties, elections, diplomacy, international organisations",
  geography:
    "countries, capitals, rivers, mountains, landmarks, flags, borders",
  science:
    "biology, chemistry, physics, astronomy, medicine, inventions, scientists",
  sports:
    "football, tennis, athletics, cricket, boxing, golf, Olympics, rugby, basketball",
  entertainment:
    "film, television, music, pop culture, literature, art, theatre, celebrity",
  mythology:
    "Greek mythology, Roman mythology, Norse mythology, Egyptian mythology, gods, heroes, legends",
  general:
    "food, language, animals, technology, business, religion, fashion, architecture",
};

async function generateBatch(letter, round, category, count = 10) {
  const difficulty = DIFFICULTY_LABELS[round];
  const guidance = DIFFICULTY_GUIDANCE[round];
  const examples = CATEGORY_EXAMPLES[category];

  // Step 1: Get a list of correct answers starting with the letter
  const answersPrompt = `List exactly ${count + 3} well-known, verifiable facts, names, or terms that:
1. Start with the letter "${letter}"
2. Are related to: ${category} (${examples})
3. Difficulty level: ${difficulty} — ${guidance}
4. Would make good trivia answers (specific, unambiguous, 1-4 words)

Rules:
- Every item MUST genuinely start with "${letter}"
- Every item must be 100% real and verifiable
- No made-up or uncertain facts
- Do NOT use "Ancient", "Modern", "Early", or similar qualifiers as the first word — just use the core name (e.g. "Rome" not "Ancient Rome", "Egypt" not "Ancient Egypt")
- Vary the items — don't repeat similar answers

Respond with ONLY a JSON array of strings, no explanation:
["Answer One", "Answer Two", ...]`;

  const answersMsg = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 1000,
    messages: [{ role: "user", content: answersPrompt }],
  });

  const answersRaw = answersMsg.content[0].text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  const answersList = JSON.parse(answersRaw);

  // Filter to only keep answers that genuinely start with the letter
  const validAnswers = answersList.filter(
    (a) =>
      typeof a === "string" &&
      a.trim()[0]?.toUpperCase() === letter.toUpperCase(),
  );

  if (!validAnswers.length) return [];

  // Step 2: Write a question for each answer
  const questionsPrompt = `You are a professional trivia question writer for a quiz show called AlphaWiz.

For each answer below, write one trivia question in the style of The Weakest Link (short, punchy, unambiguous).

Rules:
- The question must have ONLY the given answer as its correct answer
- Do NOT use "which of the following" phrasing
- Questions must be answerable by free recall
- Keep questions concise — one sentence maximum
- Use the answer exactly as given — do not modify or shorten it
- Write questions that make the answer feel natural without needing qualifiers
- Difficulty: ${difficulty} — ${guidance}
- Category: ${category}

Answers to write questions for:
${validAnswers.map((a, i) => `${i + 1}. ${a}`).join("\n")}

Respond with ONLY a valid JSON array, no explanation:
[
  {"text": "question here", "answer": "exact answer from the list above"},
  ...
]`;

  const questionsMsg = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 3000,
    messages: [{ role: "user", content: questionsPrompt }],
  });

  const questionsRaw = questionsMsg.content[0].text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  const questions = JSON.parse(questionsRaw);

  // Final validation — answer must start with correct letter
  return questions.filter(
    (q) => q.answer?.trim()[0]?.toUpperCase() === letter.toUpperCase(),
  );
}

async function generateForLetter(letter) {
  console.log(`\n${"─".repeat(50)}`);
  console.log(`Generating questions for letter: ${letter}`);
  console.log("─".repeat(50));

  const allQuestions = [];
  const seenAnswers = new Set();

  for (const round of [1, 2, 3]) {
    console.log(`\n  Round ${round} (${DIFFICULTY_LABELS[round]}):`);

    // Distribute 50 questions across 8 categories (~6-7 per category)
    const perCategory = Math.ceil(50 / CATEGORIES.length);
    let roundQuestions = [];

    for (const category of CATEGORIES) {
      process.stdout.write(`    ${category}… `);
      try {
        const batch = await generateBatch(
          letter,
          round,
          category,
          perCategory + 2,
        );

        // Flag answers that look like they might be forced
        const suspicious = batch.filter((q) => {
          const answer = q.answer.toLowerCase();
          return answer.includes("ancient") && answer.split(" ").length > 2;
        });
        if (suspicious.length > 0) {
          console.log(
            `    ⚠ ${suspicious.length} potentially forced answers flagged for review`,
          );
        }
        // Deduplicate by answer
        const unique = batch.filter((q) => {
          const key = q.answer.trim().toUpperCase();
          if (seenAnswers.has(key)) return false;
          seenAnswers.add(key);
          return true;
        });

        roundQuestions = roundQuestions.concat(unique);
        console.log(`${unique.length} questions`);

        // Small delay between API calls
        await new Promise((r) => setTimeout(r, 500));
      } catch (err) {
        console.log(`ERROR: ${err.message}`);
      }
    }

    // Take exactly 50 (or as many as we got)
    const finalBatch = roundQuestions.slice(0, 50).map((q) => ({
      text: q.text,
      answer: q.answer.trim(),
      validLetters: [letter.toUpperCase()],
      round,
      category: q.category || "general",
      source: "manual",
      status: "active",
      submittedBy: null,
      stats: { timesUsed: 0, timesCorrect: 0, timesWrong: 0, successRate: 0 },
    }));

    console.log(`  → ${finalBatch.length} questions for Round ${round}`);
    allQuestions.push(...finalBatch);
  }

  // Save to JSON file
  const outputDir = path.join(__dirname, "generated");
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);

  const outputPath = path.join(outputDir, `${letter}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(allQuestions, null, 2));

  console.log(
    `\n✓ Saved ${allQuestions.length} questions to seed/generated/${letter}.json`,
  );
  return allQuestions;
}

// Get letter from command line argument
const letter = process.argv[2]?.toUpperCase();

if (!letter || !/^[A-Z]$/.test(letter)) {
  console.error("Usage: node generateQuestions.js <letter>");
  console.error("Example: node generateQuestions.js A");
  process.exit(1);
}

generateForLetter(letter).catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
