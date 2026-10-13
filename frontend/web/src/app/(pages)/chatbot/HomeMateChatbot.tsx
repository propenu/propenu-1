"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { IoClose, IoSend } from "react-icons/io5";

import { getChatbotResponse } from "@/data/ClientData";
import { useCity } from "@/hooks/useCity";
import { ChatbotIcon } from "@/icons/icons";

type HomeMateAccount = {
  name?: string;
  city?: string;
  locality?: string;
  state?: string;
};

type HomeMateChatbotProps = {
  isOpen?: boolean;
  onOpen?: () => void;
  onClose?: () => void;
  account?: HomeMateAccount | null;
};

type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  text: string;
  options?: string[];
  properties?: ChatProperty[];
  analytics?: ChatAnalytics;
};

type ChatProperty = {
  id?: string;
  title?: string;
  image?: string;
  price?: string | null;
  location?: string;
  bhk?: number;
  propertyType?: string;
  listingType?: string;
  area?: string;
  category?: string;
  constructionStatus?: string;
  slug?: string;
  href?: string;
};

type ChatAnalytics = {
  metrics?: { label: string; value: number | string; tone?: string }[];
  highlights?: string[];
  counts?: Record<string, number>;
  topLocalities?: Record<string, { _id: string; count: number; avgPrice?: number }[]>;
};

const INTENT_OPTIONS = [
  "Buy Property",
  "Rent Property",
  "Buy Commercial",
  "Lease Commercial",
  "Buy Plot",
];

const getWelcomeMessage = (account?: HomeMateAccount | null, city?: string) => {
  const place = account?.city || city;
  if (account) {
    return place
    ? `Welcome back. I'm Propenu, and I can help you find verified homes, plots, and commercial spaces in ${place}. What are you looking for today?`
    : "Welcome back. I'm Propenu, and I can help you find verified homes, plots, and commercial spaces. What are you looking for today?";
  }

  return place
    ? `Hi, I'm Propenu. I can help you find verified homes, plots, and commercial spaces in ${place}. What are you looking for today?`
    : "Hi, I'm Propenu. I can help you find verified homes, plots, and commercial spaces. What are you looking for today?";
};

const initialMessages: ChatMessage[] = [
  {
    id: "welcome",
    role: "assistant",
    text: getWelcomeMessage(),
    options: INTENT_OPTIONS,
  },
];

const parseChatbotResponse = (
  data: any
): Pick<ChatMessage, "text" | "options" | "properties" | "analytics"> => {
  const fallback = {
    text: "I could not find a response. Please try again.",
  };

  if (!data) return fallback;

  if (typeof data === "string") {
    const events = data
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .filter((event) =>
        ["message", "error", "question", "suggestions", "property", "analytics"].includes(event.type)
      );

    const question = events.findLast((event) => event.type === "question");
    if (question) {
      return {
        text: question.question || fallback.text,
        options: Array.isArray(question.options) ? question.options : undefined,
      };
    }

    const suggestions = events.findLast((event) => event.type === "suggestions");
    const analytics = events.findLast((event) => event.type === "analytics");
    const properties = events
      .filter((event) => event.type === "property" && event.property)
      .map((event) => event.property);
    const message = events.findLast((event) =>
      event.type === "message" || event.type === "error"
    );

    return {
      text: message?.content || message?.message || fallback.text,
      options: Array.isArray(suggestions?.options) ? suggestions.options : undefined,
      properties: properties.length ? properties : undefined,
      analytics: analytics?.analytics,
    };
  }

  return {
    text:
      data.content ||
      data.message ||
      data.question ||
      data.response ||
      data.answer ||
      data.data?.content ||
      data.data?.message ||
      fallback.text,
    options: Array.isArray(data.options) ? data.options : undefined,
    properties: Array.isArray(data.properties) ? data.properties : undefined,
    analytics: data.analytics,
  };
};

const metricToneClasses: Record<string, string> = {
  emerald: "border-emerald-100 bg-emerald-50 text-emerald-700",
  blue: "border-sky-100 bg-sky-50 text-sky-700",
  amber: "border-amber-100 bg-amber-50 text-amber-700",
  violet: "border-violet-100 bg-violet-50 text-violet-700",
  lime: "border-lime-100 bg-lime-50 text-lime-700",
};

const HomeMateChatbot = ({
  isOpen = false,
  onOpen,
  onClose,
  account,
}: HomeMateChatbotProps) => {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [isPanelVisible, setIsPanelVisible] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const { selectedCity } = useCity();
  const pathname = usePathname() || "";
  const currentPageSlug = pathname.match(
    /^\/(?:properties\/(?:residential|commercial|land|agricultural)|project|prime)\/([^/?#]+)/,
  )?.[1];

  const chatbotMutation = useMutation({
    mutationFn: (nextMessage: string) =>
      getChatbotResponse(nextMessage, {
        city: account?.city || selectedCity?.city,
        state: account?.state || selectedCity?.state,
        locality: account?.locality || undefined,
        excludeSlug: currentPageSlug,
        localities: selectedCity?.localities
          ?.map((locality: any) =>
            typeof locality === "string"
              ? locality
              : locality?.name || locality?.locality || locality?.title
          )
          .filter(Boolean),
      }),
    onSuccess: (data) => {
      const response = parseChatbotResponse(data);

      setMessages((currentMessages) => [
        ...currentMessages,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          text: response.text,
          options: response.options,
          properties: response.properties,
          analytics: response.analytics,
        },
      ]);
    },
    onError: (error: any) => {
      const errorMessage =
        error?.response?.status === 429
          ? error?.response?.data?.message ||
            "Propenu is receiving too many messages. Please try again in a few minutes."
          : error?.response?.data?.message ||
            error?.response?.data?.error ||
            error?.message ||
            "Sorry, I could not connect right now. Please try again.";

      setMessages((currentMessages) => [
        ...currentMessages,
        {
          id: `assistant-error-${Date.now()}`,
          role: "assistant",
          text: errorMessage,
        },
      ]);
    },
  });

  useEffect(() => {
    if (!isOpen) {
      setIsPanelVisible(false);
      setIsClosing(false);
      return;
    }

    const frame = requestAnimationFrame(() => {
      setIsPanelVisible(true);
    });

    return () => cancelAnimationFrame(frame);
  }, [isOpen]);

  useEffect(() => {
    setMessages((currentMessages) => {
      const [firstMessage, ...restMessages] = currentMessages;

      if (firstMessage?.id !== "welcome") {
        return currentMessages;
      }

      return [
        {
          ...firstMessage,
          text: getWelcomeMessage(account, selectedCity?.city),
          options: firstMessage.options?.length ? firstMessage.options : INTENT_OPTIONS,
        },
        ...restMessages,
      ];
    });
  }, [account, selectedCity?.city]);

  useEffect(() => {
    if (!isOpen) return;

    const frame = requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "end",
      });
    });

    return () => cancelAnimationFrame(frame);
  }, [messages, chatbotMutation.isPending, isOpen]);

  const handleClose = () => {
    setIsClosing(true);
    setIsPanelVisible(false);

    window.setTimeout(() => {
      setIsClosing(false);
      onClose?.();
    }, 220);
  };

  const sendMessage = (nextMessage: string) => {
    const trimmedMessage = nextMessage.trim();
    if (!trimmedMessage || chatbotMutation.isPending) return;

    setMessages((currentMessages) => [
      ...currentMessages,
      {
        id: `user-${Date.now()}`,
        role: "user",
        text: trimmedMessage,
      },
    ]);
    setMessage("");
    chatbotMutation.mutate(trimmedMessage);
  };

  if (!isOpen) {
    return (
      <>
        <button
          type="button"
          aria-label="Open Propenu chatbot"
          onClick={onOpen}
          className="group relative grid h-16 w-16 place-items-center rounded-full bg-[#20b35c] text-white shadow-[0_14px_30px_rgba(32,179,92,0.35)] transition hover:-translate-y-0.5 hover:bg-[#1aa552] hover:shadow-[0_18px_38px_rgba(32,179,92,0.42)]"
        >
          <span className="absolute inset-0 animate-ping rounded-full bg-[#20b35c] opacity-20" />
          <span className="absolute right-1 top-1 h-3.5 w-3.5 rounded-full border-2 border-white bg-emerald-300" />
          <span className="relative">
            <ChatbotIcon />
          </span>
        </button>
      </>
    );
  }

  return (
    <section
      className={`relative h-full w-full origin-bottom-right overflow-hidden rounded-[26px] border border-white/70 bg-[#f7fffb] shadow-[0_22px_60px_rgba(15,82,45,0.22)] transition-all duration-220 ease-out sm:h-[min(520px,calc(100dvh-8rem))] sm:w-[min(360px,calc(100vw-32px))] ${
        isPanelVisible && !isClosing
          ? "translate-y-0 scale-100 opacity-100"
          : "translate-y-4 scale-95 opacity-0"
      }`}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_92%,rgba(38,173,95,0.2),transparent_34%),radial-gradient(circle_at_8%_18%,rgba(38,173,95,0.12),transparent_28%)]" />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-[radial-gradient(ellipse_at_center,rgba(38,173,95,0.12),transparent_68%)]" />

      <div className="relative z-10 flex h-full flex-col">
        <header className="flex items-center justify-between bg-[#20b35c] px-4 py-3 text-white shadow-sm">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/45 bg-white/15">
              <ChatbotIcon />
            </span>

            <div className="min-w-0 leading-tight">
              <h2 className="truncate text-base font-semibold">Propenu Assistant</h2>
              <p className="truncate text-[11px] font-medium text-white/90">
                Your Verified Property Assistant
              </p>
            </div>
          </div>

          <button
            type="button"
            aria-label="Close chatbot"
            onClick={handleClose}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-white transition hover:bg-white/15"
          >
            <IoClose className="h-5 w-5" />
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 pb-4 pt-5">
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {messages.map((chatMessage) => (
              <div
                key={chatMessage.id}
                className={`rounded-2xl px-4 py-3 text-xs leading-5 shadow-sm backdrop-blur ${
                  chatMessage.role === "user"
                    ? "ml-auto max-w-[260px] rounded-tr-md bg-[#dff9eb] text-gray-800"
                    : "max-w-[312px] rounded-tl-md bg-white/90 text-gray-700"
                }`}
              >
                <p>{chatMessage.text}</p>
                {chatMessage.role === "assistant" && chatMessage.analytics ? (
                  <div className="mt-3 space-y-3">
                    {chatMessage.analytics.metrics?.length ? (
                      <div className="grid grid-cols-2 gap-2">
                        {chatMessage.analytics.metrics.slice(0, 4).map((metric) => (
                          <div
                            key={metric.label}
                            className={`rounded-xl border px-3 py-2 ${
                              metricToneClasses[metric.tone || ""] ||
                              "border-gray-100 bg-gray-50 text-gray-700"
                            }`}
                          >
                            <div className="text-[16px] font-bold leading-none">
                              {metric.value}
                            </div>
                            <div className="mt-1 text-[10px] font-medium leading-3">
                              {metric.label}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {chatMessage.analytics.highlights?.length ? (
                      <div className="space-y-1.5 rounded-xl border border-emerald-100 bg-white px-3 py-2">
                        {chatMessage.analytics.highlights.slice(1, 4).map((highlight) => (
                          <div key={highlight} className="flex gap-2 text-[11px] leading-4 text-gray-600">
                            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#20b35c]" />
                            <span>{highlight}</span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {chatMessage.role === "assistant" && chatMessage.properties?.length ? (
                  <div className="mt-3 space-y-2">
                    {chatMessage.properties.map((property) => {
                      const card = (
                        <>
                          {property.image ? (
                            <img
                              src={property.image}
                              alt={property.title || "Property"}
                              className="h-28 w-full object-cover"
                            />
                          ) : null}
                          <div className="px-3 py-2">
                            <div className="line-clamp-2 text-[12px] font-semibold leading-4 text-gray-800">
                              {property.title || "Verified property"}
                            </div>
                            {property.location ? (
                              <div className="mt-1 truncate text-[11px] text-gray-500">
                                {property.location}
                              </div>
                            ) : null}
                            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                              {property.category ? (
                                <span className="rounded-full bg-[#eefbf4] px-2 py-0.5 text-[11px] font-semibold text-[#168a48]">
                                  {property.category}
                                </span>
                              ) : null}
                              {property.price ? (
                                <span className="rounded-full bg-gray-50 px-2 py-0.5 text-[11px] font-semibold text-gray-700">
                                  {property.price}
                                </span>
                              ) : null}
                              {property.area ? (
                                <span className="rounded-full bg-gray-50 px-2 py-0.5 text-[11px] text-gray-600">
                                  {property.area}
                                </span>
                              ) : null}
                              {property.bhk ? (
                                <span className="rounded-full bg-gray-50 px-2 py-0.5 text-[11px] text-gray-600">
                                  {property.bhk} BHK
                                </span>
                              ) : null}
                              {property.listingType ? (
                                <span className="rounded-full bg-gray-50 px-2 py-0.5 text-[11px] text-gray-600">
                                  {property.listingType}
                                </span>
                              ) : null}
                              {property.constructionStatus ? (
                                <span className="rounded-full bg-gray-50 px-2 py-0.5 text-[11px] text-gray-600">
                                  {property.constructionStatus}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </>
                      );

                      const className =
                        "block overflow-hidden rounded-xl border border-emerald-100 bg-white shadow-[0_4px_12px_rgba(15,82,45,0.08)] transition hover:-translate-y-0.5 hover:border-[#20b35c]/40";

                      return property.href ? (
                        <a
                          key={property.id || property.slug || property.title}
                          href={property.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={className}
                        >
                          {card}
                        </a>
                      ) : (
                        <div
                          key={property.id || property.slug || property.title}
                          className={className}
                        >
                          {card}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
                {chatMessage.role === "assistant" && chatMessage.options?.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {chatMessage.options.map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => sendMessage(option)}
                        disabled={chatbotMutation.isPending}
                        className="rounded-full border border-[#20b35c]/20 bg-[#eefbf4] px-2.5 py-1 text-[11px] font-medium text-[#166c3b] transition hover:border-[#20b35c]/45 hover:bg-[#dcf7e8] disabled:opacity-60"
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}

            {chatbotMutation.isPending ? (
              <div className="inline-flex rounded-2xl rounded-tl-md bg-white/80 px-4 py-3 text-xs text-gray-500 shadow-sm">
                Thinking...
              </div>
            ) : null}
            <div ref={messagesEndRef} className="h-px" aria-hidden="true" />
          </div>

          <form
            className="mt-auto flex h-12 items-center rounded-full border border-gray-100 bg-white px-4 shadow-[0_8px_24px_rgba(15,23,42,0.16)]"
            onSubmit={(event) => {
              event.preventDefault();
              sendMessage(message);
            }}
          >
            <input
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Chat here..."
              aria-label="Chat message"
              className="min-w-0 flex-1 bg-transparent text-sm text-gray-700 outline-none placeholder:text-gray-500"
            />
            <button
              type="submit"
              aria-label="Send message"
              disabled={chatbotMutation.isPending}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#20b35c] text-white transition hover:bg-[#168a48]"
            >
              <IoSend className="h-4.5 w-4.5" />
            </button>
          </form>
        </div>
      </div>
    </section>
  );
};

export default HomeMateChatbot;
