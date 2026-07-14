import { describe, it, expect } from 'vitest';
import { buildChatFineTuneCss } from './chatFineTuneCss';

// 聊天细节微调 CSS 生成器：全默认零输出；各旋钮生成的选择器与社区已验证版本一致。

describe('buildChatFineTuneCss', () => {
    it('全默认 → 空串（不注入任何 style）', () => {
        expect(buildChatFineTuneCss({})).toBe('');
        expect(buildChatFineTuneCss({ chatAvatarVisibility: 'both', chatAvatarAlign: 'bottom', chatAvatarOffsetY: 0, chatBubbleFontSize: 0, chatBubbleLineHeight: 0, chatBubbleIndent: 0 })).toBe('');
    });

    it('隐藏角色侧头像只影响 justify-start；贴边只收隐藏侧空位', () => {
        const css = buildChatFineTuneCss({ chatAvatarVisibility: 'hide_ai', chatSnapToEdge: true });
        expect(css).toContain('.group.justify-start > [class~="absolute"][class~="z-0"] { display: none');
        expect(css).not.toContain('.group.justify-end > [class~="absolute"][class~="z-0"] { display: none');
        expect(css).toContain('.ml-12 { margin-left: 0 !important; }');
        expect(css).not.toContain('margin-right: 0');
    });

    it('顶部对齐 + 垂直微调', () => {
        const css = buildChatFineTuneCss({ chatAvatarAlign: 'top', chatAvatarOffsetY: -8 });
        expect(css).toContain('bottom: auto !important; top: -0.5rem !important;');
        expect(css).toContain('translateY(-8px)');
    });

    it('垂直居中把偏移并进 calc（transform 不互相覆盖）', () => {
        const css = buildChatFineTuneCss({ chatAvatarAlign: 'center', chatAvatarOffsetY: 4 });
        expect(css).toContain('translateY(calc(-50% + 4px))');
    });

    it('字号/行距走社区版四层选择器，内联元素 inherit', () => {
        const css = buildChatFineTuneCss({ chatBubbleFontSize: 14, chatBubbleLineHeight: 1.5 });
        expect(css).toContain('.sully-bubble-ai > div[class~="select-text"]');
        expect(css).toContain('font-size: 14px !important;');
        expect(css).toContain('line-height: 1.5 !important;');
        expect(css).toContain('font-size: inherit !important;');
        expect(css).toContain('[class*="text-[13px]"]');
    });

    it('气泡缩进对两侧生效；贴边侧让位', () => {
        const css = buildChatFineTuneCss({ chatBubbleIndent: 60 });
        expect(css).toContain('margin-left: 60px !important;');
        expect(css).toContain('margin-right: 60px !important;');
        const snapCss = buildChatFineTuneCss({ chatBubbleIndent: 60, chatAvatarVisibility: 'hide_ai', chatSnapToEdge: true });
        expect(snapCss).toContain('margin-left: 0 !important;');
        expect(snapCss).not.toContain('margin-left: 60px');
        expect(snapCss).toContain('margin-right: 60px !important;');
    });
});
