import { z } from "zod";

export const TranscriptRangeSchema = z
  .object({
    startMs: z.number().nonnegative(),
    endMs: z.number().nonnegative()
  })
  .refine((range) => range.endMs >= range.startMs, {
    message: "endMs must be greater than or equal to startMs"
  });

export const RecentIntentSchema = z.object({
  id: z.string().min(1),
  canonicalText: z.string().min(1)
});

export const CommitModeSchema = z.enum(["instant", "boundary"]);

export const HiveIntentSchema = z.object({
  id: z.string().min(1),
  canonicalText: z.string().min(1),
  displayText: z.string().min(1),
  complementText: z.string().nullable().optional().default(null),
  confidence: z.number().min(0).max(1),
  commitMode: CommitModeSchema.optional().default("boundary"),
  transcriptRange: TranscriptRangeSchema
});

export const AnalyzeStatusSchema = z.enum(["none", "forming", "ready", "reject"]);

export const AnalyzeRequestSchema = z.object({
  sessionId: z.string().min(1),
  seq: z.number().int().nonnegative(),
  transcriptWindow: z.string(),
  transcriptRange: TranscriptRangeSchema,
  diagramSummary: z.string(),
  recentCommittedIntents: z.array(RecentIntentSchema).max(24)
});

export const AnalyzeResponseSchema = z.object({
  seq: z.number().int().nonnegative(),
  status: AnalyzeStatusSchema,
  intent: HiveIntentSchema.nullable().optional(),
  deferReason: z.string().nullable().optional()
});

export const DiagramTypeSchema = z.enum(["sequence", "state"]);

export const MermaidSourceSchema = z
  .string()
  .min(1)
  .max(14000)
  .refine((source) => {
    const firstLine = source.trim().split(/\r?\n/, 1)[0]?.trim();
    return firstLine === "sequenceDiagram" || firstLine === "stateDiagram-v2";
  }, "source must start with sequenceDiagram or stateDiagram-v2");

export const DiagramDocumentSchema = z.object({
  revision: z.number().int().nonnegative(),
  diagramType: DiagramTypeSchema,
  source: MermaidSourceSchema,
  summary: z.string().min(1).max(1200)
});

export const DiagramSuggestionSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-zA-Z0-9_-]+$/),
  baseRevision: z.number().int().nonnegative(),
  diagramType: DiagramTypeSchema,
  nextSource: MermaidSourceSchema,
  summary: z.string().min(1).max(1200),
  changeList: z.array(z.string().min(1).max(240)).min(1).max(6),
  intent: HiveIntentSchema
});

export const ProposeRequestSchema = z.object({
  sessionId: z.string().min(1),
  seq: z.number().int().nonnegative(),
  baseRevision: z.number().int().nonnegative(),
  intent: HiveIntentSchema
});

export const ProposeResponseSchema = z.object({
  seq: z.number().int().nonnegative(),
  suggestion: DiagramSuggestionSchema
});

export const ApplyRequestSchema = z.object({
  sessionId: z.string().min(1),
  seq: z.number().int().nonnegative(),
  suggestionId: z.string().min(1)
});

export const RailEventSchema = z.object({
  kind: z.enum(["intent", "complement"]),
  text: z.string().min(1)
});

export const ApplyResponseSchema = z.object({
  seq: z.number().int().nonnegative(),
  document: DiagramDocumentSchema,
  appliedSuggestionId: z.string().min(1),
  railEvents: z.array(RailEventSchema)
});

export const DiagramModelOutputSchema = z.object({
  diagramType: DiagramTypeSchema,
  nextSource: MermaidSourceSchema,
  summary: z.string().min(1).max(1200),
  changeList: z.array(z.string().min(1).max(240)).min(1).max(6),
  railEvents: z.array(RailEventSchema).max(4)
});

export type TranscriptRange = z.infer<typeof TranscriptRangeSchema>;
export type HiveIntent = z.infer<typeof HiveIntentSchema>;
export type AnalyzeRequest = z.infer<typeof AnalyzeRequestSchema>;
export type AnalyzeResponse = z.infer<typeof AnalyzeResponseSchema>;
export type DiagramType = z.infer<typeof DiagramTypeSchema>;
export type DiagramDocument = z.infer<typeof DiagramDocumentSchema>;
export type DiagramSuggestion = z.infer<typeof DiagramSuggestionSchema>;
export type ProposeRequest = z.infer<typeof ProposeRequestSchema>;
export type ProposeResponse = z.infer<typeof ProposeResponseSchema>;
export type ApplyRequest = z.infer<typeof ApplyRequestSchema>;
export type ApplyResponse = z.infer<typeof ApplyResponseSchema>;
export type DiagramModelOutput = z.infer<typeof DiagramModelOutputSchema>;
export type RailEvent = z.infer<typeof RailEventSchema>;
