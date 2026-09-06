"""Backend configuration, environment variables, constants, and shared clients."""
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

from dotenv import load_dotenv
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

# Show-time and planning constants
SHOW_TIME_HOUR = 19
SHOW_TIME_MINUTE = 45
SAFETY_BUFFER_MINUTES = 12
WALK_BUFFER_MINUTES = 10
DINING_BUFFER_MINUTES = 15

# Simulated current kiosk time (always 7:00 PM Singapore time)
CURRENT_SIMULATED_HOUR = int(os.getenv("CURRENT_SIMULATED_HOUR", "19"))
CURRENT_SIMULATED_MINUTE = int(os.getenv("CURRENT_SIMULATED_MINUTE", "0"))

SINGAPORE = timezone(timedelta(hours=8), name="Asia/Singapore")

def get_current_time() -> datetime:
    """Returns simulated current time (defaults to 7:00 PM Singapore time)."""
    now = datetime.now(SINGAPORE)
    return now.replace(
        hour=CURRENT_SIMULATED_HOUR,
        minute=CURRENT_SIMULATED_MINUTE,
        second=0,
        microsecond=0,
    )


# OpenAI Async Client
openai_client = AsyncOpenAI(
    api_key=LLM_API_KEY or "dummy_key",
    base_url=LLM_BASE_URL,
)
