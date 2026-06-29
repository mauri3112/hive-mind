import { describe, expect, it } from "vitest";
import type { DiagramModelOutput, HiveIntent } from "../../shared/hiveSchemas";
import {
  applyDiagramSuggestion,
  createDiagramDocument,
  createDiagramSuggestion,
  inferDiagramType,
  normalizeMermaidSource
} from "../../server/diagramDocument";

const intent: HiveIntent = {
  id: "add-db",
  canonicalText: "Add a database participant and persist messages.",
  displayText: "Add database persistence",
  complementText: null,
  confidence: 0.91,
  commitMode: "instant",
  transcriptRange: { startMs: 0, endMs: 1000 }
};

describe("diagram document", () => {
  it("creates the initial empty sequence diagram document", () => {
    const document = createDiagramDocument();

    expect(document.revision).toBe(0);
    expect(document.diagramType).toBe("sequence");
    expect(document.source).toBe("sequenceDiagram");
    expect(document.summary).toContain("empty sequence diagram");
  });

  it("infers supported Mermaid diagram types", () => {
    expect(inferDiagramType("sequenceDiagram\nA->>B: Hi")).toBe("sequence");
    expect(inferDiagramType("stateDiagram-v2\n[*] --> Ready")).toBe("state");
    expect(() => inferDiagramType("flowchart TD\nA-->B")).toThrow(/sequenceDiagram/);
  });

  it("normalizes source and applies suggestions with revision increments", () => {
    const document = createDiagramDocument();
    const output: DiagramModelOutput = {
      diagramType: "state",
      nextSource: "  stateDiagram-v2\r\n    [*] --> Draft  ",
      summary: "A state diagram exists.",
      changeList: ["Switched to a state diagram"],
      railEvents: [{ kind: "intent", text: "Create state diagram" }]
    };
    const suggestion = createDiagramSuggestion(output, intent, document.revision, "1");
    const next = applyDiagramSuggestion(document, suggestion);

    expect(suggestion.id).toMatch(/^sugg_/);
    expect(suggestion.diagramType).toBe("state");
    expect(suggestion.nextSource).toBe("stateDiagram-v2\n    [*] --> Draft");
    expect(next.revision).toBe(1);
    expect(next.diagramType).toBe("state");
    expect(next.summary).toBe("A state diagram exists.");
  });

  it("rejects unsupported Mermaid source", () => {
    expect(normalizeMermaidSource(" sequenceDiagram\nA->>B: Hi ")).toBe("sequenceDiagram\nA->>B: Hi");
    expect(() =>
      createDiagramSuggestion(
        {
          diagramType: "sequence",
          nextSource: "flowchart TD\nA-->B",
          summary: "Bad diagram.",
          changeList: ["Bad change"],
          railEvents: []
        },
        intent,
        0,
        "bad"
      )
    ).toThrow(/sequenceDiagram/);
  });
});
