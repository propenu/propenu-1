"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Cookies from "js-cookie";
import axiosInstance from "@/utilies/axiosInstance";

function Icon({ name, size = 20, className = "" }: { name: "shield" | "clock" | "card" | "check"; size?: number; className?: string }) {
  const paths = {
    shield: <><path d="M12 3 4.5 6v5.5c0 4.7 3.2 8.3 7.5 9.5 4.3-1.2 7.5-4.8 7.5-9.5V6L12 3Z" /><path d="m9 12 2 2 4-4" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    card: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18M7 15h3" /></>,
    check: <><circle cx="12" cy="12" r="9" /><path d="m8 12 2.5 2.5L16 9" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">{paths[name]}</svg>;
}

type PaymentLinkDetails = {
  status: "created" | "paid" | "expired" | "cancelled";
  expiresAt: string;
  customerName: string;
  userType: "owner" | "agent";
  planName: string;
  category?: string;
  durationDays: number;
  listPrice: number;
  discountPercent: number;
  discountAmount: number;
  subtotal: number;
  gstRate: number;
  gstAmount: number;
  totalAmount: number;
  currency: string;
};

const money = (amount: number, currency = "INR") =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);

export default function SubscriptionPaymentPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const token = params?.token;
  const [details, setDetails] = useState<PaymentLinkDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState("");
  const [paid, setPaid] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    axiosInstance.get(`/payments/admin-links/${encodeURIComponent(token)}`)
      .then(({ data }) => {
        if (cancelled) return;
        const link = data?.link as PaymentLinkDetails;
        setDetails(link);
        setPaid(link?.status === "paid");
        if (!link) setError("This payment link could not be found.");
      })
      .catch((requestError) => {
        if (!cancelled) setError(requestError?.response?.data?.message || "This payment link could not be loaded.");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token]);

  async function startCheckout() {
    setError("");
    const authToken = Cookies.get("token");
    if (!authToken) {
      const redirect = `/pay/${encodeURIComponent(token || "")}`;
      router.push(`/login?redirect=${encodeURIComponent(redirect)}`);
      return;
    }

    setPaying(true);
    try {
      const { data } = await axiosInstance.post(
        `/payments/admin-links/${encodeURIComponent(token || "")}/checkout`,
        {},
        { headers: { Authorization: `Bearer ${authToken}` } },
      );
      if (data?.alreadyPaid) {
        setPaid(true);
        return;
      }
      if (!(window as any).Razorpay) throw new Error("Secure checkout is still loading. Please try again.");

      const checkout = new (window as any).Razorpay({
        key: data.key,
        amount: data.amount,
        currency: data.currency,
        order_id: data.orderId,
        name: "Propenu",
        description: data.description,
        prefill: data.prefill,
        theme: { color: "#27AE60" },
        handler: async (response: any) => {
          try {
            await axiosInstance.post("/payments/verify", {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            }, { headers: { Authorization: `Bearer ${authToken}` } });
            setPaid(true);
          } catch (verifyError: any) {
            setError(verifyError?.response?.data?.message || "Payment was received. We’re confirming it now; please refresh shortly.");
          }
        },
        modal: { ondismiss: () => setPaying(false) },
      });
      checkout.on("payment.failed", (event: any) => {
        setError(event?.error?.description || "Payment could not be completed. Please try again.");
        setPaying(false);
      });
      checkout.open();
    } catch (requestError: any) {
      setError(requestError?.response?.data?.message || requestError?.message || "Could not start secure checkout.");
      setPaying(false);
    }
  }

  const unavailable = !details || details.status === "expired" || details.status === "cancelled";

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-12 sm:py-20">
      <div className="mx-auto max-w-xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl shadow-slate-200/60">
        <div className="bg-[#27AE60] px-7 py-7 text-white sm:px-9">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-white/15"><Icon name="shield" size={23} /></div>
            <div><p className="text-sm font-semibold text-white/80">Propenu secure checkout</p><h1 className="text-xl font-bold">Subscription payment</h1></div>
          </div>
        </div>

        <div className="space-y-6 p-7 sm:p-9">
          {loading ? <div className="animate-pulse space-y-3"><div className="h-5 w-2/3 rounded bg-slate-100" /><div className="h-24 rounded-2xl bg-slate-100" /></div> : null}

          {!loading && error && !details ? <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p> : null}

          {!loading && details && !paid && !unavailable && (
            <>
              <div>
                <p className="text-sm text-slate-500">Prepared for</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">{details.customerName}</p>
              </div>
              <section className="rounded-2xl border border-slate-200 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div><p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">{details.userType === "agent" ? "Agent plan" : "Owner plan"}</p><h2 className="mt-1 text-xl font-bold text-slate-900">{details.planName}</h2><p className="mt-1 text-sm text-slate-500">{details.durationDays} days subscription</p></div>
                  <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700"><Icon name="clock" className="mr-1 inline" size={13} /> Payment pending</span>
                </div>
                <div className="mt-5 space-y-3 border-t border-slate-100 pt-4 text-sm">
                  <div className="flex justify-between text-slate-600"><span>Plan price</span><span>{money(details.listPrice, details.currency)}</span></div>
                  {details.discountPercent > 0 && <div className="flex justify-between text-emerald-700"><span>Admin discount ({details.discountPercent}%)</span><span>−{money(details.discountAmount, details.currency)}</span></div>}
                  <div className="flex justify-between text-slate-600"><span>Subtotal</span><span>{money(details.subtotal, details.currency)}</span></div>
                  {details.gstAmount > 0 && <div className="flex justify-between text-slate-600"><span>GST ({details.gstRate}%)</span><span>{money(details.gstAmount, details.currency)}</span></div>}
                  <div className="flex justify-between border-t border-slate-100 pt-3 text-base font-bold text-slate-900"><span>Total due</span><span>{money(details.totalAmount, details.currency)}</span></div>
                </div>
              </section>
              {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
              <button onClick={startCheckout} disabled={paying} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#27AE60] px-5 py-3.5 font-semibold text-white transition hover:bg-[#219652] disabled:cursor-wait disabled:opacity-60">
                <Icon name="card" size={18} /> {paying ? "Opening checkout…" : `Pay ${money(details.totalAmount, details.currency)}`}
              </button>
              <p className="text-center text-xs text-slate-500">You’ll complete payment in Razorpay Checkout while staying on Propenu.</p>
            </>
          )}

          {!loading && paid && <div className="py-6 text-center"><Icon name="check" className="mx-auto h-14 w-14 text-emerald-500" size={56} /><h2 className="mt-4 text-2xl font-bold text-slate-900">Payment confirmed</h2><p className="mt-2 text-sm text-slate-600">Your subscription is active. You can return to Propenu.</p></div>}
          {!loading && unavailable && <div className="py-5 text-center"><h2 className="text-xl font-bold text-slate-900">This payment link is unavailable</h2><p className="mt-2 text-sm text-slate-600">It may have expired or been cancelled. Please contact Propenu for a new link.</p></div>}
        </div>
      </div>
    </main>
  );
}
