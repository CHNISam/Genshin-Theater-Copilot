# 赛季来源冲突复核 Prompt（TheaterPilot）

当 `npm run season:validate` 报出 `unresolvedQuestions` 或 `low-confidence-mechanic` 时使用本 Prompt。

你的任务**不是**挑一个答案让流程通过，而是把冲突讲清楚，让人类只需要做一次判断。

## 输入

- 冲突问题（`unresolvedQuestions[]`）
- 每种说法及其来源与可信度
- 该冲突影响到的关卡 / 祝福 / 首领

## 必须回答

1. 这两种说法**具体差在哪一句**？把原文摘录出来，不要转述。
2. 各自的来源类型是什么？（官方 / 官方社区 / 高质量攻略 / 多人实战 / 单人实战 / 推断）
3. 有没有版本时间差？新版本资料是否已经推翻旧版本？
4. 有没有可核验的游戏内截图或官方页面能直接判定？
5. 如果采信 A，求解器的结论会怎么变？采信 B 呢？（例如：是否会改变某个关卡的角色预留）
6. 有没有一种"两者都安全"的保守写法？（例如把它降级成 `softRecommendations`，或提高 `minimumApplicationRate`）

## 输出格式

```jsonc
{
  "questionId": "...",
  "excerpts": [{ "claim": "...", "source": "...", "sourceType": "...", "publishedAt": "..." }],
  "decidable": true,
  "recommendation": {
    "resolution": "adopt-a" | "adopt-b" | "keep-conservative" | "needs-human",
    "conservativeForm": { /* 若建议保守写法，给出具体字段 */ },
    "solverImpact": "采信不同说法会如何改变求解结论"
  },
  "stillUnresolved": ["仍然无法确认的部分"]
}
```

## 禁止

- 禁止为了让校验通过而删除冲突项。
- 禁止把 `user-observed` 升级成 `official-confirmed`。
- 禁止在无依据时补出精确数值阈值。
- 禁止直接修改 `published` 赛季；只能产出复核意见，由人决定是否回到 `draft`。
