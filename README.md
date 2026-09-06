# Garden-to-Table Host

## Project Name
**Garden-to-Table Host** — Voice-Enabled 3D AI Avatar Concierge for Satay by the Bay (Gardens by the Bay, Singapore)

## Project Description
**Garden-to-Table Host** is an intelligent, multimodal kiosk concierge designed to assist visitors dining at **Satay by the Bay** while managing tight turnaround times before the iconic evening **7:45 PM Garden Rhapsody Light Show** at Supertree Grove.

Powered by a **React 19 + TypeScript** frontend, a **Python FastAPI** backend, **OpenAI Streaming LLM** (`gpt-4o-mini`), and the **Perxona Connect 3D Avatar API (`<sv-presenter>`)**, the system delivers:
- **Real-Time Voice-to-Voice Interaction**: Seamless Singapore English speech recognition with Singlish phonetic auto-repair and near-zero latency 3D avatar lipsync.
- **Coordinated Multi-Stall Routing**: Calculates optimal ordering, pickup sequencing, and prep times across 15 hawker stalls and 35 dishes to ensure visitors finish dining and arrive at the light show on time.
- **Constraint-Aware Recommendations**: Handles dietary requirements (Halal, Vegetarian, Nut/Shellfish allergies), budget limits, and group sizes with rich visual dish spotlights.
- **Dynamic Auto-Replanning**: Intelligently suggests fast-prep alternatives if queues surge or time windows narrow.

---

## 1. Project Overview & Value Proposition

Visitors at **Gardens by the Bay** frequently experience tight 40–60 minute turnaround times between conservatories (Flower Dome / Cloud Forest) and the evening **7:45 PM Garden Rhapsody Light Show** at Supertree Grove. Dining during peak hours at **Satay by the Bay** presents unique challenges:
- Individual hawker stalls have disparate grill and preparation queues (5 to 25+ minutes).
- Families and tour groups balance complex dietary constraints (Halal, Vegetarian, Nut/Shellfish allergies).
- Queue surges or sold-out items cause visitors to stress or risk missing timed show admissions.

### The Solution
**Garden-to-Table Host** serves as an intelligent kiosk concierge that:
1. **Understands Constraints**: Takes group size, budget, dietary needs, and departure deadlines.
2. **Coordinated Multi-Stall Routing**: Calculates optimal pickup sequences and dining buffers (e.g. order Satay at Stall 1, collect Sugar Cane juice at Stall 5 during the 15-minute grill wait, finish dining by 7:25 PM, and make the 8-10 minute walk to Supertree Grove).
3. **Dynamic Auto-Replanning**: Proactively suggests fast-prep alternatives (e.g. Roti Prata or Hokkien Mee) when time windows tighten so visitors arrive before the light show starts.
4. **Natural Multimodal Interaction**: Real-time voice-to-voice conversation in Singapore English with Singlish phonetic auto-repair and near-zero latency 3D avatar lipsync.
5. **Rich Visual Dish Cards**: Renders high-resolution dish photography (`/img/*.jpeg`) for recommended items alongside estimated prep and queue times.

---

## 2. System Architecture

```
                                    +-----------------------------------------+
                                    |         User Voice / Mic Input          |
                                    +-----------------------------------------+
                                                         |
                                                         v
                                       Web Speech API (en-SG Recognition)
                                                         |
                                                         v
+----------------------------------------------------------------------------------------------------+
|                                    React 19 + TypeScript Frontend                                  |
|                                                                                                    |
|  +---------------------------+   +-------------------------------+   +--------------------------+  |
|  |     Plan & Route Summary  |   |        3D Avatar Stage        |   |    Live Voice Chat       |  |
|  | - 7:45 PM Departure Clock |   | - Perxona <sv-presenter>      |   | - Continuous Auto-Listen |  |
|  | - Hawker Food Spotlight   |   | - Audio Autoplay Unlock       |   | - Real-time SSE Stream   |  |
|  | - Prep & Queue Estimates  |   | - Live Spoken Subtitles       |   | - STT Microphone Toggle  |  |
|  +---------------------------+   +-------------------------------+   +--------------------------+  |
+----------------------------------------------------------------------------------------------------+
                                      |                             ^
                REST / SSE Streaming  |                             |
                                      v                             |
+----------------------------------------------------------------------------------------------------+
|                                    Python (FastAPI) Backend                                        |
|                                                                                                    |
|  - GET /api/config          : System mode, presenter CDN URL, default avatar IDs, show timing      |
|  - GET /api/health          : Health status, KB load state, menu cache hash                        |
|  - GET /api/connect-token   : Proxies credentials to Perxona Auth API and caches Bearer JWT        |
|  - GET /api/avatars         : Concierge avatars (cc076a06 Mei, cc069a03, cc051, cc046, cc075)     |
|  - GET /api/scenes, voices  : Returns 3D scenes and 22 multilingual/accented voices                |
|  - GET /api/menu            : 15-stall, 35-dish catalog with pricing, tags, and sold-out rules     |
|  - GET /api/stall-log       : Real-time stall wait and queue snapshots                             |
|  - POST /api/chat           : Singlish STT phonetic auto-repair + Context Analysis                 |
|                               Injected satay_by_the_bay.md domain facts & catalog estimates        |
|                               Streams OpenAI gpt-4o-mini SSE response with recommendation markers  |
|  - Static Mounts            : /img (14 hawker dish photos) and / (compiled React SPA)              |
+----------------------------------------------------------------------------------------------------+
                                      |                             |
                                      v                             v
                       +-----------------------------+    +----------------------------+
                       |    Perxona Connect Cloud    |    |      OpenAI Chat API       |
                       |  (3D Avatar Assets & TTS)   |    |       (gpt-4o-mini)        |
                       +-----------------------------+    +----------------------------+
```

---

## 3. Tech Stack

| Layer | Technology | Description |
| :--- | :--- | :--- |
| **Frontend** | **React 19**, **TypeScript**, **Vite** | Modern SPA component architecture with HMR dev proxy |
| **Avatar Engine** | **Perxona Connect API** | `<sv-presenter>` 3D Web Component with lipsync & motion |
| **Types Package** | **`@perxona/presenter-types`** | Official Perxona TypeScript definitions |
| **Speech Interface** | **Web Speech API** | Hands-free continuous voice input (`en-SG`) |
| **Styling** | **Glassmorphic CSS3** | Gardens by the Bay botanical theme |
| **Backend** | **Python 3.9+ / 3.11+, FastAPI, Uvicorn** | High-performance asynchronous REST and SSE streaming |
| **HTTP Client** | **`httpx`** | Async client for Perxona token caching & proxy requests |
| **LLM Streaming** | **`openai` (AsyncOpenAI)** | Server-Sent Events (`text/event-stream`) streaming `gpt-4o-mini` |
| **E2E Testing** | **Playwright MCP** | Live browser automation against running Vite frontend and FastAPI backend |

---

## 4. Project & Backend Structure

The backend has been consolidated into 5 clean, single-responsibility files without redundant micro-routers:

```
Bay/
├── backend/
│   ├── main.py                         # Single FastAPI entrypoint declaring all 9 endpoints & mounts
│   ├── config.py                       # Environment vars, 7:45 PM show constants, paths, OpenAI client
│   ├── perxona.py                      # Perxona Connect API client (tokens, scenes, voices, avatars)
│   ├── catalog.py                      # JSON catalog loader, schema validation, caching, /img resolver
│   ├── recommender.py                  # Singlish STT phonetic repair, scoring, context, recommendations
│   ├── requirements.txt                # Python backend dependencies
│   ├── Dockerfile                      # Production container spec
│   ├── data/
│   │   └── restaurant_catalog.json     # 15 stalls, 35 dishes with dietary tags & base queues
│   └── img/                            # 14 authentic food photos served at /img/<dish>.jpeg
├── satay_by_the_bay.md                 # Domain Knowledge Base (7:45 PM Supertree show timing & tips)
├── public/                             # Compiled production bundle + static assets
└── frontend/                           # React 19 + TypeScript source
    ├── package.json                    # React, Vite, and Perxona type dependencies
    ├── vite.config.ts                  # Vite config with /api and /img proxies to port 8086
    ├── tsconfig.json                   # Strict TypeScript configuration
    └── src/
        ├── main.tsx                    # Application entry point
        ├── App.tsx                     # Root layout & state orchestrator
        ├── App.css                     # Glassmorphic botanical theme
        ├── types/                      # route.ts, chat.ts, presenter.ts
        ├── lib/
        │   ├── presenter.ts            # CDN loader for <sv-presenter>
        │   └── api.ts                  # Fetch wrapper
        ├── hooks/
        │   ├── usePresenter.ts         # <sv-presenter> mounting, audio unlock, speech queue
        │   ├── useSpeech.ts            # Voice recognition & auto-listening
        │   └── useAvatarCatalog.ts     # Avatar options and scene loader
        └── components/
            ├── Header.tsx              # Brand bar, system status, 7:45 PM show pill
            ├── AvatarStage.tsx         # 3D avatar container, audio overlay, live subtitles
            ├── FoodSpotlightCard.tsx   # Visual hawker dish spotlight with image & prep wait
            └── ChatPanel.tsx           # Message history, pulsing mic button, text fallback
```

---

## 5. Getting Started

### Prerequisites
- **Python 3.9+** (Tested with Python 3.9 and 3.11)
- **Node.js 18+** (Node 20 or 22 recommended) and **npm**

### Step 1: Clone the Repository
```bash
git clone https://github.com/IeKeith/Bay.git
cd Bay
```

### Step 2: Configure Environment Variables
Create a `.env` file in the root directory (or inside `backend/.env`):
```env
PORT=8086
PERXONA_API_BASE_URL=https://console.perxona.ai/asia
PRESENTER_URL=https://cdn.perxona.ai/asia/prod/latest/widget/entry/presenter.js

# Perxona Connect Account
PERXONA_CONNECT_EMAIL=your_perxona_email@example.com
PERXONA_CONNECT_PASSWORD=your_perxona_password

# OpenAI API
LLM_API_KEY=your_openai_api_key
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4o-mini
```

### Step 3: Install Backend Dependencies
```bash
cd backend
python -m venv venv

# Windows:
.\venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

pip install -r requirements.txt
```

### Step 4: Install Frontend Dependencies & Build
```bash
cd ../frontend
npm install
npm run build
```

### Step 5: Run the Application

#### Active Development Mode (Recommended)
Run the backend and Vite dev server simultaneously for hot reload:

1. **Start Backend (Terminal 1)**:
   ```bash
   cd backend
   python main.py
   ```
   *Backend starts at `http://localhost:8086`.*

2. **Start Frontend Dev Server (Terminal 2)**:
   ```bash
   cd frontend
   npm run dev
   ```
   *Frontend starts at `http://localhost:5173` with instant HMR. Requests to `/api/*` and `/img/*` automatically proxy to the backend at `http://localhost:8086`.*

#### Production Mode
Run the backend directly, which automatically serves the compiled SPA from `public/`:
```bash
cd backend
python main.py
```
Open **`http://localhost:8086`** in your browser.

---

## 6. Hawker Catalog & Dish Imagery

The unified catalog at `backend/data/restaurant_catalog.json` covers **15 stalls and 35 menu choices** with validated pricing, dietary tags, and preparation estimates.

19 authentic hawker dish and beverage images are stored in `backend/img/` and served at `/img/<dish_name>.jpeg`:
- `satay.jpeg` (City Satay)
- `katong_laksa.jpeg` (Katong Laksa Kitchen)
- `sambal_stingray.jpeg` (Boon Tat BBQ Seafood)
- `hokkien_mee.jpeg` (Geylang Lor 29 Fried Hokkien Mee)
- `roti_prata.jpeg` (Garden Greens & Prata House)
- `sugarcane_juice.jpeg` (Marina Refreshments & Sugar Cane Bar)
- `thai_coconut.jpeg` (Marina Refreshments & Sugar Cane Bar)
- `chendol.jpeg` (Marina Refreshments & Sugar Cane Bar)
- `calamansi_juice.jpeg` (Local Cold Drinks)
- `kopi_teh.jpeg` (Traditional Nanyang Coffee & Tea)
- `char_kway_teow.jpeg` (Heritage Wok)
- `chicken_rice.jpeg` (Kampung Chicken Rice)
- `bak_kut_teh.jpeg` (Pepper Soup Kitchen)
- `nasi_lemak.jpeg` (Coconut Rice Corner)
- `chicken_biryani.jpeg` (Indian Hawker Kitchen)
- `fish_soup.jpeg` (Teochew Fish Soup)
- `bak_chor_mee.jpeg` (Minced Meat Noodle House)
- `duck_rice.jpeg` (Soy & Rice Kitchen)
- `ice_kacang.jpeg` (Sweet Heritage Desserts)

Images are explicitly linked in `backend/data/restaurant_catalog.json` with fallback resolution by `_resolve_dish_image` in `backend/catalog.py` and rendered in the frontend `FoodSpotlightCard`.

---

## 7. Singlish & Local Food Phonetic Auto-Repair

Browser speech recognition often misinterprets local Singaporean food names and landmarks. The phonetic repair engine in `backend/recommender.py` cleans transcripts before LLM processing:

| User STT Audio | Cleaned Prompt |
| :--- | :--- |
| `sate` / `sata` / `satey` | **Satay** |
| `sting ray` / `sambal ray` | **Sambal Stingray** |
| `hokkien mee` / `hoki mee` | **Hokkien Mee** |
| `prata` / `paratha` | **Roti Prata** |
| `sugarcane` / `sugar can` | **Sugar Cane Juice** |
| `chendol` / `cendol` / `chendul` | **Chendol** |
| `supertree` / `rhapsody` / `light show` | **Supertree Grove Light Show (7:45 PM)** |
| `flower dome` / `conservatories` | **Gardens Conservatories** |

---

## 8. API Reference

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/config` | `GET` | System mode (`mock` or `live`), presenter CDN URL, default avatar IDs, show timing (`19:45`) |
| `/api/health` | `GET` | Health check, knowledge base status, and menu version cache key |
| `/api/connect-token` | `GET` | Generates / retrieves cached Perxona Connect API Bearer JWT |
| `/api/avatars` | `GET` | Target 3D avatar list with roles, labels, and thumbnail references |
| `/api/scenes` | `GET` | Perxona 3D background scenes |
| `/api/voices` | `GET` | Available TTS voices |
| `/api/menu` | `GET` | Full 15-stall, 35-dish restaurant catalog and sold-out rules |
| `/api/stall-log` | `GET` | Real-time snapshot of queue and preparation minutes per stall |
| `/api/chat` | `POST` | Server-Sent Events (SSE) streaming chat endpoint with context parsing and recommendation markers |
| `/img/{filename}` | `GET` | Static hawker dish photos |

---

## 9. End-to-End Verification

Verification is automated using **Playwright MCP** directly against the live Vite frontend (`http://localhost:5173`) connected to the FastAPI backend (`http://localhost:8086`):
1. **Avatar Session**: Validates avatar selection lock-in, WebSocket / WebRTC connection, and live lip-synced greeting speech.
2. **Catalog Question**: Validates menu queries (`"What dishes are available at City Satay and how much are they?"`) against catalog facts.
3. **Recommendation Engine**: Tests dietary and time-constrained food requests (`"I want to order laksa, can you recommend one?"`) and verifies the spotlight card displays the dish image and accurate timing relative to the 7:45 PM Supertree show.

---

## 10. License

MIT License. Built for the Gardens by the Bay / Satay by the Bay AI Concierge Showcase.
