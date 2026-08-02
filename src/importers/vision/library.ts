/**
 * 角色指纹库。
 *
 * 两层来源：
 *  1. 仓库内置（由官方图标构建，只存哈希，不存图片）
 *  2. 用户本地校准：内置库匹配不到时，用户指认一次，把这张卡的哈希存到本地
 * 第二层让工具在新角色上线、或截图尺寸特殊时仍然可用，并且越用越准。
 */
import type { FingerprintEntry, FingerprintLibrary } from "./recognize";

const STORAGE_KEY = "theater-pilot/avatar-fingerprints/v1";

export interface LocalFingerprint extends FingerprintEntry {
  learnedAt: string;
}

export function loadLocalFingerprints(): LocalFingerprint[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as LocalFingerprint[]) : [];
  } catch {
    return [];
  }
}

export function rememberFingerprint(entry: LocalFingerprint): void {
  if (typeof localStorage === "undefined") return;
  const existing = loadLocalFingerprints().filter(
    (e) => e.characterId !== entry.characterId,
  );
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...existing, entry]));
}

export function forgetLocalFingerprints(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}

/** 本地校准优先于内置库：用户自己的截图最贴近他自己的设备。 */
export function mergeLibraries(
  builtin: FingerprintEntry[],
  local: FingerprintEntry[],
): FingerprintLibrary {
  const byId = new Map<string, FingerprintEntry>();
  for (const entry of builtin) byId.set(entry.characterId, entry);
  for (const entry of local) {
    const previous = byId.get(entry.characterId);
    byId.set(entry.characterId, {
      ...entry,
      hashes: { ...previous?.hashes, ...entry.hashes },
    });
  }
  return { entries: [...byId.values()] };
}
