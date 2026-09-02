# 🌿 Garden-to-Table Host — Implementation & Rebuild Guide
> **Perxona-Powered AI Avatar Concierge for Satay by the Bay (Gardens by the Bay)**
> **Full-Stack Architecture: 100% Python (FastAPI) Backend + Perxona 3D Web Component Frontend**

---

## 📌 1. Project Concept & Value Proposition

### The Problem
Visitors at **Gardens by the Bay (Singapore)** often have tight 45–60 minute gaps between attractions (e.g., exiting the Flower Dome / Cloud Forest before catching the **7:45 PM or 8:45 PM Garden Rhapsody light show** at Supertree Grove). Dining at **Satay by the Bay** during peak hours is stressful:
- Hawkers operate independently with disparate queues (some take 5 mins, others take 25 mins).
- Tour groups and families have conflicting dietary needs (Halal, Vegetarian, Nut/Shellfish allergies, kid-friendly non-spicy).
- If an item sells out or a queue suddenly spikes, visitors panic and risk missing their timed light show or conservatory entry slots.

### The Solution: Garden-to-Table Host
**Garden-to-Table Host** is an interactive, voice-enabled 3D AI Avatar concierge (powered by **Perxona Connect API `<sv-presenter>`** and **FastAPI + OpenAI `gpt-4o-mini`**) deployed on digital kiosks and web browsers at Satay by the Bay. It:
1. **Understands Group Context**: Asks for group size, budget, dietary restrictions (Halal, Vegetarian, Allergens), and the exact time/location of their next Gardens attraction.
2. **Consults Live Stall & Queue Data**: Checks simulated real-time stall statuses, prep times, and queue delays across hawker stalls.
3. **Generates an Optimized Multi-Stall Collection Route**: Produces a coordinated schedule (e.g., *"Order satay at Stall 1 first (15m prep), pick up sugarcane juice at Stall 5 (2m), collect satay, eat by 7:25 PM, walk 8 mins to Supertrees by 7:40 PM"*).
4. **Dynamic Auto-Replanning**: If an item sells out or a queue spikes, the avatar proactively notifies the group and suggests an immediate, valid alternative that preserves their departure deadline.

---

## 🗺️ 2. Architectural Mapping: FamilyMart $\rightarrow$ Garden-to-Table Host

| Component | FamilyMart (Node.js) | Garden-to-Table Host (100% Python) |
| :--- | :--- | :--- |
| **Backend Framework** | Node.js + Express (`server.mjs`) | **Python 3.10+ with FastAPI + Uvicorn (`main.py`)** |
| **HTTP Client / Proxy** | `fetch` (Node 18 native) | **`httpx.AsyncClient`** (High performance async HTTP) |
| **LLM Streaming** | Node Streams (`text/event-stream`) | **FastAPI `StreamingResponse`** with OpenAI Async client |
| **Knowledge Base** | `family_mart.md` (Snacks, Bento, Omotenashi) | **`satay_by_the_bay.md`** (Stalls, Halal/Veg, SGD prices, Queues, Walk times) |
| **Avatar Personas** | Taro (Hot snacks), Ken (Bento), Ren (Beverages) | **Mei (Hawker Trail & Satay Guide)**, **Raj (Dietary & Family Planner)** |
| **Visual Stage** | Shibuya FamilyMart Store (`/familymart_bg.jpg`) | Waterfront Alfresco Satay by the Bay / Supertree Glow (`/satay_bg.jpg`) |
| **Showcase Widget** | Single Item Card (FamiChiki / Onigiri / Pocari) | **Live Multi-Stall Timed Itinerary & Route Card** (Trays, Collection Times, Walk Buffer) |
| **Voice STT Auto-Repair** | Japanese phonetic repairs ("tommy chicken" $\rightarrow$ FamiChiki) | Singlish & Hawker repairs using Python `re.sub` |

---

## 📋 3. Step-by-Step Python Rebuild Instructions

### Step 1: Project Setup & Python Environment

1. Create a dedicated project directory (e.g., `satay_app/`):
```bash
# In Windows PowerShell:
mkdir satay_app
cd satay_app
mkdir public
```

2. Copy the existing frontend client assets (`public/index.html`, `public/app.js`, `public/style.css`, and images) into `satay_app/public/`.

3. Create a Python virtual environment and activate it:
```bash
python -m venv venv
# Windows:
.\venv\Scripts\activate
# Mac/Linux:
source venv/bin/activate
```

4. Create `requirements.txt`:
```txt
fastapi>=0.110.0
uvicorn[standard]>=0.28.0
httpx>=0.27.0
openai>=1.20.0
python-dotenv>=1.0.0
pydantic>=2.6.0
```

Install dependencies:
```bash
pip install -r requirements.txt
```

5. Create your `.env` configuration file:
```env
PORT=8086
PERXONA_API_BASE_URL=https://console.perxona.ai/asia
PRESENTER_URL=https://cdn.perxona.ai/asia/prod/latest/widget/entry/presenter.js

# Perxona Account Credentials (for 3D avatar rendering & TTS playback)
PERXONA_CONNECT_EMAIL=your_perxona_email@example.com
PERXONA_CONNECT_PASSWORD=your_perxona_password

# OpenAI API Settings
LLM_API_KEY=sk-proj-your-openai-api-key
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4o-mini
```

---

### Step 2: Create the Knowledge Base (`satay_by_the_bay.md`)

Save this file in `satay_app/satay_by_the_bay.md`:

```markdown
# Satay by the Bay — Master Hawker Stalls & Timing Knowledge Base

## 1. Destination & Attraction Walking Buffers from Satay by the Bay
- **Supertree Grove (Garden Rhapsody Light Show at 7:45 PM & 8:45 PM)**: 8–10 mins walk.
- **Cloud Forest & Flower Dome (Conservatories)**: 12–15 mins walk.
- **Floral Fantasy & Bayfront MRT Exit B**: 16–18 mins walk.
- **Kingfisher Wetlands & Meadow**: 6–8 mins walk.
*Rule: Always reserve at least a 10-15 minute buffer before the visitor's next attraction schedule.*

## 2. Hawker Stall Directory & Live Queue Profiles

### Stall 1: City Satay (Halal-Certified)
- **Cuisine**: Traditional Malay Charcoal-Grilled Satay & Ketupat
- **Status**: Open | Base Prep Time: 12 mins | Current Queue: ~8 mins (Total: 20 mins)
- **Signature Items**:
  - *Chicken Satay (10 sticks)*: SGD $9.00 | Gluten-Free | Halal
  - *Mutton Satay (10 sticks)*: SGD $10.00 | Halal
  - *Beef Satay (10 sticks)*: SGD $10.00 | Halal
  - *Ketupat Rice Cake & Peanut Gravy (2 pcs)*: SGD $2.00 | Vegetarian, Contains Peanuts
- **Best For**: Sharing platters, Halal dining, quintessential Singapore experience.

### Stall 2: Boon Tat BBQ Seafood
- **Cuisine**: Local Tze Char & Charcoal BBQ Seafood
- **Status**: Open | Base Prep Time: 15 mins | Current Queue: ~10 mins (Total: 25 mins)
- **Signature Items**:
  - *Sambal Stingray on Banana Leaf (Small/Medium)*: SGD $16.00 / $22.00 | Spicy, Contains Shellfish/Shrimp Paste
  - *Garlic Butter Tiger Prawns (6 pcs)*: SGD $18.00 | Contains Shellfish
  - *Stir-Fried Sambal Kang Kong*: SGD $9.00 | Spicy
- **Best For**: Flavourful communal seafood dinner. Note: High prep time! Avoid if visitor has <35 mins total.

### Stall 3: Geylang Lor 29 Fried Hokkien Mee
- **Cuisine**: Wok-Fried Seafood Noodles
- **Status**: Open | Base Prep Time: 7 mins | Current Queue: ~5 mins (Total: 12 mins)
- **Signature Items**:
  - *Traditional Prawn Hokkien Mee*: SGD $7.50 | Pork, Prawn Broth, Egg, Calamansi
  - *Crispy Fried Carrot Cake (Black / White)*: SGD $6.00 | Vegetarian Option Available
- **Best For**: Fast, filling comfort food; great for tight 30-40 min turnaround times.

### Stall 4: Garden Greens & Prata House (Halal & Vegetarian)
- **Cuisine**: South Indian, Vegetarian & Muslim-Friendly
- **Status**: Open | Base Prep Time: 5 mins | Current Queue: ~3 mins (Total: 8 mins)
- **Signature Items**:
  - *Crispy Plain Prata (2 pcs with Dhal)*: SGD $3.50 | Vegetarian, Halal
  - *Cheese & Mushroom Prata*: SGD $5.00 | Vegetarian, Halal
  - *Vegetarian Biryani with Papadum*: SGD $8.50 | 100% Plant-Based
- **Best For**: Strict vegetarians, fast orders (<10 mins), budget meals under $10.

### Stall 5: Marina Refreshments & Sugar Cane Bar
- **Cuisine**: Local Cold Drinks & Tropical Fruits
- **Status**: Open | Base Prep Time: 2 mins | Current Queue: ~2 mins (Total: 4 mins)
- **Signature Items**:
  - *Cold-Pressed Fresh Sugar Cane Juice with Lemon*: SGD $3.50 | Vegan, Gluten-Free
  - *Fresh Thai Coconut*: SGD $5.50 | Hydrating, Vegan
  - *Chendol Shaved Ice with Gula Melaka*: SGD $4.50 | Dessert, Contains Coconut Milk
- **Best For**: Immediate thirst quenching while waiting for satay or hot food.

## 3. Real-Time Contingency & Auto-Replanning Rules
1. **Item Sold Out**:
   - If *Sambal Stingray* is sold out $\rightarrow$ Instantly recommend *Boon Tat BBQ Tiger Prawns* ($18.00) or pivot to *Geylang Hokkien Mee* ($7.50).
   - If *Chicken Satay* is sold out $\rightarrow$ Offer *Beef/Mutton Satay* or *Prata with Dhal*.
2. **Queue Surge Delay**:
   - If user has less than 35 minutes until the 7:45 PM Supertree show and Stall 1 (Satay) queue exceeds 20 minutes:
     $\rightarrow$ Proactively warn the user: *"Satay queue is currently 25 mins which risks missing your 7:45 PM show! Let's swap Stall 1 for Stall 3 Hokkien Mee (12 mins total) and grab Sugar Cane juice (4 mins) so you reach Supertree Grove safely by 7:35 PM!"*
```

---

### Step 3: Complete Python Backend (`main.py`)

Here is the complete, self-contained Python FastAPI backend replacing Express (`server.mjs`) entirely:

```python
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

async def get_perxona_token() -> str:
    """Authenticates with Perxona Connect API and returns Bearer JWT."""
    global cached_token
    if is_mock:
        return "mock_connect_token_satay_demo"
    if cached_token:
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
    (re.compile(r"\b(supertree|super tree|rhapsody|light show)\b", re.IGNORECASE), "Supertree Grove Light Show"),
    (re.compile(r"\b(flower dome|cloud forest|conservatory)\b", re.IGNORECASE), "Gardens Conservatories"),
    (re.compile(r"\b(chendol|cendol|chendul)\b", re.IGNORECASE), "Chendol"),
    (re.compile(r"\b(halal|muslim friendly)\b", re.IGNORECASE), "Halal"),
    (re.compile(r"\b(vege|veggie|vegetarian)\b", re.IGNORECASE), "Vegetarian"),
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
        "fixedTarget": None
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
                {"id": "f1", "name": "Mei (F1 - Hawker & Satay Route Specialist)"},
                {"id": "m1", "name": "Raj (M1 - Dietary & Family Meal Planner)"}
            ]
        }
    
    token = await get_perxona_token()
    async with httpx.AsyncClient(timeout=15.0) as client:
        res = await client.get(
            f"{PERXONA_API_BASE_URL}/api/v1/connect/assets/avatars?size=50",
            headers={"Authorization": f"Bearer {token}"}
        )
        if res.status_code != 200:
            raise HTTPException(status_code=res.status_code, detail="Failed to fetch upstream avatars")
        data = res.json()
        raw_items = data.get("items", [])
        
        # Friendly labeling for Gardens by the Bay
        items = [
            {"id": raw_items[0]["avatar_id"], "name": "Mei (F1 - Hawker & Satay Specialist)"} if len(raw_items) > 0 else {"id": "f1", "name": "Mei"},
            {"id": raw_items[1]["avatar_id"], "name": "Raj (M1 - Dietary & Family Planner)"} if len(raw_items) > 1 else {"id": "m1", "name": "Raj"}
        ]
        return {"items": items}

@app.get("/api/scenes")
async def get_scenes():
    return {
        "items": [
            {"id": "satay_by_the_bay_alfresco", "name": "Satay by the Bay Alfresco Dining"}
        ]
    }

@app.get("/api/voices")
async def get_voices():
    if is_mock:
        return {"items": [{"id": "voice_sg_warm", "name": "Singaporean Warm Host"}]}
    token = await get_perxona_token()
    async with httpx.AsyncClient(timeout=15.0) as client:
        res = await client.get(
            f"{PERXONA_API_BASE_URL}/api/v1/connect/voices",
            headers={"Authorization": f"Bearer {token}"}
        )
        return res.json()

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

    persona_name = "Mei (Hawker & Satay Route Specialist)"
    if req.avatarId and ("m" in req.avatarId.lower()):
        persona_name = "Raj (Dietary & Family Meal Planner)"

    system_prompt = f"""You are {persona_name}, the warm and intelligent AI avatar concierge stationed at Satay by the Bay, Gardens by the Bay, Singapore!

KNOWLEDGE BASE & LIVE STALL DATA:
{satay_kb}

YOUR MISSION:
Help visitors coordinate a stress-free, delicious multi-stall meal that fits their time window, budget, and dietary preferences without missing their next Gardens attraction!

CORE RULES:
1. Tone: Welcoming, helpful, reassuring Singaporean hospitality.
2. Attraction Gap Awareness:
   - Always verify their next attraction (e.g. 7:45 PM Supertree Light Show).
   - Account for 10 min walking buffer + 15 min dining time.
3. Multi-Stall Routing:
   - Recommend a coordinated 2-stall plan (e.g. Order Satay at Stall 1, pick up Sugar Cane at Stall 5 during the grill wait).
   - Quote exact SGD prices ($) and prep times.
4. Auto-Replanning:
   - If a queue exceeds their time window or an item is sold out, proactively propose an immediate fast-prep alternative (e.g. Stall 4 Prata or Stall 3 Hokkien Mee).
5. Brevity for Lipsync: Keep responses concise (2 to 3 punchy sentences) so avatar lipsync is snappy."""

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
# Serves public/index.html, public/app.js, public/style.css, and public/imgs
public_dir = Path(__file__).parent / "public"
if public_dir.exists():
    app.mount("/", StaticFiles(directory=str(public_dir), html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    print("\n==================================================")
    print("Garden-to-Table Host (FastAPI Python) Ready!")
    print(f"URL: http://localhost:{PORT}")
    print("==================================================\n")
    uvicorn.run("main:app", host="0.0.0.0", port=PORT, reload=True)
```

---

### Step 4: Run the Python Server

To run your new Python backend:

```bash
# In your satay_app directory:
uvicorn main:app --reload --port 8086
```

Open your browser at **`http://localhost:8086`**. The frontend automatically connects to the Python endpoints!

---

### Step 5: Adapt UI Components (`index.html` & `app.js`)

#### 1. Add the **Timed Hawker Itinerary Card** to `public/index.html`
Replace the single product card overlay with an itinerary route widget:
```html
<div id="route-planner-card" class="card route-planner-card">
  <div class="route-card-badge">⏱️ Timed Hawker Route</div>
  <div class="route-header">
    <h4 id="route-target-destination">Target: Supertree Light Show (7:45 PM)</h4>
    <span id="route-countdown" class="badge badge-timer">38 mins remaining</span>
  </div>
  
  <div class="route-steps" id="route-steps">
    <div class="route-step active">
      <span class="step-num">1</span>
      <div class="step-info">
        <strong>Stall 1: City Satay</strong>
        <p>10x Chicken Satay ($9.00) • Ready in 15m</p>
      </div>
      <span class="step-status status-cooking">Grilling 🔥</span>
    </div>
    
    <div class="route-step">
      <span class="step-num">2</span>
      <div class="step-info">
        <strong>Stall 5: Marina Drinks</strong>
        <p>2x Sugar Cane Juice ($7.00) • Ready in 2m</p>
      </div>
      <span class="step-status status-ready">Quick Pickup ⚡</span>
    </div>
  </div>

  <div class="route-footer">
    <div class="route-totals">
      <span>Total: <strong>SGD $16.00</strong></span>
      <span class="walk-time">🚶 8 min walk to Supertrees</span>
    </div>
  </div>
</div>
```

#### 2. Configure Ready-Made Prompt Chips for Fast Demo
In `public/index.html`:
```html
<div class="quick-prompts">
  <button class="chip" data-prompt="We have 40 mins before the 7:45 PM Supertree show, family of 3, Halal food under $30!">
    ⏱️ 40m Rush (Halal Group)
  </button>
  <button class="chip" data-prompt="I am vegetarian and allergic to peanuts. What can I get before heading to the Flower Dome?">
    🥗 Vegetarian & Nut-Free
  </button>
  <button class="chip" data-prompt="Satay queue is now 25 mins! We need to leave in 20 mins, please replan our order!">
    🚨 Auto-Replan (Queue Delay)
  </button>
</div>
```

---

## 🎭 4. Recommended Hackathon Demo Script

Run this 2-turn voice demonstration with judges:

### Turn 1: Coordinated Attraction Gap Plan
- **User speaks into mic**:  
  *"Hi! We have 45 minutes before the Garden Rhapsody light show at Supertree Grove. We are a family of 3 looking for local Halal food under $30. What's our best plan?"*
- **Avatar speaks**:  
  *"Welcome to Satay by the Bay! With 45 minutes before the 7:45 PM show, you have an 8-minute walk to Supertree Grove. I recommend ordering 10 sticks of Halal Chicken Satay at Stall 1 for $9, and while they grill, grab fresh Sugar Cane juices from Stall 5. You'll be seated and eating by 7:20 PM with plenty of time to spare!"*
- **Visual Action**: UI displays the **Timed Hawker Route Card** showing Stall 1 + Stall 5, total $16.00, and walking countdown.

### Turn 2: Simulated Stall Rush (Live Auto-Replanning)
- **User speaks into mic**:  
  *"Oh no, the satay stall just announced a 30-minute queue delay! We won't make it to the light show in time!"*
- **Avatar speaks**:  
  *"Don't worry, let's replan right now! Swap Stall 1 for Stall 4: get two hot Cheese & Mushroom Pratas with Dhal for only $10. Their prep time is just 6 minutes, so you'll finish eating by 7:30 PM and still catch the Supertree lights without rushing!"*
- **Visual Action**: Route card dynamically swaps out Stall 1 for Stall 4 and recalculates departure times in real-time.

---

## 🛠️ 5. Python Verification Checklist

- [ ] **Dependencies Installed**: `pip install fastapi uvicorn httpx openai python-dotenv`.
- [ ] **FastAPI Server Running**: `uvicorn main:app --reload --port 8086`.
- [ ] **Perxona Token Proxy**: Verify `GET http://localhost:8086/api/connect-token` returns `{"connect_token": "..."}`.
- [ ] **Streaming Chat**: Verify `POST http://localhost:8086/api/chat` streams `text/event-stream` chunks.
- [ ] **Static Assets**: Browser loads `http://localhost:8086` and renders the avatar stage cleanly.
