import { createHash } from "node:crypto";
import {
  DiagramDocumentSchema,
  DiagramSuggestionSchema,
  type DiagramDocument,
  type DiagramModelOutput,
  type DiagramSuggestion,
  type DiagramType,
  type HiveIntent
} from "../shared/hiveSchemas";

export const INITIAL_DIAGRAM_SOURCE = "sequenceDiagram";

export const INITIAL_DIAGRAM_SUMMARY = "An empty sequence diagram is ready for the first accepted voice suggestion.";

export function createDiagramDocument(): DiagramDocument {
  return DiagramDocumentSchema.parse({
    revision: 0,
    diagramType: "sequence",
    source: INITIAL_DIAGRAM_SOURCE,
    summary: INITIAL_DIAGRAM_SUMMARY
  });
}

export function createDiagramSuggestion(
  output: DiagramModelOutput,
  intent: HiveIntent,
  baseRevision: number,
  seed: string
): DiagramSuggestion {
  const nextSource = normalizeMermaidSource(output.nextSource);
  const diagramType = inferDiagramType(nextSource);

  return DiagramSuggestionSchema.parse({
    id: createSuggestionId(seed, intent.id, nextSource),
    baseRevision,
    diagramType,
    nextSource,
    summary: output.summary.trim(),
    changeList: output.changeList.map((item) => item.trim()).filter(Boolean),
    intent
  });
}

export function applyDiagramSuggestion(document: DiagramDocument, suggestion: DiagramSuggestion): DiagramDocument {
  return DiagramDocumentSchema.parse({
    revision: document.revision + 1,
    diagramType: suggestion.diagramType,
    source: normalizeMermaidSource(suggestion.nextSource),
    summary: suggestion.summary
  });
}

export function inferDiagramType(source: string): DiagramType {
  const firstLine = normalizeMermaidSource(source).split(/\r?\n/, 1)[0]?.trim();

  if (firstLine === "sequenceDiagram") {
    return "sequence";
  }

  if (firstLine === "stateDiagram-v2") {
    return "state";
  }

  throw new Error("Mermaid source must start with sequenceDiagram or stateDiagram-v2");
}

export function normalizeMermaidSource(source: string): string {
  return source.replace(/\r\n/g, "\n").trim();
}

function createSuggestionId(seed: string, intentId: string, source: string): string {
  const hash = createHash("sha1").update(`${seed}:${intentId}:${source}`).digest("hex").slice(0, 14);
  return `sugg_${hash}`;
}
