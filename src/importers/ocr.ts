/**
 * 截图识别。
 *
 * 边界：识别只在浏览器本地完成，不上传截图，不需要任何账号凭证。
 * 引擎通过 ScreenshotRecognizer 注入（第一版可以先接入浏览器本地 OCR，
 * 或让用户直接粘贴文本）。识别结果一律是 DetectedValue，
 * 低可信度必须进入快速确认界面，不能静默作为事实。
 */
import type {
  BoundingBox,
  CharacterBase,
  DetectedValue,
  EventCandidate,
} from "../domain/types";
import { matchCharacter } from "./roster";

export interface OcrLine {
  text: string;
  confidence: number;
  box?: BoundingBox;
}

export interface ScreenshotRecognizer {
  readonly name: string;
  recognize(image: Blob): Promise<OcrLine[]>;
}

/** 识别目标场景。 */
export type CaptureScene =
  | "roster"
  | "unlocked"
  | "vigor"
  | "blossoms"
  | "event-candidates"
  | "buffs"
  | "battle-choices"
  | "refreshes";

export interface RecognizedRunState {
  unlockedCharacters: DetectedValue<string>[];
  vigor: DetectedValue<{ characterId: string; remaining: number }>[];
  blossoms?: DetectedValue<number>;
  refreshesRemaining?: DetectedValue<number>;
  buffLevels: DetectedValue<{ buffName: string; level: number }>[];
  eventCandidates: DetectedValue<EventCandidate>[];
  unrecognized: OcrLine[];
}

function detect<T>(value: T, confidence: number, line: OcrLine): DetectedValue<T> {
  return {
    value,
    confidence,
    requiresConfirmation: confidence < 0.85,
    rawText: line.text,
    ...(line.box ? { sourceRegion: line.box } : {}),
  };
}

/**
 * 把 OCR 行解析成局内状态。故意保守：
 * 认不准的宁可放进 unrecognized，让用户确认，也不猜。
 */
export function parseRunScreen(
  lines: OcrLine[],
  characters: readonly CharacterBase[],
): RecognizedRunState {
  const result: RecognizedRunState = {
    unlockedCharacters: [],
    vigor: [],
    buffLevels: [],
    eventCandidates: [],
    unrecognized: [],
  };

  for (const line of lines) {
    const text = line.text.trim();
    if (text.length === 0) continue;

    // 幻剧之花
    const blossom = text.match(/幻剧之花\D*(\d+)/);
    if (blossom?.[1]) {
      result.blossoms = detect(Number(blossom[1]), line.confidence, line);
      continue;
    }

    // 刷新次数
    const refresh = text.match(/刷新\D*(\d+)/);
    if (refresh?.[1]) {
      result.refreshesRemaining = detect(Number(refresh[1]), line.confidence, line);
      continue;
    }

    // 祝福等级：`超导 Lv2` / `冻结 2级`
    const buff = text.match(/^(\S{2,6})\s*(?:Lv\.?|等级)?\s*(\d)\s*级?$/i);
    if (buff?.[1] && buff[2] && /感电|冻结|超导|绽放|超载|蒸发|融化|原激化/.test(buff[1])) {
      result.buffLevels.push(
        detect({ buffName: buff[1], level: Number(buff[2]) }, line.confidence * 0.95, line),
      );
      continue;
    }

    // 角色 + 耐力：`菲林斯 x2` / `菲林斯 2`
    const vigorMatch = text.match(/^(.+?)\s*[x×]?\s*(\d)$/);
    if (vigorMatch?.[1] && vigorMatch[2]) {
      const match = matchCharacter(vigorMatch[1], characters);
      if (match.characterId) {
        const confidence = Math.min(line.confidence, match.confidence);
        result.vigor.push(
          detect(
            { characterId: match.characterId, remaining: Number(vigorMatch[2]) },
            confidence,
            line,
          ),
        );
        result.unlockedCharacters.push(detect(match.characterId, confidence, line));
        continue;
      }
    }

    // 纯角色名
    const nameMatch = matchCharacter(text, characters);
    if (nameMatch.characterId && nameMatch.confidence >= 0.55) {
      const confidence = Math.min(line.confidence, nameMatch.confidence);
      result.unlockedCharacters.push(detect(nameMatch.characterId, confidence, line));
      continue;
    }

    result.unrecognized.push(line);
  }

  // 同一角色重复识别时保留可信度最高的一条
  result.unlockedCharacters = dedupeByValue(result.unlockedCharacters, (v) => v);
  result.vigor = dedupeByValue(result.vigor, (v) => v.characterId);

  return result;
}

function dedupeByValue<T>(
  items: DetectedValue<T>[],
  key: (value: T) => string,
): DetectedValue<T>[] {
  const map = new Map<string, DetectedValue<T>>();
  for (const item of items) {
    const k = key(item.value);
    const existing = map.get(k);
    if (!existing || item.confidence > existing.confidence) map.set(k, item);
  }
  return [...map.values()];
}

/** 需要用户确认的条目。低可信内容绝不静默作为事实。 */
export function pendingConfirmations(state: RecognizedRunState): {
  scene: CaptureScene;
  label: string;
  detected: DetectedValue<unknown>;
}[] {
  const out: { scene: CaptureScene; label: string; detected: DetectedValue<unknown> }[] = [];
  for (const item of state.unlockedCharacters) {
    if (item.requiresConfirmation) {
      out.push({ scene: "unlocked", label: `已解锁角色：${item.rawText ?? item.value}`, detected: item });
    }
  }
  for (const item of state.vigor) {
    if (item.requiresConfirmation) {
      out.push({
        scene: "vigor",
        label: `耐力：${item.rawText ?? `${item.value.characterId} = ${item.value.remaining}`}`,
        detected: item,
      });
    }
  }
  for (const item of state.buffLevels) {
    if (item.requiresConfirmation) {
      out.push({ scene: "buffs", label: `祝福：${item.rawText}`, detected: item });
    }
  }
  if (state.blossoms?.requiresConfirmation) {
    out.push({ scene: "blossoms", label: `幻剧之花：${state.blossoms.value}`, detected: state.blossoms });
  }
  if (state.refreshesRemaining?.requiresConfirmation) {
    out.push({
      scene: "refreshes",
      label: `剩余刷新：${state.refreshesRemaining.value}`,
      detected: state.refreshesRemaining,
    });
  }
  return out;
}

/**
 * 把纯文本（用户手动粘贴，或外部 OCR 工具的输出）当作识别结果。
 * 这样第一版即使不接 OCR 引擎，整条"识别 → 确认 → 重算"链路也是通的。
 */
export function linesFromText(text: string, confidence = 0.8): OcrLine[] {
  return text
    .split(/\r?\n/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
    .map((t) => ({ text: t, confidence }));
}
