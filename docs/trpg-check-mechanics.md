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
4. **方案 4（曾经的实现）**：AI 在同一次输出里，自己顺手把这道算术题也算了（骰点 vs 技能值，
   或骰点+加值 vs 自己刚定的DC），**当成真实结果直接写进 `checks[].success/outcome`**，并照着
   这个结果写剧情。代码拿到完整响应后，用**同样的骰点 + 角色数值表 + AI 给的 DC**（对 D&D）
   独立重算一遍（`computeCheckTier`），如果 AI 算错了（重算结果跟 AI 报的不一致），直接
   `throw`，这一回合作废，用户点"重新推演"重来。问题——**coc7/freeform 明明没有 DC，AI
   本来就不需要现场判断任何东西，纯算术却还是经常算错**，导致频繁 `throw`→重roll→重新调用
   一次 LLM，既费钱又体验差。而"AI 只给语义、代码机械算成败、不让 AI 猜"这条路（方案 3）在
   coc7/freeform 上其实是可行的——卡点只在"AI 写剧情时得知道成不成才能写"，而这一步**不需要
   AI 自己算，可以提前用代码穷举好**。
5. **最终方案（当前实现，coc7/freeform 与 dnd5e 分道）**：
   - **coc7 / freeform（没有 DC，成败是确定算术题）**：代码在拼 prompt 时，用
     `buildCheckOutcomePreview` 把这个人**每一项技能/属性对应的确定判定结果都提前算好**，
     整张表喂给 AI，`checkInstruction` 直接告诉 AI"挑一项语义最贴切的技能，把对应结果原样
     抄进 `outcome`/`success`，不要自己比较骰点和数值"。AI 只做语义匹配（选技能），不做算术，
     从根上消灭了"算错"这个风险来源——因此代码侧的机械复核**不再跟 AI 报的成败比对/`throw`**，
     直接采信机械重算结果落库即可（AI 抄没抄对不影响存档权威性，抄错了只是这条 `outcome`
     文案跟徽章不搭，不会挡住回合推进）。
   - **dnd5e（DC 是现场语义判断，没法穷举预演）**：保持方案 4 的做法不变——AI 自己定 DC 并算
     成败，代码机械复核，不一致仍然 `throw` 让用户重roll。这条风险目前**接受且保留**（唯一能
     消除它的办法是两次 LLM 调用，成本上不划算，见下）。
   - **不引入两次 LLM 调用**：曾经考虑过"判断调用+叙事调用"拆两次来彻底杜绝 AI 算错，但两次
     调用意味着每回合成本翻倍，性价比上不划算，予以否决——上面"预览表"方案在单次调用内就
     把 coc7/freeform 的风险清零了，dnd5e 的残余风险靠已有的 `throw`+重roll 兜底，不需要为了
     它去掏两倍的钱。

一句话总结数据流（coc7/freeform）：**代码先把每项技能的判定结果都算好摆出来 → AI 只挑一项
抄 → 代码直接采信机械结果落库，不比对不 throw**。dnd5e 维持原数据流：**AI 定 DC 并自己算完
写剧情 → 代码用同一批数字复核 → 一致则落库，不一致则报错重骰**。

## 全员先骰（`handleAction` 开头）

- 每次玩家发起行动（非系统消息、非关闭骰子），代码先给**用户 + 全体队友**各骰一次
  `resolveDiceConfig(activeGame)` 返回的骰子（freeform 可自定义，coc7 固定 d100，dnd5e 固定 d20）。
- 这些骰点**不代表都会被用上**——是否构成一次正式检定、用哪个技能，交给同一次生成判断
  （省掉一次单独的"是否需要判定"预调用，这是最早那次大改的核心动机）。
- 骰点结果通过 `rollInstruction`（prompt 里的一段）连同 `checkInstruction`（见下）一起喂给 LLM。
- 玩家发送的那一刻会弹一条 toast 直接展示这一轮所有人的具体骰点数字（如"全员已骰点 →
  你:15 / 张三:62 / ..."），不是笼统的"全员已骰点"——因为骰点现在是**持久化、reroll 也不会
  变**的（见下一条），提前告诉用户具体数字不会有"看了一眼结果又被 reroll 换掉"的落差感。
- **骰点持久化，reroll 不重投**：玩家的骰点本来就存在对应 `GameLog.diceRoll.result` 里；
  队友的骰点现在也跟着玩家这条 log 同一时刻存进 `GameSession.pendingPartyRolls`
  （`{id, name, roll}[]`）。`handleReroll`（本质是带 `isReroll=true` 重新调 `handleAction`）
  会优先从这两处**原样读回**上一次的骰点，而不是重新 `rollDice`——保证"重新推演"只是让 AI
  换一种方式裁定/叙述同一批骰点，不是变成一次新的抽奖。回合成功落库后 `pendingPartyRolls`
  立即清空（下一回合重新投）；老存档没有这个字段时兜底重投一次，不会崩。

## 规则系统的 `checkInstruction`（`utils/trpgRuleSystems.ts`）

`RuleSystemDef.checkInstruction(opts?: { target?, hasSheet? })` 三个系统各自返回一段判定说明文本，
拼进 prompt。三个系统现在的指令风格**不一样**了（coc7/freeform 与 dnd5e 分道，见上面"为什么这么
设计"第 5 点）：

- `freeform` / `coc7`：签名是 `() => string`（不再吃 `hasSheet` 参数，因为不需要区分了）。文案
  改成"下方预览表已经给出这个人每一项技能/属性对应的确定判定结果，请挑一项语义最贴切的抄进
  `outcome`/`success`，不要自己比较骰点和数值"——**只做语义匹配，不做算术**。
- `dnd5e`：签名不变，仍然是"先给出这次检定的 DC（通常 5~30，按情境危险程度），再据此裁定
  成败"——这段风险（AI 自己算错）保留，接受用现有的 `throw`+重roll 兜底（理由见上）。

### 判定结果预览表（`buildCheckOutcomePreview`，仅 coc7/freeform 用）

`GameApp.tsx` 拼 `rollInstruction` 时，对player和每个队友都会调一次
`buildCheckOutcomePreview(ruleSystemDef, diceCfg, roll, characterSheets[id])`，替换掉原来单纯的
"骰点数字"，塞进对应人的那一行：

- 有角色卡：遍历这个规则系统的全部技能+属性，每一项各自用 `computeCheckTier` 算出这个人这一
  次骰点对应的五档结果，拼成 `技能名=结果` 的列表（如"侦查=成功、潜行=大成功、..."），技能名
  会先去掉括号里的英文/别名部分（`stripParen`），避免预览表比正文还啰嗦。
- 没有角色卡（比如还没生成角色卡的临时场景）：退化成统一按 50 分算一个固定结果，并在文案里
  显式提示"无论选哪个技能/属性，结果都是这个，不需要自己计算"——避免 AI 误以为自己还要挑值。
- dnd5e 完全不调这个函数——它的成败取决于 AI 现场定的 DC，没法穷举预演，走的还是原来的
  `roll（flavor 描述）` 展示方式。

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
4. **仅 `isDnd` 时**：拿机械算出的 `success` 跟 AI 报的 `c.success`（缺省视为 `true`）
   比较——不一致就 `throw new Error(...)`，被外层 `catch` 捕获后走
   `addToast('GM 掉线了: ...', 'error')`，这一回合不写入日志/存档，用户点"重新推演"
   （玩家和队友的骰点都原样复用，不重骰，见上面"全员先骰"一节）即可恢复。
   **coc7/freeform 不做这个比对/不 `throw`**——AI 在这两个规则下只是从预览表里抄结果，没有
   算术可算错，比对没有意义，直接进第 5 步落库即可，省掉不必要的报错重roll。
5. 把**代码算出的** `tier`/`success`（不是 AI 报的）存进 `checkByCharId`，`outcome` 优先用
   AI 给的那句话（更贴合剧情），没有才回退成 `CHECK_TIER_LABELS[tier]`。

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
| `utils/trpgRuleSystems.ts` | `RuleSystemDef.checkInstruction`、`CheckTier`/`CHECK_TIER_LABELS`、`computeCheckTier`（机械五档计算）、`buildCheckOutcomePreview`（coc7/freeform 判定结果预览表）、`findSkillValueByName`（技能名模糊匹配）、`toCocPercentile`（骰子归一化） |
| `apps/GameApp.tsx` | `handleAction`（全员先骰、`pendingPartyRolls` 持久化、prompt 拼接、`checks[]` 解析+机械复核+仅 dnd5e 的 throw）、`handleReroll`（复核失败后用户手动重骰的入口，复用同一批骰点） |
| `types.ts` | `GameLog.diceRoll`：`result/max/check/tier/success/outcome`；`GameSession.pendingPartyRolls`（reroll 用的队友骰点缓存） |

## 逐人 HP/SAN、死亡/昏迷/疯狂、皮下吐槽（OOC）

在上面「全员先骰 + 五档检定」的基础上又加了三块：逐人状态面板、死亡/出局机制、可选的场外
吐槽频道。**功能1+2 不新增任何 LLM 调用**（复用检定用的同一次主线响应，改的是输出 schema），
**功能3（OOC）新增调用，且是异步、可关、完全跟主线隔离的**——为了防止多角色记忆串台，OOC
不是"新增 1 次"而是**给每个参战角色各自新增 1 次独立调用**（并发执行，不线性拖慢），详见下方
「皮下吐槽（OOC）：逐角色独立调用」一节。改这部分逻辑前必读。

### 数据结构（`types.ts`）

- `GameSession.characterVitals?: Record<string, {health, sanity}>`——逐人血条/理智值，key 是
  角色 `id`，玩家本人用固定 key `'__player__'`。旧存档没有这个字段时，`getCharacterVitals`
  （`utils/trpgRuleSystems.ts`）用旧的全局 `status.health/sanity` 给每个人现算一份兜底初始值，
  数值上等价于"迁移前大家共享一份血条"的行为，不会因为缺字段崩溃。
- `GameSession.deadCharIds?: string[]`——死亡角色的永久名单（数组存，不用 `Set`，因为要序列化
  进 IndexedDB）。一旦进了这个名单，`handleAction` 顶部的 `players` 过滤会把这个角色**整个从
  冒险小队名单、骰点、prompt 里踢出去**，不再登场，且不可逆——即使后续被"复活"叙事也不会
  自动移出，这是有意的简化（没做复活机制）。
- `GameSession.oocEnabled?: boolean`——皮下吐槽开关，默认 `false`（关）。
- `GameSession.oocLogs?: Array<{id, charId, speakerName, content, timestamp}>`——OOC 消息记录，
  跟主线 `logs` 完全分开存，**永远不会被拼进主线 prompt**（`handleAction` 里的 prompt 只读
  `activeGame.logs`/`summaries`，不读 `oocLogs`）。

### 死亡/昏迷/疯狂：纯代码阈值，不问 AI

`utils/trpgRuleSystems.ts` 里的 `computeVitalState(health, isDead)` / `computeSanState(sanity)`
是纯函数，输入是"当前数值 + 是否已死亡"，输出五档标签，不涉及 AI 判断：

- **HP**：`normal`(>50) → `wounded`(≤50) → `critical`(≤30) → `unconscious`(≤0，昏迷不是死)
  → `dead`（由 `isDead` 参数显式传入，不能只看数值反推——角色可能被治疗回满血，但死亡不可逆）。
- **SAN**：`stable`(>50) → `unsettled`(≤50) → `unstable`(≤30) → `broken`(≤0，疯狂但不出局)。

**两段式死亡规则**（`handleAction` 里解析 `res.statusChanges` 那一段）：HP 归零只是**昏迷**，
角色留在名单里但不能自主行动/被骰点；昏迷状态下如果又挨了一次 `hpChange < 0`，代码判定为
**当场死亡**，塞进 `newlyDeadIds` 再并进 `deadCharIds`。这一步是纯代码计算（"HP≤0 且又扣血"
是确定性条件），跟检定成败那种需要跟 AI 结果比对复核的机制不一样——这里没有"AI 猜错了"
需要 `throw` 的环节，因为 AI 只负责给 `hpChange` 这个数字，"这个数字落在哪个桶"是代码说了算。

SAN 归零（`broken`/疯狂）**不会**触发出局或重启——这是对旧版本"SAN 归零就强制重启整局"的
修正，疯狂只是让 prompt 里多一句"这个人描写要失控/诡异"的提示，人还在场上。

### 主线 prompt/输出改动（跟检定机制平行的范式）

- prompt 的"队伍资源"从一整块共享血条，改成逐人列出 `HP x% / SAN x%`（`vitalsLines`），
  金币/物品继续队伍共享（没有做逐人拆分，跑团分赃本来就是共享惯例）。
- 输出 JSON 新增 `statusChanges[]`，取代旧的全局 `hpChange`/`sanityChange`：
  ```json
  "statusChanges": [
    { "charId": "__player__ 或角色ID", "hpChange": 0, "sanityChange": 0 }
  ]
  ```
  跟 `checks[]` 同一套哲学——**没变化的人不用出现**，不用为每个人都硬凑一条。
- 已昏迷的人：prompt 明确告知 AI 不要在 `characters[]` 里给 TA 安排新的主动行为；已疯狂的人：
  提示"言行要失控/诡异，但不是消失"。
- 玩家本人死亡/昏迷时（`playerCanAct === false`），局内输入框整体换成一句旁观提示（`Eye` 图标），
  不能再发主线行动——但如果开了皮下吐槽，仍能在那边继续参与。

### 逐人状态面板 UI

Party HUD（局内头部可展开的头像条）里，玩家自己的头像和每个队友头像都是可点的，点开弹出
跟原来"只有玩家自己那份"一样的 HP/SAN Modal（`statusPanelCharId` 状态控制），额外带上
`computeVitalState`/`computeSanState` 算出的中文状态标签。头像角标颜色也随状态变化（绿→黄→红
→灰昏迷→黑骷髅死亡），复用同一个 `vitalStatusDot(health, isDead)` helper。顶部 Stats HUD
（原来只显示玩家 `status.health/sanity`）现在显示的是 `characterVitals.__player__`（`newStatus.health/sanity`
在 `handleAction` 里会同步成玩家本人的最新值，保留这两个旧字段只是为了旧 UI/存档兜底读取，
不再是权威数据源）。

### 皮下吐槽（OOC）：逐角色独立调用

- **触发时机**：`handleAction` 主线回合落库成功后，`runOocIfNeeded(finalGame)` **不 await**
  地异步触发——绝不阻塞、绝不拖慢主线的响应速度，失败也只是 `console.warn`，不会读出 toast
  打扰用户或影响本回合已经落库的结果。
- **只有 `oocEnabled` 为真才会调用**，默认关，入口在系统菜单里一个跟骰子开关同款样式的
  toggle。
- **逐角色独立生成（防串台）**：不再用一次 LLM 调用生成所有人的话——那样每个人的记忆/人设会混在
  同一份 prompt 里，极易把 A 的记忆安到 B 头上。改成**每个角色单独调用一次**（`Promise.all` 并发，
  不线性拖慢），复用 `buildSyncContext([c])` 拿到该角色自己完整的人设+私聊神经链接+记忆宫殿召回，
  互不可见对方细节。代价：这一批内角色互相看不到"对方这一轮刚说的话"（只能看到上一轮及之前的
  `oocLogs`），只能事后接话。**玩家不进入这个生成循环**——AI 不代替真人发言，玩家只能通过
  `handleOocSend` 手动发言。
- **输入**（每个角色各自拿到的）：该角色自己的完整人设+私聊神经链接+记忆宫殿召回（`buildSyncContext([c])`）
  + 最近几条主线 `logs`（仅供吐槽参考）+ 最近的 `oocLogs` 历史（上一轮及之前）+ 最近的判定结果
  （`recentRolls`）。**输出只喂给这一次调用，绝不会被拼回下一次主线 prompt**——这是"不污染剧情"
  的关键，`handleAction` 的 prompt 构建代码里完全不读 `oocLogs`。
- **输出格式**（每个角色各自返回）：
  ```json
  { "speak": true, "content": "吐槽内容（speak 为 false 时可以留空）" }
  ```
  不是每次都要开口——如果这几回合很平淡，没什么好说的，可以选择不说话（`speak: false`）。
- **UI 形式是独立全屏聊天室视图**（`playSubView: 'chatroom'` 状态切换，跟主线剧情并列的全屏视图，
  不是弹窗），头部有「剧情 / 聊天室」pill 切换按钮，不是挂在每条主线气泡下面——独立视图能让已经
  出局的人持续"看戏吐槽"，这正是这个功能的核心诉求（用户原话：出局后仍能"旁观、吐槽游戏走向、
  坑队友"）。
- 用户自己发 OOC 消息（聊天室底部输入框）**不调用 LLM**，本地直接 `append` 进 `oocLogs`，
  `charId` 固定为 `'__player__'`（仅用于气泡右对齐和高亮，不会被当成角色加入 AI 生成循环）。

### 关键文件（新增/涉及部分）

| 文件 | 职责 |
|------|------|
| `utils/trpgRuleSystems.ts` | `VitalState`/`SanState`、`computeVitalState`/`computeSanState`（纯阈值函数）、`VITAL_STATE_LABELS`/`SAN_STATE_LABELS`、`getCharacterVitals`（旧档兜底） |
| `types.ts` | `GameSession.characterVitals`/`deadCharIds`/`oocEnabled`/`oocLogs` |
| `apps/GameApp.tsx` | `handleAction` 里的逐人 prompt 拼接 + `statusChanges[]` 解析 + 死亡判定；`runOocIfNeeded`/`handleOocSend`/`toggleOoc`；逐人状态 Modal（`statusPanelCharId`）+ OOC 面板 Modal（`showOocPanel`）；输入框按 `playerCanAct` 切换旁观提示 |
