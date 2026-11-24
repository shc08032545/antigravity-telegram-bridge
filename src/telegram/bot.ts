import fs from 'node:fs/promises';
import path from 'node:path';
import { Bot, InputFile, type Context } from 'grammy';
import type { AntigravityBridge } from '../cdp/bridge.js';
import { isAuthorized, type AppConfig } from '../config.js';
import type { Logger } from '../utils/logger.js';
import {
  escapeHtml,
  markdownToTelegramHtml,
  splitMarkdownForTelegram,
  TELEGRAM_MAX_LENGTH,
} from './formatter.js';

function sanitizeFileName(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'attachment.bin';
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function createTelegramBot(
  config: AppConfig,
  bridge: AntigravityBridge,
  logger: Logger,
): Bot {
  const bot = new Bot(config.telegramBotToken);
  const startedAt = Date.now();

  // /whoami is always available so the owner can easily discover their ID for .env
  bot.command('whoami', async (ctx) => {
    const userId = ctx.from?.id;
    const chatId = ctx.chat?.id;
    const authorized = isAuthorized(config, userId, chatId);
    const lines = [
      '🪪 <b>Telegram Identity</b>',
      `• User ID: <code>${userId ?? 'unknown'}</code>`,
      `• Chat ID: <code>${chatId ?? 'unknown'}</code>`,
      `• Authorized: <b>${authorized ? 'Yes ✅' : 'No ❌'}</b>`,
    ];
    if (!authorized) {
      lines.push(
        '',
        'นำ User ID ด้านบนไปใส่ใน <code>ALLOWED_USER_IDS</code> ในไฟล์ <code>.env</code> แล้วรีสตาร์ตบอต',
      );
    }
    await ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });
  });

  // Security whitelist middleware (fail-closed by default)
  bot.use(async (ctx, next) => {
    const userId = ctx.from?.id;
    const chatId = ctx.chat?.id;

    if (!isAuthorized(config, userId, chatId)) {
      logger.warn('Blocked unauthorized Telegram access', {
        userId,
        chatId,
        username: ctx.from?.username,
      });

      if (ctx.chat?.type === 'private') {
        await ctx.reply(
          '⛔ คุณยังไม่มีสิทธิ์ใช้งานบอตนี้\nส่งคำสั่ง /whoami เพื่อดู User ID แล้วนำไปเพิ่มใน ALLOWED_USER_IDS ในไฟล์ .env',
        );
      }
      return;
    }

    await next();
  });

  const helpText = [
    '🤖 <b>Antigravity Web ↔ Telegram Bridge</b>',
    '',
    'ส่งข้อความ รูปภาพ หรือไฟล์แนบมาได้เลย บอตจะส่งต่อไปยังแท็บ Antigravity Web และดึงคำตอบกลับมาให้',
    '',
    '<b>คำสั่งที่ใช้ได้:</b>',
    '/status — ดูสถานะการเชื่อมต่อ Chrome CDP และแท็บที่ผูกอยู่',
    '/tabs — แสดงรายการแท็บทั้งหมดใน Chrome',
    '/tab &lt;เลขแท็บ&gt; — สลับไปเชื่อมต่อแท็บที่ต้องการ',
    '/new — เริ่มบทสนทนาใหม่บน Antigravity Web',
    '/stop — หยุดการสร้างคำตอบที่กำลังทำงานอยู่',
    '/screenshot — ถ่ายภาพหน้าจอแท็บ Antigravity Web ปัจจุบัน',
    '/inspect — ตรวจสอบ DOM elements สำหรับปรับแต่ง selectors.json',
    '/ping — ทดสอบความเร็วตอบสนองของบอต',
    '/whoami — แสดง User ID และ Chat ID ของคุณ',
  ].join('\n');

  bot.command('start', async (ctx) => {
    await ctx.reply(helpText, { parse_mode: 'HTML' });
  });

  bot.command('help', async (ctx) => {
    await ctx.reply(helpText, { parse_mode: 'HTML' });
  });

  bot.command('ping', async (ctx) => {
    const sent = Date.now();
    const msg = await ctx.reply('🏓 Pong!');
    const latency = Date.now() - sent;
    await ctx.api
      .editMessageText(ctx.chat.id, msg.message_id, `🏓 Pong! (${latency}ms)`)
      .catch(() => undefined);
  });

  bot.command('status', async (ctx) => {
    const status = await bridge.getStatus();
    const uptimeSec = Math.floor((Date.now() - startedAt) / 1000);
    const lines = [
      '📊 <b>Bridge Status</b>',
      `• Chrome CDP: ${status.connected ? '🟢 Connected' : '🔴 Disconnected'} (<code>${escapeHtml(status.cdpUrl)}</code>)`,
      status.attachedTab
        ? `• Active Tab: <b>${escapeHtml(status.attachedTab.title)}</b>\n  <code>${escapeHtml(status.attachedTab.url)}</code>`
        : '• Active Tab: <i>None</i>',
      `• Input Selector: ${status.matchedInputSelector ? `<code>${escapeHtml(status.matchedInputSelector)}</code>` : '⚠️ Not detected (ลองใช้ /inspect)'}`,
      `• Queue: ${status.isBusy ? `⏳ Busy (${status.queueSize} queued)` : '✅ Idle'}`,
      `• Uptime: ${uptimeSec}s`,
    ];
    await ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });
  });

  bot.command('tabs', async (ctx) => {
    try {
      const tabs = await bridge.listTabs();
      if (tabs.length === 0) {
        await ctx.reply('ไม่พบแท็บที่เปิดอยู่ใน Chrome');
        return;
      }

      const lines = [
        '🗂 <b>Chrome Open Tabs</b>',
        ...tabs.map((tab) => {
          const marker = tab.isAttached ? '✅ ' : '';
          return `${marker}<b>${tab.index}.</b> ${escapeHtml(tab.title)}\n   <code>${escapeHtml(tab.url)}</code>`;
        }),
        '',
        'ใช้ <code>/tab &lt;เลข&gt;</code> เพื่อสลับแท็บ',
      ];

      await sendHtmlChunks(ctx, lines.join('\n'));
    } catch (err) {
      await replyError(ctx, 'ไม่สามารถดึงรายการแท็บได้', err);
    }
  });

  bot.command('tab', async (ctx) => {
    const arg = ctx.match?.trim();
    const index = Number(arg);
    if (!arg || !Number.isInteger(index) || index < 1) {
      await ctx.reply('การใช้งาน: /tab <เลขแท็บ> (ดูเลขแท็บได้จาก /tabs)');
      return;
    }

    try {
      const tab = await bridge.attachTabByIndex(index);
      await ctx.reply(
        `✅ เชื่อมต่อแท็บ #${tab.index} แล้ว\n<b>${escapeHtml(tab.title)}</b>\n<code>${escapeHtml(tab.url)}</code>`,
        { parse_mode: 'HTML' },
      );
    } catch (err) {
      await replyError(ctx, 'ไม่สามารถสลับแท็บได้', err);
    }
  });

  bot.command('new', async (ctx) => {
    try {
      const clicked = await bridge.startNewChat();
      if (clicked) {
        await ctx.reply('✨ เริ่มบทสนทนาใหม่บน Antigravity Web แล้ว');
      } else {
        await ctx.reply(
          '⚠️ ไม่พบปุ่ม New Chat บนหน้าเว็บปัจจุบัน ลองใช้ /inspect เพื่อดู selector ของปุ่มแล้วตั้งค่าใน selectors.json',
        );
      }
    } catch (err) {
      await replyError(ctx, 'ไม่สามารถเริ่มแชทใหม่ได้', err);
    }
  });

  bot.command('stop', async (ctx) => {
    const stopped = await bridge.stopGeneration();
    if (stopped) {
      await ctx.reply('🛑 ส่งคำสั่งหยุดการสร้างคำตอบแล้ว');
    } else {
      await ctx.reply('ℹ️ ไม่มีงานที่กำลังสร้างคำตอบอยู่ในขณะนี้');
    }
  });

  bot.command('screenshot', async (ctx) => {
    try {
      await ctx.replyWithChatAction('upload_photo');
      const png = await bridge.takeScreenshot();
      await ctx.replyWithPhoto(new InputFile(png, 'antigravity-tab.png'), {
        caption: '📸 ภาพหน้าจอแท็บ Antigravity Web ปัจจุบัน',
      });
    } catch (err) {
      await replyError(ctx, 'ไม่สามารถถ่ายภาพหน้าจอได้', err);
    }
  });

  bot.command('inspect', async (ctx) => {
    try {
      const report = await bridge.inspectDom();
      const lines = [
        '🔍 <b>DOM Inspection Report</b>',
        `• Title: ${escapeHtml(report.title)}`,
        `• URL: <code>${escapeHtml(report.url)}</code>`,
        '',
        '<b>Inputs:</b>',
        ...(report.inputs.length > 0
          ? report.inputs.map((i) => `• <code>${escapeHtml(i)}</code>`)
          : ['• (none)']),
        '',
        '<b>File Inputs:</b>',
        ...(report.fileInputs.length > 0
          ? report.fileInputs.map((i) => `• <code>${escapeHtml(i)}</code>`)
          : ['• (none)']),
        '',
        '<b>Visible Buttons (top 12):</b>',
        ...(report.buttons.length > 0
          ? report.buttons.map((b) => `• <code>${escapeHtml(b)}</code>`)
          : ['• (none)']),
        '',
        '<b>Matched Message Selectors:</b>',
        ...(report.messageCandidates.length > 0
          ? report.messageCandidates.map(
              (m) =>
                `• <code>${escapeHtml(m.selector)}</code> (${m.count} items) — "${escapeHtml(m.preview)}"`,
            )
          : ['• (none matched — add your selector to selectors.json)']),
      ];

      await sendHtmlChunks(ctx, lines.join('\n'));
    } catch (err) {
      await replyError(ctx, 'ไม่สามารถตรวจสอบ DOM ได้', err);
    }
  });

  // Handle plain text prompts
  bot.on('message:text', async (ctx) => {
    const text = ctx.message.text.trim();
    if (!text || text.startsWith('/')) {
      return;
    }

    await handlePromptForwarding(ctx, text);
  });

  // Handle photos (with optional caption)
  bot.on('message:photo', async (ctx) => {
    const photos = ctx.message.photo;
    const largest = photos[photos.length - 1];
    if (!largest) return;

    const caption =
      ctx.message.caption?.trim() || 'ช่วยวิเคราะห์รูปภาพที่แนบมานี้ให้หน่อย';
    await handleAttachmentMessage(
      ctx,
      largest.file_id,
      largest.file_size,
      `photo_${Date.now()}.jpg`,
      caption,
    );
  });

  // Handle documents/files (with optional caption)
  bot.on('message:document', async (ctx) => {
    const doc = ctx.message.document;
    const caption =
      ctx.message.caption?.trim() ||
      `ช่วยตรวจสอบไฟล์ ${doc.file_name ?? 'ที่แนบมา'} นี้ให้หน่อย`;
    await handleAttachmentMessage(
      ctx,
      doc.file_id,
      doc.file_size,
      doc.file_name ?? `file_${Date.now()}.bin`,
      caption,
    );
  });

  async function handleAttachmentMessage(
    ctx: Context,
    fileId: string,
    fileSize: number | undefined,
    originalName: string,
    promptText: string,
  ): Promise<void> {
    const maxBytes = config.maxFileSizeMb * 1024 * 1024;
    if (fileSize && fileSize > maxBytes) {
      await ctx.reply(
        `⚠️ ไฟล์มีขนาดใหญ่เกินกำหนด (${(fileSize / 1024 / 1024).toFixed(1)} MB > ${config.maxFileSizeMb} MB)`,
      );
      return;
    }

    let localFilePath: string | null = null;
    try {
      await fs.mkdir(config.uploadTempDir, { recursive: true });
      const tgFile = await ctx.api.getFile(fileId);
      if (!tgFile.file_path) {
        throw new Error('Telegram API did not return a downloadable file_path.');
      }

      const fileUrl = `https://api.telegram.org/file/bot${config.telegramBotToken}/${tgFile.file_path}`;
      const response = await fetch(fileUrl);
      if (!response.ok) {
        throw new Error(`Failed to download file from Telegram (HTTP ${response.status})`);
      }

      const arrayBuffer = await response.arrayBuffer();
      if (arrayBuffer.byteLength > maxBytes) {
        throw new Error(`Downloaded file exceeds ${config.maxFileSizeMb} MB limit.`);
      }

      const safeName = `${Date.now()}_${sanitizeFileName(originalName)}`;
      localFilePath = path.join(config.uploadTempDir, safeName);
      await fs.writeFile(localFilePath, Buffer.from(arrayBuffer));

      await handlePromptForwarding(ctx, promptText, localFilePath);
    } catch (err) {
      await replyError(ctx, 'ไม่สามารถดาวน์โหลดหรืออัปโหลดไฟล์แนบได้', err);
    } finally {
      if (localFilePath) {
        await fs.unlink(localFilePath).catch(() => undefined);
      }
    }
  }

  async function handlePromptForwarding(
    ctx: Context,
    promptText: string,
    attachmentPath?: string,
  ): Promise<void> {
    if (!ctx.chat) return;
    const chatId = ctx.chat.id;

    const queuedNote =
      bridge.isBusy ? ` (คิวที่ ${bridge.queueSize + 1})` : '';
    const statusMsg = await ctx.reply(
      attachmentPath
        ? `📎 กำลังอัปโหลดไฟล์และส่งคำสั่งไปยัง Antigravity Web...${queuedNote}`
        : `⏳ กำลังส่งคำสั่งไปยัง Antigravity Web...${queuedNote}`,
    );

    // Keep Telegram's "typing..." indicator alive while Antigravity is working
    const typingTimer = setInterval(() => {
      ctx.api.sendChatAction(chatId, 'typing').catch(() => undefined);
    }, 4500);
    await ctx.api.sendChatAction(chatId, 'typing').catch(() => undefined);

    let lastStreamEditAt = 0;
    let lastPreviewSent = '';

    try {
      const result = await bridge.sendPrompt(promptText, {
        attachmentPath,
        onProgress: async (partialText) => {
          if (!config.streamUpdates) return;
          const now = Date.now();
          if (now - lastStreamEditAt < config.streamEditIntervalMs) return;

          const preview = buildStreamPreview(partialText);
          if (preview === lastPreviewSent) return;

          lastStreamEditAt = now;
          lastPreviewSent = preview;
          await ctx.api
            .editMessageText(chatId, statusMsg.message_id, preview)
            .catch(() => undefined);
        },
      });

      clearInterval(typingTimer);

      if (!result.text.trim()) {
        const reason = result.aborted
          ? '🛑 หยุดการทำงานแล้ว (ยังไม่มีข้อความตอบกลับ)'
          : result.timedOut
            ? '⏱ หมดเวลารอคำตอบจาก Antigravity Web (ลองใช้ /screenshot หรือ /inspect เพื่อตรวจสอบหน้าเว็บ)'
            : '⚠️ ไม่พบข้อความตอบกลับจากหน้าเว็บ (ลองตรวจสอบ selector ด้วย /inspect)';

        await ctx.api
          .editMessageText(chatId, statusMsg.message_id, reason)
          .catch(() => ctx.reply(reason));
        return;
      }

      let finalMarkdown = result.text.trim();
      if (result.aborted) {
        finalMarkdown += '\n\n_(หยุดการสร้างคำตอบก่อนจบด้วยคำสั่ง /stop)_';
      } else if (result.timedOut) {
        finalMarkdown += `\n\n_(หมดเวลารอหลัง ${formatDuration(result.elapsedMs)} — แสดงข้อความล่าสุดที่ดึงได้)_`;
      }

      const chunks = splitMarkdownForTelegram(finalMarkdown);
      if (chunks.length === 0) {
        await ctx.api
          .deleteMessage(chatId, statusMsg.message_id)
          .catch(() => undefined);
        return;
      }

      // Edit the status message with the first chunk, then send subsequent chunks
      const firstChunk = chunks[0] ?? '';
      await editOrSendFormattedChunk(
        ctx,
        chatId,
        statusMsg.message_id,
        firstChunk,
      );

      for (let i = 1; i < chunks.length; i += 1) {
        const chunk = chunks[i];
        if (!chunk) continue;
        await sendFormattedChunk(ctx, chunk);
      }
    } catch (err) {
      clearInterval(typingTimer);
      logger.error('Failed to process prompt', err);
      const errMsg = err instanceof Error ? err.message : String(err);
      await ctx.api
        .editMessageText(
          chatId,
          statusMsg.message_id,
          `❌ เกิดข้อผิดพลาด: ${errMsg}`,
        )
        .catch(() => ctx.reply(`❌ เกิดข้อผิดพลาด: ${errMsg}`));
    }
  }

  bot.catch((err) => {
    logger.error('Unhandled Grammy bot error', err.error);
  });

  return bot;
}

function buildStreamPreview(partialText: string): string {
  const header = '✍️ กำลังรับคำตอบจาก Antigravity Web...\n\n';
  const maxBody = 3500;
  const body =
    partialText.length > maxBody
      ? `…${partialText.slice(partialText.length - maxBody)}`
      : partialText;
  return `${header}${body}`;
}

async function editOrSendFormattedChunk(
  ctx: Context,
  chatId: number,
  messageId: number,
  markdownChunk: string,
): Promise<void> {
  const html = markdownToTelegramHtml(markdownChunk);
  try {
    await ctx.api.editMessageText(chatId, messageId, html, {
      parse_mode: 'HTML',
    });
  } catch {
    // Fallback to plain text if Telegram rejects HTML entities/tags
    const plain = markdownChunk.slice(0, TELEGRAM_MAX_LENGTH);
    await ctx.api
      .editMessageText(chatId, messageId, plain)
      .catch(() => ctx.reply(plain));
  }
}

async function sendFormattedChunk(
  ctx: Context,
  markdownChunk: string,
): Promise<void> {
  const html = markdownToTelegramHtml(markdownChunk);
  try {
    await ctx.reply(html, { parse_mode: 'HTML' });
  } catch {
    await ctx.reply(markdownChunk.slice(0, TELEGRAM_MAX_LENGTH));
  }
}

async function sendHtmlChunks(ctx: Context, html: string): Promise<void> {
  if (html.length <= TELEGRAM_MAX_LENGTH) {
    await ctx.reply(html, { parse_mode: 'HTML' });
    return;
  }

  const lines = html.split('\n');
  let buffer = '';
  for (const line of lines) {
    if (buffer.length + line.length + 1 > TELEGRAM_MAX_LENGTH - 100) {
      await ctx.reply(buffer, { parse_mode: 'HTML' });
      buffer = line;
    } else {
      buffer = buffer ? `${buffer}\n${line}` : line;
    }
  }
  if (buffer) {
    await ctx.reply(buffer, { parse_mode: 'HTML' });
  }
}

async function replyError(
  ctx: Context,
  prefix: string,
  err: unknown,
): Promise<void> {
  const message = err instanceof Error ? err.message : String(err);
  await ctx.reply(`❌ ${prefix}: ${message}`);
}
