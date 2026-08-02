# 赛季研究 Prompt（TheaterPilot）

你正在为 TheaterPilot 更新幻想真境剧诗赛季数据。

目标不是写攻略文章，而是生成可供**约束求解器**使用的结构化事实。产品运行时不会联网、不会调用大模型，你产出的数据就是求解器唯一的知识来源。因此宁可标注"未确认"，也不要给出看起来完整但没有依据的结论。

## 必须依次完成

1. 确认赛季开始与结束时间。
2. 确认允许元素。
3. 确认开幕角色与特邀角色。
4. 确认当期所有辉彩祝福：
   - 反应类别；
   - 1 至 4 级效果；
   - 分支（哪一级出现、各分支效果）；
   - 费用；
   - 是否存在版本调整。
5. 确认固定幕数及首领：
   - 第 3、6、8、10 幕；
   - 两场圣牌挑战；
   - 其他已知固定事件。
6. 对每个固定敌人提取：
   - 硬机制；
   - 有效元素；
   - 有效反应；
   - 所需附着频率（低 / 中 / 高）；
   - 护盾或特殊阶段；
   - 生存要求；
   - 控制要求；
   - 不推荐方案及原因。
7. 区分下列四类，不得混为一谈：
   - 官方确认（`official-confirmed`）；
   - 多来源确认（`community-confirmed`）；
   - 单一实战观察（`user-observed`）；
   - 推断（`inferred`）。
8. **不输出没有依据的精确概率**（角色出现概率、Buff 出现概率、通关概率、刷新收益概率一律禁止）。
9. 对来源冲突进行说明，写进 `unresolvedQuestions`，**不得自行消除冲突**。
10. 输出：
    - 机器可读赛季配置；
    - 来源清单；
    - 不确定事项；
    - 与上一期的差异；
    - 需要人工复核的项目。

## 来源优先级（必须按此顺序）

1. 官方公告、官方更新说明、游戏内规则；
2. 官方社区或官方发布的玩法说明；
3. 能提供完整实战证据的高质量攻略；
4. 多个玩家一致确认的实战观察；
5. 单一用户反馈。

冲突处理：

- 官方明确说明优先；
- 新版本资料优先于旧版本；
- 实际游戏截图可用于纠正过时攻略；
- 无法确认时不得伪装成确定事实。

## 事实分类的粒度要求

必须明确区分下面四种陈述，并放进不同字段：

| 类型 | 例子 | 落到哪里 |
| --- | --- | --- |
| 事实 | 本期限制水、雷、冰 | `allowedElements` + `official-confirmed` 来源 |
| 机制事实 | 第 8 幕首领会展开水元素护盾 | `stages[].hardRequirements` + 对应来源与 confidence |
| 经验结论 | 高频冰附着角色是该机制的可靠解 | `stages[].note` 或 `bosses[].notRecommended` 的反面说明 |
| 策略推断 | 应为该角色预留一点耐力 | **不要写进赛季包**，这是求解器自己算的 |

策略推断不得写成官方规则。角色专属结论不得写进求解器可直接消费的硬机制字段——硬机制只描述"关卡需要什么能力"，不描述"应该用谁"。

## 机制字段写法

`hardRequirements` 只能使用以下形态之一：

- `{ type: "element", acceptedElements, minimumApplicationRate }`
- `{ type: "reaction", acceptedReactions, minimumTriggerRate }`
- `{ type: "shield-break", shieldElement, effectiveElements, minimumEfficiency }`
- `{ type: "healing", scope: "active-character" | "party-wide", minimumStrength }`
- `{ type: "control", minimumStrength }`
- `{ type: "interrupt-resistance", minimumStrength }`
- `{ type: "custom", mechanicId, minimumStrength? }`

注意：

- 全队持续掉血必须写 `scope: "party-wide"`，不能写成 `active-character`；
- 需要高频附着时必须写 `minimumApplicationRate: "high"`，否则求解器会误判低频同元素角色可用；
- 不确定阈值时，宁可放进 `softRecommendations` 或 `unresolvedQuestions`，也不要编一个精确数字当硬机制。

## 可信度

每条 `sourceRecords` 都需要 `confidence`：`confirmed | high | medium | low`。
`stages[].confidence` 取该关卡所依据来源中的最低值。

单一实战观察最高只能给 `medium`。

## 输出格式

输出一个 JSON 对象：

```jsonc
{
  "season": { /* 符合 SeasonConfig schema，status 必须为 "draft" */ },
  "notes": "研究说明",
  "diffFromPrevious": ["与上一期的差异，逐条列出"],
  "needsHumanReview": ["需要人工复核的项目"]
}
```

产出后由 `npm run season:import` 导入、`npm run season:validate` 校验，只有通过校验且没有阻塞性 `unresolvedQuestions` 的草稿才能进入 `published`。
