import os from 'node:os';
import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';
import type { LogLevel } from './utils/logger.js';

export interface AppConfig {
  telegramBotToken: string;
  telegramBotTokens: string[];
  allowedUserIds: Set<number>;
  allowedChatIds: Set<number>;
  allowAllUsers: boolean;
  chromeCdpUrl: string;
  antigravityUrlMatch: string;
  responseTimeoutMs: number;
  responseStableMs: number;
  pollIntervalMs: number;
  streamUpdates: boolean;
  streamEditIntervalMs: number;
  selectorsConfigPath: string;
  uploadTempDir: string;
  maxFileSizeMb: number;
  logLevel: LogLevel;
}

function parseTokenList(primary: string, extraRaw: string | undefined): string[] {
  const seen = new Set<string>();
  const tokens: string[] = [];
  const add = (raw: string) => {
    const trimmed = raw.trim();
    if (trimmed.length >= 10 && !seen.has(trimmed)) {
      seen.add(trimmed);
      tokens.push(trimmed);
    }
  };
  add(primary);
  if (extraRaw) {
    for (const part of extraRaw.split(/[\s,]+/)) {
      add(part);
    }
  }
  return tokens;
}

export function getBotIdFromToken(token: string): string {
  const idx = token.indexOf(':');
  return idx > 0 ? token.slice(0, idx).trim() : 'default';
}

export function resolveBotToken(
  config: Pick<AppConfig, 'telegramBotToken' | 'telegramBotTokens'>,
  botId?: string,
): string {
  if (!botId || !botId.trim()) {
    return config.telegramBotToken;
  }
  const target = botId.trim();
  for (const token of config.telegramBotTokens) {
    if (getBotIdFromToken(token) === target) {
      return token;
    }
  }
  throw new Error(`Unknown Telegram botId "${target}"`);
}

function parseIdList(raw: string | undefined): Set<number> {
  if (!raw || raw.trim() === '') {
    return new Set();
  }

  const ids = new Set<number>();
  for (const part of raw.split(',')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const parsed = Number(trimmed);
    if (!Number.isSafeInteger(parsed)) {
      throw new Error(`Invalid numeric Telegram ID in whitelist: "${trimmed}"`);
    }
    ids.add(parsed);
  }
  return ids;
}

function parseBoolean(raw: string | undefined, defaultValue: boolean): boolean {
  if (raw === undefined || raw.trim() === '') {
    return defaultValue;
  }
  const normalized = raw.trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  throw new Error(`Invalid boolean value: "${raw}"`);
}

const envSchema = z.object({
  TELEGRAM_BOT_TOKEN: z
    .string()
    .min(10, 'TELEGRAM_BOT_TOKEN is required (get one from @BotFather)'),
  TELEGRAM_EXTRA_BOT_TOKENS: z.string().optional(),
  ALLOWED_USER_IDS: z.string().optional(),
  ALLOWED_CHAT_IDS: z.string().optional(),
  ALLOW_ALL_USERS: z.string().optional(),
  CHROME_CDP_URL: z
    .string()
    .url('CHROME_CDP_URL must be a valid HTTP/WS URL')
    .default('http://127.0.0.1:9222'),
  ANTIGRAVITY_URL_MATCH: z.string().default('antigravity'),
  RESPONSE_TIMEOUT_MS: z.coerce.number().int().min(5000).default(300000),
  RESPONSE_STABLE_MS: z.coerce.number().int().min(500).default(2500),
  POLL_INTERVAL_MS: z.coerce.number().int().min(200).default(800),
  STREAM_UPDATES: z.string().optional(),
  STREAM_EDIT_INTERVAL_MS: z.coerce.number().int().min(1000).default(2500),
  SELECTORS_CONFIG_PATH: z.string().default('./selectors.json'),
  UPLOAD_TEMP_DIR: z
    .string()
    .default(path.join(os.tmpdir(), 'antigravity-telegram-bridge-uploads')),
  MAX_FILE_SIZE_MB: z.coerce.number().min(1).max(50).default(20),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export function parseConfig(env: NodeJS.ProcessEnv): AppConfig {
  const parsed = envSchema.parse(env);
  const primaryToken = parsed.TELEGRAM_BOT_TOKEN.trim();

  return {
    telegramBotToken: primaryToken,
    telegramBotTokens: parseTokenList(primaryToken, parsed.TELEGRAM_EXTRA_BOT_TOKENS),
    allowedUserIds: parseIdList(parsed.ALLOWED_USER_IDS),
    allowedChatIds: parseIdList(parsed.ALLOWED_CHAT_IDS),
    allowAllUsers: parseBoolean(parsed.ALLOW_ALL_USERS, false),
    chromeCdpUrl: parsed.CHROME_CDP_URL.trim(),
    antigravityUrlMatch: parsed.ANTIGRAVITY_URL_MATCH.trim(),
    responseTimeoutMs: parsed.RESPONSE_TIMEOUT_MS,
    responseStableMs: parsed.RESPONSE_STABLE_MS,
    pollIntervalMs: parsed.POLL_INTERVAL_MS,
    streamUpdates: parseBoolean(parsed.STREAM_UPDATES, true),
    streamEditIntervalMs: parsed.STREAM_EDIT_INTERVAL_MS,
    selectorsConfigPath: parsed.SELECTORS_CONFIG_PATH.trim(),
    uploadTempDir: parsed.UPLOAD_TEMP_DIR.trim(),
    maxFileSizeMb: parsed.MAX_FILE_SIZE_MB,
    logLevel: parsed.LOG_LEVEL,
  };
}

export function loadConfig(): AppConfig {
  dotenv.config();
  return parseConfig(process.env);
}

export function isAuthorized(
  config: Pick<AppConfig, 'allowAllUsers' | 'allowedUserIds' | 'allowedChatIds'>,
  userId?: number,
  chatId?: number,
): boolean {
  if (config.allowAllUsers) {
    return true;
  }

  // Fail closed when no whitelist is configured.
  if (config.allowedUserIds.size === 0 && config.allowedChatIds.size === 0) {
    return false;
  }

  if (userId !== undefined && config.allowedUserIds.has(userId)) {
    return true;
  }

  if (chatId !== undefined && config.allowedChatIds.has(chatId)) {
    return true;
  }

  return false;
}
