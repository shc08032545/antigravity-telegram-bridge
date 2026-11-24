import { describe, expect, it } from 'vitest';
import {
  escapeHtml,
  markdownToTelegramHtml,
  splitMarkdownForTelegram,
  TELEGRAM_MAX_LENGTH,
} from '../src/telegram/formatter.js';

describe('formatter', () => {
  it('escapes HTML special characters safely', () => {
    expect(escapeHtml('<script>alert("x") & y > 0</script>')).toBe(
      '&lt;script&gt;alert("x") &amp; y &gt; 0&lt;/script&gt;',
    );
  });

  it('converts headings, bold, italic, inline code, links, and fenced code blocks', () => {
    const md = [
      '# สรุปการทำงาน',
      '',
      'ทดสอบ **ตัวหนา** และ *ตัวเอียง* พร้อม `const x = 1 < 2;` และ [ลิงก์](https://example.com)',
      '',
      '```ts',
      'function greet(name: string): string {',
      '  return `Hello <${name}>`;',
      '}',
      '```',
    ].join('\n');

    const html = markdownToTelegramHtml(md);

    expect(html).toContain('<b>สรุปการทำงาน</b>');
    expect(html).toContain('<b>ตัวหนา</b>');
    expect(html).toContain('<i>ตัวเอียง</i>');
    expect(html).toContain('<code>const x = 1 &lt; 2;</code>');
    expect(html).toContain('<a href="https://example.com">ลิงก์</a>');
    expect(html).toContain(
      '<pre><code class="language-ts">function greet(name: string): string {\n  return `Hello &lt;${name}&gt;`;\n}</code></pre>',
    );
  });

  it('keeps short messages in a single chunk', () => {
    const chunks = splitMarkdownForTelegram('สวัสดีจาก Antigravity Web!');
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe('สวัสดีจาก Antigravity Web!');
  });

  it('splits very long text while keeping every HTML chunk under Telegram limit', () => {
    const paragraph = 'ข้อความภาษาไทยทดสอบการแบ่งพารากราฟยาวๆ เพื่อส่งผ่าน Telegram Bot Bridge '.repeat(
      12,
    );
    const longMd = Array.from({ length: 15 }, (_, i) => `## ส่วนที่ ${i + 1}\n${paragraph}`).join(
      '\n\n',
    );

    const chunks = splitMarkdownForTelegram(longMd);
    expect(chunks.length).toBeGreaterThan(2);

    for (const chunk of chunks) {
      const html = markdownToTelegramHtml(chunk);
      expect(html.length).toBeLessThanOrEqual(TELEGRAM_MAX_LENGTH);
    }
  });

  it('cleanly closes and reopens fenced code blocks across chunks', () => {
    const codeLines = Array.from(
      { length: 160 },
      (_, i) => `console.log("line ${i + 1}: value < ${i + 2}");`,
    );
    const longCodeMd = ['```typescript', ...codeLines, '```'].join('\n');

    const chunks = splitMarkdownForTelegram(longCodeMd, 1500);
    expect(chunks.length).toBeGreaterThan(1);

    for (const chunk of chunks) {
      const fenceCount = (chunk.match(/^```/gm) ?? []).length;
      expect(fenceCount % 2).toBe(0);
      expect(markdownToTelegramHtml(chunk).length).toBeLessThanOrEqual(
        TELEGRAM_MAX_LENGTH,
      );
    }

    expect(chunks[1]?.startsWith('```typescript')).toBe(true);
  });
});
