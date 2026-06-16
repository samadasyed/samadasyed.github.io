/* =====================================================================
   Open Frontier // Live Translation
   Client-side app: captures stream audio -> Gemini 3.5 Live Translate
   -> translated voice + YouTube-style captions.
   ===================================================================== */

const CONFIG = {
  model: "models/gemini-3.5-live-translate-preview",
  wsBase:
    "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent",
  // Shared-key proxy. When set (e.g. "wss://openfrontier-translate.<you>.workers.dev"),
  // visitors translate with no key of their own — the Cloudflare Worker injects the key
  // server-side. Leave "" to fall back to bring-your-own-key.
  proxyUrl: "",
  demoVideoId: "mmpW36WdFbI", // NeurIPS 2025 panel (demo)
  liveVideoId: "", // set the Open Frontier livestream video id here on event day
  inputSampleRate: 16000, // Gemini input: 16 kHz PCM16 mono
  outputSampleRate: 24000, // Gemini output: 24 kHz PCM16 mono
};

/* ---- Target languages (BCP-47) ---- */
const LANGUAGES = [
  ["es", "Spanish"], ["fr", "French"], ["de", "German"], ["it", "Italian"],
  ["pt", "Portuguese"], ["nl", "Dutch"], ["pl", "Polish"], ["ru", "Russian"],
  ["uk", "Ukrainian"], ["tr", "Turkish"], ["sv", "Swedish"], ["da", "Danish"],
  ["no", "Norwegian"], ["fi", "Finnish"], ["el", "Greek"], ["cs", "Czech"],
  ["ro", "Romanian"], ["hu", "Hungarian"], ["ar", "Arabic"], ["he", "Hebrew"],
  ["fa", "Persian"], ["hi", "Hindi"], ["bn", "Bengali"], ["ur", "Urdu"],
  ["ta", "Tamil"], ["te", "Telugu"], ["ja", "Japanese"], ["ko", "Korean"],
  ["zh", "Chinese (Mandarin)"], ["yue", "Chinese (Cantonese)"], ["vi", "Vietnamese"],
  ["th", "Thai"], ["id", "Indonesian"], ["ms", "Malay"], ["fil", "Filipino"],
  ["sw", "Swahili"], ["af", "Afrikaans"], ["en", "English"],
];

/* ---- Researcher marquee (mirrors openfrontier.ai) ---- */
const NAMES = [
  "ION STOICA","DSPY","PERCY LIANG","NVIDIA","ARENA","HARBOR","STANFORD","ARCEE",
  "ROBERT NISHIHARA","FRANÇOIS CHOLLET","ALEX DIMAKIS","ANDREJ KARPATHY","LMSYS",
  "BERKELEY","DYLAN PATEL","ARC PRIZE FOUNDATION","LMCACHE","SIMON MO","SEMIANALYSIS",
  "JENIA JITSEV","AI2","JOEY GONZALEZ","COMMON CRAWL","ANDY KONWINSKI",
  "ANASTASIOS ANGELOPOULOS","SNORKEL AI","OPEN ATHENA","REFLECTION AI","MATEI ZAHARIA",
  "GEPA","NEMOTRON","JAX","OMAR KHATTAB","MARIN","NATHAN LAMBERT","OLMO","PYTORCH",
  "ORIOL VINYALS","MIT","RAY","TREVOR DARRELL","SKYRL","HUGGING FACE","SGLANG",
  "GRAHAM NEUBIG","TERMINAL BENCH","ELEUTHERAI","BRYAN CATANZARO","JONATHAN FRANKLE",
  "OPENTHOUGHTS","LAION","DATABRICKS","HANNA HAJISHIRZI","ATOM","ANYSCALE","OPENHANDS",
  "YEJIN CHOI","VLLM","JUNCHEN JIANG","OPEN JARVIS","MISTRAL AI","THOMAS WOLF",
];

/* ===================================================================== */
/* DOM                                                                    */
/* ===================================================================== */
const $ = (id) => document.getElementById(id);
const els = {};
[
  "marqueeTrack","captions","liveBadge","sourceLabel","srcDemoBtn","srcLiveBtn",
  "clearTranscript","transcript","keyField","apiKey","toggleKey","rememberKey",
  "sharedKeyNote","targetLang","origVol","origVolVal","transVol","transVolVal",
  "playTranslated","startBtn","stopBtn","status","statusDot","statusText",
].forEach((id) => (els[id] = $(id)));

/* ===================================================================== */
/* App state                                                              */
/* ===================================================================== */
const state = {
  player: null,
  ytReady: false,
  source: "demo",
  ws: null,
  sessionReady: false,
  running: false,
  captureStream: null,
  inputCtx: null,
  processor: null,
  micSource: null,
  playbackCtx: null,
  transGain: null,
  nextPlayTime: 0,
  captionBuffer: "",
  captionTimer: null,
};

/* ===================================================================== */
/* Init UI                                                                */
/* ===================================================================== */
function initUI() {
  // languages
  LANGUAGES.forEach(([code, name]) => {
    const o = document.createElement("option");
    o.value = code;
    o.textContent = name;
    els.targetLang.appendChild(o);
  });
  els.targetLang.value = "es";

  // marquee (doubled for seamless loop)
  const block = NAMES.map((n) => `${n}<span class="dotsep">·</span>`).join("");
  els.marqueeTrack.innerHTML = block + block;

  // shared-key proxy: hide the key field, show the "shared key active" note
  if (CONFIG.proxyUrl) {
    els.keyField.hidden = true;
    els.sharedKeyNote.hidden = false;
  } else {
    // bring-your-own-key: restore a remembered key
    const saved = localStorage.getItem("of_gemini_key");
    if (saved) {
      els.apiKey.value = saved;
      els.rememberKey.checked = true;
    }
  }

  const savedLang = localStorage.getItem("of_lang");
  if (savedLang) els.targetLang.value = savedLang;

  wireEvents();
}

function wireEvents() {
  els.toggleKey.onclick = () => {
    els.apiKey.type = els.apiKey.type === "password" ? "text" : "password";
  };
  els.targetLang.onchange = () =>
    localStorage.setItem("of_lang", els.targetLang.value);

  els.origVol.oninput = () => {
    els.origVolVal.textContent = els.origVol.value + "%";
    if (state.player && state.player.setVolume)
      state.player.setVolume(parseInt(els.origVol.value, 10));
  };
  els.transVol.oninput = () => {
    els.transVolVal.textContent = els.transVol.value + "%";
    if (state.transGain)
      state.transGain.gain.value = parseInt(els.transVol.value, 10) / 100;
  };

  els.srcDemoBtn.onclick = () => switchSource("demo");
  els.srcLiveBtn.onclick = () => switchSource("live");

  els.clearTranscript.onclick = () => {
    els.transcript.innerHTML =
      '<div class="transcript-empty mono muted">Translated text will appear here once you start.</div>';
  };

  els.startBtn.onclick = start;
  els.stopBtn.onclick = () => stop("STOPPED");
}

/* ===================================================================== */
/* YouTube IFrame player                                                  */
/* ===================================================================== */
window.onYouTubeIframeAPIReady = function () {
  state.ytReady = true;
  buildPlayer(CONFIG.demoVideoId);
};

function buildPlayer(videoId) {
  if (state.player) {
    state.player.loadVideoById(videoId);
    return;
  }
  state.player = new YT.Player("player", {
    videoId,
    playerVars: { rel: 0, modestbranding: 1, playsinline: 1 },
    events: {
      onReady: (e) => e.target.setVolume(parseInt(els.origVol.value, 10)),
    },
  });
}

function switchSource(src) {
  state.source = src;
  els.srcDemoBtn.classList.toggle("active", src === "demo");
  els.srcLiveBtn.classList.toggle("active", src === "live");

  if (src === "demo") {
    els.sourceLabel.textContent = "DEMO · NeurIPS 2025 Panel";
    if (state.ytReady) buildPlayer(CONFIG.demoVideoId);
  } else {
    let id = CONFIG.liveVideoId;
    if (!id) {
      id = (
        prompt(
          "Open Frontier livestream not configured yet.\nPaste the YouTube livestream URL or video ID:"
        ) || ""
      ).trim();
      const m = id.match(/(?:v=|youtu\.be\/|live\/|embed\/)([\w-]{11})/);
      if (m) id = m[1];
      if (id) CONFIG.liveVideoId = id;
    }
    if (id) {
      els.sourceLabel.textContent = "LIVESTREAM · Open Frontier";
      if (state.ytReady) buildPlayer(id);
    } else {
      switchSource("demo");
    }
  }
}

/* ===================================================================== */
/* Status helpers                                                         */
/* ===================================================================== */
function setStatus(text, cls) {
  els.statusText.textContent = text;
  els.statusDot.className = "status-dot" + (cls ? " " + cls : "");
}

/* ===================================================================== */
/* START / STOP                                                           */
/* ===================================================================== */
async function start() {
  const useProxy = !!CONFIG.proxyUrl;
  const apiKey = els.apiKey.value.trim();
  if (!useProxy) {
    if (!apiKey) {
      setStatus("ENTER API KEY FIRST", "error");
      els.apiKey.focus();
      return;
    }
    if (els.rememberKey.checked) localStorage.setItem("of_gemini_key", apiKey);
    else localStorage.removeItem("of_gemini_key");
  }

  els.startBtn.disabled = true;
  setStatus("REQUESTING AUDIO…", "connecting");

  // 1) Capture tab/screen audio
  try {
    state.captureStream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
  } catch (err) {
    setStatus("SCREEN SHARE CANCELLED", "error");
    els.startBtn.disabled = false;
    return;
  }
  const audioTracks = state.captureStream.getAudioTracks();
  if (!audioTracks.length) {
    setStatus("NO AUDIO SHARED — TICK ‘SHARE TAB AUDIO’", "error");
    cleanupCapture();
    els.startBtn.disabled = false;
    return;
  }
  // we don't need the video track
  state.captureStream.getVideoTracks().forEach((t) => t.stop());
  // if the user stops sharing from the browser bar, stop gracefully
  audioTracks[0].onended = () => stop("SHARE ENDED");

  // 2) Audio graph (playback + capture)
  setupAudioGraph();

  // 3) Open Gemini Live session
  connectWebSocket(apiKey);
}

function stop(reason) {
  state.running = false;
  state.sessionReady = false;

  if (state.ws) {
    try { state.ws.close(); } catch (_) {}
    state.ws = null;
  }
  cleanupCapture();
  if (state.processor) { try { state.processor.disconnect(); } catch (_) {} state.processor = null; }
  if (state.micSource) { try { state.micSource.disconnect(); } catch (_) {} state.micSource = null; }
  if (state.inputCtx) { state.inputCtx.close().catch(() => {}); state.inputCtx = null; }
  if (state.playbackCtx) { state.playbackCtx.close().catch(() => {}); state.playbackCtx = null; }
  state.transGain = null;
  state.nextPlayTime = 0;

  els.startBtn.hidden = false;
  els.startBtn.disabled = false;
  els.stopBtn.hidden = true;
  els.liveBadge.hidden = true;
  setStatus(reason || "IDLE", reason === "ERROR" ? "error" : "");
}

function cleanupCapture() {
  if (state.captureStream) {
    state.captureStream.getTracks().forEach((t) => t.stop());
    state.captureStream = null;
  }
}

/* ===================================================================== */
/* Audio graph                                                            */
/* ===================================================================== */
function setupAudioGraph() {
  // Playback context (translated voice)
  state.playbackCtx = new (window.AudioContext || window.webkitAudioContext)();
  state.transGain = state.playbackCtx.createGain();
  state.transGain.gain.value = parseInt(els.transVol.value, 10) / 100;
  state.transGain.connect(state.playbackCtx.destination);
  state.nextPlayTime = 0;

  // Capture context (downsample source audio for Gemini)
  state.inputCtx = new (window.AudioContext || window.webkitAudioContext)();
  state.micSource = state.inputCtx.createMediaStreamSource(state.captureStream);
  state.processor = state.inputCtx.createScriptProcessor(4096, 1, 1);
  state.processor.onaudioprocess = (e) => {
    if (!state.sessionReady || !state.running) return;
    const input = e.inputBuffer.getChannelData(0);
    const down = downsample(input, state.inputCtx.sampleRate, CONFIG.inputSampleRate);
    const b64 = floatToPcm16Base64(down);
    sendAudioChunk(b64);
  };
  state.micSource.connect(state.processor);
  // ScriptProcessor needs a sink to fire; route to a muted gain
  const mute = state.inputCtx.createGain();
  mute.gain.value = 0;
  state.processor.connect(mute);
  mute.connect(state.inputCtx.destination);
}

/* ===================================================================== */
/* WebSocket session                                                      */
/* ===================================================================== */
function connectWebSocket(apiKey) {
  setStatus("CONNECTING…", "connecting");
  // Proxy mode: connect to the Worker (key added server-side). Otherwise BYO key.
  const url = CONFIG.proxyUrl
    ? CONFIG.proxyUrl
    : `${CONFIG.wsBase}?key=${encodeURIComponent(apiKey)}`;
  const ws = new WebSocket(url);
  state.ws = ws;

  ws.onopen = () => {
    const setup = {
      setup: {
        model: CONFIG.model,
        generationConfig: {
          responseModalities: ["AUDIO"],
          translationConfig: {
            targetLanguageCode: els.targetLang.value,
            echoTargetLanguage: true,
          },
        },
        inputAudioTranscription: {},
        outputAudioTranscription: {},
      },
    };
    ws.send(JSON.stringify(setup));
  };

  ws.onmessage = async (event) => {
    let data = event.data;
    if (data instanceof Blob) data = await data.text();
    let msg;
    try { msg = JSON.parse(data); } catch (_) { return; }
    handleServerMessage(msg);
  };

  ws.onerror = () => {
    setStatus(
      CONFIG.proxyUrl ? "CONNECTION ERROR — PROXY UNREACHABLE" : "CONNECTION ERROR — CHECK API KEY",
      "error"
    );
  };

  ws.onclose = (e) => {
    if (state.running) {
      // unexpected close
      console.warn("WS closed", e.code, e.reason);
      const why = e.reason ? `CLOSED: ${e.reason}` : `CLOSED (${e.code})`;
      stop(why.slice(0, 40).toUpperCase());
    }
  };
}

function handleServerMessage(msg) {
  if (msg.setupComplete) {
    state.sessionReady = true;
    state.running = true;
    els.startBtn.hidden = true;
    els.stopBtn.hidden = false;
    els.liveBadge.hidden = false;
    setStatus("LIVE · TRANSLATING", "live");
    if (state.player && state.player.playVideo) state.player.playVideo();
    return;
  }

  const sc = msg.serverContent;
  if (sc) {
    // translated caption text (target language)
    if (sc.outputTranscription && sc.outputTranscription.text) {
      appendCaption(sc.outputTranscription.text);
    }
    // translated audio
    const parts = sc.modelTurn && sc.modelTurn.parts;
    if (parts) {
      for (const p of parts) {
        if (p.inlineData && p.inlineData.data) playPcm(p.inlineData.data);
      }
    }
    if (sc.turnComplete || sc.generationComplete) finalizeCaption();
  }

  if (msg.error) {
    console.error("Gemini error:", msg.error);
    const m = (msg.error.message || "API ERROR").slice(0, 40).toUpperCase();
    stop(m);
  }
}

function sendAudioChunk(b64) {
  if (!state.ws || state.ws.readyState !== WebSocket.OPEN) return;
  state.ws.send(
    JSON.stringify({
      realtimeInput: {
        audio: { data: b64, mimeType: `audio/pcm;rate=${CONFIG.inputSampleRate}` },
      },
    })
  );
}

/* ===================================================================== */
/* Captions                                                               */
/* ===================================================================== */
function appendCaption(text) {
  state.captionBuffer += text;
  renderCaption(state.captionBuffer);
  // safety: if no turnComplete arrives, finalize after a pause
  clearTimeout(state.captionTimer);
  state.captionTimer = setTimeout(finalizeCaption, 2500);
}

function renderCaption(text) {
  if (!text.trim()) { els.captions.innerHTML = ""; return; }
  // keep it to the last ~2 lines worth of words
  const words = text.trim().split(/\s+/);
  const shown = words.slice(-24).join(" ");
  els.captions.innerHTML = `<div class="cap-line partial">${escapeHtml(shown)}</div>`;
}

function finalizeCaption() {
  clearTimeout(state.captionTimer);
  const text = state.captionBuffer.trim();
  if (text) addTranscript(text);
  state.captionBuffer = "";
}

function addTranscript(text) {
  const empty = els.transcript.querySelector(".transcript-empty");
  if (empty) empty.remove();
  const ts = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const p = document.createElement("p");
  p.innerHTML = `<span class="ts">${ts}</span>${escapeHtml(text)}`;
  els.transcript.appendChild(p);
  els.transcript.scrollTop = els.transcript.scrollHeight;
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

/* ===================================================================== */
/* Audio: capture downsample + playback                                   */
/* ===================================================================== */
function downsample(buffer, inRate, outRate) {
  if (outRate >= inRate) return buffer;
  const ratio = inRate / outRate;
  const newLen = Math.round(buffer.length / ratio);
  const result = new Float32Array(newLen);
  for (let i = 0; i < newLen; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(buffer.length, Math.floor((i + 1) * ratio));
    let sum = 0, count = 0;
    for (let j = start; j < end; j++) { sum += buffer[j]; count++; }
    result[i] = count ? sum / count : buffer[start] || 0;
  }
  return result;
}

function floatToPcm16Base64(float32) {
  const buf = new ArrayBuffer(float32.length * 2);
  const view = new DataView(buf);
  for (let i = 0; i < float32.length; i++) {
    let s = Math.max(-1, Math.min(1, float32[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return bufToBase64(buf);
}

function bufToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToFloat32(b64) {
  const binary = atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  const view = new DataView(bytes.buffer);
  const samples = len / 2;
  const out = new Float32Array(samples);
  for (let i = 0; i < samples; i++) out[i] = view.getInt16(i * 2, true) / 0x8000;
  return out;
}

function playPcm(b64) {
  if (!els.playTranslated.checked || !state.playbackCtx) return;
  const float32 = base64ToFloat32(b64);
  const ctx = state.playbackCtx;
  const buffer = ctx.createBuffer(1, float32.length, CONFIG.outputSampleRate);
  buffer.getChannelData(0).set(float32);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.connect(state.transGain);
  const now = ctx.currentTime;
  if (state.nextPlayTime < now) state.nextPlayTime = now + 0.05;
  src.start(state.nextPlayTime);
  state.nextPlayTime += buffer.duration;
}

/* ===================================================================== */
initUI();
