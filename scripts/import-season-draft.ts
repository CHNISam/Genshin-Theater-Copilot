/**
 * npm run season:import -- --season=2026-09 --file=agent-output.json
 *
 * 导入 Agent 返回的研究结果，立即校验并输出差异摘要。
 * 未通过校验的草稿仍会被保存（便于修复），但不会被标记为可发布。
 */
import { readFileSync } from "node:fs";
import { ImportedResearchProvider, extractJson, reviewDraft } from "../src/season/research";
import { SEASONS } from "../src/data/seasons";
import { CHARACTER_BY_ID } from "../src/data/characters";
import { draftPath, fail, parseArgs, writeJson } from "./lib";

const args = parseArgs(process.argv.slice(2));
const seasonId = typeof args.season === "string" ? args.season : undefined;
const file = typeof args.file === "string" ? args.file : undefined;
if (!seasonId) fail("必须指定 --season=<id>");
if (!file) fail("必须指定 --file=<agent 输出文件>");

const rawText = readFileSync(file, "utf8");
let payload: { season?: unknown; notes?: string };
try {
  payload = JSON.parse(extractJson(rawText)) as { season?: unknown; notes?: string };
} catch (error) {
  fail(`无法解析 Agent 输出：${(error as Error).message}`);
}

const seasonPayload = payload.season ?? payload;
const provider = new ImportedResearchProvider({
  seasonId,
  season: seasonPayload,
  ...(payload.notes ? { notes: payload.notes } : {}),
  producedBy: `file:${file}`,
  producedAt: new Date().toISOString(),
});

const draft = await provider.research();
const previous = [...SEASONS]
  .filter((s) => s.id !== seasonId)
  .sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt))[0];

const reviewed = reviewDraft(draft, previous, {
  knownCharacterIds: new Set(CHARACTER_BY_ID.keys()),
});

const path = draftPath(seasonId);
writeJson(path, draft.season);
console.log(`✓ 草稿已保存：${path}`);

printReview(reviewed);

function printReview(result: ReturnType<typeof reviewDraft>): void {
  const errors = result.validation.issues.filter((i) => i.severity === "error");
  const warnings = result.validation.issues.filter((i) => i.severity === "warning");

  if (errors.length > 0) {
    console.error(`\n✗ 校验未通过（${errors.length} 项错误）：`);
    for (const issue of errors) console.error(`  - [${issue.code}] ${issue.path}: ${issue.message}`);
  } else {
    console.log("\n✓ 结构与语义校验通过");
  }
  if (warnings.length > 0) {
    console.warn(`\n! 需要人工复核（${warnings.length} 项）：`);
    for (const issue of warnings) console.warn(`  - [${issue.code}] ${issue.path}: ${issue.message}`);
  }

  const d = result.diff;
  console.log("\n## 与上一期的差异");
  report("新增角色", d.addedCharacters);
  report("移除角色", d.removedCharacters);
  report("新增祝福", d.addedBuffs);
  report("移除祝福", d.removedBuffs);
  report("祝福变化", d.changedBuffs.map((b) => `${b.id}: ${b.changes.join("；")}`));
  report("新增关卡", d.addedStages);
  report("移除关卡", d.removedStages);
  report("关卡变化", d.changedStages.map((s) => `${s.id}: ${s.changes.join("；")}`));
  report("首领变化", d.bossChanges);
  report("低可信项目", d.lowConfidenceItems);
  report("可能影响求解器的重大变化", d.solverImpacting);

  console.log(
    `\n${result.validation.canPublish ? "→ 可以进入 review/publish" : "→ 尚不可发布，请先修复上述问题"}`,
  );
}

function report(label: string, items: string[]): void {
  if (items.length === 0) return;
  console.log(`- ${label}：`);
  for (const item of items) console.log(`    · ${item}`);
}
