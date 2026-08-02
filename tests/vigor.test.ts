import { describe, expect, it } from "vitest";
import { availableMembers } from "../src/solver/roster";
import { lookahead } from "../src/solver/lookahead";
import { apply, char, fillers, member, runState, season, stage } from "./fixtures";

describe("耐力与解锁约束", () => {
  it("1. 任何路线中，角色出场次数都不超过其剩余耐力", () => {
    // 5 关 × 4 人 = 20 次出场，角色池必须提供不少于 20 点耐力
    const bases = [
      ...fillers(6, "cryo"),
      ...fillers(6, "electro"),
      char({ id: "star", baseDamage: 9, capabilities: [apply("cryo", "high")] }),
    ];
    const stages = Array.from({ length: 5 }, (_, i) =>
      stage({ id: `act-${i + 1}`, order: i + 1, damagePressure: 1 }),
    );
    const config = season(stages);
    const members = bases.map((b) => member(b, "usable"));
    const state = runState(config, bases);

    const result = lookahead({
      season: config,
      futureStages: stages,
      unlockedMembers: members,
      vigor: state.vigor,
      buffLevels: {},
    });

    expect(result.feasible).toBe(true);
    const used = new Map<string, number>();
    for (const step of result.bestPath) {
      for (const id of step.memberIds) used.set(id, (used.get(id) ?? 0) + 1);
    }
    for (const [id, count] of used) {
      expect(count).toBeLessThanOrEqual(state.vigor[id] ?? 0);
    }
  });

  it("2. 未解锁角色不能上场", () => {
    const bases = fillers(6, "cryo");
    const config = season([stage({ id: "a", order: 1 })]);
    const members = bases.map((b) => member(b));
    const locked = bases[0]!.id;
    const state = runState(config, bases, {
      unlockedCharacterIds: bases.filter((b) => b.id !== locked).map((b) => b.id),
    });

    const available = availableMembers(members, state);
    expect(available.map((m) => m.base.id)).not.toContain(locked);
  });

  it("1b. 耐力耗尽的角色不再进入候选池", () => {
    const bases = fillers(6, "cryo");
    const config = season([stage({ id: "a", order: 1 })]);
    const members = bases.map((b) => member(b));
    const drained = bases[1]!.id;
    const state = runState(config, bases, { vigor: { [drained]: 0 } });

    expect(availableMembers(members, state).map((m) => m.base.id)).not.toContain(drained);
  });
});
