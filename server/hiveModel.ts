import type { AnalyzeRequest, AnalyzeResponse, DiagramModelOutput, ProposeRequest } from "../shared/hiveSchemas";
import type { HiveSession } from "./sessionStore";

export interface HiveModelClient {
  analyze(request: AnalyzeRequest, session: HiveSession): Promise<AnalyzeResponse>;
  propose(request: ProposeRequest, session: HiveSession): Promise<DiagramModelOutput>;
}
