// ai/providers.js

async function requestOpenAICompatible({
    name,
    apiKey,
    endpoint,
    model,
    prompt,
    maxTokens = 2000
}) {
    if (!apiKey) {
        throw new Error(`${name} API key is not configured`);
    }

    const timeoutMs = Number(
        process.env.AI_TIMEOUT_MS || 60000
    );

    const controller = new AbortController();

    const timeout = setTimeout(() => {
        controller.abort();
    }, timeoutMs);

    try {
        const response = await fetch(endpoint, {
            method: "POST",

            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json"
            },

            body: JSON.stringify({
                model,

                messages: [
                    {
                        role: "user",
                        content: prompt
                    }
                ],

                max_tokens: maxTokens
            }),

            signal: controller.signal
        });

        let data;

        try {
            data = await response.json();
        } catch {
            throw new Error(
                `Invalid JSON response from ${name}`
            );
        }

        if (!response.ok) {
            const error = new Error(
                data?.error?.message ||
                data?.message ||
                `HTTP ${response.status}`
            );

            error.status = response.status;

            throw error;
        }

        const content =
            data?.choices?.[0]?.message?.content;

        if (!content) {
            throw new Error(
                `${name} returned an empty response`
            );
        }

        return content;

    } catch (error) {

        if (error?.name === "AbortError") {
            throw new Error(
                `${name} timeout after ${timeoutMs}ms`
            );
        }

        throw error;

    } finally {
        clearTimeout(timeout);
    }
}


async function requestGemini({
    apiKey,
    model,
    prompt,
    maxTokens = 2000
}) {
    if (!apiKey) {
        throw new Error(
            "Gemini API key is not configured"
        );
    }

    const timeoutMs = Number(
        process.env.AI_TIMEOUT_MS || 60000
    );

    const controller = new AbortController();

    const timeout = setTimeout(() => {
        controller.abort();
    }, timeoutMs);

    try {
        const url =
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

        const response = await fetch(url, {
            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify({
                contents: [
                    {
                        role: "user",
                        parts: [
                            {
                                text: prompt
                            }
                        ]
                    }
                ],

                generationConfig: {
                    maxOutputTokens: maxTokens
                }
            }),

            signal: controller.signal
        });

        let data;

        try {
            data = await response.json();
        } catch {
            throw new Error(
                "Invalid JSON response from Gemini"
            );
        }

        if (!response.ok) {
            const error = new Error(
                data?.error?.message ||
                `HTTP ${response.status}`
            );

            error.status = response.status;

            throw error;
        }

        const content =
            data?.candidates?.[0]?.content?.parts
                ?.map(part => part.text || "")
                .join("")
                .trim();

        if (!content) {
            throw new Error(
                "Gemini returned an empty response"
            );
        }

        return content;

    } catch (error) {

        if (error?.name === "AbortError") {
            throw new Error(
                `Gemini timeout after ${timeoutMs}ms`
            );
        }

        throw error;

    } finally {
        clearTimeout(timeout);
    }
}


async function callProvider({
    provider,
    model,
    prompt,
    maxTokens
}) {

    switch (provider) {

        case "gemini":
            return requestGemini({
                apiKey: process.env.GEMINI_API_KEY,
                model,
                prompt,
                maxTokens
            });


        case "groq":
            return requestOpenAICompatible({
                name: "Groq",
                apiKey: process.env.GROQ_API_KEY,
                endpoint:
                    "https://api.groq.com/openai/v1/chat/completions",
                model,
                prompt,
                maxTokens
            });


        case "llm7":
            return requestOpenAICompatible({
                name: "LLM7",
                apiKey: process.env.LLM7_API_KEY,
                endpoint:
                    "https://api.llm7.io/v1/chat/completions",
                model,
                prompt,
                maxTokens
            });


        case "nvidia":
            return requestOpenAICompatible({
                name: "NVIDIA",
                apiKey: process.env.NVIDIA_API_KEY,
                endpoint:
                    "https://integrate.api.nvidia.com/v1/chat/completions",
                model,
                prompt,
                maxTokens
            });


        case "openrouter":
            return requestOpenAICompatible({
                name: "OpenRouter",
                apiKey: process.env.OPENROUTER_API_KEY,
                endpoint:
                    "https://openrouter.ai/api/v1/chat/completions",
                model,
                prompt,
                maxTokens
            });


        default:
            throw new Error(
                `Unknown provider: ${provider}`
            );
    }
}


module.exports = {
    callProvider
};