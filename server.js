require("dotenv").config();
const { generateQuiz } = require("./ai/quiz");
const { PDFParse } = require("pdf-parse");
const { CanvasFactory } = require("pdf-parse/worker");
const { createWorker } = require("tesseract.js");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);
const PDFTOPPM_PATH =
    process.env.PDFTOPPM_PATH || "pdftoppm";

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


// ========================================
// PDF TEXT EXTRACTION + OCR
// ========================================

app.post("/extract-pdf", async (req, res) => {
    let parser = null;
    let worker = null;
    let tempDir = null;

    try {
        const { data } = req.body || {};

        if (!data || typeof data !== "string") {
            return res.status(400).json({
                success: false,
                error: "PDF Base64 data is required."
            });
        }

        // Support raw Base64 or a PDF data URL.
        const base64 = data
            .replace(/^data:application\/pdf;base64,/i, "")
            .replace(/\s/g, "");

        if (
            !base64 ||
            base64.length % 4 === 1 ||
            !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)
        ) {
            return res.status(400).json({
                success: false,
                error: "Invalid Base64 PDF data."
            });
        }

        const buffer = Buffer.from(base64, "base64");

        if (
            buffer.length < 5 ||
            buffer.subarray(0, 5).toString() !== "%PDF-"
        ) {
            return res.status(400).json({
                success: false,
                error: "Invalid PDF file."
            });
        }

        const MAX_PDF_BYTES = 25 * 1024 * 1024;

        if (buffer.length > MAX_PDF_BYTES) {
            return res.status(413).json({
                success: false,
                error: "PDF exceeds the 25 MB limit."
            });
        }

        console.log("\n📄 Starting PDF extraction");
        console.log("📦 PDF size:", buffer.length, "bytes");

        // STEP 1: Try normal embedded-text extraction.
        let text = "";

        try {
            parser = new PDFParse({
                data: buffer,
                CanvasFactory
            });

            const result = await parser.getText();
            text = (result.text || "").trim();

        } catch (error) {
            console.warn(
                "⚠️ Embedded-text extraction failed:",
                error.message
            );

        } finally {
            if (parser) {
                try {
                    await parser.destroy();
                } catch { }

                parser = null;
            }
        }

        console.log(
            "📝 Embedded text characters:",
            text.length
        );

        // STEP 2: Return embedded text if sufficient.
        if (text.replace(/\s/g, "").length >= 30) {
            console.log("✅ Using embedded PDF text");

            return res.json({
                success: true,
                text,
                method: "pdf-text",
                characters: text.length
            });
        }

        // STEP 3: Render the PDF into page images.
        console.log("🚀 OCR PIPELINE STARTED");
        console.log("🖼️ Rendering PDF pages with Poppler...");

        tempDir = await fs.mkdtemp(
            path.join(os.tmpdir(), "studentai-pdf-")
        );

        const pdfPath = path.join(tempDir, "input.pdf");
        const imagePrefix = path.join(tempDir, "page");

        await fs.writeFile(pdfPath, buffer);

        try {
            await execFileAsync(
                PDFTOPPM_PATH,
                [
                    "-f", "1",
                    "-l", "30",
                    "-r", "250",
                    "-png",
                    pdfPath,
                    imagePrefix
                ],
                {
                    timeout: 120000,
                    maxBuffer: 5 * 1024 * 1024
                }
            );

        } catch (error) {
            if (error.code === "ENOENT") {
                throw new Error(
                    `Poppler executable was not found: ${PDFTOPPM_PATH}. ` +
                    "Ensure Poppler is installed and PDFTOPPM_PATH is configured correctly."
                );
            }

            throw new Error(
                `PDF rendering failed: ${error.message}`
            );
        }

        const files = await fs.readdir(tempDir);

        const imageFiles = files
            .filter(name => /^page-\d+\.png$/i.test(name))
            .sort((a, b) => {
                const pageA = Number(
                    a.match(/-(\d+)\.png$/i)[1]
                );

                const pageB = Number(
                    b.match(/-(\d+)\.png$/i)[1]
                );

                return pageA - pageB;
            });

        if (imageFiles.length === 0) {
            throw new Error(
                "Poppler did not generate any page images."
            );
        }

        console.log(
            `🖼️ Rendered ${imageFiles.length} page(s).`
        );

        // STEP 4: Recognize text from the rendered images.
        console.log("🔤 Initializing Tesseract OCR...");

        worker = await createWorker("eng");

        const pageTexts = [];

        for (let i = 0; i < imageFiles.length; i++) {
            const imagePath = path.join(
                tempDir,
                imageFiles[i]
            );

            console.log(
                `🔎 OCR processing page ${i + 1}/${imageFiles.length}`
            );

            const { data: ocrResult } =
                await worker.recognize(imagePath);

            const pageText = (ocrResult.text || "").trim();

            pageTexts.push(
                `--- Page ${i + 1} ---\n${pageText}`
            );

            console.log(
                `📝 Page ${i + 1}: ${pageText.length} characters`
            );
        }

        // STEP 5: Return the recognized text.
        text = pageTexts.join("\n\n").trim();

        const recognizedText = text
            .replace(/--- Page \d+ ---/g, "")
            .trim();

        if (recognizedText.length < 10) {
            return res.status(422).json({
                success: false,
                error:
                    "OCR could not recognize readable text. " +
                    "Try a clearer or higher-resolution PDF.",
                method: "ocr",
                characters: recognizedText.length
            });
        }

        console.log(
            `✅ OCR completed: ${recognizedText.length} characters`
        );

        return res.json({
            success: true,
            text,
            method: "ocr",
            characters: recognizedText.length,
            pagesProcessed: imageFiles.length
        });

    } catch (error) {
        console.error("❌ PDF extraction error:", error);

        return res.status(500).json({
            success: false,
            error: error.message || "PDF extraction failed."
        });

    } finally {
        if (parser) {
            try {
                await parser.destroy();
            } catch { }
        }

        if (worker) {
            try {
                await worker.terminate();
            } catch (error) {
                console.warn(
                    "OCR worker cleanup warning:",
                    error.message
                );
            }
        }

        if (tempDir) {
            try {
                await fs.rm(tempDir, {
                    recursive: true,
                    force: true
                });
            } catch (error) {
                console.warn(
                    "Temporary-file cleanup warning:",
                    error.message
                );
            }
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