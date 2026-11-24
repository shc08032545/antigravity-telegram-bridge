import type { Browser, Page } from 'playwright-core';
import { describe, expect, it, vi } from 'vitest';
import { AntigravityBridge } from '../src/cdp/bridge.js';
import type { AssistantSnapshot } from '../src/cdp/domExtractor.js';
import { parseConfig } from '../src/config.js';
import { DEFAULT_SELECTORS } from '../src/selectors.js';
import { Logger } from '../src/utils/logger.js';

interface MockPageState {
  url: string;
  title: string;
  snapshots: AssistantSnapshot[];
  snapshotCallIndex: number;
  generatingCallsRemaining: number;
  filledTexts: string[];
  uploadedFiles: string[];
  clickedSelectors: string[];
}

function createMockPage(initial: Partial<MockPageState> = {}): {
  page: Page;
  state: MockPageState;
} {
  const state: MockPageState = {
    url: initial.url ?? 'https://antigravity.example.com/chat',
    title: initial.title ?? 'Antigravity Web',
    snapshots: initial.snapshots ?? [
      { selector: '.assistant-message', count: 0, lastText: '' },
    ],
    snapshotCallIndex: 0,
    generatingCallsRemaining: initial.generatingCallsRemaining ?? 0,
    filledTexts: [],
    uploadedFiles: [],
    clickedSelectors: [],
  };

  const makeLocator = (selector: string) => ({
    count: vi.fn(async () => {
      if (selector === 'textarea') return 1;
      if (selector === 'button[aria-label*="Send" i]') return 1;
      if (selector === 'input[type="file"]') return 1;
      if (selector === 'button[aria-label*="New chat" i]') return 1;
      if (selector === 'button[aria-label*="Stop" i]') {
        return state.generatingCallsRemaining > 0 ? 1 : 0;
      }
      return 0;
    }),
    last: () => makeLocator(selector),
    isVisible: vi.fn(async () => {
      if (selector === 'button[aria-label*="Stop" i]') {
        if (state.generatingCallsRemaining > 0) {
          state.generatingCallsRemaining -= 1;
          return true;
        }
        return false;
      }
      return (
        selector === 'textarea' ||
        selector === 'button[aria-label*="Send" i]' ||
        selector === 'button[aria-label*="New chat" i]'
      );
    }),
    isEnabled: vi.fn(async () => true),
    click: vi.fn(async () => {
      state.clickedSelectors.push(selector);
    }),
    fill: vi.fn(async (text: string) => {
      state.filledTexts.push(text);
    }),
    setInputFiles: vi.fn(async (filePath: string) => {
      state.uploadedFiles.push(filePath);
    }),
    evaluate: vi.fn(async () => 'textarea'),
  });

  const page = {
    url: () => state.url,
    title: vi.fn(async () => state.title),
    isClosed: () => false,
    bringToFront: vi.fn(async () => undefined),
    locator: vi.fn((selector: string) => makeLocator(selector)),
    keyboard: {
      press: vi.fn(async () => undefined),
      insertText: vi.fn(async () => undefined),
    },
    evaluate: vi.fn(async () => {
      const idx = Math.min(state.snapshotCallIndex, state.snapshots.length - 1);
      state.snapshotCallIndex += 1;
      return state.snapshots[idx];
    }),
    screenshot: vi.fn(async () => Buffer.from('fake-png-bytes')),
  } as unknown as Page;

  return { page, state };
}

function createMockBrowser(pages: Page[]): Browser {
  return {
    isConnected: () => true,
    on: vi.fn(),
    close: vi.fn(async () => undefined),
    contexts: () => [{ pages: () => pages }],
  } as unknown as Browser;
}

describe('AntigravityBridge', () => {
  const testConfig = parseConfig({
    TELEGRAM_BOT_TOKEN: '123456789:test_token_value',
    RESPONSE_TIMEOUT_MS: '10000',
    RESPONSE_STABLE_MS: '500',
    POLL_INTERVAL_MS: '200',
    LOG_LEVEL: 'error',
  });
  const logger = new Logger('error');

  it('auto-attaches to the Antigravity tab and lists open tabs', async () => {
    const other = createMockPage({
      url: 'https://example.com',
      title: 'Example Docs',
    });
    const ag = createMockPage({
      url: 'https://app.antigravity.dev/workspace',
      title: 'Antigravity Studio',
    });

    const browser = createMockBrowser([other.page, ag.page]);
    const bridge = new AntigravityBridge(
      testConfig,
      DEFAULT_SELECTORS,
      logger,
      async () => browser,
    );

    const tabs = await bridge.listTabs();
    expect(tabs).toHaveLength(2);
    expect(tabs[0]?.isAttached).toBe(false);
    expect(tabs[1]?.isAttached).toBe(true);
    expect(tabs[1]?.title).toBe('Antigravity Studio');

    const switched = await bridge.attachTabByIndex(1);
    expect(switched.title).toBe('Example Docs');
  });

  it('sends prompt, streams partial progress, and resolves once stable', async () => {
    const { page, state } = createMockPage({
      generatingCallsRemaining: 1,
      snapshots: [
        // Baseline before send
        { selector: '.assistant-message', count: 1, lastText: 'Old answer' },
        // Poll 1: partial streaming
        { selector: '.assistant-message', count: 2, lastText: 'กำลังตอบ...' },
        // Poll 2: complete response
        {
          selector: '.assistant-message',
          count: 2,
          lastText: 'คำตอบสมบูรณ์พร้อม `code`',
        },
      ],
    });

    const browser = createMockBrowser([page]);
    const bridge = new AntigravityBridge(
      testConfig,
      DEFAULT_SELECTORS,
      logger,
      async () => browser,
    );

    const progressEvents: string[] = [];
    const result = await bridge.sendPrompt('ช่วยเขียนโค้ดหน่อย', {
      onProgress: (partial) => {
        progressEvents.push(partial);
      },
    });

    expect(state.filledTexts).toEqual(['ช่วยเขียนโค้ดหน่อย']);
    expect(state.clickedSelectors).toContain('button[aria-label*="Send" i]');
    expect(progressEvents).toEqual([
      'กำลังตอบ...',
      'คำตอบสมบูรณ์พร้อม `code`',
    ]);
    expect(result.aborted).toBe(false);
    expect(result.timedOut).toBe(false);
    expect(result.text).toBe('คำตอบสมบูรณ์พร้อม `code`');
  });

  it('uploads attachment via file input before submitting prompt', async () => {
    const { page, state } = createMockPage({
      snapshots: [
        { selector: '.assistant-message', count: 0, lastText: '' },
        {
          selector: '.assistant-message',
          count: 1,
          lastText: 'วิเคราะห์รูปภาพเรียบร้อยแล้ว',
        },
      ],
    });

    const browser = createMockBrowser([page]);
    const bridge = new AntigravityBridge(
      testConfig,
      DEFAULT_SELECTORS,
      logger,
      async () => browser,
    );

    const result = await bridge.sendPrompt('อธิบายภาพนี้', {
      attachmentPath: '/tmp/sample-photo.jpg',
    });

    expect(state.uploadedFiles).toEqual(['/tmp/sample-photo.jpg']);
    expect(state.filledTexts).toEqual(['อธิบายภาพนี้']);
    expect(result.text).toBe('วิเคราะห์รูปภาพเรียบร้อยแล้ว');
  });

  it('clicks new chat button via startNewChat()', async () => {
    const { page, state } = createMockPage();
    const browser = createMockBrowser([page]);
    const bridge = new AntigravityBridge(
      testConfig,
      DEFAULT_SELECTORS,
      logger,
      async () => browser,
    );

    const ok = await bridge.startNewChat();
    expect(ok).toBe(true);
    expect(state.clickedSelectors).toContain(
      'button[aria-label*="New chat" i]',
    );
  });
});
