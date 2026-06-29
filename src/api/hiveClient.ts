import {
  AnalyzeResponseSchema,
  ApplyResponseSchema,
  ProposeResponseSchema,
  type AnalyzeRequest,
  type AnalyzeResponse,
  type ApplyRequest,
  type ApplyResponse,
  type ProposeRequest,
  type ProposeResponse
} from "../../shared/hiveSchemas";

export class HiveApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly payload: unknown
  ) {
    super(message);
    this.name = "HiveApiError";
  }
}

export async function analyzeHive(request: AnalyzeRequest): Promise<AnalyzeResponse> {
  const response = await fetch("/api/hive/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request)
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new HiveApiError("Analyze request failed", response.status, payload);
  }

  return AnalyzeResponseSchema.parse(payload);
}

export async function proposeHiveDiagram(request: ProposeRequest): Promise<ProposeResponse> {
  const response = await fetch("/api/hive/propose", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request)
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new HiveApiError("Proposal request failed", response.status, payload);
  }

  return ProposeResponseSchema.parse(payload);
}

export async function applyHiveSuggestion(request: ApplyRequest): Promise<ApplyResponse> {
  const response = await fetch("/api/hive/apply", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request)
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new HiveApiError("Apply request failed", response.status, payload);
  }

  return ApplyResponseSchema.parse(payload);
}
