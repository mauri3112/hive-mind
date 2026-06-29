import OpenAI from "openai";
import {
  AnalyzeResponseSchema,
  DiagramModelOutputSchema,
  type AnalyzeRequest,
  type AnalyzeResponse,
  type DiagramModelOutput,
  type ProposeRequest
} from "../shared/hiveSchemas";
import { parseJsonObject } from "./json";
import type { HiveModelClient } from "./hiveModel";
import { logHive, previewText } from "./logger";
import {
  createIntentUserPrompt,
  createProposalUserPrompt,
  DIAGRAM_PROPOSER_SYSTEM_PROMPT,
  INTENT_DETECTOR_SYSTEM_PROMPT
} from "./prompts";
import type { HiveSession } from "./sessionStore";

export interface CerebrasConfig {
  apiKey?: string;
  baseUrl: string;
  model: string;
  promptCacheKeyEnabled: boolean;
}

export function getCerebrasConfig(): CerebrasConfig {
  return {
    apiKey: process.env.CEREBRAS_API_KEY,
    baseUrl: process.env.CEREBRAS_BASE_URL ?? "https://api.cerebras.ai/v1",
    model: process.env.CEREBRAS_MODEL ?? "gemma-4-31b",
    promptCacheKeyEnabled: process.env.CEREBRAS_PROMPT_CACHE_KEY_ENABLED === "true"
  };
}

export class CerebrasHiveModelClient implements HiveModelClient {
  private readonly client: OpenAI;

  constructor(private readonly config = getCerebrasConfig()) {
    if (!config.apiKey) {
      throw new Error("CEREBRAS_API_KEY is required for CerebrasHiveModelClient");
    }

    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl
    });
  }

  async analyze(request: AnalyzeRequest, session: HiveSession): Promise<AnalyzeResponse> {
    const startedAt = Date.now();
    const parsed = await this.chatJson(
      "intent-detector",
      INTENT_DETECTOR_SYSTEM_PROMPT,
      createIntentUserPrompt(request, session)
    );

    const parsedObject = ensureObject(parsed);

    const result = AnalyzeResponseSchema.parse({
      seq: request.seq,
      ...parsedObject
    });

    logHive("model.analyze.parsed", {
      seq: request.seq,
      latencyMs: Date.now() - startedAt,
      status: result.status,
      intentId: result.intent?.id,
      confidence: result.intent?.confidence,
      commitMode: result.intent?.commitMode,
      canonicalText: result.intent ? previewText(result.intent.canonicalText, 180) : undefined,
      deferReason: result.deferReason ? previewText(result.deferReason, 180) : undefined
    });

    return result;
  }

  async propose(request: ProposeRequest, session: HiveSession): Promise<DiagramModelOutput> {
    const startedAt = Date.now();
    const parsed = await this.chatJson(
      "diagram-proposer",
      DIAGRAM_PROPOSER_SYSTEM_PROMPT,
      createProposalUserPrompt(request, session)
    );

    const result = DiagramModelOutputSchema.parse(parsed);

    logHive("model.propose.parsed", {
      seq: request.seq,
      latencyMs: Date.now() - startedAt,
      diagramType: result.diagramType,
      sourcePreview: previewText(result.nextSource, 220),
      summary: previewText(result.summary, 180),
      changes: result.changeList.map((change) => previewText(change, 80))
    });

    return result;
  }

  private async chatJson(family: "intent-detector" | "diagram-proposer", system: string, user: string): Promise<unknown> {
    const cacheBody = this.config.promptCacheKeyEnabled
      ? {
          prompt_cache_key: `hive-mind-v1:${family}`
        }
      : {};

    const completion = await this.client.chat.completions.create({
      model: this.config.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ],
      temperature: family === "intent-detector" ? 0.1 : 0.25,
      response_format: { type: "json_object" },
      ...cacheBody
    } as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming);

    const content = completion.choices[0]?.message?.content;

    if (!content) {
      throw new Error("Cerebras response was empty");
    }

    const parsed = parseJsonObject(content);

    logHive("model.raw", {
      family,
      contentPreview: previewText(content, 500),
      rawJson: process.env.HIVE_DEBUG_MODEL_JSON === "true" ? parsed : undefined
    });

    return parsed;
  }
}

function ensureObject(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  throw new Error("Model response was not a JSON object");
}
