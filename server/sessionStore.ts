import type { HiveIntent } from "../shared/hiveSchemas";
import type { DiagramSuggestion } from "../shared/hiveSchemas";
import { createDiagramDocument } from "./diagramDocument";
import type { DiagramDocument } from "../shared/hiveSchemas";

export interface HiveSession {
  id: string;
  createdAt: number;
  updatedAt: number;
  diagram: DiagramDocument;
  acceptedIntents: HiveIntent[];
  pendingSuggestions: DiagramSuggestion[];
}

export class SessionStore {
  private readonly sessions = new Map<string, HiveSession>();

  constructor(private readonly ttlMs = 1000 * 60 * 60) {}

  get(sessionId: string): HiveSession {
    this.cleanup();
    const existing = this.sessions.get(sessionId);

    if (existing) {
      existing.updatedAt = Date.now();
      return existing;
    }

    const session: HiveSession = {
      id: sessionId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      diagram: createDiagramDocument(),
      acceptedIntents: [],
      pendingSuggestions: []
    };
    this.sessions.set(sessionId, session);
    return session;
  }

  private cleanup(): void {
    const cutoff = Date.now() - this.ttlMs;

    for (const [id, session] of this.sessions) {
      if (session.updatedAt < cutoff) {
        this.sessions.delete(id);
      }
    }
  }
}
