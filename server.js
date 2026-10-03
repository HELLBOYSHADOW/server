require("dotenv").config();
const { generateQuiz } = require("./ai/quiz");
const { PDFParse } = require("pdf-parse");
const { CanvasFactory } = require("pdf-parse/worker");

const { askAI } = require("./ai/router");

const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());

app.use(express.json({
    limit: "25mb"
}));


// ===============================
// AI
// ===============================

app.post("/ai", async (req, res) => {
    try {
        const {
            prompt,
            task = "text",
            maxTokens = 2000,
            provider = null
        } = req.body;

        if (!prompt) {
            return res.status(400).json({
                success: false,
                error: "Prompt is required"
            });
        }

        const result = await askAI({
            task,
            prompt,
            maxTokens,
            onlyProvider: provider
        });

        res.json(result);

    } catch (error) {
        console.error("AI ERROR:", error);

        res.status(503).json({
            success: false,
            error: error.message,
            details: error.details || []
        });
    }
});


// ===============================
// ROOT
// ===============================

app.get("/", (req, res) => {
    res.json({
        success: true,
        name: "StudentAI Backend",
        status: "online"
    });
});


// ===============================
// HEALTH
// ===============================

app.get("/health", (req, res) => {
    res.json({
        success: true,
        status: "healthy",
        timestamp: new Date().toISOString()
    });
});


// ===============================
// SERVER
// ===============================

const PORT = process.env.PORT || 3000;
// ========================================
// QUIZ GENERATION
// ========================================

app.post("/generate-quiz", async (req, res) => {

    try {

        const {
            content,
            difficulty = "medium"
        } = req.body;

        if (!content) {
            return res.status(400).json({
                success: false,
                error: "Content is required"
            });
        }

        const result = await generateQuiz({
            content,
            difficulty
        });

        res.json({
            success: true,
            provider: result.provider,
            model: result.model,
            questions: result.quiz.questions
        });

    } catch (error) {

        console.error(
            "❌ Quiz generation error:",
            error
        );

        res.status(503).json({
            success: false,
            error: error.message
        });
    }
});

// ========================================
// FLASHCARD GENERATION
// ========================================

app.post("/generate-flashcards", async (req, res) => {
    try {
        const {
            material
        } = req.body;

        if (!material || !material.trim()) {
            return res.status(400).json({
                success: false,
                error: "Material is required"
            });
        }

        console.log(
            `🃏 Generating flashcards from ${material.length} characters`
        );

        const prompt = `
You are an expert educational flashcard generator.

Create exactly 10 flashcards from the supplied study material.

RULES:
1. Use ONLY the supplied material.
2. Do not use outside knowledge.
3. Create exactly 10 flashcards.
4. Each flashcard must contain:
   - question
   - answer
   - category
5. Questions should test important concepts.
6. Answers should be concise but useful for studying.
7. Do not create duplicate questions.
8. Return ONLY valid JSON.
9. Do not use Markdown.
10. Do not add any text outside the JSON.

Return exactly this structure:

{
  "flashcards": [
    {
      "question": "Question",
      "answer": "Answer",
      "category": "Topic"
    }
  ]
}

STUDY MATERIAL:

${material.slice(0, 50000)}
`;

        const result = await askAI({
            task: "text",
            prompt,
            maxTokens: 5000
        });

        console.log(
            "🤖 Flashcard provider:",
            result.provider
        );

        let raw = result.answer || result.text || result.content;

        if (!raw) {
            throw new Error(
                "AI returned an empty response"
            );
        }

        // Remove Markdown code fences if the model adds them
        raw = String(raw)
            .replace(/```json/gi, "")
            .replace(/```/g, "")
            .trim();

        // Extract JSON object
        const firstBrace = raw.indexOf("{");
        const lastBrace = raw.lastIndexOf("}");

        if (
            firstBrace === -1 ||
            lastBrace === -1
        ) {
            throw new Error(
                "AI did not return valid flashcard JSON"
            );
        }

        raw = raw.substring(
            firstBrace,
            lastBrace + 1
        );

        const parsed = JSON.parse(raw);

        if (
            !parsed.flashcards ||
            !Array.isArray(parsed.flashcards)
        ) {
            throw new Error(
                "AI response does not contain a flashcards array"
            );
        }

        const flashcards = parsed.flashcards
            .filter(
                (card) =>
                    card &&
                    typeof card.question === "string" &&
                    card.question.trim() &&
                    typeof card.answer === "string" &&
                    card.answer.trim()
            )
            .slice(0, 10)
            .map((card, index) => ({
                id: String(index + 1),
                question: card.question.trim(),
                answer: card.answer.trim(),
                category:
                    typeof card.category === "string" &&
                        card.category.trim()
                        ? card.category.trim()
                        : "General"
            }));

        if (flashcards.length === 0) {
            throw new Error(
                "No valid flashcards were generated"
            );
        }

        console.log(
            `✅ Generated ${flashcards.length} flashcards`
        );

        res.json({
            success: true,
            provider: result.provider,
            model: result.model,
            flashcards
        });

    } catch (error) {

        console.error(
            "❌ Flashcard generation error:",
            error
        );

        res.status(503).json({
            success: false,
            error:
                error.message ||
                "Failed to generate flashcards",
            details: error.details || []
        });
    }
});

// ========================================
// PDF TEXT EXTRACTION
// ========================================


app.post("/extract-pdf", async (req, res) => {
    let parser = null;

    try {
        const { data } = req.body;

        if (!data) {
            return res.status(400).json({
                success: false,
                error: "PDF data is required"
            });
        }

        console.log("📄 Extracting text from PDF...");
        console.log(`📦 Base64 length: ${data.length}`);

        const buffer = Buffer.from(data, "base64");

        console.log(`📦 PDF size: ${buffer.length} bytes`);

        if (!buffer.length) {
            return res.status(400).json({
                success: false,
                error: "Empty PDF data"
            });
        }

        parser = new PDFParse({
            data: buffer,
            CanvasFactory
        });

        const result = await parser.getText();

        const text = (result.text || "").trim();

        console.log(`✅ Extracted ${text.length} characters`);

        res.json({
            success: true,
            text
        });

    } catch (error) {
        console.error("❌ PDF extraction error:", error);

        res.status(500).json({
            success: false,
            error: error.message || "Failed to extract PDF"
        });

    } finally {
        if (parser) {
            try {
                await parser.destroy();
            } catch { }
        }
    }
});

// ========================================
// PDF → QUIZ
// ========================================

app.post("/pdf/quiz", async (req, res) => {
    let parser = null;

    try {
        const {
            data,
            difficulty = "medium"
        } = req.body;

        if (!data) {
            return res.status(400).json({
                success: false,
                error: "PDF data is required"
            });
        }

        // Base64 → PDF buffer
        const buffer = Buffer.from(data, "base64");

        // Extract PDF text
        parser = new PDFParse({
            data: buffer,
            CanvasFactory
        });
        const pdfResult = await parser.getText();
        const text = (pdfResult.text || "").trim();

        if (!text) {
            return res.status(422).json({
                success: false,
                error: "No text could be extracted from this PDF"
            });
        }

        // Generate quiz from extracted text
        const quizResult = await generateQuiz({
            content: text,
            difficulty
        });

        res.json({
            success: true,
            source: {
                type: "pdf",
                extractedCharacters: text.length
            },
            provider: quizResult.provider,
            model: quizResult.model,
            questions: quizResult.quiz.questions
        });

    } catch (error) {
        console.error("❌ PDF quiz error:", error);
        res.status(503).json({
            success: false,
            error: error.message,
            details: error.details || []
        });
    } finally {
        if (parser) {
            try { await parser.destroy(); } catch { }
        }
    }
});

// ========================================
// PYQ ANALYSIS
// ========================================

app.post("/pyq", async (req, res) => {
    try {
        const { prompt } = req.body;

        if (!prompt || !prompt.trim()) {
            return res.status(400).json({
                success: false,
                error: "PYQ prompt is required"
            });
        }

        console.log(
            `📊 Analyzing PYQ (${prompt.length} characters)`
        );

        const result = await askAI({
            task: "text",
            prompt,
            maxTokens: 8000
        });

        console.log(
            "🤖 PYQ provider:",
            result.provider
        );

        const answer =
            result.answer ||
            result.text ||
            result.content ||
            result.result;

        if (!answer) {
            throw new Error(
                "AI returned an empty PYQ analysis"
            );
        }

        console.log(
            `✅ PYQ analysis generated (${String(answer).length} characters)`
        );

        res.json({
            success: true,
            provider: result.provider,
            model: result.model,
            answer
        });

    } catch (error) {

        console.error(
            "❌ PYQ analysis error:",
            error
        );

        res.status(503).json({
            success: false,
            error:
                error.message ||
                "Failed to analyze PYQ",
            details: error.details || []
        });
    }
});

// ========================================
// RESUME ANALYSIS
// ========================================

app.post("/resume", async (req, res) => {
    try {
        const { text } = req.body;
        if (!text || !text.trim()) {
            return res.status(400).json({ success: false, error: "Resume text is required" });
        }

        const prompt = `
You are an expert tech recruiter and resume analyzer.
Analyze the following resume and provide feedback in JSON format.
Include an overall score out of 100, strengths, weaknesses, and missing keywords.
JSON Format:
{
  "score": 0,
  "strengths": ["string"],
  "weaknesses": ["string"],
  "missingKeywords": ["string"],
  "feedback": "string"
}

Resume Text:
${text.slice(0, 10000)}
        `;
        const result = await askAI({ task: "text", prompt, maxTokens: 2000 });
        let answer = result.answer || result.text || result.content || result.result;
        answer = String(answer).replace(/```json/gi, "").replace(/```/g, "").trim();
        const firstBrace = answer.indexOf("{");
        const lastBrace = answer.lastIndexOf("}");
        if (firstBrace !== -1 && lastBrace !== -1) {
            answer = answer.substring(firstBrace, lastBrace + 1);
        }
        res.json({ success: true, provider: result.provider, model: result.model, analysis: JSON.parse(answer) });
    } catch (error) {
        res.status(503).json({ success: false, error: "Failed to analyze resume", details: error.message });
    }
});

// ========================================
// INTERVIEW COACH
// ========================================

app.post("/interview", async (req, res) => {
    try {
        const { role } = req.body;
        if (!role || !role.trim()) {
            return res.status(400).json({ success: false, error: "Role is required" });
        }

        const prompt = `
You are an expert technical interviewer.
Generate 5 common interview questions for a ${role} position.
For each question, provide an ideal brief answer and a tip on what the interviewer is looking for.
JSON Format:
{
  "questions": [
    {
      "question": "string",
      "idealAnswer": "string",
      "tip": "string"
    }
  ]
}
        `;
        const result = await askAI({ task: "text", prompt, maxTokens: 2000 });
        let answer = result.answer || result.text || result.content || result.result;
        answer = String(answer).replace(/```json/gi, "").replace(/```/g, "").trim();
        const firstBrace = answer.indexOf("{");
        const lastBrace = answer.lastIndexOf("}");
        if (firstBrace !== -1 && lastBrace !== -1) {
            answer = answer.substring(firstBrace, lastBrace + 1);
        }
        res.json({ success: true, provider: result.provider, model: result.model, data: JSON.parse(answer) });
    } catch (error) {
        res.status(503).json({ success: false, error: "Failed to generate interview", details: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════╗
║        StudentAI Backend           ║
╠════════════════════════════════════╣
║ Status : ONLINE                    ║
║ Port   : ${PORT}                   ║
╚════════════════════════════════════╝
`);
});