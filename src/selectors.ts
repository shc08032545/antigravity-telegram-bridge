import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

export interface SelectorConfig {
  chatInput: string[];
  sendButton: string[];
  stopButton: string[];
  newChatButton: string[];
  fileInput: string[];
  attachButton: string[];
  assistantMessage: string[];
  busyIndicator: string[];
}

export const DEFAULT_SELECTORS: SelectorConfig = {
  chatInput: [
    'textarea[placeholder*="Ask" i]',
    'textarea[placeholder*="Message" i]',
    'textarea[placeholder*="Prompt" i]',
    'textarea[placeholder*="Type" i]',
    'div[contenteditable="true"][role="textbox"]',
    '[role="textbox"][contenteditable="true"]',
    'div[contenteditable="true"]',
    'textarea',
  ],
  sendButton: [
    'button[aria-label*="Send" i]',
    'button[data-testid*="send" i]',
    'button[title*="Send" i]',
    'button[type="submit"]',
  ],
  stopButton: [
    'button[aria-label*="Stop" i]',
    'button[aria-label*="Cancel" i]',
    'button[data-testid*="stop" i]',
    'button[title*="Stop" i]',
    'button:has-text("Stop")',
  ],
  newChatButton: [
    'button[aria-label*="New chat" i]',
    'button[aria-label*="New conversation" i]',
    'a[aria-label*="New chat" i]',
    'a[aria-label*="New conversation" i]',
    'button[data-testid*="new-chat" i]',
    'button:has-text("New chat")',
    'button:has-text("New")',
  ],
  fileInput: ['input[type="file"]'],
  attachButton: [
    'button[aria-label*="Attach" i]',
    'button[aria-label*="Upload" i]',
    'button[aria-label*="Add file" i]',
    'button[aria-label*="Add image" i]',
    'button[title*="Attach" i]',
    'button[data-testid*="attach" i]',
  ],
  assistantMessage: [
    '[data-message-author-role="assistant"]',
    '[data-role="assistant"]',
    '[data-author="assistant"]',
    '.assistant-message',
    '.model-response',
    '.markdown-body',
    '.prose',
  ],
  busyIndicator: [
    '[aria-busy="true"]',
    '[data-streaming="true"]',
    '.streaming-indicator',
    '.typing-indicator',
  ],
};

const partialSelectorsSchema = z.object({
  chatInput: z.array(z.string().min(1)).optional(),
  sendButton: z.array(z.string().min(1)).optional(),
  stopButton: z.array(z.string().min(1)).optional(),
  newChatButton: z.array(z.string().min(1)).optional(),
  fileInput: z.array(z.string().min(1)).optional(),
  attachButton: z.array(z.string().min(1)).optional(),
  assistantMessage: z.array(z.string().min(1)).optional(),
  busyIndicator: z.array(z.string().min(1)).optional(),
});

export function loadSelectors(configPath?: string): {
  selectors: SelectorConfig;
  loadedFromFile: string | null;
} {
  if (!configPath) {
    return { selectors: { ...DEFAULT_SELECTORS }, loadedFromFile: null };
  }

  const resolvedPath = path.resolve(configPath);
  if (!fs.existsSync(resolvedPath)) {
    return { selectors: { ...DEFAULT_SELECTORS }, loadedFromFile: null };
  }

  const rawContent = fs.readFileSync(resolvedPath, 'utf-8');
  const parsedJson = JSON.parse(rawContent) as unknown;
  const overrides = partialSelectorsSchema.parse(parsedJson);

  return {
    selectors: {
      chatInput: overrides.chatInput ?? DEFAULT_SELECTORS.chatInput,
      sendButton: overrides.sendButton ?? DEFAULT_SELECTORS.sendButton,
      stopButton: overrides.stopButton ?? DEFAULT_SELECTORS.stopButton,
      newChatButton: overrides.newChatButton ?? DEFAULT_SELECTORS.newChatButton,
      fileInput: overrides.fileInput ?? DEFAULT_SELECTORS.fileInput,
      attachButton: overrides.attachButton ?? DEFAULT_SELECTORS.attachButton,
      assistantMessage:
        overrides.assistantMessage ?? DEFAULT_SELECTORS.assistantMessage,
      busyIndicator: overrides.busyIndicator ?? DEFAULT_SELECTORS.busyIndicator,
    },
    loadedFromFile: resolvedPath,
  };
}
