import type {
  AnalyzeRequest,
  AnalyzeResponse,
  ApplyResponse,
  DiagramSuggestion,
  ProposeRequest,
  ProposeResponse
} from "../shared/hiveSchemas";
import { ApplyResponseSchema, DiagramModelOutputSchema, ProposeResponseSchema } from "../shared/hiveSchemas";
import { applyDiagramSuggestion, createDiagramSuggestion } from "./diagramDocument";
import type { HiveModelClient } from "./hiveModel";
import { logHive, previewText } from "./logger";
import type { HiveSession } from "./sessionStore";

export async function analyzeIntent(
  request: AnalyzeRequest,
  session: HiveSession,
  model: HiveModelClient
): Promise<AnalyzeResponse> {
  return model.analyze(request, session);
}

export async function proposeDiagramChange(
  request: ProposeRequest,
  session: HiveSession,
  model: HiveModelClient
): Promise<ProposeResponse> {
  const rawModelOutput = DiagramModelOutputSchema.parse(await model.propose(request, session));
  const suggestion = createDiagramSuggestion(rawModelOutput, request.intent, request.baseRevision, `${request.seq}`);
  session.pendingSuggestions = upsertSuggestion(session.pendingSuggestions, suggestion);

  logHive("diagram.suggestion.created", {
    sessionId: session.id,
    revision: session.diagram.revision,
    suggestionId: suggestion.id,
    diagramType: suggestion.diagramType,
    intentId: suggestion.intent.id,
    summary: previewText(suggestion.summary, 180),
    changes: suggestion.changeList.map((change) => previewText(change, 90))
  });

  return ProposeResponseSchema.parse({
    seq: request.seq,
    suggestion
  });
}

export function applyDiagramChange(request: { seq: number; suggestionId: string }, session: HiveSession): ApplyResponse {
  const suggestion = session.pendingSuggestions.find((item) => item.id === request.suggestionId);

  if (!suggestion) {
    throw new SuggestionNotFoundError(request.suggestionId);
  }

  if (suggestion.baseRevision !== session.diagram.revision) {
    throw new StaleSuggestionError(suggestion);
  }

  session.diagram = applyDiagramSuggestion(session.diagram, suggestion);
  session.acceptedIntents.push(suggestion.intent);
  session.pendingSuggestions = session.pendingSuggestions.filter((item) => item.id !== suggestion.id);

  const railEvents = [
    { kind: "intent" as const, text: suggestion.intent.displayText },
    ...(suggestion.intent.complementText ? [{ kind: "complement" as const, text: suggestion.intent.complementText }] : [])
  ];

  logHive("diagram.suggestion.applied", {
    sessionId: session.id,
    revision: session.diagram.revision,
    suggestionId: suggestion.id,
    intentId: suggestion.intent.id,
    summary: previewText(session.diagram.summary, 180)
  });

  return ApplyResponseSchema.parse({
    seq: request.seq,
    document: session.diagram,
    appliedSuggestionId: suggestion.id,
    railEvents
  });
}

export class SuggestionNotFoundError extends Error {
  constructor(readonly suggestionId: string) {
    super(`Suggestion not found: ${suggestionId}`);
    this.name = "SuggestionNotFoundError";
  }
}

export class StaleSuggestionError extends Error {
  constructor(readonly suggestion: DiagramSuggestion) {
    super(`Suggestion is stale: ${suggestion.id}`);
    this.name = "StaleSuggestionError";
  }
}

function upsertSuggestion(current: DiagramSuggestion[], suggestion: DiagramSuggestion): DiagramSuggestion[] {
  return [...current.filter((item) => item.id !== suggestion.id), suggestion].slice(-12);
}
