"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2, XCircle, Clock, RefreshCw, Truck, MapPin,
  Tag, ArrowLeft, Copy, Check, ExternalLink, Printer,
  Package, ShieldCheck, Sparkles, Smartphone, Laptop, Watch,
  Headphones, Gamepad2, Tablet, User, Mail, Phone, Home,
  MessageSquare, AlertCircle, Info, ChevronRight, HelpCircle,
  Eye, Scale, ArrowRight, CornerDownRight
} from "lucide-react";
import { tradeInsApi, type TradeInDetail } from "@/lib/api";
import { GradeBadge } from "@/components/GradeBadge";
import ProductImage from "@/components/ProductImage";
import Footer from "@/components/Footer";

const STATUS_CFG: Record<
  string,
  {
    label: string;
    badgeBg: string;
    badgeText: string;
    badgeBorder: string;
    bannerBg: string;
    bannerBorder: string;
    bannerText: string;
    icon: React.ElementType;
    title: string;
    desc: string;
  }
> = {
  SUBMITTED: {
    label: "Submitted",
    badgeBg: "bg-blue-50 dark:bg-blue-950/40",
    badgeText: "text-blue-700 dark:text-blue-300",
    badgeBorder: "border-blue-200 dark:border-blue-800",
    bannerBg: "bg-blue-50/60 dark:bg-blue-950/30",
    bannerBorder: "border-blue-200/80 dark:border-blue-900/50",
    bannerText: "text-blue-900 dark:text-blue-200",
    icon: Clock,
    title: "Trade-In Received",
    desc: "We have received your trade-in request and initialized your file. Prepare your device for dispatch or store drop-off.",
  },
  UNDER_REVIEW: {
    label: "Under Review",
    badgeBg: "bg-amber-50 dark:bg-amber-950/40",
    badgeText: "text-amber-700 dark:text-amber-300",
    badgeBorder: "border-amber-200 dark:border-amber-800",
    bannerBg: "bg-amber-50/60 dark:bg-amber-950/30",
    bannerBorder: "border-amber-200/80 dark:border-amber-900/50",
    bannerText: "text-amber-900 dark:text-amber-200",
    icon: RefreshCw,
    title: "Device Inspection In Progress",
    desc: "Our tech team is inspecting your device to confirm condition, specs, and functionality against your valuation details.",
  },
  COUNTER_OFFERED: {
    label: "New Offer Issued",
    badgeBg: "bg-violet-50 dark:bg-violet-950/40",
    badgeText: "text-violet-700 dark:text-violet-300",
    badgeBorder: "border-violet-200 dark:border-violet-800",
    bannerBg: "bg-violet-50/60 dark:bg-violet-950/30",
    bannerBorder: "border-violet-200/80 dark:border-violet-900/50",
    bannerText: "text-violet-900 dark:text-violet-200",
    icon: Scale,
    title: "Action Required: Updated Offer",
    desc: "Following physical inspection, we have updated your offer valuation. Please review and accept or decline below.",
  },
  APPROVED: {
    label: "Approved",
    badgeBg: "bg-emerald-50 dark:bg-emerald-950/40",
    badgeText: "text-emerald-700 dark:text-emerald-300",
    badgeBorder: "border-emerald-200 dark:border-emerald-800",
    bannerBg: "bg-emerald-50/60 dark:bg-emerald-950/30",
    bannerBorder: "border-emerald-200/80 dark:border-emerald-900/50",
    bannerText: "text-emerald-900 dark:text-emerald-200",
    icon: CheckCircle2,
    title: "Offer Accepted & Approved",
    desc: "Your trade-in valuation is approved! We are now processing your final payout.",
  },
  REJECTED: {
    label: "Not Accepted",
    badgeBg: "bg-rose-50 dark:bg-rose-950/40",
    badgeText: "text-rose-700 dark:text-rose-300",
    badgeBorder: "border-rose-200 dark:border-rose-800",
    bannerBg: "bg-rose-50/60 dark:bg-rose-950/30",
    bannerBorder: "border-rose-200/80 dark:border-rose-900/50",
    bannerText: "text-rose-900 dark:text-rose-200",
    icon: XCircle,
    title: "Trade-In Not Accepted",
    desc: "Unfortunately, we are unable to accept this trade-in. If you shipped your device, our team will safely return it to your address.",
  },
  COMPLETED: {
    label: "Completed",
    badgeBg: "bg-emerald-50 dark:bg-emerald-950/40",
    badgeText: "text-emerald-700 dark:text-emerald-300",
    badgeBorder: "border-emerald-200 dark:border-emerald-800",
    bannerBg: "bg-emerald-50/60 dark:bg-emerald-950/30",
    bannerBorder: "border-emerald-200/80 dark:border-emerald-900/50",
    bannerText: "text-emerald-900 dark:text-emerald-200",
    icon: CheckCircle2,
    title: "Payout Transferred",
    desc: "This trade-in is complete! Payment has been transferred to your registered payment method.",
  },
  CANCELLED: {
    label: "Cancelled",
    badgeBg: "bg-zinc-100 dark:bg-zinc-800",
    badgeText: "text-zinc-600 dark:text-zinc-400",
    badgeBorder: "border-zinc-200 dark:border-zinc-700",
    bannerBg: "bg-zinc-50 dark:bg-zinc-900/50",
    bannerBorder: "border-zinc-200 dark:border-zinc-800",
    bannerText: "text-zinc-700 dark:text-zinc-300",
    icon: XCircle,
    title: "Trade-In Cancelled",
    desc: "This trade-in request has been cancelled.",
  },
};

const CONDITION_QUESTIONS: Record<string, { id: string; question: string }[]> = {
  Phone: [
    { id: "screen", question: "How is the screen condition?" },
    { id: "back", question: "How is the back casing?" },
    { id: "battery", question: "Battery health status?" },
    { id: "biometrics", question: "Is Face ID / Touch ID operational?" },
    { id: "charging", question: "Is the charging port functional?" },
    { id: "reset", question: "Is factory reset & iCloud removed?" },
  ],
  Tablet: [
    { id: "screen", question: "How is the screen condition?" },
    { id: "body", question: "How is the outer body / casing?" },
    { id: "battery", question: "Battery performance?" },
    { id: "charging", question: "Is charging port functional?" },
    { id: "reset", question: "Is factory reset complete?" },
  ],
  Console: [
    { id: "power", question: "Does the console power on normally?" },
    { id: "disc", question: "Is the disc drive operational?" },
    { id: "body", question: "Cosmetic casing condition?" },
    { id: "reset", question: "Has factory reset been performed?" },
  ],
  Laptop: [
    { id: "power", question: "Does the laptop power on?" },
    { id: "screen", question: "Screen panel condition?" },
    { id: "input", question: "Are keyboard & trackpad fully functional?" },
    { id: "battery", question: "Battery health & hold duration?" },
    { id: "body", question: "Cosmetic body condition?" },
    { id: "reset", question: "Is factory reset performed?" },
  ],
  Smartwatch: [
    { id: "power", question: "Does the watch power on?" },
    { id: "screen", question: "Screen glass condition?" },
    { id: "battery", question: "Does battery hold normal charge?" },
    { id: "charging", question: "Is magnetic charger working?" },
    { id: "reset", question: "Is Activation Lock turned off?" },
  ],
  Audio: [
    { id: "sound", question: "Sound quality & audio balance?" },
    { id: "body", question: "Cosmetic condition?" },
    { id: "battery", question: "Battery longevity?" },
    { id: "charging", question: "Is charging case functioning?" },
  ],
};

const getCategoryIcon = (category: string) => {
  const norm = (category || "").toLowerCase();
  if (norm.includes("phone") || norm.includes("mobile")) return Smartphone;
  if (norm.includes("tablet") || norm.includes("ipad")) return Tablet;
  if (norm.includes("laptop") || norm.includes("macbook") || norm.includes("computer")) return Laptop;
  if (norm.includes("watch")) return Watch;
  if (norm.includes("audio") || norm.includes("headphone") || norm.includes("earphone")) return Headphones;
  if (norm.includes("console") || norm.includes("gaming")) return Gamepad2;
  return Tag;
};

function fmtDate(iso: string) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function TradeInStatusPage() {
  const { reference } = useParams<{ reference: string }>();
  const [tradeIn, setTradeIn] = useState<TradeInDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [acting, setActing] = useState<"accept" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedRef, setCopiedRef] = useState(false);
  const [copiedTracking, setCopiedTracking] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!reference) return;
    tradeInsApi.getByRef(reference)
      .then(setTradeIn)
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [reference]);

  async function respond(action: "accept" | "decline") {
    setActing(action);
    setError(null);
    try {
      const updated = action === "accept"
        ? await tradeInsApi.acceptCounterByRef(reference)
        : await tradeInsApi.declineCounterByRef(reference);
      setTradeIn(t => t ? { ...t, ...updated } : t);
    } catch (e: any) {
      setError(e?.message ?? `Failed to ${action} the offer`);
    } finally {
      setActing(null);
    }
  }

  function handleCopyRef() {
    if (!tradeIn?.reference) return;
    navigator.clipboard.writeText(tradeIn.reference);
    setCopiedRef(true);
    setTimeout(() => setCopiedRef(false), 2000);
  }

  function handleCopyTracking() {
    if (!tradeIn?.trackingNumber) return;
    navigator.clipboard.writeText(tradeIn.trackingNumber);
    setCopiedTracking(true);
    setTimeout(() => setCopiedTracking(false), 2000);
  }

  function handlePrint() {
    if (typeof window !== "undefined") {
      window.print();
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-zinc-50/50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-sans selection:bg-violet-500 selection:text-white">
      <div className="flex-1">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 pt-8 lg:pt-12 pb-20">

          {/* Top Bar Navigation & Actions */}
          <div className="flex items-center justify-between gap-4 mb-6">
            <Link
              href="/trade-in"
              className="inline-flex items-center gap-2 text-xs font-bold text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white transition-colors bg-white dark:bg-zinc-900 px-3.5 py-2 rounded-xl border border-zinc-200/80 dark:border-zinc-800 shadow-sm"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back to Trade-In
            </Link>

            {!loading && tradeIn && (
              <div className="flex items-center gap-2 print:hidden">
                <button
                  onClick={handleCopyRef}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white bg-white dark:bg-zinc-900 px-3 py-2 rounded-xl border border-zinc-200/80 dark:border-zinc-800 shadow-sm transition-all active:scale-95"
                >
                  {copiedRef ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5 text-zinc-400" />}
                  <span>{copiedRef ? "Copied Ref" : "Copy Ref"}</span>
                </button>

                <button
                  onClick={handlePrint}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white bg-white dark:bg-zinc-900 px-3 py-2 rounded-xl border border-zinc-200/80 dark:border-zinc-800 shadow-sm transition-all active:scale-95"
                >
                  <Printer className="h-3.5 w-3.5 text-zinc-400" />
                  <span className="hidden sm:inline">Print Receipt</span>
                </button>
              </div>
            )}
          </div>

          {/* Loading State */}
          {loading && (
            <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200/80 dark:border-zinc-800 p-16 shadow-xl flex flex-col items-center justify-center gap-4 text-center">
              <div className="relative">
                <div className="h-12 w-12 border-4 border-violet-100 dark:border-violet-950 border-t-violet-600 dark:border-t-violet-400 rounded-full animate-spin" />
                <Sparkles className="h-5 w-5 text-violet-500 absolute inset-0 m-auto animate-pulse" />
              </div>
              <p className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">Retrieving trade-in status...</p>
            </div>
          )}

          {/* Not Found State */}
          {!loading && notFound && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200/80 dark:border-zinc-800 p-12 shadow-xl text-center max-w-lg mx-auto"
            >
              <div className="h-16 w-16 bg-rose-50 dark:bg-rose-950/40 rounded-2xl flex items-center justify-center mx-auto mb-5 text-rose-600 dark:text-rose-400 border border-rose-100 dark:border-rose-900/40">
                <XCircle className="h-8 w-8" />
              </div>
              <h1 className="text-xl font-bold mb-2">Trade-In Reference Not Found</h1>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed mb-6">
                We couldn't locate a trade-in matching <span className="font-mono text-zinc-900 dark:text-zinc-200 font-bold bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded">{reference}</span>. Please verify the link in your email or start a new valuation.
              </p>
              <Link
                href="/trade-in"
                className="inline-flex items-center justify-center gap-2 h-11 px-6 rounded-2xl bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 dark:text-zinc-950 text-white text-sm font-bold shadow-md transition-all active:scale-95"
              >
                Start New Trade-In
              </Link>
            </motion.div>
          )}

          {/* Trade In Found Content */}
          {!loading && tradeIn && (() => {
            const cfg = STATUS_CFG[tradeIn.status] ?? STATUS_CFG.SUBMITTED;
            const StatusIcon = cfg.icon;
            const CategoryIcon = getCategoryIcon(tradeIn.category);
            const displayPrice = tradeIn.counterOffer ?? tradeIn.offerPrice;

            const specs = tradeIn.specs && typeof tradeIn.specs === "object"
              ? Object.entries(tradeIn.specs).filter(([, v]) => v)
              : [];

            // Compute step progression for progress tracker
            const isCancelled = tradeIn.status === "CANCELLED";
            const isRejected = tradeIn.status === "REJECTED";
            
            let activeStepIndex = 0; // 0 = Submitted, 1 = Inspection, 2 = Offer & Review, 3 = Payout
            if (tradeIn.status === "UNDER_REVIEW") activeStepIndex = 1;
            if (tradeIn.status === "COUNTER_OFFERED" || tradeIn.status === "APPROVED") activeStepIndex = 2;
            if (tradeIn.status === "COMPLETED") activeStepIndex = 3;

            const STEPS = [
              { title: "Submitted", desc: "Trade-in registered" },
              { title: "Inspection", desc: "Device evaluation" },
              { title: "Valuation", desc: "Offer confirmed" },
              { title: "Payout", desc: "Payment completed" },
            ];

            return (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="space-y-6"
              >
                {/* Hero Header Card */}
                <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-zinc-900 via-zinc-950 to-black text-white p-6 sm:p-8 shadow-2xl border border-zinc-800">
                  {/* Subtle Background Accent Orbs */}
                  <div className="absolute top-0 right-0 -mt-12 -mr-12 w-64 h-64 bg-violet-600/20 rounded-full blur-3xl pointer-events-none" />
                  <div className="absolute bottom-0 left-1/3 -mb-16 w-48 h-48 bg-emerald-600/10 rounded-full blur-2xl pointer-events-none" />

                  <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 bg-zinc-800/80 border border-zinc-700/80 text-zinc-300 text-[11px] font-bold uppercase tracking-wider px-3 py-1 rounded-full backdrop-blur-md">
                          <CategoryIcon className="h-3.5 w-3.5 text-violet-400" />
                          {tradeIn.category}
                        </span>

                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider border ${cfg.badgeBg} ${cfg.badgeText} ${cfg.badgeBorder}`}>
                          <StatusIcon className="h-3.5 w-3.5" />
                          {cfg.label}
                        </span>

                        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-400 bg-emerald-950/60 border border-emerald-800/50 px-2.5 py-1 rounded-full">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          Live Tracking
                        </span>
                      </div>

                      <div>
                        <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
                          {tradeIn.brand} {tradeIn.model}
                        </h1>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-400 font-medium mt-1.5">
                          <span>Ref: <strong className="font-mono text-zinc-200">{tradeIn.reference}</strong></span>
                          <span>•</span>
                          <span>Submitted {fmtDate(tradeIn.createdAt)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Offer Price Showcase */}
                    <div className="bg-zinc-900/90 border border-zinc-800/80 rounded-2xl p-5 md:min-w-[220px] backdrop-blur-xl shrink-0">
                      <p className="text-[10px] font-extrabold uppercase tracking-widest text-zinc-400 mb-1">
                        {tradeIn.status === "COUNTER_OFFERED" ? "New Counter Offer" : "Valuation Quote"}
                      </p>
                      <div className="flex items-baseline gap-1">
                        <span className="text-3xl sm:text-4xl font-black text-white tracking-tight">
                          £{displayPrice}
                        </span>
                      </div>
                      {tradeIn.counterOffer != null && tradeIn.counterOffer !== tradeIn.offerPrice && (
                        <p className="text-[11px] text-zinc-400 line-through mt-1">
                          Original estimate: £{tradeIn.offerPrice}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Progress Tracker Stepper (Only if not cancelled/rejected) */}
                  {!isCancelled && !isRejected && (
                    <div className="mt-8 pt-6 border-t border-zinc-800/80">
                      <div className="grid grid-cols-4 gap-2 relative">
                        {/* Connecting Progress Line */}
                        <div className="absolute top-4 left-6 right-6 h-0.5 bg-zinc-800 -z-0 hidden sm:block">
                          <motion.div
                            className="h-full bg-gradient-to-r from-violet-500 to-emerald-500"
                            initial={{ width: "0%" }}
                            animate={{ width: `${(activeStepIndex / (STEPS.length - 1)) * 100}%` }}
                            transition={{ duration: 0.6, ease: "easeOut" }}
                          />
                        </div>

                        {STEPS.map((step, idx) => {
                          const isPassed = idx < activeStepIndex;
                          const isCurrent = idx === activeStepIndex;

                          return (
                            <div key={step.title} className="relative z-10 flex flex-col items-center text-center">
                              <div
                                className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${
                                  isPassed
                                    ? "bg-emerald-500 text-zinc-950 font-black shadow-lg shadow-emerald-500/20"
                                    : isCurrent
                                    ? "bg-violet-600 text-white ring-4 ring-violet-500/30 animate-pulse"
                                    : "bg-zinc-800 text-zinc-500 border border-zinc-700"
                                }`}
                              >
                                {isPassed ? <Check className="h-4 w-4 stroke-[3]" /> : idx + 1}
                              </div>

                              <p className={`text-xs font-bold mt-2 ${isCurrent ? "text-white" : isPassed ? "text-emerald-400" : "text-zinc-500"}`}>
                                {step.title}
                              </p>
                              <p className="text-[10px] text-zinc-500 hidden md:block mt-0.5 max-w-[100px]">
                                {step.desc}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Counter Offer Interactive Card */}
                {tradeIn.status === "COUNTER_OFFERED" && tradeIn.counterOffer != null && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-violet-900/30 via-purple-950/20 to-violet-950/30 border-2 border-violet-500/40 p-6 sm:p-8 shadow-xl backdrop-blur-md"
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                      <div className="space-y-2 max-w-xl">
                        <span className="inline-flex items-center gap-1.5 bg-violet-500/20 border border-violet-400/30 text-violet-300 text-[10px] font-extrabold uppercase tracking-widest px-3 py-1 rounded-full">
                          <Sparkles className="h-3 w-3 text-violet-400" /> New Offer Ready
                        </span>

                        <h2 className="text-xl sm:text-2xl font-black text-violet-900 dark:text-violet-100">
                          We have reviewed your device
                        </h2>

                        <p className="text-sm text-violet-800 dark:text-violet-200/90 leading-relaxed">
                          Our technical inspection confirmed your {tradeIn.brand} {tradeIn.model}. We are pleased to offer{" "}
                          <strong className="text-violet-950 dark:text-white font-black text-base">£{tradeIn.counterOffer}</strong>{" "}
                          {tradeIn.offerPrice !== tradeIn.counterOffer && (
                            <span>(adjusted from your estimate of £{tradeIn.offerPrice})</span>
                          )}.
                        </p>

                        {error && (
                          <div className="flex items-center gap-2 text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 p-3 rounded-xl mt-2">
                            <AlertCircle className="h-4 w-4 shrink-0" />
                            <span>{error}</span>
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col sm:flex-row md:flex-col gap-3 shrink-0 min-w-[200px]">
                        <button
                          onClick={() => respond("accept")}
                          disabled={acting !== null}
                          className="h-12 px-6 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-extrabold text-sm shadow-lg shadow-violet-600/30 hover:shadow-violet-600/40 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                          {acting === "accept" ? (
                            <>
                              <RefreshCw className="h-4 w-4 animate-spin" /> Accepting...
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="h-4 w-4" /> Accept £{tradeIn.counterOffer}
                            </>
                          )}
                        </button>

                        <button
                          onClick={() => respond("decline")}
                          disabled={acting !== null}
                          className="h-12 px-6 rounded-2xl bg-white dark:bg-zinc-900 border-2 border-violet-300 dark:border-violet-800 text-violet-700 dark:text-violet-300 font-bold text-sm hover:border-violet-500 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-sm"
                        >
                          {acting === "decline" ? (
                            <>
                              <RefreshCw className="h-4 w-4 animate-spin" /> Declining...
                            </>
                          ) : (
                            <>
                              <XCircle className="h-4 w-4" /> Decline & Return
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* Status Description Banner (For non-counter-offer states) */}
                {tradeIn.status !== "COUNTER_OFFERED" && (
                  <div className={`rounded-3xl border p-5 sm:p-6 flex items-start gap-4 shadow-sm ${cfg.bannerBg} ${cfg.bannerBorder}`}>
                    <div className={`p-3 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 shadow-sm shrink-0 ${cfg.badgeText}`}>
                      <StatusIcon className="h-6 w-6" />
                    </div>
                    <div className="space-y-1">
                      <h3 className={`text-base font-bold ${cfg.bannerText}`}>
                        {cfg.title}
                      </h3>
                      <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
                        {cfg.desc}
                      </p>
                      {tradeIn.status === "CANCELLED" && (
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 pt-2">
                          Need another quote? <Link href="/trade-in" className="font-bold text-zinc-900 dark:text-white underline">Start a new trade-in valuation</Link>.
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Main Content Grid: Specs, Fulfilment, Diagnosis & Photos */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                  {/* Left 2 Columns: Specs & Inspection */}
                  <div className="lg:col-span-2 space-y-6">

                    {/* Key Overview Cards */}
                    <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200/80 dark:border-zinc-800 p-6 shadow-sm space-y-5">
                      <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800/80 pb-4">
                        <h3 className="text-sm font-extrabold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
                          <Tag className="h-4 w-4 text-violet-500" /> Device Valuation Summary
                        </h3>
                        <GradeBadge condition={tradeIn.condition ?? ""} size="lg" />
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                        <div className="rounded-2xl bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-100 dark:border-zinc-800/80 p-4">
                          <p className="text-[10px] font-extrabold uppercase tracking-widest text-zinc-400 mb-1">Brand</p>
                          <p className="font-bold text-base text-zinc-900 dark:text-zinc-100">{tradeIn.brand}</p>
                        </div>

                        <div className="rounded-2xl bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-100 dark:border-zinc-800/80 p-4">
                          <p className="text-[10px] font-extrabold uppercase tracking-widest text-zinc-400 mb-1">Model</p>
                          <p className="font-bold text-base text-zinc-900 dark:text-zinc-100">{tradeIn.model}</p>
                        </div>

                        <div className="rounded-2xl bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-100 dark:border-zinc-800/80 p-4 col-span-2 sm:col-span-1">
                          <p className="text-[10px] font-extrabold uppercase tracking-widest text-zinc-400 mb-1">Fulfilment</p>
                          <div className="flex items-center gap-1.5 font-bold text-sm text-zinc-900 dark:text-zinc-100">
                            {tradeIn.fulfillment === "ship" ? (
                              <>
                                <Truck className="h-4 w-4 text-emerald-500" /> Ship to Us
                              </>
                            ) : (
                              <>
                                <MapPin className="h-4 w-4 text-violet-500" /> In-Store Dropoff
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Technical Specs List */}
                      {specs.length > 0 && (
                        <div className="pt-2">
                          <p className="text-[11px] font-extrabold uppercase tracking-widest text-zinc-400 mb-3">
                            Device Specifications
                          </p>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                            {specs.map(([k, v]) => (
                              <div key={k} className="rounded-xl bg-zinc-50/80 dark:bg-zinc-950/40 border border-zinc-100 dark:border-zinc-800 px-3.5 py-2.5">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">{k}</p>
                                <p className="text-xs font-bold text-zinc-800 dark:text-zinc-200 mt-0.5 truncate">{String(v)}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Diagnostic Questionnaire Answers */}
                    {tradeIn.answers && Object.keys(tradeIn.answers).length > 0 && (() => {
                      const questions = CONDITION_QUESTIONS[tradeIn.category] ?? [];
                      const entries = Object.entries(tradeIn.answers);

                      return (
                        <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200/80 dark:border-zinc-800 p-6 shadow-sm space-y-4">
                          <h3 className="text-sm font-extrabold uppercase tracking-wider text-zinc-400 flex items-center gap-2 border-b border-zinc-100 dark:border-zinc-800/80 pb-3">
                            <MessageSquare className="h-4 w-4 text-violet-500" /> Condition Questionnaire Answers
                          </h3>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {entries.map(([qid, answer]) => {
                              const q = questions.find(x => x.id === qid);
                              return (
                                <div key={qid} className="rounded-2xl bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-100 dark:border-zinc-800/80 p-3.5">
                                  <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1">
                                    {q?.question ?? qid}
                                  </p>
                                  <p className="text-xs font-extrabold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                                    {answer}
                                  </p>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Uploaded Photos Gallery */}
                    {tradeIn.images && tradeIn.images.length > 0 && (
                      <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200/80 dark:border-zinc-800 p-6 shadow-sm space-y-4">
                        <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800/80 pb-3">
                          <h3 className="text-sm font-extrabold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
                            <Eye className="h-4 w-4 text-violet-500" /> Device Photos ({tradeIn.images.length})
                          </h3>
                          <span className="text-xs text-zinc-400">Click photo to zoom</span>
                        </div>

                        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                          {tradeIn.images.map((url, i) => (
                            <button
                              key={i}
                              onClick={() => setLightboxUrl(url)}
                              className="group relative aspect-square rounded-2xl overflow-hidden bg-zinc-100 dark:bg-zinc-800 border border-zinc-200/60 dark:border-zinc-700/60 hover:ring-2 hover:ring-violet-500 transition-all shadow-sm"
                            >
                              <ProductImage src={url} alt={`Device photo ${i + 1}`} mode="cover" hover={false} sizes="20vw" />
                              <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                                <Eye className="h-5 w-5" />
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Technician Notes (If admin added notes) */}
                    {tradeIn.adminNotes && (
                      <div className="rounded-3xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-900/50 p-6 shadow-sm space-y-2">
                        <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300 font-extrabold text-xs uppercase tracking-wider">
                          <Info className="h-4 w-4" /> Note from TechStop Technician
                        </div>
                        <p className="text-sm text-amber-900 dark:text-amber-200 leading-relaxed font-medium">
                          "{tradeIn.adminNotes}"
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Right Column: Tracking & Contact */}
                  <div className="space-y-6">

                    {/* Prepaid Royal Mail Parcel Shipping Card */}
                    {tradeIn.fulfillment === "ship" && (
                      <div className="bg-gradient-to-br from-zinc-900 via-zinc-950 to-black text-white rounded-3xl p-6 border border-zinc-800 shadow-xl space-y-5">
                        <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-widest text-emerald-400">
                          <Package className="h-4 w-4" /> Shipping & Royal Mail Tracking
                        </div>

                        {tradeIn.trackingNumber ? (
                          <div className="space-y-4">
                            <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-4 space-y-1">
                              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Royal Mail Tracking No.</p>
                              <div className="flex items-center justify-between gap-2">
                                <p className="font-mono font-black text-lg text-white tracking-wider">{tradeIn.trackingNumber}</p>
                                <button
                                  onClick={handleCopyTracking}
                                  className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors"
                                  title="Copy tracking number"
                                >
                                  {copiedTracking ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                                </button>
                              </div>
                            </div>

                            <a
                              href={`https://www.royalmail.com/track-your-item#/tracking-results/${tradeIn.trackingNumber}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="w-full inline-flex items-center justify-center gap-2 h-11 px-4 rounded-2xl bg-white text-zinc-950 font-bold text-xs hover:bg-zinc-100 active:scale-95 transition-all shadow-md"
                            >
                              <Truck className="h-4 w-4 text-zinc-900" /> Track Parcel on Royal Mail
                              <ExternalLink className="h-3.5 w-3.5 opacity-60" />
                            </a>
                          </div>
                        ) : (
                          <p className="text-xs text-zinc-400 leading-relaxed">
                            Your prepaid shipping label is ready! Check your confirmation email for printing details.
                          </p>
                        )}

                        <div className="pt-2 border-t border-zinc-800/80 space-y-2">
                          <p className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-400">Quick Dispatch Checklist</p>
                          <ul className="text-xs text-zinc-300 space-y-2">
                            <li className="flex items-center gap-2">
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                              <span>Back up data & remove passcodes</span>
                            </li>
                            <li className="flex items-center gap-2">
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                              <span>Perform factory reset</span>
                            </li>
                            <li className="flex items-center gap-2">
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                              <span>Attach label & drop off at any Post Office</span>
                            </li>
                          </ul>
                        </div>
                      </div>
                    )}

                    {/* Store Drop-off Info Card */}
                    {tradeIn.fulfillment !== "ship" && (
                      <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200/80 dark:border-zinc-800 p-6 shadow-sm space-y-4">
                        <h3 className="text-xs font-extrabold uppercase tracking-widest text-violet-600 dark:text-violet-400 flex items-center gap-2">
                          <MapPin className="h-4 w-4" /> Store Drop-Off Instructions
                        </h3>
                        <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                          Please bring your device to your selected TechStop store branch along with your reference number <strong className="font-mono text-zinc-900 dark:text-zinc-100">{tradeIn.reference}</strong> and photo ID.
                        </p>
                      </div>
                    )}

                    {/* Contact Details Card */}
                    {tradeIn.contact && Object.keys(tradeIn.contact).length > 0 && (() => {
                      const c = tradeIn.contact as Record<string, string>;
                      return (
                        <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200/80 dark:border-zinc-800 p-6 shadow-sm space-y-4">
                          <h3 className="text-xs font-extrabold uppercase tracking-widest text-zinc-400 flex items-center gap-2 border-b border-zinc-100 dark:border-zinc-800/80 pb-3">
                            <User className="h-4 w-4 text-violet-500" /> Contact & Payout Info
                          </h3>

                          <div className="space-y-3">
                            {c.name && (
                              <div className="flex items-start gap-3">
                                <User className="h-4 w-4 text-zinc-400 shrink-0 mt-0.5" />
                                <div>
                                  <p className="text-[10px] font-bold uppercase text-zinc-400">Full Name</p>
                                  <p className="text-xs font-bold text-zinc-900 dark:text-zinc-100">{c.name}</p>
                                </div>
                              </div>
                            )}

                            {c.email && (
                              <div className="flex items-start gap-3">
                                <Mail className="h-4 w-4 text-zinc-400 shrink-0 mt-0.5" />
                                <div>
                                  <p className="text-[10px] font-bold uppercase text-zinc-400">Email Address</p>
                                  <p className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate">{c.email}</p>
                                </div>
                              </div>
                            )}

                            {c.phone && (
                              <div className="flex items-start gap-3">
                                <Phone className="h-4 w-4 text-zinc-400 shrink-0 mt-0.5" />
                                <div>
                                  <p className="text-[10px] font-bold uppercase text-zinc-400">Phone</p>
                                  <p className="text-xs font-bold text-zinc-900 dark:text-zinc-100">{c.phone}</p>
                                </div>
                              </div>
                            )}

                            {(c.address || c.postcode) && (
                              <div className="flex items-start gap-3">
                                <Home className="h-4 w-4 text-zinc-400 shrink-0 mt-0.5" />
                                <div>
                                  <p className="text-[10px] font-bold uppercase text-zinc-400">Address</p>
                                  <p className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                                    {[c.address, c.postcode].filter(Boolean).join(", ")}
                                  </p>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Customer Support CTA Card */}
                    <div className="rounded-3xl bg-gradient-to-br from-violet-500/10 via-purple-500/5 to-indigo-500/10 border border-violet-200/80 dark:border-violet-900/40 p-6 space-y-3">
                      <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-violet-700 dark:text-violet-300">
                        <HelpCircle className="h-4 w-4" /> Need Help With Your Trade-In?
                      </div>
                      <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                        If you have any questions regarding your valuation, inspection, or payout, our support team is here to assist.
                      </p>
                      <Link
                        href="/help"
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-violet-700 dark:text-violet-300 hover:text-violet-900 dark:hover:text-white transition-colors"
                      >
                        Contact Customer Support <ChevronRight className="h-3.5 w-3.5" />
                      </Link>
                    </div>

                  </div>
                </div>

              </motion.div>
            );
          })()}

        </div>
      </div>

      {/* Lightbox Modal */}
      <AnimatePresence>
        {lightboxUrl && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setLightboxUrl(null)}
            className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4"
          >
            <div className="relative max-w-4xl max-h-[90vh] overflow-hidden rounded-3xl">
              <motion.img
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                src={lightboxUrl}
                alt="Enlarged photo"
                className="max-w-full max-h-[85vh] object-contain rounded-2xl"
                onClick={e => e.stopPropagation()}
              />
              <button
                onClick={() => setLightboxUrl(null)}
                className="absolute top-4 right-4 p-2 rounded-full bg-black/60 hover:bg-black text-white backdrop-blur-md transition-colors"
              >
                <XCircle className="h-6 w-6" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Footer />
    </div>
  );
}
