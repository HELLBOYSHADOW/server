// ai/router.js

const MODELS = require("./models");
const { callProvider } = require("./providers");

const PROVIDERS = [
    "gemini",
    "groq",
    "llm7",
    "nvidia",
    "openrouter"
];


// ========================================
// Determine whether we should continue
// fallback after an error
// ========================================

function shouldFallback(error) {

    const message =
        String(error?.message || "").toLowerCase();

    // Continue to another model/provider.
    return true;
}


// ========================================
// Main AI Router
// ========================================

async function askAI({
    task = "text",
    prompt,
    maxTokens = 2000,
    onlyProvider = null
}) {

    if (!prompt) {
        throw new Error("Prompt is required");
    }


    // ========================================
    // Validate requested provider
    // ========================================

    if (
        onlyProvider &&
        !PROVIDERS.includes(onlyProvider)
    ) {
        throw new Error(
            `Unknown provider: ${onlyProvider}`
        );
    }


    // ========================================
    // Get models for requested task
    // ========================================

    const modelPool = MODELS[task];

    if (!modelPool) {
        throw new Error(
            `Unknown AI task: ${task}`
        );
    }


    const errors = [];


    // ========================================
    // Provider fallback
    // ========================================

    for (const provider of PROVIDERS) {

        // If a specific provider was requested,
        // skip every other provider.
        if (
            onlyProvider &&
            provider !== onlyProvider
        ) {
            continue;
        }


        const models =
            modelPool[provider] || [];


        if (!models.length) {
            continue;
        }


        console.log(
            `\n🔌 Provider: ${provider}`
        );


        // ========================================
        // Model fallback inside provider
        // ========================================

        for (const model of models) {

            console.log(
                `   🤖 Trying: ${model}`
            );


            try {

                const result =
                    await callProvider({
                        provider,
                        model,
                        prompt,
                        maxTokens
                    });


                console.log(
                    `   ✅ Success: ${provider} → ${model}`
                );


                return {
                    success: true,
                    provider,
                    model,
                    text: result
                };


            } catch (error) {

                console.log(
                    `   ❌ Failed: ${provider} → ${model}`
                );

                console.log(
                    `      ${error.message}`
                );


                errors.push({
                    provider,
                    model,
                    error: error.message
                });


                // Try the next model.
                if (!shouldFallback(error)) {
                    break;
                }
            }
        }
    }


    // ========================================
    // Everything failed
    // ========================================

    const error = new Error(
        onlyProvider
            ? `All ${onlyProvider} models failed`
            : "All AI providers and models failed"
    );


    error.details = errors;


    throw error;
}


// ========================================
// Exports
// ========================================

module.exports = {
    askAI
};