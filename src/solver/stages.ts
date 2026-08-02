/**
 * 关卡解析。数据优先级：
 *   局内截图 / 用户确认信息 ＞ 已发布赛季固定配置 ＞ 赛季经验数据 ＞ 通用启发式
 * 因此实际观察到的敌人信息必须覆盖开局基准路线，而不是机械照抄。
 */
import type { RunObjective, RunState, ResolvedSeason, StageConfig } from "../domain/types";
import { CONFIDENCE_RANK } from "../domain/types";

export function resolveStage(stage: StageConfig, state: RunState): StageConfig {
  const override = state.stageOverrides[stage.id];
  if (!override) return stage;
  // 用户确认 > OCR > 赛季配置；同级时以观察为准。
  const overrideRank =
    override.source === "user-confirmed" ? 5 : CONFIDENCE_RANK[override.confidence];
  const baseRank = CONFIDENCE_RANK[stage.confidence];
  if (overrideRank < baseRank && override.source !== "user-confirmed") return stage;
  return {
    ...stage,
    ...override.patch,
    confidence: override.source === "user-confirmed" ? "confirmed" : override.confidence,
  };
}

/**
 * 目标是否要求打这一关。
 * 圣牌挑战不是通关前置，因此"只求通关"时整体排除，
 * 把耐力全部留给主线——这会实质改变预留与路线结论，所以目标必须由用户先选。
 */
export function stageRequiredByObjective(stage: StageConfig, objective: RunObjective): boolean {
  if (stage.type === "tablet" && !objective.tablets) return false;
  return true;
}

export function resolvedStages(season: ResolvedSeason, state: RunState): StageConfig[] {
  return [...season.stages]
    .sort((a, b) => a.order - b.order)
    .filter((s) => stageRequiredByObjective(s, state.objective))
    .map((s) => resolveStage(s, state));
}

export function currentStage(season: ResolvedSeason, state: RunState): StageConfig | undefined {
  return resolvedStages(season, state).find((s) => s.id === state.currentStageId);
}

/** 严格晚于当前关卡且尚未完成的关卡。 */
export function futureStages(season: ResolvedSeason, state: RunState): StageConfig[] {
  const all = resolvedStages(season, state);
  const current = all.find((s) => s.id === state.currentStageId);
  const done = new Set(state.completedStageIds);
  if (!current) return all.filter((s) => !done.has(s.id));
  return all.filter((s) => s.order > current.order && !done.has(s.id));
}

/** 当前关卡及之后所有未完成关卡。 */
export function remainingStages(season: ResolvedSeason, state: RunState): StageConfig[] {
  const current = currentStage(season, state);
  const rest = futureStages(season, state);
  return current ? [current, ...rest] : rest;
}
