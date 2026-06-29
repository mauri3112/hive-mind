import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { ZodError } from "zod";
import { AnalyzeRequestSchema, ApplyRequestSchema, ProposeRequestSchema } from "../shared/hiveSchemas";
import { CerebrasHiveModelClient } from "./cerebrasClient";
import {
  analyzeIntent,
  applyDiagramChange,
  proposeDiagramChange,
  StaleSuggestionError,
  SuggestionNotFoundError
} from "./hiveEngine";
import type { HiveModelClient } from "./hiveModel";
import { HeuristicHiveModelClient } from "./heuristicModel";
import { logHive, logHiveWarn, previewText } from "./logger";
import { SessionStore } from "./sessionStore";

export interface AppOptions {
  model?: HiveModelClient;
  store?: SessionStore;
}

export function createApp(options: AppOptions = {}) {
  const app = express();
  const store = options.store ?? new SessionStore();
  const model = options.model ?? createDefaultModel();

  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_request, response) => {
    response.json({ ok: true, model: model.constructor.name });
  });

  app.post(
    "/api/hive/analyze",
    asyncHandler(async (request, response) => {
      const parsed = AnalyzeRequestSchema.safeParse(request.body);

      if (!parsed.success) {
        logHiveWarn("analyze.request.invalid", { issues: parsed.error.issues });
        response.status(400).json({
          error: "request_validation_error",
          issues: parsed.error.issues
        });
        return;
      }

      const body = parsed.data;
      const session = store.get(body.sessionId);
      logHive("analyze.request", {
        sessionId: body.sessionId,
        seq: body.seq,
        range: body.transcriptRange,
        transcript: previewText(body.transcriptWindow),
        recentCommitted: body.recentCommittedIntents.length,
        diagramSummary: previewText(body.diagramSummary || session.diagram.summary, 140)
      });
      const result = await analyzeIntent(body, session, model);
      logHive("analyze.response", {
        sessionId: body.sessionId,
        seq: result.seq,
        status: result.status,
        intentId: result.intent?.id,
        confidence: result.intent?.confidence,
        commitMode: result.intent?.commitMode,
        canonicalText: result.intent ? previewText(result.intent.canonicalText, 160) : undefined,
        complementText: result.intent?.complementText ? previewText(result.intent.complementText, 160) : undefined,
        deferReason: result.deferReason ? previewText(result.deferReason, 160) : undefined
      });
      response.json(result);
    })
  );

  app.post(
    "/api/hive/propose",
    asyncHandler(async (request, response) => {
      const parsed = ProposeRequestSchema.safeParse(request.body);

      if (!parsed.success) {
        logHiveWarn("propose.request.invalid", { issues: parsed.error.issues });
        response.status(400).json({
          error: "request_validation_error",
          issues: parsed.error.issues
        });
        return;
      }

      const body = parsed.data;
      const session = store.get(body.sessionId);
      logHive("propose.request", {
        sessionId: body.sessionId,
        seq: body.seq,
        baseRevision: body.baseRevision,
        currentRevision: session.diagram.revision,
        diagramType: session.diagram.diagramType,
        intentId: body.intent.id,
        canonicalText: previewText(body.intent.canonicalText, 180),
        complementText: body.intent.complementText ? previewText(body.intent.complementText, 180) : undefined
      });

      if (body.baseRevision !== session.diagram.revision) {
        logHiveWarn("propose.stale_revision", {
          sessionId: body.sessionId,
          seq: body.seq,
          baseRevision: body.baseRevision,
          currentRevision: session.diagram.revision
        });
        response.status(409).json({
          error: "stale_revision",
          document: session.diagram
        });
        return;
      }

      const result = await proposeDiagramChange(body, session, model);
      logHive("propose.response", {
        sessionId: body.sessionId,
        seq: result.seq,
        suggestionId: result.suggestion.id,
        baseRevision: result.suggestion.baseRevision,
        diagramType: result.suggestion.diagramType,
        summary: previewText(result.suggestion.summary, 180)
      });
      response.json(result);
    })
  );

  app.post(
    "/api/hive/apply",
    asyncHandler(async (request, response) => {
      const parsed = ApplyRequestSchema.safeParse(request.body);

      if (!parsed.success) {
        logHiveWarn("apply.request.invalid", { issues: parsed.error.issues });
        response.status(400).json({
          error: "request_validation_error",
          issues: parsed.error.issues
        });
        return;
      }

      const body = parsed.data;
      const session = store.get(body.sessionId);
      logHive("apply.request", {
        sessionId: body.sessionId,
        seq: body.seq,
        suggestionId: body.suggestionId,
        currentRevision: session.diagram.revision
      });

      try {
        const result = applyDiagramChange(body, session);
        logHive("apply.response", {
          sessionId: body.sessionId,
          seq: result.seq,
          suggestionId: result.appliedSuggestionId,
          revision: result.document.revision,
          diagramType: result.document.diagramType,
          summary: previewText(result.document.summary, 180)
        });
        response.json(result);
      } catch (error) {
        if (error instanceof SuggestionNotFoundError) {
          response.status(404).json({
            error: "suggestion_not_found",
            suggestionId: error.suggestionId,
            document: session.diagram
          });
          return;
        }

        if (error instanceof StaleSuggestionError) {
          response.status(409).json({
            error: "stale_revision",
            suggestionId: error.suggestion.id,
            document: session.diagram
          });
          return;
        }

        throw error;
      }
    })
  );

  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    if (error instanceof ZodError) {
      logHiveWarn("model.schema_error", { issues: error.issues });
      response.status(502).json({
        error: "model_schema_error",
        issues: error.issues
      });
      return;
    }

    const message = error instanceof Error ? error.message : "Unknown server error";
    logHiveWarn("model.error", { message });
    response.status(502).json({
      error: "hive_model_error",
      message
    });
  });

  return app;
}

function asyncHandler(handler: (request: Request, response: Response, next: NextFunction) => Promise<void>) {
  return (request: Request, response: Response, next: NextFunction) => {
    handler(request, response, next).catch(next);
  };
}

function createDefaultModel(): HiveModelClient {
  if (process.env.CEREBRAS_API_KEY) {
    return new CerebrasHiveModelClient();
  }

  return new HeuristicHiveModelClient();
}
