import fs from 'node:fs/promises';
import { Api, InputFile } from 'grammy';
import { loadConfig } from '../config.js';
import {
  markdownToTelegramHtml,
  splitMarkdownForTelegram,
  TELEGRAM_MAX_LENGTH,
} from '../telegram/formatter.js';
import { buildMainMenu, buildModelMenu } from './menu.js';

interface CliArgs {
  chatId: number;
  editMessageId?: number;
  text?: string;
  file?: string;
  photo?: string;
  document?: string;
  video?: string;
  caption?: string;
  showMenu: boolean;
  showModelMenu: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  let chatId: number | undefined;
  let editMessageId: number | undefined;
  let text: string | undefined;
  let file: string | undefined;
  let photo: string | undefined;
  let document: string | undefined;
  let video: string | undefined;
  let caption: string | undefined;
  let showMenu = false;
  let showModelMenu = false;

  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const next = argv[i + 1];
    if (flag === '--chat' && next) {
      chatId = Number(next);
      i += 1;
    } else if (flag === '--edit' && next) {
      editMessageId = Number(next);
      i += 1;
    } else if (flag === '--text' && next !== undefined) {
      text = next;
      i += 1;
    } else if (flag === '--file' && next) {
      file = next;
      i += 1;
    } else if (flag === '--photo' && next) {
      photo = next;
      i += 1;
    } else if (flag === '--document' && next) {
      document = next;
      i += 1;
    } else if (flag === '--video' && next) {
      video = next;
      i += 1;
    } else if (flag === '--caption' && next !== undefined) {
      caption = next;
      i += 1;
    } else if (flag === '--menu') {
      showMenu = true;
    } else if (flag === '--model-menu') {
      showModelMenu = true;
    }
  }

  if (!chatId || !Number.isSafeInteger(chatId)) {
    throw new Error(
      'Usage: relay:reply --chat <chatId> [--edit <msgId>] [--menu | --model-menu] [--text <md> | --file <path> | stdin]',
    );
  }

  return { chatId, editMessageId, text, file, photo, document, video, caption, showMenu, showModelMenu };
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) {
    return '';
  }
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf-8');
}

async function main(): Promise<void> {
  const config = loadConfig();
  const args = parseArgs(process.argv.slice(2));
  const api = new Api(config.telegramBotToken);

  if (args.showMenu || args.showModelMenu) {
    const menu = args.showModelMenu ? buildModelMenu() : buildMainMenu();
    if (args.editMessageId) {
      try {
        await api.editMessageText(args.chatId, args.editMessageId, menu.text, {
          parse_mode: 'HTML',
          reply_markup: menu.reply_markup,
        });
        return;
      } catch {
        // Fall through to sending a fresh menu message
      }
    }
    await api.sendMessage(args.chatId, menu.text, {
      parse_mode: 'HTML',
      reply_markup: menu.reply_markup,
    });
    return;
  }

  let markdown = args.text ?? '';
  if (args.file) {
    markdown = await fs.readFile(args.file, 'utf-8');
  } else if (!markdown) {
    markdown = await readStdin();
  }
  markdown = markdown.trim();

  if (markdown) {
    const chunks = splitMarkdownForTelegram(markdown);
    for (let i = 0; i < chunks.length; i += 1) {
      const chunk = chunks[i];
      if (!chunk) continue;
      const html = markdownToTelegramHtml(chunk);

      if (i === 0 && args.editMessageId) {
        try {
          await api.editMessageText(args.chatId, args.editMessageId, html, {
            parse_mode: 'HTML',
          });
          continue;
        } catch {
          try {
            await api.editMessageText(
              args.chatId,
              args.editMessageId,
              chunk.slice(0, TELEGRAM_MAX_LENGTH),
            );
            continue;
          } catch {
            // Fall through to sendMessage
          }
        }
      }

      try {
        await api.sendMessage(args.chatId, html, { parse_mode: 'HTML' });
      } catch {
        await api.sendMessage(args.chatId, chunk.slice(0, TELEGRAM_MAX_LENGTH));
      }
    }
  }

  if (args.photo) {
    await api.sendPhoto(args.chatId, new InputFile(args.photo));
  }

  if (args.document) {
    await api.sendDocument(args.chatId, new InputFile(args.document));
  }

  if (args.video) {
    await api.sendVideo(args.chatId, new InputFile(args.video), {
      caption: args.caption,
      supports_streaming: true,
    });
  }
}

main().catch((err) => {
  console.error('[relay:reply] Error:', err);
  process.exit(1);
});
