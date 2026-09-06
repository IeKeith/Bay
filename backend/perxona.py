"""Perxona Connect authentication, 3D avatar catalog, scenes, and voices."""
from typing import List, Optional

from fastapi import HTTPException
import httpx

try:
    from backend.config import (
        PERXONA_API_BASE_URL,
        PERXONA_CONNECT_EMAIL,
        PERXONA_CONNECT_PASSWORD,
        is_mock,
    )
except ImportError:
    from config import (
        PERXONA_API_BASE_URL,
        PERXONA_CONNECT_EMAIL,
        PERXONA_CONNECT_PASSWORD,
        is_mock,
    )

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

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            res = await client.post(
                f"{PERXONA_API_BASE_URL}/api/v1/connect/auth/login",
                json={"email": PERXONA_CONNECT_EMAIL, "password": PERXONA_CONNECT_PASSWORD},
            )
    except httpx.HTTPError as err:
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


async def get_scenes_data() -> List[dict]:
    global cached_scenes
    if cached_scenes:
        return cached_scenes
    token = await get_perxona_token()
    async with httpx.AsyncClient(timeout=10.0) as client:
        res = await client.get(
            f"{PERXONA_API_BASE_URL}/api/v1/connect/assets/scenes?size=100",
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
            cached_scenes = items
            return items
        raise HTTPException(status_code=res.status_code, detail="Failed to fetch scenes from Perxona API")


async def get_voices_data() -> List[dict]:
    global cached_voices
    if is_mock:
        return [{"id": "voice_sg_warm", "name": "Singaporean Warm Host"}]
    if cached_voices:
        return cached_voices
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
                    return formatted
    except Exception as e:
        print(f"[Satay App] Voices fetch warning: {e}")

    fallback = [{"id": "voice_sg_warm", "name": "Singaporean Warm Host"}]
    cached_voices = fallback
    return fallback
