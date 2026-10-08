# 轻量 Harness 边界

执行顺序以 [SOP](SOP.md) 为准。现有未来路线搜索仍是核心之一。

- `src/theater_guard.py`：纯战略资源分配。Checkpoint alternatives、SAFE/CONDITIONAL/BROKEN、动态候选排序、真实备选均保留；不构造完整战斗队，也不假装知道概率。
- `src/fight_guard.py`：固定策略阈值，最佳可比进度、连续无进展、机制失败、总预算，和去掉名称/备注的实质方案标识。
- `src/harness.py`：当前关事实/能力/证据/四人检查；trial ticket→record；stop→有证据的reroute；已过→next；统一快照与资源事务。失败事务不会修改原状态。
- `src/agent_state.py`：Agent 原生 Python 适配、intake/完整 snapshot、追加式云端 checkpoint 编解码与冲突检测。复用同一 Harness；不运行模型或服务。
- `src/cli.py`：可选 CLI/文本菜单，JSON 导入与原子保存、备份、并发锁。两个机械执行适配器调用相同 guard；纯 SOP 协助没有机械执行保护。无需第三方依赖。

SOP 负责来源语义、实战差异、能力标签条件、正确度量与真正变更的人工判断。机械部分负责类型/作用域/状态/资源/停止阈值，不能把人工评审标签理解成自动计算已证明伤害够。

Run JSON 是受信用户数据，不是防篡改数据库；可读便于 AI 协作，正常命令不允许覆盖 objective/completion/attempt journal。没有后台进程、OCR、游戏控制、完整角色数据库、自动调研模型依赖。旧 account/plan 仅保留范围明确的知识；公用事实、账号事实、policy 与 run 仍分离。

Portable ZIP 使用官方 SHA-256 固定的 CPython 3.13.12 embeddable，`_pth` 加入本包目录、隔离系统环境；`.cmd` 是用户入口。源码包不含运行时；Windows包带源码/模板/核心 tests，以便同一规则检查。本机 Linux 构建不能证明 Windows可运行；原生 Windows CI 先验证 ZIP 才有权限发布 Release。

通用 AI 的宿主工具负责 GitHub / 研究 / 视觉 / Python / Sheets。共享 Sheet 使用单写者日志协议，不是服务器锁；完整保护与降级见 [agent-runtime](agent-runtime.md)，真实支持范围见 [agent-validation](agent-validation.md)。
