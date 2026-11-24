import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { isAuthorized, parseConfig } from '../src/config.js';
import { DEFAULT_SELECTORS, loadSelectors } from '../src/selectors.js';

describe('config & auth', () => {
  const baseEnv: NodeJS.ProcessEnv = {
    TELEGRAM_BOT_TOKEN: '123456789:ABCDEF_test_token_value',
  };

  it('fails closed when whitelist is empty and ALLOW_ALL_USERS is false', () => {
    const cfg = parseConfig(baseEnv);
    expect(cfg.allowAllUsers).toBe(false);
    expect(isAuthorized(cfg, 11111, 11111)).toBe(false);
  });

  it('authorizes matching user IDs and chat IDs', () => {
    const cfg = parseConfig({
      ...baseEnv,
      ALLOWED_USER_IDS: '1001, 1002',
      ALLOWED_CHAT_IDS: '-9001',
    });

    expect(isAuthorized(cfg, 1001, 555)).toBe(true);
    expect(isAuthorized(cfg, 9999, -9001)).toBe(true);
    expect(isAuthorized(cfg, 9999, 555)).toBe(false);
  });

  it('allows all users only when ALLOW_ALL_USERS=true', () => {
    const cfg = parseConfig({
      ...baseEnv,
      ALLOW_ALL_USERS: 'true',
    });

    expect(isAuthorized(cfg, 42, 42)).toBe(true);
  });

  it('rejects non-numeric IDs in whitelist', () => {
    expect(() =>
      parseConfig({
        ...baseEnv,
        ALLOWED_USER_IDS: '123,not-a-number',
      }),
    ).toThrow(/Invalid numeric Telegram ID/);
  });

  it('merges custom selector overrides from JSON file', () => {
    const tmpFile = path.join(os.tmpdir(), `selectors-test-${Date.now()}.json`);
    fs.writeFileSync(
      tmpFile,
      JSON.stringify({
        chatInput: ['#custom-antigravity-input'],
      }),
    );

    try {
      const { selectors, loadedFromFile } = loadSelectors(tmpFile);
      expect(loadedFromFile).toBe(path.resolve(tmpFile));
      expect(selectors.chatInput).toEqual(['#custom-antigravity-input']);
      expect(selectors.stopButton).toEqual(DEFAULT_SELECTORS.stopButton);
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });
});
