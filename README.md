# Antigravity Web ↔ Telegram Bot Bridge

สะพานเชื่อมต่อระหว่าง **Telegram Bot** กับ **Antigravity Web** โดยใช้ **Node.js + TypeScript + Playwright (`playwright-core`) ผ่าน Chrome DevTools Protocol (CDP)**

ช่วยให้คุณแชท สั่งงาน ส่งรูปภาพ/ไฟล์แนบ และควบคุมแท็บ Antigravity Web จาก Telegram บนมือถือหรือเดสก์ท็อปได้แบบ 2 ทาง โดยใช้ Session ที่ล็อกอินไว้ใน Chrome ของคุณเอง

---

## ฟีเจอร์หลัก

- **แชท 2 ทางแบบสตรีม (Two-Way Streaming Chat)**: ส่งข้อความจาก Telegram → พิมพ์และส่งเข้า Antigravity Web → อัปเดตความคืบหน้าแบบสดและส่งคำตอบฉบับสมบูรณ์กลับมา
- **จัดคิวคำสั่งอัตโนมัติ (Sequential Queue)**: ป้องกันข้อความหลายอันทับซ้อนกันบนแท็บเบราว์เซอร์เดียวกัน
- **จำกัดสิทธิ์ความปลอดภัย (Fail-Closed Whitelist)**: อนุญาตเฉพาะ `ALLOWED_USER_IDS` หรือ `ALLOWED_CHAT_IDS` ที่กำหนดไว้เท่านั้น พร้อมคำสั่ง `/whoami` สำหรับดู ID ของตัวเอง
- **รองรับรูปภาพและไฟล์แนบ**: ส่งรูป (Photo) หรือไฟล์ (Document) พร้อม Caption จาก Telegram เข้าไปยัง Antigravity Web อัตโนมัติ (รองรับทั้ง `<input type="file">`, `filechooser`, และ synthetic paste fallback)
- **แบ่งข้อความยาวอัตโนมัติ + จัดฟอร์แมตโค้ด**: แปลง Markdown (รวมโค้ดบล็อก ```` ```lang ````) เป็น Telegram HTML และแบ่งข้อความไม่ให้เกินลิมิต 4,096 ตัวอักษร โดยปิด/เปิดโค้ดบล็อกข้ามข้อความอย่างถูกต้อง
- **คำสั่งควบคุมครบครัน**: `/status`, `/tabs`, `/tab`, `/new`, `/stop`, `/screenshot`, `/inspect`, `/ping`, `/whoami`
- **ปรับแต่ง DOM Selectors ได้ง่าย**: ไม่ต้องแก้โค้ด TypeScript แค่แก้ไขไฟล์ `selectors.json` (ใช้ `/inspect` ช่วยดู selector จริงบนหน้าเว็บได้เลย)

---

## สถาปัตยกรรมการทำงาน

```
Telegram App (มือถือ/คอม)
        │  (Long Polling via grammY)
        ▼
antigravity-telegram-bridge (Node.js + TypeScript)
        │  (Playwright connectOverCDP -> http://127.0.0.1:9222)
        ▼
Google Chrome (Remote Debugging Mode)
        └── แท็บ Antigravity Web (ล็อกอินด้วยบัญชีของคุณเอง)
```

---

## การติดตั้งและเริ่มต้นใช้งาน

### ข้อกำหนดเบื้องต้น
- **Node.js 20+**
- **Google Chrome** หรือ Chromium
- **Telegram Bot Token** จาก [@BotFather](https://t.me/BotFather)

### ขั้นตอนที่ 1: โคลนโปรเจกต์และติดตั้งแพ็กเกจ

```bash
git clone https://github.com/shc08032545/antigravity-telegram-bridge.git
cd antigravity-telegram-bridge
npm install
```

### ขั้นตอนที่ 2: สร้างไฟล์ `.env`

```bash
cp .env.example .env
```

แก้ไขไฟล์ `.env` และใส่ `TELEGRAM_BOT_TOKEN` ของคุณ:

```env
TELEGRAM_BOT_TOKEN=123456789:YOUR_BOT_TOKEN_HERE
ALLOWED_USER_IDS=123456789
CHROME_CDP_URL=http://127.0.0.1:9222
ANTIGRAVITY_URL_MATCH=antigravity
```

> **ยังไม่รู้ Telegram User ID ของตัวเอง?**
> ปล่อย `ALLOWED_USER_IDS=` ว่างไว้ก่อน แล้วรันบอต จากนั้นส่ง `/whoami` ให้บอตใน Telegram บอตจะตอบ User ID ของคุณกลับมา แล้วค่อยนำไปใส่ใน `.env` และรีสตาร์ตบอต

### ขั้นตอนที่ 3: เปิด Chrome ในโหมด Remote Debugging (CDP)

> **สำคัญ (Chrome 136+)**: Chrome เวอร์ชันใหม่ไม่อนุญาตให้เปิด `--remote-debugging-port` กับโปรไฟล์หลักโดยตรง จึงต้องระบุ `--user-data-dir` แยกต่างหาก (สคริปต์ด้านล่างจัดการให้แล้ว และจำการล็อกอินไว้ในโปรไฟล์แยกนั้นได้ตลอด)

- **macOS / Linux:**
  ```bash
  chmod +x scripts/launch-chrome.sh
  ./scripts/launch-chrome.sh
  ```
- **Windows (PowerShell):**
  ```powershell
  .\scripts\launch-chrome.ps1
  ```

จากนั้นในหน้าต่าง Chrome ที่เปิดขึ้นมา ให้เปิดเว็บ **Antigravity Web** และล็อกอินให้เรียบร้อย

ตรวจสอบว่า CDP พร้อมใช้งานโดยเปิด `http://127.0.0.1:9222/json/version` ในเบราว์เซอร์ (ควรเห็นข้อมูล JSON)

### ขั้นตอนที่ 4: รัน Bridge Bot

```bash
# โหมดพัฒนา (auto-reload)
npm run dev

# หรือรันตรงๆ
npm start

# หรือคอมไพล์เป็น JS สำหรับใช้งานจริง
npm run build
npm run start:prod
```

---

## คำสั่งใน Telegram Bot

| คำสั่ง | คำอธิบาย |
| --- | --- |
| *(ส่งข้อความปกติ)* | ส่ง prompt ไปยัง Antigravity Web และรับคำตอบกลับ |
| *(ส่งรูปภาพ / ไฟล์แนบ)* | อัปโหลดไฟล์เข้า Antigravity Web พร้อมส่ง caption เป็น prompt |
| `/status` | ดูสถานะการเชื่อมต่อ Chrome CDP, แท็บที่ผูกอยู่, selector ที่จับได้ และคิวงาน |
| `/tabs` | แสดงรายการแท็บทั้งหมดที่เปิดอยู่ใน Chrome |
| `/tab <เลข>` | สลับแท็บที่เชื่อมต่อ เช่น `/tab 2` |
| `/new` | เริ่มบทสนทนาใหม่บน Antigravity Web |
| `/stop` | หยุดการสร้างคำตอบที่กำลังทำงานอยู่ |
| `/screenshot` | ถ่ายภาพหน้าจอแท็บ Antigravity Web ส่งมาให้ดูใน Telegram |
| `/inspect` | สแกน DOM elements บนหน้าเว็บเพื่อนำมาตั้งค่าใน `selectors.json` |
| `/ping` | ทดสอบความเร็วตอบสนองของบอต |
| `/whoami` | แสดง Telegram User ID และ Chat ID ของคุณ |
| `/help` | แสดงรายการคำสั่งทั้งหมด |

---

## การปรับแต่ง DOM Selectors (`selectors.json`)

หากหน้าเว็บ Antigravity Web มีการอัปเดต UI หรือบอตจับกล่องข้อความ/คำตอบไม่ตรง:

1. ส่งคำสั่ง `/inspect` ใน Telegram เพื่อดูรายการ `inputs`, `buttons`, `fileInputs` และ `messageCandidates` ที่พบบนหน้าเว็บจริง
2. คัดลอกไฟล์ตัวอย่าง:
   ```bash
   cp selectors.example.json selectors.json
   ```
3. ใส่ CSS selector ที่ตรงกับหน้าเว็บลงใน `selectors.json` แล้วรีสตาร์ตบอต

---

## การทดสอบและตรวจสอบโค้ด

```bash
npm run typecheck
npm test
npm run build
```

---

## ข้อควรระวังด้านความปลอดภัย

- **ห้ามเปิดพอร์ต `9222` สู่เครือข่ายภายนอก (0.0.0.0)** — สคริปต์เริ่มต้นผูกไว้ที่ `127.0.0.1` เท่านั้น
- **ตั้งค่า `ALLOWED_USER_IDS` เสมอ** — ระบบถูกออกแบบเป็น fail-closed หากไม่ใส่ Whitelist จะบล็อกทุกคำสั่งยกเว้น `/whoami`
- **ห้าม commit ไฟล์ `.env`** — อยู่ใน `.gitignore` เรียบร้อยแล้ว
