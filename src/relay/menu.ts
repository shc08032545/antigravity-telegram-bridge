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
  { command: 'hyperframes', description: '🎞 สารคดี v8.3 (Adaptive • เสียง Puck • 3 แกน)' },
  { command: 'quota', description: '🔋 เช็ก Quota API เสียง & Antigravity' },
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
    .text('🎞 HyperFrames v8.3 (Adaptive • เสียง Puck)', 'menu:hyperframes')
    .row()
    .text('🔋 เช็ก Quota API เสียง & Antigravity', 'menu:quota')
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
      .row()
      .text('🇹🇭 เรื่องลับไทยที่ยังไม่มีช่องไหนทำ', 'act:hyperframes:untold_facts')
      .row()
      .text('🎬 สร้างตอนใหม่ 9:16 (v9.0 Pro)', 'act:hyperframes:new_vertical')
      .row()
      .text('🖥 สร้างตอนใหม่ 16:9 YouTube (v9.0)', 'act:hyperframes:new_landscape')
      .row()
      .text('🖼️ ทำปก A/B 3:4 Safe Zone + Copy', 'act:hyperframes:embed_cover')
      .text('📑 แตกสไลด์ Carousel 5 แผ่น', 'act:hyperframes:carousel')
      .row()
      .text('⚡ อัปเกรดคลิปเก่า → v9.0 Pro', 'act:hyperframes:upgrade_existing')
      .text('📊 สถิติ EP Tracker', 'act:hyperframes:tracker')
      .row()
      .text('📂 คลิปใน Workspace', 'act:hyperframes:list')
      .text('☁️ ไฟล์ใน Drive', 'act:hyperframes:drive')
      .row()
      .text('🔋 เช็กโควตา API เสียง', 'act:quota:google_ai_studio')
      .text('🧰 เช็ก Video Toolkit', 'act:hyperframes:toolkit')
      .row()
      .text('⬅️ กลับเมนูหลัก', 'menu:main');

    return {
      text: [
        '🎞 <b>HyperFrames Studio v9.0 — Pro Documentary Engine</b>',
        '• เสียงสตูดิโอ: <b>🔒 Gemini 3.8 Flash TTS (Puck • 106Hz)</b> + Warm SM7B EQ + <b>Sidechain BGM 4 มู้ด</b> + คลัง Foley SFX + <b>-14 LUFS</b>',
        '• ภาพระดับ Vox: <b>แผนที่ไทย Esri จริง</b> + <b>Editorial Article Highlight</b> + 16mm Grain + <b>ภาพตัดแปะ 3 แกน</b> + ป้ายที่มา',
        '• ระบบผลิตไว: <b>7 Scene Templates + Auto-QA Gate</b> + ปก A/B (3:4 Safe Zone) + ซับ TikTok (410px)',
        '• ครบทุกช่องทาง: <b>MP4 30fps + ปก 9:16 + 5-Slide Carousel + Episode Analytics Tracker</b>',
        '',
        'แตะเลือกเมนูด้านล่าง หรือพิมพ์หัวข้อที่อยากสร้างได้เลยครับ:',
      ].join('\n'),
      reply_markup: kb,
    };
  }

  if (section === 'quota') {
    const kb = new InlineKeyboard()
      .text('🎙️ เช็ก API Google AI Studio (เจนเสียงได้ไหม?)', 'act:quota:google_ai_studio')
      .row()
      .text('🌐 เช็ก Quota หน้าเว็บ Antigravity & VM', 'act:quota:antigravity_web')
      .row()
      .text('⚡ เช็กทั้งหมดพร้อมกัน', 'act:quota:all')
      .row()
      .text('⬅️ กลับเมนูหลัก', 'menu:main');

    return {
      text: [
        '🔋 <b>เช็กโควตา API & Antigravity</b>',
        '',
        '• <b>🎙️ Google AI Studio API:</b> ทดสอบยิงจริงแบบเบาที่สุดเพื่อตรวจว่า <b>Gemini 3.8 Flash TTS (Puck หลัก/Lite)</b> และ <b>Gemini Flash</b> ยังใช้งานได้หรือไม่ + นับรอบวันนี้ + ลิงก์กราฟ Usage จริง',
        '• <b>🌐 Antigravity Web & VM:</b> ตรวจสถานะโมเดลที่เลือก, โควตาเครื่องมือในแชท, พื้นที่ดิสก์/RAM และลิงก์เช็กแถบ Quota บนหน้าเว็บ Antigravity',
        '',
        'แตะเลือกหัวข้อที่ต้องการตรวจสอบได้เลยครับ:',
      ].join('\n'),
      reply_markup: kb,
    };
  }

  if (section === 'projects') {
    const kb = new InlineKeyboard()
      .text('🎞 HyperFrames v8.3', 'menu:hyperframes')
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
        '• <code>hyperframes-studio</code> — สารคดี v8.3 Adaptive Storytelling (เสียง Puck • ภาพตัดแปะ 3 แกน • จบคำถามปลายเปิด)',
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
      .text('🔋 เช็ก Quota API & Antigravity', 'menu:quota')
      .row()
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
      'ใช้สกิล hyperframes-studio v9.0 Pro Engine (Adaptive Storytelling • ล็อกเสียง Gemini 3.8 Flash TTS Puck + Broadcast Mastering -14 LUFS) ค้นหาข่าวร้อน/ประเด็นสืบสวนจริงในไทยวันนี้ แล้วเสนอ 5 ไอเดียตอนใหม่พร้อมสูตรเล่าเรื่อง, มู้ด BGM (mystery/bartalk/tension/reveal), คำถามปลายเปิดปิดท้าย, 2–3 ตัวเลขจำติดหัว และไอเดียภาพ 3 แกน (1:00–1:35 นาที) เพื่อให้ผู้ใช้เลือกทำต่อ',
    'act:hyperframes:untold_facts':
      'ใช้สกิล hyperframes-studio v9.0 Pro Engine (Adaptive Storytelling • ล็อกเสียง Gemini 3.8 Flash TTS Puck + Broadcast Mastering -14 LUFS) ค้นหา "เรื่องจริงที่คนไทยส่วนใหญ่ไม่เคยรู้ในประเทศไทย และยังไม่มีช่อง YouTube / TikTok / สารคดีไทยช่องไหนทำ" พร้อมเช็กเว็บ/YouTube คัดเรื่องซ้ำออก แล้วเสนอ 5 ไอเดียตอนใหม่พร้อมเหตุผลว่าทำไมยังไม่มีช่องไหนทำ, สูตรเล่าเรื่อง, มู้ด BGM, คำถามปลายเปิดชวนคอมเมนต์, 2–3 ตัวเลขจำติดหัวจากแหล่งจริง และไอเดียภาพ 3 แกน + แผนที่ Esri จริง (1:00–1:35 นาที) เพื่อให้ผู้ใช้เลือกทำต่อ',
    'act:hyperframes:new_vertical':
      'พร้อมสร้างตอนใหม่ด้วยสกิล hyperframes-studio v9.0 Pro Engine (9:16, 30fps, 1:00–1:35 นาที, ครบ 6 ระบบใน v9_engine/: Gemini 3.8 Flash TTS Puck 106Hz + SM7B EQ + Sidechain BGM 4 มู้ด + คลัง Foley SFX + -14 LUFS, แผนที่ไทย Esri จริง + Editorial Article Highlight + 16mm Grain + ภาพตัดแปะ 3 แกน + ป้ายที่มา, 7 Scene Templates + Auto-QA Gate, ปก A/B 3:4 Safe Zone + ซับ TikTok 410px + 5-Slide Carousel + Episode Tracker) — ถามผู้ใช้สั้นๆ ให้พิมพ์หัวข้อข่าวหรือเรื่องที่คนไม่เคยรู้ได้เลย',
    'act:hyperframes:new_landscape':
      'พร้อมสร้างตอนใหม่แนวนอน YouTube 16:9 ด้วยสกิล hyperframes-studio v9.0 Pro Engine (30fps, 1:00–1:35 นาที, Broadcast Audio -14 LUFS, แผนที่ Esri จริง + Editorial Highlight + ภาพตัดแปะ 3 แกน + คำถามปลายเปิดปิดท้าย) — ถามผู้ใช้สั้นๆ ให้พิมพ์หัวข้อข่าวหรือเรื่องที่ต้องการเล่าได้เลย',
    'act:hyperframes:embed_cover':
      'แสดงรายการไฟล์ MP4 ล่าสุดใน /home/antigravity/shc08032545/hyperframes-studio และถามผู้ใช้ว่าต้องการให้ใช้ v9_engine/hook_cover_lab.py สร้างปก A/B 9:16 (พร้อมตรวจกรอบ 3:4 Safe Zone) ฝังลงคลิปไหน + กล่อง 1-Tap Copy (Title + 5 Hashtags)',
    'act:hyperframes:carousel':
      'แสดงรายการตอนที่มีใน /home/antigravity/shc08032545/hyperframes-studio และถามผู้ใช้ว่าต้องการให้ใช้ v9_engine/carousel_gen.py แตกตอนไหนเป็นภาพ Editorial Carousel 5 สไลด์ (4:5 สำหรับ TikTok Photo / IG / FB) พร้อมส่งเข้า Telegram และ Google Drive',
    'act:hyperframes:upgrade_existing':
      'แสดงรายการตอนทั้งหมดใน /home/antigravity/shc08032545/hyperframes-studio พร้อมเวอร์ชัน ความยาว และสถานะ เพื่อถามผู้ใช้ว่าต้องการอัปเกรดตอนไหนเป็นมาตรฐาน v9.0 Pro Engine (Broadcast Audio -14 LUFS + คลัง SFX/BGM 4 มู้ด + แผนที่ Esri จริง + Editorial Highlight + ปก A/B)',
    'act:hyperframes:tracker':
      'รัน python3 /home/antigravity/shc08032545/hyperframes-studio/v9_engine/episode_tracker.py summary แล้วสรุปตารางสถิติ EP.01 ถึงตอนล่าสุด (จำนวนตอน แยกตามสูตรเล่าเรื่อง ความยาวเฉลี่ย ยอดวิว/คอมเมนต์ที่มี) พร้อมบอกวิธีพิมพ์อัปเดตยอดวิวจริงของแต่ละตอนเพื่อวิเคราะห์สูตรที่ปังที่สุด',
    'act:hyperframes:list':
      'แสดงรายการโปรเจกต์และไฟล์วิดีโอ MP4 ทั้งหมดใน /home/antigravity/shc08032545/hyperframes-studio พร้อมความยาว ขนาดไฟล์ และสถานะล่าสุด',
    'act:hyperframes:drive':
      'แสดงรายการไฟล์วิดีโอ MP4 และรูปปกล่าสุดใน Google Drive โฟลเดอร์ hyperframes-studio (ID: 1d9Vucj7nlQ0Dygxd8pAWHqkcgRCPSEBz) พร้อมลิงก์เปิดดู',
    'act:hyperframes:toolkit':
      'สรุปเครื่องมือ Video Production Toolkit ทั้ง 4 หมวดที่ติดตั้งไว้ใน /home/antigravity/video-toolkit/README.md และระบบ v9_engine/ พร้อมสถานะพื้นที่ดิสก์คงเหลือ',
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
    'act:quota:google_ai_studio':
      'รันคำสั่ง python3 /home/antigravity/shc08032545/antigravity-telegram-bridge/scripts/check_quota.py --google แล้วสรุปผลแบบกระชับชัดเจนเป็นภาษาไทย (ห้ามพิมพ์ API Key เด็ดขาด!) ว่า Google AI Studio Gemini 3.8 Flash TTS (gemini-3.8-flash-tts หลัก • Puck / gemini-3.8-flash-lite-tts สำรอง) และ Gemini 2.5 Flash ยังเจนเสียง/ใช้งานได้อีกไหม วันนี้เจนไปแล้วกี่รอบ พร้อมแนบลิงก์ https://aistudio.google.com/usage ให้ผู้ใช้ดูกราฟโควตาจริง',
    'act:quota:antigravity_web':
      'รันคำสั่ง python3 /home/antigravity/shc08032545/antigravity-telegram-bridge/scripts/check_quota.py --antigravity แล้วสรุปสถานะโมเดลที่เลือก พื้นที่ดิสก์/RAM ของ VM โควตาเครื่องมือในแชท (เช่น generate_image) และอธิบายตรงไปตรงมาว่าแถบ Quota บัญชีบนหน้าเว็บ Antigravity ต้องดูโดยตรงในหน้าเว็บของเบราว์เซอร์ผู้ใช้ (VM ไม่สามารถดึง session หน้าเว็บผู้ใช้ได้)',
    'act:quota:all':
      'รันคำสั่ง python3 /home/antigravity/shc08032545/antigravity-telegram-bridge/scripts/check_quota.py --all แล้วสรุปทั้งผลตรวจ Google AI Studio API (Gemini 3.8 Flash TTS เจนเสียง Puck ได้ไหม/วันนี้ใช้ไปกี่รอบ + ลิงก์ aistudio.google.com/usage) และสถานะ Antigravity/VM แบบครบถ้วนกระชับเป็นภาษาไทย (ห้ามพิมพ์ API Key เด็ดขาด!)',
    'act:news:us': 'ข่าวหุ้นอเมริกาวันนี้',
    'act:news:th': 'ข่าวไทยวันนี้',
    'act:news:nvda': 'ข่าว nvda ล่าสุด',
    'act:news:gold': 'ราคาทองคำไทยและทองคำโลกวันนี้ล่าสุด',
  };

  return map[callbackData] ?? null;
}
