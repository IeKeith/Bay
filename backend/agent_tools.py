"""Agent Tools and Functions for OpenAI Tool-Calling Concierge."""
import json
import re
from typing import Any, Dict, List, Optional

try:
    from backend import catalog, config
except ImportError:
    import catalog
    import config


# --- Category Classification ---

def is_dessert(dish: dict) -> bool:
    stall_id = int(dish.get("stallId", 0))
    low_name = dish.get("name", "").lower()
    return stall_id == 15 or "chendol" in low_name or "ice kacang" in low_name or "dessert" in [t.lower() for t in dish.get("tags", [])]


def is_beverage(dish: dict) -> bool:
    stall_id = int(dish.get("stallId", 0))
    low_name = dish.get("name", "").lower()
    if is_dessert(dish):
        return False
    if stall_id == 5:
        return True
    return any(w in low_name for w in ["juice", "coconut", "drink", "kopi", "teh", "coffee", "tea"])


def is_meal(dish: dict) -> bool:
    return not is_dessert(dish) and not is_beverage(dish)


# --- Portion and Group Sizing Formatter ---

def format_group_portion(dish: dict, party_size: int, urgency: str = "normal") -> dict:
    name = dish.get("name", "Dish")
    price = float(dish.get("price", 0.0))
    stall_name = dish.get("stallName", "a nearby stall")
    stall_id = int(dish.get("stallId", 0))
    prep_wait = dish.get("estimatedPrepMins", 8)
    is_urgent = urgency == "rush"

    if party_size <= 1:
        price_display = dish.get("priceDisplay") or (f"SGD ${int(price)}" if price.is_integer() else f"SGD ${price:.2f}")
        if is_dessert(dish):
            reason = "A refreshing traditional sweet treat to conclude your dining experience"
        elif is_beverage(dish):
            reason = f"Quickest refreshing beverage (ready in ~{prep_wait} mins total)" if is_urgent else "A refreshing local beverage to complement your meal"
        elif is_urgent:
            reason = f"Fastest hot meal option (ready in ~{prep_wait} mins total) to keep you on schedule"
        else:
            reason = "Quick single-tray comfort meal ideal for solo dining"
        return {
            "dishName": name,
            "price": price_display,
            "portionNote": "1 individual portion",
            "reason": reason,
        }

    # Satay scaling:
    if "satay" in name.lower() or stall_id == 1:
        sets = max(2, (party_size * 7 + 9) // 10)  # for 4 pax -> 3 sets = 30 sticks
        sticks = sets * 10
        total_price = sets * price
        price_str = f"SGD ${int(total_price)}" if total_price.is_integer() else f"SGD ${total_price:.2f}"
        if is_urgent:
            reason = f"A fast-prep charcoal-grilled sharing feast ({sticks} sticks) ready in ~{prep_wait} mins total for your party of {party_size}"
        else:
            reason = f"A generous {sticks}-stick charcoal-grilled sharing feast with peanut gravy and ketupat for your party of {party_size}"
        return {
            "dishName": f"Charcoal-Grilled Satay Feast ({sticks} sticks)",
            "price": price_str,
            "portionNote": f"{sticks} sticks ({sets} orders) for your party of {party_size}",
            "reason": reason,
        }

    # BBQ Seafood / Communal (Stall 2)
    if stall_id == 2 or "stingray" in name.lower():
        if party_size >= 4:
            reason = (f"A quick-grill communal seafood platter (~{prep_wait} mins total) to share among your group of {party_size}"
                      if is_urgent else f"A hearty communal seafood platter to share among your group of {party_size}")
            return {
                "dishName": f"{name} (Medium/Large Sharing Platter)",
                "price": "SGD $22",
                "portionNote": f"Medium/Large sharing platter for {party_size} people",
                "reason": reason,
            }

    # Drinks / Desserts for group:
    if is_dessert(dish) or is_beverage(dish):
        total_price = price * party_size
        price_str = f"SGD ${int(total_price)}" if total_price.is_integer() else f"SGD ${total_price:.2f}"
        item_type = "desserts" if is_dessert(dish) else "drinks"
        return {
            "dishName": f"{name} ({party_size} portions)",
            "price": price_str,
            "portionNote": f"{party_size} {item_type} for your party of {party_size}",
            "reason": f"{party_size} refreshing {item_type} to enjoy together before the light show",
        }

    # Individual meals (Chicken Rice, Noodles, Laksa, Prata):
    total_price = price * party_size
    price_str = f"SGD ${int(total_price)}" if total_price.is_integer() else f"SGD ${total_price:.2f}"
    unit = "bowls" if any(k in name.lower() for k in ["noodle", "mee", "laksa", "soup"]) else ("plates" if any(k in name.lower() for k in ["rice", "prata", "kway teow"]) else "portions")
    if is_urgent:
        reason = f"Ordering {party_size} {unit} from {stall_name} is the quickest hot meal option (~{prep_wait} mins total) and keeps your party in a single quick queue"
    else:
        reason = f"Ordering {party_size} {unit} from {stall_name} keeps your party together in a single quick queue before the 7:45 PM show"
    return {
        "dishName": f"{name} ({party_size} portions)",
        "price": price_str,
        "portionNote": f"{party_size} individual portions from {stall_name}",
        "reason": reason,
    }


# --- Tool Implementation: search_and_recommend_dish ---

def search_and_recommend_dish(
    category: str = "meal",
    party_size: int = 1,
    dietary: Optional[List[str]] = None,
    exclude_dishes: Optional[List[str]] = None,
    urgency: str = "normal",
    preference: Optional[str] = None,
    budget: Optional[float] = None,
) -> dict:
    """Core tool that searches the catalog, filters out excluded/irrelevant items, checks wait times, and returns the best dish."""
    menu = catalog._load_menu_catalog_data()
    snapshot = catalog._extract_menu_snapshot()
    stalls_by_id = {s["id"]: s for s in menu.get("stalls", [])}
    stall_avail = {s["stallId"]: s for s in snapshot.get("stalls", [])}

    party_size = max(1, party_size)
    dietary_list = [d.lower().strip() for d in (dietary or [])]
    exclude_list = [e.lower().strip() for e in (exclude_dishes or []) if e.strip()]
    pref_term = (preference or "").lower().strip()
    category_norm = category.lower().strip()

    scored_candidates = []

    for dish in menu.get("dishes", []):
        dish_name = dish.get("name", "")
        low_dish_name = dish_name.lower()
        dish_id = str(dish.get("id", ""))
        stall_id = int(dish.get("stallId", 0))
        stall = stalls_by_id.get(stall_id, {})
        stall_name = stall.get("name", "")
        low_stall_name = stall_name.lower()
        state = stall_avail.get(stall_id, {})

        if not state.get("isOpen", False):
            continue

        # 1. Category Filtering
        if category_norm in ("dessert", "desserts"):
            if not is_dessert(dish):
                continue
        elif category_norm in ("drink", "drinks", "beverage", "beverages"):
            if not is_beverage(dish):
                continue
        elif category_norm in ("meal", "food", "dinner", "lunch"):
            if not is_meal(dish):
                continue
        # category_norm == "any" allows anything

        # 2. Exclude Dishes (Handles "something else", "not prata", previous recommendations)
        is_excluded = False
        for exc in exclude_list:
            if exc in low_dish_name or exc in low_stall_name or exc == dish_id:
                is_excluded = True
                break
            # Common token match (e.g. "prata", "satay", "chicken rice")
            tokens = [t for t in re.split(r"\s+", exc) if len(t) > 3]
            if tokens and any(t in low_dish_name for t in tokens):
                is_excluded = True
                break
        if is_excluded:
            continue

        # 3. Dietary Requirements
        tags = [t.lower() for t in dish.get("tags", [])]
        if "halal" in dietary_list and not any("halal" in t for t in tags):
            continue
        if ("vegetarian" in dietary_list or "vegan" in dietary_list) and not any(k in t for t in tags for k in ["vegetarian", "vegan", "plant"]):
            continue
        if "nut-free" in dietary_list and any("peanut" in t or "nut" in t for t in tags):
            continue
        if "shellfish" in dietary_list and any("shellfish" in t or "prawn" in t for t in tags):
            continue

        # 4. Wait Time
        queue_m = int(state.get("queueMinutes", 0))
        prep_m = int(state.get("prepMinutes", 0))
        total_wait = queue_m + prep_m

        # 5. Scoring
        score = float(dish.get("popularity", 50))

        # Urgency & Wait time
        if urgency == "rush":
            score += max(0.0, 25.0 - total_wait * 1.5)
        else:
            score += max(0.0, 15.0 - total_wait * 0.5)

        # Party size fit
        if party_size >= 3:
            if stall_id in (1, 2):
                score += 30.0  # Satay platters and BBQ seafood sharing
            else:
                score += 20.0  # Fast single-stall multi-bowl orders
        elif party_size == 1:
            if stall_id in (1, 2) and "sharing" in low_dish_name:
                score -= 20.0
            else:
                score += 15.0

        # Preference match
        if pref_term:
            if pref_term in low_dish_name or pref_term in low_stall_name:
                score += 40.0

        # Budget fit
        if budget is not None:
            effective_price = float(dish.get("price", 0)) * (party_size if party_size > 1 and stall_id not in (1, 2) else 1)
            if effective_price <= budget:
                score += 20.0
            else:
                score -= 30.0

        dish_with_meta = {
            **dish,
            "stallName": stall_name,
            "stallAvailability": state,
            "estimatedPrepMins": total_wait,
            "score": score,
        }
        scored_candidates.append(dish_with_meta)

    if not scored_candidates:
        # Fallback if over-filtered: try without preference/urgency restrictions
        return {
            "found": False,
            "message": "No matching dishes found with the specified filters. Try relaxing dietary or category constraints.",
        }

    scored_candidates.sort(key=lambda x: x["score"], reverse=True)
    winner = scored_candidates[0]

    # Format portions
    formatted = format_group_portion(winner, party_size, urgency)

    card_payload = {
        "dishId": winner["id"],
        "dishName": formatted["dishName"],
        "stallId": int(winner["stallId"]),
        "stallName": winner["stallName"],
        "price": formatted["price"],
        "prepTime": f"~{winner['estimatedPrepMins']} mins",
        "estimatedTotalWait": winner["estimatedPrepMins"],
        "queueMinutes": int(winner["stallAvailability"].get("queueMinutes", 0)),
        "prepMinutes": int(winner["stallAvailability"].get("prepMinutes", 0)),
        "imageUrl": winner.get("imageUrl", "/food-placeholder.svg"),
        "dietaryTags": winner.get("tags", []),
        "reason": formatted["reason"],
        "portionNote": formatted["portionNote"],
        "status": winner["stallAvailability"].get("status", "Open"),
    }

    return {
        "found": True,
        "dish": {
            "dishName": formatted["dishName"],
            "stallName": winner["stallName"],
            "stallId": winner["stallId"],
            "price": formatted["price"],
            "estimatedWait": f"~{winner['estimatedPrepMins']} mins",
            "reason": formatted["reason"],
            "portionNote": formatted["portionNote"],
            "dietary": winner.get("tags", []),
        },
        "card": card_payload,
    }


# --- Tool Implementation: check_stall_wait_times ---

def check_stall_wait_times(stall_ids: Optional[List[int]] = None) -> dict:
    snapshot = catalog._extract_menu_snapshot()
    stalls = snapshot.get("stalls", [])
    if stall_ids:
        stalls = [s for s in stalls if s.get("stallId") in stall_ids]
    results = [
        {
            "stallId": s.get("stallId"),
            "stallName": s.get("stallName"),
            "status": s.get("status"),
            "queueMinutes": s.get("queueMinutes"),
            "prepMinutes": s.get("prepMinutes"),
            "totalWaitMinutes": s.get("estimatedTotalWait"),
            "availability": s.get("availability"),
        }
        for s in stalls
    ]
    return {"stalls": results, "minutesUntilShow": snapshot.get("minutesUntilShow")}


# --- Tool Implementation: get_show_info ---

def get_show_info() -> dict:
    cur_time = config.get_current_time().strftime("%I:%M %p")
    mins_left = catalog._minutes_until_show()
    return {
        "showName": "Supertree Grove Light Show (Garden Rhapsody)",
        "showTime": f"{config.SHOW_TIME_HOUR:02d}:{config.SHOW_TIME_MINUTE:02d} PM",
        "simulatedCurrentTime": cur_time,
        "minutesUntilShow": mins_left,
        "walkingBufferMinutes": config.WALK_BUFFER_MINUTES,
        "safetyBufferMinutes": config.SAFETY_BUFFER_MINUTES,
        "diningBufferMinutes": config.DINING_BUFFER_MINUTES,
        "recommendedMaxFoodWait": max(5, mins_left - config.WALK_BUFFER_MINUTES - config.SAFETY_BUFFER_MINUTES - config.DINING_BUFFER_MINUTES),
    }


# --- Master Tool Dispatcher ---

def execute_agent_tool(tool_name: str, arguments: dict) -> dict:
    if tool_name == "search_and_recommend_dish":
        return search_and_recommend_dish(
            category=arguments.get("category", "meal"),
            party_size=arguments.get("party_size", 1),
            dietary=arguments.get("dietary"),
            exclude_dishes=arguments.get("exclude_dishes"),
            urgency=arguments.get("urgency", "normal"),
            preference=arguments.get("preference"),
            budget=arguments.get("budget"),
        )
    elif tool_name == "check_stall_wait_times":
        return check_stall_wait_times(stall_ids=arguments.get("stall_ids"))
    elif tool_name == "get_show_info":
        return get_show_info()
    else:
        return {"error": f"Unknown tool: {tool_name}"}


# --- OpenAI Tool Definitions (JSON Schemas) ---

AGENT_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "search_and_recommend_dish",
            "description": "Searches the hawker catalog and returns the best single dish, dessert, or drink matching user needs, party size, dietary restrictions, and time window. Always call this tool when the user asks for food/drink/dessert recommendations, asks for something else, or has dietary or group preferences.",
            "parameters": {
                "type": "object",
                "properties": {
                    "category": {
                        "type": "string",
                        "enum": ["meal", "drink", "dessert", "any"],
                        "description": "Category of recommendation. Use 'dessert' when user asks for dessert/sweet treat. Use 'drink' for beverages. Use 'meal' for main hot food/lunch/dinner.",
                    },
                    "party_size": {
                        "type": "integer",
                        "description": "Number of people dining (e.g. 1 for solo, 4 for a family of four). Defaults to 1.",
                    },
                    "dietary": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Dietary requirements, e.g. ['halal'], ['vegetarian'], ['vegan'], ['nut-free'], ['gluten-free'].",
                    },
                    "exclude_dishes": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "List of dish names or stall names to exclude (e.g. dishes already suggested in this conversation or dishes the user rejected like ['Crispy Plain Prata'] when the user says 'I want something else').",
                    },
                    "urgency": {
                        "type": "string",
                        "enum": ["normal", "rush"],
                        "description": "Set to 'rush' if the user is in a hurry, tight on time, or asking for the fastest option.",
                    },
                    "preference": {
                        "type": "string",
                        "description": "Specific dish keyword or preference mentioned by the user (e.g. 'satay', 'noodles', 'chicken', 'soup', 'rice').",
                    },
                    "budget": {
                        "type": "number",
                        "description": "Optional budget limit in SGD dollars.",
                    },
                },
                "required": ["category"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "check_stall_wait_times",
            "description": "Checks the current queue minutes, prep minutes, and availability status of hawker stalls at Satay by the Bay.",
            "parameters": {
                "type": "object",
                "properties": {
                    "stall_ids": {
                        "type": "array",
                        "items": {"type": "integer"},
                        "description": "Optional list of stall IDs (1 to 15) to check. If omitted, returns all stalls.",
                    }
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_show_info",
            "description": "Retrieves the target Garden Rhapsody (Supertree Grove) light show timing, current simulated time, and required safety/walking buffers.",
            "parameters": {
                "type": "object",
                "properties": {},
            },
        },
    },
]
