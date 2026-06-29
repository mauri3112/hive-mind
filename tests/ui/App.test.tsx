import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DiagramDocument, DiagramSuggestion, HiveIntent } from "../../shared/hiveSchemas";

const mermaidMockState = vi.hoisted((): { validationResult: { valid: boolean; message: string } } => ({
  validationResult: { valid: true, message: "Valid Mermaid" }
}));

vi.mock("../../src/utils/mermaidRenderer", () => ({
  validateMermaidSource: vi.fn(async () => mermaidMockState.validationResult),
  renderMermaidSvg: vi.fn(async (source: string) => `<svg role="img"><text>${source.includes("Database") ? "Database" : "Initial"}</text></svg>`)
}));

import App from "../../src/App";

class MockRecognition implements SpeechRecognition {
  static latest: MockRecognition | null = null;

  continuous = false;
  interimResults = false;
  lang = "en-US";
  onend: (() => void) | null = null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null = null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null = null;

  constructor() {
    MockRecognition.latest = this;
  }

  addEventListener = vi.fn();
  dispatchEvent = vi.fn();
  removeEventListener = vi.fn();
  start = vi.fn();
  stop = vi.fn(() => this.onend?.());
  abort = vi.fn();

  emitResult(text: string, isFinal: boolean) {
    const alternative = { transcript: text, confidence: 0.99 };
    const result = {
      0: alternative,
      isFinal,
      length: 1,
      item: () => alternative
    } as unknown as SpeechRecognitionResult;
    const results = {
      0: result,
      length: 1,
      item: () => result
    } as unknown as SpeechRecognitionResultList;

    this.onresult?.({
      resultIndex: 0,
      results
    } as SpeechRecognitionEvent);
  }
}

const appIntent: HiveIntent = {
  id: "add-db",
  canonicalText: "Add a database participant and persist messages.",
  displayText: "Add database persistence",
  complementText: "I will insert the database after the API gateway.",
  confidence: 0.92,
  commitMode: "instant",
  transcriptRange: { startMs: 0, endMs: 1200 }
};

const proposedSource = `sequenceDiagram
    participant User
    participant API as API Gateway
    participant DB as Database

    User->>API: Send message
    API->>DB: Save message
    API-->>User: Response`;

const appliedDocument: DiagramDocument = {
  revision: 1,
  diagramType: "sequence",
  source: proposedSource,
  summary: "The sequence diagram persists messages in a database."
};

function makeSuggestion(overrides: Partial<DiagramSuggestion> = {}): DiagramSuggestion {
  return {
    id: "sugg_db",
    baseRevision: 0,
    diagramType: "sequence",
    nextSource: proposedSource,
    summary: "The sequence diagram persists messages in a database.",
    changeList: ["Added Database participant", "Saved the message before responding"],
    intent: appIntent,
    ...overrides
  };
}

function jsonResponse(payload: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload
  } as Response;
}

function mockFetchForSuggestion(suggestion = makeSuggestion()) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);

    if (url.includes("/api/hive/analyze")) {
      return jsonResponse({
        seq: 1,
        status: "ready",
        intent: appIntent
      });
    }

    if (url.includes("/api/hive/propose")) {
      return jsonResponse({
        seq: 1,
        suggestion
      });
    }

    if (url.includes("/api/hive/apply")) {
      return jsonResponse({
        seq: 1,
        document: appliedDocument,
        appliedSuggestionId: suggestion.id,
        railEvents: [
          { kind: "intent", text: "Add database persistence" },
          { kind: "complement", text: "I will insert the database after the API gateway." }
        ]
      });
    }

    return jsonResponse({ error: "not_found" }, 404);
  });
}

async function createSuggestion(fetchMock = mockFetchForSuggestion(), waitForValid = true) {
  vi.stubGlobal("fetch", fetchMock);
  render(<App analyzeIntervalMs={20} />);

  await userEvent.click(screen.getByRole("button", { name: /start recording/i }));
  MockRecognition.latest?.emitResult("add a database to save messages", true);

  await waitFor(() => expect(screen.getByText("Add database persistence")).toBeInTheDocument());
  if (waitForValid) {
    await waitFor(() => expect(screen.getByRole("button", { name: /accept/i })).toBeEnabled());
  }

  return fetchMock;
}

describe("Hive Mind app", () => {
  beforeEach(() => {
    mermaidMockState.validationResult = { valid: true, message: "Valid Mermaid" };
    MockRecognition.latest = null;
    window.SpeechRecognition = MockRecognition as unknown as SpeechRecognitionConstructor;
    window.webkitSpeechRecognition = undefined;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("records speech and creates a validated suggestion without changing the source", async () => {
    const fetchMock = await createSuggestion();

    expect(fetchMock).toHaveBeenCalledWith("/api/hive/analyze", expect.any(Object));
    expect(fetchMock).toHaveBeenCalledWith("/api/hive/propose", expect.any(Object));
    expect(fetchMock).not.toHaveBeenCalledWith("/api/hive/apply", expect.any(Object));

    const sourcePanel = screen.getByLabelText("Current Mermaid source");
    expect(sourcePanel).not.toHaveTextContent("Database");
  });

  it("applies a suggestion only after Accept", async () => {
    const fetchMock = await createSuggestion();

    await userEvent.click(screen.getByRole("button", { name: /accept/i }));

    await waitFor(() => expect(screen.getByLabelText("Current Mermaid source")).toHaveTextContent("Database"));
    expect(fetchMock).toHaveBeenCalledWith("/api/hive/apply", expect.any(Object));
    expect(screen.queryByText("Added Database participant")).not.toBeInTheDocument();
  });

  it("removes older pending suggestions after a newer diagram revision is applied", async () => {
    const cacheIntent: HiveIntent = {
      ...appIntent,
      id: "add-cache",
      canonicalText: "Add a cache participant before the database.",
      displayText: "Add cache participant",
      transcriptRange: { startMs: 1201, endMs: 2400 }
    };
    const cacheSuggestion = makeSuggestion({
      id: "sugg_cache",
      intent: cacheIntent,
      changeList: ["Added Cache participant"]
    });
    let analyzeCount = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.includes("/api/hive/analyze")) {
        const intent = analyzeCount === 0 ? appIntent : cacheIntent;
        analyzeCount += 1;
        return jsonResponse({
          seq: analyzeCount,
          status: "ready",
          intent
        });
      }

      if (url.includes("/api/hive/propose")) {
        const body = JSON.parse(String(init?.body)) as { intent: HiveIntent };
        return jsonResponse({
          seq: body.intent.id === appIntent.id ? 1 : 2,
          suggestion: body.intent.id === appIntent.id ? makeSuggestion() : cacheSuggestion
        });
      }

      if (url.includes("/api/hive/apply")) {
        return jsonResponse({
          seq: 1,
          document: appliedDocument,
          appliedSuggestionId: "sugg_db",
          railEvents: [{ kind: "intent", text: "Add database persistence" }]
        });
      }

      return jsonResponse({ error: "not_found" }, 404);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<App analyzeIntervalMs={20} />);

    await userEvent.click(screen.getByRole("button", { name: /start recording/i }));
    MockRecognition.latest?.emitResult("add a database to save messages", true);
    await waitFor(() => expect(screen.getByText("Added Database participant")).toBeInTheDocument());
    MockRecognition.latest?.emitResult("add a cache participant", true);
    await waitFor(() => expect(screen.getByText("Added Cache participant")).toBeInTheDocument());

    const databaseCard = screen.getByText("Added Database participant").closest(".suggestion-card");
    expect(databaseCard).not.toBeNull();
    await userEvent.click(within(databaseCard as HTMLElement).getByRole("button", { name: /accept/i }));

    await waitFor(() => expect(screen.queryByText("Added Cache participant")).not.toBeInTheDocument());
    expect(screen.queryByText("Added Database participant")).not.toBeInTheDocument();
  });

  it("rejects a suggestion without applying it", async () => {
    const fetchMock = await createSuggestion();
    const card = screen.getByText("Add database persistence").closest(".suggestion-card");

    expect(card).not.toBeNull();
    await userEvent.click(within(card as HTMLElement).getByRole("button", { name: /reject/i }));

    expect(screen.queryByText("Added Database participant")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Current Mermaid source")).not.toHaveTextContent("Database");
    expect(fetchMock).not.toHaveBeenCalledWith("/api/hive/apply", expect.any(Object));
  });

  it("disables Accept for invalid Mermaid suggestions", async () => {
    mermaidMockState.validationResult = { valid: false, message: "Parse error" };
    await createSuggestion(makeMockFetchWithSuggestion(makeSuggestion({ nextSource: "sequenceDiagram\n    this is invalid" })), false);

    await waitFor(() => expect(screen.getByRole("button", { name: /accept/i })).toBeDisabled());
    expect(screen.getByText("Parse error")).toBeInTheDocument();
  });

  it("disables recording when browser speech recognition is unavailable", () => {
    window.SpeechRecognition = undefined;
    window.webkitSpeechRecognition = undefined;

    render(<App />);

    expect(screen.getByRole("button", { name: /start recording/i })).toBeDisabled();
    expect(screen.getByText("Speech unavailable")).toBeInTheDocument();
  });

  it("downloads Mermaid source", async () => {
    const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:hive");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

    render(<App />);

    await userEvent.click(screen.getByRole("button", { name: /download mermaid/i }));

    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:hive");
  });

  it("prompts before starting a new dictation when diagram work exists", async () => {
    vi.stubGlobal("fetch", mockFetchForSuggestion());

    render(<App analyzeIntervalMs={20} />);

    await userEvent.click(screen.getByRole("button", { name: /start recording/i }));
    MockRecognition.latest?.emitResult("add a database to save messages", true);
    await waitFor(() => expect(screen.getByText("Add database persistence")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: /stop recording/i }));
    await userEvent.click(screen.getByRole("button", { name: /start recording/i }));

    expect(screen.getByRole("dialog", { name: /start new dictation/i })).toBeInTheDocument();
  });
});

function makeMockFetchWithSuggestion(suggestion: DiagramSuggestion) {
  return mockFetchForSuggestion(suggestion);
}
