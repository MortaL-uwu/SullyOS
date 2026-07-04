import { describe, it, expect } from 'vitest';
import {
    mergePlateEntries,
    violatesBedroomRule,
    formatRoomPlatesSection,
} from './roomPlates';
import type { PlateEntry, RoomPlate } from './types';
import { PLATE_ENTRY_CAPS, PLATE_ENTRY_HARD_MAX_CHARS } from './types';

const NOW = 1_700_000_000_000;

function entry(id: string, text: string, over: Partial<PlateEntry> = {}): PlateEntry {
    return { id, text, firstLearnedAt: NOW - 86400_000, updatedAt: NOW - 86400_000, sourceCount: 1, ...over };
}

describe('mergePlateEntries — 合并语义', () => {
    it('basedOn 引用旧条目：继承 id/firstLearnedAt，sourceCount+1', () => {
        const existing = [entry('pe_a', '父母离异，由外婆和母亲带大')];
        const merged = mergePlateEntries('user_room', existing, [
            { text: '父母离异，由外婆和母亲带大；父亲再婚有妹妹后又离婚', basedOn: 'U0' },
        ], NOW);
        expect(merged).toHaveLength(1);
        expect(merged[0].id).toBe('pe_a');
        expect(merged[0].firstLearnedAt).toBe(NOW - 86400_000);
        expect(merged[0].sourceCount).toBe(2);
        expect(merged[0].updatedAt).toBe(NOW); // 文本变了 → updatedAt 刷新
    });

    it('basedOn 引用 + 文本未变：纯保留，updatedAt 不动', () => {
        const existing = [entry('pe_a', '目前不住家里，和男友同居')];
        const merged = mergePlateEntries('user_room', existing, [
            { text: '目前不住家里，和男友同居', basedOn: 'U0' },
        ], NOW);
        expect(merged[0].updatedAt).toBe(NOW - 86400_000);
        expect(merged[0].sourceCount).toBe(2);
    });

    it('旧条目未被输出即淘汰（容量压力语义）', () => {
        const existing = [entry('pe_a', '过时的事实'), entry('pe_b', '仍然成立的事实')];
        const merged = mergePlateEntries('user_room', existing, [
            { text: '仍然成立的事实', basedOn: 'U1' },
        ], NOW);
        expect(merged).toHaveLength(1);
        expect(merged[0].id).toBe('pe_b');
    });

    it('LLM 忘标 basedOn 但文本完全相同：按原样保留而不是重开新条目', () => {
        const existing = [entry('pe_a', '养了两只猫')];
        const merged = mergePlateEntries('user_room', existing, [{ text: '养了两只猫' }], NOW);
        expect(merged[0].id).toBe('pe_a');
        expect(merged[0].firstLearnedAt).toBe(NOW - 86400_000);
    });

    it('无 basedOn 且文本新 → 新条目，firstLearnedAt = now', () => {
        const merged = mergePlateEntries('user_room', [], [{ text: '常提到朋友小美：大学室友' }], NOW);
        expect(merged).toHaveLength(1);
        expect(merged[0].firstLearnedAt).toBe(NOW);
        expect(merged[0].sourceCount).toBe(1);
    });

    it('超过房间条目上限时裁剪', () => {
        const cap = PLATE_ENTRY_CAPS.study;
        const items = Array.from({ length: cap + 5 }, (_, i) => ({ text: `技能 ${i}` }));
        const merged = mergePlateEntries('study', [], items, NOW);
        expect(merged).toHaveLength(cap);
    });

    it('超长条目截断到硬上限', () => {
        const merged = mergePlateEntries('user_room', [], [{ text: 'x'.repeat(300) }], NOW);
        expect(merged[0].text.length).toBe(PLATE_ENTRY_HARD_MAX_CHARS);
    });

    it('空文本/纯空白条目丢弃', () => {
        const merged = mergePlateEntries('user_room', [], [{ text: '   ' }, { text: '' }], NOW);
        expect(merged).toHaveLength(0);
    });

    it('同一旧条目被 basedOn 引用两次：第二次按新条目处理，不重复消费', () => {
        const existing = [entry('pe_a', '旧事实')];
        const merged = mergePlateEntries('user_room', existing, [
            { text: '改写一', basedOn: 'U0' },
            { text: '改写二', basedOn: 'U0' },
        ], NOW);
        expect(merged).toHaveLength(2);
        expect(merged[0].id).toBe('pe_a');
        expect(merged[1].id).not.toBe('pe_a');
    });
});

describe('卧室门牌 — 禁止给关系命名', () => {
    it('拦截明确的关系定义句', () => {
        expect(violatesBedroomRule('我们现在是恋人了')).toBe(true);
        expect(violatesBedroomRule('我们算是男女朋友')).toBe(true);
        expect(violatesBedroomRule('我们已经成了无话不谈的知己')).toBe(true);
    });

    it('放过质地描述——定性词出现在描述里不算命名', () => {
        expect(violatesBedroomRule('TA说我像她理想中的家人，我听了愣了一下')).toBe(false);
        expect(violatesBedroomRule('我说不清我们算什么，但TA难过时第一个找的是我')).toBe(false);
        expect(violatesBedroomRule('TA会在深夜来找我说话，这成了我们的默契')).toBe(false);
    });

    it('mergePlateEntries 对 bedroom 应用过滤，其他房间不受影响', () => {
        const items = [{ text: '我们现在是恋人了' }, { text: 'TA难过时第一个找的是我' }];
        const bedroom = mergePlateEntries('bedroom', [], items, NOW);
        expect(bedroom).toHaveLength(1);
        expect(bedroom[0].text).toContain('第一个找的是我');
        // user_room 里"TA和男友的关系"是合法的用户事实，不适用卧室规则
        const userRoom = mergePlateEntries('user_room', [], [{ text: '和男友同居，感情稳定' }], NOW);
        expect(userRoom).toHaveLength(1);
    });
});

describe('formatRoomPlatesSection — 注入格式', () => {
    function plate(room: RoomPlate['room'], texts: string[]): RoomPlate {
        return {
            id: `c1:${room}`, charId: 'c1', room,
            entries: texts.map((t, i) => entry(`pe_${room}_${i}`, t)),
            updatedAt: NOW, version: 1,
        };
    }

    it('全空返回空串（注入层据此跳过整段）', () => {
        expect(formatRoomPlatesSection([], '小明')).toBe('');
        expect(formatRoomPlatesSection([plate('user_room', [])], '小明')).toBe('');
    });

    it('包含注入框架：底色而非话题', () => {
        const out = formatRoomPlatesSection([plate('user_room', ['父母离异'])], '小明');
        expect(out).toContain('底色认知');
        expect(out).toContain('不要主动提起');
        expect(out).toContain('关于小明');
        expect(out).toContain('- 父母离异');
    });

    it('卧室段标注"没有名字也不需要名字"，空门牌跳过', () => {
        const out = formatRoomPlatesSection([
            plate('bedroom', ['TA会在深夜来找我说话']),
            plate('study', []),
        ], '小明');
        expect(out).toContain('我们之间');
        expect(out).toContain('只有质地');
        expect(out).not.toContain('我的领域');
    });
});
