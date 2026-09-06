"""
Garden-to-Table Host -- FastAPI Backend for Satay by the Bay AI Concierge
Consolidated entrypoint providing configuration, catalog, recommendations, and avatar integration.
"""
import json
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import List, Optional

# Ensure sys.path includes both backend directory and project root
_BACKEND_DIR = Path(__file__).resolve().parent
_PROJECT_ROOT = _BACKEND_DIR.parent
for p in (str(_BACKEND_DIR), str(_PROJECT_ROOT)):
    if p not in sys.path:
        sys.path.insert(0, p)

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

try:
    import backend.agent_tools as agent_tools
    import backend.catalog as catalog
    import backend.config as config
    import backend.perxona as perxona
    import backend.recommender as recommender
except ImportError:
    import agent_tools
    import catalog
    import config
    import perxona
    import recommender

app = FastAPI(title="Garden-to-Table Host AI Concierge")

# Enable CORS for local dev / Vite frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Pydantic Request Models ---

class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    avatarId: Optional[str] = None
    history: Optional[List[ChatMessage]] = None


# --- Concierge & Health Endpoints ---

@app.get("/api/config")
async def get_config():
    menu = catalog._load_menu_catalog_data()
    return {
        "mock": config.is_mock,
        "chat": bool(config.LLM_API_KEY),
        "presenterUrl": config.PRESENTER_URL,
        "perxonaBaseUrl": config.PERXONA_API_BASE_URL,
        "fixedTarget": None,
        "showTime": f"{config.SHOW_TIME_HOUR:02d}:{config.SHOW_TIME_MINUTE:02d}",
        "menuVersion": menu.get("version"),
        "defaults": {
            "avatarId": "01KVQ595FX6K4SJ182HRNFERTK",
            "sceneId": "01K4NY76QJKD6RY4H1ETT4QJ6W",
            "voiceId": "01KY40Z9NTKTC5DMH8TD5S77RN",
        },
    }


@app.get("/api/health")
async def get_health():
    menu = catalog._load_menu_catalog_data()
    return {
        "status": "ok",
        "mode": "mock" if config.is_mock else "live",
        "kbLoaded": bool(catalog.satay_kb),
        "menuVersion": menu.get("version"),
        "showTime": f"{config.SHOW_TIME_HOUR:02d}:{config.SHOW_TIME_MINUTE:02d}",
    }


@app.get("/api/connect-token")
async def get_connect_token():
    token = await perxona.get_perxona_token(force_refresh=True)
    return {"connect_token": token}


@app.get("/api/avatars")
async def get_avatars():
    """Returns avatar options for the kiosk concierge."""
    return {"items": perxona.TARGET_AVATAR_LIST}


@app.get("/api/scenes")
async def get_scenes():
    items = await perxona.get_scenes_data()
    return {"items": items}


@app.get("/api/voices")
async def get_voices():
    items = await perxona.get_voices_data()
    return {"items": items}


# --- Restaurant Catalog & Menu Endpoints ---

@app.get("/api/menu")
async def get_menu():
    menu = catalog._load_menu_catalog_data()
    return {
        "version": menu["version"],
        "source": menu["source"],
        "sources": menu.get("sources", []),
        "isDemo": True,
        "showTime": f"{config.SHOW_TIME_HOUR:02d}:{config.SHOW_TIME_MINUTE:02d}",
        "stalls": menu["stalls"],
        "dishes": menu["dishes"],
        "soldOutRules": menu.get("soldOutRules", {}),
    }


class OrderRequest(BaseModel):
    dishId: str


@app.post("/api/orders")
async def create_order(req: OrderRequest):
    import random
    from datetime import timedelta
    menu = catalog._load_menu_catalog_data()
    dish = next((d for d in menu.get("dishes", []) if str(d.get("id")) == str(req.dishId)), None)
    snapshot = catalog._extract_menu_snapshot()
    stall_avail = {s["stallId"]: s for s in snapshot.get("stalls", [])}

    stall_id = int(dish.get("stallId", 1)) if dish else 1
    state = stall_avail.get(stall_id, {})
    queue_m = int(state.get("queueMinutes", 2))
    prep_m = int(state.get("prepMinutes", 2))
    total_m = queue_m + prep_m

    cur = config.get_current_time()  # Guaranteed 7:00 PM Singapore time
    pickup_dt = cur + timedelta(minutes=total_m)

    order_num = random.randint(100, 999)
    return {
        "orderId": f"ord-{int(cur.timestamp())}-{order_num}",
        "queueNumber": order_num,
        "prepMinutes": prep_m,
        "queueMinutes": queue_m,
        "estimatedTotalWait": total_m,
        "simulationTimestamp": cur.isoformat(),
        "estimatedPickupTime": pickup_dt.isoformat(),
    }


# --- Streaming Chat with Recommendation Engine ---

@app.post("/api/chat")
async def chat_endpoint(req: ChatRequest):
    if not req.message or not req.message.strip():
        raise HTTPException(status_code=400, detail="Message is required")

    # Singlish STT phonetic auto-repair
    corrected_message = recommender.correct_phonetic_stt(req.message)

    avatar_map = {av["id"]: av for av in perxona.TARGET_AVATAR_LIST}
    active_avatar = avatar_map.get(req.avatarId, perxona.TARGET_AVATAR_LIST[0])
    persona_name = f"{active_avatar['role']}"

    sim_time = config.get_current_time().strftime('%I:%M %p')

    system_prompt = f"""You are {persona_name}, the warm, welcoming, and knowledgeable AI avatar concierge stationed at Satay by the Bay, Gardens by the Bay, Singapore!

KNOWLEDGE BASE & TIME WINDOW:
- Current Singapore kiosk time: {sim_time} (19:00).
- Target show: Supertree Grove Light Show (Garden Rhapsody) at 7:45 PM.
- Required buffers: 10 mins walk + 12 mins safety + 15 mins dining (Total buffer: 37 mins).
- Ideal food preparation + queue wait: ~8 to 15 mins.

STALLS & MENU CONTEXT:
{catalog.satay_kb}

YOUR ROLE & MISSION:
Help visitors coordinate a delicious, stress-free hawker meal, dessert, or drink that fits their party size, budget, and dietary preferences without missing their 7:45 PM Garden Rhapsody Light Show!

AGENT TOOL CALLING INSTRUCTIONS:
1. Always call `search_and_recommend_dish` whenever a visitor asks for:
   - Food, dinner, or lunch recommendations -> `category="meal"`
   - Desserts or sweet treats -> `category="dessert"` (NEVER recommend drinks when asked for dessert)
   - Drinks, beverages, or refreshments -> `category="drink"` (NEVER recommend meals when asked for drinks)
   - A different option (e.g. "I want something else", "not prata", "no spicy", "what else") -> look at your previous messages and include the previously suggested dishes in `exclude_dishes` so you recommend an alternative stall!
   - Group dining (e.g. "family of 4", "group of 4", "solo") -> set `party_size` appropriately.
   - Quick / rush orders -> set `urgency="rush"`.
   - Dietary needs -> specify `dietary=["halal"]`, `["vegetarian"]`, etc.
2. Call `check_stall_wait_times` if visitors ask about wait times or queue lines for specific stalls.
3. Call `get_show_info` if visitors ask about the Garden Rhapsody light show schedule.

SPOKEN CONCIERGE GUIDELINES:
1. Tone: Warm, authentic Singaporean hospitality. Friendly, reassuring, and concise.
2. Length: 2 to 3 natural sentences (around 35 to 50 words).
3. Contents: When a dish is recommended by the tool, clearly state:
   - The dish name and stall name.
   - The reason / portion fit for their party.
   - The estimated wait time (e.g., "ready in about 8 minutes").
4. Drink Offer:
   - After recommending a meal, end your response by politely asking if they would like drink suggestions (e.g., "Would you like me to suggest some drinks to go with that?").
   - NEVER name a specific drink unless the user explicitly asks for drinks.
   - When recommending desserts or drinks, do not ask if they want drinks.
5. Pricing & Numbers:
   - State prices in whole dollars (e.g. '14 dollars', '9 SGD'). Never say decimal cents like '14.00'.
6. Plain Text Only:
   - Do NOT use markdown bolding (never output double asterisks like **text**). Output clean text only.
"""

    messages = [{"role": "system", "content": system_prompt}]
    for h in (req.history or [])[-10:]:
        role = h.role if hasattr(h, "role") else h.get("role", "user")
        content = h.content if hasattr(h, "content") else h.get("content", "")
        messages.append({"role": role, "content": content})
    messages.append({"role": "user", "content": corrected_message})

    def _clean_ai_output(text: str) -> str:
        cleaned = text.replace("**", "")
        cleaned = re.sub(r"(\$\d+)\.00\b", r"\1", cleaned)
        cleaned = re.sub(r"\b(\d+)\.00\b", r"\1", cleaned)
        return cleaned

    async def event_generator():
        if not config.LLM_API_KEY:
            yield f"data: {json.dumps({'delta': 'Error: OpenAI API key is not configured.'})}\n\n"
            yield "data: [DONE]\n\n"
            return

        try:
            # Step 1: Initial call with native tool calling
            first_resp = await config.openai_client.chat.completions.create(
                model=config.LLM_MODEL,
                messages=messages,
                tools=agent_tools.AGENT_TOOLS,
                tool_choice="auto",
                temperature=0.3,
            )

            first_choice = first_resp.choices[0]
            recommended_card = None

            if first_choice.message.tool_calls:
                messages.append(first_choice.message)

                for tc in first_choice.message.tool_calls:
                    fn_name = tc.function.name
                    try:
                        fn_args = json.loads(tc.function.arguments or "{}")
                    except Exception:
                        fn_args = {}

                    tool_result = agent_tools.execute_agent_tool(fn_name, fn_args)
                    if fn_name == "search_and_recommend_dish" and tool_result.get("card"):
                        recommended_card = tool_result["card"]

                    messages.append({
                        "role": "tool",
                        "tool_call_id": tc.id,
                        "name": fn_name,
                        "content": json.dumps(tool_result, ensure_ascii=False),
                    })

                # Step 2: Stream spoken response synthesized from tool result
                stream = await config.openai_client.chat.completions.create(
                    model=config.LLM_MODEL,
                    messages=messages,
                    temperature=0.5,
                    max_tokens=180,
                    stream=True,
                )
                async for chunk in stream:
                    delta = chunk.choices[0].delta.content if chunk.choices else None
                    if delta:
                        yield f"data: {json.dumps({'delta': _clean_ai_output(delta)})}\n\n"

            else:
                # No tool calls: conversational or general query
                content = first_choice.message.content or ""
                if content:
                    words = content.split(" ")
                    for i in range(0, len(words), 4):
                        chunk_text = (" " if i > 0 else "") + " ".join(words[i:i+4])
                        yield f"data: {json.dumps({'delta': _clean_ai_output(chunk_text)})}\n\n"

            # Step 3: Emit 100% matched recommendation tag if a dish was recommended by tool
            if recommended_card:
                rec_tag = f"<!--RECOMMEND: {json.dumps(recommended_card, ensure_ascii=False)} -->"
                yield f"data: {json.dumps({'delta': rec_tag})}\n\n"

            yield "data: [DONE]\n\n"

        except Exception as err:
            print(f"[Satay App] Agent streaming error: {err}")
            yield f"data: {json.dumps({'delta': f'Error connecting to AI service: {err}'})}\n\n"
            yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )


# --- Static Mounts ---

# Mount Food Images
img_dir = config.BACKEND_DIR / "img"
if img_dir.exists():
    app.mount("/img", StaticFiles(directory=str(img_dir)), name="food_images")
    print(f"[Satay App] Food images mounted from: {img_dir}")

# Mount Static Frontend Files (production build)
public_dir = config.BACKEND_DIR / "public"
if not public_dir.exists():
    public_dir = config.PROJECT_ROOT / "public"
if public_dir.exists():
    app.mount("/", StaticFiles(directory=str(public_dir), html=True), name="static")
    print(f"[Satay App] Static files mounted from: {public_dir}")


if __name__ == "__main__":
    import uvicorn

    print("\n==================================================")
    print("Garden-to-Table Host (FastAPI Python) Ready!")
    print(f"URL: http://localhost:{config.PORT}")
    print("==================================================\n")
    uvicorn.run(app, host="0.0.0.0", port=config.PORT)
