import { InlineKeyboard } from 'grammy';

export interface MenuScreen {
  text: string;
  reply_markup: InlineKeyboard;
}

export function buildMainMenu(): MenuScreen {
  const kb = new InlineKeyboard()
    .text('📊 TradingAgents (วิเคราะห์หุ้น)', 'menu:trading')
    .row()
    .text('🎬 Thai Shortfilm Studio', 'menu:shortfilm')
    .row()
    .text('🤖 Telegram Bridge', 'menu:bridge')
    .text('🧪 Test Repo', 'menu:test')
    .row()
    .text('☁️ Google Drive', 'menu:gdrive')
    .text('📰 ข่าว & ตลาดวันนี้', 'menu:news');

  return {
    text: [
      '🏠 <b>Antigravity — เมนูหลักเลือกใช้งาน Project</b>',
      '',
      'เลือกโปรเจกต์หรือเครื่องมือที่ต้องการใช้งานจากปุ่มด้านล่างได้เลยครับ:',
      '<i>(หรือพิมพ์คำสั่ง / ส่งรูป / ส่งไฟล์มาโดยตรงได้ตลอดเวลา)</i>',
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
      .text('🚀 วิเคราะห์ NVDA', 'act:trading:NVDA')
      .text('🍎 วิเคราะห์ AAPL', 'act:trading:AAPL')
      .row()
      .text('⚡ วิเคราะห์ TSLA', 'act:trading:TSLA')
      .text('🇹🇭 วิเคราะห์ PTT.BK', 'act:trading:PTT.BK')
      .row()
      .text('₿ วิเคราะห์ BTC-USD', 'act:trading:BTC-USD')
      .text('📂 ดูรายงานล่าสุด', 'act:trading:list')
      .row()
      .text('⬅️ กลับเมนูหลัก', 'menu:main');

    return {
      text: [
        '📊 <b>Project: TradingAgents (Multi-Agent วิเคราะห์หุ้น)</b>',
        'เส้นทาง: <code>/home/antigravity/TradingAgents</code>',
        '',
        'เลือกหุ้นเพื่อเริ่มวิเคราะห์ทันที (ได้สรุปภาษาไทย + ไฟล์รายงาน HTML) หรือพิมพ์ชื่อหุ้นอื่นๆ ส่งมาได้เลยครับ:',
      ].join('\n'),
      reply_markup: kb,
    };
  }

  if (section === 'shortfilm') {
    const kb = new InlineKeyboard()
      .text('💡 ไอเดียเรื่องใหม่ (หนังสั้น 15 ฉาก)', 'act:shortfilm:new_idea')
      .row()
      .text('📁 เช็กไฟล์ในโปรเจกต์', 'act:shortfilm:status')
      .row()
      .text('⬅️ กลับเมนูหลัก', 'menu:main');

    return {
      text: [
        '🎬 <b>Project: Thai Shortfilm Studio</b>',
        'เส้นทาง: <code>/home/antigravity/shc08032545/thai-shortfilm-studio</code>',
        '',
        'โปรดิวเซอร์หนังสั้น AI ภาษาไทย 15 ฉาก (9:16, 24fps, TikTok/Reels/Shorts)',
      ].join('\n'),
      reply_markup: kb,
    };
  }

  if (section === 'bridge') {
    const kb = new InlineKeyboard()
      .text('🧪 รัน Test & เช็ก Git Status', 'act:bridge:status')
      .row()
      .text('📁 ดูโครงสร้างโปรเจกต์', 'act:bridge:tree')
      .row()
      .text('⬅️ กลับเมนูหลัก', 'menu:main');

    return {
      text: [
        '🤖 <b>Project: Antigravity Telegram Bridge</b>',
        'เส้นทาง: <code>/home/antigravity/shc08032545/antigravity-telegram-bridge</code>',
        '',
        'รองรับทั้ง Chrome CDP Bridge, Direct Relay และ Always-Online Daemon',
      ].join('\n'),
      reply_markup: kb,
    };
  }

  if (section === 'test') {
    const kb = new InlineKeyboard()
      .text('📁 ดูไฟล์ & สถานะ Git ใน test', 'act:test:status')
      .row()
      .text('⬅️ กลับเมนูหลัก', 'menu:main');

    return {
      text: [
        '🧪 <b>Project: shc08032545/test</b>',
        'เส้นทาง: <code>/home/antigravity/shc08032545/test</code>',
        '',
        'เลือกคำสั่งหรือพิมพ์งานที่ต้องการให้สร้างใน repo <code>test</code> ได้เลยครับ',
      ].join('\n'),
      reply_markup: kb,
    };
  }

  if (section === 'gdrive') {
    const kb = new InlineKeyboard()
      .text('📊 สถานะ & พื้นที่ Google Drive', 'act:gdrive:status')
      .row()
      .text('🕒 ดูไฟล์ล่าสุด 10 รายการ', 'act:gdrive:recent')
      .row()
      .text('⬅️ กลับเมนูหลัก', 'menu:main');

    return {
      text: [
        '☁️ <b>Google Drive (Connected)</b>',
        '',
        'เลือกดูสถานะ ไฟล์ล่าสุด หรือพิมพ์บอกชื่อไฟล์ที่ต้องการค้นหาได้เลยครับ:',
      ].join('\n'),
      reply_markup: kb,
    };
  }

  if (section === 'news') {
    const kb = new InlineKeyboard()
      .text('🇺🇸 ข่าวหุ้นอเมริกาวันนี้', 'act:news:us')
      .text('🇹🇭 ข่าวไทยวันนี้', 'act:news:th')
      .row()
      .text('🚀 ข่าว NVDA ล่าสุด', 'act:news:nvda')
      .row()
      .text('⬅️ กลับเมนูหลัก', 'menu:main');

    return {
      text: [
        '📰 <b>ข่าว & ตลาดวันนี้ (Real-time Search)</b>',
        '',
        'เลือกหัวข้อข่าวที่ต้องการอัปเดตล่าสุดได้เลยครับ:',
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
    'act:shortfilm:new_idea': 'ไอเดียเรื่องใหม่ (ใช้ skill thai-shortfilm-studio)',
    'act:shortfilm:status':
      'ตรวจสอบไฟล์และสถานะ git ในโปรเจกต์ /home/antigravity/shc08032545/thai-shortfilm-studio',
    'act:bridge:status':
      'ตรวจสอบ git status และรัน npm test ในโปรเจกต์ /home/antigravity/shc08032545/antigravity-telegram-bridge',
    'act:bridge:tree':
      'สรุปโครงสร้างไฟล์ของโปรเจกต์ /home/antigravity/shc08032545/antigravity-telegram-bridge',
    'act:test:status':
      'ตรวจสอบไฟล์และสถานะ git ในโปรเจกต์ /home/antigravity/shc08032545/test',
    'act:gdrive:status': 'สถานะ Google drive',
    'act:gdrive:recent': 'แสดงไฟล์ที่อัปเดตล่าสุด 10 รายการใน Google Drive',
    'act:news:us': 'ข่าวหุ้นอเมริกาวันนี้',
    'act:news:th': 'ข่าวไทยวันนี้',
    'act:news:nvda': 'ข่าว nvda ล่าสุด',
  };

  return map[callbackData] ?? null;
}
