import { InlineKeyboard } from 'grammy';

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
  { command: 'affiliate', description: '🛍 ทำคลิป Affiliate 30 วิ (เก็บลง Drive)' },
  { command: 'analyze', description: '📊 วิเคราะห์หุ้น (เช่น /analyze NVDA)' },
  { command: 'news', description: '📰 ข่าวหุ้นอเมริกา & ข่าวไทยวันนี้' },
  { command: 'drive', description: '☁️ เช็กสถานะและไฟล์ Google Drive' },
  { command: 'shortfilm', description: '🎬 โปรดิวเซอร์หนังสั้น AI 15 ฉาก' },
  { command: 'projects', description: '📁 จัดการโปรเจกต์ใน Workspace' },
  { command: 'status', description: '🟢 เช็กสถานะระบบและโหมดปัจจุบัน' },
  { command: 'new', description: '✨ ล้างความจำเริ่มคุยใหม่' },
  { command: 'stop_relay', description: '🔄 สลับเข้าโหมด Standby อัตโนมัติ' },
];

export function buildMainMenu(): MenuScreen {
  const kb = new InlineKeyboard()
    .text('🛍 Affiliate Studio (30 วิ → Drive)', 'menu:affiliate')
    .row()
    .text('📊 วิเคราะห์หุ้น (TradingAgents)', 'menu:trading')
    .row()
    .text('📰 ข่าว & ตลาดวันนี้', 'menu:news')
    .text('☁️ Google Drive', 'menu:gdrive')
    .row()
    .text('🎬 หนังสั้น AI Studio', 'menu:shortfilm')
    .text('🐙 GitHub & Repos', 'menu:github')
    .row()
    .text('📁 โปรเจกต์ใน Workspace', 'menu:projects')
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
      .text('💡 ไอเดียเรื่องใหม่ (15 ฉาก)', 'act:shortfilm:new_idea')
      .row()
      .text('📁 เช็กไฟล์ในโปรเจกต์', 'act:shortfilm:status')
      .row()
      .text('⬅️ กลับเมนูหลัก', 'menu:main');

    return {
      text: [
        '🎬 <b>Thai Shortfilm Studio</b>',
        '<code>/home/antigravity/shc08032545/thai-shortfilm-studio</code>',
        '',
        'โปรดิวเซอร์หนังสั้น AI ภาษาไทย 15 ฉาก × 10 วิ (9:16, TikTok/Reels/Shorts)',
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

  if (section === 'projects') {
    const kb = new InlineKeyboard()
      .text('🛍 Affiliate Studio', 'menu:affiliate')
      .text('📊 TradingAgents', 'menu:trading')
      .row()
      .text('🎬 Shortfilm Studio', 'menu:shortfilm')
      .text('🤖 Telegram Bridge', 'act:bridge:tree')
      .row()
      .text('🧪 Test Repo', 'act:test:status')
      .row()
      .text('⬅️ กลับเมนูหลัก', 'menu:main');

    return {
      text: [
        '📁 <b>โปรเจกต์ใน Workspace (/home/antigravity)</b>',
        '• <code>motion-infographic-affiliate</code> — คลิปขายสินค้า Affiliate 30 วิ (Output → Drive)',
        '• <code>TradingAgents</code> — วิเคราะห์หุ้น Multi-Agent',
        '• <code>thai-shortfilm-studio</code> — โปรดิวเซอร์หนังสั้น AI',
        '• <code>antigravity-telegram-bridge</code> — สะพาน Telegram Bot',
        '• <code>test</code> — โปรเจกต์ทดสอบ',
      ].join('\n'),
      reply_markup: kb,
    };
  }

  if (section === 'system') {
    const kb = new InlineKeyboard()
      .text('🟢 เช็กสถานะระบบ', 'sys:status')
      .text('🏓 ทดสอบ Ping', 'sys:ping')
      .row()
      .text('🔄 สลับเข้าโหมด Standby Daemon', 'sys:standby')
      .row()
      .text('⬅️ กลับเมนูหลัก', 'menu:main');

    return {
      text: [
        '⚙️ <b>สถานะระบบ & โหมดการทำงาน (Hybrid)</b>',
        '',
        '• <b>Direct Relay:</b> ใช้สมอง Antigravity ในแชทนี้โดยตรง',
        '• <b>Standby Daemon:</b> ออนไลน์ 24/7 ด้วย Gemini API + เครื่องมือครบชุด',
      ].join('\n'),
      reply_markup: kb,
    };
  }

  return null;
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
    'act:shortfilm:new_idea': 'ไอเดียเรื่องใหม่ (ใช้ skill thai-shortfilm-studio)',
    'act:shortfilm:status':
      'ตรวจสอบไฟล์และสถานะ git ในโปรเจกต์ /home/antigravity/shc08032545/thai-shortfilm-studio',
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
