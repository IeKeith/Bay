"""
Garden-to-Table Host -- FastAPI Backend for Satay by the Bay AI Concierge
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
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from openai import AsyncOpenAI

BACKEND_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BACKEND_DIR.parent

# Load environment variables
env_path = BACKEND_DIR / ".env"
if not env_path.exists():
    env_path = PROJECT_ROOT / ".env"
if env_path.exists():
    load_dotenv(dotenv_path=env_path)
else:
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
kb_path = BACKEND_DIR / "satay_by_the_bay.md"
if not kb_path.exists():
    kb_path = PROJECT_ROOT / "satay_by_the_bay.md"

satay_kb = ""
if kb_path.exists():
    satay_kb = kb_path.read_text(encoding="utf-8")
    print(f"[Satay App] Knowledge Base loaded successfully ({len(satay_kb)} bytes)")
else:
    print("[Satay App] Warning: satay_by_the_bay.md not found.")

app = FastAPI(title="Garden-to-Table Host AI Concierge")

# Enable CORS for local dev / Vite frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# OpenAI Async Client
openai_client = AsyncOpenAI(
    api_key=LLM_API_KEY or "dummy_key",
    base_url=LLM_BASE_URL
)

# In-memory Token and Catalog Cache
cached_token: Optional[str] = None
cached_scenes: Optional[list] = None
cached_voices: Optional[list] = None

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

# --- Singlish / Hawker Phonetic Auto-Repair ----------------------------------
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

# --- API Routes --------------------------------------------------------------

@app.get("/api/config")
async def get_config():
    return {
        "mock": is_mock,
        "chat": bool(LLM_API_KEY),
        "presenterUrl": PRESENTER_URL,
        "perxonaBaseUrl": PERXONA_API_BASE_URL,
        "fixedTarget": None,
        "defaults": {
            "avatarId": "01KVQ595FX6K4SJ182HRNFERTK",
            "sceneId": "01KQEJD0NJFVM20M588K7D1E9Z",
            "voiceId": "01KY40Z9NTKTC5DMH8TD5S77RN"
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

TARGET_AVATAR_LIST = [
    {
        "id": "01KVQ595FX6K4SJ182HRNFERTK",
        "name": "cc076a06_female_xr_01",
        "role": "Mei - Satay Specialist",
        "thumbnail": "https://cdn.perxona.ai/asia/prod/org/01K4440W2737YSN7E4QD4TAHT2/resources/assets/avatar/cc076a06_female_xr_01/ts/20260803101224/head_cc076a06_female_xr_01_tini.png",
        "voice_id": "01KY40Z9NTKTC5DMH8TD5S77RN",
        "voice_name": "Warm & Cheerful (Female)",
        "lod_urls": {
            "lod0": "https://cdn.perxona.ai/asia/prod/org/01K4440W2737YSN7E4QD4TAHT2/resources/assets/avatar/cc076a06_female_xr_01/rev/01KZAJDH2BGYC87MRDDFCAT40Y/cc076a06_female_xr_01",
            "lod1": "https://cdn.perxona.ai/asia/prod/org/01K4440W2737YSN7E4QD4TAHT2/resources/assets/avatar/cc076a06_female_xr_01/rev/01KZAJDH2BGYC87MRDDFCAT40Z/cc076a06_female_xr_01_lod1"
        }
    },
    {
        "id": "01KVCSQYTDTABRYWP52NK31HBM",
        "name": "cc069a03_male_01",
        "role": "Host - Concierge Lead",
        "thumbnail": "https://cdn.perxona.ai/asia/prod/org/01K4440W2737YSN7E4QD4TAHT2/resources/assets/avatar/cc069a03_male_02/ts/20260724040232/head_cc069a03_male_02_tini.png",
        "voice_id": "01KY40Z9NTKTC5DMH8TD5S77RT",
        "voice_name": "Warm & Expressive (Male)",
        "lod_urls": {
            "lod0": "https://cdn.perxona.ai/asia/prod/org/01K4440W2737YSN7E4QD4TAHT2/resources/assets/avatar/cc069a03_male_02/rev/01KY9QFC0DTNMVCSSWMSN194EZ/cc069a03_male_02",
            "lod1": "https://cdn.perxona.ai/asia/prod/org/01K4440W2737YSN7E4QD4TAHT2/resources/assets/avatar/cc069a03_male_02/rev/01KY9QFC0DTNMVCSSWMSN194F0/cc069a03_male_02_lod1"
        }
    },
    {
        "id": "01KD2H4NWSZP4Y3CK8P3PSHTYP",
        "name": "cc051_meeks",
        "role": "Meeks - Friendly Guide",
        "thumbnail": "https://cdn.perxona.ai/asia/prod/org/01K4440W2737YSN7E4QD4TAHT2/resources/assets/avatar/cc051_meeks/ts/20260716073138/head_cc051_tini.png",
        "voice_id": "01KY40Z9NTKTC5DMH8TD5S77RQ",
        "voice_name": "Fresh & Upbeat (Male)",
        "lod_urls": {
            "lod0": "https://cdn.perxona.ai/asia/prod/org/01K4440W2737YSN7E4QD4TAHT2/resources/assets/avatar/cc051_meeks/rev/01KNKF7TYWCTK9MC2XFCT9MGS0/cc051_meeks_lod1",
            "lod1": "https://cdn.perxona.ai/asia/prod/org/01K4440W2737YSN7E4QD4TAHT2/resources/assets/avatar/cc051_meeks/rev/01KNKF7TYWCTK9MC2XFCT9MGS0/cc051_meeks_lod1"
        }
    },
    {
        "id": "01K9DZPWQQ6HFX3WCGPR85APNK",
        "name": "cc046_vroid_female",
        "role": "Aya - Dietary Advisor",
        "thumbnail": "https://cdn.perxona.ai/asia/prod/org/01K4440W2737YSN7E4QD4TAHT2/resources/assets/avatar/cc046_vroid_female/ts/20251208065246/head_cc046_tini.png",
        "voice_id": "01KY40Z9NTKTC5DMH8TD5S77RR",
        "voice_name": "Brightly Casual (Female)",
        "lod_urls": {
            "lod0": "https://cdn.perxona.ai/asia/prod/org/01K4440W2737YSN7E4QD4TAHT2/resources/assets/avatar/cc046_vroid_female/rev/01KZYX5B51H5WM4XM5X8144Y44/cc046_vroid_female",
            "lod1": "https://cdn.perxona.ai/asia/prod/org/01K4440W2737YSN7E4QD4TAHT2/resources/assets/avatar/cc046_vroid_female/rev/01KZYX5B51H5WM4XM5X8144Y45/cc046_vroid_female_lod1"
        }
    },
    {
        "id": "01KVQ54ZTBZVCTDXXRWQF0C6RS",
        "name": "cc075_a02_male_emojiboy_funday",
        "role": "Emojiboy - Fast Tracker",
        "thumbnail": "https://cdn.perxona.ai/asia/prod/org/01K4440W2737YSN7E4QD4TAHT2/resources/assets/avatar/cc075_a02_male_emojiboy_funday/ts/20260716075034/head_cc075_a02_male_emojiboy_funday_tini.png",
        "voice_id": "01KY40Z9NRCPHV9Y1WMATAP3Y0",
        "voice_name": "Polished & Bright (Male)",
        "lod_urls": {
            "lod0": "https://cdn.perxona.ai/asia/prod/org/01K4440W2737YSN7E4QD4TAHT2/resources/assets/avatar/cc075_a02_male_emojiboy_funday/rev/01KWV7Y07HH3QTSSMCAZ3SPKT1/cc075_a02_male_emojiboy_funday",
            "lod1": "https://cdn.perxona.ai/asia/prod/org/01K4440W2737YSN7E4QD4TAHT2/resources/assets/avatar/cc075_a02_male_emojiboy_funday/rev/01KWV7Y07HH3QTSSMCAZ3SPKT2/cc075_a02_male_emojiboy_funday_lod1"
        }
    },
    {
        "id": "01KVCSQCAG0YETY279SXN6M2Y4",
        "name": "cc069a02_male_01",
        "role": "Raj - Family Planner",
        "thumbnail": "https://cdn.perxona.ai/asia/prod/org/01K4440W2737YSN7E4QD4TAHT2/resources/assets/avatar/cc069a02_male_01/ts/20260902144433/head_cc069a02_male_01_tini.png",
        "voice_id": "01KY40Z9NS5BEHECTYMBVX909M",
        "voice_name": "Confident & Balanced (Male)",
        "lod_urls": {
            "lod0": "https://cdn.perxona.ai/asia/prod/org/01K4440W2737YSN7E4QD4TAHT2/resources/assets/avatar/cc069a02_male_01/rev/01M1H988FBR0VR3NRSRJXW47RM/cc069a02_male_01",
            "lod1": "https://cdn.perxona.ai/asia/prod/org/01K4440W2737YSN7E4QD4TAHT2/resources/assets/avatar/cc069a02_male_01/rev/01M1H98XZBXKJHH6MK894P75KX/cc069a02_male_01_lod1"
        }
    },
]

@app.get("/api/avatars")
async def get_avatars():
    """Returns avatar options for the kiosk concierge."""
    return {"items": TARGET_AVATAR_LIST}

@app.get("/api/scenes")
async def get_scenes():
    global cached_scenes
    if is_mock:
        return {"items": [{"id": "01KQEJD0NJFVM20M588K7D1E9Z", "name": "Satay by the Bay Alfresco Dining"}]}
    if cached_scenes:
        return {"items": cached_scenes}
    try:
        token = await get_perxona_token()
        async with httpx.AsyncClient(timeout=10.0) as client:
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
                    cached_scenes = items
                    return {"items": items}
    except Exception as e:
        print(f"[Satay App] Scenes fetch warning: {e}")

    fallback = [{"id": "01KQEJD0NJFVM20M588K7D1E9Z", "name": "Satay by the Bay Alfresco Dining"}]
    cached_scenes = fallback
    return {"items": fallback}

@app.get("/api/voices")
async def get_voices():
    global cached_voices
    if is_mock:
        return {"items": [{"id": "voice_sg_warm", "name": "Singaporean Warm Host"}]}
    if cached_voices:
        return {"items": cached_voices}
    try:
        token = await get_perxona_token()
        async with httpx.AsyncClient(timeout=10.0) as client:
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
                if formatted:
                    cached_voices = formatted
                    return {"items": formatted}
    except Exception as e:
        print(f"[Satay App] Voices fetch warning: {e}")

    fallback = [{"id": "voice_sg_warm", "name": "Singaporean Warm Host"}]
    cached_voices = fallback
    return {"items": fallback}

# --- OpenAI Chat Streaming Endpoint ------------------------------------------

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

    avatar_map = {av["id"]: av for av in TARGET_AVATAR_LIST}
    active_avatar = avatar_map.get(req.avatarId, TARGET_AVATAR_LIST[0])
    persona_name = f"{active_avatar['role']}"

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
5. Order & Queue Confirmation:
   - When a visitor checks out or places an order (or provides a queue number), enthusiastically confirm their order, explicitly read back and state their Queue Number (e.g., "Your queue number is #..."), quote their pickup stall and estimated prep time, and reassure them they will finish right on time for the Supertree Light Show.
6. Dynamic Food Order Recommendation Tag:
   - When you actively recommend or suggest a specific dish or drink for the visitor to order, append a single JSON action tag at the VERY END of your response on a new line:
     <!--RECOMMEND: {{"stallId": <stall_id_int>, "stallName": "<Stall Name>", "dishName": "<Dish Name>", "price": "SGD $<price>", "prepTime": "<prep_time>"}} -->
   - Available Stalls: Stall 1 (City Satay), Stall 2 (Boon Tat BBQ Seafood), Stall 3 (Geylang Lor 29 Fried Hokkien Mee), Stall 4 (Garden Greens & Prata House), Stall 5 (Marina Refreshments).
   - CRITICAL RESTRICTION: NEVER append the <!--RECOMMEND: ... --> tag when confirming an order or checkout, acknowledging a queue number, greeting, giving directions, or answering general non-order questions.
7. Brevity for Lipsync: Keep responses concise (2 to 3 punchy sentences max) so avatar lipsync is snappy and zero-latency."""

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
                max_tokens=220,
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

# --- Mount Static Frontend Files ---------------------------------------------
public_dir = BACKEND_DIR / "public"
if not public_dir.exists():
    public_dir = PROJECT_ROOT / "public"
if public_dir.exists():
    app.mount("/", StaticFiles(directory=str(public_dir), html=True), name="static")
    print(f"[Satay App] Static files mounted from: {public_dir}")

if __name__ == "__main__":
    import sys
    import uvicorn

    backend_str = str(BACKEND_DIR)
    if backend_str not in sys.path:
        sys.path.insert(0, backend_str)

    print("\n==================================================")
    print("Garden-to-Table Host (FastAPI Python) Ready!")
    print(f"URL: http://localhost:{PORT}")
    print("==================================================\n")
    uvicorn.run("main:app", host="0.0.0.0", port=PORT, reload=True, app_dir=backend_str)
