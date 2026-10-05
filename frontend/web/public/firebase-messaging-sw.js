importScripts("https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyBnkN0VP6zmOxiZRSkHT_liWQeJergUIXo",
  projectId: "propenu-web",
  messagingSenderId: "1097932635154",
  appId: "1:1097932635154:web:83d86e7abd9e0ae06e2ccb",
});

const messaging = firebase.messaging();

const SITE_ORIGIN = self.location.origin;

function normalizePath(path) {
  if (!path || typeof path !== "string") return "";
  if (/^propenu:\/\//i.test(path)) {
    try {
      const parsed = new URL(path);
      return `/${parsed.hostname}${parsed.pathname}${parsed.search}`.replace(/\/{2,}/g, "/");
    } catch {
      return "";
    }
  }

  if (/^https?:\/\//i.test(path)) {
    try {
      return new URL(path).pathname + new URL(path).search;
    } catch {
      return "";
    }
  }
  return path.startsWith("/") ? path : `/${path}`;
}

function getPayloadData(notification) {
  const data = notification?.data || {};
  return data.FCM_MSG?.data || data;
}

function buildTargetUrl(data = {}) {
  const fallbackUrl = data.webUrl || data.fallbackUrl || data.url;
  if (fallbackUrl) {
    try {
      const parsed = new URL(fallbackUrl, SITE_ORIGIN);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        return parsed.href;
      }
    } catch {
      // Fall through to path reconstruction.
    }
  }

  if (data.url) {
    try {
      const parsed = new URL(data.url, SITE_ORIGIN);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        return parsed.href;
      }
    } catch {
      // Fall through to path reconstruction.
    }
  }

  const path = normalizePath(data.path || data.targetPath || data.link || data.deepLink);
  if (path) return new URL(path, SITE_ORIGIN).href;

  const slug = String(data.slug || "").trim();
  if (!slug) return SITE_ORIGIN;

  const listingKind = String(data.listingKind || "").toLowerCase();
  const category = String(data.category || data.propertyType || "").toLowerCase();
  const promotionType = String(data.promotionType || "").toLowerCase();

  if (listingKind === "project" || category === "featuredproject") {
    return new URL(promotionType === "prime" ? `/prime/${slug}` : `/project/${slug}`, SITE_ORIGIN).href;
  }

  if (category) {
    const normalizedCategory = category === "plots" || category === "plot" ? "land" : category;
    return new URL(`/properties/${normalizedCategory}/${slug}`, SITE_ORIGIN).href;
  }

  return SITE_ORIGIN;
}

messaging.onBackgroundMessage((payload) => {
  const notification = payload.notification || {};
  const data = payload.data || {};

  self.registration.showNotification(notification.title || "Propenu", {
    body: notification.body || "",
    icon: notification.icon || "/icons/icon-192x192.png",
    image: notification.image,
    data,
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = buildTargetUrl(getPayloadData(event.notification));

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        const clientUrl = new URL(client.url);
        const target = new URL(targetUrl);

        if (clientUrl.origin === target.origin && "focus" in client) {
          return client.focus().then(() => client.navigate(targetUrl));
        }
      }

      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }

      return undefined;
    }),
  );
});
