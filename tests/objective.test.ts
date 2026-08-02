import { describe, expect, it } from "vitest";
import type { RunObjective } from "../src/domain/types";
import { remainingStages, futureStages } from "../src/solver/stages";
import { damageMultiplierFor, penalizeOverkill, searchTeams } from "../src/solver/team";
import { computeReservations } from "../src/solver/reservations";
import { buildRoster } from "../src/solver/roster";
import {
  isDifficultySupported,
  resolveSeason,
  supportedDifficulties,
  tryResolveSeason,
  UnsupportedDifficultyError,
} from "../src/season/resolve";
import {
  apply,
  char,
  characterMap,
  fillers,
  heal,
  member,
  rulesFor,
  runState,
  season,
  seasonConfig,
  stage,
} from "./fixtures";

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

/** 两个正交的轴：打不打圣牌、追不追星章。 */
const CLEAR: RunObjective = { difficulty: "moonlit", tablets: false, stars: false };
const WITH_TABLETS: RunObjective = { difficulty: "moonlit", tablets: true, stars: false };
const STARS_NO_TABLETS: RunObjective = { difficulty: "moonlit", tablets: false, stars: true };
const FULL_STARS: RunObjective = { difficulty: "moonlit", tablets: true, stars: true };

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

  it("追星与打圣牌是两个独立开关：可以只打主线但追星", () => {
    const config = seasonWithTablets();
    const bases = fillers(8, "cryo");
    const state = runState(config, bases, { objective: STARS_NO_TABLETS });

    // 不打圣牌 → 圣牌不进剩余关卡
    expect(remainingStages(config, state).map((s) => s.id)).toEqual(["act-1", "act-2"]);
    // 但追星 → 输出要求仍然抬高
    expect(damageMultiplierFor(STARS_NO_TABLETS)).toBeGreaterThan(
      damageMultiplierFor(WITH_TABLETS),
    );
    expect(penalizeOverkill(STARS_NO_TABLETS)).toBe(false);
    expect(penalizeOverkill(WITH_TABLETS)).toBe(true);
  });

  it("追星时提高输出要求并关闭过剩惩罚", () => {
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
    // 只录入月谕的赛季包。
    const pack = seasonConfig(seasonWithTablets().stages);

    expect(supportedDifficulties(pack)).toEqual(["moonlit"]);
    expect(isDifficultySupported(pack, "hard")).toBe(false);

    // 关键：未录入的难度必须抛错，绝不能悄悄回退到月谕的关卡结构——
    // 那会让用户拿到一份看起来正常、实际上属于另一档难度的攻略。
    expect(() => resolveSeason(pack, "hard")).toThrow(UnsupportedDifficultyError);
    expect(tryResolveSeason(pack, "hard")).toBeUndefined();
  });

  /*
   * 五个难度共用同一套幕，区别只在"打到第几幕、含不含圣牌"。
   * 因此这里锁定的是：同一份关卡表在不同难度下必须裁剪成不同的结构，
   * 低难度绝不能拿到自己根本打不到的幕。
   */
  it("同一套关卡在不同难度下裁剪出不同结构", () => {
    const shared = seasonWithTablets().stages;
    const pack = seasonConfig(shared, {
      difficulties: {
        light: rulesFor(shared, { clearAtAct: 1, includesTablets: false, defaultVigor: 3 }),
        moonlit: rulesFor(shared, { clearAtAct: 2, includesTablets: true }),
      },
    });

    expect(supportedDifficulties(pack)).toEqual(["light", "moonlit"]);

    const resolvedLight = resolveSeason(pack, "light");
    const resolvedMoonlit = resolveSeason(pack, "moonlit");

    expect(resolvedLight.difficulty).toBe("light");
    expect(resolvedLight.stages.map((s) => s.id)).toEqual(["act-1"]);
    expect(resolvedLight.rules.defaultVigor).toBe(3);
    expect(resolvedLight.rules.tabletChallengeCount).toBe(0);

    // 两档难度的结构必须互不污染：轻简打不到第 2 幕，也没有圣牌。
    expect(resolvedMoonlit.stages.map((s) => s.id)).toEqual(["act-1", "act-2", "tablet-1"]);
    expect(resolvedMoonlit.rules.tabletChallengeCount).toBeGreaterThan(0);
    expect(resolvedMoonlit.rules.defaultVigor).toBe(2);
  });
});

describe("助演约束", () => {
  it("一期只能借一个助演：未被选中的候选不得进入可用池", () => {
    const own = fillers(6, "cryo");
    const guestA = char({ id: "guest-a", name: "助演甲", baseDamage: 9, roles: ["main-dps"] });
    const guestB = char({ id: "guest-b", name: "助演乙", baseDamage: 9, roles: ["main-dps"] });
    const config = season([stage({ id: "a", order: 1 })]);

    const members = buildRoster({
      season: config,
      characters: characterMap([...own, guestA, guestB]),
      roster: {
        characters: [
          ...own.map((c) => ({ characterId: c.id, tier: "usable" as const })),
          { characterId: "guest-a", tier: "core" as const },
          { characterId: "guest-b", tier: "core" as const },
        ],
        supportGuestId: "guest-a",
        supportGuestCandidates: ["guest-a", "guest-b"],
      },
    });

    const ids = members.map((m) => m.base.id);
    expect(ids).toContain("guest-a");
    expect(ids).not.toContain("guest-b");
    expect(members.filter((m) => m.supportGuest)).toHaveLength(1);
  });

  it("还没决定借谁时，所有助演候选都不进池子", () => {
    const own = fillers(6, "cryo");
    const guestA = char({ id: "guest-a", name: "助演甲" });
    const config = season([stage({ id: "a", order: 1 })]);

    const members = buildRoster({
      season: config,
      characters: characterMap([...own, guestA]),
      roster: {
        characters: [
          ...own.map((c) => ({ characterId: c.id, tier: "usable" as const })),
          { characterId: "guest-a", tier: "core" as const },
        ],
        supportGuestCandidates: ["guest-a"],
      },
    });

    expect(members.map((m) => m.base.id)).not.toContain("guest-a");
  });
});
