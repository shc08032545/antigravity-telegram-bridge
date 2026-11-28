import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { Api } from 'grammy';
import { getBotIdFromToken, isAuthorized, loadConfig, type AppConfig } from '../config.js';
import { escapeHtml } from '../telegram/formatter.js';
import {
  buildMainMenu,
  buildModelMenu,
  buildSubMenu,
  resolveActionPrompt,
  syncTelegramMenuCommands,
} from './menu.js';
import {
  loadModelState,
  saveModelState,
  type GeminiApiModel,
  type RelayModelTier,
} from './modelState.js';

const execFileAsync = promisify(execFile);
const PRIMARY_OFFSET_FILE = path.resolve('.relay-offset');
const UPLOADS_DIR = path.resolve('.relay-uploads');

function offsetFileForBot(botId: string, isPrimary: boolean): string {
  return isPrimary ? PRIMARY_OFFSET_FILE : path.resolve(`.relay-offset-${botId}`);
}

function sanitizeFileName(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'attachment.bin';
}

async function readOffset(offsetFile: string): Promise<number> {
  try {
    const raw = (await fs.readFile(offsetFile, 'utf-8')).trim();
    const num = Number(raw);
    return Number.isSafeInteger(num) && num > 0 ? num : 0;
  } catch {
    return 0;
  }
}

async function writeOffset(offsetFile: string, offset: number): Promise<void> {
  await fs.writeFile(offsetFile, `${offset}\n`, 'utf-8');
}

async function downloadTelegramFile(
  api: Api,
  botToken: string,
  fileId: string,
  originalName: string,
  maxBytes: number,
): Promise<string> {
  await fs.mkdir(UPLOADS_DIR, { recursive: true });
  const file = await api.getFile(fileId);
  if (!file.file_path) {
    throw new Error('Telegram API did not return file_path');
  }

  const url = `https://api.telegram.org/file/bot${botToken}/${file.file_path}`;
  const target = path.join(
    UPLOADS_DIR,
    `${Date.now()}_${sanitizeFileName(originalName)}`,
  );

  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
      if (!res.ok) {
        throw new Error(`Download failed with HTTP ${res.status}`);
      }
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.byteLength > maxBytes) {
        throw new Error(`File exceeds limit (${maxBytes} bytes)`);
      }
      await fs.writeFile(target, buf);
      return target;
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 700 * (attempt + 1)));
    }
  }

  // Fallback to curl -4 (forces IPv4 and handles transient Node undici issues)
  try {
    await execFileAsync('curl', ['-4', '-fsSL', '--max-time', '25', '-o', target, url]);
    const stat = await fs.stat(target);
    if (stat.size > maxBytes) {
      await fs.unlink(target).catch(() => undefined);
      throw new Error(`File exceeds limit (${maxBytes} bytes)`);
    }
    return target;
  } catch (curlErr) {
    const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
    const curlMsg = curlErr instanceof Error ? curlErr.message : String(curlErr);
    throw new Error(`${msg} (curl fallback failed: ${curlMsg})`);
  }
}

async function pollBot(
  config: AppConfig,
  botToken: string,
  isPrimary: boolean,
  controller: AbortController,
  tryClaim: () => boolean,
): Promise<void> {
  const botId = getBotIdFromToken(botToken);
  const offsetFile = offsetFileForBot(botId, isPrimary);
  const api = new Api(botToken);
  let offset = await readOffset(offsetFile);

  await api.deleteWebhook({ drop_pending_updates: false }).catch(() => undefined);
  const me = await api.getMe().catch(() => null);
  const botUsername = me?.username ?? botId;

  await syncTelegramMenuCommands(api, [
    ...config.allowedUserIds,
    ...config.allowedChatIds,
  ]).catch(() => undefined);

  const maxBytes = config.maxFileSizeMb * 1024 * 1024;

  while (!controller.signal.aborted) {
    let updates;
    try {
      updates = await api.getUpdates(
        {
          offset: offset > 0 ? offset : undefined,
          timeout: 20,
          allowed_updates: ['message', 'callback_query'],
        },
        controller.signal as Parameters<Api['getUpdates']>[1],
      );
    } catch (err) {
      if (controller.signal.aborted) {
        return;
      }
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[relay:wait:${botUsername}] getUpdates error: ${msg}`);
      await new Promise((r) => setTimeout(r, 3000));
      continue;
    }

    for (const update of updates) {
      if (controller.signal.aborted) {
        return;
      }
      const nextOffset = update.update_id + 1;
      const commitOffset = async () => {
        offset = nextOffset;
        await writeOffset(offsetFile, offset);
      };

      // Handle interactive Inline Keyboard button presses
      if (update.callback_query) {
        const cb = update.callback_query;
        const userId = cb.from.id;
        const chatId = cb.message?.chat.id ?? userId;
        const username = cb.from.username ?? '';
        const data = cb.data ?? '';

        if (!isAuthorized(config, userId, chatId)) {
          await commitOffset();
          await api
            .answerCallbackQuery(cb.id, {
              text: '⛔ คุณไม่มีสิทธิ์ใช้งานเมนูนี้',
              show_alert: true,
            })
            .catch(() => undefined);
          continue;
        }

        if (data.startsWith('menu:')) {
          await commitOffset();
          const section = data.slice('menu:'.length);
          const screen = buildSubMenu(section);
          await api.answerCallbackQuery(cb.id).catch(() => undefined);

          if (screen && cb.message && 'message_id' in cb.message) {
            await api
              .editMessageText(chatId, cb.message.message_id, screen.text, {
                parse_mode: 'HTML',
                reply_markup: screen.reply_markup,
              })
              .catch(() =>
                api.sendMessage(chatId, screen.text, {
                  parse_mode: 'HTML',
                  reply_markup: screen.reply_markup,
                }),
              );
          }
          continue;
        }

        if (data.startsWith('model:relay:')) {
          await commitOffset();
          const tier = data.slice('model:relay:'.length) as RelayModelTier;
          const updated = saveModelState({ relayTier: tier });
          const screen = buildModelMenu(updated);
          await api
            .answerCallbackQuery(cb.id, {
              text: `เปลี่ยน Antigravity Tier เป็น ${tier} แล้ว ✅`,
            })
            .catch(() => undefined);
          if (cb.message && 'message_id' in cb.message) {
            await api
              .editMessageText(chatId, cb.message.message_id, screen.text, {
                parse_mode: 'HTML',
                reply_markup: screen.reply_markup,
              })
              .catch(() => undefined);
          }
          continue;
        }

        if (data.startsWith('model:gemini:')) {
          await commitOffset();
          const geminiModel = data.slice('model:gemini:'.length) as GeminiApiModel;
          const updated = saveModelState({ geminiModel });
          const screen = buildModelMenu(updated);
          await api
            .answerCallbackQuery(cb.id, {
              text: `เปลี่ยน Gemini Model เป็น ${geminiModel} แล้ว ✅`,
            })
            .catch(() => undefined);
          if (cb.message && 'message_id' in cb.message) {
            await api
              .editMessageText(chatId, cb.message.message_id, screen.text, {
                parse_mode: 'HTML',
                reply_markup: screen.reply_markup,
              })
              .catch(() => undefined);
          }
          continue;
        }

        if (data === 'sys:status') {
          await commitOffset();
          const state = loadModelState();
          await api.answerCallbackQuery(cb.id).catch(() => undefined);
          await api
            .sendMessage(
              chatId,
              `🟢 <b>สถานะระบบ: Antigravity Direct Relay Only (@${escapeHtml(botUsername)})</b>\n• บอตที่เชื่อมต่ออยู่: <b>${config.telegramBotTokens.length} ตัว</b>\n• Antigravity Tier: <code>${state.relayTier}</code>\n• Gemini API Model: <code>${state.geminiModel}</code>\n• โหมดรอรับข้อความ: <b>Direct Relay (Auto-Stop เมื่อเงียบครบ 20 นาที)</b>`,
              { parse_mode: 'HTML' },
            )
            .catch(() => undefined);
          continue;
        }

        if (data === 'sys:ping') {
          await commitOffset();
          await api.answerCallbackQuery(cb.id, { text: '🏓 Pong!' }).catch(() => undefined);
          await api
            .sendMessage(chatId, `🏓 Pong! Antigravity Direct Relay (@${botUsername}) พร้อมรับคำสั่งครับ`)
            .catch(() => undefined);
          continue;
        }

        if (data === 'sys:standby') {
          if (!tryClaim()) return;
          await commitOffset();
          await api
            .answerCallbackQuery(cb.id, { text: 'กำลังสลับเป็น Always-Online Standby...' })
            .catch(() => undefined);
          console.log(
            JSON.stringify({
              type: 'switch_standby',
              botId,
              botUsername,
              chatId,
              userId,
              username,
            }),
          );
          return;
        }

        const actionPrompt = resolveActionPrompt(data);
        if (actionPrompt) {
          if (!tryClaim()) return;
          await commitOffset();
          await api
            .answerCallbackQuery(cb.id, { text: 'รับคำสั่งแล้ว กำลังดำเนินการ...' })
            .catch(() => undefined);
          await api.sendChatAction(chatId, 'typing').catch(() => undefined);

          const ack = await api
            .sendMessage(
              chatId,
              `⏳ <b>รับคำสั่งจากเมนูแล้ว:</b> ${escapeHtml(actionPrompt)}\nกำลังให้ Antigravity ดำเนินการ...`,
              { parse_mode: 'HTML' },
            )
            .catch(() => null);

          console.log(
            JSON.stringify({
              type: 'message',
              source: 'menu_button',
              callbackData: data,
              botId,
              botUsername,
              chatId,
              userId,
              username,
              messageId: cb.message?.message_id ?? null,
              statusMessageId: ack?.message_id ?? null,
              text: actionPrompt,
              selectedModel: loadModelState(),
              attachmentPath: null,
              attachmentError: null,
            }),
          );
          return;
        }

        await commitOffset();
        await api.answerCallbackQuery(cb.id).catch(() => undefined);
        continue;
      }

      const msg = update.message;
      if (!msg) {
        await commitOffset();
        continue;
      }

      const userId = msg.from?.id;
      const chatId = msg.chat.id;
      const username = msg.from?.username ?? '';
      const rawText = (msg.text ?? msg.caption ?? '').trim();

      if (rawText === '/whoami') {
        await commitOffset();
        const authorized = isAuthorized(config, userId, chatId);
        await api
          .sendMessage(
            chatId,
            [
              '🪪 <b>Telegram Identity</b>',
              `• Bot: <code>@${escapeHtml(botUsername)}</code> (<code>${botId}</code>)`,
              `• User ID: <code>${userId ?? 'unknown'}</code>`,
              `• Chat ID: <code>${chatId}</code>`,
              `• Authorized: <b>${authorized ? 'Yes ✅' : 'No ❌'}</b>`,
            ].join('\n'),
            { parse_mode: 'HTML' },
          )
          .catch(() => undefined);
        continue;
      }

      if (!isAuthorized(config, userId, chatId)) {
        await commitOffset();
        if (msg.chat.type === 'private') {
          await api
            .sendMessage(
              chatId,
              '⛔ คุณยังไม่มีสิทธิ์ใช้งานบอตนี้ (ส่ง /whoami เพื่อดู User ID)',
            )
            .catch(() => undefined);
        }
        continue;
      }

      // Instant sub-menu shortcuts from the Telegram Menu (/) button
      const menuShortcutMap: Record<string, string> = {
        '/menu': 'main',
        '/start': 'main',
        '/model': 'model',
        '/quota': 'quota',
        '/affiliate': 'affiliate',
        '/news': 'news',
        '/shortfilm': 'shortfilm',
        '/hyperframes': 'hyperframes',
        '/projects': 'projects',
      };

      const shortcutSection = menuShortcutMap[rawText];
      if (shortcutSection) {
        await commitOffset();
        const screen = buildSubMenu(shortcutSection) ?? buildMainMenu();
        await api
          .sendMessage(chatId, screen.text, {
            parse_mode: 'HTML',
            reply_markup: screen.reply_markup,
          })
          .catch(() => undefined);
        continue;
      }

      if (rawText === '/analyze') {
        await commitOffset();
        const screen = buildSubMenu('trading') ?? buildMainMenu();
        await api
          .sendMessage(chatId, screen.text, {
            parse_mode: 'HTML',
            reply_markup: screen.reply_markup,
          })
          .catch(() => undefined);
        continue;
      }

      if (rawText.startsWith('/analyze ')) {
        if (!tryClaim()) return;
        await commitOffset();
        const ticker = rawText.slice('/analyze '.length).trim().toUpperCase();
        const prompt = `ใช้ TradingAgents วิเคราะห์หุ้น ${ticker} (ข้อมูลล่าสุด ภาษาไทย พร้อมแนบไฟล์ complete_report.html)`;
        await api.sendChatAction(chatId, 'typing').catch(() => undefined);
        const ack = await api
          .sendMessage(
            chatId,
            `⏳ กำลังส่งคำสั่ง <b>TradingAgents</b> วิเคราะห์ <code>${escapeHtml(ticker)}</code>...`,
            { parse_mode: 'HTML' },
          )
          .catch(() => null);
        console.log(
          JSON.stringify({
            type: 'message',
            botId,
            botUsername,
            chatId,
            userId,
            username,
            messageId: msg.message_id,
            statusMessageId: ack?.message_id ?? null,
            text: prompt,
            attachmentPath: null,
            attachmentError: null,
          }),
        );
        return;
      }

      if (rawText === '/drive') {
        await commitOffset();
        const screen = buildSubMenu('gdrive') ?? buildMainMenu();
        await api
          .sendMessage(chatId, screen.text, {
            parse_mode: 'HTML',
            reply_markup: screen.reply_markup,
          })
          .catch(() => undefined);
        continue;
      }

      if (rawText === '/ping') {
        await commitOffset();
        await api
          .sendMessage(chatId, `🏓 Pong! Antigravity Direct Relay (@${botUsername}) พร้อมรับคำสั่งครับ`)
          .catch(() => undefined);
        continue;
      }

      if (rawText === '/status' || rawText === '/mode') {
        await commitOffset();
        await api
          .sendMessage(
            chatId,
            `🟢 <b>Antigravity Direct Relay Only (@${escapeHtml(botUsername)})</b>\n• บอตที่เชื่อมต่ออยู่: <b>${config.telegramBotTokens.length} ตัว</b>\n• สมอง AI: Antigravity ในแชทนี้โดยตรง\n• พิมพ์ <code>/menu</code> เพื่อเปิดเมนูหลัก หรือส่งคำสั่งมาได้เลย`,
            { parse_mode: 'HTML' },
          )
          .catch(() => undefined);
        continue;
      }

      if (rawText === '/new') {
        await commitOffset();
        await api
          .sendMessage(
            chatId,
            '✨ พร้อมรับหัวข้อใหม่แล้วครับ! พิมพ์ <code>/menu</code> เพื่อเลือกโปรเจกต์ หรือส่งคำสั่งใหม่มาได้เลย',
            { parse_mode: 'HTML' },
          )
          .catch(() => undefined);
        continue;
      }

      if (rawText === '/help') {
        await commitOffset();
        const menu = buildMainMenu();
        await api
          .sendMessage(chatId, menu.text, {
            parse_mode: 'HTML',
            reply_markup: menu.reply_markup,
          })
          .catch(() => undefined);
        continue;
      }

      if (rawText === '/stop_relay' || rawText === '/stop-relay') {
        if (!tryClaim()) return;
        await commitOffset();
        console.log(
          JSON.stringify({
            type: 'switch_standby',
            botId,
            botUsername,
            chatId,
            userId,
            username,
          }),
        );
        return;
      }

      const hasAttachment = Boolean((msg.photo && msg.photo.length > 0) || msg.document);
      if (!rawText && !hasAttachment) {
        await commitOffset();
        continue;
      }

      if (!tryClaim()) return;
      await commitOffset();

      let attachmentPath: string | null = null;
      let attachmentError: string | null = null;

      if (msg.photo && msg.photo.length > 0) {
        const largest = msg.photo[msg.photo.length - 1];
        if (largest) {
          try {
            attachmentPath = await downloadTelegramFile(
              api,
              botToken,
              largest.file_id,
              `photo_${Date.now()}.jpg`,
              maxBytes,
            );
          } catch (err) {
            attachmentError = err instanceof Error ? err.message : String(err);
          }
        }
      } else if (msg.document) {
        try {
          attachmentPath = await downloadTelegramFile(
            api,
            botToken,
            msg.document.file_id,
            msg.document.file_name ?? `file_${Date.now()}.bin`,
            maxBytes,
          );
        } catch (err) {
          attachmentError = err instanceof Error ? err.message : String(err);
        }
      }

      await api.sendChatAction(chatId, 'typing').catch(() => undefined);
      const ack = await api
        .sendMessage(
          chatId,
          attachmentPath
            ? `⏳ รับคำสั่งพร้อมไฟล์ <code>${escapeHtml(path.basename(attachmentPath))}</code> แล้ว กำลังให้ Antigravity ดำเนินการ...`
            : '⏳ รับคำสั่งแล้ว กำลังให้ Antigravity ดำเนินการ...',
          { parse_mode: 'HTML' },
        )
        .catch(() => null);

      console.log(
        JSON.stringify({
          type: 'message',
          botId,
          botUsername,
          chatId,
          userId,
          username,
          messageId: msg.message_id,
          statusMessageId: ack?.message_id ?? null,
          text: rawText,
          selectedModel: loadModelState(),
          attachmentPath,
          attachmentError,
        }),
      );
      return;
    }
  }
}

function parseBotFilter(argv: string[]): Set<string> | null {
  const bots = new Set<string>();
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--bot' && argv[i + 1]) {
      for (const part of argv[i + 1].split(/[\s,]+/)) {
        const trimmed = part.trim();
        if (trimmed) bots.add(trimmed);
      }
      i += 1;
    }
  }
  return bots.size > 0 ? bots : null;
}

async function main(): Promise<void> {
  const config = loadConfig();
  const botFilter = parseBotFilter(process.argv.slice(2));
  const selectedTokens = botFilter
    ? config.telegramBotTokens.filter((token) => botFilter.has(getBotIdFromToken(token)))
    : config.telegramBotTokens;

  if (selectedTokens.length === 0) {
    throw new Error(`No configured Telegram bot matched --bot filter: ${[...(botFilter ?? [])].join(',')}`);
  }

  const controller = new AbortController();
  let claimed = false;

  const tryClaim = (): boolean => {
    if (claimed) return false;
    claimed = true;
    controller.abort();
    return true;
  };

  const primaryBotId = getBotIdFromToken(config.telegramBotToken);
  await Promise.all(
    selectedTokens.map((token) =>
      pollBot(config, token, getBotIdFromToken(token) === primaryBotId, controller, tryClaim),
    ),
  );
}

main().catch((err) => {
  console.error('[relay:wait] Fatal error:', err);
  process.exit(1);
});
