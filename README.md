# TheaterPilot · 剧诗领航

《原神》幻想真境剧诗的**非官方**动态规划工具。

它不是攻略站。它回答的是每一步的具体问题：

> 现在应该选角色、选祝福、刷新还是开战；下一关用什么队；哪些角色必须保留；当前选择会不会导致后面无解。

幻想真境剧诗不是普通配队问题，而是一个 **有限角色耐力 ＋ 随机角色解锁 ＋ 随机祝福 ＋ 有限货币 ＋ 固定机制关卡** 组成的动态约束规划问题。因此本工具的优化目标不是单场伤害最高，而是**整条路线始终存在可行解**。

```
求解优先级
关卡硬机制可解 → 生存条件满足 → 队伍体系运转 → 后续关卡仍有解 → 稀缺资源消耗合理 → 祝福收益 → 单场输出
```

任何高伤害评分都不能覆盖未满足的关卡硬机制。

---

## 快速开始

```bash
npm install
npm run dev        # 打开本地界面
npm run verify     # lint + typecheck + test + build
```

使用流程：

1. **角色池**：粘贴一份角色名字列表（支持社区昵称与常见错字），只需标注「核心 / 可用 / 挂件 / 不使用」四档练度。不需要填武器、圣遗物、面板。
2. **开局规划**：得到助演推荐、核心作战模块、稀缺资源、必须保留角色、关键角色获取截止点、首领与圣牌预案、祝福投资方向、基准路线。
3. **局内助手**：录入当前解锁与耐力（可粘贴文本批量识别），得到下一场推荐阵容、主/备方案、不可消耗角色、事件选择建议、是否刷新、未来两场是否仍有解。

所有数据保存在浏览器本地，可导出 / 导入 JSON。**不需要账号密码，不需要米游社 Cookie，不上传任何凭证或截图。**

---

## 三段式架构

| 部分 | 位置 | 职责 |
| --- | --- | --- |
| A 赛季研究与数据打包 | `src/season`、`prompts`、`scripts` | 每期开始前由 Agent 联网研究一次，产出结构化赛季包 |
| B 用户低摩擦导入 | `src/importers` | 名字粘贴 / JSON / 本地 OCR，结果一律带可信度 |
| C 确定性求解器 | `src/solver` | 运行时不联网、不调用大模型，纯函数约束搜索 |

三者解耦。求解器不认识任何具体角色——`tests/no-hardcoding.test.ts` 会强制检查这一点。

### A. 赛季研究流水线

每期运行一次：

```
发现赛季 → 收集官方信息 → 收集补充资料 → 提取结构化事实 → 区分事实/推断/经验
→ 交叉验证 → 标记可信度 → 生成赛季配置 → 执行校验 → 输出变更摘要 → 人工只审核低可信或冲突项
```

```bash
npm run season:research -- --season=2026-09          # 生成研究任务与完整 Prompt
npm run season:import  -- --season=2026-09 --file=out.json   # 导入 Agent 结果并给出差异摘要
npm run season:validate                               # 结构 + 语义校验
npm run season:publish -- --season=2026-09            # draft → review → published
```

- Prompt 见 [`prompts/season-research.md`](prompts/season-research.md)；来源冲突复核见 [`prompts/season-conflict-review.md`](prompts/season-conflict-review.md)。
- Provider 是可插拔的（`ManualAgentResearchProvider` / `CliAgentResearchProvider` / `ImportedResearchProvider`），核心不绑定任何一家模型 API。
- **草稿未通过校验、或存在阻塞性来源冲突时不能发布**。冲突原样保留在 `unresolvedQuestions` 中，不由 Agent 自行消解。

每条赛季事实都带来源与可信度：

```ts
type EvidenceType =
  | "official-confirmed"   // 官方公告 / 更新说明 / 游戏内规则
  | "community-confirmed"  // 长期维护的资料页、多来源一致
  | "user-observed"        // 单次实战观察（最高只能标 medium）
  | "inferred"
  | "unknown";
```

并且严格区分：**事实**（本期限制水雷冰）／**机制事实**（某首领会展开水元素护盾）／**经验结论**（高频冰附着是可靠解）／**策略推断**（应为某角色预留耐力 —— 这一条不写进赛季包，由求解器自己算）。

### C. 求解器如何保障机制与耐力

- **硬机制是过滤器，不是加分项。** `checkRequirement()` 区分元素/反应/破盾/治疗范围/控制/抗打断/专项机制；同元素的低频附着不能满足高频需求；单体治疗不能满足全队掉血。
- **预留由数据推导，不由人写死。** `computeReservations()` 用「未来固定关卡的硬机制 × 当前可提供者的剩余耐力」推出预留；提供者充足时不产生预留（生存位不会被误判成唯一刚需），唯一解且两场之内会升级为 `hard`。
- **消耗前检查。** `wouldConsumeReservedVigor()` 拦截会动用预留的排队方案，并给出人话解释；解除预留只接受五种理由（获得替代 / 关卡变化 / 证据被推翻 / 已无路线 / 用户主动担风险）。
- **前瞻与死路检测。** `lookahead()` 用束搜索保守推演（**不假设后续会随机抽到新角色**），既守住"未来两场都有解"的底线，也能提前发现更远处的断裂点。
- **稀缺代价进入评分。** `elementScarcity()` 从「多少主 C 刚需该元素」与「该元素还剩多少次出场」动态算出紧缺度，避免把紧张的辅助资源在前期烧掉。

### 不伪造概率

样本不足时不输出任何概率。取而代之的是：可行路线数量、关键机制的替代者数量、低/中/高风险、最坏情况下是否仍有解。`tests/assistant.test.ts` 会检查输出中不出现"概率/几率"。

---

## 目录

```
src/
  domain/        纯类型与常量
  season/        schema / 校验 / 发布流程 / 研究 provider
  solver/        确定性求解器（纯函数，不 import React、DOM、网络）
  importers/     名字粘贴 / JSON / 本地 OCR，输出带 DetectedValue 可信度
  data/          角色、别名、赛季包
  features/      UI 面板
  storage/       本地持久化与导入导出
prompts/         赛季研究与冲突复核 Prompt
scripts/         赛季研究 / 导入 / 校验 / 发布 CLI
tests/           41 个测试，覆盖 22 条强制规则
```

---

## 当前仍依赖经验数据的部分

赛季包 `src/data/seasons/2026-08.ts` 中，以下条目来源为**单次实战观察，可信度 medium**，需要下一次真实对局验证：

- 第 4 幕附近的守护关位置与"不必消耗强力主 C"的判断；
- 第 8 幕首领的水元素护盾，以及破盾所需的冰附着效率阈值（`minimumEfficiency: 2.5` 是估计值）；
- 两场圣牌挑战的全队持续掉血强度（`minimumStrength: 2.5`）；
- 第 3 / 6 / 10 幕尚未记录任何硬机制，校验会给出 `boss-without-mechanic` 警告。

角色能力标签（附着频率、治疗范围、控制强度）来自公开认知，属于 `inferred`，不是官方数值。

`unresolvedQuestions` 中保留了两条尚未判定的冲突，见「赛季数据」页。

---

## 边界

- 非官方项目，与米哈游 / HoYoverse 无关，不使用官方美术资源。
- 不索取账号密码或米游社 Cookie，不上传截图或角色数据。
- 不做完整伤害模拟，不提供"保证通关"的承诺。
- 运行时不依赖大模型做最终判断。

开发规范见 [`CLAUDE.md`](CLAUDE.md)，发布治理见 [`docs/release-governance.md`](docs/release-governance.md)。
