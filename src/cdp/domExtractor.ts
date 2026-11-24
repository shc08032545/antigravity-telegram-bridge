/**
 * Browser-side script string / helper evaluated via Playwright's page.evaluate()
 * to extract an assistant message element into clean Markdown while ignoring
 * UI controls like "Copy" buttons inside code blocks.
 */

export interface AssistantSnapshot {
  selector: string | null;
  count: number;
  lastText: string;
}

export interface DomInspectionReport {
  title: string;
  url: string;
  inputs: string[];
  buttons: string[];
  fileInputs: string[];
  messageCandidates: Array<{ selector: string; count: number; preview: string }>;
}

/**
 * Serializes a DOM Element into clean Markdown.
 * Must remain self-contained because it is serialized and executed inside the browser context.
 */
export function extractAssistantSnapshotInPage(
  selectors: string[],
): AssistantSnapshot {
  function isHiddenOrUiControl(el: Element): boolean {
    const tag = el.tagName.toLowerCase();
    if (
      tag === 'button' ||
      tag === 'svg' ||
      tag === 'style' ||
      tag === 'script' ||
      tag === 'noscript'
    ) {
      return true;
    }
    if (el.getAttribute('aria-hidden') === 'true') {
      return true;
    }
    return false;
  }

  function detectLanguage(preEl: Element, codeEl: Element | null): string {
    const candidates = [
      codeEl?.getAttribute('class') ?? '',
      preEl.getAttribute('class') ?? '',
      codeEl?.getAttribute('data-language') ?? '',
      preEl.getAttribute('data-language') ?? '',
    ];
    for (const raw of candidates) {
      const match = raw.match(/(?:language-|lang-)([a-zA-Z0-9_+-]+)/);
      if (match?.[1]) return match[1];
      if (/^[a-zA-Z0-9_+-]+$/.test(raw.trim()) && raw.trim().length <= 20) {
        return raw.trim();
      }
    }
    return '';
  }

  function serializeNode(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent ?? '';
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return '';
    }

    const el = node as Element;
    if (isHiddenOrUiControl(el)) {
      return '';
    }

    const tag = el.tagName.toLowerCase();

    if (tag === 'br') {
      return '\n';
    }

    if (tag === 'pre') {
      const codeEl = el.querySelector('code');
      const lang = detectLanguage(el, codeEl);
      const rawCode = (codeEl ?? el).textContent ?? '';
      const cleaned = rawCode.replace(/\n$/, '');
      return `\n\`\`\`${lang}\n${cleaned}\n\`\`\`\n\n`;
    }

    if (tag === 'code') {
      const text = el.textContent ?? '';
      return `\`${text}\``;
    }

    const childrenText = Array.from(el.childNodes).map(serializeNode).join('');

    if (tag === 'a') {
      const href = el.getAttribute('href') ?? '';
      const label = childrenText.trim();
      if (href && /^https?:\/\//i.test(href) && label) {
        return `[${label}](${href})`;
      }
      return childrenText;
    }

    if (tag === 'strong' || tag === 'b') {
      const trimmed = childrenText.trim();
      return trimmed ? `**${trimmed}**` : '';
    }

    if (tag === 'em' || tag === 'i') {
      const trimmed = childrenText.trim();
      return trimmed ? `*${trimmed}*` : '';
    }

    if (/^h[1-6]$/.test(tag)) {
      const level = Number(tag.slice(1));
      const trimmed = childrenText.trim();
      return trimmed ? `\n${'#'.repeat(level)} ${trimmed}\n\n` : '';
    }

    if (tag === 'li') {
      const trimmed = childrenText.trim();
      return trimmed ? `- ${trimmed}\n` : '';
    }

    if (tag === 'ul' || tag === 'ol') {
      return `\n${childrenText}\n`;
    }

    if (tag === 'blockquote') {
      const quoted = childrenText
        .trim()
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n');
      return quoted ? `\n${quoted}\n\n` : '';
    }

    if (tag === 'p' || tag === 'div' || tag === 'section' || tag === 'article') {
      return `${childrenText}\n`;
    }

    return childrenText;
  }

  for (const selector of selectors) {
    let nodes: NodeListOf<Element>;
    try {
      nodes = document.querySelectorAll(selector);
    } catch {
      continue;
    }

    if (nodes.length === 0) continue;

    const lastEl = nodes[nodes.length - 1];
    if (!lastEl) continue;

    const serialized = serializeNode(lastEl)
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    const fallbackText = (lastEl.textContent ?? '').trim();

    return {
      selector,
      count: nodes.length,
      lastText: serialized || fallbackText,
    };
  }

  return { selector: null, count: 0, lastText: '' };
}

export function inspectDomInPage(
  candidateMessageSelectors: string[],
): DomInspectionReport {
  function describeElement(el: Element): string {
    const tag = el.tagName.toLowerCase();
    const id = el.id ? `#${el.id}` : '';
    const testId = el.getAttribute('data-testid')
      ? `[data-testid="${el.getAttribute('data-testid')}"]`
      : '';
    const aria = el.getAttribute('aria-label')
      ? `[aria-label="${el.getAttribute('aria-label')}"]`
      : '';
    const placeholder = el.getAttribute('placeholder')
      ? `[placeholder="${el.getAttribute('placeholder')}"]`
      : '';
    const role = el.getAttribute('role')
      ? `[role="${el.getAttribute('role')}"]`
      : '';
    const ce =
      el.getAttribute('contenteditable') === 'true'
        ? '[contenteditable="true"]'
        : '';
    const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 30);
    const suffix = text ? ` ("${text}")` : '';
    return `${tag}${id}${testId}${aria}${placeholder}${role}${ce}${suffix}`;
  }

  const inputEls = Array.from(
    document.querySelectorAll(
      'textarea, [contenteditable="true"], [role="textbox"]',
    ),
  ).slice(0, 8);

  const buttonEls = Array.from(document.querySelectorAll('button'))
    .filter((btn) => {
      const rect = btn.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    })
    .slice(0, 12);

  const fileInputEls = Array.from(
    document.querySelectorAll('input[type="file"]'),
  ).slice(0, 5);

  const messageCandidates: Array<{
    selector: string;
    count: number;
    preview: string;
  }> = [];

  for (const selector of candidateMessageSelectors) {
    try {
      const matches = document.querySelectorAll(selector);
      if (matches.length > 0) {
        const last = matches[matches.length - 1];
        const preview = (last?.textContent ?? '')
          .trim()
          .replace(/\s+/g, ' ')
          .slice(0, 60);
        messageCandidates.push({
          selector,
          count: matches.length,
          preview,
        });
      }
    } catch {
      // Ignore invalid selector
    }
  }

  return {
    title: document.title,
    url: window.location.href,
    inputs: inputEls.map(describeElement),
    buttons: buttonEls.map(describeElement),
    fileInputs: fileInputEls.map(describeElement),
    messageCandidates,
  };
}
