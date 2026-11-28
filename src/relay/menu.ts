import { type Api, InlineKeyboard } from 'grammy';
import {
  loadModelState,
  type ModelSelectionState,
} from './modelState.js';

export interface MenuScreen {
  text: string;
  reply_markup: InlineKeyboard;
}

/**
 * Shared Telegram bottom-left Menu (/) commands used consistently
 * across both Direct Relay and Always-Online Standby Daemon modes.
 */
export const BOT_COMMANDS = [
  { command: 'menu', description: '🏠 เมนูหลักเลือกใช้งาน Project' },
  { command: 'hyperframes', description: '🎞 สารคดี v8.2 (Adaptive • เสียง Puck • 3 แกน)' },
  { command: 'shortfilm', description: '🎬 หนังสั้น AI 15 ฉาก (สาเหตุ→หักมุม→ทางออก)' },
  { command: 'affiliate', description: '🛍 ทำคลิป Affiliate 30 วิ (เก็บลง Drive)' },
  { command: 'analyze', description: '📊 วิเคราะห์หุ้น (เช่น /analyze NVDA)' },
  { command: 'news', description: '📰 ข่าวหุ้นอเมริกา & ข่าวไทยวันนี้' },
  { command: 'drive', description: '☁️ เช็กสถานะและไฟล์ Google Drive' },
  { command: 'projects', description: '📁 จัดการโปรเจกต์ใน Workspace' },
  { command: 'model', description: '🧠 เลือก Model (Antigravity / Gemini)' },
  { command: 'status', description: '🟢 เช็กสถานะระบบ Direct Relay' },
];

/**
 * Clears stale command scopes (e.g. old all_private_chats overrides)
 * and registers BOT_COMMANDS cleanly on both default and all_private_chats.
 */
export async function syncTelegramMenuCommands(
  api: Api,
  chatIds: number[] = [],
): Promise<void> {
  await api.deleteMyCommands({ scope: { type: 'all_private_chats' } }).catch(() => undefined);
  await api.deleteMyCommands({ scope: { type: 'all_group_chats' } }).catch(() => undefined);
  for (const chatId of chatIds) {
    await api
      .deleteMyCommands({ scope: { type: 'chat', chat_id: chatId } })
      .catch(() => undefined);
  }
  await api.setMyCommands(BOT_COMMANDS).catch(() => undefined);
  await api
    .setMyCommands(BOT_COMMANDS, { scope: { type: 'all_private_chats' } })
    .catch(() => undefined);
  await api
    .setChatMenuButton({ menu_button: { type: 'commands' } })
    .catch(() => undefined);
}

export function buildMainMenu(): MenuScreen {
  const kb = new InlineKeyboard()
    .text('🎞 HyperFrames v8.2 (Adaptive • เสียง Puck)', 'menu:hyperframes')
    .row()
    .text('🎬 หนังสั้น AI (สาเหตุ→หักมุม→ทางออก)', 'menu:shortfilm')
    .row()
    .text('🛍 Affiliate Studio (30 วิ → Drive)', 'menu:affiliate')
    .row()
    .text('📊 วิเคราะห์หุ้น', 'menu:trading')
    .text('📰 ข่าว & ตลาดวันนี้', 'menu:news')
    .row()
    .text('☁️ Google Drive', 'menu:gdrive')
    .text('🐙 GitHub & Repos', 'menu:github')
    .row()
    .text('📁 Workspace & Toolkit', 'menu:projects')
    .text('⚙️ สถานะ & โหมด', 'menu:system');

  return {
    text: [
      '🏠 <b>Antigravity — เมนูหลัก</b>',
      '',
      'เลือกโปรเจกต์หรือเครื่องมือที่ต้องการใช้งานได้เลยครับ:',
      '<i>(หรือพิมพ์คำสั่ง / ส่งรูป / ส่งไฟล์มาได้ตลอดเวลา)</i>',
    ].join('\n'),
    reply_markup: kb,
  };
}

export function buildSubMenu(section: string): MenuScreen | null {
  if (section === 'main') {
    return buildMainMenu();
  }

  if (section === 'trading') {
    const kb = new InlineKeyboard()
      .text('🚀 NVDA', 'act:trading:NVDA')
      .text('🍎 AAPL', 'act:trading:AAPL')
      .text('⚡ TSLA', 'act:trading:TSLA')
      .row()
      .text('🪟 MSFT', 'act:trading:MSFT')
      .text('🇹🇭 PTT.BK', 'act:trading:PTT.BK')
      .text('₿ BTC-USD', 'act:trading:BTC-USD')
      .row()
      .text('📂 ดูรายงานที่เคยรันไว้', 'act:trading:list')
      .row()
      .text('⬅️ กลับเมนูหลัก', 'menu:main');

    return {
      text: [
        '📊 <b>TradingAgents — วิเคราะห์หุ้น Multi-Agent</b>',
        '',
        'แตะหุ้นที่ต้องการวิเคราะห์ (ได้สรุปไทย + ไฟล์ <code>complete_report.html</code>)',
        'หรือพิมพ์ <code>/analyze ชื่อหุ้น</code> เช่น <code>/analyze META</code>',
      ].join('\n'),
      reply_markup: kb,
    };
  }

  if (section === 'news') {
    const kb = new InlineKeyboard()
      .text('🇺🇸 หุ้นอเมริกาวันนี้', 'act:news:us')
      .text('🇹🇭 ข่าวไทยวันนี้', 'act:news:th')
      .row()
      .text('🚀 ข่าว NVDA ล่าสุด', 'act:news:nvda')
      .text('🥇 ราคาทองคำวันนี้', 'act:news:gold')
      .row()
      .text('⬅️ กลับเมนูหลัก', 'menu:main');

    return {
      text: [
        '📰 <b>ข่าว & ตลาดวันนี้ (Real-time Search)</b>',
        '',
        'เลือกหัวข้อข่าวที่ต้องการสรุปล่าสุดได้เลยครับ:',
      ].join('\n'),
      reply_markup: kb,
    };
  }

  if (section === 'gdrive') {
    const kb = new InlineKeyboard()
      .text('📊 สถานะ & พื้นที่ Drive', 'act:gdrive:status')
      .row()
      .text('🕒 ไฟล์อัปเดตล่าสุด 10 รายการ', 'act:gdrive:recent')
      .row()
      .text('⬅️ กลับเมนูหลัก', 'menu:main');

    return {
      text: [
        '☁️ <b>Google Drive</b>',
        '',
        'เลือกดูสถานะ ไฟล์ล่าสุด หรือพิมพ์ชื่อไฟล์ที่ต้องการค้นหาได้เลยครับ:',
      ].join('\n'),
      reply_markup: kb,
    };
  }

  if (section === 'shortfilm') {
    const kb = new InlineKeyboard()
      .text('💡 ไอเดียข่าวจริงใหม่ (สาเหตุ→หักมุม→ทางออก)', 'act:shortfilm:new_idea')
      .row()
      .text('📋 เช็กลิสต์ตอนทั้งหมด (EPISODE_CHECKLIST)', 'act:shortfilm:checklist')
      .row()
      .text('☁️ ไฟล์ใน Drive', 'act:shortfilm:drive')
      .text('📁 ไฟล์ใน Workspace', 'act:shortfilm:status')
      .row()
      .text('⬅️ กลับเมนูหลัก', 'menu:main');

    return {
      text: [
        '🎬 <b>Thai Shortfilm Studio (Real-News 3-Act)</b>',
        '• โครงสร้าง: <b>ข่าวจริง • สาเหตุ (S01–05) → หักมุม (S06–10) → แนวทางแก้ไข (S11–15)</b>',
        '• มาตรฐาน: <b>15 ฉาก × 10 วิ • 9:16 • 24fps</b> + แพ็กครบ 6 ไฟล์ขึ้น Drive อัตโนมัติ',
        '• Repo: <code>shc08032545/thai-shortfilm-studio</code>',
      ].join('\n'),
      reply_markup: kb,
    };
  }

  if (section === 'github') {
    const kb = new InlineKeyboard()
      .text('📦 Repo ของฉันทั้งหมด', 'act:github:my_repos')
      .row()
      .text('🔎 ค้นหา Repo วิเคราะห์หุ้น', 'act:github:stock_repos')
      .row()
      .text('🤖 Bridge Tests & Git', 'act:bridge:status')
      .text('🧪 Test Repo Status', 'act:test:status')
      .row()
      .text('⬅️ กลับเมนูหลัก', 'menu:main');

    return {
      text: [
        '🐙 <b>GitHub & Repositories</b>',
        '',
        'จัดการและค้นหาโปรเจกต์บน GitHub ผ่าน <code>gh</code> CLI:',
      ].join('\n'),
      reply_markup: kb,
    };
  }

  if (section === 'affiliate') {
    const kb = new InlineKeyboard()
      .text('🎬 เริ่มทำคลิปสินค้าใหม่ (ส่งรูป/ข้อมูล)', 'act:affiliate:start')
      .row()
      .text('☁️ ดูไฟล์ Output ใน Google Drive', 'act:affiliate:drive')
      .row()
      .text('📁 สถานะโปรเจกต์ใน Workspace', 'act:affiliate:status')
      .row()
      .text('⬅️ กลับเมนูหลัก', 'menu:main');

    return {
      text: [
        '🛍 <b>Motion Infographic Affiliate Studio (v2.9)</b>',
        '• Repo: <code>shc08032545/motion-infographic-affiliate</code>',
        '• Output Drive: <code>04_AI_โปรเจกต์และโน้ต / โปรเจกต์และเอกสาร_AI / motion-infographic-affiliate</code>',
        '',
        'ส่ง <b>รูปสินค้า + ชื่อ/จุดเด่น</b> มาในแชทนี้ได้เลย ระบบจะถามโหมด <b>YES VIDEO / NO VIDEO</b> แล้วสร้างชุดงาน Master Prompt 30 วิ (9:16) พร้อมอัปโหลดไฟล์ Output ลง Google Drive ให้อัตโนมัติ!',
      ].join('\n'),
      reply_markup: kb,
    };
  }

  if (section === 'hyperframes') {
    const kb = new InlineKeyboard()
      .text('🔎 ค้นหาข่าวร้อนวันนี้', 'act:hyperframes:find_news')
      .text('🤯 เรื่องที่คนไม่เคยรู้', 'act:hyperframes:untold_facts')
      .row()
      .text('🎬 สร้างตอนใหม่ 9:16 (v8.2 Adaptive)', 'act:hyperframes:new_vertical')
      .row()
      .text('🖥 สร้างตอนใหม่ 16:9 YouTube (v8.2)', 'act:hyperframes:new_landscape')
      .row()
      .text('🖼️ ฝังปก 9:16 + กล่อง Copy แคปชั่น', 'act:hyperframes:embed_cover')
      .row()
      .text('⚡ อัปเกรดคลิปเก่า → v8.2 Adaptive', 'act:hyperframes:upgrade_existing')
      .row()
      .text('📂 คลิปใน Workspace', 'act:hyperframes:list')
      .text('☁️ ไฟล์ใน Drive', 'act:hyperframes:drive')
      .row()
      .text('🧰 เช็ก Video Toolkit', 'act:hyperframes:toolkit')
      .text('⬅️ กลับเมนูหลัก', 'menu:main');

    return {
      text: [
        '🎞 <b>HyperFrames Studio v8.2 — Adaptive Storytelling + ภาพตัดแปะ 3 แกน</b>',
        '• เล่าเรื่องอัจฉริยะ: <b>เลือกสูตรเข้ากับเรื่องอัตโนมัติ</b> (Thriller / Bar-Talk / Loop 60 วิ • ตัดน้ำ เหลือ 2–3 เลขจำติดหัว)',
        '• จบคมไม่ซ้ำซาก: <b>แบน "คอมเมนต์บอกกันครับ"</b> สลับคลังตอนจบ 4 แบบ • กระชับ <b>1:00–1:35 นาที</b>',
        '• ภาพ 3 แกน: <b>Real + Callout 35–40% • ภาพตัดแปะ Collage 30–35% • กราฟ/แผนที่ 30%</b>',
        '• เสียงหลักประจำช่อง: <b>🔒 Google AI Studio TTS (Puck 1-Pass)</b> อ่านเลขไทย 100% + Pitch QA',
        '• ส่งมอบครบ: <b>MP4 30fps ฝังปก 9:16 คลีนๆ</b> + กล่อง Copy Title & 5 Hashtags + Drive',
        '',
        'แตะเลือก <b>🔎 ค้นหาข่าวร้อนวันนี้</b> หรือ <b>🤯 เรื่องที่คนไม่เคยรู้</b> หรือพิมพ์หัวข้อที่อยากทำได้เลยครับ:',
      ].join('\n'),
      reply_markup: kb,
    };
  }

  if (section === 'projects') {
    const kb = new InlineKeyboard()
      .text('🎞 HyperFrames v8.2', 'menu:hyperframes')
      .text('🎬 Shortfilm Studio', 'menu:shortfilm')
      .row()
      .text('🛍 Affiliate Studio', 'menu:affiliate')
      .text('📊 TradingAgents', 'menu:trading')
      .row()
      .text('🧰 Video Toolkit (4 หมวด)', 'act:hyperframes:toolkit')
      .text('🤖 Telegram Bridge', 'act:bridge:tree')
      .row()
      .text('🧪 Test Repo', 'act:test:status')
      .text('⬅️ กลับเมนูหลัก', 'menu:main');

    return {
      text: [
        '📁 <b>โปรเจกต์ใน Workspace (/home/antigravity)</b>',
        '• <code>hyperframes-studio</code> — สารคดี v8.2 Adaptive Storytelling (เสียง Puck • ภาพตัดแปะ 3 แกน • 1:00–1:35 นาที)',
        '• <code>video-toolkit</code> — Remotion, Motion Canvas, Revideo, Manim, MoviePy, Editly',
        '• <code>thai-shortfilm-studio</code> — หนังสั้น AI 15 ฉาก (สาเหตุ→หักมุม→แนวทางแก้ไข)',
        '• <code>motion-infographic-affiliate</code> — คลิปขายสินค้า Affiliate 30 วิ (Output → Drive)',
        '• <code>TradingAgents</code> — วิเคราะห์หุ้น Multi-Agent',
        '• <code>antigravity-telegram-bridge</code> — สะพาน Telegram Bot',
      ].join('\n'),
      reply_markup: kb,
    };
  }

  if (section === 'model') {
    return buildModelMenu();
  }

  if (section === 'system') {
    const state = loadModelState();
    const kb = new InlineKeyboard()
      .text('🧠 เลือก Model', 'menu:model')
      .text('🟢 เช็กสถานะ', 'sys:status')
      .row()
      .text('🏓 ทดสอบ Ping', 'sys:ping')
      .text('⬅️ กลับเมนูหลัก', 'menu:main');

    return {
      text: [
        '⚙️ <b>สถานะระบบ (Direct Relay — @lucariooobot)</b>',
        '',
        `• <b>Antigravity Tier:</b> <code>${state.relayTier}</code>`,
        `• <b>Gemini API Model:</b> <code>${state.geminiModel}</code>`,
        '• <b>โหมดรอรับข้อความ:</b> <b>Direct Relay เฉพาะ @lucariooobot</b> (พักอัตโนมัติเมื่อเงียบครบ 20 นาที)',
      ].join('\n'),
      reply_markup: kb,
    };
  }

  return null;
}

export function buildModelMenu(state: ModelSelectionState = loadModelState()): MenuScreen {
  const mark = (selected: boolean, label: string) =>
    selected ? `✅ ${label}` : label;

  const kb = new InlineKeyboard()
    .text(mark(state.relayTier === 'inherit', '⚡ Default'), 'model:relay:inherit')
    .text(mark(state.relayTier === 'pro', '🧠 Pro'), 'model:relay:pro')
    .row()
    .text(mark(state.relayTier === 'flash', '🚀 Flash'), 'model:relay:flash')
    .text(mark(state.relayTier === 'flash_lite', '🪶 Flash Lite'), 'model:relay:flash_lite')
    .row()
    .text(
      mark(state.geminiModel === 'gemini-3.8-flash', '✨ gemini-3.8-flash'),
      'model:gemini:gemini-3.8-flash',
    )
    .row()
    .text(
      mark(state.geminiModel === 'gemini-3.5-flash', '⚡ gemini-3.5-flash'),
      'model:gemini:gemini-3.5-flash',
    )
    .text(
      mark(state.geminiModel === 'gemini-3.5-flash-lite', '🪶 3.5-flash-lite'),
      'model:gemini:gemini-3.5-flash-lite',
    )
    .row()
    .text('⬅️ กลับเมนูหลัก', 'menu:main');

  return {
    text: [
      '🧠 <b>เลือก Model ที่ใช้งาน</b>',
      '',
      '<b>1) Antigravity Tier (โหมด Direct Relay — แถว 1–2):</b>',
      `• ปัจจุบัน: <code>${state.relayTier}</code>`,
      '  <i>(Default = โมเดลหลักของแชท, Pro/Flash/Flash Lite = เรียก subagent tier นั้นทำงานให้)</i>',
      '',
      '<b>2) Gemini API Model (Standby Daemon & TradingAgents — แถว 3–4):</b>',
      `• ปัจจุบัน: <code>${state.geminiModel}</code>`,
      '',
      'แตะปุ่มด้านล่างเพื่อเปลี่ยนได้ทันทีครับ:',
    ].join('\n'),
    reply_markup: kb,
  };
}

export function resolveActionPrompt(callbackData: string): string | null {
  if (callbackData.startsWith('act:trading:')) {
    const target = callbackData.slice('act:trading:'.length);
    if (target === 'list') {
      return 'แสดงรายการรายงานวิเคราะห์หุ้นทั้งหมดที่เคยรันไว้ใน /home/antigravity/TradingAgents/results พร้อมสรุปผลล่าสุด';
    }
    return `ใช้ TradingAgents วิเคราะห์หุ้น ${target} (ข้อมูลล่าสุด ภาษาไทย พร้อมแนบไฟล์ complete_report.html)`;
  }

  const map: Record<string, string> = {
    'act:affiliate:start':
      'พร้อมเริ่มโปรเจกต์ใหม่ด้วย skill motion-infographic-affiliate v2.9 (Output เก็บลง Google Drive โฟลเดอร์ 1DaX-ltIh5DHTt-qGrK3rRZxmdz-M5nXW) — แนะนำสั้นๆ ให้ผู้ใช้ส่งรูป/ข้อมูลสินค้าและเลือก YES VIDEO หรือ NO VIDEO',
    'act:affiliate:drive':
      'แสดงรายการไฟล์และโฟลเดอร์ Output ใน Google Drive โฟลเดอร์ motion-infographic-affiliate (ID: 1DaX-ltIh5DHTt-qGrK3rRZxmdz-M5nXW) พร้อมลิงก์เปิดดู',
    'act:affiliate:status':
      'ตรวจสอบไฟล์และสถานะ git ในโปรเจกต์ /home/antigravity/shc08032545/motion-infographic-affiliate',
    'act:shortfilm:new_idea':
      'ไอเดียเรื่องใหม่ (ใช้ skill thai-shortfilm-studio โครงสร้างข่าวจริง สาเหตุ → หักมุม → แนวทางแก้ไข)',
    'act:shortfilm:checklist':
      'แสดงสรุปรายการตอนทั้งหมดจาก /home/antigravity/shc08032545/thai-shortfilm-studio/EPISODE_CHECKLIST.md พร้อมสถานะการผลิตและลิงก์ Drive',
    'act:shortfilm:drive':
      'แสดงรายการโฟลเดอร์และไฟล์ทั้งหมดใน Google Drive โฟลเดอร์ thai-shortfilm-studio (ID: 1TZlFs9Xm-WFaql5vkyqUbdoEeTx5RwJj) พร้อมลิงก์เปิดดู',
    'act:shortfilm:status':
      'ตรวจสอบไฟล์และสถานะ git ในโปรเจกต์ /home/antigravity/shc08032545/thai-shortfilm-studio',
    'act:hyperframes:find_news':
      'ใช้สกิล hyperframes-studio v8.2 (Adaptive Storytelling • ล็อกเสียง Puck 1-Pass) ค้นหาข่าวร้อน/ประเด็นสืบสวนจริงในไทยวันนี้ (สิ่งแวดล้อม เศรษฐกิจ เทคโนโลยี หรือข่าวสังคมที่คนไทยกำลังพูดถึง) แล้วเสนอ 5 ไอเดียตอนใหม่พร้อมระบุสูตรเล่าเรื่องที่เหมาะกับแต่ละเรื่อง (Mystery Thriller / Bar-Talk / Seamless Loop), แนวตอนจบที่ไม่ซ้ำซาก, 2–3 ตัวเลขจำติดหัวแบบแปลงให้เห็นภาพ และไอเดียภาพตัดแปะ 3 แกน (1:00–1:35 นาที) เพื่อให้ผู้ใช้เลือกทำต่อ',
    'act:hyperframes:untold_facts':
      'ใช้สกิล hyperframes-studio v8.2 (Adaptive Storytelling • ล็อกเสียง Puck 1-Pass) ค้นหา "เรื่องจริงที่คนส่วนใหญ่ไม่เคยรู้" (ความลับเบื้องหลัง กลไกซ่อนเร้น ประวัติศาสตร์ที่ถูกลืม วิทยาศาสตร์ใกล้ตัว เศรษฐกิจ หรือเบื้องหลังสิ่งรอบตัวทั้งในไทยและโลกที่มีข้อมูลจริงรองรับ) แล้วเสนอ 5 ไอเดียตอนใหม่พร้อมระบุสูตรเล่าเรื่องที่เข้ากับเรื่อง (Bar-Talk / Mystery Thriller / Seamless Loop), แนวตอนจบคมๆ (ไม่ใช้ถามคอมเมนต์ซ้ำซาก), 2–3 ตัวเลขจำติดหัว และไอเดียภาพตัดแปะ 3 แกน (1:00–1:35 นาที) เพื่อให้ผู้ใช้เลือกทำต่อ',
    'act:hyperframes:new_vertical':
      'พร้อมสร้างตอนใหม่ด้วยสกิล hyperframes-studio v8.2 (9:16, 30fps, กระชับ 1:00–1:35 นาที, Adaptive Storytelling เลือกสูตรและตอนจบ 4 แบบให้เข้ากับเรื่องอัตโนมัติ ตัดรายละเอียดรก เหลือ 2–3 ตัวเลขจำติดหัว, Hybrid 3 แกน: Real+Callout 35–40% / ภาพตัดแปะ Paper Cutout Collage 30–35% / กราฟ-แผนที่ 30%, ล็อกเสียงหลัก Google AI Studio TTS Puck 1-Pass อ่านเลขไทย 100%, ฝังปก 9:16 คลีนๆ + กล่อง Copy Title & 5 Hashtags + Drive) — ถามผู้ใช้สั้นๆ ให้พิมพ์หัวข้อข่าวหรือเรื่องที่คนไม่เคยรู้ได้เลย',
    'act:hyperframes:new_landscape':
      'พร้อมสร้างตอนใหม่แนวนอน YouTube 16:9 ด้วยสกิล hyperframes-studio v8.2 (30fps, กระชับ 1:00–1:35 นาที, Adaptive Storytelling + Hybrid 3 แกน ภาพตัดแปะ Collage + Real + Motion Graphics, ล็อกเสียง Puck 1-Pass + ปก 16:9 คลีนๆ) — ถามผู้ใช้สั้นๆ ให้พิมพ์หัวข้อข่าวหรือเรื่องที่ต้องการเล่าได้เลย',
    'act:hyperframes:embed_cover':
      'แสดงรายการไฟล์ MP4 ล่าสุดใน /home/antigravity/shc08032545/hyperframes-studio และถามผู้ใช้ว่าต้องการให้สร้างปก 9:16 คลีนๆ ฝังลงคลิปไหน (attached_pic) พร้อมจัดทำกล่อง 1-Tap Copy (Title + 5 Hashtags)',
    'act:hyperframes:upgrade_existing':
      'แสดงรายการตอนทั้งหมดใน /home/antigravity/shc08032545/hyperframes-studio พร้อมเวอร์ชัน ความยาว และสถานะ เพื่อถามผู้ใช้ว่าต้องการอัปเกรดตอนไหนเป็นมาตรฐาน v8.2 (Adaptive Storytelling • ล็อกเสียง Puck • ภาพตัดแปะ 3 แกน • กระชับ 1:00–1:35 นาที)',
    'act:hyperframes:list':
      'แสดงรายการโปรเจกต์และไฟล์วิดีโอ MP4 ทั้งหมดใน /home/antigravity/shc08032545/hyperframes-studio พร้อมความยาว ขนาดไฟล์ และสถานะล่าสุด',
    'act:hyperframes:drive':
      'แสดงรายการไฟล์วิดีโอ MP4 และรูปปกล่าสุดใน Google Drive โฟลเดอร์ hyperframes-studio (ID: 1d9Vucj7nlQ0Dygxd8pAWHqkcgRCPSEBz) พร้อมลิงก์เปิดดู',
    'act:hyperframes:toolkit':
      'สรุปเครื่องมือ Video Production Toolkit ทั้ง 4 หมวดที่ติดตั้งไว้ใน /home/antigravity/video-toolkit/README.md พร้อมสถานะพื้นที่ดิสก์คงเหลือ',
    'act:bridge:status':
      'ตรวจสอบ git status และรัน npm test ในโปรเจกต์ /home/antigravity/shc08032545/antigravity-telegram-bridge',
    'act:bridge:tree':
      'สรุปโครงสร้างไฟล์ของโปรเจกต์ /home/antigravity/shc08032545/antigravity-telegram-bridge',
    'act:test:status':
      'ตรวจสอบไฟล์และสถานะ git ในโปรเจกต์ /home/antigravity/shc08032545/test',
    'act:github:my_repos': 'แสดงรายการ GitHub repositories ทั้งหมดของฉันพร้อมลิงก์และอัปเดตล่าสุด',
    'act:github:stock_repos': 'ค้นหา repo ใน GitHub การวิเคราะห์หุ้น',
    'act:gdrive:status': 'สถานะ Google drive',
    'act:gdrive:recent': 'แสดงไฟล์ที่อัปเดตล่าสุด 10 รายการใน Google Drive',
    'act:news:us': 'ข่าวหุ้นอเมริกาวันนี้',
    'act:news:th': 'ข่าวไทยวันนี้',
    'act:news:nvda': 'ข่าว nvda ล่าสุด',
    'act:news:gold': 'ราคาทองคำไทยและทองคำโลกวันนี้ล่าสุด',
  };

  return map[callbackData] ?? null;
}
