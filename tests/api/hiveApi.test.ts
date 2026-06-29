import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { AnalyzeRequest, ProposeRequest } from "../../shared/hiveSchemas";
import { createApp } from "../../server/app";
import type { HiveModelClient } from "../../server/hiveModel";
import type { HiveSession } from "../../server/sessionStore";

function makeReadyAnalyze(seq: number, transcriptRange = { startMs: 0, endMs: 1000 }) {
  return {
    seq,
    status: "ready" as const,
    intent: {
      id: "add-db",
      canonicalText: "Add a database participant and persist messages.",
      displayText: "Add database persistence",
      complementText: "I will insert the database after the API gateway.",
      confidence: 0.9,
      commitMode: "instant" as const,
      transcriptRange
    }
  };
}

function makeProposal(overrides: Partial<Awaited<ReturnType<HiveModelClient["propose"]>>> = {}) {
  return {
    diagramType: "sequence" as const,
    nextSource: `sequenceDiagram
    participant User
    participant API as API Gateway
    participant DB as Database

    User->>API: Send message
    API->>DB: Save message
    API-->>User: Response`,
    summary: "The sequence diagram persists messages in a database.",
    changeList: ["Added Database participant", "Saved the message before responding"],
    railEvents: [{ kind: "intent" as const, text: "Add database persistence" }],
    ...overrides
  };
}

const proposalBody = {
  sessionId: "s-propose",
  seq: 1,
  baseRevision: 0,
  intent: makeReadyAnalyze(1).intent
};

describe("hive API", () => {
  it("returns analyzer statuses from the model", async () => {
    const model: HiveModelClient = {
      analyze: vi.fn(async (body: AnalyzeRequest) => makeReadyAnalyze(body.seq, body.transcriptRange)),
      propose: vi.fn()
    };
    const app = createApp({ model });

    const response = await request(app).post("/api/hive/analyze").send({
      sessionId: "s1",
      seq: 3,
      transcriptWindow: "add a database to save messages",
      transcriptRange: { startMs: 0, endMs: 1100 },
      diagramSummary: "",
      recentCommittedIntents: []
    });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("ready");
    expect(response.body.seq).toBe(3);
  });

  it("accepts forming analyzer responses with a null intent", async () => {
    const model: HiveModelClient = {
      analyze: vi.fn(async (body: AnalyzeRequest) => ({
        seq: body.seq,
        status: "forming" as const,
        intent: null,
        deferReason: "The user is still describing the diagram change."
      })),
      propose: vi.fn()
    };
    const app = createApp({ model });

    const response = await request(app).post("/api/hive/analyze").send({
      sessionId: "s-null-intent",
      seq: 4,
      transcriptWindow: "and then the API should",
      transcriptRange: { startMs: 0, endMs: 1200 },
      diagramSummary: "",
      recentCommittedIntents: []
    });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("forming");
    expect(response.body.intent).toBeNull();
  });

  it("creates suggestions without mutating until apply", async () => {
    const model: HiveModelClient = {
      analyze: vi.fn(),
      propose: vi.fn(async (_body: ProposeRequest, _session: HiveSession) => makeProposal())
    };
    const app = createApp({ model });

    const firstProposal = await request(app).post("/api/hive/propose").send(proposalBody).expect(200);
    const secondProposal = await request(app)
      .post("/api/hive/propose")
      .send({ ...proposalBody, seq: 2 })
      .expect(200);

    expect(firstProposal.body.suggestion.baseRevision).toBe(0);
    expect(firstProposal.body.suggestion.nextSource).toContain("Database");
    expect(secondProposal.body.suggestion.baseRevision).toBe(0);

    const applyResponse = await request(app)
      .post("/api/hive/apply")
      .send({
        sessionId: "s-propose",
        seq: 3,
        suggestionId: firstProposal.body.suggestion.id
      })
      .expect(200);

    expect(applyResponse.body.document.revision).toBe(1);
    expect(applyResponse.body.document.source).toContain("Database");
    expect(applyResponse.body.appliedSuggestionId).toBe(firstProposal.body.suggestion.id);
  });

  it("rejecting client-side by not applying leaves the revision unchanged", async () => {
    const model: HiveModelClient = {
      analyze: vi.fn(),
      propose: vi.fn(async () => makeProposal())
    };
    const app = createApp({ model });

    await request(app)
      .post("/api/hive/propose")
      .send({ ...proposalBody, sessionId: "s-reject" })
      .expect(200);
    const stillCurrent = await request(app)
      .post("/api/hive/propose")
      .send({ ...proposalBody, sessionId: "s-reject", seq: 2, baseRevision: 0 })
      .expect(200);

    expect(stillCurrent.body.suggestion.baseRevision).toBe(0);
  });

  it("returns stale revision errors for outdated propose and apply requests", async () => {
    const model: HiveModelClient = {
      analyze: vi.fn(),
      propose: vi.fn(async () => makeProposal())
    };
    const app = createApp({ model });

    const first = await request(app)
      .post("/api/hive/propose")
      .send({ ...proposalBody, sessionId: "s-stale", seq: 1 })
      .expect(200);
    const second = await request(app)
      .post("/api/hive/propose")
      .send({ ...proposalBody, sessionId: "s-stale", seq: 2 })
      .expect(200);

    await request(app)
      .post("/api/hive/apply")
      .send({ sessionId: "s-stale", seq: 3, suggestionId: first.body.suggestion.id })
      .expect(200);

    const staleApply = await request(app)
      .post("/api/hive/apply")
      .send({ sessionId: "s-stale", seq: 4, suggestionId: second.body.suggestion.id });
    const stalePropose = await request(app)
      .post("/api/hive/propose")
      .send({ ...proposalBody, sessionId: "s-stale", seq: 5, baseRevision: 0 });

    expect(staleApply.status).toBe(409);
    expect(staleApply.body.error).toBe("stale_revision");
    expect(staleApply.body.document.revision).toBe(1);
    expect(stalePropose.status).toBe(409);
    expect(stalePropose.body.document.revision).toBe(1);
  });

  it("returns a model schema error for malformed proposal output", async () => {
    const model: HiveModelClient = {
      analyze: vi.fn(),
      propose: vi.fn(async () => ({ malformed: true }) as never)
    };
    const app = createApp({ model });

    const response = await request(app)
      .post("/api/hive/propose")
      .send({ ...proposalBody, sessionId: "s-malformed" });

    expect(response.status).toBe(502);
    expect(response.body.error).toBe("model_schema_error");
  });
});
