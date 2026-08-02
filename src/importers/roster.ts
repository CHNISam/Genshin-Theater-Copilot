/**
 * 名字文本导入（截图识别的兜底路径，见 ./vision/）。
 *
 * 隐私边界：不要求账号密码、不要求米游社 Cookie、不上传任何凭证。
 *
 * 匹配策略：**只接受精确命中**（官方名 / id / 无歧义别名）。
 * 近似的一律不自动采用，而是把候选交给用户点选——
 * 静默接受近似匹配会把错误固化进角色池，之后所有推荐都建立在错的角色上。
 */
import type { CharacterBase, DetectedValue, InvestmentTier, Roster, UserCharacter } from "../domain/types";
import { AMBIGUOUS_ALIASES, CHARACTER_ALIASES } from "../data/characters/aliases";

export interface MatchResult {
  /** 只有**精确**命中（官方名 / id / 无歧义别名）才有值。 */
  characterId?: string;
  matchedName?: string;
  confidence: number;
  requiresConfirmation: boolean;
  /** 没有精确命中时给出的候选，交给用户点选——绝不静默替用户猜。 */
  alternatives: { characterId: string; name: string }[];
}

/** 认为"精确命中、可以直接采用"的门槛。低于它一律进人工确认。 */
export const EXACT_MATCH_CONFIDENCE = 0.9;

function normalize(input: string): string {
  return input
    .trim()
    .replace(/[\s·・.,，。、:：()（）[\]【】]/g, "")
    .toLowerCase();
}

/** 编辑距离，用于容忍语音输入或 OCR 的一两个错字。 */
function editDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp: number[] = new Array(cols);
  for (let j = 0; j < cols; j += 1) dp[j] = j;
  for (let i = 1; i < rows; i += 1) {
    let prev = dp[0] as number;
    dp[0] = i;
    for (let j = 1; j < cols; j += 1) {
      const temp = dp[j] as number;
      dp[j] =
        a[i - 1] === b[j - 1]
          ? prev
          : 1 + Math.min(prev, dp[j] as number, dp[j - 1] as number);
      prev = temp;
    }
  }
  return dp[cols - 1] as number;
}

export function matchCharacter(
  input: string,
  characters: readonly CharacterBase[],
): MatchResult {
  const query = normalize(input);
  if (query.length === 0) {
    return { confidence: 0, requiresConfirmation: true, alternatives: [] };
  }

  const ambiguous = AMBIGUOUS_ALIASES.has(input.trim());

  // 1) id / 官方名精确匹配
  for (const c of characters) {
    if (normalize(c.id) === query || normalize(c.name) === query) {
      return {
        characterId: c.id,
        matchedName: c.name,
        confidence: ambiguous ? 0.7 : 1,
        requiresConfirmation: ambiguous,
        alternatives: ambiguous ? aliasSiblings(input.trim(), characters, c.id) : [],
      };
    }
  }

  // 2) 别名匹配
  const aliasHits: CharacterBase[] = [];
  for (const c of characters) {
    const aliases = CHARACTER_ALIASES[c.id] ?? [];
    if (aliases.some((a) => normalize(a) === query)) aliasHits.push(c);
  }
  if (aliasHits.length === 1) {
    const hit = aliasHits[0] as CharacterBase;
    return {
      characterId: hit.id,
      matchedName: hit.name,
      confidence: 0.9,
      requiresConfirmation: false,
      alternatives: [],
    };
  }
  if (aliasHits.length > 1) {
    const first = aliasHits[0] as CharacterBase;
    return {
      characterId: first.id,
      matchedName: first.name,
      confidence: 0.5,
      requiresConfirmation: true,
      alternatives: aliasHits.map((c) => ({ characterId: c.id, name: c.name })),
    };
  }

  // 3) 没有精确命中：给出最接近的几个候选，但**不替用户决定**。
  //    刻意不返回 characterId —— 静默接受近似匹配会把错误固化进角色池。
  const scored: { c: CharacterBase; distance: number }[] = [];
  for (const c of characters) {
    let best = Number.POSITIVE_INFINITY;
    for (const candidate of [c.name, ...(CHARACTER_ALIASES[c.id] ?? [])]) {
      best = Math.min(best, editDistance(query, normalize(candidate)));
    }
    scored.push({ c, distance: best });
  }
  scored.sort((a, b) => a.distance - b.distance);
  const near = scored.filter((x) => x.distance <= 3).slice(0, 5);

  return {
    confidence: 0,
    requiresConfirmation: true,
    alternatives: near.map((x) => ({ characterId: x.c.id, name: x.c.name })),
  };
}

function aliasSiblings(
  alias: string,
  characters: readonly CharacterBase[],
  excludeId: string,
): { characterId: string; name: string }[] {
  return characters
    .filter(
      (c) => c.id !== excludeId && (CHARACTER_ALIASES[c.id] ?? []).includes(alias),
    )
    .map((c) => ({ characterId: c.id, name: c.name }));
}

/* ------------------------------------------------------------------ */

export interface ParsedRosterLine {
  raw: string;
  detected: DetectedValue<UserCharacter | null>;
  match: MatchResult;
}

const TIER_KEYWORDS: { tier: InvestmentTier; words: string[] }[] = [
  { tier: "core", words: ["核心", "主力", "core", "满命", "强"] },
  { tier: "usable", words: ["可用", "usable", "能用"] },
  { tier: "trinket", words: ["挂件", "trinket", "凑数", "填位"] },
  { tier: "unused", words: ["不用", "unused", "不使用"] },
];

/**
 * 解析粘贴的角色列表。每行形如：
 *   `丝柯克 核心`
 *   `行秋`
 *   `莫娜, 可用, 3命`
 */
export function parseRosterText(
  text: string,
  characters: readonly CharacterBase[],
  defaultTier: InvestmentTier = "usable",
): ParsedRosterLine[] {
  const out: ParsedRosterLine[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.length === 0) continue;

    const parts = line.split(/[,，\s|\t]+/).filter(Boolean);
    const nameToken = parts[0] ?? line;
    const rest = parts.slice(1).join(" ");

    let tier = defaultTier;
    for (const { tier: t, words } of TIER_KEYWORDS) {
      if (words.some((w) => rest.includes(w) || line.includes(w))) {
        tier = t;
        break;
      }
    }
    const constellationMatch = rest.match(/(\d)\s*命/);
    const constellation = constellationMatch
      ? Number(constellationMatch[1])
      : /满命/.test(line)
        ? 6
        : undefined;

    const match = matchCharacter(nameToken, characters);
    const exact =
      match.characterId !== undefined && match.confidence >= EXACT_MATCH_CONFIDENCE;
    const value: UserCharacter | null =
      exact && match.characterId
        ? {
            characterId: match.characterId,
            tier,
            ...(constellation !== undefined ? { constellation } : {}),
          }
        : null;

    out.push({
      raw: line,
      match,
      detected: {
        value,
        confidence: match.confidence,
        requiresConfirmation: !exact,
        rawText: line,
      },
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */

export interface RosterExport {
  format: "theater-pilot/roster";
  version: 1;
  roster: Roster;
}

export function exportRoster(roster: Roster): RosterExport {
  return { format: "theater-pilot/roster", version: 1, roster };
}

export interface ImportRosterResult {
  roster: Roster;
  warnings: string[];
  needsConfirmation: ParsedRosterLine[];
}

/** 支持本工具导出格式，以及"名字数组"或"{名字: 命座}"这类通用第三方结构。 */
export function importRosterJson(
  raw: unknown,
  characters: readonly CharacterBase[],
): ImportRosterResult {
  const warnings: string[] = [];
  const needsConfirmation: ParsedRosterLine[] = [];

  if (
    typeof raw === "object" &&
    raw !== null &&
    (raw as RosterExport).format === "theater-pilot/roster"
  ) {
    const roster = (raw as RosterExport).roster;
    const known = new Set(characters.map((c) => c.id));
    const filtered = roster.characters.filter((c) => {
      if (known.has(c.characterId)) return true;
      warnings.push(`角色数据中不存在 ${c.characterId}，已跳过。`);
      return false;
    });
    return { roster: { ...roster, characters: filtered }, warnings, needsConfirmation };
  }

  const entries: { name: string; tier?: InvestmentTier; constellation?: number }[] = [];
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === "string") entries.push({ name: item });
      else if (item && typeof item === "object") {
        const obj = item as Record<string, unknown>;
        const name = String(obj.name ?? obj.characterId ?? obj.id ?? "");
        if (!name) continue;
        entries.push({
          name,
          tier: typeof obj.tier === "string" ? (obj.tier as InvestmentTier) : undefined,
          constellation:
            typeof obj.constellation === "number" ? obj.constellation : undefined,
        });
      }
    }
  } else if (raw && typeof raw === "object") {
    for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
      entries.push({
        name,
        constellation: typeof value === "number" ? value : undefined,
      });
    }
  } else {
    warnings.push("无法识别的 JSON 结构。");
    return { roster: { characters: [] }, warnings, needsConfirmation };
  }

  const characters_: UserCharacter[] = [];
  for (const entry of entries) {
    const match = matchCharacter(entry.name, characters);
    if (!match.characterId) {
      warnings.push(`无法识别角色「${entry.name}」。`);
      needsConfirmation.push({
        raw: entry.name,
        match,
        detected: { value: null, confidence: 0, requiresConfirmation: true, rawText: entry.name },
      });
      continue;
    }
    const user: UserCharacter = {
      characterId: match.characterId,
      tier: entry.tier ?? "usable",
      ...(entry.constellation !== undefined ? { constellation: entry.constellation } : {}),
    };
    characters_.push(user);
    if (match.requiresConfirmation) {
      needsConfirmation.push({
        raw: entry.name,
        match,
        detected: {
          value: user,
          confidence: match.confidence,
          requiresConfirmation: true,
          rawText: entry.name,
        },
      });
    }
  }

  return { roster: { characters: characters_ }, warnings, needsConfirmation };
}

/**
 * 渐进式提问：只有当某项信息确实会改变推荐时才追问。
 * 这里判断"两个候选评分接近且都属于核心档"，才值得问装备与操作熟练度。
 */
export interface ProgressiveQuestion {
  characterIds: string[];
  question: string;
  fields: ("constellation" | "weaponQuality" | "talentLevel")[];
}

export function progressiveQuestions(
  ranked: { characterId: string; name: string; score: number; tier: InvestmentTier }[],
  threshold = 0.08,
): ProgressiveQuestion[] {
  const questions: ProgressiveQuestion[] = [];
  for (let i = 0; i < ranked.length - 1; i += 1) {
    const a = ranked[i];
    const b = ranked[i + 1];
    if (!a || !b) continue;
    if (a.tier !== "core" || b.tier !== "core") continue;
    const larger = Math.max(a.score, b.score);
    if (larger <= 0) continue;
    if (Math.abs(a.score - b.score) / larger <= threshold) {
      questions.push({
        characterIds: [a.characterId, b.characterId],
        question: `${a.name} 与 ${b.name} 当前评分接近，是否补充两者的武器与操作熟练度？这会改变谁承担关键关卡。`,
        fields: ["weaponQuality", "constellation"],
      });
    }
  }
  return questions;
}
