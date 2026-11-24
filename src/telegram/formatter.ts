export const TELEGRAM_MAX_LENGTH = 4096;

/**
 * Escapes HTML special characters for Telegram HTML parse_mode.
 */
export function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function escapeHtmlAttr(url: string): string {
  return escapeHtml(url).replaceAll('"', '&quot;');
}

/**
 * Formats inline Markdown (code, bold, italic, strikethrough, links)
 * into Telegram-compatible HTML.
 */
function formatInlineMarkdown(raw: string): string {
  const inlineCodeTokens: string[] = [];

  // Preserve inline code spans first so formatting inside them is untouched.
  let text = raw.replace(/`([^`\n]+)`/g, (_match, code: string) => {
    const token = `\u0000INLINECODE_${inlineCodeTokens.length}\u0000`;
    inlineCodeTokens.push(`<code>${escapeHtml(code)}</code>`);
    return token;
  });

  // Preserve Markdown links [label](https://...)
  const linkTokens: string[] = [];
  text = text.replace(
    /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g,
    (_match, label: string, url: string) => {
      const token = `\u0000LINK_${linkTokens.length}\u0000`;
      linkTokens.push(
        `<a href="${escapeHtmlAttr(url)}">${escapeHtml(label)}</a>`,
      );
      return token;
    },
  );

  // Escape remaining raw HTML entities.
  text = escapeHtml(text);

  // Headings: # Heading -> bold line
  text = text.replace(/^#{1,6}\s+(.+)$/gm, '<b>$1</b>');

  // Blockquotes: > quote -> Telegram <blockquote>
  text = text.replace(/(?:^&gt;\s?.+(?:\n|$))+/gm, (block) => {
    const inner = block
      .trimEnd()
      .split('\n')
      .map((line) => line.replace(/^&gt;\s?/, ''))
      .join('\n');
    return `<blockquote>${inner}</blockquote>\n`;
  });

  // Bold (**text** or __text__)
  text = text.replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>');
  text = text.replace(/__([^_\n]+)__/g, '<b>$1</b>');

  // Strikethrough (~~text~~)
  text = text.replace(/~~([^~\n]+)~~/g, '<s>$1</s>');

  // Italic (*text*) - avoid matching list bullets or intra-word underscores
  text = text.replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?:;]|$)/g, '$1<i>$2</i>');

  // Restore links
  text = text.replace(/\u0000LINK_(\d+)\u0000/g, (_m, idx: string) => {
    return linkTokens[Number(idx)] ?? '';
  });

  // Restore inline code
  text = text.replace(/\u0000INLINECODE_(\d+)\u0000/g, (_m, idx: string) => {
    return inlineCodeTokens[Number(idx)] ?? '';
  });

  return text;
}

/**
 * Converts Markdown (including fenced code blocks) into Telegram-safe HTML.
 */
export function markdownToTelegramHtml(markdown: string): string {
  const normalized = markdown.replace(/\r\n/g, '\n');
  const codeBlockRegex = /```([a-zA-Z0-9_+-]*)\n?([\s\S]*?)```/g;

  let result = '';
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = codeBlockRegex.exec(normalized)) !== null) {
    const before = normalized.slice(lastIndex, match.index);
    result += formatInlineMarkdown(before);

    const lang = (match[1] ?? '').trim();
    const code = (match[2] ?? '').replace(/\n$/, '');
    const escapedCode = escapeHtml(code);

    if (lang) {
      result += `<pre><code class="language-${escapeHtmlAttr(lang)}">${escapedCode}</code></pre>`;
    } else {
      result += `<pre><code>${escapedCode}</code></pre>`;
    }

    lastIndex = match.index + match[0].length;
  }

  result += formatInlineMarkdown(normalized.slice(lastIndex));
  return result.trim();
}

/**
 * Splits long Markdown text into chunks that stay within Telegram's
 * 4,096-character limit even after HTML conversion, cleanly closing
 * and reopening fenced code blocks across chunk boundaries.
 */
export function splitMarkdownForTelegram(
  markdown: string,
  maxLength = 3500,
): string[] {
  const normalized = markdown.replace(/\r\n/g, '\n').trim();
  if (!normalized) {
    return [];
  }

  if (
    normalized.length <= maxLength &&
    markdownToTelegramHtml(normalized).length <= TELEGRAM_MAX_LENGTH
  ) {
    return [normalized];
  }

  const lines = normalized.split('\n');
  const chunks: string[] = [];

  let currentLines: string[] = [];
  let inCodeBlock = false;
  let codeBlockLang = '';

  const flushChunk = (reopenCodeBlock: boolean): void => {
    if (currentLines.length === 0) return;
    if (inCodeBlock) {
      currentLines.push('```');
    }
    const text = currentLines.join('\n').trim();
    if (text) {
      chunks.push(text);
    }
    currentLines = reopenCodeBlock ? ['```' + codeBlockLang] : [];
  };

  const fits = (candidateLines: string[]): boolean => {
    const closingReserve = inCodeBlock ? '\n```' : '';
    const candidate = candidateLines.join('\n') + closingReserve;
    if (candidate.length > maxLength) return false;
    return markdownToTelegramHtml(candidate).length <= TELEGRAM_MAX_LENGTH - 64;
  };

  for (const rawLine of lines) {
    // Handle single extraordinarily long line by slicing it safely
    const segments = splitLongLine(rawLine, Math.min(maxLength - 100, 1800));

    for (const line of segments) {
      const fenceMatch = line.match(/^```([a-zA-Z0-9_+-]*)\s*$/);
      const nextInCodeBlock: boolean = fenceMatch ? !inCodeBlock : inCodeBlock;
      const nextCodeLang: string = fenceMatch
        ? nextInCodeBlock
          ? (fenceMatch[1] ?? '')
          : ''
        : codeBlockLang;

      const candidate = [...currentLines, line];
      if (!fits(candidate) && currentLines.length > 0) {
        flushChunk(inCodeBlock);
      }

      currentLines.push(line);
      inCodeBlock = nextInCodeBlock;
      codeBlockLang = nextCodeLang;
    }
  }

  flushChunk(false);
  return chunks;
}

function splitLongLine(line: string, limit: number): string[] {
  if (line.length <= limit) {
    return [line];
  }

  const parts: string[] = [];
  let remaining = line;

  while (remaining.length > limit) {
    let splitIdx = remaining.lastIndexOf(' ', limit);
    if (splitIdx < Math.floor(limit * 0.5)) {
      splitIdx = limit;
    }
    parts.push(remaining.slice(0, splitIdx));
    remaining = remaining.slice(splitIdx).trimStart();
  }

  if (remaining.length > 0) {
    parts.push(remaining);
  }

  return parts;
}
