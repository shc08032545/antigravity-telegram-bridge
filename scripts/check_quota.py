#!/usr/bin/env python3
"""
Live Quota & Availability Checker for HyperFrames Studio & Antigravity VM.
- Checks Google AI Studio API (TTS Puck primary/backup + Gemini Flash alignment) via minimal probes.
- Counts today's local TTS renders (Asia/Bangkok) and prints exact HTTP status / retry hints.
- NEVER prints or logs any API key or token.
Usage:
  python3 scripts/check_quota.py --google
  python3 scripts/check_quota.py --antigravity
  python3 scripts/check_quota.py --all
"""
import argparse
import datetime
import json
import os
import shutil
import time
import urllib.error
import urllib.request
from pathlib import Path

BKK_TZ = datetime.timezone(datetime.timedelta(hours=7))


def load_google_api_key() -> str:
    key = os.environ.get("GOOGLE_API_KEY", "").strip()
    if key:
        return key
    for cand in ["/home/antigravity/TradingAgents/.env", os.path.expanduser("~/.env")]:
        if os.path.exists(cand):
            for line in open(cand, encoding="utf-8"):
                if line.strip().startswith("GOOGLE_API_KEY="):
                    return line.strip().split("=", 1)[1].strip().strip('"').strip("'")
    return ""


def probe_tts(api_key: str, model: str, voice: str = "Puck") -> dict:
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
    payload = {
        "contents": [{"parts": [{"text": "สวัสดี"}]}],
        "generationConfig": {
            "responseModalities": ["AUDIO"],
            "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": voice}}},
        },
    }
    t0 = time.time()
    try:
        req = urllib.request.Request(
            url,
            data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            ms = int((time.time() - t0) * 1000)
            data = json.loads(resp.read().decode("utf-8"))
            b64_len = len(data["candidates"][0]["content"]["parts"][0]["inlineData"]["data"])
            return {"ok": True, "http": resp.status, "ms": ms, "audio_b64_len": b64_len, "status": "เจนเสียงได้ปกติ"}
    except urllib.error.HTTPError as exc:
        ms = int((time.time() - t0) * 1000)
        raw = exc.read().decode("utf-8", errors="ignore")
        retry_hint = ""
        msg = raw[:240]
        try:
            err = json.loads(raw).get("error", {})
            msg = err.get("message", msg)
            for det in err.get("details", []):
                if "retryDelay" in det:
                    retry_hint = det["retryDelay"]
        except Exception:
            pass
        return {
            "ok": False,
            "http": exc.code,
            "ms": ms,
            "retry_delay": retry_hint,
            "message": msg[:220],
            "status": "โควตาเต็ม / ถูกจำกัด (429)" if exc.code == 429 else f"HTTP {exc.code}",
        }
    except Exception as exc:
        return {"ok": False, "http": 0, "ms": int((time.time() - t0) * 1000), "message": str(exc)[:180], "status": "เชื่อมต่อไม่ได้"}


def probe_text(api_key: str, model: str = "gemini-2.5-flash") -> dict:
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
    payload = {
        "contents": [{"parts": [{"text": "OK"}]}],
        "generationConfig": {"maxOutputTokens": 2, "temperature": 0.0},
    }
    t0 = time.time()
    try:
        req = urllib.request.Request(
            url,
            data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=20) as resp:
            ms = int((time.time() - t0) * 1000)
            return {"ok": True, "http": resp.status, "ms": ms, "status": "ใช้งานได้ปกติ"}
    except urllib.error.HTTPError as exc:
        ms = int((time.time() - t0) * 1000)
        raw = exc.read().decode("utf-8", errors="ignore")[:220]
        return {"ok": False, "http": exc.code, "ms": ms, "message": raw, "status": "โควตาเต็ม (429)" if exc.code == 429 else f"HTTP {exc.code}"}
    except Exception as exc:
        return {"ok": False, "http": 0, "ms": int((time.time() - t0) * 1000), "message": str(exc)[:180], "status": "เชื่อมต่อไม่ได้"}


def count_today_tts_files() -> list[str]:
    base = Path("/home/antigravity/shc08032545/hyperframes-studio")
    today_bkk = datetime.datetime.now(BKK_TZ).date()
    found = []
    if base.exists():
        for p in sorted(base.glob("ep*/assets/audio/vo_*raw.wav")):
            mtime = datetime.datetime.fromtimestamp(p.stat().st_mtime, BKK_TZ).date()
            if mtime == today_bkk:
                found.append(f"{p.parents[2].name}/{p.name}")
    return found


def check_google() -> dict:
    key = load_google_api_key()
    if not key:
        return {"configured": False, "error": "ไม่พบ GOOGLE_API_KEY ในระบบ"}
    tts_primary = probe_tts(key, "gemini-2.5-flash-preview-tts", "Puck")
    tts_backup = probe_tts(key, "gemini-3.1-flash-tts-preview", "Puck")
    text_align = probe_text(key, "gemini-2.5-flash")
    today_files = count_today_tts_files()
    return {
        "configured": True,
        "checked_at_bkk": datetime.datetime.now(BKK_TZ).strftime("%Y-%m-%d %H:%M:%S ICT"),
        "tts_primary_2_5": tts_primary,
        "tts_backup_3_1": tts_backup,
        "gemini_2_5_flash": text_align,
        "today_local_tts_runs": len(today_files),
        "today_local_tts_files": today_files,
        "usage_dashboard_url": "https://aistudio.google.com/usage",
        "note": "Google AI Studio API ไม่มี endpoint คืนจำนวนโควตาคงเหลือเป็นตัวเลขตรงๆ — สคริปต์นี้ทดสอบยิงจริงแบบเบาที่สุดเพื่อยืนยันว่าเจนเสียงได้ตอนนี้หรือไม่ (แนะนำกดลิงก์ Usage ด้านบนเพื่อดูกราฟ RPD/TPM จริง)",
    }


def check_antigravity() -> dict:
    usage = shutil.disk_usage("/home/antigravity")
    model_state_path = Path("/home/antigravity/shc08032545/antigravity-telegram-bridge/data/model-state.json")
    model_state = {}
    if model_state_path.exists():
        try:
            model_state = json.loads(model_state_path.read_text(encoding="utf-8"))
        except Exception:
            pass
    mem_avail_gb = None
    try:
        for line in Path("/proc/meminfo").read_text().splitlines():
            if line.startswith("MemAvailable:"):
                mem_avail_gb = round(int(line.split()[1]) / 1024 / 1024, 2)
    except Exception:
        pass
    return {
        "checked_at_bkk": datetime.datetime.now(BKK_TZ).strftime("%Y-%m-%d %H:%M:%S ICT"),
        "active_model_state": model_state,
        "vm_disk_free_gb": round(usage.free / (1024 ** 3), 2),
        "vm_disk_total_gb": round(usage.total / (1024 ** 3), 2),
        "vm_ram_avail_gb": mem_avail_gb,
        "web_quota_limitation": (
            "VM ระยะไกลไม่สามารถอ่าน Session/Cookie หน้าเว็บ Antigravity ของผู้ใช้โดยตรงได้ "
            "(เพื่อความปลอดภัยของบัญชี) — ต้องดูแถบเปอร์เซ็นต์ Quota คงเหลือโดยตรงในหน้าเว็บ Antigravity (มุมตั้งค่า/Usage)"
        ),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--google", action="store_true")
    ap.add_argument("--antigravity", action="store_true")
    ap.add_argument("--all", action="store_true")
    args = ap.parse_args()
    if not (args.google or args.antigravity or args.all):
        args.all = True
    out = {}
    if args.google or args.all:
        out["google_ai_studio"] = check_google()
    if args.antigravity or args.all:
        out["antigravity_web"] = check_antigravity()
    print(json.dumps(out, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
