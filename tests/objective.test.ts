import { describe, expect, it } from "vitest";
import type { RunObjective } from "../src/domain/types";
import { remainingStages, futureStages } from "../src/solver/stages";
import { searchTeams } from "../src/solver/team";
import { computeReservations } from "../src/solver/reservations";
import { apply, char, fillers, heal, member, runState, season, stage } from "./fixtures";

function seasonWithTablets() {
  const stages = [
    stage({ id: "act-1", order: 1, damagePressure: 2 }),
    stage({ id: "act-2", order: 2, damagePressure: 3 }),
    stage({
      id: "tablet-1",
      order: 3,
      name: "圣牌挑战一",
      type: "tablet",
      fixed: true,
      survivalPressure: 4,
      damagePressure: 2,
      hardRequirements: [{ type: "healing", scope: "party-wide", minimumStrength: 2.5 }],
    }),
  ];
  return season(stages);
}

const CLEAR: RunObjective = { difficulty: "moonlit", goal: "clear" };
const WITH_TABLETS: RunObjective = { difficulty: "moonlit", goal: "clear-with-tablets" };
const FULL_STARS: RunObjective = { difficulty: "moonlit", goal: "full-stars" };

describe("目标与难度", () => {
  it("目标为「只求通关」时，圣牌挑战不纳入剩余关卡", () => {
    const config = seasonWithTablets();
    const bases = fillers(8, "cryo");

    const clearState = runState(config, bases, { objective: CLEAR });
    expect(remainingStages(config, clearState).map((s) => s.id)).toEqual(["act-1", "act-2"]);

    const tabletState = runState(config, bases, { objective: WITH_TABLETS });
    expect(remainingStages(config, tabletState).map((s) => s.id)).toEqual([
      "act-1",
      "act-2",
      "tablet-1",
    ]);
  });

  it("目标为「只求通关」时，不会为圣牌挑战预留角色", () => {
    const config = seasonWithTablets();
    const healer = char({ id: "only-healer", roles: ["healer"], capabilities: [heal("party-wide", 4)] });
    const bases = [healer, ...fillers(6, "cryo")];
    const members = bases.map((b) => member(b));

    const withTablets = runState(config, bases, { objective: WITH_TABLETS });
    const reservedForTablet = computeReservations({
      season: config,
      futureStages: futureStages(config, withTablets),
      unlockedMembers: members,
      vigor: withTablets.vigor,
    }).reservations;
    expect(reservedForTablet.some((r) => r.characterId === "only-healer")).toBe(true);

    const clearOnly = runState(config, bases, { objective: CLEAR });
    const reservedForClear = computeReservations({
      season: config,
      futureStages: futureStages(config, clearOnly),
      unlockedMembers: members,
      vigor: clearOnly.vigor,
    }).reservations;
    expect(reservedForClear).toHaveLength(0);
  });

  it("目标为「满星」时，提高输出要求并关闭过剩惩罚", () => {
    const strong = char({
      id: "strong",
      baseDamage: 9,
      roles: ["main-dps"],
      capabilities: [apply("cryo", "high")],
    });
    const weak = Array.from({ length: 6 }, (_, i) =>
      char({ id: `weak-${i}`, baseDamage: 2, capabilities: [apply("electro", "medium")] }),
    );
    const easyStage = stage({ id: "easy", order: 1, type: "normal", damagePressure: 2 });
    const config = season([easyStage]);
    const pool = [member(strong, "core"), ...weak.map((c) => member(c, "usable"))];

    // 只求通关：过剩惩罚生效，强核心被留下
    const clear = searchTeams(pool, {
      season: config,
      stage: easyStage,
      buffLevels: {},
      objective: CLEAR,
    }).feasible[0];
    expect(clear!.memberIds).not.toContain("strong");

    // 满星：明星挑战通常有速度/输出条件，此时不应再惩罚"过剩"
    const fullStars = searchTeams(pool, {
      season: config,
      stage: easyStage,
      buffLevels: {},
      objective: FULL_STARS,
    }).feasible[0];
    expect(fullStars!.memberIds).toContain("strong");
  });

  it("赛季包未录入该难度结构时必须显式暴露，不能假装支持", () => {
    const config = seasonWithTablets();
    const bases = fillers(8, "cryo");
    const state = runState(config, bases, {
      objective: { difficulty: "hard", goal: "clear" },
    });
    // 本期赛季包只描述了月谕结构
    expect(config.ruleOverrides.supportedDifficulties).toEqual(["moonlit"]);
    expect(config.ruleOverrides.supportedDifficulties).not.toContain(state.objective.difficulty);
  });
});
