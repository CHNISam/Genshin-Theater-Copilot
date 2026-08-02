import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { validateSeason } from "../src/season/validate";
import { transitionSeason, diffSeasons } from "../src/season/lifecycle";
import { buildResearchPrompt, extractJson, reviewDraft } from "../src/season/research";
import {
  isDifficultySupported,
  resolveSeason,
  supportedDifficulties,
  tryResolveSeason,
  UnsupportedDifficultyError,
} from "../src/season/resolve";
import { SEASON_2026_08 } from "../src/data/seasons/2026-08";
import { CHARACTERS, CHARACTER_BY_ID } from "../src/data/characters";
import type { SeasonConfig, StageConfig } from "../src/domain/types";

const knownCharacterIds = new Set(CHARACTER_BY_ID.keys());

/** 改写关卡表，保留赛季包其余部分。关卡是全难度共享的一份。 */
function withStages(
  base: SeasonConfig,
  map: (stage: StageConfig) => StageConfig,
): SeasonConfig {
  return { ...base, stages: base.stages.map(map) };
}

describe("赛季研究与发布流程", () => {
  it("内置赛季包本身通过校验", () => {
    const result = validateSeason(SEASON_2026_08, { knownCharacterIds });
    const errors = result.issues.filter((i) => i.severity === "error");
    expect(errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("20. 赛季研究草稿未通过验证时不能发布", () => {
    const broken = withStages(SEASON_2026_08, (s) =>
      s.id === "act-8" ? { ...s, sourceRecords: [] } : s,
    );
    broken.status = "draft";

    const validation = validateSeason(broken, { knownCharacterIds });
    expect(validation.ok).toBe(false);
    expect(validation.canPublish).toBe(false);
    expect(validation.issues.map((i) => i.code)).toContain("mechanic-without-source");

    const draft: SeasonConfig = { ...(broken as SeasonConfig), status: "review" };
    const transition = transitionSeason(draft, "published", { knownCharacterIds });
    expect(transition.ok).toBe(false);
    expect(transition.season).toBeUndefined();
  });

  it("20b. 状态机不允许 draft 直接跳到 published", () => {
    const draft: SeasonConfig = { ...SEASON_2026_08, status: "draft" };
    const jump = transitionSeason(draft, "published", { knownCharacterIds });
    expect(jump.ok).toBe(false);
    expect(jump.reason).toContain("不允许的状态迁移");
  });

  it("21. 来源冲突必须保留并进入审核，不得被自动消解", () => {
    const withConflict: SeasonConfig = {
      ...SEASON_2026_08,
      status: "review",
      unresolvedQuestions: [
        {
          id: "conflict-1",
          question: "第 8 幕护盾是否必须用冰破除？",
          conflictingClaims: [
            { claim: "必须用冰", source: "攻略 A", confidence: "medium" },
            { claim: "任何高频元素都可以", source: "实战 B", confidence: "low" },
          ],
          blocksPublish: true,
        },
      ],
    };

    const validation = validateSeason(withConflict, { knownCharacterIds });
    // 结构本身没问题，但存在阻塞性冲突 → 不可发布
    expect(validation.ok).toBe(true);
    expect(validation.canPublish).toBe(false);
    expect(validation.issues.map((i) => i.code)).toContain("blocking-question");

    // 冲突原样保留，两种说法都还在
    expect(validation.season!.unresolvedQuestions[0]!.conflictingClaims).toHaveLength(2);

    const transition = transitionSeason(withConflict, "published", { knownCharacterIds });
    expect(transition.ok).toBe(false);
    expect(transition.reason).toContain("人工审核");
  });

  it("研究 Prompt 包含全部强制约束", () => {
    const template = readFileSync(resolve(process.cwd(), "prompts/season-research.md"), "utf8");
    const prompt = buildResearchPrompt({
      seasonId: "2026-09",
      previousSeason: SEASON_2026_08,
      promptTemplate: template,
      requestedAt: "2026-08-02T00:00:00Z",
      focusQuestions: ["第 8 幕护盾阈值"],
    });

    for (const required of [
      "开幕角色",
      "特邀角色",
      "辉彩祝福",
      "圣牌挑战",
      "硬机制",
      "官方确认",
      "不输出没有依据的精确概率",
      "不得自行消除冲突",
    ]) {
      expect(prompt).toContain(required);
    }
    expect(prompt).toContain("2026-09");
    expect(prompt).toContain("第 8 幕护盾阈值");
  });

  it("导入 Agent 输出：能剥离 markdown 代码围栏并给出差异摘要", () => {
    const next: SeasonConfig = {
      ...withStages(SEASON_2026_08, (s) =>
        s.id === "act-8"
          ? {
              ...s,
              hardRequirements: [
                {
                  type: "shield-break" as const,
                  shieldElement: "hydro" as const,
                  effectiveElements: ["cryo" as const],
                  minimumEfficiency: 3.5,
                },
              ],
            }
          : s,
      ),
      id: "2026-09",
      status: "draft",
      openingCharacterIds: [...SEASON_2026_08.openingCharacterIds, "raiden"],
    };
    const agentOutput = ["前言说明", "```json", JSON.stringify({ season: next }), "```"].join("\n");
    const parsed = JSON.parse(extractJson(agentOutput)) as { season: unknown };

    const reviewed = reviewDraft(
      {
        seasonId: "2026-09",
        season: parsed.season,
        producedBy: "test",
        producedAt: "2026-08-02T00:00:00Z",
      },
      SEASON_2026_08,
      { knownCharacterIds },
    );

    expect(reviewed.validation.ok).toBe(true);
    expect(reviewed.diff.addedCharacters).toContain("raiden");
    expect(reviewed.diff.solverImpacting.join()).toContain("硬机制");
  });

  it("diff 会标出低可信度的机制项目", () => {
    const diff = diffSeasons(undefined, SEASON_2026_08);
    expect(diff.lowConfidenceItems.join()).toContain("第8幕");
  });

  it("角色数据引用完整：赛季引用的角色都存在", () => {
    const ids = new Set(CHARACTERS.map((c) => c.id));
    for (const id of [...SEASON_2026_08.openingCharacterIds, ...SEASON_2026_08.specialGuestIds]) {
      expect(ids.has(id)).toBe(true);
    }
  });

  it("prompts 目录包含研究与冲突复核两份 Prompt", () => {
    const files = readdirSync(resolve(process.cwd(), "prompts"));
    expect(files).toContain("season-research.md");
    expect(files).toContain("season-conflict-review.md");
  });
});

/*
 * 共享幕模型：五档难度共用同一份 10 幕关卡表，难度只决定
 * 「打到第几幕、含不含圣牌」。这里用真实赛季包锁定这一语义，
 * 防止有人再把关卡按难度复制成多份。
 */
describe("内置赛季包的共享幕语义", () => {
  it("关卡表只有一份：10 幕主线 + 2 场圣牌挑战", () => {
    const mainActs = SEASON_2026_08.stages.filter((s) => s.type !== "tablet");
    const tablets = SEASON_2026_08.stages.filter((s) => s.type === "tablet");
    expect(mainActs.map((s) => s.order).sort((a, b) => a - b)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
    expect(tablets).toHaveLength(2);
  });

  it("卓越解析出 10 幕、0 场圣牌", () => {
    const resolved = resolveSeason(SEASON_2026_08, "visionary");
    expect(resolved.difficulty).toBe("visionary");
    expect(resolved.rules.mainActCount).toBe(10);
    expect(resolved.rules.tabletChallengeCount).toBe(0);
    expect(resolved.stages).toHaveLength(10);
    expect(resolved.stages.every((s) => s.type !== "tablet")).toBe(true);
  });

  it("月谕解析出 10 幕 + 2 场圣牌", () => {
    const resolved = resolveSeason(SEASON_2026_08, "moonlit");
    expect(resolved.difficulty).toBe("moonlit");
    expect(resolved.rules.mainActCount).toBe(10);
    expect(resolved.rules.tabletChallengeCount).toBe(2);
    expect(resolved.stages).toHaveLength(12);
  });

  it("两档难度共用同一批主线幕对象，不是各自的副本", () => {
    const visionary = resolveSeason(SEASON_2026_08, "visionary");
    const moonlit = resolveSeason(SEASON_2026_08, "moonlit");
    const moonlitMain = moonlit.stages.filter((s) => s.type !== "tablet");
    expect(visionary.stages.map((s) => s.id)).toEqual(moonlitMain.map((s) => s.id));
    // 同一个对象引用：机制事实只有一份，改一处就是改全部。
    expect(visionary.stages[7]).toBe(moonlitMain[7]);
  });

  it("未录入的难度必须显式不可用，不得静默回退", () => {
    expect(supportedDifficulties(SEASON_2026_08)).toEqual(["visionary", "moonlit"]);
    for (const difficulty of ["light", "normal", "hard"] as const) {
      expect(isDifficultySupported(SEASON_2026_08, difficulty)).toBe(false);
      expect(() => resolveSeason(SEASON_2026_08, difficulty)).toThrow(UnsupportedDifficultyError);
      expect(tryResolveSeason(SEASON_2026_08, difficulty)).toBeUndefined();
    }
  });
});
