/**
 * npm run season:research -- --season=2026-09
 *
 * 生成一份完整的赛季研究任务文件（含可直接交给 Agent 的 Prompt）。
 * 不绑定任何模型 API：可以把 Prompt 交给任意 Agent，也可以由 CliAgentResearchProvider 自动执行。
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildResearchPrompt } from "../src/season/research";
import { SEASONS } from "../src/data/seasons";
import { fail, parseArgs, ROOT, taskPath, writeText } from "./lib";

const args = parseArgs(process.argv.slice(2));
const seasonId = typeof args.season === "string" ? args.season : undefined;
if (!seasonId) fail("必须指定 --season=<id>，例如 --season=2026-09");

const focus =
  typeof args.focus === "string" ? args.focus.split(";").filter(Boolean) : undefined;

const template = readFileSync(resolve(ROOT, "prompts/season-research.md"), "utf8");
const previous = [...SEASONS]
  .filter((s) => s.id !== seasonId)
  .sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt))[0];

const prompt = buildResearchPrompt({
  seasonId,
  previousSeason: previous,
  promptTemplate: template,
  requestedAt: new Date().toISOString(),
  ...(focus ? { focusQuestions: focus } : {}),
});

const path = taskPath(seasonId);
writeText(
  path,
  [
    `# 赛季研究任务：${seasonId}`,
    "",
    `- 生成时间：${new Date().toISOString()}`,
    `- 上一期基线：${previous?.id ?? "（无）"}`,
    "",
    "## 使用方式",
    "",
    "1. 把下面整段 Prompt 交给具备联网能力的 Agent。",
    `2. 把 Agent 返回的 JSON 存成文件，然后执行：`,
    "",
    "```bash",
    `npm run season:import -- --season=${seasonId} --file=<agent-output.json>`,
    "```",
    "",
    "3. 校验通过且没有阻塞性冲突后，再执行 `npm run season:publish`。",
    "",
    "---",
    "",
    prompt,
    "",
  ].join("\n"),
);

console.log(`✓ 已生成研究任务：${path}`);
console.log(`  下一步：把该文件中的 Prompt 交给 Agent，再用 season:import 导入结果。`);
