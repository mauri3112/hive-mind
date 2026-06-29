import type { DiagramDocument } from "../../shared/hiveSchemas";

export const INITIAL_DIAGRAM_SOURCE = "sequenceDiagram";

export const INITIAL_DIAGRAM_SUMMARY = "An empty sequence diagram is ready for the first accepted voice suggestion.";

export function createInitialDiagramDocument(): DiagramDocument {
  return {
    revision: 0,
    diagramType: "sequence",
    source: INITIAL_DIAGRAM_SOURCE,
    summary: INITIAL_DIAGRAM_SUMMARY
  };
}
