/**
 * 赛季配置的运行时 schema。
 *
 * 任何来自 Agent 研究、外部 JSON 或用户导入的赛季数据，
 * 都必须先通过这里的校验才能进入产品，不得直接信任。
 */
import { z } from "zod";
import { ELEMENTS, REACTIONS } from "../domain/types";

export const elementSchema = z.enum(ELEMENTS);
export const reactionSchema = z.enum(REACTIONS);
export const rateSchema = z.enum(["low", "medium", "high"]);
export const confidenceSchema = z.enum(["confirmed", "high", "medium", "low"]);
export const evidenceTypeSchema = z.enum([
  "official-confirmed",
  "community-confirmed",
  "user-observed",
  "inferred",
  "unknown",
]);

export const sourceRecordSchema = z.object({
  title: z.string().min(1),
  sourceType: evidenceTypeSchema,
  url: z.string().url().optional(),
  publishedAt: z.string().optional(),
  accessedAt: z.string().min(1),
  excerpt: z.string().optional(),
  confidence: confidenceSchema,
});

export const unresolvedQuestionSchema = z.object({
  id: z.string().min(1),
  question: z.string().min(1),
  conflictingClaims: z
    .array(
      z.object({
        claim: z.string().min(1),
        source: z.string().min(1),
        confidence: confidenceSchema,
      }),
    )
    .default([]),
  blocksPublish: z.boolean(),
});

export const mechanicRequirementSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("element"),
    acceptedElements: z.array(elementSchema).min(1),
    minimumApplicationRate: rateSchema.optional(),
    note: z.string().optional(),
  }),
  z.object({
    type: z.literal("reaction"),
    acceptedReactions: z.array(reactionSchema).min(1),
    minimumTriggerRate: rateSchema.optional(),
    note: z.string().optional(),
  }),
  z.object({
    type: z.literal("shield-break"),
    shieldElement: elementSchema,
    effectiveElements: z.array(elementSchema).min(1),
    minimumEfficiency: z.number().min(0).max(5),
    note: z.string().optional(),
  }),
  z.object({
    type: z.literal("healing"),
    scope: z.enum(["active-character", "party-wide"]),
    minimumStrength: z.number().min(0).max(5),
    note: z.string().optional(),
  }),
  z.object({
    type: z.literal("control"),
    minimumStrength: z.number().min(0).max(5),
    note: z.string().optional(),
  }),
  z.object({
    type: z.literal("interrupt-resistance"),
    minimumStrength: z.number().min(0).max(5),
    note: z.string().optional(),
  }),
  z.object({
    type: z.literal("custom"),
    mechanicId: z.string().min(1),
    minimumStrength: z.number().min(0).max(5).optional(),
    note: z.string().optional(),
  }),
]);

export const mechanicRecommendationSchema = z.object({
  requirement: mechanicRequirementSchema,
  weight: z.number().min(0).max(1),
  reason: z.string().min(1),
});

export const stageSchema = z.object({
  id: z.string().min(1),
  order: z.number().int().min(1),
  name: z.string().min(1),
  type: z.enum(["normal", "boss", "defense", "survival", "tablet"]),
  fixed: z.boolean(),
  enemyIds: z.array(z.string()).default([]),
  hardRequirements: z.array(mechanicRequirementSchema).default([]),
  softRecommendations: z.array(mechanicRecommendationSchema).default([]),
  damagePressure: z.number().min(0).max(5),
  survivalPressure: z.number().min(0).max(5),
  controlValue: z.number().min(0).max(5),
  sourceRecords: z.array(sourceRecordSchema).default([]),
  confidence: confidenceSchema,
  note: z.string().optional(),
});

export const bossSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  stageId: z.string().optional(),
  hardMechanics: z.array(mechanicRequirementSchema).default([]),
  effectiveElements: z.array(elementSchema).default([]),
  effectiveReactions: z.array(reactionSchema).default([]),
  notRecommended: z
    .array(z.object({ approach: z.string().min(1), reason: z.string().min(1) }))
    .default([]),
  sourceRecords: z.array(sourceRecordSchema).default([]),
  confidence: confidenceSchema,
});

export const reactionValueSchema = z.object({
  mechanicValue: z.number().min(0).max(10),
  damageValue: z.number().min(0).max(10),
  controlValue: z.number().min(0).max(10),
  buffValue: z.number().min(0).max(10),
});

export const buffSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  reactionId: reactionSchema,
  levels: z
    .array(
      z.object({
        level: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
        description: z.string().min(1),
        value: reactionValueSchema,
        breakpoint: z.boolean().optional(),
        cost: z.number().min(0),
      }),
    )
    .min(1),
  branches: z
    .array(
      z.object({
        id: z.string().min(1),
        level: z.number().int().min(1).max(4),
        name: z.string().min(1),
        description: z.string().min(1),
        value: reactionValueSchema.partial(),
      }),
    )
    .default([]),
  sourceRecords: z.array(sourceRecordSchema).default([]),
  confidence: confidenceSchema,
  patchNote: z.string().optional(),
});

export const difficultySchema = z.enum(["light", "normal", "hard", "visionary", "moonlit"]);

export const seasonRuleOverridesSchema = z.object({
  defaultVigor: z.number().int().min(1).max(10),
  supportedDifficulties: z.array(difficultySchema).min(1),
  teamSize: z.number().int().min(1).max(8),
  mainActCount: z.number().int().min(1).max(20),
  tabletChallengeCount: z.number().int().min(0).max(5),
  bossActOrders: z.array(z.number().int().min(1)).default([]),
  supportGuestCountsForEntry: z.boolean(),
  initialRefreshes: z.number().int().min(0),
  note: z.string().optional(),
});

export const seasonConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  startsAt: z.string().min(1),
  endsAt: z.string().min(1),
  status: z.enum(["draft", "review", "published", "archived"]),

  allowedElements: z.array(elementSchema).min(1),
  openingCharacterIds: z.array(z.string()).default([]),
  specialGuestIds: z.array(z.string()).default([]),

  buffs: z.array(buffSchema).default([]),
  stages: z.array(stageSchema).min(1),
  bosses: z.array(bossSchema).default([]),

  ruleOverrides: seasonRuleOverridesSchema,
  sourceRecords: z.array(sourceRecordSchema).default([]),

  unresolvedQuestions: z.array(unresolvedQuestionSchema).default([]),
  dataVersion: z.number().int().min(1),
  generatedAt: z.string().min(1),
  reviewedAt: z.string().optional(),
});

export type SeasonConfigInput = z.input<typeof seasonConfigSchema>;
