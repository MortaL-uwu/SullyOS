# 跑团 · 全员先骰 + 五档检定机制

> 给「跑团」(GameApp) 加的判定机制：每回合玩家+全体队友先骰好骰子，同一次生成里由 LLM
> 判断谁的骰点构成正式检定、用什么技能，并自己算一遍成败/代价写进剧情；代码事后用同样
> 的骰点+角色数值机械复核一遍，作为存档/UI 展示的权威结果。改判定相关逻辑前必读。

## 为什么这么设计（关键背景，别翻回去重新踩坑）

这个机制经过几轮推翻重来，都是因为踩了同一类坑：

1. **最初版本**：AI 在 `checks[]` 里直接给 `success: boolean`。问题——只有成功/失败两档，
   体现不出"惊险的成功"和"离谱的失败"这种五档 CoC 式颗粒度。
2. **"不需要 AI 算成败，机械判断就行"**：三个规则系统确实都有明确数值（CoC/自由叙事是
   0-100 技能值，D&D 是技能加值），看起来可以让代码直接算。但 D&D 缺一个东西——**DC**。
   固定 DC 或随机 DC 都不符合叙事逻辑（同样是"说服守卫"，情境凶险程度完全不同），DC 本质上
   是个**语义判断**，只能靠 AI 给。
3. **"AI 只给语义（技能/DC），代码事后机械算成败，不让 AI 猜成败"**：这个方案在"数据流"
   上是对的，但漏了一个环节——**AI 写 `gm_narrative`（剧情正文）的时候，跟 `checks[]` 是在
   同一次响应里同时生成的**。如果 AI 完全不知道这次检定成不成，它没法写"锁被撬开了"还是
   "手一抖，锁扣崩断"，剧情没法推进，等于开发出了一个不能用的地雷。
4. **最终方案（当前实现）**：AI 在同一次输出里，自己顺手把这道算术题也算了（骰点 vs 技能值，
   或骰点+加值 vs 自己刚定的DC），**当成真实结果直接写进 `checks[].success/outcome`**，并照着
   这个结果写剧情——prompt 里不提"这只是估算""可能被系统覆盖"之类的话，AI 就把它当成
   确定的判定结果来写，剧情才能正常、确定地推进。
   代码拿到完整响应后，用**同样的骰点 + 角色数值表 + AI 给的 DC**（对 D&D）独立重算一遍
   （`computeCheckTier`），作为存档/UI 展示的权威判定。如果 AI 算错了（重算结果的 success 跟
   AI 报的不一致），直接 `throw`，这一回合作废、报错提示用户点"重新推演"（`handleReroll`）
   即可——不把不一致的结果落库，比"让不一致的错误结果混进存档"更安全。

一句话总结数据流：**AI 一次性算完并写好剧情 → 代码用同一批数字复核 → 一致则落库，不一致
则报错重骰**。这样只用一次 LLM 调用，AI 写剧情时手上有确定的结果可用，代码又保留了对
AI 算错的兜底手段。

## 全员先骰（`handleAction` 开头）

- 每次玩家发起行动（非系统消息、非关闭骰子），代码先给**用户 + 全体队友**各骰一次
  `resolveDiceConfig(activeGame)` 返回的骰子（freeform 可自定义，coc7 固定 d100，dnd5e 固定 d20）。
- 这些骰点**不代表都会被用上**——是否构成一次正式检定、用哪个技能，交给同一次生成判断
  （省掉一次单独的"是否需要判定"预调用，这是最早那次大改的核心动机）。
- 骰点结果通过 `rollInstruction`（prompt 里的一段）连同 `checkInstruction`（见下）一起喂给 LLM。

## 规则系统的 `checkInstruction`（`utils/trpgRuleSystems.ts`）

`RuleSystemDef.checkInstruction(opts?: { target?, hasSheet? })` 三个系统各自返回一段判定说明文本，
拼进 prompt。**这段文本让 AI 直接裁定成败并写进 `outcome`**，不含任何"这只是估算/系统会覆盖"的
措辞——保持跟改造前一致的、确定性的指令风格：

- `freeform` / `coc7`：说明"用技能数值裁定成败，让结果自然融入叙事，不要直接复述数字"。
- `dnd5e`：多一步——**先给出这次检定的 DC**（通常 5~30，按情境危险程度），再据此裁定成败。

## AI 输出格式（`checks[]`）

```json
"checks": [
  { "charId": "谁的骰点，__player__=玩家本人", "skill": "技能/属性名（中文）",
    "target": 15,               // 仅 D&D5e 检定需要，AI 给出的 DC
    "success": true, "outcome": "一句话说明结果与代价" }
]
```

`success`/`outcome` 是 AI **自己算完之后**给出的确定结果，用来指导它写 `gm_narrative`——
不是"猜"，是拿骰点+数值做的一道算术题。

## 代码侧机械复核（`handleAction` 里解析 `res.checks` 那一段）

对每一条 `checks[]`：

1. 按 `charId`（`__player__` 或队友 id）找到对应的**已经骰好的点数**（`rollByCharId`），
   找不到（没骰过的人）直接丢弃这条脏数据。
2. `findSkillValueByName(ruleSystemDef, characterSheets[charId], c.skill)`——把 AI 给的自由文本
   技能/属性名模糊匹配回角色数值表里的实际数值（技能名允许不精确，比如"说服"匹配到
   "话术(说服)"这种带括号别名的 label）。匹配不到就返回 `undefined`，交给下一步用兜底默认值。
3. `computeCheckTier(ruleSystemDef, diceCfg, roll, skillValue, c.target)`——机械算出五档结果：
   - **coc7 / freeform**：先把骰点归一化成"d100 等效百分位"（`toCocPercentity`，即便骰子不是
     d100，比如 freeform 用 d20，也按比例映射成 1-100 的等效值），再用 CoC 式规则
     （`≤ 数值/5` 大成功、`≥96` 大失败、`≤数值` 成功、`≤数值+20` 勉强、否则失败）比较。
   - **dnd5e**：`raw===20` 大成功、`raw===1` 大失败，否则按 `(骰点+加值) - DC` 的余量分档
     （`≥5` 大成功、`≥0` 成功、`≥-5` 勉强、否则失败）。
4. 拿机械算出的 `success` 跟 AI 报的 `c.success`（缺省视为 `true`）比较——**不一致就
   `throw new Error(...)`**，被外层 `catch` 捕获后走 `addToast('GM 掉线了: ...', 'error')`，
   这一回合不写入日志/存档，用户点"重新推演"（骰子会重骰）即可恢复。
5. 一致的话，把**代码算出的** `tier`/`success`（不是 AI 报的）存进 `checkByCharId`，
   `outcome` 优先用 AI 给的那句话（更贴合剧情），没有才回退成 `CHECK_TIER_LABELS[tier]`。

## 五档结果存储与展示

- `GameLog.diceRoll.tier?: 'critical_success'|'success'|'partial'|'failure'|'critical_failure'`
  （`types.ts`）——由代码机械算出，AI 不直接写这个字段。
- UI 徽章颜色：`GameApp.tsx` 里 `DICE_TIER_BADGE_STYLE` + `diceTierBadgeClass(diceRoll)`——
  大成功黄底、成功绿、勉强黄字白底（沿用旧配色）、失败橙、大失败红。角色气泡和玩家气泡
  两处骰点徽章共用这个 helper。
- 历史记录喂回 LLM 时（`serializeLog`），只回显**真正被采纳为检定**（带 `check` 字段）的骰点，
  格式 `〔判定:技能=点数/outcome或成功文案〕`，避免把没用上的骰点也当判定塞回去误导 GM。

## 关键文件

| 文件 | 职责 |
|------|------|
| `utils/trpgRuleSystems.ts` | `RuleSystemDef.checkInstruction`、`CheckTier`/`CHECK_TIER_LABELS`、`computeCheckTier`（机械五档计算）、`findSkillValueByName`（技能名模糊匹配）、`toCocPercentile`（骰子归一化） |
| `apps/GameApp.tsx` | `handleAction`（全员先骰、prompt 拼接、`checks[]` 解析+机械复核+throw）、`handleReroll`（复核失败后用户手动重骰的入口）、`DICE_TIER_BADGE_STYLE`/`diceTierBadgeClass`（UI 徽章） |
| `types.ts` | `GameLog.diceRoll`：`result/max/check/tier/success/outcome` |
