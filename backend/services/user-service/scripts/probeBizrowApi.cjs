require("dotenv").config();

//const BASE = "https://api.bizrow.app";
const BASE = "https://propenu.in";
const slug = process.env.WHATSAPP_WEBHOOK_SLUG || "tyent";
const token = process.env.WHATSAPP_TOKEN || "";
const verify = process.env.WHATSAPP_VERIFY_TOKEN || "";

const paths = [
  `/api/conversation-flow/webhook/${slug}`,
  `/api/conversation-flow/${slug}/conversations`,
  `/api/conversation-flow/conversations`,
  `/api/conversation-flow/${slug}/chats`,
  `/api/conversation-flow/chats`,
  `/api/conversation-flow/${slug}/inbox`,
  `/api/conversation-flow/inbox`,
  `/api/conversation-flow/${slug}/messages`,
  `/api/conversations`,
  `/api/chats`,
  `/api/inbox`,
  `/api/whatsapp/conversations`,
  `/api/whatsapp/inbox`,
  `/api/tenants/${slug}/conversations`,
  `/api/tenants/${slug}/chats`,
  `/api/v1/conversation-flow/${slug}/conversations`,
  `/api/v1/conversations`,
];

const headersList = [
  {},
  { Authorization: `Bearer ${token}` },
  { Authorization: `Bearer ${verify}` },
  { "x-api-key": verify },
  { "x-verify-token": verify },
  { "x-tenant": slug },
];

(async () => {
  for (const path of paths) {
    for (const headers of headersList) {
      const label = Object.keys(headers).join(",") || "none";
      try {
        const res = await fetch(`${BASE}${path}`, {
          method: "GET",
          headers: { Accept: "application/json", ...headers },
          signal: AbortSignal.timeout(8000),
        });
        const text = await res.text();
        if (res.status === 404 || res.status === 403) continue;
        console.log(
          res.status,
          path,
          "auth=" + label,
          text.slice(0, 180).replace(/\s+/g, " "),
        );
        break;
      } catch (e) {
        // ignore timeouts
      }
    }
  }
})();
