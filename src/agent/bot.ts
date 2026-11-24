import fs from 'node:fs/promises';
import path from 'node:path';
import { Bot, InputFile, type Context } from 'grammy';
import { isAuthorized, type AppConfig } from '../config.js';
import {
  escapeHtml,
  markdownToTelegramHtml,
  splitMarkdownForTelegram,
  TELEGRAM_MAX_LENGTH,
} from '../telegram/formatter.js';
import type { Logger } from '../utils/logger.js';
import { TaskQueue } from '../utils/queue.js';
import {
  GeminiClient,
  type GeminiContent,
  type GeminiPart,
} from './gemini.js';
import {
  AGENT_TOOL_DECLARATIONS,
  createAgentToolExecutor,
  runTradingAgentsAnalysis,
} from './tools.js';
import {
  buildMainMenu,
  buildModelMenu,
  buildSubMenu,
  resolveActionPrompt,
} from '../relay/menu.js';
import {
  loadModelState,
  saveModelState,
  type GeminiApiModel,
  type RelayModelTier,
} from '../relay/modelState.js';

const AVAILABLE_MODELS = [
  'gemini-3.8-flash',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
] as const;

const SYSTEM_INSTRUCTION = `You are Antigravity Telegram Assistant, a helpful, concise, and capable AI assistant for the user in Thai (unless the user writes in another language).
You have live tools:
- web_search: use this whenever the user asks about current news, stock prices, market updates, weather, or any recent event.
- analyze_stock: use this when the user asks to deeply analyze a stock/crypto ticker using TradingAgents (multi-agent fundamental + technical + news analysis).
- google_drive: check connected Google Drive status, quota, recent files, or search files.
- github_query: search GitHub repos, view repo details/README, or list user repos.
- workspace_inspect: list or read files in /home/antigravity.

Format responses cleanly in Markdown suitable for Telegram (short paragraphs, bullet points, bold highlights, fenced code blocks when showing code). Be truthful, concise, and cite sources when using web_search.`;

const MAX_HISTORY_ENTRIES = 24;

function guessMimeType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const map: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.pdf': 'application/pdf',
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.csv': 'text/csv',
    '.json': 'application/json',
  };
  return map[ext] ?? 'application/octet-stream';
}

export function createAlwaysOnlineAgentBot(
  config: AppConfig,
  googleApiKey: string,
  logger: Logger,
  initialModel = 'gemini-3.8-flash',
): Bot {
  const bot = new Bot(config.telegramBotToken);
  const gemini = new GeminiClient(googleApiKey);
  const executeTool = createAgentToolExecutor(gemini);
  const chatQueues = new Map<number, TaskQueue>();
  const histories = new Map<number, GeminiContent[]>();
  const startedAt = Date.now();
  let currentModel = initialModel;

  function getQueue(chatId: number): TaskQueue {
    let q = chatQueues.get(chatId);
    if (!q) {
      q = new TaskQueue();
      chatQueues.set(chatId, q);
    }
    return q;
  }

  function trimHistory(history: GeminiContent[]): GeminiContent[] {
    if (history.length <= MAX_HISTORY_ENTRIES) return history;
    // Keep the tail starting at a clean 'user' turn with text/inlineData
    let start = history.length - MAX_HISTORY_ENTRIES;
    while (start < history.length) {
      const entry = history[start];
      const hasUserText =
        entry?.role === 'user' &&
        entry.parts.some((p) => 'text' in p || 'inlineData' in p);
      if (hasUserText) break;
      start += 1;
    }
    return history.slice(start);
  }

  // /whoami always allowed for self-ID lookup
  bot.command('whoami', async (ctx) => {
    const userId = ctx.from?.id;
    const chatId = ctx.chat?.id;
    const authorized = isAuthorized(config, userId, chatId);
    await ctx.reply(
      [
        '🪪 <b>Telegram Identity</b>',
        `• User ID: <code>${userId ?? 'unknown'}</code>`,
        `• Chat ID: <code>${chatId ?? 'unknown'}</code>`,
        `• Authorized: <b>${authorized ? 'Yes ✅' : 'No ❌'}</b>`,
      ].join('\n'),
      { parse_mode: 'HTML' },
    );
  });

  // Strict fail-closed whitelist middleware
  bot.use(async (ctx, next) => {
    const userId = ctx.from?.id;
    const chatId = ctx.chat?.id;
    if (!isAuthorized(config, userId, chatId)) {
      logger.warn('Blocked unauthorized Telegram access', { userId, chatId });
      if (ctx.chat?.type === 'private') {
        await ctx.reply('⛔ คุณยังไม่มีสิทธิ์ใช้งานบอตนี้ (ส่ง /whoami เพื่อดู User ID)');
      }
      return;
    }
    await next();
  });

  const helpHtml = [
    '🤖 <b>Antigravity Always-Online Telegram Agent</b>',
    '',
    'บอตทำงานแบบออนไลน์ตลอด (Daemon) พร้อมเครื่องมือครบชุด:',
    '• 🔎 ค้นหาข่าว/ข้อมูลเรียลไทม์ (Google Search)',
    '• 📊 วิเคราะห์หุ้น Multi-Agent (TradingAgents + ไฟล์รายงาน HTML)',
    '• ☁️ เช็ก Google Drive / GitHub / Workspace',
    '• 🖼 ส่งรูปภาพหรือเอกสารให้ช่วยวิเคราะห์ได้',
    '',
    '<b>คำสั่งที่ใช้ได้:</b>',
    '/menu — 🏠 เปิดเมนูหลักเลือกใช้งาน Project',
    '/analyze &lt;TICKER&gt; — รัน TradingAgents วิเคราะห์หุ้น (เช่น <code>/analyze NVDA</code>, <code>/analyze PTT.BK</code>)',
    '/model [ชื่อโมเดล] — ดูหรือสลับโมเดล Gemini',
    '/new — ล้างประวัติแชทเพื่อเริ่มเรื่องใหม่',
    '/status — เช็กสถานะบอต โมเดล และ uptime',
    '/ping — ทดสอบความเร็วตอบสนอง',
    '/whoami — ดู User ID / Chat ID',
  ].join('\n');

  bot.command(['start', 'menu'], async (ctx) => {
    const menu = buildMainMenu();
    await ctx.reply(menu.text, {
      parse_mode: 'HTML',
      reply_markup: menu.reply_markup,
    });
  });

  bot.command('help', async (ctx) => {
    await ctx.reply(helpHtml, { parse_mode: 'HTML' });
  });

  bot.command('affiliate', async (ctx) => {
    const screen = buildSubMenu('affiliate') ?? buildMainMenu();
    await ctx.reply(screen.text, {
      parse_mode: 'HTML',
      reply_markup: screen.reply_markup,
    });
  });

  bot.command('news', async (ctx) => {
    const screen = buildSubMenu('news') ?? buildMainMenu();
    await ctx.reply(screen.text, {
      parse_mode: 'HTML',
      reply_markup: screen.reply_markup,
    });
  });

  bot.command('drive', async (ctx) => {
    const screen = buildSubMenu('gdrive') ?? buildMainMenu();
    await ctx.reply(screen.text, {
      parse_mode: 'HTML',
      reply_markup: screen.reply_markup,
    });
  });

  bot.command('shortfilm', async (ctx) => {
    const screen = buildSubMenu('shortfilm') ?? buildMainMenu();
    await ctx.reply(screen.text, {
      parse_mode: 'HTML',
      reply_markup: screen.reply_markup,
    });
  });

  bot.command('projects', async (ctx) => {
    const screen = buildSubMenu('projects') ?? buildMainMenu();
    await ctx.reply(screen.text, {
      parse_mode: 'HTML',
      reply_markup: screen.reply_markup,
    });
  });

  bot.command('stop_relay', async (ctx) => {
    await ctx.reply(
      'ℹ️ ขณะนี้บอตทำงานอยู่ในโหมด <b>Always-Online Standby Daemon</b> อยู่แล้วครับ (พิมพ์ <code>Relay</code> ในแชท Antigravity Web หากต้องการสลับกลับเป็น Direct Relay)',
      { parse_mode: 'HTML' },
    );
  });

  bot.on('callback_query:data', async (ctx) => {
    const data = ctx.callbackQuery.data;

    if (data.startsWith('menu:')) {
      const section = data.slice('menu:'.length);
      const screen = buildSubMenu(section);
      await ctx.answerCallbackQuery().catch(() => undefined);
      if (screen) {
        await ctx
          .editMessageText(screen.text, {
            parse_mode: 'HTML',
            reply_markup: screen.reply_markup,
          })
          .catch(() =>
            ctx.reply(screen.text, {
              parse_mode: 'HTML',
              reply_markup: screen.reply_markup,
            }),
          );
      }
      return;
    }

    if (data.startsWith('model:relay:')) {
      const tier = data.slice('model:relay:'.length) as RelayModelTier;
      const updated = saveModelState({ relayTier: tier });
      const screen = buildModelMenu(updated);
      await ctx
        .answerCallbackQuery({
          text: `บันทึก Antigravity Tier: ${tier} แล้ว ✅`,
        })
        .catch(() => undefined);
      await ctx
        .editMessageText(screen.text, {
          parse_mode: 'HTML',
          reply_markup: screen.reply_markup,
        })
        .catch(() => undefined);
      return;
    }

    if (data.startsWith('model:gemini:')) {
      const geminiModel = data.slice('model:gemini:'.length) as GeminiApiModel;
      currentModel = geminiModel;
      const updated = saveModelState({ geminiModel });
      const screen = buildModelMenu(updated);
      await ctx
        .answerCallbackQuery({
          text: `เปลี่ยน Gemini Model เป็น ${geminiModel} แล้ว ✅`,
        })
        .catch(() => undefined);
      await ctx
        .editMessageText(screen.text, {
          parse_mode: 'HTML',
          reply_markup: screen.reply_markup,
        })
        .catch(() => undefined);
      return;
    }

    if (data === 'sys:status') {
      await ctx.answerCallbackQuery().catch(() => undefined);
      const uptimeSec = Math.floor((Date.now() - startedAt) / 1000);
      await ctx.reply(
        `🟢 <b>สถานะระบบ: Always-Online Standby Daemon</b>\n• Model: <code>${escapeHtml(currentModel)}</code>\n• Uptime: ${uptimeSec}s\n• พิมพ์ <code>Relay</code> ใน Antigravity Web เพื่อสลับกลับเป็น Direct Relay`,
        { parse_mode: 'HTML' },
      );
      return;
    }

    if (data === 'sys:ping') {
      await ctx.answerCallbackQuery({ text: '🏓 Pong!' }).catch(() => undefined);
      await ctx.reply('🏓 Pong! Always-Online Standby Daemon พร้อมใช้งานครับ');
      return;
    }

    if (data === 'sys:standby') {
      await ctx
        .answerCallbackQuery({ text: 'อยู่ในโหมด Standby อยู่แล้วครับ' })
        .catch(() => undefined);
      return;
    }

    const actionPrompt = resolveActionPrompt(data);
    if (actionPrompt) {
      await ctx
        .answerCallbackQuery({ text: 'รับคำสั่งแล้ว กำลังดำเนินการ...' })
        .catch(() => undefined);
      await handleUserParts(ctx, [{ text: actionPrompt }]);
      return;
    }

    await ctx.answerCallbackQuery().catch(() => undefined);
  });

  bot.command('ping', async (ctx) => {
    const t0 = Date.now();
    const msg = await ctx.reply('🏓 Pong!');
    const ms = Date.now() - t0;
    await ctx.api
      .editMessageText(ctx.chat.id, msg.message_id, `🏓 Pong! (${ms}ms)`)
      .catch(() => undefined);
  });

  bot.command('status', async (ctx) => {
    const uptimeSec = Math.floor((Date.now() - startedAt) / 1000);
    const hrs = Math.floor(uptimeSec / 3600);
    const mins = Math.floor((uptimeSec % 3600) / 60);
    const secs = uptimeSec % 60;
    const historyLen = histories.get(ctx.chat.id)?.length ?? 0;

    await ctx.reply(
      [
        '🟢 <b>Antigravity Always-Online Agent</b>',
        `• Mode: <b>Standalone Daemon (ออนไลน์รอรับข้อความตลอด)</b>`,
        `• Model: <code>${escapeHtml(currentModel)}</code>`,
        `• Tools: Web Search, TradingAgents, Google Drive, GitHub, Workspace`,
        `• Context Turns: ${historyLen}`,
        `• Uptime: ${hrs}h ${mins}m ${secs}s`,
      ].join('\n'),
      { parse_mode: 'HTML' },
    );
  });

  bot.command('model', async (ctx) => {
    const requested = ctx.match?.trim();
    if (!requested) {
      const screen = buildModelMenu({
        ...loadModelState(),
        geminiModel: AVAILABLE_MODELS.includes(currentModel as GeminiApiModel)
          ? (currentModel as GeminiApiModel)
          : loadModelState().geminiModel,
      });
      await ctx.reply(screen.text, {
        parse_mode: 'HTML',
        reply_markup: screen.reply_markup,
      });
      return;
    }

    currentModel = requested;
    if (AVAILABLE_MODELS.includes(requested as GeminiApiModel)) {
      saveModelState({ geminiModel: requested as GeminiApiModel });
    }
    await ctx.reply(`✅ เปลี่ยนโมเดลเป็น <code>${escapeHtml(currentModel)}</code> แล้วครับ`, {
      parse_mode: 'HTML',
    });
  });

  bot.command(['new', 'reset'], async (ctx) => {
    histories.delete(ctx.chat.id);
    await ctx.reply('✨ ล้างประวัติการสนทนาแล้ว เริ่มคุยเรื่องใหม่ได้เลยครับ');
  });

  bot.command('analyze', async (ctx) => {
    const rawTicker = ctx.match?.trim();
    if (!rawTicker) {
      await ctx.reply(
        'การใช้งาน: <code>/analyze NVDA</code> หรือ <code>/analyze PTT.BK</code>',
        { parse_mode: 'HTML' },
      );
      return;
    }

    const chatId = ctx.chat.id;
    const queue = getQueue(chatId);
    const statusMsg = await ctx.reply(
      `📊 กำลังรัน <b>TradingAgents Multi-Agent</b> วิเคราะห์ <code>${escapeHtml(rawTicker.toUpperCase())}</code>...\n<i>(ใช้เวลาประมาณ 1–3 นาที รวบรวม Market + News + Fundamentals + Bull/Bear Debate)</i>`,
      { parse_mode: 'HTML' },
    );

    await queue.enqueue(async () => {
      const typingTimer = setInterval(() => {
        ctx.api.sendChatAction(chatId, 'typing').catch(() => undefined);
      }, 4500);
      await ctx.api.sendChatAction(chatId, 'typing').catch(() => undefined);

      try {
        const result = await runTradingAgentsAnalysis({ ticker: rawTicker });
        // Ask Gemini to produce a crisp Thai executive summary of the raw report
        const summaryResp = await gemini.chatWithTools({
          model: currentModel,
          systemInstruction:
            'สรุปรายงาน TradingAgents เป็นภาษาไทยที่อ่านง่าย กระชับ ชัดเจน แบ่งหัวข้อ: 1) คำแนะนำสรุป (BUY/HOLD/SELL) 2) ปัจจัยบวก (Bull) 3) ความเสี่ยง (Bear) 4) แผนการเทรดและคุมความเสี่ยง',
          history: [
            {
              role: 'user',
              parts: [
                {
                  text: `สรุปผลวิเคราะห์ TradingAgents ของหุ้น ${result.ticker} (${result.date}):\n\n${result.summary}`,
                },
              ],
            },
          ],
          declarations: [],
          executeTool,
        });

        clearInterval(typingTimer);
        await sendFormattedReply(
          ctx,
          chatId,
          statusMsg.message_id,
          `📊 **ผลวิเคราะห์ TradingAgents: ${result.ticker} (${result.date})**\n\n${summaryResp.text}`,
        );

        if (result.htmlReportPath) {
          await ctx.replyWithDocument(
            new InputFile(
              result.htmlReportPath,
              `TradingAgents_${result.ticker}_${result.date}.html`,
            ),
            { caption: `📄 รายงานฉบับเต็ม ${result.ticker} (เปิดดูในเบราว์เซอร์ได้)` },
          );
        }
      } catch (err) {
        clearInterval(typingTimer);
        const msg = err instanceof Error ? err.message : String(err);
        await ctx.api
          .editMessageText(
            chatId,
            statusMsg.message_id,
            `❌ รัน TradingAgents ไม่สำเร็จ: ${msg}`,
          )
          .catch(() => ctx.reply(`❌ รัน TradingAgents ไม่สำเร็จ: ${msg}`));
      }
    });
  });

  // Handle text messages
  bot.on('message:text', async (ctx) => {
    const text = ctx.message.text.trim();
    if (!text || text.startsWith('/')) return;
    await handleUserParts(ctx, [{ text }]);
  });

  // Handle photos
  bot.on('message:photo', async (ctx) => {
    const largest = ctx.message.photo[ctx.message.photo.length - 1];
    if (!largest) return;
    const caption =
      ctx.message.caption?.trim() || 'ช่วยวิเคราะห์รูปภาพนี้ให้หน่อยครับ';
    await handleMediaMessage(ctx, largest.file_id, `photo_${Date.now()}.jpg`, caption);
  });

  // Handle documents
  bot.on('message:document', async (ctx) => {
    const doc = ctx.message.document;
    const caption =
      ctx.message.caption?.trim() ||
      `ช่วยอ่านและสรุปไฟล์ ${doc.file_name ?? 'นี้'} ให้หน่อยครับ`;
    await handleMediaMessage(
      ctx,
      doc.file_id,
      doc.file_name ?? `file_${Date.now()}.bin`,
      caption,
    );
  });

  async function handleMediaMessage(
    ctx: Context,
    fileId: string,
    fileName: string,
    caption: string,
  ): Promise<void> {
    try {
      const tgFile = await ctx.api.getFile(fileId);
      if (!tgFile.file_path) throw new Error('Telegram file_path missing');

      const fileUrl = `https://api.telegram.org/file/bot${config.telegramBotToken}/${tgFile.file_path}`;
      const res = await fetch(fileUrl);
      if (!res.ok) throw new Error(`Download failed (HTTP ${res.status})`);

      const buf = Buffer.from(await res.arrayBuffer());
      const mimeType = guessMimeType(fileName);

      const parts: GeminiPart[] = [{ text: caption }];
      if (mimeType.startsWith('text/') || mimeType === 'application/json') {
        parts.push({
          text: `\n\n[Attached file: ${fileName}]\n${buf.toString('utf-8').slice(0, 15000)}`,
        });
      } else {
        parts.push({
          inlineData: {
            mimeType,
            data: buf.toString('base64'),
          },
        });
      }

      await handleUserParts(ctx, parts);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await ctx.reply(`❌ ไม่สามารถรับไฟล์แนบได้: ${msg}`);
    }
  }

  async function handleUserParts(ctx: Context, parts: GeminiPart[]): Promise<void> {
    if (!ctx.chat) return;
    const chatId = ctx.chat.id;
    const queue = getQueue(chatId);

    const statusMsg = await ctx.reply('⏳ กำลังคิด...');

    await queue.enqueue(async () => {
      const typingTimer = setInterval(() => {
        ctx.api.sendChatAction(chatId, 'typing').catch(() => undefined);
      }, 4500);
      await ctx.api.sendChatAction(chatId, 'typing').catch(() => undefined);

      try {
        const prevHistory = histories.get(chatId) ?? [];
        const nextHistory: GeminiContent[] = [
          ...prevHistory,
          { role: 'user', parts },
        ];

        const toolLabels: Record<string, string> = {
          web_search: '🔎 กำลังค้นหาข้อมูลล่าสุด...',
          analyze_stock: '📊 กำลังรัน TradingAgents วิเคราะห์หุ้น (1–3 นาที)...',
          google_drive: '☁️ กำลังตรวจสอบ Google Drive...',
          github_query: '🐙 กำลังค้นหาข้อมูลบน GitHub...',
          workspace_inspect: '📁 กำลังตรวจสอบไฟล์ใน Workspace...',
        };

        const outcome = await gemini.chatWithTools({
          model: currentModel,
          systemInstruction: SYSTEM_INSTRUCTION,
          history: nextHistory,
          declarations: AGENT_TOOL_DECLARATIONS,
          executeTool,
          onToolCall: async (toolName) => {
            const label = toolLabels[toolName] ?? `🛠 กำลังใช้เครื่องมือ ${toolName}...`;
            await ctx.api
              .editMessageText(chatId, statusMsg.message_id, label)
              .catch(() => undefined);
          },
        });

        histories.set(chatId, trimHistory(outcome.updatedHistory));
        clearInterval(typingTimer);

        await sendFormattedReply(
          ctx,
          chatId,
          statusMsg.message_id,
          outcome.text,
        );

        for (const filePath of outcome.attachments) {
          try {
            await fs.access(filePath);
            await ctx.replyWithDocument(
              new InputFile(filePath, path.basename(filePath)),
            );
          } catch {
            // Skip missing attachment
          }
        }
      } catch (err) {
        clearInterval(typingTimer);
        logger.error('Agent turn failed', err);
        const msg = err instanceof Error ? err.message : String(err);
        await ctx.api
          .editMessageText(
            chatId,
            statusMsg.message_id,
            `❌ เกิดข้อผิดพลาด: ${msg}`,
          )
          .catch(() => ctx.reply(`❌ เกิดข้อผิดพลาด: ${msg}`));
      }
    });
  }

  bot.catch((err) => {
    logger.error('Unhandled Telegram Agent error', err.error);
  });

  return bot;
}

async function sendFormattedReply(
  ctx: Context,
  chatId: number,
  statusMessageId: number,
  markdown: string,
): Promise<void> {
  const chunks = splitMarkdownForTelegram(markdown);
  if (chunks.length === 0) {
    await ctx.api.deleteMessage(chatId, statusMessageId).catch(() => undefined);
    return;
  }

  for (let i = 0; i < chunks.length; i += 1) {
    const chunk = chunks[i];
    if (!chunk) continue;
    const html = markdownToTelegramHtml(chunk);

    if (i === 0) {
      try {
        await ctx.api.editMessageText(chatId, statusMessageId, html, {
          parse_mode: 'HTML',
        });
        continue;
      } catch {
        try {
          await ctx.api.editMessageText(
            chatId,
            statusMessageId,
            chunk.slice(0, TELEGRAM_MAX_LENGTH),
          );
          continue;
        } catch {
          // Fall back to sending a fresh message
        }
      }
    }

    try {
      await ctx.reply(html, { parse_mode: 'HTML' });
    } catch {
      await ctx.reply(chunk.slice(0, TELEGRAM_MAX_LENGTH));
    }
  }
}
