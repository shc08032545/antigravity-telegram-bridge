import { AntigravityBridge } from './cdp/bridge.js';
import { loadConfig } from './config.js';
import { loadSelectors } from './selectors.js';
import { createTelegramBot } from './telegram/bot.js';
import { Logger } from './utils/logger.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = new Logger(config.logLevel, [config.telegramBotToken]);

  const { selectors, loadedFromFile } = loadSelectors(
    config.selectorsConfigPath,
  );
  if (loadedFromFile) {
    logger.info(`Loaded custom DOM selectors from ${loadedFromFile}`);
  } else {
    logger.info('Using built-in default DOM selectors');
  }

  if (
    !config.allowAllUsers &&
    config.allowedUserIds.size === 0 &&
    config.allowedChatIds.size === 0
  ) {
    logger.warn(
      'Security notice: ALLOWED_USER_IDS and ALLOWED_CHAT_IDS are both empty. All commands except /whoami will be blocked until you add your Telegram ID to .env.',
    );
  }

  const bridge = new AntigravityBridge(config, selectors, logger);

  // Attempt eager connection to Chrome CDP, but don't crash if Chrome isn't open yet
  try {
    await bridge.connect();
  } catch (err) {
    logger.warn(
      `Chrome CDP is not ready yet at ${config.chromeCdpUrl}. Start Chrome with --remote-debugging-port=9222; the bot will reconnect automatically.`,
      err instanceof Error ? err.message : err,
    );
  }

  const bot = createTelegramBot(config, bridge, logger);

  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`Received ${signal}, shutting down gracefully...`);
    bot.stop();
    await bridge.disconnect();
    process.exit(0);
  };

  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));

  await bot.api
    .setMyCommands([
      { command: 'status', description: 'ดูสถานะการเชื่อมต่อ Chrome CDP' },
      { command: 'tabs', description: 'แสดงรายการแท็บใน Chrome' },
      { command: 'tab', description: 'สลับแท็บที่เชื่อมต่อ (/tab <เลข>)' },
      { command: 'new', description: 'เริ่มบทสนทนาใหม่' },
      { command: 'stop', description: 'หยุดการสร้างคำตอบ' },
      { command: 'screenshot', description: 'ถ่ายภาพหน้าจอแท็บปัจจุบัน' },
      { command: 'inspect', description: 'ตรวจสอบ DOM selectors ของหน้าเว็บ' },
      { command: 'ping', description: 'ทดสอบการตอบสนอง' },
      { command: 'whoami', description: 'ดู Telegram User ID / Chat ID' },
      { command: 'help', description: 'แสดงคู่มือคำสั่ง' },
    ])
    .catch((err) => logger.warn('Failed to register bot commands', err));

  logger.info('Starting Telegram bot polling...');
  await bot.start({
    onStart: (botInfo) => {
      logger.info(`Bot @${botInfo.username} is online and listening!`);
    },
  });
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
