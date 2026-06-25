# 查手机 · 人际关系系统

> 给「查手机」(`apps/CheckPhone.tsx`) 的聊天能力做的一次大升级：从一次性瞎编 NPC 对话，变成有**联系人簿、好感度、真假甄别、真角色之间双向同步对话、AI 玩 AI 偷窥**的人际关系系统。
> 改这块逻辑前必读。

## 一句话

查 A 的手机时，TA 通讯录里的人可能是神经链接里**真实存在的角色 B**，也可能是按人设虚构的 **NPC**，还可能是 A 脑内构建的**智能体**。真角色之间能背着用户私下对话，且对话会在双方手机里保持一致。

## 数据模型（`types.ts`）

- `PhoneContact`：联系人。`kind: 'real' | 'npc' | 'agent'`；`linkedCharId`（real 时绑定真实角色）；`affinity`（机主对 TA 的好感，**-100..100**，负=反感）；`status: 'friend'|'pending'|'blocked'|'deleted'`；`isAgent`/`agentOf`（P2 智能体）。
- `PhoneEvidence.contactId?`：聊天记录归属的联系人。
- `CharacterProfile.phoneState.contacts?: PhoneContact[]`：机主通讯录。

## 输入契约（用户指定，统一用于所有生成）

每次为「指定关系人 X」生成内容时：

1. `ContextBuilder.buildCoreContext(char, user, true)`
2. 记忆宫殿（若 `memoryPalaceEnabled`）：`injectMemoryPalace(char, recent, /*queryHint*/ X.name, user.name)` —— **query 用对方的人名**。
3. 最近上下文：`char.contextLimit || 500`（即 chatapp 设置面板里的「上下文条数」），不再写死 50。

## 三层能力

| 层 | 能力 | 入口 / 代码 |
|---|---|---|
| **P0 骨架** | 联系人模型 + 生成时注入真实角色名单做 **real/npc 甄别** + 通讯录 UI（好感条 / 备注 / 手动加删拉黑）+ 扫描通讯录 | `CheckPhone.handleGenerate('chat'\|'contacts')`、`renderContactsList` / `renderContactDetail` |
| **P1 真角色双向对话** | **双 LLM**：A 用 A 的 context 发、B 用 **B 自己的 context + 记忆宫殿(query=A 名) + B 的 contextLimit** 回。默认 **1 个往返 = A 发 1 次 + B 回 1 次 = 正好 2 次 LLM 调用**（`rounds` 可调）。好感变化折进各自回复末尾的 `[[Δ:+N]]`，解析后剥掉，**不再额外调用**。镜像进 B 的 `records`；**B 私聊仅当 B 自己 `sendToChat !== false`** 才写。好感 -100..100，跌破 -60 角色自动删友、升过 +60 自动加回，变动播报进机主私聊 | `utils/relationshipChat.ts:runRealConversation`、`CheckPhone.handleRealConversation` / `commitConversationSide` |
| **P2 AI 玩 AI** | 机主构建 user / 某人的智能体并和它聊，**只读偷窥**，不镜像、不进任何人私聊 | `utils/relationshipChat.ts:runAgentConversation`、`CheckPhone.handleAgentConversation` |

## 真假甄别怎么做的

生成 `chat` / `contacts` 时，把**神经链接里其他真实角色名单**注进 prompt，要求 LLM 对每个联系人输出 `kind`（real/npc）+ `linkedName`。落库时再用 `matchRealChar()` 对名字做精确/包含兜底匹配，命中即绑定 `linkedCharId` 并置 `kind:'real'`，防 LLM 漏标。

## 关键文件

| 文件 | 职责 |
|---|---|
| `utils/relationshipChat.ts` | 纯函数（`normName`/`matchRealChar`/`upsertContact`/`flipTranscript`/`clampAffinity`）+ 双 LLM 对话引擎（`runRealConversation`/`runAgentConversation`） |
| `utils/relationshipChat.test.ts` | 纯函数单测 |
| `apps/CheckPhone.tsx` | 通讯录 UI + 全部 handler + 落库/镜像 |
| `types.ts` | `PhoneContact` / `PhoneEvidence.contactId` / `phoneState.contacts` |

## 注意

- `runRealConversation` 续写时会把已有 A 视角脚本解析回 turns 续跑，产出**完整脚本**，落库时整段替换原记录。
- 镜像写入对方 B 用的也是 `updateCharacter(b.id, …)`（函数式合并），不会覆盖 B 的 simLogs。
- 好感变化由 A/B 各自在回复末尾用 `[[Δ:+N]]`（-20~20）带出，`extract()` 解析并剥掉标记 —— 不另开 LLM 调用；模型没给则 delta=0。
- 智能体对话是机主**想象**的产物，故意不进私聊（用户只能偷窥）。
