/* =====================================================================
   Open Frontier // Live Translation — Cloudflare Worker proxy
   Holds the Gemini API key server-side and proxies the Gemini Live
   (BidiGenerateContent) WebSocket so the static site can offer keyless
   translation without ever shipping the key to the browser.

   Secrets / vars (set via wrangler, see worker/README.md):
     GEMINI_API_KEY   (secret)  -> your AIza... key
     ALLOWED_ORIGINS  (var)     -> comma-separated origins allowed to connect
   ===================================================================== */

const GEMINI_WS =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";

export default {
  async fetch(request, env) {
    // Only WebSocket upgrades are proxied.
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response(
        "Open Frontier translate proxy — expects a WebSocket upgrade.",
        { status: 426 }
      );
    }

    // Origin allowlist (skip the check entirely if ALLOWED_ORIGINS is unset).
    const origin = request.headers.get("Origin") || "";
    const allowed = (env.ALLOWED_ORIGINS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (allowed.length && !allowed.includes(origin)) {
      return new Response("Forbidden origin: " + origin, { status: 403 });
    }

    if (!env.GEMINI_API_KEY) {
      return new Response("Server missing GEMINI_API_KEY", { status: 500 });
    }

    // Open the upstream WebSocket to Gemini, authenticated with the secret key.
    const upstreamUrl = `${GEMINI_WS}?key=${env.GEMINI_API_KEY}`;
    let upstream;
    try {
      const resp = await fetch(upstreamUrl, {
        headers: { Upgrade: "websocket" },
      });
      upstream = resp.webSocket;
      if (!upstream) {
        return new Response("Upstream did not return a WebSocket", { status: 502 });
      }
    } catch (e) {
      return new Response("Upstream connect failed: " + e.message, { status: 502 });
    }
    upstream.accept();

    // Client-facing socket.
    const [client, server] = Object.values(new WebSocketPair());
    server.accept();

    // Pipe both directions; forward close codes/reasons where valid.
    const closeSafe = (sock, code, reason) => {
      try { sock.close(code >= 1000 && code <= 4999 ? code : 1000, reason || ""); } catch (_) {}
    };

    server.addEventListener("message", (e) => { try { upstream.send(e.data); } catch (_) {} });
    upstream.addEventListener("message", (e) => { try { server.send(e.data); } catch (_) {} });

    server.addEventListener("close", (e) => closeSafe(upstream, e.code, e.reason));
    upstream.addEventListener("close", (e) => closeSafe(server, e.code, e.reason));

    server.addEventListener("error", () => closeSafe(upstream, 1011, "client error"));
    upstream.addEventListener("error", () => closeSafe(server, 1011, "upstream error"));

    return new Response(null, { status: 101, webSocket: client });
  },
};
