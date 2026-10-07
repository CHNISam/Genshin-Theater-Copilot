# Backlog

> 唯一执行状态。Google Sheet 负责项目级 Goals / Ideas / Docs；这里负责“现在做什么、为什么、做到什么算完成”。
>
> 原则：先用真实剧诗验证工具是否真的降低决策摩擦，再决定要不要继续做 UI、自动化或更多功能。不要因为已有 CLI 就围绕 CLI 优化。

## NOW

### B-001 — 跑通一次真实账号端到端使用流程
**Outcome**  
玩家从“打开工具 + 当前游戏画面/账号状态”开始，能得到下一步可执行建议，并持续完成一轮真实幻想真境剧诗；不要求玩家理解内部 JSON schema、证据 ID 或命令组合。

**Why now**  
v1.0.0 的 guard、状态机和 portable 发布已经验证，但真实操作体验仍未验证。当前最明显的问题不是规则不够，而是“打开 CLI 之后到底该干什么”不够自然。

**Scope**
- 用当前 v1.0.0 做一次真实 run dogfood。
- 记录每个需要用户手工理解 CLI / JSON / 文件流转的摩擦点。
- 区分：AI 应该承担的判断、Harness 应该机械执行的 gate、用户必须提供的真实观察。
- 不先假设答案必须是 GUI、OCR 或游戏内集成。

**Proof**
- 至少一轮真实账号流程从初始化走到结束/明确停止。
- 用户不需要手工编辑内部 JSON 才能继续。
- 每次试战前能清楚回答“为什么现在允许/不允许试”；失败后能清楚回答“下一步是什么”。

---

### B-002 — 收敛默认操作面：CLI 做幕后 Harness，而不是让用户学 CLI
**Outcome**  
定义一个默认的人类使用路径，让 theater.cmd / CLI 只承担 guard、状态和审计；用户主要面对的是连续的决策流程，而不是命令字典。

**Depends on**  
B-001 的真实摩擦证据。

**Candidate directions**
- 改良现有交互菜单；
- 由 AI 生成/更新 package，CLI 只执行；
- 轻量前端或其他交互壳。

这些只是候选，不在真实 dogfood 前锁定实现。

**Proof**
- 新用户只看 Quick Start 就能解释“我现在要提供什么、系统会返回什么、下一步怎么继续”。
- 正常流程不需要记忆 sync / next / prepare / reroute / record 的区别。

## NEXT

### B-003 — 用真实实战校准停磨阈值
当前 2 次无有效改善 / 10pp / 单关 6 次或 900 秒 是可执行 baseline，不视为最终真理。

**Proof**：来自真实 run 的尝试序列能够说明阈值是否过早阻塞、过晚停磨或基本合理；必要时调整并补 regression。

### B-004 — 补齐现期精确 Buff 分支证据
精确祝福分支/数值仍保持 unknown，不得用旧期资料或标题推断。

**Proof**：获得可检查的本期来源，更新 season pack，并通过 validate-season + 相关回归。

### B-005 — 复核无法从历史文本还原的缺失证据
历史缺失图片/被删内容只在能够重新取得原始或等价证据时补；否则继续明确标记 unresolved，不阻塞无关路径。

## PARKED

- 完整 GUI / Web App。
- OCR / 自动读游戏画面。
- 游戏进程集成或自动操作。
- 后台 B 站/攻略监控。
- 更复杂的优化器、数据库或框架。

只有 B-001/B-002 证明现有轻量路径无法达到目标时，才把对应能力从 PARKED 提升。

## DONE

### v1.0.0 — 首个正式 portable Release
- Windows x64 portable 包发布；无需用户安装 Python。
- 未来路线 guard：SAFE / CONDITIONAL / BROKEN、动态招募和替代路线。
- 当前战斗合同、一次试战授权、实战记录、重复不收敛停磨、总预算、证据重规划。
- 八份历史资料去重沉淀为案例/回归。
- 52 项测试通过；原生 Windows portable smoke 通过。
- Release ZIP 已实际下载验证，校验和与实测资产一致。

## Backlog rules

- NOW 只放当前真正要推进的工作。
- 新想法先进入 Google Sheet Ideas；只有确定要执行才进入这里。
- 每个重要任务必须写 Outcome 和 Proof；不要把“写文档/加命令”当成 Outcome。
- 一个问题已有验证 closure 时，不重复造第二套机制。
- 实战证据推翻假设时，改 Backlog，不维护旧计划的面子。
