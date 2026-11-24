import fs from 'node:fs/promises';
import path from 'node:path';
import { Api } from 'grammy';
import { isAuthorized, loadConfig } from '../config.js';
import { escapeHtml } from '../telegram/formatter.js';
import { buildMainMenu, buildSubMenu, resolveActionPrompt } from './menu.js';

const OFFSET_FILE = path.resolve('.relay-offset');
const UPLOADS_DIR = path.resolve('.relay-uploads');

function sanitizeFileName(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'attachment.bin';
}

async function readOffset(): Promise<number> {
  try {
    const raw = (await fs.readFile(OFFSET_FILE, 'utf-8')).trim();
    const num = Number(raw);
    return Number.isSafeInteger(num) && num > 0 ? num : 0;
  } catch {
    return 0;
  }
}

async function writeOffset(offset: number): Promise<void> {
  await fs.writeFile(OFFSET_FILE, `${offset}\n`, 'utf-8');
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
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Download failed with HTTP ${res.status}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength > maxBytes) {
    throw new Error(`File exceeds limit (${maxBytes} bytes)`);
  }

  const target = path.join(
    UPLOADS_DIR,
    `${Date.now()}_${sanitizeFileName(originalName)}`,
  );
  await fs.writeFile(target, buf);
  return target;
}

async function main(): Promise<void> {
  const config = loadConfig();
  const api = new Api(config.telegramBotToken);
  let offset = await readOffset();

  await api.deleteWebhook({ drop_pending_updates: false }).catch(() => undefined);

  await api
    .setMyCommands([
      { command: 'menu', description: '🏠 เปิดเมนูหลักเลือกใช้งาน Project' },
      { command: 'status', description: '🟢 เช็กสถานะ Antigravity Relay' },
      { command: 'ping', description: '🏓 ทดสอบการตอบสนอง' },
      { command: 'whoami', description: '🪪 ดู Telegram User ID / Chat ID' },
      { command: 'stop_relay', description: '🛑 หยุดโหมด Telegram Relay' },
      { command: 'help', description: '❓ วิธีใช้งาน' },
    ])
    .catch(() => undefined);

  const maxBytes = config.maxFileSizeMb * 1024 * 1024;

  while (true) {
    let updates;
    try {
      updates = await api.getUpdates({
        offset: offset > 0 ? offset : undefined,
        timeout: 25,
        allowed_updates: ['message', 'callback_query'],
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[relay:wait] getUpdates error: ${msg}`);
      await new Promise((r) => setTimeout(r, 3000));
      continue;
    }

    for (const update of updates) {
      offset = update.update_id + 1;
      await writeOffset(offset);

      // Handle interactive Inline Keyboard button presses
      if (update.callback_query) {
        const cb = update.callback_query;
        const userId = cb.from.id;
        const chatId = cb.message?.chat.id ?? userId;
        const username = cb.from.username ?? '';
        const data = cb.data ?? '';

        if (!isAuthorized(config, userId, chatId)) {
          await api
            .answerCallbackQuery(cb.id, {
              text: '⛔ คุณไม่มีสิทธิ์ใช้งานเมนูนี้',
              show_alert: true,
            })
            .catch(() => undefined);
          continue;
        }

        // Navigate between Main Menu & Project Sub-menus directly (instant, ~0.3s)
        if (data.startsWith('menu:')) {
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

        // Action button pressed -> acknowledge & wake up Antigravity!
        const actionPrompt = resolveActionPrompt(data);
        if (actionPrompt) {
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
              chatId,
              userId,
              username,
              messageId: cb.message?.message_id ?? null,
              statusMessageId: ack?.message_id ?? null,
              text: actionPrompt,
              attachmentPath: null,
              attachmentError: null,
            }),
          );
          return;
        }

        await api.answerCallbackQuery(cb.id).catch(() => undefined);
        continue;
      }

      const msg = update.message;
      if (!msg) continue;

      const userId = msg.from?.id;
      const chatId = msg.chat.id;
      const username = msg.from?.username ?? '';
      const rawText = (msg.text ?? msg.caption ?? '').trim();

      if (rawText === '/whoami') {
        const authorized = isAuthorized(config, userId, chatId);
        await api
          .sendMessage(
            chatId,
            [
              '🪪 <b>Telegram Identity</b>',
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

      if (rawText === '/menu' || rawText === '/start') {
        const menu = buildMainMenu();
        await api
          .sendMessage(chatId, menu.text, {
            parse_mode: 'HTML',
            reply_markup: menu.reply_markup,
          })
          .catch(() => undefined);
        continue;
      }

      if (rawText === '/ping') {
        await api
          .sendMessage(chatId, '🏓 Pong! Antigravity Relay พร้อมรับคำสั่งครับ')
          .catch(() => undefined);
        continue;
      }

      if (rawText === '/status') {
        await api
          .sendMessage(
            chatId,
            '🟢 <b>Antigravity Direct Relay</b> ออนไลน์และพร้อมรับคำสั่งอยู่ครับ\nพิมพ์ <code>/menu</code> เพื่อเปิดเมนูเลือกโปรเจกต์ หรือพิมพ์งานที่ต้องการให้ทำได้เลย',
            { parse_mode: 'HTML' },
          )
          .catch(() => undefined);
        continue;
      }

      if (rawText === '/help') {
        await api
          .sendMessage(
            chatId,
            [
              '🤖 <b>Antigravity Direct Telegram Relay</b>',
              '',
              'ส่งข้อความคำสั่ง รูปภาพ หรือไฟล์แนบมาได้เลย ผมจะดำเนินการให้บนแชท Antigravity โดยตรงแล้วส่งคำตอบกลับมาให้ครับ',
              '',
              '<b>คำสั่ง:</b>',
              '/menu — 🏠 เปิดเมนูหลักเลือกใช้งาน Project',
              '/status — เช็กสถานะการเชื่อมต่อ',
              '/ping — ทดสอบการตอบสนอง',
              '/whoami — ดู User ID / Chat ID',
              '/stop_relay — หยุดรับคำสั่งจาก Telegram ชั่วคราว',
            ].join('\n'),
            { parse_mode: 'HTML' },
          )
          .catch(() => undefined);
        continue;
      }

      if (rawText === '/stop_relay' || rawText === '/stop-relay') {
        await api
          .sendMessage(chatId, '🛑 หยุดโหมด Antigravity Direct Relay แล้วครับ')
          .catch(() => undefined);
        console.log(
          JSON.stringify({
            type: 'stop_relay',
            chatId,
            userId,
            username,
          }),
        );
        return;
      }

      let attachmentPath: string | null = null;
      let attachmentError: string | null = null;

      if (msg.photo && msg.photo.length > 0) {
        const largest = msg.photo[msg.photo.length - 1];
        if (largest) {
          try {
            attachmentPath = await downloadTelegramFile(
              api,
              config.telegramBotToken,
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
            config.telegramBotToken,
            msg.document.file_id,
            msg.document.file_name ?? `file_${Date.now()}.bin`,
            maxBytes,
          );
        } catch (err) {
          attachmentError = err instanceof Error ? err.message : String(err);
        }
      }

      if (!rawText && !attachmentPath && !attachmentError) {
        continue;
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
          chatId,
          userId,
          username,
          messageId: msg.message_id,
          statusMessageId: ack?.message_id ?? null,
          text: rawText,
          attachmentPath,
          attachmentError,
        }),
      );
      return;
    }
  }
}

main().catch((err) => {
  console.error('[relay:wait] Fatal error:', err);
  process.exit(1);
});
