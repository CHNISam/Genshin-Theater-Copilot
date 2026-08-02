/**
 * 赛季配置校验。分为两层：
 *  - schema 校验（结构）
 *  - 语义校验（引用完整性、规则一致性、可信度门槛）
 *
 * 只有 `canPublish === true` 的草稿才允许进入 published。
 */
import type { SeasonConfig, Confidence } from "../domain/types";
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

  /* ---- 关卡（全难度共享的同一批事实，只校验一次） ---- */
  const orders = new Set<number>();
  const stageIds = new Set<string>();
  for (const stage of season.stages) {
    if (stageIds.has(stage.id)) {
      issues.push(err("duplicate-stage-id", `stages.${stage.id}`, "关卡 id 重复"));
    }
    stageIds.add(stage.id);

    // 圣牌挑战不占主线幕位，因此只对主线幕检查顺位唯一。
    if (stage.type !== "tablet") {
      if (orders.has(stage.order)) {
        issues.push(
          err("duplicate-order", `stages.${stage.id}.order`, `第 ${stage.order} 幕顺位重复`),
        );
      }
      orders.add(stage.order);
    }

    if (stage.type === "boss" && stage.hardRequirements.length === 0) {
      issues.push(
        warn(
          "boss-without-mechanic",
          `stages.${stage.id}.hardRequirements`,
          "首领关未记录任何硬机制，求解器将无法为其预留机制角色",
        ),
      );
    }
    if (stage.hardRequirements.length > 0 && stage.sourceRecords.length === 0) {
      issues.push(
        err(
          "mechanic-without-source",
          `stages.${stage.id}.sourceRecords`,
          "声明了硬机制却没有任何来源记录",
        ),
      );
    }
    if (CONFIDENCE_RANK[stage.confidence] < minRank && stage.hardRequirements.length > 0) {
      issues.push(
        warn(
          "low-confidence-mechanic",
          `stages.${stage.id}.confidence`,
          `硬机制可信度为 ${stage.confidence}，低于发布门槛 ${minConfidence}，需要人工复核`,
        ),
      );
    }
  }

  /* ---- 首领引用 ---- */
  for (const boss of season.bosses) {
    if (boss.stageId && !stageIds.has(boss.stageId)) {
      issues.push(
        err("unknown-stage-ref", `bosses.${boss.id}.stageId`, `引用了不存在的关卡 ${boss.stageId}`),
      );
    }
  }

  /* ---- 逐难度规则 ---- *
   * 难度只声明「打到第几幕、含不含圣牌」，所以校验的是它和共享关卡表对不对得上。
   */
  const mainActs = season.stages.filter((s) => s.type !== "tablet");
  const maxAct = mainActs.reduce((max, s) => Math.max(max, s.order), 0);
  const hasTablets = season.stages.some((s) => s.type === "tablet");

  for (const difficulty of supportedDifficulties(season)) {
    const rules = season.difficulties[difficulty]!;
    const at = `difficulties.${difficulty}`;

    if (rules.clearAtAct > maxAct) {
      issues.push(
        err(
          "clear-act-out-of-range",
          `${at}.clearAtAct`,
          `通关线为第 ${rules.clearAtAct} 幕，但赛季只录入到第 ${maxAct} 幕`,
        ),
      );
    }

    // 通关线之前的每一幕都必须存在，否则求解器会在中途撞空。
    for (let order = 1; order <= Math.min(rules.clearAtAct, maxAct); order += 1) {
      if (!mainActs.some((s) => s.order === order)) {
        issues.push(
          err("missing-act", "stages", `缺少第 ${order} 幕，${DIFFICULTY_LABEL[difficulty]} 需要它`),
        );
      }
    }

    if (rules.includesTablets && !hasTablets) {
      issues.push(
        err(
          "missing-tablet-stage",
          `${at}.includesTablets`,
          `${DIFFICULTY_LABEL[difficulty]} 声明含圣牌挑战，但赛季未录入任何圣牌关卡`,
        ),
      );
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
