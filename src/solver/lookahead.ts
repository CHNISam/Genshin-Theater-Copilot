/**
 * 前瞻与死路检测。
 *
 * 保守假设：**不假设后续会随机解锁到新角色**。只用当前已解锁且仍有耐力的角色
 * 去验证剩余关卡是否仍然存在可行路线。这样得到的"无解"结论偏保守，
 * 但不会给用户一个依赖运气才成立的安全承诺。
 *
 * 不输出任何概率，只输出：可行路线数量、最早失败的关卡、是否仍有解。
 */
import type { SeasonConfig, StageConfig } from "../domain/types";
import type { TeamMember } from "./roster";
import { searchTeams, type TeamContext } from "./team";

export interface LookaheadOptions {
  /** 最多向前看几关。默认看到赛季结束。 */
  depth?: number;
  /** 束宽。 */
  beamWidth?: number;
  /** 每关保留的候选队伍数。 */
  candidatesPerStage?: number;
}

export interface PathStep {
  stageId: string;
  stageName: string;
  memberIds: string[];
}

export interface LookaheadResult {
  feasible: boolean;
  /** 实际检查了几关。 */
  stagesChecked: number;
  /** 最早无解的关卡。 */
  failedStageId?: string;
  failedStageName?: string;
  /** 束搜索结束时仍存活的路线数量（多样性指标，**不是概率**）。 */
  routeCount: number;
  bestPath: PathStep[];
}

interface BeamNode {
  vigor: Record<string, number>;
  path: PathStep[];
  score: number;
}

export interface LookaheadInput {
  season: SeasonConfig;
  /** 已按 override 解析好的、按 order 升序的未来关卡。 */
  futureStages: StageConfig[];
  /** 已解锁的角色（含耐力为 0 的，函数内部会过滤）。 */
  unlockedMembers: TeamMember[];
  vigor: Record<string, number>;
  buffLevels: Record<string, number>;
}

export function lookahead(
  input: LookaheadInput,
  options: LookaheadOptions = {},
): LookaheadResult {
  const depth = options.depth ?? input.futureStages.length;
  const beamWidth = options.beamWidth ?? 4;
  const candidates = options.candidatesPerStage ?? 3;
  const stages = input.futureStages.slice(0, depth);

  let beam: BeamNode[] = [{ vigor: { ...input.vigor }, path: [], score: 0 }];

  for (const stage of stages) {
    const next: BeamNode[] = [];
    for (const node of beam) {
      const pool = input.unlockedMembers.filter((m) => (node.vigor[m.base.id] ?? 0) > 0);
      const ctx: TeamContext = {
        season: input.season,
        stage,
        buffLevels: input.buffLevels,
      };
      const { feasible } = searchTeams(pool, ctx, {
        limit: candidates,
        poolLimit: 11,
      });
      for (const team of feasible) {
        const vigor = { ...node.vigor };
        for (const id of team.memberIds) vigor[id] = (vigor[id] ?? 0) - 1;
        next.push({
          vigor,
          path: [
            ...node.path,
            { stageId: stage.id, stageName: stage.name, memberIds: team.memberIds },
          ],
          score: node.score + team.total,
        });
      }
    }

    if (next.length === 0) {
      return {
        feasible: false,
        stagesChecked: stages.indexOf(stage),
        failedStageId: stage.id,
        failedStageName: stage.name,
        routeCount: 0,
        bestPath: beam[0]?.path ?? [],
      };
    }

    next.sort((a, b) => b.score - a.score);
    beam = dedupe(next).slice(0, beamWidth);
  }

  return {
    feasible: true,
    stagesChecked: stages.length,
    routeCount: beam.length,
    bestPath: beam[0]?.path ?? [],
  };
}

/** 去掉耐力分布完全相同的重复节点，保留路线多样性。 */
function dedupe(nodes: BeamNode[]): BeamNode[] {
  const seen = new Set<string>();
  const out: BeamNode[] = [];
  for (const node of nodes) {
    const key = Object.entries(node.vigor)
      .filter(([, v]) => v > 0)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}:${v}`)
      .join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(node);
  }
  return out;
}

/**
 * 两场安全线：任何节点上，接下来两场都应各自存在至少一套可行阵容。
 * 固定机制关需要更长前瞻，因此这里只是最低容灾底线。
 */
export function twoStageSafety(input: LookaheadInput): LookaheadResult {
  return lookahead(input, { depth: 2, beamWidth: 4, candidatesPerStage: 4 });
}

export type RiskLevel = "low" | "medium" | "high";

export interface RouteDiversity {
  routeCount: number;
  risk: RiskLevel;
  /** 距离最近的不可解关卡还有几关；undefined 表示当前深度内没有发现死路。 */
  stagesUntilDeadEnd?: number;
}

/** 只输出风险等级与路线数量，不伪造概率。 */
export function routeDiversity(result: LookaheadResult): RouteDiversity {
  if (!result.feasible) {
    return {
      routeCount: 0,
      risk: "high",
      stagesUntilDeadEnd: result.stagesChecked,
    };
  }
  const risk: RiskLevel = result.routeCount >= 3 ? "low" : result.routeCount === 2 ? "medium" : "high";
  return { routeCount: result.routeCount, risk };
}
