# Supported Providers, Environment Variables & Controls

Credentials and runtime preferences for OpenWiki are stored in `~/.openwiki/.env`.

---

## 1. Supported Providers & Environment Variables

| Provider | Primary Env Variable | Base URL / Notes |
| :--- | :--- | :--- |
| `openai` (Default) | `OPENAI_API_KEY` | Default model: `gpt-5.6-terra`, OAuth via ChatGPT |
| `gemini` | `GEMINI_API_KEY` | Google AI Studio (`gemini-2.5-pro`, `gemini-3.6-flash`) |
| `gemini-enterprise` | Google ADC (`GOOGLE_CLOUD_PROJECT`) | Keyless Vertex AI via Google ADC |
| `anthropic` | `ANTHROPIC_API_KEY` | Claude models (Sonnet, Opus, Haiku) |
| `copilot` | GitHub CLI (`gh auth login`) | Uses GitHub Copilot backend; streaming forced for non-GPT-5 models |
| `openrouter` | `OPENROUTER_API_KEY` | Multi-model gateway (`OPENWIKI_OPENROUTER_MAX_TOKENS`), concurrency-safe debug fetch |
| `bedrock` | `BEDROCK_AWS_ACCESS_KEY_ID`, `BEDROCK_AWS_SECRET_ACCESS_KEY`, `BEDROCK_AWS_REGION` | AWS Bedrock models; explicit `maxTokens` configured to bypass Converse API 4096 cap |
| `openai-compatible` | `OPENAI_COMPATIBLE_API_KEY`, `OPENAI_COMPATIBLE_BASE_URL` | Local/custom gateway (Ollama, LiteLLM, vLLM) |
| `baseten` | `BASETEN_API_KEY` | GLM 5.2, Kimi K2.7 Code |
| `fireworks` | `FIREWORKS_API_KEY` | GLM 5.2, Kimi K2.7 Code |
| `nebius` | `NEBIUS_API_KEY` | Kimi K2.6 |
| `nvidia` | `NVIDIA_API_KEY` | Nemotron 3 Super, DeepSeek, GPT-OSS 120B |

---

## 2. Performance & Reasoning Controls

- **Reasoning Effort**: `OPENWIKI_REASONING_EFFORT=none|low|medium|high|xhigh|max` (or `/effort` command in interactive chat) for OpenAI GPT-5.6 and NVIDIA NIM models.
- **Max Output Tokens**: `OPENWIKI_MAX_OUTPUT_TOKENS=8192` overrides per-request output token limit across all providers.
- **Responses API Opt-in**: `OPENWIKI_OPENAI_COMPATIBLE_USE_RESPONSES_API=true` enables OpenAI Responses API for compatible gateways.
- **Stream Idle Timeout**: `OPENWIKI_STREAM_IDLE_TIMEOUT=300000` (ms) for AWS Bedrock watchdog.
