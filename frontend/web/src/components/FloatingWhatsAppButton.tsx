"use client";

import { useEffect, useState } from "react";

const SUPPORT_PHONE = "+919182334233";
const DEFAULT_PREFILL_MESSAGE = "Hi";
const MOBILE_MENU_STATE_EVENT = "propenu:mobile-menu-state";

interface FloatingWhatsAppButtonProps {
  message?: string;
}

export default function FloatingWhatsAppButton({
  message = DEFAULT_PREFILL_MESSAGE,
}: FloatingWhatsAppButtonProps = {}) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const phone = SUPPORT_PHONE.replace(/\D/g, "");

  useEffect(() => {
    const handleMobileMenuState = (event: Event) => {
      const { open } = (event as CustomEvent<{ open?: boolean }>).detail ?? {};
      setIsMobileMenuOpen(Boolean(open));
    };

    window.addEventListener(MOBILE_MENU_STATE_EVENT, handleMobileMenuState);

    return () => {
      window.removeEventListener(MOBILE_MENU_STATE_EVENT, handleMobileMenuState);
    };
  }, []);

  if (isMobileMenuOpen) return null;

  const whatsappUrl = `https://wa.me/${phone}${
    message ? `?text=${encodeURIComponent(message)}` : ""
  }`;

  return (
    <a
      href={whatsappUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with Propenu on WhatsApp"
      title="Chat on WhatsApp"
      className="fixed bottom-24 right-4 z-[44] flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] shadow-[0_10px_24px_rgba(37,211,102,0.35)] ring-1 ring-[#128C7E]/20 transition hover:-translate-y-0.5 hover:bg-[#1EBE5D] hover:shadow-[0_14px_30px_rgba(37,211,102,0.42)] focus:outline-none focus:ring-2 focus:ring-[#25D366] focus:ring-offset-2 sm:bottom-8 sm:right-6 lg:bottom-8 lg:right-8 lg:z-60"
    >
      <svg
        viewBox="0 0 32 32"
        aria-hidden="true"
        className="h-8 w-8 fill-white"
      >
        <path d="M16.02 3.2C9 3.2 3.3 8.84 3.3 15.78c0 2.2.58 4.34 1.68 6.23L3.2 28.8l6.98-1.72a12.8 12.8 0 0 0 5.84 1.43c7.02 0 12.73-5.64 12.73-12.58S23.04 3.2 16.02 3.2Zm0 23.18c-1.86 0-3.68-.5-5.28-1.43l-.38-.22-4.14 1.02 1.05-4.02-.25-.4a10.14 10.14 0 0 1-1.58-5.55c0-5.77 4.74-10.46 10.58-10.46s10.59 4.69 10.59 10.46-4.75 10.6-10.59 10.6Zm5.8-7.85c-.32-.16-1.9-.93-2.2-1.03-.29-.11-.5-.16-.72.16-.21.31-.83 1.03-1.02 1.24-.18.21-.37.24-.69.08-.32-.16-1.35-.49-2.57-1.56a9.55 9.55 0 0 1-1.78-2.19c-.19-.31-.02-.48.14-.64.14-.14.32-.37.48-.56.16-.18.21-.31.32-.52.1-.21.05-.4-.03-.56-.08-.16-.72-1.72-.99-2.35-.26-.61-.52-.53-.72-.54h-.61c-.21 0-.56.08-.85.4-.29.31-1.12 1.08-1.12 2.64 0 1.56 1.15 3.07 1.31 3.28.16.21 2.27 3.43 5.5 4.8.77.33 1.37.53 1.84.68.77.24 1.47.21 2.02.13.62-.09 1.9-.77 2.17-1.51.27-.74.27-1.37.19-1.51-.08-.13-.29-.21-.61-.37Z" />
      </svg>
    </a>
  );
}
