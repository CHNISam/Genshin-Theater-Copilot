import { describe, expect, it } from "vitest";
import type { MechanicRequirement } from "../src/domain/types";
import {
  canReleaseReservation,
  computeReservations,
  elementScarcity,
  scarcityCosts,
  wouldConsumeReservedVigor,
} from "../src/solver/reservations";
import { searchTeams } from "../src/solver/team";
import { apply, char, fillers, heal, member, runState, season, stage } from "./fixtures";

const MECHANIC_REQ: MechanicRequirement = {
  type: "reaction",
  acceptedReactions: ["electro-charged"],
  minimumTriggerRate: "high",
};

/** 一个"唯一能满足水雷高频机制"的角色 + 一批无关角色。 */
function mechanicScenario() {
  const specialist = char({
    id: "mechanic-specialist",
    name: "机制专家",
    element: "electro",
    baseDamage: 8,
    capabilities: [
      apply("electro", "high", 4),
      { type: "reaction-enable", reactionId: "electro-charged", strength: 5, frequency: "high" },
    ],
  });
  const hydroSupport = char({
    id: "hydro-support",
    element: "hydro",
    baseDamage: 5,
    capabilities: [apply("hydro", "high", 4)],
  });
  const others = fillers(6, "cryo");

  const bosses = stage({
    id: "act-8",
    order: 8,
    name: "第8幕",
    type: "boss",
    fixed: true,
    damagePressure: 4,
    hardRequirements: [MECHANIC_REQ],
  });
  const earlier = [6, 7].map((order) =>
    stage({ id: `act-${order}`, order, name: `第${order}幕`, damagePressure: 2 }),
  );
  const config = season([...earlier, bosses]);
  const bases = [specialist, hydroSupport, ...others];
  return { specialist, hydroSupport, others, bases, config, earlier, bosses };
}

describe("关键角色预留", () => {
  it("8 & 10. 固定机制关的唯一解会被预留，不得在前置关耗尽", () => {
    const { bases, config, earlier, bosses, specialist } = mechanicScenario();
    const state = runState(config, bases, { currentStageId: "act-6" });
    const members = bases.map((b) => member(b));

    const { reservations } = computeReservations({
      season: config,
      futureStages: [earlier[1]!, bosses],
      unlockedMembers: members,
      vigor: state.vigor,
    });

    const mine = reservations.filter((r) => r.characterId === specialist.id);
    expect(mine.length).toBeGreaterThan(0);
    expect(mine[0]!.stageId).toBe("act-8");
    expect(mine[0]!.strictness).toBe("hard");
    expect(mine[0]!.stagesAway).toBeLessThanOrEqual(2);

    // 用掉一点耐力后再用一点，就会动到预留
    const tight = { ...state.vigor, [specialist.id]: 1 };
    const check = wouldConsumeReservedVigor(
      specialist.id,
      earlier[0]!,
      [earlier[1]!, bosses],
      computeReservations({
        season: config,
        futureStages: [earlier[1]!, bosses],
        unlockedMembers: members,
        vigor: tight,
      }).reservations,
      tight,
    );
    expect(check.blocked).toBe(true);
    expect(check.message).toContain("预留");
  });

  it("10b. 求解器在前置普通关会避开被预留的唯一机制角色", () => {
    const { bases, config, earlier, bosses, specialist } = mechanicScenario();
    const state = runState(config, bases, {
      currentStageId: "act-6",
      vigor: { [specialist.id]: 1 },
    });
    const members = bases.map((b) => member(b));
    const future = [earlier[1]!, bosses];
    const { reservations } = computeReservations({
      season: config,
      futureStages: future,
      unlockedMembers: members,
      vigor: state.vigor,
    });
    const costs = scarcityCosts({
      members,
      vigor: state.vigor,
      reservations,
      currentStage: earlier[0]!,
      futureStages: future,
    });

    const best = searchTeams(members, {
      season: config,
      stage: earlier[0]!,
      buffLevels: {},
      scarcityCost: costs,
    }).feasible[0];

    expect(best).toBeDefined();
    expect(best!.memberIds).not.toContain(specialist.id);
  });

  it("9. 获得可靠替代角色后，预留会被释放", () => {
    const { bases, config, earlier, bosses, specialist } = mechanicScenario();
    const alternatives = [1, 2].map((i) =>
      char({
        id: `alt-${i}`,
        element: "electro",
        baseDamage: 6,
        capabilities: [
          apply("electro", "high", 4),
          { type: "reaction-enable", reactionId: "electro-charged", strength: 4, frequency: "high" },
        ],
      }),
    );
    const withAlternatives = [...bases, ...alternatives];
    const state = runState(config, withAlternatives, { currentStageId: "act-6" });
    const members = withAlternatives.map((b) => member(b));

    const { reservations } = computeReservations({
      season: config,
      futureStages: [earlier[1]!, bosses],
      unlockedMembers: members,
      vigor: state.vigor,
    });

    expect(reservations.filter((r) => r.characterId === specialist.id)).toHaveLength(0);
  });

  it("9b. canReleaseReservation 只接受五种解除理由", () => {
    const { bases, config, earlier, bosses, specialist } = mechanicScenario();
    const state = runState(config, bases, { currentStageId: "act-6" });
    const members = bases.map((b) => member(b));
    const reservation = computeReservations({
      season: config,
      futureStages: [earlier[1]!, bosses],
      unlockedMembers: members,
      vigor: state.vigor,
    }).reservations.find((r) => r.characterId === specialist.id)!;

    expect(canReleaseReservation(reservation, {}).allowed).toBe(false);
    expect(canReleaseReservation(reservation, { "user-accepts-risk": true }).allowed).toBe(true);
    expect(canReleaseReservation(reservation, { "alternative-acquired": true }).reason).toBe(
      "alternative-acquired",
    );
  });

  it("11. 多个主 C 争抢同一种稀缺辅助元素时能识别冲突", () => {
    const needsHydro = (id: string) =>
      char({
        id,
        element: "cryo",
        baseDamage: 9,
        roles: ["main-dps"],
        capabilities: [apply("cryo", "high")],
        teammateNeeds: [{ type: "requires-element", element: "hydro", degradedTo: 0.5 }],
      });
    const bases = [
      needsHydro("dps-a"),
      needsHydro("dps-b"),
      needsHydro("dps-c"),
      char({ id: "only-hydro", element: "hydro", capabilities: [apply("hydro", "high")] }),
      ...fillers(4, "cryo"),
    ];
    const config = season([stage({ id: "a", order: 1 })]);
    const state = runState(config, bases);
    const members = bases.map((b) => member(b));

    const scarcity = elementScarcity(members, state.vigor);
    expect(scarcity.get("hydro")).toBeGreaterThan(0.4);
    expect(scarcity.get("cryo") ?? 0).toBe(0);
  });

  it("12. 生存位充足时，不把某个奶妈误判为唯一刚需", () => {
    const healers = [1, 2, 3, 4].map((i) =>
      char({ id: `healer-${i}`, roles: ["healer"], capabilities: [heal("party-wide", 4)] }),
    );
    const survivalStage = stage({
      id: "tablet",
      order: 2,
      type: "tablet",
      fixed: true,
      survivalPressure: 4,
      damagePressure: 2,
      hardRequirements: [{ type: "healing", scope: "party-wide", minimumStrength: 2.5 }],
    });
    const bases = [...healers, ...fillers(5, "cryo")];
    const config = season([stage({ id: "a", order: 1 }), survivalStage]);
    const state = runState(config, bases);
    const members = bases.map((b) => member(b));

    const { reservations } = computeReservations({
      season: config,
      futureStages: [survivalStage],
      unlockedMembers: members,
      vigor: state.vigor,
    });

    expect(reservations).toHaveLength(0);
  });
});
