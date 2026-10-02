// ai/models.js

const MODELS = {

    text: {
        gemini: [
            "gemini-flash-latest"
        ],

        groq: [
            "openai/gpt-oss-120b",
            "openai/gpt-oss-20b",
            "qwen/qwen3.8-27b"
        ],

        llm7: [
            "DeepSeek-V4-Flash-0731",
            "GLM-5.3-Flash",
            "gemini-3.1-flash-lite",
            "gemini-3-flash"
        ],

        nvidia: [
            "deepseek-ai/deepseek-v4.1-flash",
            "z-ai/glm-5.3",
            "z-ai/glm-5.3-flash",
            "openai/gpt-oss-20b"
        ],

        openrouter: [
            "openrouter/free"
        ]
    },

    coding: {
        gemini: [
            "gemini-flash-latest"
        ],

        groq: [
            "qwen/qwen3.8-27b",
            "openai/gpt-oss-120b"
        ],

        llm7: [
            "DeepSeek-V4-Flash-0731",
            "GLM-5.3-Flash"
        ],

        nvidia: [
            "mistralai/codestral-22b-instruct-v0.1",
            "deepseek-ai/deepseek-coder-6.7b-instruct",
            "ibm/granite-34b-code-instruct",
            "meta/codellama-70b"
        ],

        openrouter: [
            "qwen/qwen3-coder-next"
        ]
    },

    quiz: {
        gemini: [
            "gemini-flash-latest"
        ],

        groq: [
            "openai/gpt-oss-120b",
            "qwen/qwen3.8-27b",
            "openai/gpt-oss-20b"
        ],

        llm7: [
            "DeepSeek-V4-Flash-0731",
            "gemini-3.1-flash-lite",
            "Mistral-Nemo-Instruct-2407"
        ],

        nvidia: [
            "z-ai/glm-5.3",
            "google/gemma-4-31b-it",
            "openai/gpt-oss-20b"
        ],

        openrouter: [
            "openrouter/free"
        ]
    },

    summary: {
        gemini: [
            "gemini-flash-latest"
        ],

        groq: [
            "openai/gpt-oss-120b",
            "qwen/qwen3.8-27b"
        ],

        llm7: [
            "DeepSeek-V4-Flash-0731",
            "GLM-5.3-Flash",
            "gemini-3.1-flash-lite",
            "gemini-3-flash"
        ],

        nvidia: [
            "deepseek-ai/deepseek-v4.1-flash",
            "z-ai/glm-5.3"
        ],

        openrouter: [
            "openrouter/free"
        ]
    }
};

module.exports = MODELS;