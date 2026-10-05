"use client";

import React, { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { onMessage, type MessagePayload } from "firebase/messaging";
import { Provider } from "react-redux";
import { Toaster, toast } from "sonner";
import Footer, { FooterLegalBar } from "@/components/Footer";
import FloatingWhatsAppButton from "@/components/FloatingWhatsAppButton";
import Navbar from "@/components/Navbar";
import MobileBottomNav from "@/components/MobileBottomNav";
import { ModalProvider, useModal } from "@/app/context/ModalContext";
import { me } from "@/data/ClientData";
import { getFirebaseMessaging } from "@/lib/firebase";
import { store } from "@/Redux/store";
import { initWebPushToken } from "@/utilies/initWebPush";
import { absoluteSiteUrl, normalizeCanonicalPath } from "@/utilies/siteUrl";

const HIDE_LAYOUT_ROUTES = [
  "/prime",
  "/postproperty",
  "/builder/onboard",
  "/builder/invite",
];

const SKIP_CANONICAL_ROUTES = [
  "/admin",
  "/account",
  "/approve",
  "/builder/invite",
  "/unsubscribe",
];

const NOTIFICATION_QUERY_KEYS = new Set([
  "admin-notifications-feed",
  "agent-notifications-badge",
  "agent-notifications-feed-v1",
  "builder-notifications-badge",
  "builder-notifications-feed-v2",
  "user-notifications-badge",
  "user-notifications-feed-v1",
]);

const normalizeNotificationPath = (value?: string) => {
  const raw = String(value || "").trim();
  if (!raw) return "";

  if (/^propenu:\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw);
      return `/${parsed.hostname}${parsed.pathname}${parsed.search}`.replace(
        /\/{2,}/g,
        "/",
      );
    } catch {
      return "";
    }
  }

  if (/^https?:\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw);
      if (parsed.origin !== window.location.origin) return parsed.href;
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    } catch {
      return "";
    }
  }

  return raw.startsWith("/") ? raw : `/${raw}`;
};

const getForegroundNotificationHref = (payload: MessagePayload) => {
  const data = payload.data || {};
  const rawHref =
    data.webUrl ||
    data.url ||
    data.path ||
    data.targetPath ||
    data.link ||
    data.deepLink;

  return normalizeNotificationPath(rawHref);
};

const getForegroundNotificationText = (payload: MessagePayload) => {
  const data = payload.data || {};

  return {
    title:
      payload.notification?.title ||
      data.title ||
      data.notificationTitle ||
      "Propenu",
    body:
      payload.notification?.body ||
      data.body ||
      data.message ||
      "You have a new notification.",
  };
};

export default function ClientProviders({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ModalProvider>
      <ClientProvidersContent>{children}</ClientProvidersContent>
    </ModalProvider>
  );
}

function ClientProvidersContent({
  children,
}: {
  children: React.ReactNode;
}) {
  const [queryClient] = React.useState(() => new QueryClient());

  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [hasOpenDialog, setHasOpenDialog] = useState(false);
  const { isAgentRegistrationModalOpen } = useModal();

  const hideLayout = HIDE_LAYOUT_ROUTES.some((route) =>
    pathname?.startsWith(route),
  );

  useEffect(() => {
    const canonicalPath = normalizeCanonicalPath(pathname);
    const shouldSkipCanonical = SKIP_CANONICAL_ROUTES.some((route) =>
      canonicalPath === route || canonicalPath.startsWith(`${route}/`),
    );

    if (shouldSkipCanonical) {
      return;
    }

    let canonicalLink = document.querySelector<HTMLLinkElement>(
      'link[rel="canonical"]',
    );

    if (!canonicalLink) {
      canonicalLink = document.createElement("link");
      canonicalLink.rel = "canonical";
      document.head.appendChild(canonicalLink);
    }

    canonicalLink.href = absoluteSiteUrl(canonicalPath);
  }, [pathname]);

  useEffect(() => {
    async function fetchUser() {
      try {
        const data = await me();
        setUser(data);
        if (data?.user) {
          localStorage.setItem("role", data.user.roleName || "user");
          localStorage.setItem("userId", data.user.id || data.user._id || "");
          localStorage.setItem("name", data.user.name || "");
          localStorage.setItem("email", data.user.email || "");
        }
      } catch {
        // ignore
      }
    }

    fetchUser();

    const handleAuthChanged = () => {
      fetchUser();
    };

    window.addEventListener("auth-changed", handleAuthChanged);

    return () => {
      window.removeEventListener("auth-changed", handleAuthChanged);
    };
  }, []);

  useEffect(() => {
    const userId = user?.user?.id || user?.user?._id;
    if (!userId) return;

    const initPush = async () => {
      try {
        await initWebPushToken();
      } catch (error) {
        console.error("Push notification setup failed:", error);
      }
    };

    initPush();
  }, [user]);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let isMounted = true;

    const invalidateNotificationQueries = () => {
      queryClient.invalidateQueries({
        predicate: (query) => {
          const queryKey = query.queryKey[0];
          return (
            typeof queryKey === "string" &&
            NOTIFICATION_QUERY_KEYS.has(queryKey)
          );
        },
      });
    };

    const openHref = (href: string) => {
      if (!href) return;

      if (/^https?:\/\//i.test(href)) {
        window.location.assign(href);
        return;
      }

      router.push(href);
    };

    getFirebaseMessaging()
      .then((messaging) => {
        if (!isMounted || !messaging) return;

        unsubscribe = onMessage(messaging, (payload) => {
          const { title, body } = getForegroundNotificationText(payload);
          const href = getForegroundNotificationHref(payload);

          invalidateNotificationQueries();

          toast.message(title, {
            description: body,
            action: href
              ? {
                  label: "Open",
                  onClick: () => openHref(href),
                }
              : undefined,
          });
        });
      })
      .catch((error) => {
        console.error("Foreground push listener setup failed:", error);
      });

    return () => {
      isMounted = false;
      unsubscribe?.();
    };
  }, [queryClient, router]);

  useEffect(() => {
    const syncDialogState = () => {
      const dialogCandidates = Array.from(
        document.querySelectorAll<HTMLElement>(
          '[role="dialog"][aria-modal="true"], [aria-modal="true"]',
        ),
      );

      const hasVisibleDialog = dialogCandidates.some((element) => {
        if (element.getAttribute("aria-hidden") === "true") {
          return false;
        }

        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();

        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          style.opacity !== "0" &&
          rect.width > 0 &&
          rect.height > 0
        );
      });

      setHasOpenDialog(hasVisibleDialog);
    };

    syncDialogState();

    const observer = new MutationObserver(syncDialogState);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["style", "class", "data-state", "aria-hidden", "aria-modal"],
    });

    window.addEventListener("resize", syncDialogState);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", syncDialogState);
    };
  }, []);

  return (
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        {!hideLayout && !isAgentRegistrationModalOpen && <Navbar />}
        <div className={!hideLayout ? "pb-20 lg:pb-0" : undefined}>{children}</div>
        {!hideLayout && !isAgentRegistrationModalOpen && (
          <MobileBottomNav
            isAuthenticated={Boolean(user?.user)}
            isDialogOpen={hasOpenDialog}
          />
        )}
        <FloatingWhatsAppButton />
        <Toaster
          position="top-right"
          richColors
          expand={true}
          duration={3000}
        />
        <div className="hidden lg:block">
          {!hideLayout ? <Footer /> : <FooterLegalBar />}
        </div>
        <ReactQueryDevtools initialIsOpen={false} />
      </QueryClientProvider>
    </Provider>
  );
}
