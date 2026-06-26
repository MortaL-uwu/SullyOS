/**
 * 日程小剧场（窥视演出）生成器。
 *
 * 设计：用户在日程卡上点某个「已过去 / 正在进行」时段的播放按钮，
 * 以**第三人称「上帝视角」**生成角色在这个时间点的一小段行为演出 —— 角色完全
 * 不知道自己被观看（纯纪录片式窥视），逐行播放，像看一段小短剧。
 *
 * 注入面与见面（DateApp）/ 日程对齐，复用同一批零件：
 *   - 人设全量：ContextBuilder.buildCoreContext(char, user, true)
 *   - 该时段的硬事实：activity / location / description
 *   - 当天意识流底色：flowNarrative（按时段）或 slot.innerThought
 *   - 情绪 buff：char.buffInjection
 *   - 文风：复用见面侧 DATE_STYLE_PRESETS（取 char.dateStyleConfig 的风格，缺省电影感）
 *
 * 输出沿用见面的 VN「一行一拍」格式：每行 `[氛围] 文本`，解析成 TheaterLine[]，
 * 缓存进 slot.theater，可反复重看，不重复烧 token。
 */

import { CharacterProfile, UserProfile, DailySchedule, ScheduleSlot, SlotTheater, TheaterLine } from '../types';
import { ContextBuilder } from './context';
import { DB } from './db';
import { safeResponseJson, extractContent } from './safeApi';
import { isScheduleFeatureOn, getFlowNarrativeKey } from './scheduleGenerator';
import { DATE_STYLE_PRESETS } from './datePrompts';

interface ApiConfig {
    baseUrl: string;
    apiKey: string;
    model: string;
}

/** 根据 slot 的开始时间挑当天意识流底色：优先该时段独白，再退到 flowNarrative。 */
function pickNarrativeBackdrop(schedule: DailySchedule, slot: ScheduleSlot): string {
    if (slot.innerThought && slot.innerThought.trim()) return slot.innerThought.trim();
    const hour = parseInt(slot.startTime.split(':')[0], 10);
    const key = getFlowNarrativeKey(Number.isFinite(hour) ? hour : 12);
    const fromFlow = schedule.flowNarrative?.[key];
    return fromFlow && fromFlow.trim() ? fromFlow.trim() : '';
}

/** 取见面侧文风预设的一句话提示，作为小剧场的文风线索（缺省电影感）。 */
function pickStyleHint(char: CharacterProfile): string {
    const styleId = char.dateStyleConfig?.style || 'cinematic';
    const preset = DATE_STYLE_PRESETS.find(p => p.id === styleId) || DATE_STYLE_PRESETS[0];
    return preset.peekHint;
}

function buildTheaterPrompt(
    baseContext: string,
    char: CharacterProfile,
    user: UserProfile,
    slot: ScheduleSlot,
    backdrop: string,
    styleHint: string,
): string {
    const uname = user?.name || '对方';
    const where = slot.location ? `（地点：${slot.location}）` : '';
    const desc = slot.description ? `\n这个时段日程上的描述是：${slot.description}` : '';
    const backdropBlock = backdrop
        ? `\n\n这个时段，「${char.name}」心里盘旋的念头大致是这样（作为情绪底色，别照抄，要化进行为里）：\n${backdrop}`
        : '';
    const buffBlock = (isScheduleFeatureOn(char) && char.emotionConfig?.enabled && char.buffInjection)
        ? `\n\n${char.buffInjection}`
        : '';

    return `${baseContext}

## Task: 生成一段「窥视小剧场」

现在，「${uname}」正在悄悄窥视「${char.name}」此刻的生活片段。

**时间点**：${slot.startTime}，「${char.name}」正在「${slot.activity}」${where}。${desc}${backdropBlock}${buffBlock}

请你以**第三人称·上帝视角**，演出「${char.name}」在这个时间点的一小段行为 —— 像一段被偷偷拍下的生活纪录片。

### 铁律（非常重要）
1. **角色完全不知道自己被观看**。绝对不要让 ta 看镜头、不要对「${uname}」说话、不要意识到有人在看。这是偷看，不是表演给谁看。
2. **第三人称叙述**：用「${char.name}」或 ta/她/他 指代角色，不要用"我"。
3. 「${uname}」**只能作为角色脑子里偶尔闪过的念头**出现（想起昨天 ${uname} 说的某句话之类），不能作为在场的人、不能成为这段戏的主语或焦点。
4. **紧扣这个时段在做的事**（${slot.activity}），写 ta 具体的手在做什么、身体在哪、环境什么样，不要写成抽象的"在休息""在工作"。
5. 文风线索：${styleHint}。

### 输出格式（严格遵守「一行一拍」）
- 每一行是一个画面 / 一个动作 / 一句台词（独白），**单独占一行**。
- **每一行都以 \`[氛围]\` 开头**，方括号里放**一个 emoji**，表示这一拍的情绪氛围（如 😌🎧😮‍💨🙂‍↔️🥱）。
- 台词 / 自言自语用引号「」包起来；动作和叙述直接写，不加引号。
- 一行只承载一拍，不要在一行里既写动作又写台词。
- 总共 **6 到 10 行**，有起伏、有停顿，像真的过了几分钟。
- 不要标题、不要编号、不要 JSON、不要任何额外说明，直接从第一行开始。

### 示例（健身房时段，仅示意格式）
[🚪] 她拎着包推开健身房的玻璃门，冷气一下子扑在脸上。
[🎧] 耳机里随机到了那首歌，脚步顿了半拍，又跟上节奏。
[🏃] 跑步机的数字慢慢爬到三公里，呼吸开始发烫。
[💭] 不知道为什么，忽然想起昨天 ${uname} 随口说的那句话。
[😮‍💨] 「……算了，不想了。」她抹了把汗，把速度又调快了一档。

现在，开始演出（直接输出，从第一行起）：`;
}

/** 把模型输出的「一行一拍」文本解析成 TheaterLine[]。 */
export function parseTheaterLines(raw: string): TheaterLine[] {
    if (!raw) return [];
    // 去掉可能的代码围栏
    const cleaned = raw.replace(/^```[a-z]*\s*/i, '').replace(/```\s*$/i, '').trim();
    const lines: TheaterLine[] = [];
    // 方括号容忍全/半角：[] 【】
    const tagRe = /^\s*[\[【]\s*(.+?)\s*[\]】]\s*(.+)$/;
    for (const rawLine of cleaned.split('\n')) {
        const line = rawLine.trim();
        if (!line) continue;
        // 跳过孤立的标题/分隔行
        if (/^[-—=*#]+$/.test(line)) continue;
        const m = line.match(tagRe);
        if (m && m[2].trim()) {
            lines.push({ emotion: m[1].trim().slice(0, 8), text: m[2].trim() });
        } else {
            // 没带氛围标签的行也收下，避免丢内容
            lines.push({ text: line });
        }
    }
    return lines;
}

/**
 * 为某个时段生成（或返回已缓存的）小剧场，并写回 DB。
 * @param forceRegenerate 为 true 时无视缓存重新生成（重演）。
 * @returns 更新后的整份 schedule（slot.theater 已填充）；失败返回 null。
 */
export async function generateSlotTheater(
    char: CharacterProfile,
    userProfile: UserProfile,
    schedule: DailySchedule,
    slotIndex: number,
    apiConfig: ApiConfig,
    forceRegenerate: boolean = false,
): Promise<DailySchedule | null> {
    if (!isScheduleFeatureOn(char)) return null;
    const slot = schedule.slots[slotIndex];
    if (!slot) return null;

    // 命中缓存直接返回（重看不烧 token）
    if (!forceRegenerate && slot.theater && slot.theater.lines.length > 0) {
        return schedule;
    }

    const baseContext = ContextBuilder.buildCoreContext(char, userProfile, true);
    const backdrop = pickNarrativeBackdrop(schedule, slot);
    const styleHint = pickStyleHint(char);
    const prompt = buildTheaterPrompt(baseContext, char, userProfile, slot, backdrop, styleHint);

    try {
        const response = await fetch(`${apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiConfig.apiKey}` },
            body: JSON.stringify({
                model: apiConfig.model,
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.9,
                max_tokens: 1500,
            }),
        });

        if (!response.ok) {
            console.error('[Theater] API error:', response.status);
            return null;
        }

        const data = await safeResponseJson(response);
        const content = extractContent(data);
        const lines = parseTheaterLines(content);
        if (lines.length === 0) {
            console.error('[Theater] Generation failed: 无法解析出演出行:', content.slice(0, 200));
            return null;
        }

        const theater: SlotTheater = { lines, generatedAt: Date.now() };

        // 写回对应 slot（不可变更新，保持其余 slot 引用稳定）
        const newSlots = schedule.slots.map((s, i) => (i === slotIndex ? { ...s, theater } : s));
        const updated: DailySchedule = { ...schedule, slots: newSlots };
        await DB.saveDailySchedule(updated);
        return updated;
    } catch (e) {
        console.error('[Theater] Generation failed:', e);
        return null;
    }
}
