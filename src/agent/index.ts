import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { loadConfig } from '../config.js';
import { Logger } from '../utils/logger.js';
import { syncTelegramMenuCommands } from '../relay/menu.js';
import { loadModelState } from '../relay/modelState.js';
import { createAlwaysOnlineAgentBot } from './bot.js';

function resolveGoogleApiKey(): string {
  const direct = process.env.GOOGLE_API_KEY?.trim() || process.env.GEMINI_API_KEY?.trim();
  if (direct) return direct;

  // Fallback: read from /home/antigravity/TradingAgents/.env if present
  const taEnvPath = path.resolve('/home/antigravity/TradingAgents/.env');
  if (fs.existsSync(taEnvPath)) {
    const parsed = dotenv.parse(fs.readFileSync(taEnvPath, 'utf-8'));
    if (parsed.GOOGLE_API_KEY?.trim()) {
      return parsed.GOOGLE_API_KEY.trim();
    }
  }

  throw new Error(
    'GOOGLE_API_KEY (or GEMINI_API_KEY) is required to run always-online agent mode.',
  );
}

async function main(): Promise<void> {
  const config = loadConfig();
  const googleApiKey = resolveGoogleApiKey();
  const model = process.env.GEMINI_MODEL?.trim() || loadModelState().geminiModel;
  const logger = new Logger(config.logLevel, [
    config.telegramBotToken,
    googleApiKey,
  ]);

  const bot = createAlwaysOnlineAgentBot(config, googleApiKey, logger, model);

  // Prevent transient errors from killing the always-on daemon
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection (kept alive)', reason);
  });
  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception (kept alive)', err);
  });

  const shutdown = (signal: string): void => {
    logger.info(`Received ${signal}, stopping always-online Telegram agent...`);
    bot.stop();
    process.exit(0);
  };
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));

  await syncTelegramMenuCommands(bot.api, [
    ...config.allowedUserIds,
    ...config.allowedChatIds,
  ]).catch((err) => logger.warn('Failed to sync bot menu commands', err));

  // Clear webhook & start resilient long-polling loop
  await bot.api
    .deleteWebhook({ drop_pending_updates: false })
    .catch(() => undefined);

  logger.info(`Starting always-online Telegram Agent with model ${model}...`);
  await bot.start({
    allowed_updates: ['message', 'callback_query'],
    onStart: (botInfo) => {
      logger.info(
        `Always-online agent @${botInfo.username} is ONLINE and waiting for messages!`,
      );
    },
  });
}

main().catch((err) => {
  console.error('Fatal agent startup error:', err);
  process.exit(1);
});
