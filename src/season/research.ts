/**
 * 赛季研究流水线。
 *
 * 运行时产品**不**联网、**不**调用大模型。研究只发生在每期开始前，
 * 由 Agent 完成，产出结构化事实，经校验后才成为赛季包。
 *
 * 这里只定义接口与 Prompt 组装，不绑定任何一家模型 API。
 */
import type { SeasonConfig } from "../domain/types";
import { validateSeason, type ValidateOptions, type ValidationResult } from "./validate";
import { diffSeasons, type SeasonDiff } from "./lifecycle";

export interface SeasonResearchRequest {
  /** 目标赛季标识，例如 "2026-09"。 */
  seasonId: string;
  /** 上一期赛季包，用于生成差异与继承规则基线。 */
  previousSeason?: SeasonConfig;
  /** 额外提示：用户已知的观察、想重点确认的问题。 */
  focusQuestions?: string[];
  /** 研究 Prompt 模板（默认读取 prompts/season-research.md）。 */
  promptTemplate: string;
  requestedAt: string;
}

export interface SeasonResearchDraft {
  seasonId: string;
  /** Agent 返回的赛季配置（尚未校验）。 */
  season: unknown;
  /** Agent 自述的研究说明。 */
  notes?: string;
  producedBy: string;
  producedAt: string;
}

/** 研究来源的可插拔实现。第一版允许完全手工完成回路。 */
export interface SeasonResearchProvider {
  readonly name: string;
  research(input: SeasonResearchRequest): Promise<SeasonResearchDraft>;
}

/**
 * 组装完整研究 Prompt。第一版即使无法自动调用模型，
 * 也必须能生成这段 Prompt、接受 Agent 返回的 JSON 并完成校验。
 */
export function buildResearchPrompt(input: SeasonResearchRequest): string {
  const parts: string[] = [input.promptTemplate.trim()];

  parts.push(
    [
      "",
      "---",
      "",
      "## 本次任务参数",
      "",
      `- 目标赛季：${input.seasonId}`,
      `- 请求时间：${input.requestedAt}`,
    ].join("\n"),
  );

  if (input.previousSeason) {
    const prev = input.previousSeason;
    parts.push(
      [
        "",
        "## 上一期基线（用于生成差异，不得直接照抄）",
        "",
        "```json",
        JSON.stringify(
          {
            id: prev.id,
            allowedElements: prev.allowedElements,
            openingCharacterIds: prev.openingCharacterIds,
            specialGuestIds: prev.specialGuestIds,
            buffIds: prev.buffs.map((b) => b.id),
            ruleOverrides: prev.ruleOverrides,
          },
          null,
          2,
        ),
        "```",
      ].join("\n"),
    );
  }

  if (input.focusQuestions && input.focusQuestions.length > 0) {
    parts.push(
      ["", "## 本次必须回答的重点问题", "", ...input.focusQuestions.map((q) => `- ${q}`)].join(
        "\n",
      ),
    );
  }

  parts.push(
    [
      "",
      "## 输出格式",
      "",
      "输出一个 JSON 对象，字段如下：",
      "",
      "```jsonc",
      "{",
      '  "season": { /* 符合 SeasonConfig schema，status 必须为 "draft" */ },',
      '  "notes": "研究说明",',
      '  "diffFromPrevious": ["与上一期的差异，逐条列出"],',
      '  "needsHumanReview": ["需要人工复核的项目"]',
      "}",
      "```",
      "",
      "严禁在无依据时输出精确概率。来源冲突必须保留在 unresolvedQuestions 中，不得自行消解。",
    ].join("\n"),
  );

  return parts.join("\n");
}

/** 只生成 Prompt、由人把结果贴回来的 provider。第一版默认实现。 */
export class ManualAgentResearchProvider implements SeasonResearchProvider {
  readonly name = "manual-agent";

  constructor(
    private readonly emitPrompt: (prompt: string) => void,
    private readonly readDraft: () => Promise<SeasonResearchDraft>,
  ) {}

  async research(input: SeasonResearchRequest): Promise<SeasonResearchDraft> {
    this.emitPrompt(buildResearchPrompt(input));
    return this.readDraft();
  }
}

/** 直接导入已有 JSON 草稿（例如别人跑好的研究结果）。 */
export class ImportedResearchProvider implements SeasonResearchProvider {
  readonly name = "imported";

  constructor(private readonly draft: SeasonResearchDraft) {}

  async research(): Promise<SeasonResearchDraft> {
    return this.draft;
  }
}

/** 通过外部 CLI 调用 Agent（命令由调用方注入，核心不绑定具体厂商）。 */
export class CliAgentResearchProvider implements SeasonResearchProvider {
  readonly name = "cli-agent";

  constructor(
    private readonly run: (prompt: string) => Promise<string>,
    private readonly agentLabel = "cli-agent",
  ) {}

  async research(input: SeasonResearchRequest): Promise<SeasonResearchDraft> {
    const output = await this.run(buildResearchPrompt(input));
    const parsed = JSON.parse(extractJson(output)) as {
      season: unknown;
      notes?: string;
    };
    return {
      seasonId: input.seasonId,
      season: parsed.season,
      notes: parsed.notes,
      producedBy: this.agentLabel,
      producedAt: new Date().toISOString(),
    };
  }
}

/** 从可能带 markdown 代码围栏的输出里取出 JSON。 */
export function extractJson(text: string): string {
  const fenced = text.match(/```(?:json|jsonc)?\s*([\s\S]*?)```/);
  const body = fenced?.[1] ?? text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error("研究输出中找不到 JSON 对象");
  }
  return body.slice(start, end + 1);
}

export interface ReviewedDraft {
  validation: ValidationResult;
  diff: SeasonDiff;
  draft: SeasonResearchDraft;
  /** 只有 canPublish 为 true 才允许继续走发布流程。 */
  readyForReview: boolean;
}

/** 草稿 → 校验 → 差异摘要。任何一步失败都不得进入 published。 */
export function reviewDraft(
  draft: SeasonResearchDraft,
  previous: SeasonConfig | undefined,
  options: ValidateOptions = {},
): ReviewedDraft {
  const validation = validateSeason(draft.season, options);
  const diff = validation.season
    ? diffSeasons(previous, validation.season)
    : {
        addedCharacters: [],
        removedCharacters: [],
        addedBuffs: [],
        removedBuffs: [],
        changedBuffs: [],
        addedStages: [],
        removedStages: [],
        changedStages: [],
        bossChanges: [],
        lowConfidenceItems: [],
        solverImpacting: [],
      };
  return { validation, diff, draft, readyForReview: validation.ok };
}
