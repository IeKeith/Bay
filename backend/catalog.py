"""Restaurant JSON catalog loading, schema validation, caching, and snapshot projections."""
import hashlib
import json
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Optional

try:
    from backend.config import (
        BACKEND_DIR,
        SHOW_TIME_HOUR,
        SHOW_TIME_MINUTE,
        SINGAPORE,
        get_current_time,
    )
except ImportError:
    from config import (
        BACKEND_DIR,
        SHOW_TIME_HOUR,
        SHOW_TIME_MINUTE,
        SINGAPORE,
        get_current_time,
    )

# Structured restaurant catalog (backend source of truth).
catalog_path = BACKEND_DIR / "data" / "restaurant_catalog.json"
satay_kb = ""

MENU_CACHE_KEY: Optional[str] = None
MENU_CACHE: Optional[dict] = None


def _format_sg_currency(value: float) -> str:
    if value == int(value):
        return f"SGD ${int(value)}"
    return f"SGD ${value:.2f}"



def _hash_seed(*parts: str) -> int:
    payload = "|".join(parts).encode("utf-8")
    return int(hashlib.sha256(payload).hexdigest()[:16], 16)


def _resolve_dish_image(dish_name: str, stall_name: str) -> str:
    text = f"{dish_name} {stall_name}".lower()
    if "satay" in text:
        return "/img/satay.jpeg"
    if "stingray" in text or "prawn" in text or "kang kong" in text or "boon tat" in text:
        return "/img/sambal_stingray.jpeg"
    if "hokkien mee" in text or "carrot cake" in text or "geylang" in text:
        return "/img/hokkien_mee.jpeg"
    if "prata" in text:
        return "/img/roti_prata.jpeg"
    if "biryani" in text:
        return "/img/chicken_biryani.jpeg"
    if "sugarcane" in text or "sugar cane" in text:
        return "/img/sugarcane_juice.jpeg"
    if "coconut" in text:
        return "/img/thai_coconut.jpeg"
    if "calamansi" in text or "lime" in text:
        return "/img/calamansi_juice.jpeg"
    if "kopi" in text or "teh" in text or "coffee" in text or "tea" in text:
        return "/img/kopi_teh.jpeg"
    if "chendol" in text:
        return "/img/chendol.jpeg"
    if "chicken rice" in text or "steamed chicken" in text or "roasted chicken" in text:
        return "/img/chicken_rice.jpeg"
    if "laksa" in text:
        return "/img/katong_laksa.jpeg"
    if "nasi lemak" in text:
        return "/img/nasi_lemak.jpeg"
    if "char kway teow" in text or "mee goreng" in text or "heritage wok" in text:
        return "/img/char_kway_teow.jpeg"
    if "fish soup" in text or "fish bee hoon" in text or "teochew fish" in text:
        return "/img/fish_soup.jpeg"
    if "bak chor mee" in text or "fishball" in text or "minced meat" in text:
        return "/img/bak_chor_mee.jpeg"
    if "duck rice" in text or "kway chap" in text:
        return "/img/duck_rice.jpeg"
    if "bak kut teh" in text or "trotter" in text or "pepper soup" in text:
        return "/img/bak_kut_teh.jpeg"
    if "ice kacang" in text or "tau suan" in text or "sweet heritage" in text:
        return "/img/ice_kacang.jpeg"
    return "/food-placeholder.svg"



def _catalog_error(detail: str) -> ValueError:
    return ValueError(f"{catalog_path}: {detail}")


def _load_menu_catalog_data() -> dict:
    """Load, validate, and normalize the JSON restaurant catalog."""
    global MENU_CACHE_KEY, MENU_CACHE, satay_kb
    if not catalog_path.exists():
        raise _catalog_error("catalog file is missing")

    source_bytes = catalog_path.read_bytes()
    source_hash = hashlib.sha256(source_bytes).hexdigest()
    if MENU_CACHE_KEY == source_hash and MENU_CACHE:
        return MENU_CACHE

    try:
        document = json.loads(source_bytes.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise _catalog_error(f"invalid JSON: {exc}") from exc
    if not isinstance(document, dict) or document.get("schemaVersion") != 1:
        raise _catalog_error("schemaVersion must be 1")
    raw_stalls = document.get("stalls")
    if not isinstance(raw_stalls, list) or not raw_stalls:
        raise _catalog_error("stalls must be a non-empty array")

    stalls: List[dict] = []
    dishes: List[dict] = []
    stall_ids, dish_ids = set(), set()
    for stall_index, raw_stall in enumerate(raw_stalls):
        location = f"stalls[{stall_index}]"
        if not isinstance(raw_stall, dict):
            raise _catalog_error(f"{location} must be an object")
        stall_id = raw_stall.get("id")
        if isinstance(stall_id, bool) or not isinstance(stall_id, int) or stall_id <= 0:
            raise _catalog_error(f"{location}.id must be a positive integer")
        if stall_id in stall_ids:
            raise _catalog_error(f"duplicate stall ID {stall_id}")
        stall_ids.add(stall_id)

        name, cuisine, status = (raw_stall.get(key) for key in ("name", "cuisine", "status"))
        if not all(isinstance(value, str) and value.strip() for value in (name, cuisine, status)):
            raise _catalog_error(f"{location} requires non-empty name, cuisine, and status strings")
        prep, queue = raw_stall.get("basePrepMinutes"), raw_stall.get("baseQueueMinutes")
        if isinstance(prep, bool) or not isinstance(prep, int) or prep <= 0:
            raise _catalog_error(f"{location}.basePrepMinutes must be a positive integer")
        if isinstance(queue, bool) or not isinstance(queue, int) or queue < 0:
            raise _catalog_error(f"{location}.baseQueueMinutes must be a nonnegative integer")

        raw_dishes = raw_stall.get("dishes")
        if not isinstance(raw_dishes, list) or not raw_dishes:
            raise _catalog_error(f"{location}.dishes must be a non-empty array")
        stall = {key: value for key, value in raw_stall.items() if key != "dishes"}
        stall["name"], stall["cuisine"], stall["status"] = name.strip(), cuisine.strip(), status.strip()
        stalls.append(stall)

        for dish_index, raw_dish in enumerate(raw_dishes):
            dish_location = f"{location}.dishes[{dish_index}]"
            if not isinstance(raw_dish, dict):
                raise _catalog_error(f"{dish_location} must be an object")
            dish_id, dish_name = raw_dish.get("id"), raw_dish.get("name")
            if not isinstance(dish_id, str) or not dish_id.strip():
                raise _catalog_error(f"{dish_location}.id must be a non-empty string")
            if dish_id in dish_ids:
                raise _catalog_error(f"duplicate dish ID {dish_id}")
            dish_ids.add(dish_id)
            if not isinstance(dish_name, str) or not dish_name.strip():
                raise _catalog_error(f"{dish_location}.name must be a non-empty string")
            price = raw_dish.get("price")
            if isinstance(price, bool) or not isinstance(price, (int, float)) or price < 0:
                raise _catalog_error(f"{dish_location}.price must be a nonnegative number")
            tags = raw_dish.get("tags", [])
            if not isinstance(tags, list) or not all(isinstance(tag, str) and tag.strip() for tag in tags):
                raise _catalog_error(f"{dish_location}.tags must be an array of non-empty strings")
            price_display = raw_dish.get("priceDisplay", _format_sg_currency(float(price)))
            if not isinstance(price_display, str) or not price_display.strip():
                raise _catalog_error(f"{dish_location}.priceDisplay must be a non-empty string")
            popularity = raw_dish.get("popularity", 72 + _hash_seed(dish_name.lower(), name) % 23)
            if isinstance(popularity, bool) or not isinstance(popularity, int) or not 0 <= popularity <= 100:
                raise _catalog_error(f"{dish_location}.popularity must be an integer from 0 to 100")
            dishes.append({
                **raw_dish,
                "id": dish_id.strip(),
                "name": dish_name.strip(),
                "price": float(price),
                "priceDisplay": price_display.strip(),
                "tags": [tag.strip().lower() for tag in tags],
                "stallId": stall_id,
                "popularity": popularity,
                "imageUrl": raw_dish.get("imageUrl") or _resolve_dish_image(dish_name, name),
                "description": raw_dish.get("description")
                    or f"{dish_name.strip()} at {name.strip()} ({_format_sg_currency(float(price))}).",
            })

    rules = document.get("soldOutRules", {})
    if not isinstance(rules, dict) or not all(
        isinstance(key, str) and isinstance(values, list)
        and all(isinstance(value, str) for value in values)
        for key, values in rules.items()
    ):
        raise _catalog_error("soldOutRules must map strings to arrays of strings")

    stalls.sort(key=lambda stall: stall["id"])
    MENU_CACHE_KEY = source_hash
    MENU_CACHE = {
        "version": source_hash[:12],
        "source": str(catalog_path),
        "sources": [str(catalog_path)],
        "stalls": stalls,
        "dishes": dishes,
        "soldOutRules": rules,
    }
    satay_kb = json.dumps(
        {"stalls": stalls, "dishes": dishes, "soldOutRules": rules},
        ensure_ascii=False,
        separators=(",", ":"),
    )
    return MENU_CACHE


# Validate configured files at startup, before serving a partial catalog.
_load_menu_catalog_data()


def _minutes_until_show(now: Optional[datetime] = None) -> int:
    current = now or get_current_time()
    if current.tzinfo is not None:
        current = current.astimezone(SINGAPORE)
    target = current.replace(hour=SHOW_TIME_HOUR, minute=SHOW_TIME_MINUTE, second=0, microsecond=0)
    if current >= target:
        target += timedelta(days=1)
    return max(1, int((target - current).total_seconds() // 60))


def _extract_menu_snapshot(force_refresh: bool = False) -> dict:
    """Project stored catalog estimates without mutating restaurant state."""
    stalls = []
    for stall in _load_menu_catalog_data()['stalls']:
        queue, prep = stall['baseQueueMinutes'], stall['basePrepMinutes']
        is_open = stall['status'].lower() == 'open'
        stalls.append(dict(stallId=stall['id'], stallName=stall['name'],
                           status=stall['status'], isOpen=is_open,
                           queueMinutes=queue, prepMinutes=prep, estimatedTotalWait=queue+prep,
                           availability=('closed' if not is_open else 'busy' if queue >= 18
                                         else 'ready' if queue <= 8 else 'moderate'),
                           soldOutDishIds=[]))
    return dict(source='catalog', timingBasis='Stored catalog estimates; not live queue readings',
                generatedAt=int(get_current_time().timestamp()),
                minutesUntilShow=_minutes_until_show(), showTime=f'{SHOW_TIME_HOUR:02d}:{SHOW_TIME_MINUTE:02d}', stalls=stalls)

