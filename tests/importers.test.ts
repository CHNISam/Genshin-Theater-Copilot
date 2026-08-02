import { describe, expect, it } from "vitest";
import {
  exportRoster,
  importRosterJson,
  matchCharacter,
  parseRosterText,
  progressiveQuestions,
} from "../src/importers/roster";
import { linesFromText, parseRunScreen, pendingConfirmations } from "../src/importers/ocr";
import { CHARACTERS } from "../src/data/characters";

describe("低摩擦导入", () => {
  it("16. 低可信度的识别结果必须要求用户确认，不能静默作为事实", () => {
    const lines = [
      { text: "丝柯克 2", confidence: 0.55 },
      { text: "幻剧之花 7", confidence: 0.95 },
      { text: "夏洛蒂", confidence: 0.9 },
      { text: "%%$$乱码", confidence: 0.3 },
    ];
    const state = parseRunScreen(lines, CHARACTERS);

    const skirk = state.vigor.find((v) => v.value.characterId === "skirk");
    expect(skirk).toBeDefined();
    expect(skirk!.requiresConfirmation).toBe(true);

    expect(state.blossoms?.value).toBe(7);
    expect(state.blossoms?.requiresConfirmation).toBe(false);

    // 「夏洛蒂」同时是夏沃蕾的社区别名，必须降级并要求确认
    const charlotte = state.unlockedCharacters.find((c) => c.rawText === "夏洛蒂");
    expect(charlotte?.requiresConfirmation).toBe(true);

    expect(state.unrecognized.map((l) => l.text)).toContain("%%$$乱码");

    const pending = pendingConfirmations(state);
    expect(pending.length).toBeGreaterThan(0);
    expect(pending.some((p) => p.scene === "vigor")).toBe(true);
  });

  it("粘贴名字列表即可建立角色池（支持别名与错字）", () => {
    const parsed = parseRosterText(
      ["四可克 核心", "菲林斯 核心", "行秋", "木偶 满命", "不存在的角色"].join("\n"),
      CHARACTERS,
    );

    const ids = parsed.map((p) => p.detected.value?.characterId);
    expect(ids).toContain("skirk");
    expect(ids).toContain("flins");
    expect(ids).toContain("xingqiu");
    expect(ids).toContain("sandonie");

    const sandonie = parsed.find((p) => p.detected.value?.characterId === "sandonie");
    expect(sandonie!.detected.value!.constellation).toBe(6);

    const unknown = parsed[4]!;
    expect(unknown.detected.value).toBeNull();
    expect(unknown.detected.requiresConfirmation).toBe(true);
  });

  it("别名歧义（夏洛蒂 / 夏沃蕾）不会被静默猜测", () => {
    const result = matchCharacter("夏洛蒂", CHARACTERS);
    expect(result.requiresConfirmation).toBe(true);
    expect(result.alternatives.length).toBeGreaterThan(0);
  });

  it("JSON 导入导出可往返，且会跳过未知角色", () => {
    const roster = {
      characters: [
        { characterId: "skirk", tier: "core" as const },
        { characterId: "yelan", tier: "usable" as const },
      ],
    };
    const exported = exportRoster(roster);
    const imported = importRosterJson(exported, CHARACTERS);
    expect(imported.roster.characters).toHaveLength(2);

    const withUnknown = importRosterJson(
      { format: "theater-pilot/roster", version: 1, roster: { characters: [...roster.characters, { characterId: "nope", tier: "core" as const }] } },
      CHARACTERS,
    );
    expect(withUnknown.roster.characters).toHaveLength(2);
    expect(withUnknown.warnings.join()).toContain("nope");
  });

  it("支持第三方工具的通用 JSON（名字数组 / 名字→命座）", () => {
    const fromArray = importRosterJson(["丝柯克", "夜兰", "行秋"], CHARACTERS);
    expect(fromArray.roster.characters.map((c) => c.characterId)).toEqual([
      "skirk",
      "yelan",
      "xingqiu",
    ]);

    const fromMap = importRosterJson({ 甘雨: 0, 芙宁娜: 2 }, CHARACTERS);
    expect(fromMap.roster.characters).toEqual([
      { characterId: "ganyu", tier: "usable", constellation: 0 },
      { characterId: "furina", tier: "usable", constellation: 2 },
    ]);
  });

  it("只有评分接近时才追问装备与熟练度（渐进式提问）", () => {
    const close = progressiveQuestions([
      { characterId: "a", name: "A", score: 100, tier: "core" },
      { characterId: "b", name: "B", score: 96, tier: "core" },
    ]);
    expect(close).toHaveLength(1);
    expect(close[0]!.fields).toContain("weaponQuality");

    const farApart = progressiveQuestions([
      { characterId: "a", name: "A", score: 100, tier: "core" },
      { characterId: "b", name: "B", score: 40, tier: "core" },
    ]);
    expect(farApart).toHaveLength(0);
  });

  it("纯文本也能走完识别链路（第一版不接 OCR 引擎也可用）", () => {
    const lines = linesFromText(["菲林斯 2", "爱诺 1", "幻剧之花 5", "刷新 2"].join("\n"), 0.9);
    const state = parseRunScreen(lines, CHARACTERS);
    expect(state.vigor.map((v) => v.value.characterId)).toEqual(["flins", "aino"]);
    expect(state.blossoms?.value).toBe(5);
    expect(state.refreshesRemaining?.value).toBe(2);
  });
});
