"use client";

import {
  Search, Package, RefreshCw, ShieldCheck, Truck,
  Smartphone, ChevronRight, MessageCircle, ArrowRight,
  X, Send, HelpCircle, User,
  ChevronDown, Phone, Circle, CreditCard,
  ThumbsUp, ThumbsDown, Zap, RotateCcw, BadgeCheck,
  LogIn, CheckCircle2, Mail
} from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { io, Socket } from "socket.io-client";
import Footer from "@/components/Footer";
import { ordersApi, type Order } from "@/lib/api";
import { useAuth } from "@/context/auth-context";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3002";
const WS_URL  = API_URL.replace(/^http/, "ws");

interface Helpline { id: string; label: string; number: string; }
interface ChatMsg   { id?: string; sender: "customer" | "admin" | "bot"; body?: string; text?: string; createdAt?: string; }

interface Article {
  id: string;
  title: string;
  category: string;
  content: string;
}

const ARTICLES: Article[] = [
  {
    id: "track-order",
    title: "How to track my order",
    category: "Orders",
    content: "To track your shipment:\n\n1. Go to your **Account Dashboard**.\n2. Select **Orders** to view your active shipments.\n3. Click on the tracking link provided (e.g. Royal Mail or DPD tracking number).\n\nYou will also receive a dispatch email with your tracking link as soon as the courier collects the parcel from our warehouse. Standard delivery takes 1-3 working days across the UK."
  },
  {
    id: "change-order",
    title: "Can I modify or cancel my order?",
    category: "Orders",
    content: "Because we process orders rapidly (often within 30 minutes of purchase), cancellation and modification requests are highly time-sensitive:\n\n- **Within 15 minutes of ordering**: You can cancel or edit shipping details directly from your Account page.\n- **After 15 minutes**: Please contact our live support or email team immediately. If the parcel has already left our Leicester warehouse, you can reject the delivery or return it for free within 30 days of receipt."
  },
  {
    id: "order-delayed",
    title: "What to do if my order is delayed",
    category: "Orders",
    content: "If your order has not arrived within the estimated delivery window:\n\n1. Check the tracking page for any courier delay notifications (e.g. weather or route exceptions).\n2. If it is delayed by more than **48 hours**, please reach out to our support team and we will open an investigation with the carrier immediately.\n3. In cases where the carrier confirms the parcel is lost, we will ship a replacement unit or issue a full refund immediately."
  },
  {
    id: "return-policy",
    title: "Our 30-day return policy",
    category: "Returns",
    content: "We want you to love your purchase. If you change your mind, you can return any item for a full refund within **30 days** of delivery:\n\n- **Condition**: The item must be returned in the same cosmetic condition it was received, along with any included charging cables and accessories.\n- **Free Shipping**: We provide a prepaid postage label. Pack the device securely, attach the label, and drop it at any Post Office."
  },
  {
    id: "return-label",
    title: "How to generate a return label",
    category: "Returns",
    content: "To print your prepaid return shipping label:\n\n1. Log into your account and navigate to **Returns & Refunds**.\n2. Select the order and device you wish to return.\n3. Choose your reason for return and click **Generate Label**.\n4. Download and print the PDF label, then attach it securely to your shipping box."
  },
  {
    id: "payment-methods",
    title: "Supported payment methods",
    category: "Payments",
    content: "We accept a wide range of safe and secure payment methods:\n\n- **Credit/Debit Cards**: Visa, Mastercard, American Express.\n- **Digital Wallets**: Apple Pay, Google Pay, PayPal.\n- **Financing**: Klarna and Clearpay are available at checkout, letting you pay in 3 interest-free installments or pay later in 30 days."
  },
  {
    id: "invoice",
    title: "How to download my invoice",
    category: "Payments",
    content: "VAT invoices are generated automatically at the time of purchase:\n\n1. Go to **Orders** inside your account profile.\n2. Click on the order in question to open its detail page.\n3. Click **Download VAT Invoice** (PDF) at the top right of the order summary."
  },
  {
    id: "trade-in-payment",
    title: "How and when do I get paid for trade-ins?",
    category: "Selling",
    content: "Our trade-in payout process is fast and transparent:\n\n1. **Send device**: Use the free prepaid shipping label we send you.\n2. **Inspection**: Our technicians inspect the device within **24 hours** of receipt.\n3. **Payment**: Once approved, bank transfer payments are initiated instantly. Funds typically clear in your account within 2 hours, depending on your bank's faster payment processing."
  },
  {
    id: "shipping-trade-in",
    title: "How to package my trade-in device safely",
    category: "Selling",
    content: "To prevent transit damage and guarantee your full payout valuation:\n\n- Use a sturdy cardboard box (not a bubble mailer for laptops or tablets).\n- Wrap the device in bubble wrap or crumpled packing paper so it doesn't move.\n- Perform a factory reset and remove any iCloud/Google accounts and SIM cards before dispatch."
  },
  {
    id: "warranty-coverage",
    title: "What does our 12-month warranty cover?",
    category: "Warranty",
    content: "Every device bought from TechStop comes with a comprehensive **12-month hardware warranty**:\n\n- **What's Covered**: Technical faults, manufacturing defects, and hardware failures (e.g. touch screen failing, charging port disconnecting, battery degradation below 80% capacity).\n- **What's Not Covered**: Accidental physical damage (e.g. cracked screens, drop impact dents) and liquid immersion/water exposure."
  },
  {
    id: "claim-warranty",
    title: "How to file a warranty claim",
    category: "Warranty",
    content: "If your device develops a hardware fault:\n\n1. Navigate to **Warranty & Repairs** inside your account.\n2. Click **File Warranty Claim** next to the specific device.\n3. Describe the issue and select your preferred method: **Drop-off** in Leicester or **Prepaid Post**.\n4. We will repair the device or ship a certified replacement within 3 working days."
  },
  {
    id: "reset-password",
    title: "How to reset my password",
    category: "Account",
    content: "If you've forgotten your password or want to change it:\n\n1. Go to the **Login Page**.\n2. Click **Forgot Password?** under the input field.\n3. Enter your registered email address and click **Send Reset Link**.\n4. Click the link in your email to choose a new secure password."
  },
  {
    id: "delete-account",
    title: "How to delete my account",
    category: "Account",
    content: "We take your data privacy seriously. To delete your account and remove all personal information:\n\n1. Visit **Settings** within your Account page.\n2. Scroll down to the **Privacy & Data** section.\n3. Click **Delete My Account & Personal Data**.\n4. Confirm your identity by entering your password or verification code."
  }
];

const STATUS_LABELS: Record<string, string> = {
  PENDING:   "Processing",
  CONFIRMED: "Confirmed",
  SHIPPED:   "Dispatched",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

const STATUS_COLORS: Record<string, string> = {
  PENDING:   "bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-900/50",
  CONFIRMED: "bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-900/50",
  SHIPPED:   "bg-purple-50 dark:bg-purple-950/30 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-900/50",
  DELIVERED: "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/50",
  CANCELLED: "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700",
};

const FAQS = [
  {
    q: "How does the standard 12-month hardware warranty work?",
    a: "All TechStop purchases come with a 12-month hardware warranty. This covers display failures, motherboard issues, battery degradation under 80%, and port connection drops. Physical cracks or liquid immersion are excluded. To file a claim, go to Warranty & Repairs in your account.",
    articleId: "warranty-coverage"
  },
  {
    q: "What is your return process and timeline?",
    a: "You can return any unit for a 100% refund within 30 days of receiving your package. We provide a prepaid postage label. Simply pack the item securely, print and attach the label, and drop it off at any Post Office. Refunds are processed within 24 hours of us receiving the return.",
    articleId: "return-policy"
  },
  {
    q: "When and how do I receive trade-in payments?",
    a: "After you ship your device and our technicians check it (within 24 hours of receipt), we release your funds immediately. Bank transfers typically clear in your account within 2 hours via Faster Payments.",
    articleId: "trade-in-payment"
  },
  {
    q: "Can I modify or cancel my order after placing it?",
    a: "Orders can be cancelled within 15 minutes directly from your Account page. After that window, contact our live support immediately — if the parcel hasn't left our warehouse, we can still intercept it. Once dispatched, you can return it free of charge within 30 days.",
    articleId: "change-order"
  },
  {
    q: "What payment methods and financing options are available?",
    a: "We accept all major credit/debit cards (Visa, Mastercard, Amex), Apple Pay, Google Pay, and PayPal. Klarna and Clearpay are available at checkout for interest-free instalments or pay-later in 30 days.",
    articleId: "payment-methods"
  },
  {
    q: "My order is delayed — what should I do?",
    a: "Check the tracking page first for courier delay notifications. If your order is more than 48 hours overdue with no tracking update, start a chat or call us and we'll open an investigation with the carrier. If the parcel is confirmed lost, we'll reship or refund same-day.",
    articleId: "order-delayed"
  },
];

export default function HelpPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [drawerType, setDrawerType] = useState<"article" | "chat" | null>(null);

  const [isOrdersModalOpen, setIsOrdersModalOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const [userOrders, setUserOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [recentOrder, setRecentOrder] = useState<Order | null>(null);

  const [helplines, setHelplines] = useState<Helpline[]>([]);
  const [supportEmail, setSupportEmail] = useState<string | null>(null);
  const [articleFeedback, setArticleFeedback] = useState<Record<string, "up" | "down">>({});
  const [isMounted, setIsMounted] = useState(false);


  // Chat state
  const [chatStep, setChatStep] = useState<"form" | "chat">("form");
  const [chatName, setChatName] = useState("");
  const [chatEmail, setChatEmail] = useState("");
  const [chatOrderRef, setChatOrderRef] = useState<string | undefined>(undefined);
  const [chatId, setChatId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatConnected, setChatConnected] = useState(false);
  const [chatStarting, setChatStarting] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const categoriesRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setIsMounted(true); }, []);

  useEffect(() => {
    if (drawerType) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [drawerType]);

  useEffect(() => {
    fetch(`${API_URL}/support/helplines`)
      .then(r => r.json()).then(setHelplines).catch(() => {});
    fetch(`${API_URL}/support/contact-email`)
      .then(r => r.json()).then(data => setSupportEmail(data.email)).catch(() => {});
  }, []);

  useEffect(() => {
    if (user) {
      setChatName(user.name ?? "");
      setChatEmail(user.email ?? "");
      ordersApi.myOrders()
        .then(orders => {
          if (orders.length > 0) {
            const sorted = [...orders].sort((a, b) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            );
            setRecentOrder(sorted[0]);
          }
        })
        .catch(() => {});
    }
  }, [user]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  useEffect(() => () => { socketRef.current?.disconnect(); }, []);

  const connectSocket = useCallback((id: string) => {
    const socket = io(`${WS_URL}/support`, { transports: ["websocket"] });
    socketRef.current = socket;
    socket.on("connect", () => { setChatConnected(true); socket.emit("joinChat", id); });
    socket.on("disconnect", () => setChatConnected(false));
    socket.on("chatHistory", (chat: { messages: ChatMsg[] }) => {
      if (chat && Array.isArray(chat.messages) && chat.messages.length > 0) {
        setChatMessages(chat.messages);
      }
    });
    socket.on("newMessage", (msg: ChatMsg) => {
      setChatMessages(prev => [...prev, msg]);
    });
    socket.on("chatClosed", () => {
      try { sessionStorage.removeItem("ts_active_chat_id"); } catch {}
      setChatMessages(prev => [...prev, { sender: "bot", body: "This chat has been closed by our team. Thank you for contacting TechStop!" } as ChatMsg]);
    });
  }, []);

  async function startChatSession(name: string, email: string, orderRef?: string) {
    setChatStarting(true);
    try {
      const savedChatId = typeof window !== "undefined" ? sessionStorage.getItem("ts_active_chat_id") : null;
      if (savedChatId) {
        setChatId(savedChatId);
        setChatStep("chat");
        connectSocket(savedChatId);
        return;
      }

      const res = await fetch(`${API_URL}/support/chats`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guestName: name.trim(), guestEmail: email.trim() || undefined, orderRef: orderRef || undefined }),
      });
      const chat = await res.json();
      setChatId(chat.id);
      try { sessionStorage.setItem("ts_active_chat_id", chat.id); } catch {}
      setChatStep("chat");
      setChatMessages(
        chat.messages && chat.messages.length > 0
          ? chat.messages
          : [{ sender: "bot", body: `Hi ${name}! You're now connected to our support team. Please describe your issue and our team will be with you shortly.` } as ChatMsg]
      );
      connectSocket(chat.id);
    } catch {
      alert("Could not start chat. Please try again.");
    } finally {
      setChatStarting(false);
    }
  }

  async function handleStartChat(e: React.FormEvent) {
    e.preventDefault();
    if (!chatName.trim()) return;
    await startChatSession(chatName, chatEmail, chatOrderRef);
  }

  function handleSendChat() {
    if (!chatInput.trim() || !chatId) return;
    socketRef.current?.emit("sendMessage", { chatId, sender: "customer", body: chatInput.trim() });
    setChatInput("");
  }


  function openOrdersModal() {
    setIsOrdersModalOpen(true);
    if (typeof window !== "undefined" && localStorage.getItem("ts_token")) {
      setLoadingOrders(true);
      ordersApi.myOrders()
        .then(setUserOrders)
        .catch(() => setUserOrders([]))
        .finally(() => setLoadingOrders(false));
    }
  }

  const handleOpenArticle = (article: Article) => {
    setSelectedArticle(article);
    setDrawerType("article");
  };

  const handleOpenChat = () => {
    if (authLoading) return;
    if (!user) {
      sessionStorage.setItem("ts_login_redirect", "/help");
      router.push("/login?redirect=%2Fhelp");
      return;
    }
    setChatMessages([]);
    setChatId(null);
    setChatOrderRef(undefined);
    socketRef.current?.disconnect();
    if (chatName.trim()) {
      setChatStep("chat");
      setDrawerType("chat");
      startChatSession(chatName, chatEmail, undefined);
    } else {
      setChatStep("form");
      setDrawerType("chat");
    }
  };

  const handleSelectOrderForHelp = (order: Order) => {
    const ref = `#${order.id.slice(0, 8).toUpperCase()}`;
    setIsOrdersModalOpen(false);
    setChatMessages([]);
    setChatId(null);
    setChatOrderRef(ref);
    socketRef.current?.disconnect();
    if (chatName.trim()) {
      setChatStep("chat");
      setDrawerType("chat");
      startChatSession(chatName, chatEmail, ref);
    } else {
      setChatStep("form");
      setDrawerType("chat");
    }
  };

  const scrollToCategories = () => {
    categoriesRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const getRelatedArticles = (article: Article): Article[] =>
    ARTICLES.filter(a => a.id !== article.id && a.category === article.category).slice(0, 3);

  const categories = [
    {
      title: "Orders & Shipping",
      icon: Truck,
      desc: "Track delivery, edit address, check delays.",
      links: [
        { label: "Track my active shipment", articleId: "track-order" },
        { label: "Modify or cancel an order", articleId: "change-order" },
        { label: "What to do if order is delayed", articleId: "order-delayed" }
      ]
    },
    {
      title: "Returns & Refunds",
      icon: RefreshCw,
      desc: "Free 30-day return policy and label generation.",
      links: [
        { label: "Our 30-day return policy", articleId: "return-policy" },
        { label: "Generate prepaid return label", articleId: "return-label" }
      ]
    },
    {
      title: "Payments & Invoices",
      icon: CreditCard,
      desc: "Klarna, payment methods, VAT invoices.",
      links: [
        { label: "Supported payment methods", articleId: "payment-methods" },
        { label: "How to download VAT invoice", articleId: "invoice" }
      ]
    },
    {
      title: "Trade-In & Selling",
      icon: Smartphone,
      desc: "Get valuations, package safely, and get paid.",
      links: [
        { label: "How and when do I get paid?", articleId: "trade-in-payment" },
        { label: "Package trade-in device safely", articleId: "shipping-trade-in" }
      ]
    },
    {
      title: "Warranty & Coverage",
      icon: ShieldCheck,
      desc: "12-month hardware guarantee claims.",
      links: [
        { label: "What does our warranty cover?", articleId: "warranty-coverage" },
        { label: "File a warranty repair claim", articleId: "claim-warranty" }
      ]
    },
    {
      title: "Account & Privacy",
      icon: Package,
      desc: "Reset passwords, credentials, profile removal.",
      links: [
        { label: "Reset my password", articleId: "reset-password" },
        { label: "Delete account & data", articleId: "delete-account" }
      ]
    },
  ];

  const quickActions = [
    { label: "Track Order", icon: Truck, action: openOrdersModal },
    { label: "Start a Return", icon: RotateCcw, action: () => handleOpenArticle(ARTICLES.find(a => a.id === "return-label")!) },
    { label: "Warranty Claim", icon: BadgeCheck, action: () => handleOpenArticle(ARTICLES.find(a => a.id === "claim-warranty")!) },
    { label: "Trade-In Quote", icon: Zap, action: () => router.push("/trade-in") },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-zinc-950 text-foreground font-sans selection:bg-red-500/30 selection:text-red-900 dark:selection:text-red-100 overflow-x-hidden">

      <main className="flex-1 relative pb-20">

        {/* Hero */}
        <section className="relative pt-24 lg:pt-28 pb-16 lg:pb-24 border-b border-zinc-200/50 dark:border-zinc-800/50 bg-zinc-950 dark:bg-black overflow-hidden">
          {/* Ambient Mesh Gradient Background */}
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div className="absolute w-[600px] h-[600px] bg-red-600/20 blur-[120px] rounded-full top-[-10%] opacity-60" />
            <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-10 mix-blend-overlay" />
          </div>

          <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid lg:grid-cols-12 gap-8 lg:gap-12 items-center text-left">
              
              {/* Left Column: Headlines and Buttons */}
              <div className="lg:col-span-7 min-w-0 flex flex-col items-start">
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 mb-6 backdrop-blur-sm">
                  <Circle className="h-2 w-2 fill-emerald-400 text-emerald-400 animate-pulse" />
                  <span className="text-[11px] font-bold text-zinc-300 uppercase tracking-widest">Live support · within 24 hours</span>
                </div>

                <h1 className="font-sans text-4xl sm:text-5xl lg:text-6xl font-black tracking-tighter text-white mb-6 leading-tight uppercase">
                  How can we <span className="font-serif italic font-light lowercase text-red-500 tracking-normal">help?</span>
                </h1>
                
                <p className="text-zinc-400 font-medium mb-8 max-w-xl text-sm sm:text-base md:text-lg leading-relaxed">
                  Experience lightning-fast support. Whether you need to track an order, process a return, or get technical advice, our team is ready.
                </p>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3.5 mb-2 w-full max-w-xl">
                  <button
                    onClick={handleOpenChat}
                    className="w-full sm:flex-1 h-14 sm:h-15 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-black rounded-2xl flex items-center justify-center gap-3 transition-all text-xs sm:text-sm uppercase tracking-wider shadow-lg shadow-red-950/40 border border-red-500/30 hover:scale-[1.02] active:scale-[0.98] shrink-0"
                  >
                    <MessageCircle className="h-5 w-5" strokeWidth={2.5} />
                    <span>Start Live Chat</span>
                  </button>

                  {(helplines.length > 0 ? helplines : [
                    { id: "leicester-store-helpline", label: "LEICESTER STORE HELPLINE", number: "+447343055398" }
                  ]).map((hl) => (
                    <a
                      key={hl.id}
                      href={`tel:${hl.number.replace(/\s/g, "")}`}
                      className="w-full sm:flex-1 h-14 sm:h-15 rounded-2xl border border-white/15 bg-white/10 hover:bg-white/15 transition-all shadow-md flex items-center justify-center gap-3.5 px-4 hover:scale-[1.02] active:scale-[0.98] shrink-0"
                    >
                      <div className="h-9 w-9 rounded-xl bg-white/15 flex items-center justify-center text-white shrink-0">
                        <Phone className="h-4 w-4" strokeWidth={2.5} />
                      </div>
                      <div className="text-left flex flex-col justify-center min-w-0">
                        <span className="text-[9px] text-zinc-300 font-bold uppercase tracking-wider leading-none mb-1 truncate">{hl.label}</span>
                        <span className="font-extrabold text-xs sm:text-sm text-white uppercase tracking-wider leading-none truncate">{hl.number}</span>
                      </div>
                    </a>
                  ))}
                </div>
              </div>

              {/* Right Column: High-tech 3D Customer Support Hero Image */}
              <div className="lg:col-span-5 relative flex justify-center items-center mt-6 lg:mt-0">
                <div className="relative w-full max-w-md aspect-[4/3] rounded-[2.5rem] overflow-hidden border border-white/10 shadow-2xl bg-zinc-900 group">
                  <img
                    src="/images/help_hero_support.png"
                    alt="TechStop Customer Support"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/20 to-transparent" />
                  <div className="absolute bottom-4 left-4 right-4 p-4 rounded-2xl bg-black/60 backdrop-blur-md border border-white/10 flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-red-600/20 border border-red-500/30 flex items-center justify-center text-red-500 shrink-0">
                      <ShieldCheck className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 text-left">
                      <p className="text-xs font-black text-white uppercase tracking-wider">24/7 Expert Support</p>
                      <p className="text-[11px] font-semibold text-zinc-400 truncate">Dedicated UK Customer Service Team</p>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </section>

        {/* Quick Actions */}
        <section className="max-w-4xl mx-auto px-4 pt-12 relative z-20">
          <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 dark:text-zinc-400 text-center mb-6 drop-shadow-sm">Quick Actions</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {quickActions.map(({ label, icon: Icon, action }) => (
              <button
                key={label}
                onClick={action}
                className="group relative flex flex-col items-center gap-3 p-6 rounded-[2rem] bg-white/5 dark:bg-zinc-900/40 backdrop-blur-xl border border-zinc-200/50 dark:border-zinc-800/50 hover:border-red-500/50 dark:hover:border-red-500/50 transition-all duration-300 hover:shadow-[0_0_30px_rgba(239,68,68,0.1)] overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                <div className="relative z-10 h-12 w-12 rounded-2xl bg-white dark:bg-zinc-800 flex items-center justify-center text-zinc-600 dark:text-zinc-400 shadow-md group-hover:scale-110 group-hover:bg-red-50 group-hover:text-red-600 dark:group-hover:bg-red-950/40 dark:group-hover:text-red-400 transition-all duration-300">
                  <Icon className="h-5 w-5" strokeWidth={2} />
                </div>
                <span className="relative z-10 text-[11px] font-black text-zinc-700 dark:text-zinc-300 group-hover:text-zinc-950 dark:group-hover:text-white transition-colors text-center leading-tight tracking-wide uppercase">{label}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Recent Order Widget (logged-in users only) */}
        {user && recentOrder && (
          <section className="max-w-4xl mx-auto px-4 mt-8 relative z-20">
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="relative bg-white/60 dark:bg-zinc-900/60 backdrop-blur-xl border border-zinc-200/80 dark:border-zinc-800/80 rounded-[2rem] p-6 flex flex-col sm:flex-row sm:items-center gap-5 overflow-hidden shadow-lg hover:shadow-xl hover:border-zinc-300 dark:hover:border-zinc-700 transition-all duration-300 group"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-zinc-50/50 to-transparent dark:from-zinc-800/10 pointer-events-none" />
              <div className="h-14 w-14 rounded-2xl bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 flex items-center justify-center shrink-0 relative z-10 shadow-lg group-hover:scale-105 transition-transform duration-300">
                <Package className="h-6 w-6" />
              </div>
              <div className="flex-1 min-w-0 relative z-10">
                <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-1">Your most recent order</p>
                <p className="text-base font-black text-zinc-950 dark:text-white truncate">
                  {recentOrder.items[0]?.product.name ?? "Order"}
                  {recentOrder.items.length > 1 && (
                    <span className="text-zinc-400 font-semibold"> +{recentOrder.items.length - 1} more</span>
                  )}
                </p>
                <div className="flex flex-wrap items-center gap-3 mt-2">
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${STATUS_COLORS[recentOrder.status] ?? STATUS_COLORS.CANCELLED}`}>
                    <span className="h-1.5 w-1.5 rounded-full bg-current" />
                    {STATUS_LABELS[recentOrder.status] ?? recentOrder.status}
                  </span>
                  <span className="text-[10px] text-zinc-500 dark:text-zinc-400 font-bold tracking-wider uppercase">
                    #{recentOrder.id.slice(0, 8).toUpperCase()} · {new Date(recentOrder.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                  </span>
                </div>
              </div>
              <button
                onClick={() => handleSelectOrderForHelp(recentOrder)}
                className="relative z-10 w-full sm:w-auto h-12 px-6 rounded-xl bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 text-xs font-black uppercase tracking-wider hover:bg-red-600 hover:text-white dark:hover:bg-red-500 dark:hover:text-white transition-colors flex items-center justify-center gap-2"
              >
                Get Help <ChevronRight className="h-4 w-4" />
              </button>
            </motion.div>
          </section>
        )}

        {/* Cards */}
        <section className="max-w-4xl mx-auto px-4 mt-8 relative z-20">
          <div className="grid md:grid-cols-2 gap-6 lg:gap-8">

            <div className="group relative bg-white/80 dark:bg-zinc-900/80 backdrop-blur-2xl border border-zinc-200/80 dark:border-zinc-800/80 rounded-[2.5rem] p-8 md:p-10 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.05)] hover:shadow-[0_20px_40px_-15px_rgba(239,68,68,0.1)] hover:border-red-500/30 transition-all duration-500 flex flex-col justify-between items-start text-left overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-zinc-50 to-transparent dark:from-zinc-800/20 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
              <div className="relative z-10 w-full">
                <div className="h-14 w-14 bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 rounded-2xl flex items-center justify-center mb-6 shadow-xl shadow-zinc-900/10 group-hover:scale-110 transition-transform duration-500">
                  <Package className="h-6 w-6" />
                </div>
                <h3 className="text-2xl font-black text-zinc-950 dark:text-white mb-3">Order Support</h3>
                <p className="text-zinc-500 dark:text-zinc-400 text-sm font-semibold leading-relaxed mb-8">
                  Track delivery, request return labels, cancel items, or get help with an active purchase.
                </p>
              </div>
              <button
                onClick={openOrdersModal}
                className="relative z-10 w-full h-14 bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 font-bold text-xs uppercase tracking-widest rounded-2xl transition-all shadow-[0_10px_20px_rgba(0,0,0,0.1)] hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-3 group/btn overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-red-600 to-red-500 opacity-0 group-hover/btn:opacity-100 transition-opacity duration-300" />
                <span className="relative z-10 flex items-center gap-2 group-hover/btn:text-white transition-colors duration-300">
                  Get help with an order <ArrowRight className="h-4 w-4" />
                </span>
              </button>
            </div>

            <div className="group relative bg-white/80 dark:bg-zinc-900/80 backdrop-blur-2xl border border-zinc-200/80 dark:border-zinc-800/80 rounded-[2.5rem] p-8 md:p-10 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.05)] hover:shadow-[0_20px_40px_-15px_rgba(239,68,68,0.1)] hover:border-red-500/30 transition-all duration-500 flex flex-col justify-between items-start text-left overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-red-50/50 to-transparent dark:from-red-900/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
              <div className="relative z-10 w-full">
                <div className="h-14 w-14 bg-red-100 dark:bg-red-950/30 text-red-600 dark:text-red-500 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-500">
                  <HelpCircle className="h-6 w-6" />
                </div>
                <h3 className="text-2xl font-black text-zinc-950 dark:text-white mb-3">General Support</h3>
                <p className="text-zinc-500 dark:text-zinc-400 text-sm font-semibold leading-relaxed mb-8">
                  Learn about trading in devices, our 12-month hardware warranty, payment financing, and managing your account.
                </p>
              </div>
              <button
                onClick={scrollToCategories}
                className="relative z-10 w-full h-14 bg-white/50 dark:bg-zinc-800/50 backdrop-blur-md border border-zinc-200 dark:border-zinc-700 hover:border-red-500 dark:hover:border-red-500 text-zinc-950 dark:text-white hover:bg-white dark:hover:bg-zinc-800 font-bold text-xs uppercase tracking-widest rounded-2xl transition-all flex items-center justify-center shadow-sm hover:shadow-md hover:scale-[1.02] active:scale-[0.98]"
              >
                Browse FAQ categories
              </button>
            </div>

          </div>
        </section>

        {/* FAQ */}
        <section className="py-24 relative overflow-hidden">
          <div className="mx-auto max-w-3xl px-4 relative z-10">
            <h2 className="font-sans text-4xl font-black tracking-tighter text-center text-zinc-950 dark:text-white mb-10 drop-shadow-sm uppercase">
              Popular <span className="font-serif italic font-light lowercase text-red-500 tracking-normal">questions</span>
            </h2>
            <div className="space-y-4">
              {FAQS.map((faq, idx) => {
                const isOpen = openFaq === idx;
                const linkedArticle = ARTICLES.find(a => a.id === faq.articleId);
                return (
                  <div key={idx} className={`relative bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl border ${isOpen ? "border-red-500/50 dark:border-red-500/50 shadow-xl" : "border-zinc-200/50 dark:border-zinc-800/50 shadow-sm hover:border-zinc-300 dark:hover:border-zinc-700"} rounded-[1.5rem] overflow-hidden transition-all duration-300`}>
                    <button
                      onClick={() => setOpenFaq(isOpen ? null : idx)}
                      className="w-full flex items-center justify-between p-6 text-left group"
                    >
                      <span className={`font-bold text-base transition-colors pr-6 ${isOpen ? "text-red-600 dark:text-red-400" : "text-zinc-700 dark:text-zinc-300 group-hover:text-zinc-950 dark:group-hover:text-white"}`}>
                        {faq.q}
                      </span>
                      <div className={`h-8 w-8 rounded-full border flex items-center justify-center shrink-0 transition-all duration-300 ${isOpen ? "border-red-500 bg-red-500 text-white rotate-180 shadow-lg shadow-red-500/30" : "border-zinc-200 dark:border-zinc-700 text-zinc-400 group-hover:border-zinc-400"}`}>
                        <ChevronDown className="h-4 w-4" />
                      </div>
                    </button>
                    <AnimatePresence initial={false}>
                      {isOpen && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.3, ease: "easeInOut" }}
                        >
                          <div className="px-6 pb-6 text-sm text-zinc-600 dark:text-zinc-400 font-semibold leading-relaxed border-t border-zinc-100 dark:border-zinc-800 pt-5">
                            <p>{faq.a}</p>
                            {linkedArticle && (
                              <button
                                onClick={() => handleOpenArticle(linkedArticle)}
                                className="mt-4 inline-flex items-center gap-1.5 text-red-500 font-black text-xs uppercase tracking-widest hover:gap-2.5 transition-all"
                              >
                                Read full guide <ChevronRight className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Categories */}
        <section ref={categoriesRef} className="pb-24 pt-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 relative z-10 border-t border-zinc-200/50 dark:border-zinc-800/50">
          <h2 className="font-sans text-4xl font-black tracking-tighter text-center text-zinc-950 dark:text-white mb-10 drop-shadow-sm uppercase">
            Browse all <span className="font-serif italic font-light lowercase text-red-500 tracking-normal">topics</span>
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((cat, i) => (
              <motion.div
                key={cat.title}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05, type: "spring", stiffness: 100 }}
                className="group relative bg-white/60 dark:bg-zinc-900/60 backdrop-blur-md border border-zinc-200/80 dark:border-zinc-800 rounded-[1.5rem] p-6 hover:border-red-200 dark:hover:border-red-900/50 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between text-left overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                <div className="relative z-10">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="h-10 w-10 bg-zinc-100 dark:bg-zinc-800 rounded-xl flex items-center justify-center text-zinc-600 dark:text-zinc-400 group-hover:bg-red-500 group-hover:text-white transition-colors duration-300 shadow-sm">
                      <cat.icon className="h-5 w-5" strokeWidth={2} />
                    </div>
                    <h3 className="text-lg font-black text-zinc-950 dark:text-white tracking-tight">{cat.title}</h3>
                  </div>
                  <div className="space-y-3">
                    {cat.links.map((link) => {
                      const linkedArticle = ARTICLES.find(a => a.id === link.articleId);
                      return (
                        <button
                          key={link.label}
                          onClick={() => linkedArticle && handleOpenArticle(linkedArticle)}
                          className="w-full flex items-center justify-between text-left group/link py-1.5 transition-colors border-b border-zinc-100 dark:border-zinc-800/50 last:border-0"
                        >
                          <span className="text-sm font-bold text-zinc-600 dark:text-zinc-400 group-hover/link:text-zinc-950 dark:group-hover/link:text-white">{link.label}</span>
                          <ChevronRight className="h-4 w-4 text-zinc-300 dark:text-zinc-600 group-hover/link:translate-x-1 group-hover/link:text-red-500 transition-all" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Premium Support CTA (Contacts) */}
        <section className="py-10 md:py-16 relative overflow-hidden my-10 px-4 sm:px-6 w-full flex justify-center items-center">
          <div className="relative bg-[#120808] border border-red-950/60 p-6 sm:p-9 rounded-[2.25rem] sm:rounded-[2.5rem] shadow-2xl overflow-hidden text-center max-w-md w-full min-w-0 mx-auto">
            {/* Red Ambient Glow inside container */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-64 bg-red-600/20 blur-[90px] rounded-full pointer-events-none" />

            <div className="relative z-10">
              <h2 className="font-sans text-2xl sm:text-4xl font-black tracking-tight text-white mb-2 leading-none uppercase">
                STILL NEED <br />
                <span className="text-red-500 font-extrabold">ASSISTANCE?</span>
              </h2>
              <p className="text-zinc-400 font-medium text-xs sm:text-sm mb-6 sm:mb-8 leading-relaxed max-w-xs mx-auto">
                Our support team is available around the clock to help you with any issues, large or small.
              </p>

              <div className="space-y-3 sm:space-y-3.5 text-left">
                <a
                  href={`mailto:${supportEmail || "techstopuk@outlook.com"}`}
                  className="w-full bg-[#201010]/80 hover:bg-[#2a1414] border border-red-900/30 hover:border-red-600/40 p-3.5 sm:p-4.5 rounded-2xl transition-all duration-300 flex items-center gap-3.5 sm:gap-4 group shadow-lg"
                >
                  <div className="h-10 sm:h-11 w-10 sm:w-11 rounded-xl bg-white/10 group-hover:bg-red-600 flex items-center justify-center text-white shrink-0 transition-all">
                    <Mail className="h-4 sm:h-5 w-4 sm:w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[9px] sm:text-[10px] text-zinc-400 font-bold uppercase tracking-wider mb-0.5">EMAIL SUPPORT</p>
                    <p className="text-xs sm:text-base font-bold text-white truncate group-hover:text-red-400 transition-colors">
                      {supportEmail || "techstopuk@outlook.com"}
                    </p>
                  </div>
                </a>

                {(helplines.length > 0 ? helplines : [
                  { id: "leicester-store-helpline", label: "LEICESTER STORE HELPLINE", number: "+447343055398" }
                ]).map((hl) => (
                  <a
                    key={hl.id}
                    href={`tel:${hl.number.replace(/\s/g, "")}`}
                    className="w-full bg-[#201010]/80 hover:bg-[#2a1414] border border-red-900/30 hover:border-red-600/40 p-3.5 sm:p-4.5 rounded-2xl transition-all duration-300 flex items-center gap-3.5 sm:gap-4 group shadow-lg"
                  >
                    <div className="h-10 sm:h-11 w-10 sm:w-11 rounded-xl bg-white/10 group-hover:bg-red-600 flex items-center justify-center text-white shrink-0 transition-all">
                      <Phone className="h-4 sm:h-5 w-4 sm:w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[9px] sm:text-[10px] text-zinc-400 font-bold uppercase tracking-wider mb-0.5">{hl.label.toUpperCase()}</p>
                      <p className="text-xs sm:text-base font-bold text-white truncate group-hover:text-red-400 transition-colors">{hl.number}</p>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          </div>
        </section>

      </main>

      {/* Orders Modal */}
      <AnimatePresence>
        {isOrdersModalOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOrdersModalOpen(false)}
              className="fixed inset-0 bg-black/60 z-50 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-2rem)] sm:w-full max-w-xl bg-white/90 dark:bg-zinc-900/90 backdrop-blur-3xl border border-white dark:border-zinc-800 rounded-[2.5rem] p-8 shadow-2xl z-55 text-left overflow-hidden"
            >
              <div className="flex justify-between items-center mb-8">
                <div>
                  <h3 className="text-2xl font-black text-zinc-950 dark:text-white tracking-tight">Select an order</h3>
                  <p className="text-zinc-500 dark:text-zinc-400 text-xs font-semibold mt-1">Choose which order you need support with.</p>
                </div>
                <button
                  onClick={() => setIsOrdersModalOpen(false)}
                  className="h-10 w-10 rounded-full border border-zinc-200 dark:border-zinc-800 flex items-center justify-center text-zinc-400 hover:text-zinc-950 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                {loadingOrders ? (
                  <div className="space-y-4">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="h-24 rounded-[1.5rem] bg-zinc-100 dark:bg-zinc-800 animate-pulse" />
                    ))}
                  </div>
                ) : !user ? (
                  <div className="py-12 text-center bg-zinc-50 dark:bg-zinc-950/50 rounded-[2rem] border border-zinc-200/50 dark:border-zinc-800/50">
                    <Package className="h-12 w-12 text-zinc-300 dark:text-zinc-700 mx-auto mb-4" />
                    <p className="font-black text-base text-zinc-800 dark:text-zinc-200 mb-1">Sign in to see your orders</p>
                    <p className="text-sm font-semibold text-zinc-500 mb-6">Log in to get order-specific support.</p>
                    <Link
                      href="/login?redirect=%2Fhelp"
                      className="inline-flex items-center gap-2 px-6 py-3 bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 rounded-xl font-black text-sm uppercase tracking-wider hover:bg-zinc-700 dark:hover:bg-zinc-200 transition-colors"
                    >
                      <LogIn className="h-4 w-4" /> Sign In
                    </Link>
                  </div>
                ) : userOrders.length === 0 ? (
                  <div className="py-12 text-center bg-zinc-50 dark:bg-zinc-950/50 rounded-[2rem] border border-zinc-200/50 dark:border-zinc-800/50">
                    <Package className="h-12 w-12 text-zinc-300 dark:text-zinc-700 mx-auto mb-4" />
                    <p className="font-black text-base text-zinc-800 dark:text-zinc-200">No orders found</p>
                    <p className="text-sm font-semibold text-zinc-500 mt-2">You haven't placed any orders yet.</p>
                  </div>
                ) : (
                  userOrders.map((order) => {
                    const firstName = order.items[0]?.product.name ?? "Order";
                    const displayName = order.items.length > 1
                      ? `${firstName} + ${order.items.length - 1} more`
                      : firstName;
                    const shortId = `#${order.id.slice(0, 8).toUpperCase()}`;
                    const statusLabel = STATUS_LABELS[order.status] ?? order.status;
                    const purchaseDate = new Date(order.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
                    return (
                      <button
                        key={order.id}
                        onClick={() => handleSelectOrderForHelp(order)}
                        className="w-full flex items-center justify-between p-5 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-950 dark:hover:border-white rounded-[1.5rem] transition-all duration-300 text-left bg-white dark:bg-zinc-950 group hover:shadow-lg"
                      >
                        <div className="flex gap-5 items-center min-w-0">
                          <div className="h-14 w-14 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                            <Package className="h-6 w-6 text-zinc-400 group-hover:text-zinc-950 dark:group-hover:text-white transition-colors" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-black text-zinc-900 dark:text-white truncate">{displayName}</p>
                            <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mt-1">
                              Order {shortId} · {purchaseDate}
                            </p>
                            <span className={`inline-block mt-2 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${STATUS_COLORS[order.status] ?? STATUS_COLORS.CANCELLED}`}>
                              {statusLabel}
                            </span>
                          </div>
                        </div>
                        <ChevronRight className="h-6 w-6 text-zinc-300 dark:text-zinc-700 group-hover:translate-x-1 group-hover:text-zinc-950 dark:group-hover:text-white transition-all shrink-0" />
                      </button>
                    );
                  })
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Slide-Out Drawer */}
      <AnimatePresence>
        {drawerType && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDrawerType(null)}
              className="fixed inset-0 bg-black/60 z-50 backdrop-blur-sm"
            />
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 200 }}
              className="fixed right-0 top-0 bottom-0 w-full max-w-lg bg-white/95 dark:bg-zinc-950/95 backdrop-blur-3xl shadow-[-20px_0_40px_rgba(0,0,0,0.1)] z-55 flex flex-col border-l border-white/20 dark:border-zinc-800/50"
            >
              <div className="p-6 border-b border-zinc-200/50 dark:border-zinc-800/50 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-900/30">
                <div className="flex items-center gap-4">
                  {drawerType === "chat" ? (
                    <div className="h-16 w-16 rounded-2xl overflow-hidden shadow-xl border border-white/20 shrink-0 bg-zinc-900 ring-2 ring-red-500/20">
                      <img src="/images/help_live_chat.png" alt="Support Chat" className="w-full h-full object-cover scale-115" />
                    </div>
                  ) : (
                    <div className="h-14 w-14 bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 rounded-2xl flex items-center justify-center shadow-lg shadow-zinc-900/10">
                      <HelpCircle className="h-6 w-6" />
                    </div>
                  )}
                  <div className="text-left">
                    <h3 className="font-black text-lg text-zinc-950 dark:text-white tracking-tight">
                      {drawerType === "article" && "Help Guide"}
                      {drawerType === "chat" && "Support Chat"}
                    </h3>
                    <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mt-0.5">
                      {drawerType === "article" && selectedArticle?.category}
                      {drawerType === "chat" && "Live Support Team"}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setDrawerType(null)}
                  className="h-10 w-10 rounded-full border border-zinc-200 dark:border-zinc-700 flex items-center justify-center text-zinc-400 hover:text-zinc-950 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-8 text-left">

                {/* Article View */}
                {drawerType === "article" && selectedArticle && (
                  <div>
                    <div className="prose prose-zinc dark:prose-invert max-w-none">
                      <h2 className="font-sans text-4xl font-black tracking-tighter text-zinc-950 dark:text-white mb-8 leading-[1.1]">
                        {selectedArticle.title}
                      </h2>
                      <div className="text-zinc-600 dark:text-zinc-400 text-sm md:text-base font-medium leading-relaxed space-y-6">
                        {selectedArticle.content.split("\n\n").map((para, i) => {
                          if (para.includes("**")) {
                            const parts = para.split("**");
                            return (
                              <p key={i} className="leading-relaxed">
                                {parts.map((p, idx) => idx % 2 === 1 ? <strong key={idx} className="text-zinc-950 dark:text-white font-black">{p}</strong> : p)}
                              </p>
                            );
                          }
                          if (para.startsWith("- ")) {
                            const lines = para.split("\n");
                            return (
                              <ul key={i} className="space-y-3 bg-zinc-50 dark:bg-zinc-900/50 p-6 rounded-[1.5rem] border border-zinc-100 dark:border-zinc-800/80">
                                {lines.map((line, idx) => {
                                  const clean = line.replace(/^- /, "");
                                  if (clean.includes("**")) {
                                    const parts = clean.split("**");
                                    return <li key={idx} className="flex gap-3"><span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0 mt-2" /><span>{parts.map((p, pIdx) => pIdx % 2 === 1 ? <strong key={pIdx} className="text-zinc-950 dark:text-white font-black">{p}</strong> : p)}</span></li>;
                                  }
                                  return <li key={idx} className="flex gap-3"><span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0 mt-2" />{clean}</li>;
                                })}
                              </ul>
                            );
                          }
                          if (/^[0-9]. /.test(para)) {
                            const lines = para.split("\n");
                            return (
                              <ol key={i} className="space-y-4">
                                {lines.map((line, idx) => {
                                  const match = line.match(/^([0-9]+)\. (.*)/);
                                  if (match) {
                                    const num = match[1];
                                    const txt = match[2];
                                    let contentNode = <>{txt}</>;
                                    if (txt.includes("**")) {
                                      const parts = txt.split("**");
                                      contentNode = <>{parts.map((p, pIdx) => pIdx % 2 === 1 ? <strong key={pIdx} className="text-zinc-950 dark:text-white font-black">{p}</strong> : p)}</>;
                                    }
                                    return (
                                      <li key={idx} className="flex gap-4 items-start">
                                        <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-950 dark:text-white font-black text-xs shrink-0 mt-0.5">{num}</span>
                                        <span>{contentNode}</span>
                                      </li>
                                    );
                                  }
                                  return <li key={idx}>{line}</li>;
                                })}
                              </ol>
                            );
                          }
                          return <p key={i} className="leading-relaxed">{para}</p>;
                        })}
                      </div>
                    </div>

                    {/* Was this helpful? */}
                    <div className="mt-10 pt-8 border-t border-zinc-100 dark:border-zinc-800">
                      {articleFeedback[selectedArticle.id] ? (
                        <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="h-4 w-4" />
                          <span className="text-sm font-bold">Thanks for your feedback!</span>
                        </div>
                      ) : (
                        <div>
                          <p className="text-xs font-black uppercase tracking-widest text-zinc-400 mb-3">Was this article helpful?</p>
                          <div className="flex gap-2">
                            <button
                              onClick={() => setArticleFeedback(prev => ({ ...prev, [selectedArticle.id]: "up" }))}
                              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 hover:border-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 hover:text-emerald-600 dark:hover:text-emerald-400 text-zinc-500 transition-all text-xs font-bold"
                            >
                              <ThumbsUp className="h-3.5 w-3.5" /> Yes, helpful
                            </button>
                            <button
                              onClick={() => setArticleFeedback(prev => ({ ...prev, [selectedArticle.id]: "down" }))}
                              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 hover:border-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 hover:text-red-600 dark:hover:text-red-400 text-zinc-500 transition-all text-xs font-bold"
                            >
                              <ThumbsDown className="h-3.5 w-3.5" /> Not really
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Related Articles */}
                    {getRelatedArticles(selectedArticle).length > 0 && (
                      <div className="mt-8">
                        <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-3">Related articles</p>
                        <div className="space-y-2">
                          {getRelatedArticles(selectedArticle).map(rel => (
                            <button
                              key={rel.id}
                              onClick={() => setSelectedArticle(rel)}
                              className="w-full flex items-center justify-between p-4 rounded-xl bg-zinc-50 dark:bg-zinc-900/60 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 border border-zinc-100 dark:border-zinc-800/80 transition-all group/rel text-left"
                            >
                              <span className="text-sm font-bold text-zinc-700 dark:text-zinc-300 group-hover/rel:text-zinc-950 dark:group-hover/rel:text-white">{rel.title}</span>
                              <ChevronRight className="h-4 w-4 text-zinc-300 dark:text-zinc-600 group-hover/rel:text-red-500 group-hover/rel:translate-x-0.5 transition-all shrink-0" />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Still need help? */}
                    <div className="mt-8 p-5 rounded-2xl bg-zinc-950 dark:bg-zinc-900 border border-zinc-800 flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-black text-white mb-1">Still need help?</p>
                        <p className="text-xs text-zinc-400 font-semibold mb-3">Our support team typically responds within 24 hours.</p>
                        <button
                          onClick={() => setDrawerType("chat")}
                          className="flex items-center gap-2 px-4 py-2 bg-white text-zinc-950 rounded-xl text-xs font-black uppercase tracking-wider hover:bg-zinc-200 transition-colors"
                        >
                          <MessageCircle className="h-3.5 w-3.5" /> Start Live Chat
                        </button>
                      </div>
                      <div className="h-16 w-16 rounded-xl overflow-hidden shrink-0 border border-white/10 shadow-md bg-zinc-800 hidden sm:block">
                        <img src="/images/help_live_chat.png" alt="Live Chat" className="w-full h-full object-cover" />
                      </div>
                    </div>
                  </div>
                )}

                {/* Live Chat */}
                {drawerType === "chat" && (
                  <div className="flex flex-col h-full">

                    {chatStep === "form" && (
                      <form onSubmit={handleStartChat} className="space-y-4 max-w-sm mx-auto pt-4">
                        <div className="text-center mb-6">
                          <div className="relative w-20 h-20 mx-auto mb-3 rounded-2xl overflow-hidden shadow-xl border border-white/10 bg-zinc-900 group">
                            <img
                              src="/images/help_live_chat.png"
                              alt="Live Support"
                              className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                            />
                          </div>
                          <h3 className="font-extrabold text-zinc-950 dark:text-white text-xl">Start a live chat</h3>
                          <p className="text-zinc-500 dark:text-zinc-400 text-xs mt-1 font-semibold">Our team typically responds within 24 hours.</p>
                        </div>
                        {chatOrderRef && (
                          <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700">
                            <Package className="h-4 w-4 text-zinc-500 shrink-0" />
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Order Reference</p>
                              <p className="text-sm font-bold text-zinc-900 dark:text-white">{chatOrderRef}</p>
                            </div>
                          </div>
                        )}
                        <div>
                          <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300 block mb-1.5">Your name *</label>
                          <input
                            value={chatName}
                            onChange={e => setChatName(e.target.value)}
                            placeholder="e.g. Sarah"
                            required
                            className="w-full h-11 px-4 rounded-xl border-2 border-zinc-200 dark:border-zinc-700 focus:border-accent dark:focus:border-accent bg-white dark:bg-zinc-800 text-foreground outline-none text-sm transition-colors"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300 block mb-1.5">Email <span className="text-zinc-400 font-normal">(optional)</span></label>
                          <input
                            value={chatEmail}
                            onChange={e => setChatEmail(e.target.value)}
                            placeholder="you@example.com"
                            type="email"
                            className="w-full h-11 px-4 rounded-xl border-2 border-zinc-200 dark:border-zinc-700 focus:border-accent dark:focus:border-accent bg-white dark:bg-zinc-800 text-foreground outline-none text-sm transition-colors"
                          />
                        </div>
                        <button
                          type="submit"
                          disabled={chatStarting || !chatName.trim()}
                          className="w-full h-12 bg-accent text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-accent-dark transition-colors disabled:opacity-50"
                        >
                          {chatStarting ? <><RefreshCw className="h-4 w-4 animate-spin" /> Connecting…</> : <>Start Chat <ArrowRight className="h-4 w-4" /></>}
                        </button>
                      </form>
                    )}

                    {chatStep === "chat" && (
                      <>
                        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-zinc-100 dark:border-zinc-800">
                          <Circle className={`h-2 w-2 ${chatConnected ? "fill-emerald-500 text-emerald-500" : "fill-zinc-300 text-zinc-300"}`} />
                          <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                            {chatConnected ? "Connected · Support team will respond shortly" : "Connecting…"}
                          </span>
                        </div>
                        <div className="flex-1 overflow-y-auto space-y-4 pr-1 overscroll-contain touch-pan-y">
                          {chatMessages.map((msg, i) => {
                            const isCustomer = msg.sender === "customer";
                            const body = msg.body ?? msg.text ?? "";
                            return (
                              <div key={msg.id ?? i} className={`flex ${isCustomer ? "justify-end" : "justify-start"}`}>
                                <div className={`flex gap-3 max-w-[85%] ${isCustomer ? "flex-row-reverse" : "flex-row"}`}>
                                  <div className="h-8 w-8 rounded-full overflow-hidden shrink-0 border border-white/10 shadow-sm bg-zinc-800 flex items-center justify-center text-xs font-black text-white">
                                    {isCustomer ? (
                                      <User className="h-4 w-4" />
                                    ) : (
                                      <img src="/images/help_live_chat.png" alt="TS" className="w-full h-full object-cover" />
                                    )}
                                  </div>
                                  <div className={`p-4 rounded-2xl text-xs md:text-sm font-semibold leading-relaxed ${isCustomer ? "bg-black dark:bg-zinc-800 text-white rounded-tr-none" : "bg-zinc-100 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 rounded-tl-none border border-zinc-200 dark:border-zinc-800"}`}>
                                    {body}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                          <div ref={chatEndRef} />
                        </div>
                        <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800 flex gap-2">
                          <input
                            type="text"
                            value={chatInput}
                            onChange={e => setChatInput(e.target.value)}
                            onKeyDown={e => e.key === "Enter" && handleSendChat()}
                            placeholder="Type a message…"
                            className="flex-1 h-12 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 px-4 text-xs font-bold text-zinc-800 dark:text-zinc-200 rounded-xl outline-none focus:bg-white focus:dark:bg-zinc-900 focus:border-accent transition-all"
                          />
                          <button
                            onClick={handleSendChat}
                            disabled={!chatInput.trim()}
                            className="h-12 w-12 bg-accent hover:bg-accent-dark text-white rounded-xl flex items-center justify-center transition-colors shrink-0 disabled:opacity-40"
                          >
                            <Send className="h-4 w-4" />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}

              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <Footer />
    </div>
  );
}
