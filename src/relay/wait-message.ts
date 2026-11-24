import fs from 'node:fs/promises';
import path from 'node:path';
import { Api } from 'grammy';
import { isAuthorized, loadConfig } from '../config.js';
import { escapeHtml } from '../telegram/formatter.js';

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

  // Make sure webhook is cleared so getUpdates works reliably
  await api.deleteWebhook({ drop_pending_updates: false }).catch(() => undefined);

  // Register concise relay commands menu (best-effort)
  await api
    .setMyCommands([
      { command: 'status', description: 'เช็กสถานะ Antigravity Relay' },
      { command: 'ping', description: 'ทดสอบการตอบสนอง' },
      { command: 'whoami', description: 'ดู Telegram User ID / Chat ID' },
      { command: 'stop_relay', description: 'หยุดโหมด Telegram Relay' },
      { command: 'help', description: 'วิธีใช้งาน' },
    ])
    .catch(() => undefined);

  const maxBytes = config.maxFileSizeMb * 1024 * 1024;

  // Long-poll until an actionable authorized message arrives
  while (true) {
    let updates;
    try {
      updates = await api.getUpdates({
        offset: offset > 0 ? offset : undefined,
        timeout: 25,
        allowed_updates: ['message'],
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
            '🟢 <b>Antigravity Direct Relay</b> ออนไลน์และพร้อมรับคำสั่งอยู่ครับ\nพิมพ์งานที่ต้องการให้ทำหรือแนบรูป/ไฟล์ส่งมาได้เลย',
            { parse_mode: 'HTML' },
          )
          .catch(() => undefined);
        continue;
      }

      if (rawText === '/start' || rawText === '/help') {
        await api
          .sendMessage(
            chatId,
            [
              '🤖 <b>Antigravity Direct Telegram Relay</b>',
              '',
              'ส่งข้อความคำสั่ง รูปภาพ หรือไฟล์แนบมาได้เลย ผมจะดำเนินการให้บนแชท Antigravity โดยตรงแล้วส่งคำตอบกลับมาให้ครับ',
              '',
              '<b>คำสั่ง:</b>',
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

      // Download photo or document if present
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

      const payload = {
        type: 'message',
        chatId,
        userId,
        username,
        messageId: msg.message_id,
        statusMessageId: ack?.message_id ?? null,
        text: rawText,
        attachmentPath,
        attachmentError,
      };

      console.log(JSON.stringify(payload));
      return;
    }
  }
}

main().catch((err) => {
  console.error('[relay:wait] Fatal error:', err);
  process.exit(1);
});
