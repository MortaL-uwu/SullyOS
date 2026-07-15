import { describe, it, expect } from 'vitest';
import { extractJson } from './safeApi';

/**
 * 回归测试：自习室（StudyApp）生成题目时，Claude 高频返回未转义特殊字符的 JSON，
 * 裸 JSON.parse 会在 line 12 附近抛 "Expected ',' or '}' after property value"。
 * generateQuiz / createCourse 改用 extractJson 的多层容错来吃掉这类畸形输出。
 */
describe('extractJson – Claude quiz JSON recovery', () => {
    it('recovers unescaped inner quotes inside a string value', () => {
        const bad = `{
  "questions": [
    {
      "type": "choice",
      "stem": "First",
      "options": ["A. x", "B. y", "C. z", "D. w"],
      "answer": "A",
      "explanation": "ok"
    },
    {
      "type": "fill_blank",
      "stem": "The term "React" refers to a ___",
      "answer": "library",
      "explanation": "because"
    }
  ]
}`;
        const j = extractJson(bad);
        expect(j).not.toBeNull();
        expect(Array.isArray(j.questions)).toBe(true);
        expect(j.questions.length).toBe(2);
    });

    it('recovers a diary reply with unescaped inner quotes (交换日记 REPLY)', () => {
        // Mirrors JournalApp's char reply shape { text, paperStyle, stickers }.
        // Claude leaves the inner 「"还不够好"」 quotes unescaped → naked JSON.parse dies and
        // the old catch dumped the whole raw object into the diary body.
        const bad = `{
  "text": "普通的一天，我今天想了想那句 "还不够好"，其实挺释怀的。",
  "paperStyle": "plain",
  "stickers": []
}`;
        const j = extractJson(bad);
        expect(j).not.toBeNull();
        expect(typeof j.text).toBe('string');
        expect(j.text).toContain('还不够好');
    });

    it('recovers literal newlines inside JSON string values (TRPG OOC chat)', () => {
        // When prompted to "use newlines to separate bubbles," LLMs sometimes emit
        // a real newline byte inside the JSON string instead of the escape sequence \n.
        // JSON.parse throws "Bad control character in string literal" on that.
        // Regression: caused silent OOC message drop (空回) after prompt edit that
        // told the model to split messages with newlines — the instruction worked,
        // but broke JSON parsing because the model inserted literal \n bytes.
        const bad = `[{"charId":"c1","speak":true,"content":"哈哈我这次居然大成功了
太爽了"},{"charId":"c2","speak":false,"content":""}]`;
        const j = extractJson(bad);
        expect(j).not.toBeNull();
        expect(Array.isArray(j)).toBe(true);
        expect(j.length).toBe(2);
        expect(j[0].content).toContain('\n'); // after fix, the literal newline becomes a real \n in the parsed value
        expect(j[0].content).toBe('哈哈我这次居然大成功了\n太爽了');
    });

    it('does not escape structural newlines outside of strings (pretty-print)', () => {
        // Pretty-printed JSON with newlines/tabs for indentation should remain parseable
        const pretty = `{
  "questions": [
    {
      "stem": "First"
    }
  ]
}`;
        const j = extractJson(pretty);
        expect(j).not.toBeNull();
        expect(Array.isArray(j.questions)).toBe(true);
    });

    it('does not double-escape already-escaped newlines', () => {
        // If the model correctly emitted \n as a two-char escape sequence, don't break it
        const alreadyEscaped = `{"content":"line one\\nline two"}`;
        const j = extractJson(alreadyEscaped);
        expect(j).not.toBeNull();
        expect(j.content).toBe('line one\nline two'); // parsed value has a real newline
    });

    it('strips code fences and drops trailing commas', () => {
        const bad = '```json\n{ "questions": [ { "type": "true_false", "answer": "true", }, ], }\n```';
        const j = extractJson(bad);
        expect(j).not.toBeNull();
        expect(Array.isArray(j.questions)).toBe(true);
    });

    it('degrades safely on truncated output (hit max_tokens mid-array)', () => {
        // extractJson cannot rebuild the { questions: [...] } wrapper from a mid-nested-array
        // cutoff, so the StudyApp guard (!Array.isArray(json.questions)) rejects the result and
        // shows a friendly "请重试" toast instead of the old uncaught JSON.parse crash.
        const bad = '{ "questions": [ { "type": "choice", "stem": "Q1", "answer": "A", "explanation": "ok" }, { "type": "choice", "stem": "Q2", "answer';
        const j = extractJson(bad);
        const usable = j != null && Array.isArray(j.questions);
        expect(usable).toBe(false);
    });

    it('returns null on hopeless garbage (caller then throws a friendly error)', () => {
        expect(extractJson('this is not json at all')).toBeNull();
    });
});
