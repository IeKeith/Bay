/**
 * Garden-to-Table Host — Satay by the Bay AI Concierge
 * Frontend Application: Voice-to-Voice STT, Perxona 3D Avatar Streaming,
 * and Dynamic Timed Hawker Route Synchronization.
 */

// ── DOM References ──────────────────────────────────────────────────────────
const avatarPresenter = document.getElementById("avatar-presenter");
const audioOverlay = document.getElementById("audio-overlay");
const unlockAudioBtn = document.getElementById("unlock-audio-btn");
const avatarLiveIndicator = document.getElementById("avatar-live-indicator");
const avatarStatusLabel = document.getElementById("avatar-status-label");
const spokenSubtitle = document.getElementById("spoken-subtitle");
const subtitleText = document.getElementById("subtitle-text");
const systemStatusText = document.getElementById("system-status-text");

const avatarSelect = document.getElementById("avatar-select");
const voiceSelect = document.getElementById("voice-select");
const relaunchBtn = document.getElementById("relaunch-btn");

const autoListenToggle = document.getElementById("auto-listen-toggle");
const chatLog = document.getElementById("chat-log");
const micBtn = document.getElementById("mic-btn");
const micIcon = document.getElementById("mic-icon");
const micLabel = document.getElementById("mic-label");
const repairNotice = document.getElementById("repair-notice");
const repairText = document.getElementById("repair-text");
const textChatForm = document.getElementById("text-chat-form");
const chatInput = document.getElementById("chat-input");

// Route Card Elements
const routeCountdown = document.getElementById("route-countdown");
const routeTargetDestination = document.getElementById("route-target-destination");
const routeTargetNote = document.getElementById("route-target-note");
const routeSteps = document.getElementById("route-steps");
const routeTotalCost = document.getElementById("route-total-cost");
const routeWalkBuffer = document.getElementById("route-walk-buffer");

// ── Application State ───────────────────────────────────────────────────────
let config = null;
let presenterReady = false;
let isAudioUnlocked = false;
let isListening = false;
let recognition = null;
let speechSynthesisActive = false;
let chatHistory = [];
let currentAvatarPersona = "Mei";

// ── API Helper ─────────────────────────────────────────────────────────────
async function apiRequest(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || data.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// ── Presenter Engine Bootstrap ─────────────────────────────────────────────
async function loadPresenterEngine(presenterUrl) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.type = "module";
    script.src = presenterUrl;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Failed to load presenter script: ${presenterUrl}`));
    document.head.appendChild(script);
  });
}

let activeSceneId = "01KQEJD0NJFVM20M588K7D1E9Z";

async function initPresenter() {
  try {
    systemStatusText.textContent = "Connecting to Perxona...";
    avatarStatusLabel.textContent = "Connecting...";

    const { connect_token } = await apiRequest("/api/connect-token");
    const targetAvatar = avatarSelect.value || config?.defaults?.avatarId || "01KZFW8613MF0AWNRR59BBDMG6";
    const targetVoice = voiceSelect.value || config?.defaults?.voiceId || undefined;
    const targetScene = activeSceneId || config?.defaults?.sceneId || "01KQEJD0NJFVM20M588K7D1E9Z";

    avatarStatusLabel.textContent = "Initializing Avatar...";
    await avatarPresenter.initialize(connect_token, {
      avatarId: targetAvatar,
      sceneId: targetScene,
      voiceId: targetVoice,
    });

    avatarPresenter.hidden = false;
    presenterReady = true;
    systemStatusText.textContent = "Online";
    avatarStatusLabel.textContent = `${currentAvatarPersona} is Ready`;
  } catch (err) {
    console.warn("[Presenter] Initialization warning:", err);
    systemStatusText.textContent = "Mock / Standby";
    avatarStatusLabel.textContent = `${currentAvatarPersona} (Speech Ready)`;
  }
}

// Token auto-refresh handler
let isRefreshingToken = false;
avatarPresenter.addEventListener("CONNECT_TOKEN_EXPIRED", async () => {
  if (isRefreshingToken) return;
  isRefreshingToken = true;
  try {
    const { connect_token } = await apiRequest("/api/connect-token");
    avatarPresenter.refreshConnectToken?.(connect_token);
    console.log("[Presenter] Token refreshed.");
  } catch (e) {
    console.error("[Presenter] Token refresh failed:", e);
  } finally {
    isRefreshingToken = false;
  }
});

// Presenter status events
avatarPresenter.addEventListener("PRESENTER_STATUS", (e) => {
  const status = e.detail?.status;
  if (status === "Ready") {
    presenterReady = true;
    avatarStatusLabel.textContent = `${currentAvatarPersona} is Ready`;
  }
});

avatarPresenter.addEventListener("PERFORMANCE_START", () => {
  speechSynthesisActive = true;
  avatarLiveIndicator.classList.add("speaking");
  avatarStatusLabel.textContent = `${currentAvatarPersona} is Speaking...`;
});

avatarPresenter.addEventListener("PLAYING_SPEECH_TEXT", (e) => {
  const text = e.detail?.text;
  if (text) {
    spokenSubtitle.hidden = false;
    subtitleText.textContent = text;
  }
});

avatarPresenter.addEventListener("ALL_PERFORMANCE_FINISHED", () => {
  speechSynthesisActive = false;
  avatarLiveIndicator.classList.remove("speaking");
  avatarStatusLabel.textContent = `${currentAvatarPersona} is Ready`;
  setTimeout(() => {
    if (!speechSynthesisActive) spokenSubtitle.hidden = true;
  }, 1200);

  // If auto-listen is active, resume microphone
  if (autoListenToggle.checked && !isListening) {
    startListening();
  }
});

// ── Speak Helper (Sentence-by-Sentence Queue) ──────────────────────────────
async function speakSentence(text) {
  if (!text || !text.trim()) return;
  const clean = text.trim();
  spokenSubtitle.hidden = false;
  subtitleText.textContent = clean;

  if (avatarPresenter && avatarPresenter.present) {
    try {
      await avatarPresenter.present(clean);
    } catch (e) {
      console.warn("[Presenter] Speech synthesis error:", e);
    }
  }
}

// ── Web Speech API Voice-to-Voice STT ───────────────────────────────────────
function setupSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    micBtn.disabled = true;
    micLabel.textContent = "Mic Not Supported (Use Text)";
    return;
  }

  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = "en-SG"; // Singapore English locale

  recognition.onstart = () => {
    isListening = true;
    micBtn.classList.add("listening");
    micIcon.textContent = "🔴";
    micLabel.textContent = "Listening... Speak now";
  };

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    if (transcript.trim()) {
      handleUserMessage(transcript.trim());
    }
  };

  recognition.onerror = (event) => {
    console.warn("[STT] Recognition event:", event.error);
    stopListening();
  };

  recognition.onend = () => {
    stopListening();
  };
}

function startListening() {
  if (speechSynthesisActive) return; // Don't listen to self
  if (!recognition) setupSpeechRecognition();
  try {
    recognition.start();
  } catch (e) {
    // Already running or permission needed
  }
}

function stopListening() {
  isListening = false;
  micBtn.classList.remove("listening");
  micIcon.textContent = "🎤";
  micLabel.textContent = "Tap to Speak";
  try {
    recognition?.stop();
  } catch (e) {}
}

micBtn.addEventListener("click", () => {
  if (isListening) {
    stopListening();
  } else {
    // If audio not unlocked yet, unlock it now
    if (!isAudioUnlocked) unlockAudio();
    startListening();
  }
});

// ── Autoplay Audio Unlock ──────────────────────────────────────────────────
async function unlockAudio() {
  isAudioUnlocked = true;
  try {
    await avatarPresenter.resumeAudioPlayback?.();
  } catch (e) {
    console.warn("Audio unlock note:", e);
  }
  audioOverlay.classList.add("hidden");
}

unlockAudioBtn.addEventListener("click", unlockAudio);

// ── Chat UI & Streaming LLM ─────────────────────────────────────────────────
function appendMessage(role, text) {
  const bubble = document.createElement("div");
  bubble.className = `chat-bubble ${role === "user" ? "user-bubble" : "bot-bubble"}`;

  const sender = document.createElement("div");
  sender.className = "bubble-sender";
  sender.textContent = role === "user" ? "You" : `🌿 ${currentAvatarPersona} • Concierge`;

  const content = document.createElement("div");
  content.className = "bubble-text";
  content.innerHTML = formatMessageMarkdown(text);

  bubble.appendChild(sender);
  bubble.appendChild(content);
  chatLog.appendChild(bubble);
  chatLog.scrollTop = chatLog.scrollHeight;
  return content;
}

function formatMessageMarkdown(str) {
  return str
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/\n/g, "<br>");
}

async function handleUserMessage(message) {
  if (!message || !message.trim()) return;
  stopListening();

  // Show repair notification if phonetic replacement triggered
  const detectedCorrections = checkPhoneticPreview(message);
  if (detectedCorrections) {
    repairNotice.hidden = false;
    repairText.textContent = detectedCorrections;
    setTimeout(() => { repairNotice.hidden = true; }, 4000);
  }

  // Append user message
  appendMessage("user", message);
  chatHistory.push({ role: "user", content: message });

  // Update Route Card tentatively based on scenario
  syncRouteCardFromContext(message);

  // Stream LLM response
  await streamChatResponse(message);
}

function checkPhoneticPreview(raw) {
  const replacements = [
    [/\b(sate|sata|satey)\b/gi, "Satay"],
    [/\b(sting\s*ray|sambal\s*ray)\b/gi, "Sambal Stingray"],
    [/\b(hokkien\s*mee|hoki\s*mee)\b/gi, "Hokkien Mee"],
    [/\b(prata|paratha)\b/gi, "Roti Prata"],
    [/\b(sugarcane|sugar can)\b/gi, "Sugar Cane Juice"],
    [/\b(chendol|cendol)\b/gi, "Chendol"],
  ];
  const matched = [];
  for (const [re, rep] of replacements) {
    if (re.test(raw)) matched.push(rep);
  }
  return matched.length ? matched.join(", ") : null;
}

async function streamChatResponse(userMsg) {
  const botBubbleContent = appendMessage("assistant", "...");
  let fullResponse = "";
  let sentenceBuffer = "";

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: userMsg,
        avatarId: avatarSelect.value,
        history: chatHistory.slice(-6),
      }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    botBubbleContent.innerHTML = "";

    let doneReading = false;
    while (!doneReading) {
      const { value, done } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n");

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const dataStr = line.slice(6).trim();
        if (dataStr === "[DONE]") {
          doneReading = true;
          break;
        }
        try {
          const parsed = JSON.parse(dataStr);
          if (parsed.delta) {
            fullResponse += parsed.delta;
            sentenceBuffer += parsed.delta;
            botBubbleContent.innerHTML = formatMessageMarkdown(fullResponse);
            chatLog.scrollTop = chatLog.scrollHeight;

            // Check if sentenceBuffer has reached a natural speech punctuation boundary
            const sentenceMatch = sentenceBuffer.match(/^(.*?[.!?])(\s+.*|$)/s);
            if (sentenceMatch) {
              const completeSentence = sentenceMatch[1].trim();
              sentenceBuffer = sentenceMatch[2] || "";
              if (completeSentence) {
                speakSentence(completeSentence);
              }
            }
          }
        } catch (e) {}
      }
    }

    // Flush any remaining text in sentenceBuffer
    if (sentenceBuffer.trim()) {
      speakSentence(sentenceBuffer.trim());
    }

    chatHistory.push({ role: "assistant", content: fullResponse });

    // Sync Route Card with LLM output
    syncRouteCardFromContext(fullResponse);

  } catch (err) {
    console.error("[Chat Stream Error]", err);
    botBubbleContent.innerHTML = `<em>Apologies, could not connect: ${err.message}</em>`;
  }
}

// ── Dynamic Route Card Synchronization ─────────────────────────────────────
function syncRouteCardFromContext(text) {
  const lower = text.toLowerCase();

  // Scenario 3: Auto-Replan / Delay detected
  if (lower.includes("replan") || lower.includes("delay") || lower.includes("swap") || lower.includes("surge") || lower.includes("pratas with dhal") || lower.includes("cheese & mushroom prata")) {
    routeCountdown.textContent = "22 mins remaining ⚠️";
    routeCountdown.className = "badge badge-timer";
    routeTargetDestination.textContent = "Supertree Light Show (7:45 PM)";
    routeTargetNote.textContent = "⚡ Emergency Fast Route — Preserves 7:45 PM Light Show!";

    routeSteps.innerHTML = `
      <div class="route-step active" style="border-color: rgba(245, 158, 11, 0.6); background: rgba(245, 158, 11, 0.12);">
        <div class="step-badge" style="background: var(--satay-amber);">⚡</div>
        <div class="step-details">
          <div class="step-title-row">
            <strong class="step-name">Stall 4: Garden Greens & Prata</strong>
            <span class="step-status status-ready">Swapped & Cooking 🔥</span>
          </div>
          <p class="step-desc">2x Cheese & Mushroom Prata with Dhal ($10.00)</p>
          <span class="step-meta">Prep: ~6 mins (Saved 14 mins!)</span>
        </div>
      </div>
      <div class="route-step active">
        <div class="step-badge">2</div>
        <div class="step-details">
          <div class="step-title-row">
            <strong class="step-name">Stall 5: Marina Refreshments</strong>
            <span class="step-status status-ready">Ready for Pickup ⚡</span>
          </div>
          <p class="step-desc">Fresh Sugar Cane Juice ($3.50)</p>
          <span class="step-meta">Instant pickup • Vegan & Refreshing</span>
        </div>
      </div>
    `;

    routeTotalCost.textContent = "SGD $13.50";
    routeWalkBuffer.textContent = "🚶 8m walk preserved! Arrive safely at 7:35 PM";
    return;
  }

  // Scenario 2: Vegetarian / Peanut-Free
  if (lower.includes("vegetarian") || lower.includes("peanut") || lower.includes("flower dome") || lower.includes("plant-based")) {
    routeCountdown.textContent = "45 mins remaining";
    routeCountdown.className = "badge badge-accent";
    routeTargetDestination.textContent = "Supertree Light Show (7:45 PM)";
    routeTargetNote.textContent = "8–10 min walk from Satay by the Bay";

    routeSteps.innerHTML = `
      <div class="route-step active">
        <div class="step-badge">1</div>
        <div class="step-details">
          <div class="step-title-row">
            <strong class="step-name">Stall 4: Garden Greens & Prata</strong>
            <span class="step-status status-cooking">On Griddle 🍳</span>
          </div>
          <p class="step-desc">Crispy Plain Prata (2 pcs) with Dhal ($3.50) • Halal & Nut-Free</p>
          <span class="step-meta">Prep: ~5 mins • 100% Plant-friendly</span>
        </div>
      </div>
      <div class="route-step">
        <div class="step-badge">2</div>
        <div class="step-details">
          <div class="step-title-row">
            <strong class="step-name">Stall 5: Marina Refreshments</strong>
            <span class="step-status status-ready">Instant Pickup ⚡</span>
          </div>
          <p class="step-desc">Fresh Thai Coconut ($5.50)</p>
          <span class="step-meta">Zero wait • Hydrating & Nut-Free</span>
        </div>
      </div>
    `;

    routeTotalCost.textContent = "SGD $9.00";
    routeWalkBuffer.textContent = "🚶 8m walk + 20m relaxed dining";
    return;
  }

  // Scenario 1: Halal Group / Rush
  if (lower.includes("satay") || lower.includes("chicken") || lower.includes("halal") || lower.includes("family")) {
    routeCountdown.textContent = "38 mins remaining";
    routeCountdown.className = "badge badge-timer";
    routeTargetDestination.textContent = "Supertree Light Show (7:45 PM)";
    routeTargetNote.textContent = "8–10 min walk from Satay by the Bay";

    routeSteps.innerHTML = `
      <div class="route-step active">
        <div class="step-badge">1</div>
        <div class="step-details">
          <div class="step-title-row">
            <strong class="step-name">Stall 1: City Satay</strong>
            <span class="step-status status-cooking">Grilling 🔥</span>
          </div>
          <p class="step-desc">10x Chicken Satay ($9.00) + Ketupat ($2.00) • Halal</p>
          <span class="step-meta">Prep: ~15 mins • Wait: 20 mins</span>
        </div>
      </div>
      <div class="route-step">
        <div class="step-badge">2</div>
        <div class="step-details">
          <div class="step-title-row">
            <strong class="step-name">Stall 5: Marina Refreshments</strong>
            <span class="step-status status-ready">Ready for Pickup ⚡</span>
          </div>
          <p class="step-desc">Fresh Sugar Cane Juice with Lemon ($3.50)</p>
          <span class="step-meta">Collect immediately while Satay grills</span>
        </div>
      </div>
    `;

    routeTotalCost.textContent = "SGD $14.50";
    routeWalkBuffer.textContent = "🚶 8m walk + 15m dining safe";
  }
}

// ── Quick Prompt Chips ──────────────────────────────────────────────────────
document.querySelectorAll(".chip-btn").forEach((chip) => {
  chip.addEventListener("click", () => {
    const prompt = chip.getAttribute("data-prompt");
    if (!isAudioUnlocked) unlockAudio();
    handleUserMessage(prompt);
  });
});

// ── Text Form Input ────────────────────────────────────────────────────────
textChatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (text) {
    if (!isAudioUnlocked) unlockAudio();
    chatInput.value = "";
    handleUserMessage(text);
  }
});

// ── Avatar & Voice Controls ────────────────────────────────────────────────
avatarSelect.addEventListener("change", () => {
  const val = avatarSelect.value;
  currentAvatarPersona = val && (val.includes("m") || val.includes("raj")) ? "Raj" : "Mei";
  avatarStatusLabel.textContent = `${currentAvatarPersona} is Ready`;
  initPresenter();
});

voiceSelect.addEventListener("change", () => {
  initPresenter();
});

relaunchBtn.addEventListener("click", () => {
  initPresenter();
});

// ── Load Catalog & Start App ───────────────────────────────────────────────
async function startup() {
  try {
    config = await apiRequest("/api/config");

    // Load Presenter Web Component script
    if (config.presenterUrl) {
      await loadPresenterEngine(config.presenterUrl);
    }

    // Populate Avatars, Scenes & Voices
    const [avatarData, sceneData, voiceData] = await Promise.all([
      apiRequest("/api/avatars").catch(() => ({ items: [] })),
      apiRequest("/api/scenes").catch(() => ({ items: [] })),
      apiRequest("/api/voices").catch(() => ({ items: [] })),
    ]);

    if (sceneData.items && sceneData.items.length > 0) {
      activeSceneId = sceneData.items[0].id;
    }

    avatarSelect.innerHTML = "";
    (avatarData.items || []).forEach((av) => {
      const opt = document.createElement("option");
      opt.value = av.id;
      opt.textContent = av.name;
      avatarSelect.appendChild(opt);
    });

    voiceSelect.innerHTML = "";
    (voiceData.items || []).forEach((vc) => {
      const opt = document.createElement("option");
      opt.value = vc.id;
      opt.textContent = vc.name;
      voiceSelect.appendChild(opt);
    });

    setupSpeechRecognition();

    // Initialize presenter
    await initPresenter();
  } catch (err) {
    console.error("[Startup Error]", err);
    systemStatusText.textContent = "Standby (Local)";
  }
}

startup();
