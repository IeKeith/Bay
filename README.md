# Garden-to-Table Host

## Hawker catalog and Plan Summary

The Markdown catalog contains **15 stalls and 35 menu choices** (including drinks,
sides and desserts). The original five stalls live in `backend/satay_by_the_bay.md`;
the root copy is used only if that file is absent. Ten additional stall files in
`backend/data/hawkers/` add twenty Singapore hawker dishes. These additions use
illustrative stall names, demo prices and simulated waits, not verified venue tenants.

To add a stall, create a Markdown file in that directory with a unique `### Stall N: Name`
heading, `Cuisine`, `Status`, `Service Capacity`, and `Signature Items` fields following an existing file.
Include positive integer preparation minutes and capacity, nonnegative queue minutes, and SGD prices. Duplicate IDs,
malformed menu items and missing timing fail validation with a file/line diagnostic.
Files load at server startup; restart the backend after editing them. The backend
uses the same combined catalog for the menu and AI recommendations.

The app's **Plan Summary** shows items selected using the chat's order button,
including hawker, food, preparation, queue and total estimated wait. Checkout keeps
the item visible with its server-assigned demo queue number and predicted Singapore pickup date/time. Separate selections appear separately;
repeated clicks on one selection do not duplicate it. Selections last for this page
session only. Times are snapshots from the recommendation or successful checkout, with total wait equal to
preparation plus queue; dining and walking buffers are separate. Missing timing is
shown as “Unavailable”. Dietary tags describe the catalog recipe, not verified safety.

Validation: `python -m unittest backend.test_hawker_catalog backend.test_simulation -v`; in `frontend`, run
`npm test` and `npm run build`.

## Active accelerated simulation

FastAPI's lifespan starts one in-memory simulation at current Singapore time.
Every real second advances one simulated minute; monotonic elapsed time catches up
delayed ticks. Each startup generates a new seed, with reproducible customer
arrivals every 3–8 simulated minutes per stall. Initial orders are seeded from the
catalog's base queue, rounded up to complete service batches. All stalls stay open
and all dishes remain orderable. Preparation occupies one cooking position;
`Service Capacity` sets concurrent cooking positions. Orders wait FIFO for a free
position. Queues reflect cumulative demand, so longer service times can build backlogs.

Adding a selection does not order it. Checkout posts its `dishId` to `/api/orders`
and joins the same queue as autonomous customers. Repeated clicks are guarded;
failed checkout leaves the selection available for retry. Chat and recommendations
read the authoritative simulation. The summary records returned estimates without
polling, a dashboard, or a persistent clock.

Run **one backend worker** for this demo. State is process-local, shared by visitors
to that process, and resets on restart/reload. No simulation state is persisted.

> **Voice-Enabled 3D AI Avatar Concierge for Satay by the Bay (Gardens by the Bay, Singapore)**  
> Built with **React 19 + TypeScript + Vite**, **Python FastAPI Backend**, **OpenAI Streaming LLM**, and **Perxona Connect 3D Avatar API (`<sv-presenter>`)**.

---

## 1. Project Overview & Value Proposition

Visitors at **Gardens by the Bay** frequently experience tight 40–60 minute turnaround times between conservatories (Flower Dome / Cloud Forest) and the evening **7:45 PM Garden Rhapsody Light Show** at Supertree Grove. Dining during peak hours at **Satay by the Bay** is notoriously challenging:
- Individual hawker stalls have disparate grill and preparation queues (5 to 25+ minutes).
- Families and tour groups balance complex dietary constraints (Halal, Vegetarian, Nut/Shellfish allergies).
- Queue spikes or sold-out items cause visitors to stress or risk missing timed show admissions.

### The Solution
**Garden-to-Table Host** serves as an intelligent kiosk concierge that:
1. **Understands Constraints**: Takes group size, budget, dietary needs, and departure deadlines.
2. **Generates Coordinated Multi-Stall Routes**: Computes optimal pickup sequences (e.g., order Satay at Stall 1, collect fresh Sugar Cane juice at Stall 5 during the 15-minute grill wait, finish dining by 7:25 PM, and make the 8-minute walk to Supertree Grove).
3. **Dynamic Auto-Replanning**: If a queue surges or an item sells out, the avatar proactively swaps to fast-prep alternatives (e.g. Roti Prata or Hokkien Mee) to guarantee visitors never miss the light show.
4. **Natural Multimodal Interaction**: Real-time voice-to-voice conversation in Singapore English with Singlish phonetic auto-repair and near-zero latency 3D avatar lipsync.

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
|  |     Timed Route Card      |   |        3D Avatar Stage        |   |    Live Voice Chat       |  |
|  | - 7:45 PM Departure Clock |   | - Perxona <sv-presenter>      |   | - Continuous Auto-Listen |  |
|  | - Ordered Stalls & Status |   | - Audio Autoplay Unlock       |   | - Sentence-by-sentence   |  |
|  | - Real-time Auto-Replan   |   | - Live Spoken Subtitles       |   |   streaming to presenter |  |
|  +---------------------------+   +-------------------------------+   +--------------------------+  |
+----------------------------------------------------------------------------------------------------+
                                      |                             ^
                REST / SSE Streaming  |                             |
                                      v                             |
+----------------------------------------------------------------------------------------------------+
|                                    Python (FastAPI) Backend                                        |
|                                                                                                    |
|  - GET /api/config          : System mode, presenter CDN URL, default target IDs                   |
|  - GET /api/connect-token   : Proxies credentials to Perxona Auth API and caches Bearer JWT        |
|  - GET /api/avatars, voices : Returns concierge avatars (cc069a03, cc076a06, cc051, cc046, cc075) and 22 voices |
|  - POST /api/chat           : Singlish / Hawker Phonetic Auto-Repair regex pass                    |
|                               Injected satay_by_the_bay.md domain rules                            |
|                               Streams OpenAI gpt-4o-mini SSE response                              |
|  - Static File Server       : Mounts / to host the compiled production React SPA                   |
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
| **Frontend** | **React 19**, **TypeScript**, **Vite** | Modern SPA component architecture |
| **Avatar Engine** | **Perxona Connect API** | `<sv-presenter>` Web Component with lipsync & motion |
| **Types Package** | **`@perxona/presenter-types`** | Official Perxona TypeScript definitions |
| **Speech Interface** | **Web Speech API** | Hands-free continuous voice input (`en-SG`) |
| **Styling** | **Glassmorphic CSS3** | Gardens by the Bay botanical greens + satay amber |
| **Backend** | **Python 3.9+ (tested with Python 3.9.16, FastAPI, Uvicorn)** | High-performance asynchronous API |
| **HTTP Client** | **`httpx`** | Async client for Perxona token caching & catalog proxy |
| **LLM Streaming** | **`openai` (AsyncOpenAI)** | Server-Sent Events (`text/event-stream`) streaming |

---

## 4. Project Structure

```
Bay/
├── main.py                     # Root entrypoint forwarding to backend.main:app
├── backend/
│   └── main.py                 # Python FastAPI server, Perxona auth & proxy, chat SSE, static mount
├── satay_by_the_bay.md         # Domain Knowledge Base (7:45 PM Supertree show timing)
├── requirements.txt            # Python dependencies
├── .env                        # Perxona and OpenAI credentials
├── public/                     # Compiled React production bundle + static assets
│   ├── satay_bg.jpg            # Alfresco Satay by the Bay backdrop image
│   ├── satay_dish.jpg          # Food spotlight dish image
│   ├── prata_dish.jpg          # Food spotlight dish image
│   └── index.html              # Generated production entry point
└── frontend/                   # React 19 + TypeScript source
    ├── package.json            # React, Vite, and Perxona type dependencies
    ├── vite.config.ts          # Vite configuration with /api and asset proxies to port 8086
    ├── tsconfig.json           # Strict TypeScript configuration
    └── src/
        ├── main.tsx            # Application entry point
        ├── App.tsx             # Root layout & state orchestrator
        ├── App.css             # Glassmorphic botanical theme
        ├── types/              # route.ts, chat.ts, presenter.ts
        ├── lib/
        │   ├── presenter.ts    # CDN loader for <sv-presenter>
        │   └── api.ts          # Fetch wrapper
        ├── hooks/
        │   ├── usePresenter.ts # <sv-presenter> mounting, audio unlock, speech queue
        │   ├── useSpeech.ts    # Voice recognition & auto-listening
        │   └── useRoutePlan.ts # Dynamic Route Card & Auto-Replan state
        └── components/
            ├── Header.tsx          # Brand bar, system status, 7:45 PM show pill
            ├── RouteCard.tsx       # Timed Hawker Route Card with live statuses
            ├── PersonaSelector.tsx # Concierge avatar & voice switcher
            ├── QuickPrompts.tsx    # 3 scenario chips (40m Rush, Vegetarian, Replan)
            ├── AvatarStage.tsx     # 3D avatar container, audio overlay, subtitles
            ├── FoodSpotlightCard.tsx # Visual hawker dish spotlight
            └── ChatPanel.tsx       # Message history, pulsing mic button, text fallback
```

---

## 5. Getting Started

### Prerequisites
- **Python 3.9+** (Tested and verified with **Python 3.9.16**; Python 3.10+ also supported)
- **Node.js 18+** (Node 22 recommended) and **npm**

### Step 1: Clone the Repository
```bash
git clone https://github.com/IeKeith/Bay.git
cd Bay
```

### Step 2: Configure Environment Variables
Create a `.env` file in the root directory:
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

### Step 3: Install Python Backend Dependencies
```bash
python -m venv venv
# On Windows:
.\venv\Scripts\activate
# On macOS/Linux:
source venv/bin/activate

pip install -r requirements.txt
```

### Step 4: Build the React Frontend
```bash
cd frontend
npm install
npm run build
cd ..
```

### Step 5: Run the Server
```bash
# Option 1: Using uvicorn CLI directly from the root
python -m uvicorn main:app --host 127.0.0.1 --port 8086 --reload

# Option 2: Running via Python entrypoint
python main.py
# or
python backend/main.py
```
Open your browser at **`http://localhost:8086`**.

---

## 6. Development Workflow (React HMR)

For active frontend development with instant Hot Module Replacement:

1. **Start Backend (Terminal 1)**:
   ```bash
   python -m uvicorn main:app --host 127.0.0.1 --port 8086 --reload
   ```

2. **Start React Dev Server (Terminal 2)**:
   ```bash
   cd frontend
   npm run dev
   ```
   Open **`http://localhost:5173`** (requests to `/api/*` and dish images are automatically proxied to port 8086).

---

## 7. Hackathon Demo Scenarios

Test these 3 pre-configured scenarios using either the microphone button or the quick prompt chips:

| Scenario | Input Prompt | Concierge & Route Card Action |
| :--- | :--- | :--- |
| **40m Rush (Halal Group)** | *"We have 40 mins before the 7:45 PM Supertree show, family of 3, Halal food under $30!"* | Routes Stall 1 (City Satay, $9.00) + Stall 5 (Sugar Cane Juice, $3.50). Visual countdown set to 38 mins with safety walking buffer. |
| **Vegetarian & Nut-Free** | *"I am vegetarian and allergic to peanuts. What can I get before heading to the show?"* | Recommends Stall 4 (Garden Greens & Prata, $3.50) + Stall 5 (Fresh Coconut, $5.50). 100% plant-based and zero allergen risk. |
| **Auto-Replan (Queue Delay)** | *"Satay queue is now 25 minutes delay! We need to leave in 20 minutes, please replan our order!"* | Proactively detects deadline breach, swaps Stall 1 for Stall 4 Prata ($10.00, 6m prep), updates countdown to 22 mins, and preserves safe arrival at the 7:45 PM Light Show. |

---

## 8. Singlish & Local Food Phonetic Auto-Repair

Browser speech recognition often misinterprets local Singaporean terms. The backend automatically cleans transcription inaccuracies:
- `sate` / `sata` $\rightarrow$ **Satay**
- `sting ray` / `sambal ray` $\rightarrow$ **Sambal Stingray**
- `hokkien mee` / `hoki mee` $\rightarrow$ **Hokkien Mee**
- `prata` / `paratha` $\rightarrow$ **Roti Prata**
- `sugarcane` / `sugar can` $\rightarrow$ **Sugar Cane Juice**
- `chendol` / `cendol` $\rightarrow$ **Chendol**
- `supertree` / `rhapsody` $\rightarrow$ **Supertree Grove Light Show (7:45 PM)**

---

## 9. License

MIT License. Built for the Gardens by the Bay / Satay by the Bay Hackathon Showcase.
