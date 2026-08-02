/**
 * npm run season:validate -- --season=2026-09
 * npm run season:validate -- --file=path/to/season.json
 * npm run season:validate            # 校验仓库内置的全部赛季
 */
import { validateSeason } from "../src/season/validate";
import { SEASONS } from "../src/data/seasons";
import { CHARACTER_BY_ID } from "../src/data/characters";
import { draftPath, fileExists, parseArgs, readJson } from "./lib";

const args = parseArgs(process.argv.slice(2));
const knownCharacterIds = new Set(CHARACTER_BY_ID.keys());

const targets: { label: string; data: unknown }[] = [];

if (typeof args.file === "string") {
  targets.push({ label: args.file, data: readJson(args.file) });
} else if (typeof args.season === "string") {
  const path = draftPath(args.season);
  if (fileExists(path)) targets.push({ label: path, data: readJson(path) });
  const builtin = SEASONS.find((s) => s.id === args.season);
  if (builtin) targets.push({ label: `内置赛季 ${builtin.id}`, data: builtin });
  if (targets.length === 0) {
    console.error(`✗ 找不到赛季 ${args.season}`);
    process.exit(1);
  }
} else {
  for (const season of SEASONS) targets.push({ label: `内置赛季 ${season.id}`, data: season });
}

let failed = false;
for (const target of targets) {
  const result = validateSeason(target.data, { knownCharacterIds });
  const errors = result.issues.filter((i) => i.severity === "error");
  const warnings = result.issues.filter((i) => i.severity === "warning");

  console.log(`\n## ${target.label}`);
  console.log(`   ok=${result.ok}  canPublish=${result.canPublish}`);
  for (const issue of errors) {
    console.error(`   ✗ [${issue.code}] ${issue.path}: ${issue.message}`);
  }
  for (const issue of warnings) {
    console.warn(`   ! [${issue.code}] ${issue.path}: ${issue.message}`);
  }
  if (!result.ok) failed = true;
}

if (failed) {
  console.error("\n✗ 存在未通过校验的赛季配置");
  process.exit(1);
}
console.log("\n✓ 全部赛季配置校验通过");
