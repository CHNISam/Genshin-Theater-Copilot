import { describe, expect, it } from "vitest";
import { checkRequirement } from "../src/solver/mechanics";
import { evaluateTeam, searchTeams, weightsForStage } from "../src/solver/team";
import { apply, char, heal, member, season, stage } from "./fixtures";

describe("硬机制判定", () => {
  it("3. 不满足 Boss 硬机制的高伤队必须被淘汰", () => {
    const bossStage = stage({
      id: "boss",
      order: 1,
      type: "boss",
      damagePressure: 4,
      hardRequirements: [
        {
          type: "shield-break",
          shieldElement: "hydro",
          effectiveElements: ["cryo"],
          minimumEfficiency: 2.5,
        },
      ],
    });
    const team = [
      member(char({ id: "big-dps", baseDamage: 10, element: "electro", capabilities: [apply("electro", "high")] })),
      member(char({ id: "big-2", baseDamage: 9, element: "electro", capabilities: [apply("electro", "high")] })),
      member(char({ id: "big-3", baseDamage: 8, element: "electro", capabilities: [apply("electro", "medium")] })),
      member(char({ id: "big-4", baseDamage: 8, element: "electro", capabilities: [apply("electro", "medium")] })),
    ];

    const result = evaluateTeam(team, {
      season: season([bossStage]),
      stage: bossStage,
      buffLevels: {},
    });

    expect(result.feasible).toBe(false);
    expect(result.rejections.join()).toContain("未满足硬机制");
  });

  it("4. 满足机制的较低伤队优先于不满足机制的高伤队", () => {
    const bossStage = stage({
      id: "boss",
      order: 1,
      type: "boss",
      damagePressure: 3,
      hardRequirements: [
        {
          type: "shield-break",
          shieldElement: "hydro",
          effectiveElements: ["cryo"],
          minimumEfficiency: 2.5,
        },
      ],
    });

    const breaker = char({
      id: "breaker",
      baseDamage: 4,
      element: "cryo",
      capabilities: [apply("cryo", "high", 4)],
    });
    const highDamage = Array.from({ length: 4 }, (_, i) =>
      char({
        id: `heavy-${i}`,
        baseDamage: 10,
        element: "electro",
        capabilities: [apply("electro", "high")],
      }),
    );
    const lowSupport = Array.from({ length: 3 }, (_, i) =>
      char({ id: `weak-${i}`, baseDamage: 2, element: "cryo", capabilities: [apply("cryo", "low", 2)] }),
    );

    const pool = [breaker, ...highDamage, ...lowSupport].map((c) => member(c));
    const { feasible } = searchTeams(pool, {
      season: season([bossStage]),
      stage: bossStage,
      buffLevels: {},
    });

    expect(feasible.length).toBeGreaterThan(0);
    for (const team of feasible) {
      expect(team.memberIds).toContain("breaker");
    }
  });

  it("5. 高频附着需求不能被同元素低频角色误判满足", () => {
    const lowFreqTeam = [
      member(char({ id: "low-1", element: "cryo", capabilities: [apply("cryo", "low", 5)] })),
      member(char({ id: "low-2", element: "cryo", capabilities: [apply("cryo", "low", 5)] })),
      member(char({ id: "low-3", element: "cryo", capabilities: [apply("cryo", "low", 5)] })),
      member(char({ id: "low-4", element: "cryo", capabilities: [apply("cryo", "low", 5)] })),
    ];

    const check = checkRequirement(lowFreqTeam, {
      type: "element",
      acceptedElements: ["cryo"],
      minimumApplicationRate: "high",
    });

    expect(check.satisfied).toBe(false);
    expect(check.detail).toContain("高");

    const withHighFreq = [
      member(char({ id: "high-1", element: "cryo", capabilities: [apply("cryo", "high", 3)] })),
      ...lowFreqTeam.slice(1),
    ];
    expect(
      checkRequirement(withHighFreq, {
        type: "element",
        acceptedElements: ["cryo"],
        minimumApplicationRate: "high",
      }).satisfied,
    ).toBe(true);
  });

  it("6. 全队持续扣血不能只检查单体治疗", () => {
    const singleHealer = char({
      id: "single-healer",
      capabilities: [heal("active-character", 5)],
      roles: ["healer"],
    });
    const partyHealer = char({
      id: "party-healer",
      capabilities: [heal("party-wide", 3)],
      roles: ["healer"],
    });
    const others = [
      char({ id: "o1", capabilities: [apply("cryo", "medium")] }),
      char({ id: "o2", capabilities: [apply("cryo", "medium")] }),
      char({ id: "o3", capabilities: [apply("cryo", "medium")] }),
    ];

    const requirement = { type: "healing", scope: "party-wide", minimumStrength: 2.5 } as const;

    const singleTeam = [singleHealer, ...others].map((c) => member(c));
    const partyTeam = [partyHealer, ...others].map((c) => member(c));

    expect(checkRequirement(singleTeam, requirement).satisfied).toBe(false);
    expect(checkRequirement(singleTeam, requirement).detail).toContain("单体治疗不计入");
    expect(checkRequirement(partyTeam, requirement).satisfied).toBe(true);
  });

  it("7. 守护关提高控制、聚怪、生存权重，降低纯单体输出权重", () => {
    const normal = stage({ id: "n", order: 1, type: "normal" });
    const defense = stage({ id: "d", order: 2, type: "defense" });

    const normalWeights = weightsForStage(normal);
    const defenseWeights = weightsForStage(defense);

    expect(defenseWeights.control).toBeGreaterThan(normalWeights.control);
    expect(defenseWeights.survival).toBeGreaterThan(normalWeights.survival);
    expect(defenseWeights.damage).toBeLessThan(normalWeights.damage);

    // 实际排序也必须变化：守护关应优先选出带聚怪/控制的队伍
    const controller = char({
      id: "controller",
      baseDamage: 2,
      capabilities: [
        { type: "grouping", strength: 5 },
        { type: "control", strength: 5 },
        heal("party-wide", 3),
      ],
      roles: ["control"],
    });
    const nukes = Array.from({ length: 4 }, (_, i) =>
      char({ id: `nuke-${i}`, baseDamage: 9, capabilities: [apply("cryo", "medium")] }),
    );
    const pool = [controller, ...nukes].map((c) => member(c));
    const defenseStage = stage({
      id: "defense",
      order: 1,
      type: "defense",
      controlValue: 4,
      survivalPressure: 3,
      damagePressure: 1.5,
    });

    const best = searchTeams(pool, {
      season: season([defenseStage]),
      stage: defenseStage,
      buffLevels: {},
    }).feasible[0];

    expect(best?.memberIds).toContain("controller");
  });
});

describe("稀缺资源消耗", () => {
  it("普通幕能用一个核心带三个挂件解决时，不应消耗两个核心", () => {
    const cores = [1, 2].map((i) =>
      char({
        id: `core-${i}`,
        name: `核心${i}`,
        baseDamage: 9,
        roles: ["main-dps"],
        capabilities: [apply("cryo", "high")],
      }),
    );
    const trinkets = Array.from({ length: 5 }, (_, i) =>
      char({ id: `trinket-${i}`, baseDamage: 1, capabilities: [apply("electro", "low", 2)] }),
    );
    const easyStage = stage({ id: "easy", order: 1, type: "normal", damagePressure: 2 });
    const pool = [
      ...cores.map((c) => member(c, "core")),
      ...trinkets.map((c) => member(c, "trinket")),
    ];

    const best = searchTeams(pool, {
      season: season([easyStage]),
      stage: easyStage,
      buffLevels: {},
    }).feasible[0];

    expect(best).toBeDefined();
    const usedCores = best!.memberIds.filter((id) => id.startsWith("core-"));
    expect(usedCores).toHaveLength(1);
  });
});

describe("指定必选成员的队伍搜索", () => {
  it("require 指定的角色必须出现在每个候选队伍中", () => {
    const star = char({
      id: "must-use",
      baseDamage: 9,
      roles: ["main-dps"],
      capabilities: [apply("cryo", "high")],
    });
    const others = Array.from({ length: 6 }, (_, i) =>
      char({ id: `other-${i}`, baseDamage: 3, capabilities: [apply("electro", "medium")] }),
    );
    // 简单关卡：不加 require 时，过剩惩罚会让最强核心落选
    const easyStage = stage({ id: "easy", order: 1, type: "normal", damagePressure: 2 });
    const pool = [member(star, "core"), ...others.map((c) => member(c, "usable"))];
    const ctx = { season: season([easyStage]), stage: easyStage, buffLevels: {} };

    const withoutRequire = searchTeams(pool, ctx, { limit: 4 });
    expect(withoutRequire.feasible.every((t) => t.memberIds.includes("must-use"))).toBe(false);

    const withRequire = searchTeams(pool, ctx, { limit: 4, require: ["must-use"] });
    expect(withRequire.feasible.length).toBeGreaterThan(0);
    for (const team of withRequire.feasible) {
      expect(team.memberIds).toContain("must-use");
      expect(team.memberIds).toHaveLength(4);
    }
  });
});
