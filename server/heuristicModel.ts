import { createHash } from "node:crypto";
import type {
  AnalyzeRequest,
  AnalyzeResponse,
  DiagramModelOutput,
  HiveIntent,
  ProposeRequest
} from "../shared/hiveSchemas";
import type { HiveModelClient } from "./hiveModel";
import type { HiveSession } from "./sessionStore";

interface IntentCandidate {
  canonicalText: string;
  displayText: string;
  complementText: string | null;
  confidence: number;
  commitMode: "instant" | "boundary";
  match: (text: string) => boolean;
}

const CANDIDATES: IntentCandidate[] = [
  {
    canonicalText: "Add a database participant and persist messages after the API gateway receives the chat request.",
    displayText: "Add database persistence",
    complementText: "I will insert the database after the API gateway so saved messages are visible in the flow.",
    confidence: 0.93,
    commitMode: "instant",
    match: (text) => /\b(database|db|store|persist|save)\b/.test(text) && /\b(message|chat|request|history)\b/.test(text)
  },
  {
    canonicalText: "Add an authentication check before the API call reaches the AI service.",
    displayText: "Add auth check",
    complementText: "I will add an auth service and an invalid-token branch.",
    confidence: 0.9,
    commitMode: "instant",
    match: (text) => /\b(auth|authentication|authorize|login|token)\b/.test(text)
  },
  {
    canonicalText: "Add a rate limit error path around the AI service response.",
    displayText: "Add rate limit path",
    complementText: "I will use an alternate branch so the failure path is explicit.",
    confidence: 0.89,
    commitMode: "instant",
    match: (text) => /\b(rate limit|throttle|too many requests|429)\b/.test(text)
  },
  {
    canonicalText: "Create a state diagram for an order moving from draft to submitted to fulfilled.",
    displayText: "Create order state diagram",
    complementText: "I will switch the document to a state diagram with a short order lifecycle.",
    confidence: 0.88,
    commitMode: "instant",
    match: (text) => /\bstate diagram|state machine|lifecycle\b/.test(text)
  },
  {
    canonicalText: "Add a retry loop around the failed service call.",
    displayText: "Add retry loop",
    complementText: null,
    confidence: 0.84,
    commitMode: "instant",
    match: (text) => /\b(retry|rerun|try again|repeat)\b/.test(text)
  }
];

export class HeuristicHiveModelClient implements HiveModelClient {
  async analyze(request: AnalyzeRequest): Promise<AnalyzeResponse> {
    const text = normalize(request.transcriptWindow);

    if (!text || text.split(/\s+/).length < 3) {
      return {
        seq: request.seq,
        status: "none",
        deferReason: "Waiting for more speech."
      };
    }

    const candidate = CANDIDATES.find((item) => item.match(text));

    if (candidate) {
      const alreadyCommitted = request.recentCommittedIntents.some(
        (intent) => normalize(intent.canonicalText) === normalize(candidate.canonicalText)
      );

      if (alreadyCommitted) {
        return {
          seq: request.seq,
          status: "none",
          deferReason: "Intent already committed."
        };
      }

      return {
        seq: request.seq,
        status: "ready",
        intent: toIntent(candidate, request)
      };
    }

    if (/\b(add|create|show|diagram|sequence|state|service|api|user|then|when|path|flow)\b/.test(text)) {
      const forming: IntentCandidate = {
        canonicalText: `Clarify this diagram change: ${request.transcriptWindow.trim()}`,
        displayText: request.transcriptWindow.trim().slice(0, 96),
        complementText: null,
        confidence: 0.56,
        commitMode: "boundary",
        match: () => true
      };

      return {
        seq: request.seq,
        status: "forming",
        intent: toIntent(forming, request),
        deferReason: "The user appears to be mid diagram intent."
      };
    }

    return {
      seq: request.seq,
      status: "reject",
      deferReason: "Speech is not related to editing the diagram."
    };
  }

  async propose(request: ProposeRequest, session: HiveSession): Promise<DiagramModelOutput> {
    const canonical = normalize(request.intent.canonicalText);
    const railEvents = [
      { kind: "intent" as const, text: request.intent.displayText },
      ...(request.intent.complementText ? [{ kind: "complement" as const, text: request.intent.complementText }] : [])
    ];

    if (canonical.includes("database") || canonical.includes("persist")) {
      return {
        diagramType: "sequence",
        nextSource: `sequenceDiagram
    participant User
    participant Frontend
    participant API as API Gateway
    participant DB as Database
    participant AI as AI Service

    User->>Frontend: Send message
    Frontend->>API: POST /api/chat
    API->>DB: Save incoming message
    API->>AI: Forward message
    AI-->>API: AI response
    API->>DB: Save AI response
    API-->>Frontend: Response
    Frontend-->>User: Display message`,
        summary: "The sequence diagram persists user and AI messages through a database.",
        changeList: ["Added Database participant", "Saved incoming and AI messages around the AI call"],
        railEvents
      };
    }

    if (canonical.includes("authentication") || canonical.includes("auth")) {
      return {
        diagramType: "sequence",
        nextSource: `sequenceDiagram
    participant User
    participant Frontend
    participant API as API Gateway
    participant Auth as Auth Service
    participant AI as AI Service

    User->>Frontend: Send message
    Frontend->>API: POST /api/chat
    API->>Auth: Validate token
    alt token valid
        API->>AI: Forward message
        AI-->>API: AI response
        API-->>Frontend: Response
    else token invalid
        API-->>Frontend: 401 Unauthorized
    end
    Frontend-->>User: Display result`,
        summary: "The sequence diagram checks auth before calling the AI service.",
        changeList: ["Added Auth Service participant", "Inserted valid and invalid token branches"],
        railEvents
      };
    }

    if (canonical.includes("rate limit")) {
      return {
        diagramType: "sequence",
        nextSource: `sequenceDiagram
    participant User
    participant Frontend
    participant API as API Gateway
    participant AI as AI Service

    User->>Frontend: Send message
    Frontend->>API: POST /api/chat
    API->>AI: Forward message
    alt AI service available
        AI-->>API: AI response
        API-->>Frontend: Response
    else rate limited
        AI-->>API: 429 Too Many Requests
        API-->>Frontend: Show retry prompt
    end
    Frontend-->>User: Display result`,
        summary: "The sequence diagram includes a rate-limit failure branch.",
        changeList: ["Added alternate branch for AI rate limiting", "Shows retry prompt on 429 response"],
        railEvents
      };
    }

    if (canonical.includes("state diagram") || canonical.includes("state machine")) {
      return {
        diagramType: "state",
        nextSource: `stateDiagram-v2
    [*] --> Draft
    Draft --> Submitted: submit order
    Submitted --> Fulfilled: payment captured
    Submitted --> Cancelled: cancel
    Fulfilled --> [*]
    Cancelled --> [*]`,
        summary: "The diagram shows an order lifecycle from draft through fulfillment or cancellation.",
        changeList: ["Switched to a state diagram", "Added draft, submitted, fulfilled, and cancelled states"],
        railEvents
      };
    }

    if (canonical.includes("retry")) {
      return {
        diagramType: session.diagram.diagramType,
        nextSource:
          session.diagram.diagramType === "state"
            ? `stateDiagram-v2
    [*] --> Waiting
    Waiting --> CallingService: start request
    CallingService --> Success: service responds
    CallingService --> Waiting: retry after failure
    Success --> [*]`
            : `sequenceDiagram
    participant User
    participant Frontend
    participant API as API Gateway
    participant AI as AI Service

    User->>Frontend: Send message
    Frontend->>API: POST /api/chat
    loop retry up to 3 times
        API->>AI: Forward message
        AI-->>API: Response or error
    end
    API-->>Frontend: Final response
    Frontend-->>User: Display result`,
        summary: "The diagram includes a retry loop around the service call.",
        changeList: ["Added retry loop", "Kept the final response path visible"],
        railEvents
      };
    }

    return {
      diagramType: session.diagram.diagramType,
      nextSource: session.diagram.source,
      summary: session.diagram.summary,
      changeList: ["Kept the current diagram because the fallback model could not infer a specific change"],
      railEvents
    };
  }
}

function toIntent(candidate: IntentCandidate, request: AnalyzeRequest): HiveIntent {
  return {
    id: createIntentId(candidate.canonicalText),
    canonicalText: candidate.canonicalText,
    displayText: candidate.displayText,
    complementText: candidate.complementText,
    confidence: candidate.confidence,
    commitMode: candidate.commitMode,
    transcriptRange: request.transcriptRange
  };
}

function createIntentId(canonicalText: string): string {
  return createHash("sha1").update(normalize(canonicalText)).digest("hex").slice(0, 14);
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}
