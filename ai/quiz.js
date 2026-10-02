// ai/quiz.js

const { callProvider } = require("./providers");
const MODELS = require("./models");

const PROVIDERS = [
    "gemini",
    "groq",
    "llm7",
    "nvidia",
    "openrouter"
];


// ========================================
// Extract JSON
// ========================================

function extractJSON(text) {
    if (!text) {
        throw new Error("Empty AI response");
    }

    let cleaned = text.trim();

    cleaned = cleaned
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();

    try {
        return JSON.parse(cleaned);
    } catch { }

    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");

    if (start !== -1 && end > start) {
        try {
            return JSON.parse(
                cleaned.slice(start, end + 1)
            );
        } catch { }
    }

    throw new Error("AI returned invalid JSON");
}


// ========================================
// Validate quiz
// ========================================

function validateQuiz(quiz) {

    if (!quiz || typeof quiz !== "object") {
        throw new Error("Quiz must be an object");
    }

    if (!Array.isArray(quiz.questions)) {
        throw new Error(
            "Quiz.questions must be an array"
        );
    }

    if (quiz.questions.length !== 10) {
        throw new Error(
            `Expected 10 questions, received ${quiz.questions.length}`
        );
    }

    const seen = new Set();

    quiz.questions.forEach((q, index) => {

        const number = index + 1;

        if (!q || typeof q !== "object") {
            throw new Error(
                `Question ${number} is invalid`
            );
        }

        if (
            typeof q.question !== "string" ||
            !q.question.trim()
        ) {
            throw new Error(
                `Question ${number} has no question`
            );
        }

        if (!Array.isArray(q.options)) {
            throw new Error(
                `Question ${number} options must be an array`
            );
        }

        if (q.options.length !== 4) {
            throw new Error(
                `Question ${number} must have exactly 4 options`
            );
        }

        const options = q.options.map(
            option => String(option).trim()
        );

        if (
            options.some(option => !option)
        ) {
            throw new Error(
                `Question ${number} contains an empty option`
            );
        }

        if (
            new Set(options).size !== 4
        ) {
            throw new Error(
                `Question ${number} contains duplicate options`
            );
        }

        if (
            typeof q.answer !== "string" ||
            !options.includes(q.answer.trim())
        ) {
            throw new Error(
                `Question ${number} answer does not match an option`
            );
        }

        if (
            typeof q.explanation !== "string" ||
            !q.explanation.trim()
        ) {
            throw new Error(
                `Question ${number} has no explanation`
            );
        }

        const normalized =
            q.question
                .trim()
                .toLowerCase();

        if (seen.has(normalized)) {
            throw new Error(
                `Duplicate question: ${number}`
            );
        }

        seen.add(normalized);
    });

    return true;
}


// ========================================
// Generate quiz
// ========================================

async function generateQuiz({
    content,
    difficulty = "medium"
}) {

    if (!content || !content.trim()) {
        throw new Error(
            "Content is required for quiz generation"
        );
    }

    const modelPool = MODELS.quiz;

    const prompt = `
You are StudentAI's quiz generator.

Generate exactly 10 multiple-choice questions
from the supplied study material.

Difficulty: ${difficulty}

Rules:

1. Exactly 10 questions.
2. Exactly 4 options per question.
3. Exactly one correct answer.
4. "answer" must exactly match one option.
5. Every question needs an explanation.
6. Use only the supplied study material.
7. Do not invent unsupported facts.
8. Do not repeat questions.
9. Return ONLY valid JSON.
10. No Markdown.
11. No code fences.

Required format:

{
  "questions": [
    {
      "question": "Question text",
      "options": [
        "Option A",
        "Option B",
        "Option C",
        "Option D"
      ],
      "answer": "Option A",
      "explanation": "Explanation"
    }
  ]
}

STUDY MATERIAL:

${content}
`;

    const errors = [];

    for (const provider of PROVIDERS) {

        const models =
            modelPool[provider] || [];

        if (!models.length) {
            continue;
        }

        console.log(
            `\n📝 Quiz provider: ${provider}`
        );

        for (const model of models) {

            console.log(
                `   🤖 Trying quiz model: ${model}`
            );

            try {

                const text = await callProvider({
                    provider,
                    model,
                    prompt,
                    maxTokens: 5000
                });

                const quiz =
                    extractJSON(text);

                validateQuiz(quiz);

                console.log(
                    `   ✅ Valid quiz: ${provider} → ${model}`
                );

                return {
                    success: true,
                    provider,
                    model,
                    quiz
                };

            } catch (error) {

                console.log(
                    `   ❌ Quiz model failed: ${provider} → ${model}`
                );

                console.log(
                    `      ${error.message}`
                );

                errors.push({
                    provider,
                    model,
                    error: error.message
                });
            }
        }
    }

    const error = new Error(
        "All quiz models failed validation"
    );

    error.details = errors;

    throw error;
}


module.exports = {
    generateQuiz,
    extractJSON,
    validateQuiz
};