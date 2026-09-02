"""
Garden-to-Table Host — FastAPI Backend for Satay by the Bay AI Concierge
Integrates Perxona Connect API, OpenAI Streaming Chat, and Hawker Knowledge Base.
"""

import os
import re
import json
from pathlib import Path
from typing import List, Optional
from dotenv import load_dotenv

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from openai import AsyncOpenAI

# Load environment variables
load_dotenv()

PORT = int(os.getenv("PORT", "8086"))
PERXONA_API_BASE_URL = os.getenv("PERXONA_API_BASE_URL", "https://console.perxona.ai/asia")
PRESENTER_URL = os.getenv("PRESENTER_URL", "https://cdn.perxona.ai/asia/prod/latest/widget/entry/presenter.js")
PERXONA_CONNECT_EMAIL = os.getenv("PERXONA_CONNECT_EMAIL", "")
PERXONA_CONNECT_PASSWORD = os.getenv("PERXONA_CONNECT_PASSWORD", "")
LLM_API_KEY = os.getenv("LLM_API_KEY", "")
LLM_BASE_URL = os.getenv("LLM_BASE_URL", "https://api.openai.com/v1")
LLM_MODEL = os.getenv("LLM_MODEL", "gpt-4o-mini")

is_mock = not (PERXONA_CONNECT_EMAIL and PERXONA_CONNECT_PASSWORD)

# Load Satay by the Bay Knowledge Base
kb_path = Path(__file__).parent / "satay_by_the_bay.md"
satay_kb = ""
if kb_path.exists():
    satay_kb = kb_path.read_text(encoding="utf-8")
    print(f"[Satay App] Knowledge Base loaded successfully ({len(satay_kb)} bytes)")
else:
    print("[Satay App] Warning: satay_by_the_bay.md not found.")

app = FastAPI(title="Garden-to-Table Host AI Concierge")

# OpenAI Async Client
openai_client = AsyncOpenAI(
    api_key=LLM_API_KEY or "dummy_key",
    base_url=LLM_BASE_URL
)

# In-memory Token Cache
cached_token: Optional[str] = None

async def get_perxona_token(force_refresh: bool = False) -> str:
    """Authenticates with Perxona Connect API and returns Bearer JWT."""
    global cached_token
    if is_mock:
        return "mock_connect_token_satay_demo"
    if cached_token and not force_refresh:
        return cached_token

    async with httpx.AsyncClient(timeout=15.0) as client:
        res = await client.post(
            f"{PERXONA_API_BASE_URL}/api/v1/connect/auth/login",
            json={"email": PERXONA_CONNECT_EMAIL, "password": PERXONA_CONNECT_PASSWORD}
        )
        if res.status_code != 200:
            err_data = res.json() if res.headers.get("content-type", "").startswith("application/json") else {}
            msg = err_data.get("detail") or err_data.get("message") or f"Auth login failed with HTTP {res.status_code}"
            raise HTTPException(status_code=500, detail=msg)
        
        data = res.json()
        cached_token = data.get("access_token")
        return cached_token

# ── Singlish / Hawker Phonetic Auto-Repair ──────────────────────────────────
PHONETIC_REPLACEMENTS = [
    (re.compile(r"\b(sate|sata|satey|satay sticks?)\b", re.IGNORECASE), "Satay"),
    (re.compile(r"\b(sting\s*ray|stingray|sambal\s*ray)\b", re.IGNORECASE), "Sambal Stingray"),
    (re.compile(r"\b(hokkien|hockien|hoki|hawker)\s*(mee|noodles?)\b", re.IGNORECASE), "Hokkien Mee"),
    (re.compile(r"\b(prata|paratha|roti prata)\b", re.IGNORECASE), "Roti Prata"),
    (re.compile(r"\b(sugarcane|sugar can|sugar cane)\b", re.IGNORECASE), "Sugar Cane Juice"),
    (re.compile(r"\b(supertree|super tree|rhapsody|light show)\b", re.IGNORECASE), "Supertree Grove Light Show (7:45 PM)"),
    (re.compile(r"\b(chendol|cendol|chendul)\b", re.IGNORECASE), "Chendol"),
    (re.compile(r"\b(halal|muslim friendly)\b", re.IGNORECASE), "Halal"),
    (re.compile(r"\b(vege|veggie|vegetarian)\b", re.IGNORECASE), "Vegetarian"),
    (re.compile(r"\b(flower dome|cloud forest|conservatories)\b", re.IGNORECASE), "Gardens Conservatories"),
]

def correct_phonetic_stt(text: str) -> str:
    """Repairs browser speech recognition phonetic inaccuracies for local foods."""
    if not text:
        return text
    cleaned = text
    for pattern, replacement in PHONETIC_REPLACEMENTS:
        cleaned = pattern.sub(replacement, cleaned)
    return cleaned

# ── API Routes ──────────────────────────────────────────────────────────────

@app.get("/api/config")
async def get_config():
    return {
        "mock": is_mock,
        "chat": bool(LLM_API_KEY),
        "presenterUrl": PRESENTER_URL,
        "fixedTarget": None,
        "defaults": {
            "avatarId": "01KZFW8613MF0AWNRR59BBDMG6",
            "sceneId": "01KQEJD0NJFVM20M588K7D1E9Z",
            "voiceId": "01KY40Z9NTKTC5DMH8TD5S77RT"
        }
    }

@app.get("/api/health")
async def get_health():
    return {
        "status": "ok",
        "mode": "mock" if is_mock else "live",
        "kbLoaded": bool(satay_kb)
    }

@app.get("/api/connect-token")
async def get_connect_token():
    token = await get_perxona_token()
    return {"connect_token": token}

@app.get("/api/avatars")
async def get_avatars():
    """Returns avatar options for the kiosk concierge."""
    if is_mock:
        return {
            "items": [
                {"id": "f1", "name": "Mei (Hawker Trail & Satay Specialist)"},
                {"id": "m1", "name": "Raj (Dietary & Family Planner)"}
            ]
        }
    
    try:
        token = await get_perxona_token()
        async with httpx.AsyncClient(timeout=15.0) as client:
            res = await client.get(
                f"{PERXONA_API_BASE_URL}/api/v1/connect/assets/avatars?size=50",
                headers={"Authorization": f"Bearer {token}"}
            )
            if res.status_code == 200:
                data = res.json()
                raw_items = data.get("items", [])
                items = []
                if len(raw_items) > 0:
                    items.append({
                        "id": raw_items[0].get("avatar_id", "f1"),
                        "name": "Mei (Hawker Trail & Satay Specialist)",
                        "thumbnail": raw_items[0].get("thumbnail_urls", {}).get("head")
                    })
                if len(raw_items) > 1:
                    items.append({
                        "id": raw_items[1].get("avatar_id", "m1"),
                        "name": "Raj (Dietary & Family Planner)",
                        "thumbnail": raw_items[1].get("thumbnail_urls", {}).get("head")
                    })
                if items:
                    return {"items": items}
    except Exception as e:
        print(f"[Satay App] Avatar fetch warning: {e}")
    
    return {
        "items": [
            {"id": "f1", "name": "Mei (Hawker Trail & Satay Specialist)"},
            {"id": "m1", "name": "Raj (Dietary & Family Planner)"}
        ]
    }

@app.get("/api/scenes")
async def get_scenes():
    if is_mock:
        return {"items": [{"id": "01KQEJD0NJFVM20M588K7D1E9Z", "name": "Satay by the Bay Alfresco Dining"}]}
    try:
        token = await get_perxona_token()
        async with httpx.AsyncClient(timeout=15.0) as client:
            res = await client.get(
                f"{PERXONA_API_BASE_URL}/api/v1/connect/assets/scenes?size=20",
                headers={"Authorization": f"Bearer {token}"}
            )
            if res.status_code == 200:
                data = res.json()
                items = []
                for item in data.get("items", []):
                    items.append({
                        "id": item.get("scene_id"),
                        "name": item.get("name")
                    })
                if items:
                    return {"items": items}
    except Exception as e:
        print(f"[Satay App] Scenes fetch warning: {e}")

    return {"items": [{"id": "01KQEJD0NJFVM20M588K7D1E9Z", "name": "Satay by the Bay Alfresco Dining"}]}

@app.get("/api/voices")
async def get_voices():
    if is_mock:
        return {"items": [{"id": "voice_sg_warm", "name": "Singaporean Warm Host"}]}
    try:
        token = await get_perxona_token()
        async with httpx.AsyncClient(timeout=15.0) as client:
            res = await client.get(
                f"{PERXONA_API_BASE_URL}/api/v1/connect/voices",
                headers={"Authorization": f"Bearer {token}"}
            )
            if res.status_code == 200:
                data = res.json()
                items = data.get("items", [])
                formatted = []
                for v in items:
                    formatted.append({
                        "id": v.get("id"),
                        "name": v.get("name", "Voice")
                    })
                return {"items": formatted}
    except Exception as e:
        print(f"[Satay App] Voices fetch warning: {e}")
    return {"items": [{"id": "voice_sg_warm", "name": "Singaporean Warm Host"}]}

# ── OpenAI Chat Streaming Endpoint ──────────────────────────────────────────

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    message: str
    avatarId: Optional[str] = None
    history: Optional[List[ChatMessage]] = []

@app.post("/api/chat")
async def chat_endpoint(req: ChatRequest):
    if not req.message:
        raise HTTPException(status_code=400, detail="Message is required")
    if not LLM_API_KEY:
        raise HTTPException(status_code=500, detail="LLM_API_KEY is not configured on the server")

    # Correct STT input
    corrected_message = correct_phonetic_stt(req.message)

    persona_name = "Mei (Hawker Trail & Satay Specialist)"
    if req.avatarId and ("m" in req.avatarId.lower() or "raj" in req.avatarId.lower()):
        persona_name = "Raj (Dietary & Family Planner)"

    system_prompt = f"""You are {persona_name}, the warm and intelligent AI avatar concierge stationed at Satay by the Bay, Gardens by the Bay, Singapore!

KNOWLEDGE BASE & LIVE STALL DATA:
{satay_kb}

YOUR MISSION:
Help visitors coordinate a stress-free, delicious multi-stall meal that fits their time window, budget, and dietary preferences without missing their 7:45 PM Garden Rhapsody light show at Supertree Grove!

CORE RULES:
1. Tone: Welcoming, reassuring Singaporean hospitality.
2. Attraction Gap Awareness:
   - The primary attraction is the 7:45 PM Supertree Grove Light Show (Garden Rhapsody).
   - Account for 8-10 min walking buffer + 15 min dining time.
3. Multi-Stall Routing:
   - Always recommend a coordinated 2-stall plan (e.g., Order Satay at Stall 1, pick up Sugar Cane Juice at Stall 5 during the grill wait).
   - Quote exact SGD prices ($) and prep times.
4. Auto-Replanning:
   - If a queue exceeds their time window or an item is sold out, proactively propose an immediate fast-prep alternative (e.g., Stall 4 Prata or Stall 3 Hokkien Mee).
5. Brevity for Lipsync: Keep responses concise (2 to 3 punchy sentences max) so avatar lipsync is snappy and zero-latency."""

    messages = [{"role": "system", "content": system_prompt}]
    
    # Append recent conversation history (sliding window of 10)
    for h in (req.history or [])[-10:]:
        messages.append({"role": h.role, "content": h.content})
    
    messages.append({"role": "user", "content": corrected_message})

    async def event_generator():
        try:
            stream = await openai_client.chat.completions.create(
                model=LLM_MODEL,
                messages=messages,
                temperature=0.5,
                max_tokens=150,
                stream=True,
            )
            async for chunk in stream:
                delta = chunk.choices[0].delta.content if chunk.choices else None
                if delta:
                    payload = json.dumps({"delta": delta})
                    yield f"data: {payload}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as err:
            err_payload = json.dumps({"error": str(err)})
            yield f"data: {err_payload}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")

# ── Mount Static Frontend Files ─────────────────────────────────────────────
public_dir = Path(__file__).parent / "public"
if public_dir.exists():
    app.mount("/", StaticFiles(directory=str(public_dir), html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    print("\n==================================================")
    print(f"🌿 Garden-to-Table Host (FastAPI Python) Ready!")
    print(f"🌐 URL: http://localhost:{PORT}")
    print("==================================================\n")
    uvicorn.run("main:app", host="0.0.0.0", port=PORT, reload=True)
