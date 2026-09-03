# Backend Output Specification for Satay by the Bay AI Concierge Frontend

This document outlines the complete REST and Server-Sent Events (SSE) contract required from the backend for the React kiosk frontend (`/frontend`) to operate seamlessly.

---

## 1. General Network & Protocol Requirements

- **CORS Headers**: When running the frontend locally (`http://localhost:5173`) or from a public kiosk domain, the backend must return:
  ```http
  Access-Control-Allow-Origin: * (or specific origin)
  Access-Control-Allow-Methods: GET, POST, OPTIONS
  Access-Control-Allow-Headers: Content-Type, Authorization
  ```
- **Content-Type**:
  - JSON endpoints: `application/json; charset=utf-8`
  - Streaming endpoint (`/api/chat`): `text/event-stream; charset=utf-8` with `Cache-Control: no-cache` and `Connection: keep-alive`

---

## 2. API Endpoints Specification

### 2.1 `GET /api/config`
Provides configuration and bootstrap settings to initialize the Perxona 3D Avatar widget and speech engine.

#### **Response (HTTP 200)**:
```json
{
  "mock": false,
  "chat": true,
  "presenterUrl": "https://cdn.perxona.ai/asia/prod/latest/widget/entry/presenter.js",
  "perxonaBaseUrl": "https://console.perxona.ai/asia",
  "defaults": {
    "avatarId": "01KVQ595FX6K4SJ182HRNFERTK",
    "sceneId": "01KQEJD0NJFVM20M588K7D1E9Z",
    "voiceId": "01KY40Z9NTKTC5DMH8TD5S77RN"
  }
}
```

| Field | Type | Description |
|---|---|---|
| `mock` | `boolean` | `true` if operating without live credentials; `false` in production. |
| `chat` | `boolean` | Indicates if LLM chat capability is active. |
| `presenterUrl` | `string` | Absolute URL to Perxona Web Component SDK script (`presenter.js`). |
| `perxonaBaseUrl` | `string` | Base URL for Perxona Console asset distribution. |
| `defaults` | `object` | Fallback avatar, scene, and voice identifiers. |

---

### 2.2 `GET /api/connect-token`
Returns an authenticated, single-use or short-lived Bearer token granting the frontend permission to render 3D models from Perxona CDN.

#### **Response (HTTP 200)**:
```json
{
  "connect_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

| Field | Type | Description |
|---|---|---|
| `connect_token` | `string` | JWT access token required by `presenter.initialize(connect_token, target)`. |

---

### 2.3 `GET /api/avatars`
Supplies the selectable avatar models for the kiosk avatar carousel selector.

#### **Response (HTTP 200)**:
```json
{
  "items": [
    {
      "id": "01KVQ595FX6K4SJ182HRNFERTK",
      "name": "cc076a06_female_xr_01",
      "role": "Mei - Satay Specialist",
      "thumbnail": "https://cdn.perxona.ai/.../head_cc076a06_female_xr_01_tini.png",
      "voice_id": "01KY40Z9NTKTC5DMH8TD5S77RN",
      "voice_name": "Warm & Cheerful (Female)",
      "lod_urls": {
        "lod0": "https://cdn.perxona.ai/.../cc076a06_female_xr_01",
        "lod1": "https://cdn.perxona.ai/.../cc076a06_female_xr_01_lod1"
      }
    }
  ]
}
```

| Field | Type | Description |
|---|---|---|
| `items[].id` | `string` | Unique avatar ID used in `avatarId` when starting sessions. |
| `items[].name` | `string` | Technical asset identifier (used for persona name fallback). |
| `items[].role` | `string` | User-facing concierge role displayed in selector and chat sender badge. |
| `items[].thumbnail` | `string` (URL) | High-res headshot preview image displayed in the carousel. |
| `items[].voice_id` | `string` | Default voice ID associated with this avatar model. |
| `items[].voice_name` | `string` | (Optional) Human-readable voice label. |
| `items[].lod_urls` | `object` | Level-of-detail model URLs for 3D engine mesh rendering. |

---

### 2.4 `GET /api/scenes`
Supplies the background environments available for the 3D avatar viewport.

#### **Response (HTTP 200)**:
```json
{
  "items": [
    {
      "id": "01KQEJD0NJFVM20M588K7D1E9Z",
      "name": "Satay by the Bay Alfresco Dining"
    }
  ]
}
```

| Field | Type | Description |
|---|---|---|
| `items[].id` | `string` | Unique scene ID passed to `presenter.initialize`. |
| `items[].name` | `string` | Display name of the virtual 3D environment. |

---

### 2.5 `GET /api/voices`
Lists available voice IDs for Text-to-Speech (TTS) synthesis.

#### **Response (HTTP 200)**:
```json
{
  "items": [
    {
      "id": "01KY40Z9NTKTC5DMH8TD5S77RN",
      "name": "Warm & Cheerful (Female)"
    }
  ]
}
```

---

### 2.6 `GET /api/health`
Health check used by monitoring and kiosk readiness probes.

#### **Response (HTTP 200)**:
```json
{
  "status": "ok",
  "mode": "live",
  "kbLoaded": true
}
```

---

## 3. Streaming Chat Endpoint (`POST /api/chat`)

This is the primary conversational endpoint. It receives user speech/text and streams LLM output as Server-Sent Events (SSE).

### Request
- **Method**: `POST`
- **URL**: `/api/chat`
- **Headers**: `Content-Type: application/json`
- **Body**:
```json
{
  "message": "Can you recommend food from City Satay?",
  "avatarId": "01KVQ595FX6K4SJ182HRNFERTK",
  "history": [
    {
      "role": "assistant",
      "content": "Welcome to Satay by the Bay! I'm Mei, your culinary route guide."
    },
    {
      "role": "user",
      "content": "Hello!"
    }
  ]
}
```

---

### Response Stream Protocol (SSE)

- **MIME Type**: `text/event-stream; charset=utf-8`
- Each chunk begins with `data: ` and ends with `\n\n`.

#### 1. Content Delta Chunks:
```http
data: {"delta": "From City Satay, I recommend the "}

data: {"delta": "Charcoal-Grilled Chicken Satay for SGD $9.00! "}
```

#### 2. Completion Chunk:
```http
data: [DONE]
```

#### 3. Error Chunk (if streaming aborts or LLM fails):
```http
data: {"error": "Description of error"}
```

---

## 4. Food Recommendation Action Protocol (`<!--RECOMMEND: ... -->`)

The frontend uses an **LLM-driven Action Protocol** to dynamically spawn the **In-Chat Order Card** and update the **Featured Stall Spotlight Banner**.

### How It Works:
When the concierge AI is actively recommending a specific dish or drink to the visitor, the backend LLM must append a structured comment tag at the **very end** of its streamed response:

```html
<!--RECOMMEND: {"stallId": 1, "stallName": "City Satay (Stall 1)", "dishName": "Charcoal-Grilled Chicken Satay", "price": "SGD $9.00", "prepTime": "~15 mins", "imageUrl": "/satay_dish.jpg"} -->
```

### JSON Schema for Recommendation Payload:
```typescript
interface RecommendationPayload {
  stallId: number;          // 1 to 5 (Integer)
  stallName: string;        // e.g., "City Satay (Stall 1)"
  dishName: string;         // e.g., "Charcoal-Grilled Chicken Satay"
  price: string;            // e.g., "SGD $9.00"
  prepTime: string;         // e.g., "~15 mins" or "2 mins"
  imageUrl?: string;        // (Optional) Path or URL to food photo (e.g. "/satay_dish.jpg" or external CDN)
}
```

### Critical Rules for the Backend LLM Prompt:
1. **When to Emit**:
   - Only when **proposing or suggesting a food or drink item** for the user to order or consider.
2. **When NEVER to Emit**:
   - **Order Checkouts / Confirmations**: When the visitor checks out and sends their order message with their queue number, the LLM must **NOT** emit `<!--RECOMMEND: ... -->`.
   - **Queue Readbacks**: When reading back or confirming a queue number (e.g., `#382`), do NOT emit this tag.
   - **General Questions**: Directions to restrooms, Supertree Light Show timings, ATM locations, or greeting messages must NOT emit this tag.
3. **Speech & Lipsync Safety**:
   - The frontend automatically filters `<!-- ... -->` from the sentence buffer so that the 3D avatar never speaks JSON or raw HTML tags.
4. **Brevity Rule**:
   - Keep conversational answers within **2 to 3 punchy sentences** so audio generation and avatar lipsync remain responsive (<500ms).

---

## 5. Summary Checklist for Backend Implementation

| Requirement | Description | Status |
|---|---|---|
| **CORS Enabled** | Accepts requests from `*` or `http://localhost:5173`. | Required |
| **SSE Streaming** | Streams `{"delta": "..."}` with terminal `[DONE]` for `/api/chat`. | Required |
| **Token Dispatch** | Provides valid Perxona JWT via `/api/connect-token`. | Required |
| **Action Tag Format** | LLM appends `<!--RECOMMEND: {...} -->` exclusively on food recommendations. | Required |
| **Phonetic Auto-Repair** | Backend STT repair helper for local Singlish food names (`satay`, `stingray`, `prata`, `supertree`). | Recommended |
