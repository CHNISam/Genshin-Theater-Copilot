import { describe, expect, it } from "vitest";
import { runAssistant } from "../src/solver/assistant";
import { buildOpeningPlan } from "../src/solver/opening";
import { resolveStage } from "../src/solver/stages";
import { evaluateBuffOptions } from "../src/solver/buffs";
import { CHARACTERS, CHARACTER_BY_ID } from "../src/data/characters";
import { SEASON_2026_08 } from "../src/data/seasons/2026-08";
import type { BuffConfig, SeasonConfig } from "../src/domain/types";
import { apply, char, characterMap, fillers, heal, member, rosterOf, runState, season, stage } from "./fixtures";

const TEST_BUFF: BuffConfig = {
  id: "superconduct",
  name: "超导",
  reactionId: "superconduct",
  confidence: "high",
  sourceRecords: [],
  levels: [
    {
      level: 1,
      description: "基础增益",
      value: { mechanicValue: 0, damageValue: 3, controlValue: 0, buffValue: 1 },
      cost: 1,
    },
  ],
  branches: [],
};

function deadEndScenario() {
  const savior = char({
    id: "savior",
    element: "cryo",
    baseDamage: 6,
    capabilities: [apply("cryo", "high", 5), { type: "custom", mechanicId: "special-gimmick", strength: 4 }],
  });
  const pool = [...fillers(8, "cryo"), ...fillers(4, "electro")];
  const stages = [
    stage({ id: "act-1", order: 1, damagePressure: 1 }),
    stage({
      id: "act-2",
      order: 2,
      type: "boss",
      fixed: true,
      damagePressure: 2,
      hardRequirements: [{ type: "custom", mechanicId: "special-gimmick", minimumStrength: 2 }],
    }),
  ];
  const config: SeasonConfig = season(stages, { buffs: [TEST_BUFF] });
  const all = [...pool, savior];
  const state = runState(config, all, {
    unlockedCharacterIds: pool.map((p) => p.id),
    eventCandidates: [
      { kind: "character", characterId: "savior", cost: 2 },
      { kind: "buff", buffId: "superconduct", targetLevel: 1, cost: 1 },
    ],
  });
  return { config, all, state, savior };
}

describe("局内助手", () => {
  it("13. 未来两场无解时，角色事件优先于普通祝福", () => {
    const { config, all, state } = deadEndScenario();
    const output = runAssistant({
      season: config,
      roster: rosterOf(all, "usable"),
      characters: characterMap(all),
      state,
    });

    expect(output.safety.safe).toBe(false);
    expect(output.eventRecommendation?.candidate.kind).toBe("character");
    expect(output.eventRecommendation?.reasons.join()).toMatch(/机制|路线|安全线/);

    const buffOption = output.rejectedEvents.find((e) => e.candidate.kind === "buff");
    expect(buffOption).toBeDefined();
    expect(buffOption!.score).toBeLessThan(output.eventRecommendation!.score);
  });

  it("13b. 关键缺口无法由当前候选解决时才建议刷新", () => {
    const { config, all, state } = deadEndScenario();
    const withoutSavior = {
      ...state,
      eventCandidates: [{ kind: "buff", buffId: "superconduct", targetLevel: 1, cost: 1 } as const],
    };
    const output = runAssistant({
      season: config,
      roster: rosterOf(all, "usable"),
      characters: characterMap(all),
      state: withoutSavior,
    });
    expect(output.shouldRefresh.recommended).toBe(true);
    expect(output.shouldRefresh.reason).toContain("关键缺口");
  });

  it("13c. 还没有录入事件候选时，刷新建议不能自相矛盾", () => {
    const { config, all, state } = deadEndScenario();
    const noCandidates = { ...state, eventCandidates: [] };
    const output = runAssistant({
      season: config,
      roster: rosterOf(all, "usable"),
      characters: characterMap(all),
      state: noCandidates,
    });

    expect(output.shouldRefresh.recommended).toBe(false);
    // 不得在"不建议刷新"的同时给出"值得消耗一次刷新"的理由
    expect(output.shouldRefresh.reason).not.toContain("值得消耗");
    expect(output.shouldRefresh.reason).toContain("候选");
  });

  it("15. 局内实际敌人信息覆盖开局基准配置", () => {
    const base = stage({
      id: "act-1",
      order: 1,
      type: "normal",
      damagePressure: 2,
      survivalPressure: 1,
      confidence: "medium",
    });
    const config = season([base]);
    const bases = fillers(6, "cryo");
    const state = runState(config, bases, {
      stageOverrides: {
        "act-1": {
          stageId: "act-1",
          source: "user-confirmed",
          confidence: "confirmed",
          patch: {
            type: "defense",
            survivalPressure: 4,
            hardRequirements: [{ type: "healing", scope: "party-wide", minimumStrength: 2.5 }],
          },
        },
      },
    });

    const resolved = resolveStage(base, state);
    expect(resolved.type).toBe("defense");
    expect(resolved.survivalPressure).toBe(4);
    expect(resolved.hardRequirements).toHaveLength(1);
    expect(resolved.confidence).toBe("confirmed");
  });

  it("17. 用户纠正识别结果后立即重算", () => {
    const healer = char({ id: "healer", roles: ["healer"], capabilities: [heal("party-wide", 4)] });
    const bases = [healer, ...fillers(6, "cryo")];
    const tabletStage = stage({
      id: "tablet",
      order: 1,
      type: "tablet",
      fixed: true,
      survivalPressure: 4,
      damagePressure: 2,
      hardRequirements: [{ type: "healing", scope: "party-wide", minimumStrength: 2.5 }],
    });
    const config = season([tabletStage]);
    const roster = rosterOf(bases);
    const characters = characterMap(bases);

    const before = runAssistant({
      season: config,
      roster,
      characters,
      state: runState(config, bases),
    });
    expect(before.primaryPlan?.team.memberIds).toContain("healer");

    // 用户纠正：该奶妈其实耐力已经用完
    const corrected = runAssistant({
      season: config,
      roster,
      characters,
      state: runState(config, bases, { vigor: { healer: 0 } }),
    });
    expect(corrected.primaryPlan?.team.memberIds ?? []).not.toContain("healer");
    expect(corrected.primaryPlan).toBeUndefined();
    expect(corrected.notes.join()).toContain("降级方案");
  });

  it("19. 不输出无依据的精确概率，只输出路线数量与风险等级", () => {
    const { config, all, state } = deadEndScenario();
    const output = runAssistant({
      season: config,
      roster: rosterOf(all, "usable"),
      characters: characterMap(all),
      state,
    });

    const text = JSON.stringify(output);
    expect(text).not.toMatch(/概率|几率|probability/);
    expect(["low", "medium", "high"]).toContain(output.safety.fullRunDiversity.risk);
    expect(typeof output.safety.fullRunDiversity.routeCount).toBe("number");
  });
});

describe("开局规划", () => {
  it("18. 不录入详细装备也能完成基础规划", () => {
    const roster = {
      characters: [
        { characterId: "skirk", tier: "core" as const },
        { characterId: "flins", tier: "core" as const },
        { characterId: "ayaka", tier: "core" as const },
        { characterId: "ganyu", tier: "core" as const },
        { characterId: "yelan", tier: "usable" as const },
        { characterId: "aino", tier: "usable" as const },
        { characterId: "xingqiu", tier: "usable" as const },
        { characterId: "furina", tier: "usable" as const },
        { characterId: "barbara", tier: "usable" as const },
        { characterId: "layla", tier: "usable" as const },
        { characterId: "diona", tier: "usable" as const },
        { characterId: "charlotte", tier: "usable" as const },
        { characterId: "qiqi", tier: "usable" as const },
        { characterId: "beidou", tier: "trinket" as const },
        { characterId: "fischl", tier: "trinket" as const },
        { characterId: "kaeya", tier: "trinket" as const },
        { characterId: "mika", tier: "trinket" as const },
        { characterId: "dori", tier: "trinket" as const },
        { characterId: "kuki-shinobu", tier: "trinket" as const },
        { characterId: "olorun", tier: "usable" as const },
      ],
      supportGuestCandidates: ["sandonie", "neuvillette"],
    };

    // 没有任何 constellation / weaponQuality / talentLevel
    for (const c of roster.characters) {
      expect(Object.keys(c)).toEqual(["characterId", "tier"]);
    }

    const plan = buildOpeningPlan({
      season: SEASON_2026_08,
      roster,
      characters: CHARACTER_BY_ID,
    });

    expect(plan.coreModules.length).toBeGreaterThan(0);
    expect(plan.supportGuestRanking).toHaveLength(2);
    expect(plan.bossPlans.length).toBe(4);
    expect(plan.notes.join()).toContain("初始资源预算");
  });

  it("助演评分必须解释差异，而不是只看单角色强度", () => {
    const roster = {
      characters: CHARACTERS.filter((c) =>
        ["skirk", "flins", "ayaka", "ganyu", "yelan", "aino", "xingqiu", "furina", "barbara", "layla", "diona", "charlotte", "qiqi", "beidou", "fischl", "kaeya", "mika", "dori", "olorun"].includes(c.id),
      ).map((c) => ({ characterId: c.id, tier: "usable" as const })),
      supportGuestCandidates: ["sandonie", "neuvillette"],
    };
    const plan = buildOpeningPlan({
      season: SEASON_2026_08,
      roster,
      characters: CHARACTER_BY_ID,
    });

    for (const evaluation of plan.supportGuestRanking) {
      expect(evaluation.reasons.length).toBeGreaterThan(0);
    }
    // 两个候选都必须被评估，不能被规则硬编码淘汰
    expect(plan.supportGuestRanking.map((s) => s.characterId).sort()).toEqual([
      "neuvillette",
      "sandonie",
    ]);
  });
});

describe("祝福规划", () => {
  it("14. 不同账号产生不同的祝福优先级", () => {
    const cryoElectro = [
      char({ id: "ce-1", element: "cryo", capabilities: [apply("cryo", "high")] }),
      char({ id: "ce-2", element: "electro", capabilities: [apply("electro", "high")] }),
      char({ id: "ce-3", element: "cryo", capabilities: [apply("cryo", "medium")] }),
      char({ id: "ce-4", element: "electro", capabilities: [apply("electro", "medium")] }),
    ].map((c) => member(c));

    const hydroCryo = [
      char({ id: "hc-1", element: "hydro", capabilities: [apply("hydro", "high")] }),
      char({ id: "hc-2", element: "cryo", capabilities: [apply("cryo", "high")] }),
      char({ id: "hc-3", element: "hydro", capabilities: [apply("hydro", "medium")] }),
      char({ id: "hc-4", element: "cryo", capabilities: [apply("cryo", "medium")] }),
    ].map((c) => member(c));

    const input = {
      season: SEASON_2026_08,
      remainingStages: SEASON_2026_08.stages,
      buffLevels: {},
      blossoms: 10,
    };

    const rankA = evaluateBuffOptions({ ...input, availableMembers: cryoElectro });
    const rankB = evaluateBuffOptions({ ...input, availableMembers: hydroCryo });

    expect(rankA[0]!.buffId).toBe("superconduct");
    expect(rankB[0]!.buffId).toBe("frozen");
    expect(rankA[0]!.buffId).not.toBe(rankB[0]!.buffId);

    // 无法触发的反应收益必须归零，并说明原因
    const electroChargedForA = rankA.find((b) => b.buffId === "electro-charged")!;
    expect(electroChargedForA.value.damageValue).toBe(0);
    expect(electroChargedForA.explanation.join()).toContain("根本不触发");
  });
});
