/**
 * npm run season:publish -- --season=2026-09
 *
 * draft → review → published。任何一步校验失败都会中止，
 * 研究结果不得未经校验直接进入生产配置。
 */
import type { SeasonConfig } from "../src/domain/types";
import { transitionSeason } from "../src/season/lifecycle";
import { validateSeason } from "../src/season/validate";
import { CHARACTER_BY_ID } from "../src/data/characters";
import { draftPath, fail, fileExists, parseArgs, publishedPath, readJson, writeJson } from "./lib";

const args = parseArgs(process.argv.slice(2));
const seasonId = typeof args.season === "string" ? args.season : undefined;
if (!seasonId) fail("必须指定 --season=<id>");

const path = draftPath(seasonId);
if (!fileExists(path)) fail(`找不到草稿 ${path}，请先运行 season:import`);

const raw = readJson(path);
const knownCharacterIds = new Set(CHARACTER_BY_ID.keys());
const validation = validateSeason(raw, { knownCharacterIds });

if (!validation.ok || !validation.season) {
  console.error("✗ 草稿未通过校验，不能发布：");
  for (const issue of validation.issues.filter((i) => i.severity === "error")) {
    console.error(`  - [${issue.code}] ${issue.path}: ${issue.message}`);
  }
  process.exit(1);
}

const blocking = validation.season.unresolvedQuestions.filter((q) => q.blocksPublish);
if (blocking.length > 0) {
  console.error("✗ 存在阻塞发布的来源冲突，必须先人工审核（见 prompts/season-conflict-review.md）：");
  for (const q of blocking) console.error(`  - ${q.id}: ${q.question}`);
  process.exit(1);
}

let season: SeasonConfig = validation.season;
if (season.status === "draft") {
  const toReview = transitionSeason(season, "review", { knownCharacterIds });
  if (!toReview.ok || !toReview.season) fail(toReview.reason ?? "draft → review 失败");
  season = toReview.season;
  console.log("✓ draft → review");
}

if (season.status !== "review") {
  fail(`当前状态为 ${season.status}，只有 review 状态才能发布`);
}

const published = transitionSeason(season, "published", { knownCharacterIds });
if (!published.ok || !published.season) fail(published.reason ?? "review → published 失败");

const out = publishedPath(seasonId);
writeJson(out, published.season);
console.log(`✓ review → published`);
console.log(`✓ 已写出：${out}`);
console.log("  请把该文件登记进 src/data/seasons/index.ts 后再提交。");
