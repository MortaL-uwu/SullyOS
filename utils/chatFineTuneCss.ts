/**
 * 聊天细节微调 CSS 生成器（外观 → 聊天细节）。
 *
 * 收编自社区「白框作者」的美化 CSS：隐藏头像、头像对齐/微调、消息贴边、
 * 气泡缩进、正文字号/行距。选择器沿用社区版本已在真实 DOM 上验证过的形态
 * （锚 .group.justify-* 与 .sully-bubble-* 结构），生成规则带 !important
 * 以压过 Tailwind 工具类。
 *
 * 注入位置：Chat.tsx 在用户自定义白框 CSS（chatChromeCustomCss / 角色
 * chromeCustomCss）**之前**插入本样式——同为 !important 时后者胜，老用户
 * 手写的美化代码永远能覆盖这里的可视化设置，互不打架。
 *
 * 全部字段缺省时返回空串（一个 <style> 都不注入，现状零变化）。
 */

import type { OSTheme } from '../types';

const AI_AVATAR = '.sully-chat-root .group.justify-start > [class~="absolute"][class~="z-0"]';
const USER_AVATAR = '.sully-chat-root .group.justify-end > [class~="absolute"][class~="z-0"]';
const AI_BODY = '.sully-chat-root .sully-bubble-ai > div[class~="select-text"]';
const USER_BODY = '.sully-chat-root .sully-bubble-user > div[class~="select-text"]';
const AI_WRAP = '.sully-chat-root .group.justify-start [class~="max-w-[72%]"].ml-12';
const USER_WRAP = '.sully-chat-root .group.justify-end [class~="max-w-[72%]"].mr-12';

const hideRule = (sel: string) =>
    `${sel} { display: none !important; visibility: hidden !important; opacity: 0 !important; pointer-events: none !important; }`;

export function buildChatFineTuneCss(theme: Pick<OSTheme,
    'chatAvatarVisibility' | 'chatAvatarAlign' | 'chatAvatarOffsetY' |
    'chatBubbleFontSize' | 'chatBubbleLineHeight' | 'chatBubbleIndent' | 'chatSnapToEdge'
>): string {
    const rules: string[] = [];
    const vis = theme.chatAvatarVisibility || 'both';
    const hideAi = vis === 'hide_ai' || vis === 'hide_both';
    const hideUser = vis === 'hide_user' || vis === 'hide_both';

    // ── 隐藏头像 ──
    if (hideAi) rules.push(hideRule(AI_AVATAR));
    if (hideUser) rules.push(hideRule(USER_AVATAR));

    // ── 贴边（只对隐藏了头像的一侧收回空位）──
    if (theme.chatSnapToEdge) {
        if (hideAi) rules.push(`${AI_WRAP} { margin-left: 0 !important; }`);
        if (hideUser) rules.push(`${USER_WRAP} { margin-right: 0 !important; }`);
    }

    // ── 头像对齐 + 垂直微调 ──
    const align = theme.chatAvatarAlign || 'bottom';
    const offY = theme.chatAvatarOffsetY || 0;
    if (align !== 'bottom' || offY !== 0) {
        const both = `${AI_AVATAR}, ${USER_AVATAR}`;
        if (align === 'top') {
            rules.push(`${both} { bottom: auto !important; top: -0.5rem !important;${offY ? ` transform: translateY(${offY}px) !important;` : ''} }`);
        } else if (align === 'center') {
            rules.push(`${both} { bottom: auto !important; top: 50% !important; transform: translateY(calc(-50% + ${offY}px)) !important; }`);
        } else {
            rules.push(`${both} { transform: translateY(${offY}px) !important; }`);
        }
    }

    // ── 气泡与头像侧的间距（贴边侧不重复设置，贴边优先）──
    const indent = theme.chatBubbleIndent || 0;
    if (indent > 0) {
        if (!(theme.chatSnapToEdge && hideAi)) rules.push(`${AI_WRAP} { margin-left: ${indent}px !important; }`);
        if (!(theme.chatSnapToEdge && hideUser)) rules.push(`${USER_WRAP} { margin-right: ${indent}px !important; }`);
    }

    // ── 正文字号 / 行距（沿用社区版的四层选择器：容器/内层行/内联继承/引用行）──
    const fs = theme.chatBubbleFontSize || 0;
    const lh = theme.chatBubbleLineHeight || 0;
    if (fs > 0 || lh > 0) {
        const decl = `${fs > 0 ? ` font-size: ${fs}px !important;` : ''}${lh > 0 ? ` line-height: ${lh} !important;` : ''}`;
        const inheritDecl = `${fs > 0 ? ' font-size: inherit !important;' : ''}${lh > 0 ? ' line-height: inherit !important;' : ''}`;
        rules.push(`${AI_BODY}, ${USER_BODY} {${decl} }`);
        rules.push(`${AI_BODY} div, ${USER_BODY} div {${decl} }`);
        rules.push(`${AI_BODY} strong, ${AI_BODY} em, ${AI_BODY} span, ${USER_BODY} strong, ${USER_BODY} em, ${USER_BODY} span {${inheritDecl} }`);
        rules.push(`${AI_BODY} [class*="text-[13px]"], ${USER_BODY} [class*="text-[13px]"] {${decl} }`);
    }

    return rules.length ? `/* 聊天细节微调（外观 App 生成，用户自定义 CSS 可覆盖） */\n${rules.join('\n')}` : '';
}
