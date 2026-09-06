"""User context extraction, catalog question resolution, dish scoring, and recommendation engine."""
import re
from typing import Any, Dict, List, Optional

try:
    from backend.catalog import (
        _extract_menu_snapshot,
        _load_menu_catalog_data,
        _minutes_until_show,
    )
    from backend.config import (
        DINING_BUFFER_MINUTES,
        SAFETY_BUFFER_MINUTES,
        WALK_BUFFER_MINUTES,
    )
except ImportError:
    from catalog import (
        _extract_menu_snapshot,
        _load_menu_catalog_data,
        _minutes_until_show,
    )
    from config import (
        DINING_BUFFER_MINUTES,
        SAFETY_BUFFER_MINUTES,
        WALK_BUFFER_MINUTES,
    )

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


def _extract_user_context(message: str, history: Optional[List[dict]] = None) -> dict:
    context_text = message
    if history:
        text_bits = []
        for item in history[-10:]:
            if isinstance(item, dict):
                if item.get('role') == 'user':
                    text_bits.append(str(item.get('content', '')))
            else:
                if getattr(item, 'role', '') == 'user':
                    text_bits.append(str(getattr(item, 'content', '')))
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

    def _parse_group(text: str) -> Optional[int]:
        low = text.lower()
        if re.search(r"\b(solo|alone|just me|for myself|by myself|only me|single person|single diner|1 pax|1 person|1 people)\b", low):
            return 1
        if re.search(r"\b(couple|both of us|the two of us|2 pax|2 people|2 persons)\b", low):
            return 2
        m = re.search(r"\b(?:family|group|party|table|for|of)?\s*(\d{1,2})\s*(?:people|person|pax|guests?|members?|friends?|colleagues?|of us)\b", low)
        if m:
            return int(m.group(1))
        m2 = re.search(r"\b(?:family|group|party)\s+(?:of\s+)?(\d{1,2})\b", low)
        if m2:
            return int(m2.group(1))
        m3 = re.search(r"\bwith\s+(\d{1,2})\s+(?:friends?|colleagues?|people|others)\b", low)
        if m3:
            return int(m3.group(1)) + 1
        return None

    # Check current message first, then fall back to recent conversation history in reverse
    group_size = _parse_group(message)
    if group_size is None and history:
        for item in reversed(history[-10:]):
            txt = item.get('content', '') if isinstance(item, dict) else getattr(item, 'content', '')
            role = item.get('role', '') if isinstance(item, dict) else getattr(item, 'role', '')
            if role == 'user' and txt:
                h_size = _parse_group(txt)
                if h_size is not None:
                    group_size = h_size
                    break
    if group_size is None:
        group_size = 1

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
        "chicken rice", "laksa", "nasi lemak", "char kway teow", "mee goreng",
        "fish soup", "fish bee hoon", "bak chor mee", "fishball", "duck rice",
        "kway chap", "bak kut teh", "pig’s trotters", "biryani", "mee rebus",
        "ice kacang", "tau suan",
    ]
    preferences = [term for term in preference_terms if term in message.lower()]
    if not preferences:
        preferences = [term for term in preference_terms if term in lower]

    is_urgent = any(token in lower for token in ["rush", "urgent", "quick", "tighter", "tight", "immediately", "emergency", "delay"])

    wants_drink_or_dessert = bool(re.search(r"\b(drink|drinks|beverage|beverages|juice|sugar cane|sugarcane|coconut|refreshment|refreshing|dessert|desserts|chendol|ice kacang|tau suan|sweet|cold)\b", message.lower()))

    is_order_request = any(token in message.lower() for token in ["recommend", "suggest", "what should", "want", "what can", "looking for"])
    is_checkout_intent = bool(re.search(
        r"\b(check(?:ed)?\s*out|queue\s+number|my\s+(?:queue|order)|track\s+(?:an?\s+)?order|"
        r"(?:place|submit|confirm|cancel)\s+(?:(?:an?|the|my)\s+)?order|"
        r"order\s+(?:me|for me)|(?:want|like|can i|can you)\s+(?:to\s+)?order|status\s+(?:of\s+)?#\s*\d+)\b|^order\b",
        message.lower()))
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
        "wantsDrinkOrDessert": wants_drink_or_dessert,
    }


def _catalog_question(message: str, history: Optional[List[dict]] = None) -> dict:
    """Resolve explicit catalog references first; use history only for follow-ups."""
    menu = _load_menu_catalog_data()

    def tokens(text):
        return set(re.findall(r"[a-z0-9]+", text.lower()))

    def resolve(text):
        words = tokens(text)
        numbered = {int(n) for n in re.findall(r"\b(?:stall|restaurant)\s*#?\s*(\d+)\b", text.lower())}
        if numbered:
            return [s['id'] for s in menu['stalls'] if s['id'] in numbered], [], True
        ignored = {'the', 'and', 'with', 'for', 'stall', 'restaurant', 'kitchen', 'house', 'bar',
                   'corner', 'halal', 'certified', 'rice', 'noodle', 'noodles', 'soup'}
        named = [s['id'] for s in menu['stalls']
                 if (tokens(s['name']) - ignored) and (tokens(s['name']) - ignored) <= words]
        dish_scores = [(len(tokens(d['name']) & words - {'the', 'and', 'with', 'in', 'of'}), d)
                       for d in menu['dishes']]
        best = max((score for score, _ in dish_scores), default=0)
        dishes = [d for score, d in dish_scores if score == best and score > 0]
        if named:
            return named, [], True
        if dishes:
            return sorted({d['stallId'] for d in dishes}), [d['id'] for d in dishes], True
        return [], [], False

    stall_ids, dish_ids, explicit = resolve(message)
    if not explicit and re.search(r"\b(it|there|that|this|those|they|their)\b", message.lower()):
        for item in reversed(history or []):
            text = item.get('content', '') if isinstance(item, dict) else item.content
            stall_ids, dish_ids, explicit = resolve(text)
            if explicit:
                break
    selected_stalls = [s for s in menu['stalls'] if not explicit or s['id'] in stall_ids]
    selected_dishes = [d for d in menu['dishes'] if d['stallId'] in {s['id'] for s in selected_stalls}
                       and (not dish_ids or d['id'] in dish_ids)]
    return dict(stallIds=stall_ids, explicit=explicit, stalls=selected_stalls, dishes=selected_dishes)


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


def _is_sharing_dish(dish: dict) -> bool:
    stall_id = int(dish.get("stallId", 0))
    low_name = dish.get("name", "").lower()
    # Stalls 1 (Satay platters) and 2 (BBQ Seafood communal platters)
    if stall_id in (1, 2):
        return True
    if any(k in low_name for k in ["sharing", "sticks", "platter", "stingray", "prawn", "kang kong", "for 2", "for 4", "platter"]):
        return True
    return False


def _is_beverage_or_dessert(dish: dict) -> bool:
    stall_id = int(dish.get("stallId", 0))
    if stall_id in (5, 15):
        return True
    low_name = dish.get("name", "").lower()
    return any(w in low_name for w in ["juice", "coconut", "drink", "chendol", "ice kacang", "tau suan"])


def _format_group_portion(dish: dict, group_size: int) -> dict:
    """Scales portion name, price, and reason when ordering for a group so it makes realistic sense."""
    name = dish.get("name", "Dish")
    price = float(dish.get("price", 0.0))
    stall_name = dish.get("stallName", "a nearby stall")
    stall_id = int(dish.get("stallId", 0))

    if group_size <= 1:
        price_display = dish.get("priceDisplay") or (f"SGD ${int(price)}" if price.is_integer() else f"SGD ${price:.2f}")
        return {
            "dishName": name,
            "price": price_display,
            "portionNote": "1 individual portion",
            "reason": dish.get("reason", "quick single-tray comfort meal ideal for solo dining"),
        }

    # Satay scaling: 10 sticks is not enough for 4 people; 4 people typically share 25-30 sticks!
    if "satay" in name.lower() or stall_id == 1:
        sets = max(2, (group_size * 7 + 9) // 10)  # for 4 pax -> 3 sets = 30 sticks; for 2 pax -> 2 sets = 20 sticks
        sticks = sets * 10
        total_price = sets * price
        price_str = f"SGD ${int(total_price)}" if total_price.is_integer() else f"SGD ${total_price:.2f}"
        return {
            "dishName": f"Charcoal-Grilled Satay Feast ({sticks} sticks)",
            "price": price_str,
            "portionNote": f"{sticks} sticks ({sets} orders) for your party of {group_size}",
            "reason": f"A generous {sticks}-stick charcoal-grilled sharing feast with peanut gravy and ketupat for your party of {group_size}",
        }

    # BBQ Seafood / Communal (Stall 2)
    if stall_id == 2 or "stingray" in name.lower():
        if group_size >= 4:
            return {
                "dishName": f"{name} (Medium/Large Sharing Platter)",
                "price": "SGD $22",
                "portionNote": f"Medium/Large sharing platter for {group_size} people",
                "reason": f"A hearty communal seafood platter to share among your group of {group_size}",
            }

    # Individual meals (Chicken Rice, Noodles, Laksa, Prata):
    # Recommend ordering group_size portions from the same stall!
    total_price = price * group_size
    price_str = f"SGD ${int(total_price)}" if total_price.is_integer() else f"SGD ${total_price:.2f}"
    unit = "bowls" if any(k in name.lower() for k in ["noodle", "mee", "laksa", "soup"]) else ("plates" if any(k in name.lower() for k in ["rice", "prata", "kway teow"]) else "portions")
    return {
        "dishName": f"{name} ({group_size} portions)",
        "price": price_str,
        "portionNote": f"{group_size} individual portions from {stall_name}",
        "reason": f"Ordering {group_size} {unit} from {stall_name} keeps your party together in a single quick queue before the 7:45 PM show",
    }


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
    group_size = int(context.get("groupSize", 1))
    is_sharing = _is_sharing_dish(dish)
    is_drink = _is_beverage_or_dessert(dish)
    wants_drink = context.get("wantsDrinkOrDessert", False)

    # Base popularity.
    score += float(dish.get("popularity", 50)) * 0.6

    # Meal vs Beverage/Dessert priority:
    if wants_drink and is_drink:
        score += 35.0
    elif not wants_drink and is_drink:
        score -= 20.0  # Main meals should take precedence when asking for food/dinner

    # Group size & portion format fit:
    if group_size >= 3:
        if is_sharing:
            score += 25.0  # Boost for communal sharing platters (e.g. Satay feast)
        else:
            score += 25.0  # Boost for ordering multiple portions from same stall (unified queue)
    elif group_size == 2:
        if is_sharing:
            score += 15.0
        else:
            score += 15.0
    else:  # Solo diner (group_size == 1)
        if not is_sharing:
            score += 25.0  # Big boost for individual comfort meals (Chicken Rice, Laksa, Noodles)
        else:
            score -= 20.0  # Heavy sharing platters are awkward for a solo diner

    # Time fit.
    if context.get("isUrgent"):
        score += max(0.0, 18.0 - total_wait)
    remaining_margin = minutes_to_show - DINING_BUFFER_MINUTES - buffer_window - total_wait
    if remaining_margin >= 0:
        score += 25.0
        score += min(20.0, remaining_margin * 0.5)
    else:
        score += max(-30.0, remaining_margin * 2.0)

    # Queue tolerance solo vs group:
    if group_size == 1 and total_wait > 18:
        score -= 12.0  # Solo diner cannot split up and must queue alone
    elif group_size >= 3:
        score += 5.0   # Groups can divide and conquer queues

    # Budget fit.
    if budget is not None:
        if group_size >= 3:
            per_pax_budget = budget / group_size
            if is_sharing:
                if dish.get("price", 999.0) <= budget:
                    score += 20.0
                else:
                    score -= 15.0
            else:
                if dish.get("price", 999.0) <= per_pax_budget:
                    score += 20.0
                else:
                    score -= 15.0
        else:
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
    if context.get('isCheckoutIntent'):
        return ["I provide restaurant information and recommendations only. I cannot place orders, process checkout, or track queue numbers."]
    relevant = recommendation_payload.get('catalogContext', {})
    if relevant.get('explicit') and not relevant.get('stalls'):
        return ["That stall is not in the restaurant catalog. Please give a listed stall name or number."]
    if any(term in lower for term in ("status", "queue", "how long", "wait", "open", "availability", "food time", "prep", "pickup")):
        snapshot = recommendation_payload.get("availability", {}).get("stalls", [])
        if relevant.get('explicit'):
            snapshot = [s for s in snapshot if s['stallId'] in relevant['stallIds']]
        if snapshot:
            first_lines = [
                "Stored catalog estimates, not live queue readings:",
            ]
            first_lines.extend(
                [
                    f"- {(s.get('stallName') or 'Stall ' + str(s.get('stallId', 'unknown')))}: "
                    f"status {s['status']}; queue {s['queueMinutes']} mins, preparation {s['prepMinutes']} mins, total estimated wait {s['estimatedTotalWait']} mins."
                    for s in snapshot
                ]
            )
            return first_lines

    if any(term in lower for term in ('menu', 'price', 'cost', 'how much', 'serve', 'sell', 'tell me', 'what is', 'what are')) or (relevant.get('explicit') and not context.get('isOrderRequest')):
        stalls = {s['id']: s['name'] for s in relevant.get('stalls', [])}
        return ["From the demonstration restaurant catalog:"] + [
            f"{stalls[d['stallId']]}: {d['name']} — {d['priceDisplay']}. {d.get('description', '')}"
            for d in relevant.get('dishes', [])]

    if primary and context.get("isOrderRequest", False) and not context.get("isCheckoutIntent", False):
        reason = str(primary.get("reason", "A strong match for your current timing and preferences"))
        lines = [
            f"{persona_name}: I recommend **{primary.get('dishName', 'this option')}** from **{primary.get('stallName', 'a nearby stall')}**.",
            f"It is {primary.get('price', 'priced accessibly')} with a stored catalog wait estimate of {primary.get('prepTime', 'unavailable')}, not a live queue reading.",
            f"{reason}. I can also suggest an alternative.",
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


def _recommend_food_from_context(
    message: str,
    history: Optional[List[dict]] = None,
    force_refresh_availability: bool = False,
) -> Dict[str, Any]:
    menu = _load_menu_catalog_data()
    availability = _extract_menu_snapshot(force_refresh=force_refresh_availability)
    context = _extract_user_context(message, history)
    relevant = _catalog_question(message, history)
    catalog_by_stall = {int(st["id"]): st for st in menu["stalls"]}
    availability_by_stall: Dict[int, dict] = {s["stallId"]: s for s in availability["stalls"]}

    candidates: List[dict] = []
    sold_out_lookup: Dict[int, set] = {
        stall_id: set(state.get("soldOutDishIds", []))
        for stall_id, state in availability_by_stall.items()
    }
    for dish in menu["dishes"]:
        if relevant['explicit'] and dish not in relevant['dishes']:
            continue
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
        group_size = int(context.get("groupSize", 1))
        is_sharing = _is_sharing_dish(dish)
        if group_size >= 3 and is_sharing:
            reason = f"communal sharing favourite ideal for your party of {group_size}"
        elif group_size == 1 and not is_sharing:
            reason = "quick single-tray comfort meal ideal for solo dining"
        elif context.get("budget") is not None and dish.get("price", 0.0) > context["budget"]:
            reason = "closest option under your constraints"
        elif context.get("isUrgent"):
            reason = "fastest option for your timing"
        else:
            reason = f"matches current show-time window for {group_size} {'people' if group_size > 1 else 'guest'}"

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
            if relevant['explicit'] and dish not in relevant['dishes']:
                continue
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
        return {"availability": availability, "context": context, "catalogContext": relevant}

    winner = top_candidates[0]
    group_size = int(context.get("groupSize", 1))
    winner_portion = _format_group_portion(winner, group_size)

    return {
        "primary": {
            "dishId": winner["id"],
            "dishName": winner_portion["dishName"],
            "stallId": int(winner["stallId"]),
            "stallName": winner["stallName"],
            "price": winner_portion["price"],
            "prepTime": f"~{winner['estimatedPrepMins']} mins",
            "estimatedTotalWait": winner["estimatedPrepMins"],
            "imageUrl": winner.get("imageUrl", "/satay_dish.jpg"),
            "dietaryTags": winner.get("tags", []),
            "score": round(float(winner["score"]), 2),
            "reason": winner_portion["reason"],
            "portionNote": winner_portion["portionNote"],
            "queueMinutes": int(winner["stallAvailability"].get("queueMinutes", 0)),
            "prepMinutes": int(winner["stallAvailability"].get("prepMinutes", 0)),
            "status": winner["stallAvailability"].get("status", "Unknown"),
        },
        "alternatives": [
            {
                "dishId": item["id"],
                "dishName": _format_group_portion(item, group_size)["dishName"],
                "stallId": int(item["stallId"]),
                "stallName": item["stallName"],
                "price": _format_group_portion(item, group_size)["price"],
                "prepTime": f"~{item['estimatedPrepMins']} mins",
                "prepMinutes": int(item["stallAvailability"].get("prepMinutes", 0)),
                "queueMinutes": int(item["stallAvailability"].get("queueMinutes", 0)),
                "estimatedTotalWait": item["estimatedPrepMins"],
                "reason": _format_group_portion(item, group_size)["reason"],
                "portionNote": _format_group_portion(item, group_size)["portionNote"],
                "imageUrl": item.get("imageUrl", "/satay_dish.jpg"),
            }
            for item in top_candidates[1:]
        ],
        "context": context,
        "catalogContext": relevant,
        "availability": availability,
        "snapshotGeneratedAt": availability.get("generatedAt"),
    }
