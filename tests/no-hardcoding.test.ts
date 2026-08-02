import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CHARACTERS } from "../src/data/characters";

const SOLVER_DIR = resolve(process.cwd(), "src/solver");

function solverSources(): { file: string; content: string }[] {
  return readdirSync(SOLVER_DIR)
    .filter((f) => f.endsWith(".ts"))
    .map((file) => ({ file, content: readFileSync(resolve(SOLVER_DIR, file), "utf8") }));
}

describe("求解器边界", () => {
  it("22. 求解器中不得出现针对特定角色或测试账号的硬编码", () => {
    const offenders: string[] = [];
    for (const { file, content } of solverSources()) {
      for (const character of CHARACTERS) {
        // 中文名：直接子串匹配
        if (content.includes(character.name)) {
          offenders.push(`${file} 出现角色名「${character.name}」`);
        }
        // 英文 id：按标识符边界匹配，避免误伤普通英文单词
        const idPattern = new RegExp(`["'\`]${character.id}["'\`]`);
        if (idPattern.test(content)) {
          offenders.push(`${file} 出现角色 id "${character.id}"`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("求解器不依赖 React / DOM / 网络", () => {
    const forbidden = [/from\s+["']react/, /\bdocument\./, /\bwindow\./, /\bfetch\(/, /localStorage/];
    const offenders: string[] = [];
    for (const { file, content } of solverSources()) {
      for (const pattern of forbidden) {
        if (pattern.test(content)) offenders.push(`${file} 命中 ${pattern}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("求解器不调用大模型或外部服务", () => {
    const offenders: string[] = [];
    for (const { file, content } of solverSources()) {
      if (/anthropic|openai|claude|gpt-|https?:\/\//i.test(content)) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });
});
