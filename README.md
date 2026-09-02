# 🌿 Garden-to-Table Host

> **Voice-Enabled 3D AI Avatar Concierge for Satay by the Bay (Gardens by the Bay, Singapore)**  
> Built with **React 19 + TypeScript + Vite**, **Python FastAPI Backend**, **OpenAI Streaming LLM**, and **Perxona Connect 3D Avatar API (`<sv-presenter>`)**.

---

## 📌 1. Project Overview & Value Proposition

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

## 🏗️ 2. System Architecture

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
|  - GET /api/avatars, voices : Returns concierge personas (Mei & Raj) and 22 voices                 |
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

## 🛠️ 3. Tech Stack

| Layer | Technology | Description |
| :--- | :--- | :--- |
| **Frontend** | **React 19**, **TypeScript**, **Vite** | Modern SPA component architecture |
| **Avatar Engine** | **Perxona Connect API** | `<sv-presenter>` Web Component with lipsync & motion |
| **Types Package** | **`@perxona/presenter-types`** | Official Perxona TypeScript definitions |
| **Speech Interface** | **Web Speech API** | Hands-free continuous voice input (`en-SG`) |
| **Styling** | **Glassmorphic CSS3** | Gardens by the Bay botanical greens + satay amber |
| **Backend** | **Python 3.10+ (FastAPI, Uvicorn)** | High-performance asynchronous API |
| **HTTP Client** | **`httpx`** | Async client for Perxona token caching & catalog proxy |
| **LLM Streaming** | **`openai` (AsyncOpenAI)** | Server-Sent Events (`text/event-stream`) streaming |

---

## 📂 4. Project Structure

```
Bay/
├── main.py                     # Python FastAPI server & proxy endpoints
├── satay_by_the_bay.md         # Domain Knowledge Base (7:45 PM Supertree show timing)
├── requirements.txt            # Python dependencies
├── .env                        # Perxona and OpenAI credentials
├── public/                     # Compiled React production bundle + static assets
│   ├── satay_bg.jpg            # Alfresco Satay by the Bay backdrop image
│   └── index.html              # Generated production entry point
└── frontend/                   # React 19 + TypeScript source
    ├── package.json            # React, Vite, and Perxona type dependencies
    ├── vite.config.ts          # Vite configuration with /api proxy to port 8086
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
            └── ChatPanel.tsx       # Message history, pulsing mic button, text fallback
```

---

## ⚡ 5. Getting Started

### Prerequisites
- **Python 3.10+** (Python 3.11 recommended)
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
python -m uvicorn main:app --host 127.0.0.1 --port 8086 --reload
```
Open your browser at **`http://localhost:8086`**.

---

## 💻 6. Development Workflow (React HMR)

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
   Open **`http://localhost:5173`** (requests to `/api/*` are automatically proxied to port 8086).

---

## 🎭 7. Hackathon Demo Scenarios

Test these 3 pre-configured scenarios using either the microphone button or the quick prompt chips:

| Scenario | Input Prompt | Concierge & Route Card Action |
| :--- | :--- | :--- |
| **⏱️ 40m Rush (Halal Group)** | *"We have 40 mins before the 7:45 PM Supertree show, family of 3, Halal food under $30!"* | Routes Stall 1 (City Satay, $9.00) + Stall 5 (Sugar Cane Juice, $3.50). Visual countdown set to 38 mins with safety walking buffer. |
| **🥗 Vegetarian & Nut-Free** | *"I am vegetarian and allergic to peanuts. What can I get before heading to the show?"* | Recommends Stall 4 (Garden Greens & Prata, $3.50) + Stall 5 (Fresh Coconut, $5.50). 100% plant-based and zero allergen risk. |
| **🚨 Auto-Replan (Queue Delay)** | *"Satay queue is now 25 minutes delay! We need to leave in 20 minutes, please replan our order!"* | Proactively detects deadline breach, swaps Stall 1 for Stall 4 Prata ($10.00, 6m prep), updates countdown to 22 mins, and preserves safe arrival at the 7:45 PM Light Show. |

---

## 📝 8. Singlish & Local Food Phonetic Auto-Repair

Browser speech recognition often misinterprets local Singaporean terms. The backend automatically cleans transcription inaccuracies:
- `sate` / `sata` $\rightarrow$ **Satay**
- `sting ray` / `sambal ray` $\rightarrow$ **Sambal Stingray**
- `hokkien mee` / `hoki mee` $\rightarrow$ **Hokkien Mee**
- `prata` / `paratha` $\rightarrow$ **Roti Prata**
- `sugarcane` / `sugar can` $\rightarrow$ **Sugar Cane Juice**
- `chendol` / `cendol` $\rightarrow$ **Chendol**
- `supertree` / `rhapsody` $\rightarrow$ **Supertree Grove Light Show (7:45 PM)**

---

## 📄 9. License

MIT License. Built for the Gardens by the Bay / Satay by the Bay Hackathon Showcase.
