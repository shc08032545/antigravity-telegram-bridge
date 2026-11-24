import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium, type Browser, type Locator, type Page } from 'playwright-core';
import type { AppConfig } from '../config.js';
import type { SelectorConfig } from '../selectors.js';
import type { Logger } from '../utils/logger.js';
import { TaskQueue } from '../utils/queue.js';
import {
  extractAssistantSnapshotInPage,
  inspectDomInPage,
  type AssistantSnapshot,
  type DomInspectionReport,
} from './domExtractor.js';

export interface TabInfo {
  index: number;
  title: string;
  url: string;
  isAttached: boolean;
}

export interface BridgeStatus {
  connected: boolean;
  cdpUrl: string;
  attachedTab: { title: string; url: string } | null;
  queueSize: number;
  isBusy: boolean;
  matchedInputSelector: string | null;
}

export interface SendPromptOptions {
  onProgress?: (partialText: string) => void | Promise<void>;
  attachmentPath?: string;
}

export interface SendPromptResult {
  text: string;
  aborted: boolean;
  timedOut: boolean;
  elapsedMs: number;
  matchedMessageSelector: string | null;
}

export type CdpConnector = (endpointURL: string) => Promise<Browser>;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function guessMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.pdf': 'application/pdf',
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.json': 'application/json',
    '.csv': 'text/csv',
    '.zip': 'application/zip',
  };
  return map[ext] ?? 'application/octet-stream';
}

export class AntigravityBridge {
  private readonly config: AppConfig;
  private readonly selectors: SelectorConfig;
  private readonly logger: Logger;
  private readonly connector: CdpConnector;
  private readonly queue = new TaskQueue();

  private browser: Browser | null = null;
  private activePage: Page | null = null;
  private activeAbortController: AbortController | null = null;

  constructor(
    config: AppConfig,
    selectors: SelectorConfig,
    logger: Logger,
    connector: CdpConnector = (url) => chromium.connectOverCDP(url),
  ) {
    this.config = config;
    this.selectors = selectors;
    this.logger = logger;
    this.connector = connector;
  }

  get isBusy(): boolean {
    return this.queue.isBusy;
  }

  get queueSize(): number {
    return this.queue.size;
  }

  async connect(): Promise<void> {
    if (this.browser && this.browser.isConnected()) {
      return;
    }

    this.logger.info(`Connecting to Chrome CDP at ${this.config.chromeCdpUrl}`);
    this.browser = await this.connector(this.config.chromeCdpUrl);
    this.browser.on('disconnected', () => {
      this.logger.warn('Chrome CDP disconnected. Will reconnect on next command.');
      this.browser = null;
      this.activePage = null;
    });

    await this.autoAttachTab();
  }

  async disconnect(): Promise<void> {
    this.activeAbortController?.abort();
    this.activeAbortController = null;
    this.activePage = null;
    if (this.browser) {
      try {
        await this.browser.close();
      } catch {
        // Closing a CDP connection may throw if Chrome already exited
      }
      this.browser = null;
    }
  }

  private getAllPages(): Page[] {
    if (!this.browser || !this.browser.isConnected()) {
      return [];
    }
    return this.browser
      .contexts()
      .flatMap((ctx) => ctx.pages())
      .filter((page) => !page.isClosed());
  }

  async listTabs(): Promise<TabInfo[]> {
    await this.connect();
    const pages = this.getAllPages();
    const tabs: TabInfo[] = [];

    for (let i = 0; i < pages.length; i += 1) {
      const page = pages[i];
      if (!page) continue;
      let title = '(untitled)';
      try {
        title = (await page.title()) || '(untitled)';
      } catch {
        // Ignore transient title errors
      }
      tabs.push({
        index: i + 1,
        title,
        url: page.url(),
        isAttached: page === this.activePage,
      });
    }

    return tabs;
  }

  async attachTabByIndex(oneBasedIndex: number): Promise<TabInfo> {
    await this.connect();
    const pages = this.getAllPages();
    const target = pages[oneBasedIndex - 1];
    if (!target) {
      throw new Error(
        `Tab #${oneBasedIndex} not found. Available tabs: ${pages.length}. Use /tabs to inspect.`,
      );
    }

    this.activePage = target;
    await target.bringToFront().catch(() => undefined);

    const title = (await target.title().catch(() => '')) || '(untitled)';
    this.logger.info(`Attached to tab #${oneBasedIndex}: ${title} (${target.url()})`);
    return {
      index: oneBasedIndex,
      title,
      url: target.url(),
      isAttached: true,
    };
  }

  private async autoAttachTab(): Promise<Page> {
    const pages = this.getAllPages();
    if (pages.length === 0) {
      throw new Error(
        'No open Chrome tabs found. Please open Antigravity Web in your remote-debugging Chrome window.',
      );
    }

    const pattern = this.config.antigravityUrlMatch.toLowerCase();
    let matched: Page | undefined;

    for (const page of pages) {
      const url = page.url().toLowerCase();
      const title = (await page.title().catch(() => '')).toLowerCase();
      if (pattern && (url.includes(pattern) || title.includes(pattern))) {
        matched = page;
        break;
      }
    }

    // Fallback to the first non-devtools http(s) tab if pattern doesn't match yet
    if (!matched) {
      matched =
        pages.find(
          (p) =>
            /^https?:\/\//i.test(p.url()) && !p.url().startsWith('devtools://'),
        ) ?? pages[0];
    }

    if (!matched) {
      throw new Error('Unable to locate an open browser tab.');
    }

    this.activePage = matched;
    const title = (await matched.title().catch(() => '')) || '(untitled)';
    this.logger.info(`Auto-attached tab: ${title} (${matched.url()})`);
    return matched;
  }

  private async ensurePage(): Promise<Page> {
    await this.connect();
    if (this.activePage && !this.activePage.isClosed()) {
      return this.activePage;
    }
    return this.autoAttachTab();
  }

  private async findFirstVisible(
    page: Page,
    selectors: string[],
  ): Promise<{ selector: string; locator: Locator } | null> {
    for (const selector of selectors) {
      try {
        const locator = page.locator(selector).last();
        const count = await page.locator(selector).count();
        if (count === 0) continue;
        if (await locator.isVisible().catch(() => false)) {
          return { selector, locator };
        }
      } catch {
        // Continue to next selector fallback
      }
    }
    return null;
  }

  private async findFirstAttached(
    page: Page,
    selectors: string[],
  ): Promise<{ selector: string; locator: Locator } | null> {
    for (const selector of selectors) {
      try {
        const count = await page.locator(selector).count();
        if (count > 0) {
          return { selector, locator: page.locator(selector).last() };
        }
      } catch {
        // Continue to next selector fallback
      }
    }
    return null;
  }

  async getStatus(): Promise<BridgeStatus> {
    let connected = Boolean(this.browser && this.browser.isConnected());
    let attachedTab: { title: string; url: string } | null = null;
    let matchedInputSelector: string | null = null;

    if (!connected) {
      try {
        await this.connect();
        connected = true;
      } catch {
        connected = false;
      }
    }

    if (connected && this.activePage && !this.activePage.isClosed()) {
      const title = (await this.activePage.title().catch(() => '')) || '(untitled)';
      attachedTab = { title, url: this.activePage.url() };
      const foundInput = await this.findFirstVisible(
        this.activePage,
        this.selectors.chatInput,
      );
      matchedInputSelector = foundInput?.selector ?? null;
    }

    return {
      connected,
      cdpUrl: this.config.chromeCdpUrl,
      attachedTab,
      queueSize: this.queue.size,
      isBusy: this.queue.isBusy,
      matchedInputSelector,
    };
  }

  async sendPrompt(
    prompt: string,
    options: SendPromptOptions = {},
  ): Promise<SendPromptResult> {
    return this.queue.enqueue(async () => {
      const startedAt = Date.now();
      const page = await this.ensurePage();
      await page.bringToFront().catch(() => undefined);

      const abortController = new AbortController();
      this.activeAbortController = abortController;

      try {
        const baseline = await this.readAssistantSnapshot(page);
        this.logger.debug('Baseline snapshot before sending prompt', {
          selector: baseline.selector,
          count: baseline.count,
          lastTextLength: baseline.lastText.length,
        });

        if (options.attachmentPath) {
          await this.attachFileToPage(page, options.attachmentPath);
          await sleep(1000);
        }

        const trimmedPrompt = prompt.trim();
        if (trimmedPrompt.length > 0) {
          await this.fillChatInput(page, trimmedPrompt);
        }

        await this.submitChat(page);

        return await this.waitForResponse(
          page,
          baseline,
          startedAt,
          abortController.signal,
          options.onProgress,
        );
      } finally {
        if (this.activeAbortController === abortController) {
          this.activeAbortController = null;
        }
      }
    });
  }

  private async fillChatInput(page: Page, text: string): Promise<void> {
    const found = await this.findFirstVisible(page, this.selectors.chatInput);
    if (!found) {
      throw new Error(
        'Could not find the chat input box on the active tab. Use /inspect to see page elements and update selectors.json.',
      );
    }

    const { locator } = found;
    await locator.click();

    const tagName = await locator
      .evaluate((el) => el.tagName.toLowerCase())
      .catch(() => 'div');

    if (tagName === 'textarea' || tagName === 'input') {
      await locator.fill(text);
      return;
    }

    // Contenteditable editors (Lexical/ProseMirror/Slate): insert line by line
    // using Shift+Enter so newlines don't trigger premature submission.
    await page.keyboard.press('ControlOrMeta+A').catch(() => undefined);
    await page.keyboard.press('Backspace').catch(() => undefined);

    const lines = text.replace(/\r\n/g, '\n').split('\n');
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i] ?? '';
      if (line.length > 0) {
        await page.keyboard.insertText(line);
      }
      if (i < lines.length - 1) {
        await page.keyboard.press('Shift+Enter');
      }
    }
  }

  private async submitChat(page: Page): Promise<void> {
    const sendBtn = await this.findFirstVisible(page, this.selectors.sendButton);
    if (sendBtn) {
      const isEnabled = await sendBtn.locator.isEnabled().catch(() => false);
      if (isEnabled) {
        await sendBtn.locator.click();
        return;
      }
    }

    // Fallback to pressing Enter inside the focused input
    await page.keyboard.press('Enter');
  }

  private async attachFileToPage(page: Page, filePath: string): Promise<void> {
    this.logger.info(`Uploading attachment: ${path.basename(filePath)}`);

    // Strategy 1: Direct <input type="file"> (works even when visually hidden)
    const fileInput = await this.findFirstAttached(
      page,
      this.selectors.fileInput,
    );
    if (fileInput) {
      await fileInput.locator.setInputFiles(filePath);
      this.logger.debug(`Uploaded via file input (${fileInput.selector})`);
      return;
    }

    // Strategy 2: Click attach button and intercept native file chooser
    const attachBtn = await this.findFirstVisible(
      page,
      this.selectors.attachButton,
    );
    if (attachBtn) {
      const [fileChooser] = await Promise.all([
        page.waitForEvent('filechooser', { timeout: 5000 }),
        attachBtn.locator.click(),
      ]);
      await fileChooser.setFiles(filePath);
      this.logger.debug(`Uploaded via filechooser (${attachBtn.selector})`);
      return;
    }

    // Strategy 3: Synthetic paste event with File DataTransfer onto chat input
    const chatInput = await this.findFirstVisible(page, this.selectors.chatInput);
    if (!chatInput) {
      throw new Error(
        'Unable to upload file: no file input, attach button, or chat input found. Check /inspect.',
      );
    }

    const fileBuffer = await fs.readFile(filePath);
    const base64 = fileBuffer.toString('base64');
    const fileName = path.basename(filePath);
    const mimeType = guessMimeType(filePath);

    await chatInput.locator.click();
    await chatInput.locator.evaluate(
      (el, payload) => {
        const binary = atob(payload.base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) {
          bytes[i] = binary.charCodeAt(i);
        }
        const file = new File([bytes], payload.fileName, {
          type: payload.mimeType,
        });
        const dt = new DataTransfer();
        dt.items.add(file);

        const pasteEvent = new ClipboardEvent('paste', {
          bubbles: true,
          cancelable: true,
          clipboardData: dt,
        });
        el.dispatchEvent(pasteEvent);
      },
      { base64, fileName, mimeType },
    );

    this.logger.debug('Uploaded via synthetic paste DataTransfer fallback');
  }

  private async readAssistantSnapshot(page: Page): Promise<AssistantSnapshot> {
    return page.evaluate(
      extractAssistantSnapshotInPage,
      this.selectors.assistantMessage,
    );
  }

  private async isGenerating(page: Page): Promise<boolean> {
    const stopBtn = await this.findFirstVisible(page, this.selectors.stopButton);
    if (stopBtn) return true;

    const busy = await this.findFirstVisible(page, this.selectors.busyIndicator);
    return Boolean(busy);
  }

  private async waitForResponse(
    page: Page,
    baseline: AssistantSnapshot,
    startedAt: number,
    signal: AbortSignal,
    onProgress?: (partialText: string) => void | Promise<void>,
  ): Promise<SendPromptResult> {
    let hasStarted = false;
    let latestText = '';
    let latestSelector = baseline.selector;
    let lastChangedAt = Date.now();

    while (Date.now() - startedAt < this.config.responseTimeoutMs) {
      if (signal.aborted) {
        return {
          text: latestText,
          aborted: true,
          timedOut: false,
          elapsedMs: Date.now() - startedAt,
          matchedMessageSelector: latestSelector,
        };
      }

      const [snapshot, generating] = await Promise.all([
        this.readAssistantSnapshot(page),
        this.isGenerating(page),
      ]);

      const newMessageAppeared =
        snapshot.count > baseline.count && snapshot.lastText.length > 0;
      const existingMessageUpdated =
        snapshot.count === baseline.count &&
        snapshot.count > 0 &&
        snapshot.lastText !== baseline.lastText &&
        snapshot.lastText.length > 0;

      if (newMessageAppeared || existingMessageUpdated) {
        hasStarted = true;
        latestSelector = snapshot.selector;
        if (snapshot.lastText !== latestText) {
          latestText = snapshot.lastText;
          lastChangedAt = Date.now();
          if (onProgress) {
            await onProgress(latestText);
          }
        }
      } else if (generating) {
        // Still waiting for first token while model is thinking
        lastChangedAt = Date.now();
      }

      if (
        hasStarted &&
        !generating &&
        Date.now() - lastChangedAt >= this.config.responseStableMs
      ) {
        return {
          text: latestText,
          aborted: false,
          timedOut: false,
          elapsedMs: Date.now() - startedAt,
          matchedMessageSelector: latestSelector,
        };
      }

      await sleep(this.config.pollIntervalMs);
    }

    return {
      text: latestText,
      aborted: false,
      timedOut: true,
      elapsedMs: Date.now() - startedAt,
      matchedMessageSelector: latestSelector,
    };
  }

  async stopGeneration(): Promise<boolean> {
    let stopped = false;

    if (this.activeAbortController) {
      this.activeAbortController.abort();
      stopped = true;
    }

    try {
      const page = await this.ensurePage();
      const stopBtn = await this.findFirstVisible(page, this.selectors.stopButton);
      if (stopBtn) {
        await stopBtn.locator.click();
        stopped = true;
      }
    } catch (err) {
      this.logger.warn('Failed to click stop button on page', err);
    }

    return stopped;
  }

  async startNewChat(): Promise<boolean> {
    return this.queue.enqueue(async () => {
      const page = await this.ensurePage();
      await page.bringToFront().catch(() => undefined);

      const newChatBtn = await this.findFirstVisible(
        page,
        this.selectors.newChatButton,
      );
      if (!newChatBtn) {
        return false;
      }

      await newChatBtn.locator.click();
      await sleep(500);
      return true;
    });
  }

  async takeScreenshot(): Promise<Buffer> {
    const page = await this.ensurePage();
    await page.bringToFront().catch(() => undefined);
    return page.screenshot({ type: 'png', fullPage: false });
  }

  async inspectDom(): Promise<DomInspectionReport> {
    const page = await this.ensurePage();
    return page.evaluate(inspectDomInPage, this.selectors.assistantMessage);
  }
}
