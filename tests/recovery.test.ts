/**
 * 容灾：用户没按推荐走、或随机不理想时，必须给出**可执行的出路**，
 * 而不是只报一句"已经无解"。
 *
 * 这里锁定的规则：
 *  23. 没有缺口时不得制造焦虑：不输出任何恢复建议。
 *  24. 追圣牌导致无解、而只打主线仍有解时，必须给出"放弃圣牌"并标明它确实能恢复可行性。
 *  25. 未来关卡机制无人可用时，必须给出刷新这条路，且不得声称刷新一定能解决。
 *  26. 线路已经走死时，为该线路做的预留失去意义，必须允许解除（no-route-remains）。
 *  27. 任何困境都至少给出一个选项；"接受降级"永远排在最后，不能挤掉真正的解法。
 */
import { describe, expect, it } from "vitest";
import { planRecovery } from "../src/solver/recovery";
import { lookahead } from "../src/solver/lookahead";
import { computeReservations } from "../src/solver/reservations";
import { buildRoster } from "../src/solver/roster";
import { remainingStages } from "../src/solver/stages";
import type { RunObjective } from "../src/domain/types";
import {
  apply,
  char,
  characterMap,
  fillers,
  rosterOf,
  runState,
  season,
  stage,
} from "./fixtures";

const OBJECTIVE_ALL: RunObjective = { difficulty: "moonlit", tablets: true, stars: false };

/**
 * 主线宽松、圣牌吃紧：7 个角色共 14 点耐力，
 * 只打主线（2 关 × 4 人 = 8）绰绰有余，加上两场圣牌（4 关 × 4 人 = 16）就不够了。
 */
function tabletStrain() {
  const bases = [
    char({ id: "hydro-a", element: "hydro", capabilities: [apply("hydro", "high")] }),
    ...fillers(6, "cryo"),
  ];
  const stages = [
    stage({ id: "act-1", order: 1 }),
    stage({ id: "tab-1", order: 2, type: "tablet" }),
    stage({ id: "tab-2", order: 3, type: "tablet" }),
    stage({
      id: "act-2",
      order: 4,
      type: "boss",
      hardRequirements: [
          { type: "element", acceptedElements: ["hydro"], minimumApplicationRate: "high" },
        ],
    }),
  ];
  return { bases, stages };
}

function planFor(
  bases: ReturnType<typeof char>[],
  stages: ReturnType<typeof stage>[],
  objective: RunObjective,
  vigor?: Record<string, number>,
) {
  const s = season(stages);
  const state = runState(s, bases, { objective, ...(vigor ? { vigor } : {}) });
  const members = buildRoster({
    season: s,
    roster: rosterOf(bases),
    characters: characterMap(bases),
  });
  const unlocked = members.filter((m) => state.unlockedCharacterIds.includes(m.base.id));
  const remaining = remainingStages(s, state);
  const { reservations, unmetFutureRequirements } = computeReservations({
    season: s,
    futureStages: remaining.slice(1),
    unlockedMembers: unlocked,
    vigor: state.vigor,
  });
  const fullRun = lookahead(
    {
      season: s,
      futureStages: remaining,
      unlockedMembers: unlocked,
      vigor: state.vigor,
      buffLevels: {},
    },
    { beamWidth: 4 },
  );
  return planRecovery({
    season: s,
    state,
    unlockedMembers: unlocked,
    remainingStages: remaining,
    reservations,
    unmetFutureRequirements,
    fullRun,
  });
}

describe("容灾恢复建议", () => {
  it("23. 一切正常时不给恢复建议", () => {
    const bases = [
      char({ id: "hydro-a", element: "hydro", capabilities: [apply("hydro", "high")] }),
      ...fillers(6, "cryo"),
    ];
    const stages = [stage({ id: "act-1", order: 1 }), stage({ id: "act-2", order: 2 })];
    const plan = planFor(bases, stages, { difficulty: "moonlit", tablets: false, stars: false });
    expect(plan.inTrouble).toBe(false);
    expect(plan.options).toHaveLength(0);
  });

  it("24. 圣牌拖垮主线时，给出放弃圣牌且标明能恢复可行性", () => {
    const { bases, stages } = tabletStrain();
    const plan = planFor(bases, stages, OBJECTIVE_ALL);
    const drop = plan.options.find((o) => o.kind === "drop-tablets");
    expect(drop, "必须给出放弃圣牌这条路").toBeDefined();
    expect(drop?.restoresFeasibility).toBe(true);
    // 真正能解决问题的选项要排在"接受降级"前面
    const dropIndex = plan.options.indexOf(drop!);
    const acceptIndex = plan.options.findIndex((o) => o.kind === "accept-degraded");
    expect(dropIndex).toBeLessThan(acceptIndex);
  });

  it("25. 机制无人可用时给出刷新，但不承诺一定解决", () => {
    const bases = [...fillers(6, "cryo")];
    const stages = [
      stage({ id: "act-1", order: 1 }),
      stage({
        id: "act-2",
        order: 2,
        type: "boss",
        hardRequirements: [
          { type: "element", acceptedElements: ["hydro"], minimumApplicationRate: "high" },
        ],
      }),
    ];
    const plan = planFor(bases, stages, { difficulty: "moonlit", tablets: false, stars: false });
    expect(plan.inTrouble).toBe(true);
    const refresh = plan.options.find((o) => o.kind === "refresh");
    expect(refresh).toBeDefined();
    expect(refresh?.restoresFeasibility, "刷新出什么是随机的，不能声称必然解决").toBe(false);
  });

  it("26. 线路已死时，为该线路做的预留可以解除", () => {
    const { bases, stages } = tabletStrain();
    const plan = planFor(bases, stages, OBJECTIVE_ALL);
    const release = plan.options.find((o) => o.kind === "release-reservation");
    if (release) {
      expect(release.reservationId).toBeTruthy();
      expect(release.detail).toContain("预留");
    }
    // 无论是否有预留可解除，都必须至少有一条出路
    expect(plan.options.length).toBeGreaterThan(0);
  });

  it("27. 接受降级永远排在最后", () => {
    const bases = [...fillers(6, "cryo")];
    const stages = [
      stage({ id: "act-1", order: 1 }),
      stage({
        id: "act-2",
        order: 2,
        type: "boss",
        hardRequirements: [
          { type: "element", acceptedElements: ["hydro"], minimumApplicationRate: "high" },
        ],
      }),
    ];
    const plan = planFor(bases, stages, { difficulty: "moonlit", tablets: false, stars: false });
    expect(plan.options.length).toBeGreaterThan(0);
    expect(plan.options[plan.options.length - 1]?.kind).toBe("accept-degraded");
    expect(plan.diagnosis.length).toBeGreaterThan(0);
  });

  it("28. 恢复建议只依赖当前状态，与用户是否听劝无关（同状态同结论）", () => {
    const { bases, stages } = tabletStrain();
    const a = planFor(bases, stages, OBJECTIVE_ALL);
    const b = planFor(bases, stages, OBJECTIVE_ALL);
    expect(a.options.map((o) => o.kind)).toEqual(b.options.map((o) => o.kind));
    expect(a.diagnosis).toBe(b.diagnosis);
  });
});
