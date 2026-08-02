# 发布治理规范（TheaterPilot）

本文件是 [`CLAUDE.md`](../CLAUDE.md) "Git 工作流"章节的展开。两者冲突时以 `CLAUDE.md` 的条款为准。

## 1. 分支模型（受控 GitFlow）

| 分支 | 来源 | 合入目标 | 说明 |
| --- | --- | --- | --- |
| `main` | `release/*`、`hotfix/*` | — | 生产分支。只保存可发布、可追溯的生产版本，禁止直接开发或直接提交。 |
| `develop` | `main` | `release/*` | 集成分支。单人开发的默认落地分支。 |
| `feature/*` | `develop` | `develop` | 功能开发。本地完成全量检查后合入 `develop`。 |
| `release/*` | `develop` | `main` + `develop` | 发布候选。经 staging 与 RC 验收并获用户明确确认后才可合入 `main`。 |
| `hotfix/*` | `main` 上的稳定标签 | `main` + `develop` | 生产缺陷修复，必须同时回合两条线。 |

单人开发时 PR 不是强制门禁；多人协作、需要异步审查或外部贡献时才使用 PR。

## 2. 提交规范

Conventional Commits：`<type>[optional scope]: <description>`

允许的 type：`feat`、`fix`、`docs`、`style`、`refactor`、`perf`、`test`、`build`、`ci`、`chore`、`revert`。

示例：

```
feat(solver): 增加固定机制角色的耐力预留检查
fix(season): 草稿含未解决冲突时阻止发布
docs(release): 补充 RC 验收顺序
```

## 3. 版本与标签

- 稳定版本：`vX.Y.Z`，必须对应一个已发布（非 Draft、非 Prerelease）的 GitHub Release。
- 发布候选：`vX.Y.Z-rc.N`，对应的 GitHub Release 必须保持 Draft / Prerelease 状态。
- 标签只能打在 `main`（稳定）或 `release/*`、`hotfix/*`（RC）上。

## 4. 发布顺序（不得跳步）

```
develop
  → release/x.y.z
  → 部署到 staging（受 Cloudflare Access 保护）
  → 人工验收通过
  → 创建 vX.Y.Z-rc.N 标签 + Draft/Prerelease GitHub Release
  → RC 再次人工确认
  → 合入 main，创建 vX.Y.Z 标签 + 正式 GitHub Release
  → production 环境人工批准后，部署已发布稳定 Release 的校验产物
```

任何环节失败都必须回到 `release/*` 修复后重新走流程，不得就地补发。

## 5. 环境边界

| 环境 | Cloudflare Pages 项目 | 访问控制 | 允许部署内容 |
| --- | --- | --- | --- |
| staging | 独立项目 | Cloudflare Access 强制保护 | `release/*`、`hotfix/*` |
| production | 独立项目 | 公开 | 仅已发布稳定 Release 的校验产物 |

- 两个环境必须使用不同的环境变量与访问边界，不得共用。
- staging 在验证 Access 挑战生效之前，不得部署任何业务页面。

## 6. 生产发布开关

- `PRODUCTION_RELEASE_ENABLED` 默认为 `false`。
- 生产后端与持久化方案未正式确认前不得开启。
- 禁止通过本地 Wrangler、Cloudflare 控制台手工上传或任何其他旁路方式发布生产。

## 7. 破坏性操作前置检查

执行改写历史、强制推送、覆盖文件、删除分支或标签之前，必须先确认并记录：

1. 当前分支与跟踪关系（`git status -sb`）；
2. 工作区是否干净（存在与任务无关的改动时必须保留并绕开）；
3. 远端状态（`git remote -v`、`git ls-remote`）；
4. 操作影响范围；
5. 用户的明确授权。

缺少任一项时不得执行。

## 8. 完成判定

在声称任何 Git 操作完成之前，必须以最新命令输出验证：分支、跟踪关系、工作区状态、标签、Release 以及相关远端结果。不得以"应该已经生效"作为结论。
