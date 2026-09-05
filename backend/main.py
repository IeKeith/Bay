"""
Garden-to-Table Host -- FastAPI Backend for Satay by the Bay AI Concierge
Integrates Perxona Connect API, OpenAI Streaming Chat, and Hawker Knowledge Base.
"""

import hashlib
import json
import os
import random
import re
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from openai import AsyncOpenAI
from pydantic import BaseModel

import httpx


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

# Show-time and planning constants
SHOW_TIME_HOUR = 19
SHOW_TIME_MINUTE = 45
SAFETY_BUFFER_MINUTES = 12
WALK_BUFFER_MINUTES = 10
DINING_BUFFER_MINUTES = 15
MENU_RANDOM_SEED = "satay-menu-v2-live"
AVAILABILITY_BUCKET_SECONDS = 120

# Load Satay by the Bay Knowledge Base (backend file is source of truth)
kb_path = BACKEND_DIR / "satay_by_the_bay.md"
if not kb_path.exists():
    kb_path = PROJECT_ROOT / "satay_by_the_bay.md"

satay_kb = ""
if kb_path.exists():
    satay_kb = kb_path.read_text(encoding="utf-8")
    print(f"[Satay App] Knowledge Base loaded successfully from {kb_path} ({len(satay_kb)} bytes)")
else:
    print("[Satay App] Warning: satay_by_the_bay.md not found. Falling back to built-in catalog.")


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
    base_url=LLM_BASE_URL,
)

# In-memory Token and Catalog Cache
cached_token: Optional[str] = None
cached_scenes: Optional[list] = None
cached_voices: Optional[list] = None


def _safe_float(value: str) -> float:
    try:
        return float(value.strip())
    except Exception:
        return 0.0


def _safe_int(value: str, default: int = 0) -> int:
    try:
        cleaned = re.findall(r"\d+", value)
        if not cleaned:
            return default
        return max(0, int(cleaned[0]))
    except Exception:
        return default


def _format_sg_currency(value: float) -> str:
    return f"SGD ${value:.2f}"


def _hash_seed(*parts: str) -> int:
    payload = "|".join(parts).encode("utf-8")
    return int(hashlib.sha256(payload).hexdigest()[:16], 16)


def _resolve_dish_image(dish_name: str, stall_name: str) -> str:
    text = (f"{dish_name} {stall_name}").lower()
    if "prata" in text or "cheese" in text:
        return "/prata_dish.jpg"
    return "/satay_dish.jpg"


_STALL_HEADER_RE = re.compile(r"^###\s*Stall\s+(\d+):\s*(.+?)\s*$", re.IGNORECASE)
_STALL_STATUS_RE = re.compile(
    r"^\*\*Status\*\*:\s*([^|]+)\s*\|\s*Base Prep Time:\s*~?(\d+)\s*mins?\s*\|\s*Current Queue:\s*~?(\d+)\s*mins?",
    re.IGNORECASE,
)
_SIGNATURE_ITEM_RE = re.compile(
    r"^\-\s*\*(.+?)\*\s*:\s*SGD\s*\$?([0-9]+(?:\.[0-9]{2})?)\s*\|\s*(.+)$",
    re.IGNORECASE,
)
_SOLD_OUT_RULE_RE = re.compile(r"^\-\s*If\s+\*(.+?)\*\s+is\s+sold\s*out\s*->\s*(.+)", re.IGNORECASE)

MENU_CACHE_KEY: Optional[str] = None
MENU_CACHE: Optional[dict] = None
MENU_DATA_CACHE: Dict[int, dict] = {}


def _default_menu_data() -> dict:
    return {
        "version": "fallback",
        "source": str(kb_path),
        "stalls": [
            {"id": 1, "name": "City Satay", "cuisine": "Malaysian Satay", "basePrepMinutes": 12, "baseQueueMinutes": 8, "status": "Open"},
            {"id": 2, "name": "Boon Tat BBQ Seafood", "cuisine": "Seafood Tze Char", "basePrepMinutes": 15, "baseQueueMinutes": 10, "status": "Open"},
            {"id": 3, "name": "Geylang Lor 29 Fried Hokkien Mee", "cuisine": "Wok-Fried Seafood Noodles", "basePrepMinutes": 7, "baseQueueMinutes": 5, "status": "Open"},
            {"id": 4, "name": "Garden Greens & Prata House", "cuisine": "Vegetarian & Muslim-friendly", "basePrepMinutes": 5, "baseQueueMinutes": 3, "status": "Open"},
            {"id": 5, "name": "Marina Refreshments & Sugar Cane Bar", "cuisine": "Cold Pressed Drinks", "basePrepMinutes": 2, "baseQueueMinutes": 2, "status": "Open"},
        ],
        "dishes": [
            {
                "id": "1-1",
                "name": "Chicken Satay (10 sticks)",
                "price": 9.0,
                "tags": ["gluten-free", "halal"],
                "stallId": 1,
                "popularity": 92,
                "imageUrl": "/satay_dish.jpg",
                "description": "Signature satay skewers with peanuts and ketupat rice cake.",
            },
            {
                "id": "3-1",
                "name": "Traditional Prawn Hokkien Mee",
                "price": 7.5,
                "tags": ["pork", "prawn broth", "egg"],
                "stallId": 3,
                "popularity": 88,
                "imageUrl": "/satay_dish.jpg",
                "description": "Wok-fried noodles with prawn broth and egg.",
            },
            {
                "id": "4-1",
                "name": "Crispy Plain Prata (2 pcs with Dhal)",
                "price": 3.5,
                "tags": ["vegetarian", "halal"],
                "stallId": 4,
                "popularity": 86,
                "imageUrl": "/prata_dish.jpg",
                "description": "Fast flatbread option with dhal curry.",
            },
            {
                "id": "5-1",
                "name": "Cold-Pressed Fresh Sugar Cane Juice with Lemon",
                "price": 3.5,
                "tags": ["vegan", "gluten-free"],
                "stallId": 5,
                "popularity": 73,
                "imageUrl": "/satay_dish.jpg",
                "description": "Quick sugary cooling drink for queue times.",
            },
        ],
        "soldOutRules": {},
    }


def _load_menu_catalog_data() -> dict:
    global MENU_CACHE_KEY, MENU_CACHE
    source_bytes = satay_kb.encode("utf-8")
    source_hash = hashlib.sha256(source_bytes).hexdigest() if source_bytes else "fallback"

    if MENU_CACHE_KEY == source_hash and MENU_CACHE:
        return MENU_CACHE

    if not satay_kb.strip():
        fallback = _default_menu_data()
        MENU_CACHE_KEY = source_hash
        MENU_CACHE = fallback
        return fallback

    stalls: Dict[int, dict] = {}
    dishes: List[dict] = []
    sold_out_rules: Dict[str, List[str]] = {}

    current_stall_id: Optional[int] = None
    item_index = 0

    for raw_line in satay_kb.splitlines():
        line = raw_line.strip()
        if not line:
            continue

        stall_match = _STALL_HEADER_RE.match(line)
        if stall_match:
            current_stall_id = int(stall_match.group(1))
            stall_name = stall_match.group(2).strip()
            stalls[current_stall_id] = {
                "id": current_stall_id,
                "name": stall_name,
                "cuisine": "Hawker Stall",
                "basePrepMinutes": 0,
                "baseQueueMinutes": 0,
                "status": "Open",
            }
            continue

        if current_stall_id is None:
            continue

        if line.lower().startswith("**cuisine**") and ":" in line:
            stalls[current_stall_id]["cuisine"] = line.split(":", 1)[1].strip().rstrip(".")
            continue

        if line.lower().startswith("**best for**") and ":" in line:
            stalls[current_stall_id]["bestFor"] = line.split(":", 1)[1].strip()
            continue

        status_match = _STALL_STATUS_RE.match(line)
        if status_match:
            state = status_match.group(1).strip()
            prep_minutes = _safe_int(status_match.group(2), 0)
            queue_minutes = _safe_int(status_match.group(3), 0)
            stalls[current_stall_id].update(
                {
                    "status": state,
                    "basePrepMinutes": prep_minutes,
                    "baseQueueMinutes": queue_minutes,
                }
            )
            continue

        sold_out_match = _SOLD_OUT_RULE_RE.match(line)
        if sold_out_match and current_stall_id is not None:
            sold_dish = sold_out_match.group(1).strip().lower()
            alternatives_blob = sold_out_match.group(2)
            alternatives = [
                alt.strip().lower().strip("*")
                for alt in re.findall(r"\*([^*]+)\*", alternatives_blob)
                if alt.strip()
            ]
            if alternatives:
                sold_out_rules[sold_dish] = alternatives
            continue

        item_match = _SIGNATURE_ITEM_RE.match(line)
        if item_match and current_stall_id is not None:
            dish_name = item_match.group(1).strip()
            price = _safe_float(item_match.group(2))
            detail_blob = item_match.group(3)
            tags = [chunk.strip().strip(",") for chunk in detail_blob.split("|") if chunk.strip()]
            popularity_seed = _hash_seed(dish_name.lower(), stall_name := stalls[current_stall_id]["name"])
            popularity = 72 + (popularity_seed % 23)
            dish_id = f"{current_stall_id}-{item_index + 1}"
            item_index += 1
            dishes.append(
                {
                    "id": dish_id,
                    "name": dish_name,
                    "price": price,
                    "priceDisplay": _format_sg_currency(price),
                    "tags": [t.lower() for t in tags],
                    "stallId": current_stall_id,
                    "popularity": min(99, popularity),
                    "imageUrl": _resolve_dish_image(dish_name, stall_name),
                    "description": f"{dish_name} at {stalls[current_stall_id]['name']} (${price:.2f}).",
                }
            )

    if not stalls or not dishes:
        fallback = _default_menu_data()
        MENU_CACHE_KEY = source_hash
        MENU_CACHE = fallback
        return fallback

    sorted_stalls = [stalls[key] for key in sorted(stalls.keys())]
    MENU_CACHE_KEY = source_hash
    MENU_CACHE = {
        "version": source_hash[:12],
        "source": str(kb_path),
        "stalls": sorted_stalls,
        "dishes": dishes,
        "soldOutRules": sold_out_rules,
    }
    return MENU_CACHE


def _minutes_until_show(now: Optional[datetime] = None) -> int:
    current = now or datetime.now()
    target = current.replace(hour=SHOW_TIME_HOUR, minute=SHOW_TIME_MINUTE, second=0, microsecond=0)
    if current >= target:
        target += timedelta(days=1)
    return max(1, int((target - current).total_seconds() // 60))


def _extract_menu_snapshot(force_refresh: bool = False) -> dict:
    global MENU_DATA_CACHE
    now_bucket = int(time.time() // AVAILABILITY_BUCKET_SECONDS)
    if not force_refresh and now_bucket in MENU_DATA_CACHE:
        return MENU_DATA_CACHE[now_bucket]

    # Availability is keyed by time bucket.  Prune old buckets so a long-lived
    # server does not retain a new snapshot forever every two minutes.
    oldest_bucket_to_keep = now_bucket - 2
    MENU_DATA_CACHE = {
        bucket: snapshot
        for bucket, snapshot in MENU_DATA_CACHE.items()
        if bucket >= oldest_bucket_to_keep
    }

    catalog = _load_menu_catalog_data()
    stalls: List[dict] = []
    dishes_by_stall: Dict[int, List[dict]] = {}
    for dish in catalog["dishes"]:
        dishes_by_stall.setdefault(dish["stallId"], []).append(dish)

    for stall in catalog["stalls"]:
        stall_id = int(stall["id"])
        rng = random.Random(_hash_seed(MENU_RANDOM_SEED, str(now_bucket), str(stall_id)))
        is_open = rng.random() > 0.03 and (stall["status"].lower() != "closed")
        base_queue = int(stall.get("baseQueueMinutes", 0))
        base_prep = int(stall.get("basePrepMinutes", 0))
        queue_noise = rng.randint(-2, 4)
        queue = max(0, base_queue + queue_noise)

        state = "busy" if queue >= 18 else "ready" if queue <= 8 else "moderate"
        stall_dishes = dishes_by_stall.get(stall_id, [])
        sold_out_ids: List[str] = []
        if stall_dishes and rng.random() < 0.23:
            sold_out_ids = [d["id"] for d in rng.sample(stall_dishes, k=rng.randint(1, min(2, len(stall_dishes))))]

        # Keep at least one available dish if the stall has menu items
        if len(stall_dishes) > 0 and len(sold_out_ids) >= len(stall_dishes):
            sold_out_ids = sold_out_ids[:-1]

        dishes_by_stall[stall_id] = stall_dishes
        stalls.append(
            {
                "stallId": stall_id,
                "stallName": stall["name"],
                "isOpen": bool(is_open),
                "status": stall.get("status", "Open"),
                "queueMinutes": queue,
                "prepMinutes": base_prep,
                "estimatedTotalWait": queue + base_prep + 2,
                "availability": state,
                "soldOutDishIds": sold_out_ids,
            }
        )

    snapshot = {
        "bucket": now_bucket,
        "generatedAt": int(time.time()),
        "minutesUntilShow": _minutes_until_show(),
        "stalls": stalls,
        "showTime": f"{SHOW_TIME_HOUR:02d}:{SHOW_TIME_MINUTE:02d}",
    }
    MENU_DATA_CACHE[now_bucket] = snapshot
    return snapshot


def _extract_user_context(message: str, history: Optional[List[dict]] = None) -> dict:
    context_text = message
    if history:
        text_bits = []
        for item in history[-10:]:
            if isinstance(item, dict):
                text_bits.append(f"{item.get('role', '')} {item.get('content', '')}")
            else:
                text_bits.append(f"{getattr(item, 'role', '')} {getattr(item, 'content', '')}")
        context_text = " ".join(text_bits) + f" {message}"

    lower = context_text.lower()

    explicit_minutes = None
    explicit_match = re.search(r"(?:in|within|after|left|remain|remaining)\s*(\d{1,3})\s*(?:minutes?|mins?)", lower)
    if not explicit_match:
        explicit_match = re.search(r"\b(\d{1,3})\s*(?:minutes?|mins?)\b", lower)
    if explicit_match:
        explicit_minutes = int(explicit_match.group(1))

    budget = None
    budget_match = re.search(r"(?:budget|under|within|not\s+more\s+than|up\s+to|max)\s*\$?\s*(\d+(?:\.\d+)?)", lower)
    if budget_match:
        budget = float(budget_match.group(1))
    else:
        budget_match = re.search(r"\$\s*(\d+(?:\.\d+)?)", lower)
        if budget_match:
            budget = float(budget_match.group(1))

    group_match = re.search(r"(?:for|of)\s*(\d+)\s*(?:people|person|pax|guests?)", lower)
    group_size = int(group_match.group(1)) if group_match else 1

    dietary = set()
    if re.search(r"\bvegetarian\b|\bvegan\b|\bplant-friendly\b", lower):
        dietary.add("vegetarian")
    if re.search(r"\bhalal\b", lower):
        dietary.add("halal")
    if re.search(r"\bnut-free\b|\bno peanuts?\b|\bpeanut\b", lower):
        dietary.add("nut-free")
    if re.search(r"\bshellfish\b|\bseafood\b", lower):
        dietary.add("shellfish")

    preferences = []
    preference_terms = [
        "satay",
        "prata",
        "hokkien mee",
        "stingray",
        "seafood",
        "sugar cane",
        "chick",
        "beef",
    ]
    for term in preference_terms:
        if term in lower:
            preferences.append(term)

    is_urgent = any(token in lower for token in ["rush", "urgent", "quick", "tighter", "tight", "immediately", "emergency", "delay"])

    is_order_request = any(token in lower for token in ["recommend", "suggest", "what should", "want", "order", "looking for"])
    is_checkout_intent = bool(
        re.search(r"\b(check(ed)?\s*out|queue\s+number|my\s+queue|confirm\s+my\s+queue|pickup\s+directions|have\s+checked\s+out)\b", lower)
    )
    minutes_to_show = explicit_minutes if explicit_minutes else _minutes_until_show()

    return {
        "minutesToShow": minutes_to_show,
        "budget": budget,
        "groupSize": max(1, group_size),
        "dietaryNeeds": sorted(dietary),
        "dishPreferences": preferences,
        "isUrgent": is_urgent,
        "isOrderRequest": is_order_request,
        "isCheckoutIntent": is_checkout_intent,
    }


def _dish_satisfies_dietary(tags: List[str], context: dict) -> bool:
    normalized = [t.lower() for t in tags]
    needs = set(context.get("dietaryNeeds", []))

    if "halal" in needs:
        if not any("halal" in t for t in normalized):
            return False
    if "vegetarian" in needs or "vegan" in needs:
        if not any(any(kw in t for kw in ["vegetarian", "vegan", "plant", "halal"]) for t in normalized):
            return False
    if "nut-free" in needs:
        if any("peanut" in t or "nut" in t for t in normalized):
            return False
    if "shellfish" in needs:
        if any("shellfish" in t or "prawn" in t or "shrimp" in t for t in normalized):
            return False
    return True


def _get_dish_score(
    dish: dict,
    stall_state: dict,
    context: dict,
) -> float:
    score = 0.0
    if not stall_state.get("isOpen", False):
        return -1000.0

    queue = int(stall_state.get("queueMinutes", 0))
    prep = int(stall_state.get("prepMinutes", 0))
    total_wait = queue + prep
    minutes_to_show = int(context.get("minutesToShow") or _minutes_until_show())
    buffer_window = max(SAFETY_BUFFER_MINUTES + WALK_BUFFER_MINUTES, 1)
    budget = context.get("budget")
    preferences = context.get("dishPreferences", [])

    # Base popularity.
    score += float(dish.get("popularity", 50)) * 0.6

    # Time fit.
    if context.get("isUrgent"):
        score += max(0.0, 18.0 - total_wait)
    remaining_margin = minutes_to_show - DINING_BUFFER_MINUTES - buffer_window - total_wait
    if remaining_margin >= 0:
        score += 25.0
        score += min(20.0, remaining_margin * 0.5)
    else:
        score += max(-30.0, remaining_margin * 2.0)

    # Budget fit.
    if budget is not None:
        if dish.get("price", 999.0) <= budget:
            score += 20.0
        else:
            score -= 15.0

    # Preference match.
    low_name = (dish.get("name", "").lower())
    for pref in preferences:
        if pref in low_name:
            score += 15.0

    return score


def _fallback_chat_reply(
    message: str,
    recommendation_payload: Dict[str, Any],
    persona_name: str,
) -> List[str]:
    context = recommendation_payload.get("context", {})
    primary = recommendation_payload.get("primary", {})
    alternatives = recommendation_payload.get("alternatives", [])

    lower = (message or "").lower()
    if "status" in lower or "queue" in lower or "how long" in lower:
        snapshot = recommendation_payload.get("availability", {}).get("stalls", [])
        if snapshot:
            first_lines = [
                "Here are current stall conditions right now:",
            ]
            first_lines.extend(
                [
                    f"- {(s.get('stallName') or 'Stall ' + str(s.get('stallId', 'unknown')))}: "
                    f"queue {s.get('queueMinutes', 0)} mins, prep {s.get('prepMinutes', 0)} mins"
                    for s in snapshot[:5]
                ]
            )
            first_lines.append("Tell me your budget or dietary preference and I'll lock a route for you.")
            return first_lines

    if primary and context.get("isOrderRequest", False) and not context.get("isCheckoutIntent", False):
        reason = str(primary.get("reason", "A strong match for your current timing and preferences"))
        lines = [
            f"{persona_name}: I recommend **{primary.get('dishName', 'this option')}** from **{primary.get('stallName', 'a nearby stall')}**.",
            f"It is {primary.get('price', 'priced accessibly')} with an estimated pickup of {primary.get('prepTime', '~12 mins')}.",
            f"{reason}. If you want, I can share a backup in {int(max(1, 1)):d} tap if your pace changes.",
        ]
        if alternatives:
            fallback = alternatives[0]
            lines.append(
                f"Backup option: **{fallback.get('dishName')}** at **{fallback.get('stallName')}** ({fallback.get('prepTime', '~12 mins')})."
            )
        return lines

    lines = [
        f"{persona_name}: I can help you plan around the 7:45 PM light show timing, budget, and stalls.",
        "Share your dietary preference or budget and I can give a concrete recommendation in one sentence.",
    ]
    return lines


def _recommend_food_from_context(message: str, history: Optional[List[dict]] = None, force_refresh_availability: bool = False) -> Dict[str, Any]:
    menu = _load_menu_catalog_data()
    availability = _extract_menu_snapshot(force_refresh=force_refresh_availability)
    context = _extract_user_context(message, history)
    catalog_by_stall = {int(st["id"]): st for st in menu["stalls"]}
    availability_by_stall: Dict[int, dict] = {s["stallId"]: s for s in availability["stalls"]}

    candidates: List[dict] = []
    sold_out_lookup: Dict[int, set] = {
        stall_id: set(state.get("soldOutDishIds", []))
        for stall_id, state in availability_by_stall.items()
    }
    for dish in menu["dishes"]:
        stall_id = int(dish["stallId"])
        if stall_id not in availability_by_stall:
            continue
        state = availability_by_stall[stall_id]
        if dish["id"] in sold_out_lookup.get(stall_id, set()):
            continue

        if not _dish_satisfies_dietary(dish.get("tags", []), context):
            continue

        score = _get_dish_score(dish, state, context)
        if score <= -900:
            continue

        total_wait = int(state.get("queueMinutes", 0)) + int(state.get("prepMinutes", 0))
        reason = "matches current show-time window and user context"
        if context.get("budget") is not None and dish.get("price", 0.0) > context["budget"]:
            reason = "closest option under your constraints"
        if context.get("isUrgent"):
            reason = "fastest option for your timing"

        candidates.append(
            {
                **dish,
                "score": score,
                "reason": reason,
                "stallName": catalog_by_stall.get(stall_id, {}).get("name", "Unknown Stall"),
                "estimatedPrepMins": max(total_wait, 0),
                "stallAvailability": state,
            }
        )

    candidates.sort(key=lambda row: row["score"], reverse=True)
    top_candidates = candidates[:3]

    if not top_candidates and context.get("dietaryNeeds"):
        # Relaxed pass for robustness if strict dietary filter blocks all options.
        relaxed_context = dict(context)
        relaxed_context["dietaryNeeds"] = []
        candidates = []
        for dish in menu["dishes"]:
            stall_id = int(dish["stallId"])
            if dish["id"] in sold_out_lookup.get(stall_id, set()):
                continue
            state = availability_by_stall.get(stall_id, {})
            if not state:
                continue
            score = _get_dish_score(dish, state, relaxed_context)
            if score <= -900:
                continue
            total_wait = int(state.get("queueMinutes", 0)) + int(state.get("prepMinutes", 0))
            candidates.append(
                {
                    **dish,
                    "score": score,
                    "reason": "relaxed recommendation when strict match had no available dishes",
                    "stallName": catalog_by_stall.get(stall_id, {}).get("name", "Unknown Stall"),
                    "estimatedPrepMins": max(total_wait, 0),
                    "stallAvailability": state,
                }
            )
        candidates.sort(key=lambda row: row["score"], reverse=True)
        top_candidates = candidates[:3]

    if not top_candidates:
        return {}

    winner = top_candidates[0]
    return {
        "primary": {
            "dishId": winner["id"],
            "dishName": winner["name"],
            "stallId": int(winner["stallId"]),
            "stallName": winner["stallName"],
            "price": winner["priceDisplay"],
            "prepTime": f"~{winner['estimatedPrepMins']} mins",
            "imageUrl": winner.get("imageUrl", "/satay_dish.jpg"),
            "dietaryTags": winner.get("tags", []),
            "score": round(float(winner["score"]), 2),
            "reason": winner["reason"],
            "queueMinutes": int(winner["stallAvailability"].get("queueMinutes", 0)),
            "prepMinutes": int(winner["stallAvailability"].get("prepMinutes", 0)),
            "status": winner["stallAvailability"].get("status", "Unknown"),
        },
        "alternatives": [
            {
                "dishId": item["id"],
                "dishName": item["name"],
                "stallId": int(item["stallId"]),
                "stallName": item["stallName"],
                "price": item["priceDisplay"],
                "prepTime": f"~{item['estimatedPrepMins']} mins",
                "reason": item["reason"],
                "imageUrl": item.get("imageUrl", "/satay_dish.jpg"),
            }
            for item in top_candidates[1:]
        ],
        "context": context,
        "availability": availability,
        "snapshotGeneratedAt": availability.get("generatedAt"),
    }


async def get_perxona_token(force_refresh: bool = False) -> str:
    """Authenticates with Perxona Connect API and returns Bearer JWT."""
    global cached_token
    if is_mock:
        return "mock_connect_token_satay_demo"
    if cached_token and not force_refresh:
        return cached_token

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            res = await client.post(
                f"{PERXONA_API_BASE_URL}/api/v1/connect/auth/login",
                json={"email": PERXONA_CONNECT_EMAIL, "password": PERXONA_CONNECT_PASSWORD},
            )
    except httpx.HTTPError as err:
        # This is an upstream dependency failure, not an application error.
        raise HTTPException(status_code=502, detail="Presenter authentication is temporarily unavailable") from err

    try:
        data = res.json()
    except ValueError:
        data = {}
    if not isinstance(data, dict):
        data = {}

    if res.status_code != 200:
        msg = data.get("detail") or data.get("message") or f"Auth login failed with HTTP {res.status_code}"
        raise HTTPException(status_code=502, detail=msg)

    token = data.get("access_token")
    if not isinstance(token, str) or not token.strip():
        raise HTTPException(status_code=502, detail="Presenter authentication returned no access token")

    cached_token = token
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
    menu = _load_menu_catalog_data()
    menu_snapshot = _extract_menu_snapshot()
    return {
        "mock": is_mock,
        "chat": bool(LLM_API_KEY),
        "presenterUrl": PRESENTER_URL,
        "perxonaBaseUrl": PERXONA_API_BASE_URL,
        "fixedTarget": None,
        "showTime": f"{SHOW_TIME_HOUR:02d}:{SHOW_TIME_MINUTE:02d}",
        "menuVersion": menu.get("version"),
        "snapshotBucket": menu_snapshot.get("bucket"),
        "defaults": {
            "avatarId": "01KVQ595FX6K4SJ182HRNFERTK",
            "sceneId": "01KQEJD0NJFVM20M588K7D1E9Z",
            "voiceId": "01KY40Z9NTKTC5DMH8TD5S77RN",
        },
    }


@app.get("/api/health")
async def get_health():
    menu = _load_menu_catalog_data()
    return {
        "status": "ok",
        "mode": "mock" if is_mock else "live",
        "kbLoaded": bool(satay_kb),
        "menuVersion": menu.get("version"),
        "showTime": f"{SHOW_TIME_HOUR:02d}:{SHOW_TIME_MINUTE:02d}",
    }


@app.get("/api/connect-token")
async def get_connect_token():
    token = await get_perxona_token()
    return {"connect_token": token}


@app.get("/api/menu")
async def get_menu():
    menu = _load_menu_catalog_data()
    return {
        "version": menu["version"],
        "source": menu["source"],
        "showTime": f"{SHOW_TIME_HOUR:02d}:{SHOW_TIME_MINUTE:02d}",
        "stalls": menu["stalls"],
        "dishes": menu["dishes"],
        "soldOutRules": menu.get("soldOutRules", {}),
    }


@app.get("/api/stall-log")
async def get_stall_log():
    snapshot = _extract_menu_snapshot()
    return {"snapshot": snapshot}


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
            "lod1": "https://cdn.perxona.ai/asia/prod/org/01K4440W2737YSN7E4QD4TAHT2/resources/assets/avatar/cc076a06_female_xr_01/rev/01KZAJDH2BGYC87MRDDFCAT40Z/cc076a06_female_xr_01_lod1",
        },
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
            "lod1": "https://cdn.perxona.ai/asia/prod/org/01K4440W2737YSN7E4QD4TAHT2/resources/assets/avatar/cc069a03_male_02/rev/01KY9QFC0DTNMVCSSWMSN194F0/cc069a03_male_02_lod1",
        },
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
            "lod1": "https://cdn.perxona.ai/asia/prod/org/01K4440W2737YSN7E4QD4TAHT2/resources/assets/avatar/cc051_meeks/rev/01KNKF7TYWCTK9MC2XFCT9MGS0/cc051_meeks_lod1",
        },
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
            "lod1": "https://cdn.perxona.ai/asia/prod/org/01K4440W2737YSN7E4QD4TAHT2/resources/assets/avatar/cc046_vroid_female/rev/01KZYX5B51H5WM4XM5X8144Y45/cc046_vroid_female_lod1",
        },
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
            "lod1": "https://cdn.perxona.ai/asia/prod/org/01K4440W2737YSN7E4QD4TAHT2/resources/assets/avatar/cc075_a02_male_emojiboy_funday/rev/01KWV7Y07HH3QTSSMCAZ3SPKT2/cc075_a02_male_emojiboy_funday_lod1",
        },
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
            "lod1": "https://cdn.perxona.ai/asia/prod/org/01K4440W2737YSN7E4QD4TAHT2/resources/assets/avatar/cc069a02_male_01/rev/01M1H98XZBXKJHH6MK894P75KX/cc069a02_male_01_lod1",
        },
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
                headers={"Authorization": f"Bearer {token}"},
            )
            if res.status_code == 200:
                data = res.json()
                items = []
                for item in data.get("items", []):
                    items.append({
                        "id": item.get("scene_id"),
                        "name": item.get("name"),
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
                headers={"Authorization": f"Bearer {token}"},
            )
            if res.status_code == 200:
                data = res.json()
                items = data.get("items", [])
                formatted = []
                for v in items:
                    formatted.append({
                        "id": v.get("id"),
                        "name": v.get("name", "Voice"),
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
    history: Optional[List[ChatMessage]] = None


@app.post("/api/chat")
async def chat_endpoint(req: ChatRequest):
    if not req.message or not req.message.strip():
        raise HTTPException(status_code=400, detail="Message is required")

    # Correct STT input
    corrected_message = correct_phonetic_stt(req.message)

    # Simulate dynamic stall states and pick recommendation payload
    recommendation_payload = _recommend_food_from_context(corrected_message, req.history or [])
    primary = recommendation_payload.get("primary", {})
    should_emit_recommendation = (
        bool(primary)
        and recommendation_payload.get("context", {}).get("isOrderRequest", False)
        and not recommendation_payload.get("context", {}).get("isCheckoutIntent", False)
    )

    menu_snapshot = recommendation_payload.get("availability", {})
    snapshot_lines = []
    for stall in menu_snapshot.get("stalls", []):
        snapshot_lines.append(
            f"- {stall.get('stallName')} (Stall {stall.get('stallId')}): queue {stall.get('queueMinutes')} min, prep {stall.get('prepMinutes')} min, state={stall.get('availability')}"
        )

    recommendation_summary = json.dumps(primary, indent=2, ensure_ascii=False) if primary else "{}"
    alternatives_summary = json.dumps(recommendation_payload.get("alternatives", []), indent=2, ensure_ascii=False)
    rec_context = recommendation_payload.get("context", {})
    user_minute_context = rec_context.get("minutesToShow", _minutes_until_show())

    avatar_map = {av["id"]: av for av in TARGET_AVATAR_LIST}
    active_avatar = avatar_map.get(req.avatarId, TARGET_AVATAR_LIST[0])
    persona_name = f"{active_avatar['role']}"

    context_lines = [
        f"- Target show: Supertree Grove Light Show (7:45 PM)",
        f"- Minutes until show (from context): {user_minute_context} mins",
        f"- Safety buffer: {SAFETY_BUFFER_MINUTES} mins + {WALK_BUFFER_MINUTES} mins walk + {DINING_BUFFER_MINUTES} mins dining",
    ]
    context_lines.extend(snapshot_lines)

    system_prompt = f"""You are {persona_name}, the warm and intelligent AI avatar concierge stationed at Satay by the Bay, Gardens by the Bay, Singapore!

KNOWLEDGE BASE & LIVE STALL DATA:
{satay_kb}

REAL-TIME AVAILABILITY SNAPSHOT:
{chr(10).join(context_lines)}

CURRENT RECOMMENDATION CONTEXT:
Primary candidate:
{recommendation_summary}

Alternative candidates:
{alternatives_summary}

YOUR MISSION:
Help visitors coordinate a stress-free, delicious multi-stall meal that fits their time window, budget, and dietary preferences without missing their 7:45 PM Garden Rhapsody Light Show!

CORE RULES:
1. Tone: Welcoming, reassuring Singaporean hospitality.
2. Attraction Gap Awareness:
   - The primary attraction is the 7:45 PM Supertree Grove Light Show (Garden Rhapsody).
   - Always account for 8–10 min walk + 15 min dining buffer.
3. Multi-Stall Routing:
   - Keep recommendations practical and time-aware.
4. Auto-Replanning:
   - If queue, sold-out or time constraints rise above comfort, propose a faster suitable swap and explain why.
5. Order & Queue Confirmation:
   - When a visitor checks out or shares a queue number, confirm their order details clearly.
6. Recommendation Output:
   - Use concise 2-3 sentence replies.
   - The backend injects one recommendation marker; do not invent your own marker syntax.
7. Food safety:
   - Respect dietary needs in the context and avoid banned ingredients.
"""

    messages = [{"role": "system", "content": system_prompt}]

    # Append recent conversation history (sliding window of 10)
    for h in (req.history or [])[-10:]:
        messages.append({"role": h.role, "content": h.content})

    messages.append({"role": "user", "content": corrected_message})

    async def event_generator():
        if not LLM_API_KEY:
            fallback_lines = _fallback_chat_reply(corrected_message, recommendation_payload, persona_name)
            for line in fallback_lines:
                yield f"data: {json.dumps({'delta': line + ' '})}\n\n"
            if should_emit_recommendation:
                rec_tag = (
                    f"<!--RECOMMEND: {json.dumps(primary, ensure_ascii=False)} -->"
                )
                yield f"data: {json.dumps({'delta': rec_tag})}\n\n"
            yield "data: [DONE]\n\n"
            return

        try:
            stream = await openai_client.chat.completions.create(
                model=LLM_MODEL,
                messages=messages,
                temperature=0.5,
                max_tokens=260,
                stream=True,
            )
            async for chunk in stream:
                delta = chunk.choices[0].delta.content if chunk.choices else None
                if delta:
                    payload = json.dumps({"delta": delta})
                    yield f"data: {payload}\n\n"

            if should_emit_recommendation:
                rec_tag = (
                    f"<!--RECOMMEND: {json.dumps(primary, ensure_ascii=False)} -->"
                )
                yield f"data: {json.dumps({'delta': rec_tag})}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as err:
            # An upstream LLM outage must not turn the chat interaction into a
            # broken SSE response.  Keep the request successful and provide the
            # same deterministic concierge response used when no key is set.
            print(f"[Satay App] LLM streaming warning: {err}")
            fallback_lines = _fallback_chat_reply(corrected_message, recommendation_payload, persona_name)
            for line in fallback_lines:
                yield f"data: {json.dumps({'delta': line + ' '})}\n\n"
            if should_emit_recommendation:
                rec_tag = f"<!--RECOMMEND: {json.dumps(primary, ensure_ascii=False)} -->"
                yield f"data: {json.dumps({'delta': rec_tag})}\n\n"
            yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )


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
