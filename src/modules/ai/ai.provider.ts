import { AI_TOOL_DEFINITIONS } from "@/modules/ai/ai.tools";

export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

export type ProviderInputItem = Record<string, unknown>;

export type ProviderOutputItem = Record<string, unknown> & {
  type?: string;
  name?: string;
  arguments?: string;
  call_id?: string;
  content?: Array<{ type?: string; text?: string }>;
};

export type ProviderUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

export type ProviderTurn = {
  output: ProviderOutputItem[];
  outputText: string;
  metadata?: {
    model: string;
    latencyMs: number;
    usage?: ProviderUsage;
  };
};

export interface AiProvider {
  respond(input: {
    instructions: string;
    items: ProviderInputItem[];
  }): Promise<ProviderTurn>;
}

type ResponsesApiPayload = {
  model?: string;
  output?: ProviderOutputItem[];
  output_text?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  };
  error?: { code?: string | number; message?: string; type?: string };
};

export type AiProviderErrorCode =
  | "AUTHENTICATION"
  | "INSUFFICIENT_CREDITS"
  | "MODEL_UNAVAILABLE"
  | "RATE_LIMIT"
  | "TIMEOUT"
  | "INVALID_REQUEST"
  | "UPSTREAM_FAILURE"
  | "INVALID_RESPONSE";

export class AiProviderError extends Error {
  constructor(
    public readonly code: AiProviderErrorCode,
    public readonly status?: number,
    public readonly providerCode?: string,
  ) {
    super(`AI_PROVIDER_${code}`);
    this.name = "AiProviderError";
  }
}

function textFromOutput(output: ProviderOutputItem[]): string {
  return output
    .filter((item) => item.type === "message")
    .flatMap((item) => item.content ?? [])
    .filter((part) => part.type === "output_text" && typeof part.text === "string")
    .map((part) => part.text!.trim())
    .filter(Boolean)
    .join("\n\n");
}

function normalizedError(
  status: number,
  providerError?: ResponsesApiPayload["error"],
): AiProviderError {
  const providerCode = providerError?.code === undefined
    ? providerError?.type
    : String(providerError.code);
  const message = `${providerCode ?? ""} ${providerError?.message ?? ""}`.toLowerCase();
  if (status === 401 || status === 403) {
    return new AiProviderError("AUTHENTICATION", status, providerCode);
  }
  if (status === 402 || message.includes("credit")) {
    return new AiProviderError("INSUFFICIENT_CREDITS", status, providerCode);
  }
  if (status === 429) {
    return new AiProviderError("RATE_LIMIT", status, providerCode);
  }
  if (status === 404 || message.includes("model") || message.includes("provider")) {
    return new AiProviderError("MODEL_UNAVAILABLE", status, providerCode);
  }
  if (status >= 400 && status < 500) {
    return new AiProviderError("INVALID_REQUEST", status, providerCode);
  }
  return new AiProviderError("UPSTREAM_FAILURE", status, providerCode);
}

function configuredTimeoutMs(): number {
  const configured = Number(process.env.AI_PROVIDER_TIMEOUT_MS ?? 45_000);
  return Number.isFinite(configured)
    ? Math.min(120_000, Math.max(5_000, configured))
    : 45_000;
}

export function getOpenRouterConfig() {
  // Legacy names are read-only compatibility for deployments upgraded in place.
  // OPENROUTER_* are canonical and documented; no secret is ever logged here.
  const apiKey = process.env.OPENROUTER_API_KEY ?? process.env.OPENAI_API_KEY;
  const model = process.env.OPENROUTER_MODEL ?? process.env.OPENAI_MODEL;
  if (!apiKey || !model) throw new Error("AI_PROVIDER_NOT_CONFIGURED");
  return { apiKey, model, timeoutMs: configuredTimeoutMs() };
}

export function createOpenRouterProvider(): AiProvider {
  const config = getOpenRouterConfig();

  return {
    async respond({ instructions, items }) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), config.timeoutMs);
      const startedAt = performance.now();
      try {
        const response = await fetch(`${OPENROUTER_BASE_URL}/responses`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: config.model,
            instructions,
            input: items,
            tools: AI_TOOL_DEFINITIONS,
            tool_choice: "auto",
            parallel_tool_calls: false,
            store: false,
            max_output_tokens: 2_500,
          }),
          signal: controller.signal,
        });

        let payload: ResponsesApiPayload;
        try {
          payload = await response.json() as ResponsesApiPayload;
        } catch {
          throw new AiProviderError("INVALID_RESPONSE", response.status);
        }
        if (!response.ok) throw normalizedError(response.status, payload.error);
        if (!Array.isArray(payload.output)) {
          throw new AiProviderError("INVALID_RESPONSE", response.status);
        }

        const usage = payload.usage
          ? {
              inputTokens: payload.usage.input_tokens,
              outputTokens: payload.usage.output_tokens,
              totalTokens: payload.usage.total_tokens,
            }
          : undefined;
        return {
          output: payload.output,
          outputText: payload.output_text?.trim() || textFromOutput(payload.output),
          metadata: {
            model: payload.model ?? config.model,
            latencyMs: Math.round(performance.now() - startedAt),
            usage,
          },
        };
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          throw new AiProviderError("TIMEOUT");
        }
        if (error instanceof AiProviderError) throw error;
        throw new AiProviderError("UPSTREAM_FAILURE");
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
