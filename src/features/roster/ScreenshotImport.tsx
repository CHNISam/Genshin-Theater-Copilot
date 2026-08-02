import { useCallback, useMemo, useRef, useState } from "react";
import type { InvestmentTier, UserCharacter } from "../../domain/types";
import { ELEMENT_LABEL } from "../../domain/types";
import { CHARACTERS, CHARACTER_BY_ID } from "../../data/characters";
import fingerprintFile from "../../data/characters/fingerprints.json";
import { fileToImage, imageFromClipboard } from "../../importers/vision/decode";
import { cropImage, downscale } from "../../importers/vision/image";
import { dHash } from "../../importers/vision/hash";
import { FINGERPRINT_VARIANTS } from "../../importers/vision/variants";
import {
  recognizeCastScreen,
  type FingerprintEntry,
  type RecognizedCharacterTile,
} from "../../importers/vision/recognize";
import {
  loadLocalFingerprints,
  mergeLibraries,
  rememberFingerprint,
} from "../../importers/vision/library";

const BUILTIN = (fingerprintFile as { entries: FingerprintEntry[] }).entries;

export interface ScreenshotResult {
  characters: UserCharacter[];
  unlockedIds: string[];
  vigor: Record<string, number>;
}

/**
 * 截图导入：一张剧诗角色界面截图 → 角色池 + 已出战/待命 + 剩余耐力。
 * 图片只在本地解码，不上传。识别不准的卡片必须由用户点一次确认。
 */
export function ScreenshotImport({
  onApply,
}: {
  onApply: (result: ScreenshotResult) => void;
}): JSX.Element {
  const [tiles, setTiles] = useState<RecognizedCharacterTile[] | null>(null);
  const [overrides, setOverrides] = useState<Record<number, string>>({});
  const [warnings, setWarnings] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [hot, setHot] = useState(false);
  const imageRef = useRef<Awaited<ReturnType<typeof fileToImage>> | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const library = useMemo(() => mergeLibraries(BUILTIN, loadLocalFingerprints()), []);

  const handleImage = useCallback(
    async (blob: Blob) => {
      setBusy(true);
      try {
        const image = await fileToImage(blob);
        imageRef.current = downscale(image, 1400).image;
        const result = recognizeCastScreen(image, library, CHARACTERS);
        setTiles(result.tiles);
        setOverrides({});
        setWarnings(result.warnings);
      } catch (error) {
        setWarnings([`读取截图失败：${(error as Error).message}`]);
      } finally {
        setBusy(false);
      }
    },
    [library],
  );

  const resolvedId = (tile: RecognizedCharacterTile, index: number): string | null =>
    overrides[index] ?? tile.detected.value;

  const pending = tiles?.filter((t, i) => resolvedId(t, i) === null).length ?? 0;

  function apply(): void {
    if (!tiles) return;
    const characters: UserCharacter[] = [];
    const unlockedIds: string[] = [];
    const vigor: Record<string, number> = {};

    tiles.forEach((tile, index) => {
      const id = resolvedId(tile, index);
      if (!id) return;
      // 练度默认给"可用"，用户随后在列表里一键改档；不强迫先填精确面板
      const tier: InvestmentTier = "usable";
      if (!characters.some((c) => c.characterId === id)) {
        characters.push({ characterId: id, tier });
      }
      if (tile.section === "principal") {
        unlockedIds.push(id);
        if (tile.vigor) vigor[id] = tile.vigor.value;
      }
      // 用户纠正过的卡片，记住它的指纹，下次直接认出来
      const corrected = overrides[index];
      if (corrected && imageRef.current) {
        const base = CHARACTER_BY_ID.get(corrected);
        if (base) {
          const hashes: Record<string, string> = {};
          for (const variant of FINGERPRINT_VARIANTS) {
            hashes[variant.id] = dHash(
              cropImage(imageRef.current, {
                x: tile.tile.x + tile.tile.width * variant.rect.x,
                y: tile.tile.y + tile.tile.height * variant.rect.y,
                width: tile.tile.width * variant.rect.width,
                height: tile.tile.height * variant.rect.height,
              }),
            );
          }
          rememberFingerprint({
            characterId: base.id,
            name: base.name,
            rarity: base.rarity,
            hashes,
            learnedAt: new Date().toISOString(),
          });
        }
      }
    });

    onApply({ characters, unlockedIds, vigor });
  }

  return (
    <div className="panel">
      <h2>用截图导入</h2>
      <p className="hint">
        拖入或 Ctrl+V。识别在本地完成，图片不上传。认不准的会标出来，点一次就记住。
      </p>

      <div
        className={`dropzone${hot ? " hot" : ""}`}
        onClick={() => fileInput.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setHot(true);
        }}
        onDragLeave={() => setHot(false)}
        onDrop={(e) => {
          e.preventDefault();
          setHot(false);
          const file = e.dataTransfer.files[0];
          if (file) void handleImage(file);
        }}
        onPaste={(e) => {
          const blob = imageFromClipboard(e.nativeEvent as ClipboardEvent);
          if (blob) void handleImage(blob);
        }}
        tabIndex={0}
        role="button"
      >
        {busy ? "识别中…" : "拖入截图 · 点击选择 · Ctrl+V"}
      </div>
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleImage(file);
        }}
      />

      {warnings.map((w) => (
        <div key={w} className="note warn" style={{ marginTop: 12 }}>
          {w}
        </div>
      ))}

      {tiles && tiles.length > 0 && (
        <>
          <div className="row" style={{ margin: "14px 0 10px" }}>
            <span className="chip">识别到 {tiles.length} 张卡</span>
            {pending > 0 ? (
              <span className="chip warn">{pending} 张待你确认</span>
            ) : (
              <span className="chip ok">全部已确认</span>
            )}
            <div style={{ flex: 1 }} />
            <button className="btn primary" onClick={apply} disabled={pending === tiles.length}>
              导入这 {tiles.length - pending} 名角色
            </button>
          </div>

          <div className="tilegrid">
            {tiles.map((tile, index) => {
              const id = resolvedId(tile, index);
              const base = id ? CHARACTER_BY_ID.get(id) : undefined;
              const needs = tile.detected.requiresConfirmation || !id;
              const options = tile.element.value
                ? CHARACTERS.filter((c) => c.element === tile.element.value)
                : CHARACTERS;
              return (
                <div key={index} className={`tilecard${needs ? " needs" : ""}`}>
                  <div className="who">{base?.name ?? "认不出来"}</div>
                  <div className="row" style={{ gap: 4, marginBottom: 6 }}>
                    {tile.element.value && (
                      <span className="chip">{ELEMENT_LABEL[tile.element.value]}</span>
                    )}
                    {tile.rarity && <span className="chip">{tile.rarity}★</span>}
                    {tile.section === "principal" && (
                      <span className="chip accent">耐力 {tile.vigor?.value ?? "?"}</span>
                    )}
                  </div>
                  {needs && (
                    <select
                      value={id ?? ""}
                      onChange={(e) =>
                        setOverrides((prev) => ({ ...prev, [index]: e.target.value }))
                      }
                    >
                      <option value="">选择角色…</option>
                      {options.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                      {tile.element.value && <option disabled>──── 其他元素 ────</option>}
                      {tile.element.value &&
                        CHARACTERS.filter((c) => c.element !== tile.element.value).map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                    </select>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
