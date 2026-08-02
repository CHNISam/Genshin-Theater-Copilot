/**
 * 赛季配置校验。分为两层：
 *  - schema 校验（结构）
 *  - 语义校验（引用完整性、规则一致性、可信度门槛）
 *
 * 只有 `canPublish === true` 的草稿才允许进入 published。
 */
import type { SeasonConfig, Confidence, Difficulty } from "../domain/types";
import { CONFIDENCE_RANK, DIFFICULTY_LABEL } from "../domain/types";
import { seasonConfigSchema } from "./schema";
import { supportedDifficulties } from "./resolve";

export type IssueSeverity = "error" | "warning" | "info";

export interface ValidationIssue {
  severity: IssueSeverity;
  code: string;
  path: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  /** 是否允许从 draft/review 进入 published。 */
  canPublish: boolean;
  issues: ValidationIssue[];
  season?: SeasonConfig;
}

export interface ValidateOptions {
  /** 已知角色 id，用于引用完整性检查。 */
  knownCharacterIds?: Set<string>;
  /** 发布所需的最低可信度，默认 medium。 */
  minimumPublishConfidence?: Confidence;
}

function err(code: string, path: string, message: string): ValidationIssue {
  return { severity: "error", code, path, message };
}
function warn(code: string, path: string, message: string): ValidationIssue {
  return { severity: "warning", code, path, message };
}

export function validateSeason(
  raw: unknown,
  options: ValidateOptions = {},
): ValidationResult {
  const parsed = seasonConfigSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      canPublish: false,
      issues: parsed.error.issues.map((i) =>
        err("schema", i.path.join("."), i.message),
      ),
    };
  }

  const season = parsed.data as SeasonConfig;
  const issues: ValidationIssue[] = [];
  const minConfidence = options.minimumPublishConfidence ?? "medium";
  const minRank = CONFIDENCE_RANK[minConfidence];

  /* ---- 时间 ---- */
  const start = Date.parse(season.startsAt);
  const end = Date.parse(season.endsAt);
  if (Number.isNaN(start)) issues.push(err("bad-date", "startsAt", "开始时间无法解析"));
  if (Number.isNaN(end)) issues.push(err("bad-date", "endsAt", "结束时间无法解析"));
  if (!Number.isNaN(start) && !Number.isNaN(end) && end <= start) {
    issues.push(err("bad-range", "endsAt", "结束时间必须晚于开始时间"));
  }

  /* ---- 逐难度校验 ---- *
   * 每个难度是独立的一套结构：关卡顺位、幕数、首领幕位都只在本难度内自洽即可。
   * 但关卡 id 要求**全季唯一**——局内状态（stageOverrides、currentStageId）按 id 存，
   * 跨难度重名会让存档在切换难度后指向错误的关卡。
   */
  const stageIdOwner = new Map<string, Difficulty>();

  for (const difficulty of supportedDifficulties(season)) {
    const pack = season.difficulties[difficulty]!;
    const at = `difficulties.${difficulty}`;
    const orders = new Set<number>();
    const localStageIds = new Set<string>();

    for (const stage of pack.stages) {
      const owner = stageIdOwner.get(stage.id);
      if (owner !== undefined) {
        issues.push(
          err(
            "duplicate-stage-id",
            `${at}.stages.${stage.id}`,
            owner === difficulty
              ? "关卡 id 重复"
              : `关卡 id 与「${DIFFICULTY_LABEL[owner]}」难度重复，关卡 id 必须全季唯一`,
          ),
        );
      }
      stageIdOwner.set(stage.id, difficulty);
      localStageIds.add(stage.id);

      if (orders.has(stage.order)) {
        issues.push(
          err("duplicate-order", `${at}.stages.${stage.id}.order`, `第 ${stage.order} 顺位重复`),
        );
      }
      orders.add(stage.order);

      if (stage.type === "boss" && stage.hardRequirements.length === 0) {
        issues.push(
          warn(
            "boss-without-mechanic",
            `${at}.stages.${stage.id}.hardRequirements`,
            "首领关未记录任何硬机制，求解器将无法为其预留机制角色",
          ),
        );
      }
      if (stage.hardRequirements.length > 0 && stage.sourceRecords.length === 0) {
        issues.push(
          err(
            "mechanic-without-source",
            `${at}.stages.${stage.id}.sourceRecords`,
            "声明了硬机制却没有任何来源记录",
          ),
        );
      }
      if (CONFIDENCE_RANK[stage.confidence] < minRank && stage.hardRequirements.length > 0) {
        issues.push(
          warn(
            "low-confidence-mechanic",
            `${at}.stages.${stage.id}.confidence`,
            `硬机制可信度为 ${stage.confidence}，低于发布门槛 ${minConfidence}，需要人工复核`,
          ),
        );
      }
    }

    /* ---- 规则一致性（本难度内） ---- */
    const rules = pack.rules;
    const expectedStages = rules.mainActCount + rules.tabletChallengeCount;
    if (pack.stages.length !== expectedStages) {
      issues.push(
        err(
          "stage-count-mismatch",
          `${at}.stages`,
          `关卡数量 ${pack.stages.length} 与规则声明的 ${rules.mainActCount}+${rules.tabletChallengeCount} 不一致`,
        ),
      );
    }
    const tablets = pack.stages.filter((s) => s.type === "tablet").length;
    if (tablets !== rules.tabletChallengeCount) {
      issues.push(
        err(
          "tablet-count-mismatch",
          `${at}.stages`,
          `圣牌挑战关卡数 ${tablets} 与规则声明的 ${rules.tabletChallengeCount} 不一致`,
        ),
      );
    }
    for (const bossOrder of rules.bossActOrders) {
      const stage = pack.stages.find((s) => s.order === bossOrder);
      if (!stage) {
        issues.push(
          err(
            "missing-boss-stage",
            `${at}.stages`,
            `规则声明第 ${bossOrder} 幕为首领关，但缺少该关卡`,
          ),
        );
      } else if (stage.type !== "boss") {
        issues.push(
          err(
            "boss-type-mismatch",
            `${at}.stages.${stage.id}.type`,
            `第 ${bossOrder} 幕应为 boss，实际为 ${stage.type}`,
          ),
        );
      }
    }

    /* ---- 首领引用（只能引用本难度的关卡） ---- */
    for (const boss of pack.bosses) {
      if (boss.stageId && !localStageIds.has(boss.stageId)) {
        issues.push(
          err(
            "unknown-stage-ref",
            `${at}.bosses.${boss.id}.stageId`,
            `引用了本难度不存在的关卡 ${boss.stageId}`,
          ),
        );
      }
    }
  }

  /* ---- 角色引用 ---- */
  const known = options.knownCharacterIds;
  if (known) {
    for (const id of [...season.openingCharacterIds, ...season.specialGuestIds]) {
      if (!known.has(id)) {
        issues.push(
          err("unknown-character", "openingCharacterIds", `角色数据中不存在 ${id}`),
        );
      }
    }
  }

  /* ---- 祝福 ---- */
  for (const buff of season.buffs) {
    const levels = buff.levels.map((l) => l.level).sort((a, b) => a - b);
    for (let i = 0; i < levels.length; i += 1) {
      if (levels[i] !== i + 1) {
        issues.push(
          err("buff-level-gap", `buffs.${buff.id}.levels`, "祝福等级必须从 1 开始且连续"),
        );
        break;
      }
    }
    for (const branch of buff.branches) {
      if (!levels.some((l) => l === branch.level)) {
        issues.push(
          err(
            "branch-level-missing",
            `buffs.${buff.id}.branches.${branch.id}`,
            `分支挂在不存在的等级 ${branch.level} 上`,
          ),
        );
      }
    }
  }

  /* ---- 未解决问题 ---- */
  const blocking = season.unresolvedQuestions.filter((q) => q.blocksPublish);
  for (const q of blocking) {
    issues.push(
      warn("blocking-question", `unresolvedQuestions.${q.id}`, `阻塞发布的问题：${q.question}`),
    );
  }

  const hasError = issues.some((i) => i.severity === "error");
  return {
    ok: !hasError,
    canPublish: !hasError && blocking.length === 0,
    issues,
    season,
  };
}
