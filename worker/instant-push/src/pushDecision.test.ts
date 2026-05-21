import { describe, it, expect, vi } from 'vitest';
import { buildPushDecision, type PushDecisionInput } from './index';

// ─── 测试 fixture helpers ────────────────────────────────────────────────

function baseInput(overrides: Partial<PushDecisionInput> = {}): PushDecisionInput {
  return {
    llmOutputText: '',
    sessionId: 'sess_test',
    iteration: 0,
    contactName: 'X',
    avatarUrl: null,
    callerMetadata: {},
    ...overrides,
  };
}

/**
 * 把 buildPushDecision 返回的 pushPayload 当对象用 — 真实类型是 ToolRequestPush /
 * ContentPush + { notification }. 测试只关心字段语义, 不关心 wire 类型.
 */
type AnyPushPayload = {
  message?: string;
  notification?: { title?: string; body?: string };
  metadata?: Record<string, unknown>;
  toolCalls?: Array<{ function: { name: string } }>;
};

// ─── D 系列: push payload 三条路径 ───────────────────────────────────────

describe('buildPushDecision D 系列 (push payload 三条路径)', () => {
  it('D1 finish 干净文本: title-only notification, message 原文, directives=[]', () => {
    const r = buildPushDecision(baseInput({ llmOutputText: '你好' }));

    expect(r.decision).toBe('finish');
    const payload = r.pushPayload as AnyPushPayload;
    expect(payload.message).toBe('你好');
    // sanitize 跟 cleanedText 相同 → 只塞 title, 不塞 body (避免 payload size 翻倍)
    expect(payload.notification).toEqual({ title: '来自 X' });
    expect(payload.notification?.body).toBeUndefined();
    expect(payload.metadata?.directives).toEqual([]);
  });

  it('D2 finish 含 SEND_EMOJI: message 原文不变 (Step 9 客户端用), body 是 sanitize 后的', () => {
    const r = buildPushDecision(baseInput({ llmOutputText: '测试[[SEND_EMOJI: 笑]]' }));

    expect(r.decision).toBe('finish');
    const payload = r.pushPayload as AnyPushPayload;
    // cleanedText: classifier 不剥 SEND_EMOJI (留给客户端 Step 9), 所以 message 字段保留原文
    expect(payload.message).toBe('测试[[SEND_EMOJI: 笑]]');
    // sanitize 改了字符 (替换成 [表情：笑]) → 条件塞 body
    expect(payload.notification?.title).toBe('来自 X');
    expect(payload.notification?.body).toBe('测试[表情：笑]');
  });

  it('D3 finish 仅 <think>: sanitize 净化成空串 → 用 ZWSP 占位防 amsg-sw fallthrough', () => {
    const r = buildPushDecision(baseInput({ llmOutputText: '<think>internal</think>' }));

    expect(r.decision).toBe('finish');
    const payload = r.pushPayload as AnyPushPayload;
    // message 仍是原文 (客户端会自己消化 <think>)
    expect(payload.message).toBe('<think>internal</think>');
    // ZWSP 守护: 净化成空串时塞 literal ZWSP (U+200B), 不是空字符串.
    // 显式写 '​' 避免 reviewer 把不可见字符当成空字符串.
    expect(payload.notification?.body).toBe('​');
    expect(payload.notification?.body).not.toBe('');
    expect(payload.notification?.body?.length).toBe(1);
  });

  it('D4 tool-request 含 prefix narration: title + body 是 prefix, toolCalls 有 1 个', () => {
    const r = buildPushDecision(baseInput({ llmOutputText: '让我查查[[RECALL: 2024-05]]' }));

    expect(r.decision).toBe('tool-request');
    const payload = r.pushPayload as AnyPushPayload;
    expect(payload.toolCalls).toHaveLength(1);
    expect(payload.toolCalls?.[0].function.name).toBe('recall');
    // message = prefix (SW 拿去写 inbox)
    expect(payload.message).toBe('让我查查');
    // sanitize 跟 prefix 相等 (都是 '让我查查'), 不塞 body — 只 title
    expect(payload.notification).toEqual({ title: '来自 X' });
    expect(payload.notification?.body).toBeUndefined();
  });

  it('D5 tool-request prefix 为空 (LLM 直接吐数据标签): title-only', () => {
    const r = buildPushDecision(baseInput({ llmOutputText: '[[SEARCH: weather]]' }));

    expect(r.decision).toBe('tool-request');
    const payload = r.pushPayload as AnyPushPayload;
    expect(payload.message).toBe('');
    // prefix '' === sanitizedPrefix '' → 不塞 body
    expect(payload.notification).toEqual({ title: '来自 X' });
  });

  it('D6 finish + ACTION:POKE directive: cleanedText 剥光标签, directives 含 poke', () => {
    const r = buildPushDecision(baseInput({ llmOutputText: 'OK[[ACTION:POKE]]' }));

    expect(r.decision).toBe('finish');
    const payload = r.pushPayload as AnyPushPayload;
    expect(payload.message).toBe('OK');
    expect(payload.metadata?.directives).toEqual([{ type: 'poke' }]);
  });
});

// ─── E 系列: title fallback ──────────────────────────────────────────────

describe('buildPushDecision E 系列 (title fallback)', () => {
  it('E1 contactName="Sully" → title="来自 Sully"', () => {
    const r = buildPushDecision(baseInput({
      llmOutputText: '你好',
      contactName: 'Sully',
    }));
    const payload = r.pushPayload as AnyPushPayload;
    expect(payload.notification?.title).toBe('来自 Sully');
  });

  // E2 等价类: 空串 + 全空白 走同一条 fallback 分支, 用 it.each 减少 boilerplate
  it.each([
    { name: '空字符串', value: '' },
    { name: '全空白', value: '   ' },
    { name: '混合空白 (tab + 全角空格 + nbsp)', value: '\t　 ' },
  ])('E2 contactName=$name → title fallback 到 "来自 主动消息"', ({ value }) => {
    const r = buildPushDecision(baseInput({
      llmOutputText: '你好',
      contactName: value,
    }));
    const payload = r.pushPayload as AnyPushPayload;
    expect(payload.notification?.title).toBe('来自 主动消息');
  });
});

// ─── F 系列: size warn callback ──────────────────────────────────────────

describe('buildPushDecision F 系列 (size warn)', () => {
  it('F1 短 message → onSizeWarn 不被调用', () => {
    const onSizeWarn = vi.fn();
    buildPushDecision(baseInput({ llmOutputText: '你好' }), { onSizeWarn });
    expect(onSizeWarn).not.toHaveBeenCalled();
  });

  it('F2 ~3000B 长 message → onSizeWarn 调 1 次, bytes > 2300', () => {
    const onSizeWarn = vi.fn();
    // 构造 ~3000 字节 ASCII payload (1 字节/字符), 加上 amsg envelope 一定超 2300
    const longText = 'x'.repeat(3000);
    buildPushDecision(baseInput({ llmOutputText: longText }), { onSizeWarn });

    expect(onSizeWarn).toHaveBeenCalledTimes(1);
    const bytes = vi.mocked(onSizeWarn).mock.calls[0][0];
    expect(bytes).toBeGreaterThan(2300);
    // sanity check: 不该爆到天上 (4 字节/字符 ASCII 的 4 倍 + envelope 大概在 3.5k 内)
    expect(bytes).toBeLessThan(5000);
  });

  it('F3 不传 onSizeWarn → 默认走 console.warn (短 message 不触发)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      buildPushDecision(baseInput({ llmOutputText: '你好' }));
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('F3+ 不传 onSizeWarn + 长 message → console.warn 被调用', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      buildPushDecision(baseInput({ llmOutputText: 'x'.repeat(3000) }));
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0][0]).toContain('[instant-push]');
    } finally {
      warnSpy.mockRestore();
    }
  });
});

// ─── 额外: metadata 透传 ────────────────────────────────────────────────

describe('buildPushDecision metadata 透传', () => {
  it('finish 路径: callerMetadata 全字段透传 + 注入 iteration + directives', () => {
    const r = buildPushDecision(baseInput({
      llmOutputText: '你好',
      iteration: 3,
      callerMetadata: { charId: 'c1', extra: 'val' },
    }));
    const payload = r.pushPayload as AnyPushPayload;
    expect(payload.metadata).toEqual({
      charId: 'c1',
      extra: 'val',
      directives: [],
      iteration: 3,
    });
  });

  it('tool-request 路径: callerMetadata 全字段透传 + 注入 iteration (无 directives)', () => {
    const r = buildPushDecision(baseInput({
      llmOutputText: '[[SEARCH: weather]]',
      iteration: 2,
      callerMetadata: { charId: 'c1', extra: 'val' },
    }));
    const payload = r.pushPayload as AnyPushPayload;
    expect(payload.metadata).toMatchObject({
      charId: 'c1',
      extra: 'val',
      iteration: 2,
    });
    // tool-request 不该带 directives (那是 finish 路径独有的)
    expect(payload.metadata?.directives).toBeUndefined();
  });

  it('caller 后注入的 iteration 覆盖 caller 自带的同名 key (spread 顺序)', () => {
    // 防回归: callerMetadata 里万一塞了 iteration, 必须被覆盖成 hook 的真实迭代数,
    // 不能被 caller 污染. spread 顺序 = caller 在前, iteration/directives 在后.
    const r = buildPushDecision(baseInput({
      llmOutputText: '你好',
      iteration: 5,
      callerMetadata: { iteration: 999, charId: 'c1' },
    }));
    const payload = r.pushPayload as AnyPushPayload;
    expect(payload.metadata?.iteration).toBe(5);
    expect(payload.metadata?.charId).toBe('c1');
  });
});
