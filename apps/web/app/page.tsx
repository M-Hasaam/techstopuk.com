"use client";

import React, { useState, useEffect, useRef } from "react";

// Custom hook to trigger lazy fetching and auto-refetching on browser back-button navigation (bfcache)
function useLazyFetchTrigger() {
  const ref = useRef<HTMLElement | null>(null);
  const [trigger, setTrigger] = useState(0);
  const isIntersected = useRef(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !isIntersected.current) {
          isIntersected.current = true;
          setTrigger(prev => prev + 1);
        }
      },
      { rootMargin: "200px" }
    );

    const currentRef = ref.current;
    if (currentRef) {
      observer.observe(currentRef);
    }

    const handlePageShow = (e: PageTransitionEvent) => {
      if (e.persisted && isIntersected.current) {
        setTrigger(prev => prev + 1);
      }
    };
    window.addEventListener("pageshow", handlePageShow);

    return () => {
      window.removeEventListener("pageshow", handlePageShow);
      if (currentRef) {
        observer.unobserve(currentRef);
      }
    };
  }, []);

  return [ref, trigger] as const;
}

// ─── Reusable Scroll Buttons ──────────────────────────────────────────────────
function ScrollButtons({ scrollRef }: { scrollRef: React.RefObject<HTMLElement | null> }) {
  const scroll = (dir: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    const amount = el.clientWidth * 0.75;
    el.scrollBy({ left: dir === "right" ? amount : -amount, behavior: "smooth" });
  };
  return (
    <div className="flex items-center gap-3">
      <button
        onClick={() => scroll("left")}
        aria-label="Scroll left"
        className="h-10 w-10 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-500 hover:text-zinc-950 flex items-center justify-center transition-all duration-200 shadow-sm hover:shadow-md flex-shrink-0"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <button
        onClick={() => scroll("right")}
        aria-label="Scroll right"
        className="h-10 w-10 rounded-full bg-zinc-950 hover:bg-zinc-800 text-white flex items-center justify-center transition-all duration-200 shadow-sm hover:shadow-md flex-shrink-0"
      >
        <ChevronRight className="h-5 w-5" />
      </button>
    </div>
  );
}

import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ShoppingCart, ShieldCheck, RefreshCw, Leaf, ArrowRight,
  Star, Search, Play, Recycle, TrendingUp, Package, BadgeCheck,
  Zap, Check, Smartphone, Laptop, Headphones, Gamepad2, Tablet,
  ChevronLeft, ChevronRight, MapPin, Clock, Phone, Bell, Wrench
} from "lucide-react";
import dynamic from "next/dynamic";
import NextImage from "next/image";
import { productsApi, reviewsApi, bannersApi, catalogApi, storesApi, type Store } from "../lib/api";
import type { CatalogBrand } from "../lib/api";
import { getGradeConfig } from "../lib/grades";
import { GradeBadge } from "../components/GradeBadge";
import DeviceSearchBox from "../components/DeviceSearchBox";
import { useCart } from "../context/cart-context";
import ProductImage from "../components/ProductImage";
import { isOtherProduct } from "../lib/other-categories";
import LogoLoop from "../components/LogoLoop";
import { BRAND_SVGS, getSubcategoryIcon } from "../lib/brand-logos";
const Footer = dynamic(() => import("../components/Footer"));

// ─── Promo Carousel Banner ───────────────────────────────────────────────────
const DEFAULT_PROMO_SLIDES: import('../lib/api').PromoSlide[] = [
  {
    id: "default-1",
    order: 0,
    isActive: true,
    imgUrl: "/hero/trade_in_user_gen.jpg",
    tabTitle: "Sell & Trade-In",
    tag: "Instant Valuation",
    titleLine1: "WE BUY TECH",
    titleLine2: "FOR CASH",
    titleItalic: "instantly.",
    title: "WE BUY TECH FOR CASH instantly.",
    subtitle: "Trade in your old smartphones, MacBooks, or gaming consoles for instant cash. Best price match guaranteed with free insured shipping.",
    badgeA: "Instant Payout",
    badgeB: "Best Price Match",
    specs: ["Instant Quote", "Free Insured Shipping", "Best Price Match"],
    themeColor: "from-amber-500 to-orange-600",
    bgGlow: "rgba(245, 158, 11, 0.15)",
    btnText: "Get Cash Quote",
    btnLink: "/trade-in",
  },
  {
    id: "default-2",
    order: 1,
    isActive: true,
    imgUrl: "/hero/image.jpg",
    tabTitle: "Upgrade iPhone",
    tag: "Featured Promotion",
    titleLine1: "UPGRADE YOUR",
    titleLine2: "IPHONE",
    titleItalic: "for less.",
    title: "UPGRADE YOUR IPHONE for less.",
    subtitle: "Get pristine, certified refurbished iPhones with a full 12-month warranty. Rigorously tested by in-house technicians.",
    badgeA: "Pristine Grade",
    badgeB: "Save up to 40%",
    specs: ["12-Month Warranty", "Pristine Condition", "Save up to 40%"],
    themeColor: "from-blue-500 to-indigo-600",
    bgGlow: "rgba(59, 130, 246, 0.15)",
    btnText: "Shop Refurbished",
    btnLink: "/shop/phones",
  },
  {
    id: "default-3",
    order: 2,
    isActive: true,
    imgUrl: "/hero/trade_in_user_gen.jpg",
    tabTitle: "Expert Repairs",
    tag: "Certified Technicians",
    titleLine1: "BOOK A DEVICE",
    titleLine2: "REPAIR",
    titleItalic: "today.",
    title: "BOOK A DEVICE REPAIR today.",
    subtitle: "Professional screen, battery, and diagnostic replacements. Express turnaround times using OEM-grade parts with warranty included.",
    badgeA: "OEM Grade Parts",
    badgeB: "Same-Day Fix",
    specs: ["Express Screen Fix", "OEM Grade Parts", "Repair Warranty"],
    themeColor: "from-emerald-500 to-teal-600",
    bgGlow: "rgba(16, 185, 129, 0.15)",
    btnText: "Book Repair",
    btnLink: "/repair",
  },
  {
    id: "default-4",
    order: 3,
    isActive: true,
    imgUrl: "/hero/image.jpg",
    tabTitle: "Fast Shipping",
    tag: "Express Shipping",
    titleLine1: "FREE NEXT-DAY",
    titleLine2: "DELIVERY",
    titleItalic: "as standard.",
    title: "FREE NEXT-DAY DELIVERY as standard.",
    subtitle: "Get your tech delivered straight to your door. Free next-day secure courier shipping on all orders.",
    badgeA: "Free Next-Day",
    badgeB: "Secure Dispatch",
    specs: ["Free Secure Courier", "Next-Day Delivery", "Dispatched by 2pm"],
    themeColor: "from-purple-500 to-fuchsia-600",
    bgGlow: "rgba(168, 85, 247, 0.15)",
    btnText: "Shop All Tech",
    btnLink: "/shop",
  },
];

function PromoCarouselBanner() {
  const [idx, setIdx] = useState(0);
  const [slides, setSlides] = useState<import('../lib/api').PromoSlide[]>(DEFAULT_PROMO_SLIDES);
  const tabContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bannersApi.promoSlides()
      .then((data) => {
        if (data && data.length > 0) {
          setSlides(data);
        }
      })
      .catch(() => { });
  }, []);

  const safeIdx = slides.length > 0 ? idx % slides.length : 0;

  useEffect(() => {
    if (slides.length <= 1) return;
    const timer = setInterval(() => {
      setIdx((prev) => (prev + 1) % slides.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [slides.length]);

  // Auto-scroll active tab into view
  useEffect(() => {
    if (!tabContainerRef.current) return;
    const container = tabContainerRef.current;
    const activeTab = container.querySelector('[data-active="true"]') as HTMLElement;
    if (activeTab) {
      const containerWidth = container.clientWidth;
      const tabWidth = activeTab.offsetWidth;
      const tabLeft = activeTab.offsetLeft;
      const targetScrollLeft = tabLeft - (containerWidth / 2) + (tabWidth / 2);

      container.scrollTo({
        left: targetScrollLeft,
        behavior: "smooth"
      });
    }
  }, [safeIdx]);

  if (slides.length === 0) return null;

  const slide = slides[safeIdx];
  const displayIndex = String(slide.order + 1).padStart(2, "0");

  return (
    <section
      className="w-full h-[80svh] lg:min-h-[75vh] bg-zinc-950 relative overflow-hidden flex flex-col justify-between pt-[80px] pb-8 lg:pt-[100px] lg:pb-12"
    >
      {/* Background Images */}
      <div className="absolute inset-0 z-0">
        {slides.map((s, i) => {
          const isActive = safeIdx === i;
          // Only render active or immediately adjacent slide on DOM to keep mobile memory/network payload near 0
          const isAdjacent = Math.abs(safeIdx - i) <= 1 || (safeIdx === 0 && i === slides.length - 1);
          if (!isActive && !isAdjacent) return null;

          return s.imgUrl ? (
            <motion.div
              key={s.id}
              aria-hidden={!isActive}
              className="absolute inset-0 h-full w-full"
              initial={false}
              animate={isActive ? { opacity: 1, scale: 1.05 } : { opacity: 0, scale: 1 }}
              transition={isActive ? { opacity: { duration: 0.6 }, scale: { duration: 5, ease: "linear" } } : { opacity: { duration: 0.4 }, scale: { duration: 0 } }}
            >
              <NextImage
                src={s.imgUrl}
                alt={s.tabTitle}
                fill
                priority={i === 0}
                quality={80}
                sizes="(max-width: 768px) 100vw, 100vw"
                className="object-cover"
              />
            </motion.div>
          ) : null;
        })}
        {/* Overlay for text legibility */}
        <div className="absolute inset-0 bg-gradient-to-r from-zinc-950 via-zinc-950/90 to-zinc-950/60 lg:to-zinc-950/30" />
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-transparent to-transparent" />
      </div>

      {/* Background Grid Pattern */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.05] z-[1]" style={{ backgroundImage: 'linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)', backgroundSize: '40px 40px', WebkitMaskImage: 'linear-gradient(to bottom, black calc(100% - 2px), transparent 100%)', maskImage: 'linear-gradient(to bottom, black calc(100% - 2px), transparent 100%)' }} />

      {/* Main Showcase Stage */}
      <div className="mx-auto w-full max-w-[1500px] px-4 sm:px-6 lg:px-12 flex-1 flex items-center relative z-10">
        <div className="w-full max-w-2xl lg:max-w-4xl flex flex-col gap-4 items-start text-left relative">

          {/* Giant outlined index number in the background */}
          <div className="absolute -top-8 sm:-top-16 lg:-top-20 -left-4 sm:-left-10 text-[6rem] sm:text-[12rem] lg:text-[18rem] font-sans font-black select-none pointer-events-none leading-none tracking-tighter text-white/5">
            {displayIndex}
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={safeIdx}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
              className="flex flex-col gap-8 sm:gap-8 items-start relative z-10 w-full"
            >
              <h1 className="font-sans text-[2.25rem] sm:text-5xl lg:text-[clamp(3.5rem,4.2vw,5.5rem)] font-black leading-[1.05] sm:leading-[0.95] lg:leading-[0.88] tracking-tight text-white uppercase drop-shadow-[0_2px_24px_rgba(0,0,0,0.5)]">
                {slide.titleLine1} <br className="hidden sm:block" />
                {slide.titleLine2}{" "}
                <span className="font-sans font-black text-red-500">
                  {slide.titleItalic}
                </span>
              </h1>

              {slide.subtitle && (
                <p className="max-w-[310px] sm:max-w-md lg:max-w-xl text-[14px] sm:text-lg lg:text-xl font-medium text-white/80 leading-relaxed sm:leading-snug">
                  {slide.subtitle}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-3 sm:gap-4 mt-4 sm:mt-4 w-full">
                <Link
                  href={slide.btnLink === "/sell" ? "/trade-in" : slide.btnLink}
                  className="group relative inline-flex h-11 sm:h-12 px-6 sm:px-8 items-center justify-center bg-white text-zinc-950 rounded-xl sm:rounded-2xl font-bold text-xs overflow-hidden transition-all hover:scale-105 active:scale-95 shadow-[0_10px_20px_rgba(0,0,0,0.3)] cursor-pointer"
                >
                  <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-red-600 to-red-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                  <span className="relative z-10 flex items-center gap-2 group-hover:text-white transition-colors duration-300">
                    {slide.btnText}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </Link>

                <Link
                  href="/trade-in"
                  className="inline-flex h-11 sm:h-12 px-5 sm:px-6 items-center justify-center rounded-xl sm:rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 text-white hover:bg-white/20 transition-all font-bold text-xs shadow-sm active:scale-95"
                >
                  How it Works
                </Link>
              </div>
            </motion.div>
          </AnimatePresence>

        </div>
      </div>

      {/* Bottom Floating Navigation Dock */}
      <div className="mx-auto w-full max-w-[1500px] px-4 sm:px-6 lg:px-12 mt-6 lg:mt-8 relative z-20">
        <div className="flex justify-center">

          {/* Mobile Dots Pagination */}
          <div className="lg:hidden flex items-center gap-2.5 p-2 rounded-full bg-black/30 backdrop-blur-md">
            {slides.map((s, i) => {
              const isActive = safeIdx === i;
              return (
                <button
                  key={s.id}
                  onClick={() => setIdx(i)}
                  className={`h-2 rounded-full transition-all duration-300 ${isActive ? "w-6 bg-white" : "w-2 bg-white/50"
                    }`}
                  aria-label={`Go to slide ${i + 1}`}
                />
              );
            })}
          </div>

          {/* Desktop Pill Navigation */}
          <div
            ref={tabContainerRef}
            className="hidden lg:flex items-center gap-2 p-2 rounded-[2rem] bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl border border-white dark:border-zinc-800 shadow-xl"
          >
            {slides.map((s, i) => {
              const isActive = safeIdx === i;
              return (
                <button
                  key={s.id}
                  onClick={() => setIdx(i)}
                  data-active={isActive}
                  className={`relative flex items-center gap-2 px-4 h-11 rounded-2xl transition-all duration-500 cursor-pointer whitespace-nowrap flex-shrink-0 ${isActive
                    ? "bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 shadow-lg font-black"
                    : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white hover:bg-zinc-100/80 dark:hover:bg-zinc-800/80 font-bold"
                    }`}
                >
                  <span className={`text-[10px] tracking-widest ${isActive ? "opacity-60" : "text-zinc-400 dark:text-zinc-500"}`}>
                    {String(s.order + 1).padStart(2, "0")}
                  </span>

                  <span className="text-xs tracking-tight">
                    {s.tabTitle}
                  </span>

                  {isActive && (
                    <div className="absolute bottom-1 left-3 right-3 h-0.5 rounded-full overflow-hidden bg-white/20 dark:bg-black/10">
                      <motion.div
                        key={safeIdx}
                        initial={{ width: "0%" }}
                        animate={{ width: "100%" }}
                        transition={{ duration: 5, ease: "linear" }}
                        className="h-full bg-red-500"
                      />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}


// ─── Marquee Strip ────────────────────────────────────────────────────────────
function MarqueeStrip() {
  const items = [
    "12-Month Warranty", "Free 30-Day Returns", "Expert Certified",
    "Carbon Neutral Shipping", "25-Point Inspection", "Price Match Promise",
    "47,000+ Devices In Stock", "Same-Day Dispatch Before 2pm",
    "12-Month Warranty", "Free 30-Day Returns", "Expert Certified",
    "Carbon Neutral Shipping", "25-Point Inspection", "Price Match Promise",
    "47,000+ Devices In Stock", "Same-Day Dispatch Before 2pm",
  ];
  return (
    <div className="relative z-20 bg-zinc-950 overflow-hidden py-3.5 -mt-[1px]">
      <div className="flex gap-0 animate-marquee whitespace-nowrap w-max" style={{ animationDuration: '90s' }}>
        {items.map((item, i) => (
          <span key={i} className="inline-flex items-center gap-8 px-6 text-[11px] font-bold uppercase tracking-[0.18em] text-white/50">
            {item}
            <span className="h-1 w-1 rounded-full bg-accent flex-shrink-0" />
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Brands Bar ───────────────────────────────────────────────────────────────
// Category icon lookup — falls back to Package for anything unmapped (e.g. "Others").
const CATEGORY_ICONS: Record<string, typeof Smartphone> = {
  phones: Smartphone,
  laptops: Laptop,
  gaming: Gamepad2,
  tablets: Tablet,
  audio: Headphones,
};

const DEFAULT_CATEGORIES: import('../lib/api').CatalogCategory[] = [
  { id: 'cat-phones', name: 'Phones', displayName: 'Phones', slug: 'phones', isActive: true, isSellable: true, isRepairable: true, productCount: 1250, minPrice: 99, modelCount: 50, images: [], createdAt: '', updatedAt: '' },
  { id: 'cat-laptops', name: 'Laptops', displayName: 'Laptops', slug: 'laptops', isActive: true, isSellable: true, isRepairable: true, productCount: 450, minPrice: 249, modelCount: 30, images: [], createdAt: '', updatedAt: '' },
  { id: 'cat-gaming', name: 'Gaming', displayName: 'Gaming', slug: 'gaming', isActive: true, isSellable: true, isRepairable: true, productCount: 680, minPrice: 120, modelCount: 20, images: [], createdAt: '', updatedAt: '' },
  { id: 'cat-tablets', name: 'Tablets', displayName: 'Tablets', slug: 'tablets', isActive: true, isSellable: true, isRepairable: true, productCount: 320, minPrice: 140, modelCount: 15, images: [], createdAt: '', updatedAt: '' },
];

function CategoryQuickNav() {
  const [categories, setCategories] = useState<import('../lib/api').CatalogCategory[]>(DEFAULT_CATEGORIES);

  useEffect(() => {
    catalogApi.listCategories()
      .then(res => {
        if (res && res.length > 0) {
          setCategories(res.filter(c => c.isActive && c.isSellable).sort((a, b) => (b.productCount ?? 0) - (a.productCount ?? 0)));
        }
      })
      .catch(() => { });
  }, []);

  if (categories.length === 0) return null;

  const formatCount = (n: number) => {
    if (n === 0) return null;
    if (n >= 1000) return `${(n / 1000).toFixed(1).replace('.0', '')}K+ items`;
    return `${n}+ items`;
  };

  const logos = categories.map((c) => {
    const count = formatCount(c.productCount);
    const Icon = CATEGORY_ICONS[c.slug] ?? Package;

    return {
      ariaLabel: c.displayName || c.name,
      node: (
        <div className="flex items-center gap-6 lg:gap-10">
          <Link href={`/shop/${c.slug}`} className="flex items-center gap-3 lg:gap-4 cursor-pointer">
            <Icon className="h-6 w-6 lg:h-8 lg:w-8 text-accent drop-shadow-sm" strokeWidth={2} />
            <div className="flex items-baseline gap-2">
              <span className="text-2xl lg:text-3xl font-black text-zinc-400 dark:text-zinc-600 uppercase">
                {c.displayName || c.name}
              </span>
              {count && (
                <span className="text-xs lg:text-sm font-bold text-accent/60 uppercase tracking-widest">
                  {count}
                </span>
              )}
            </div>
          </Link>
          {/* Colorful minimal separator */}
          <span className="text-2xl lg:text-3xl font-black text-accent/20">/</span>
        </div>
      ),
    };
  });

  return (
    <section className="border-y border-zinc-200 dark:border-zinc-800 py-1.5 lg:py-2 bg-white dark:bg-zinc-950 overflow-hidden">
      <LogoLoop
        logos={logos}
        speed={30}
        direction="right"
        logoHeight={56}
        gap={40}
        ariaLabel="Shop by category"
      />
    </section>
  );
}



// ─── Trade-In CTA Section ──────────────────────────────────────────────────


function TradeInCTASection() {
  const router = useRouter();

  return (
    <section className="relative min-h-[60vh] lg:min-h-[auto] flex items-center py-12 lg:py-14 font-sans w-full">
      {/* Background photo — shown in full, no wash */}
      <div className="absolute inset-0 z-0 overflow-hidden">
        <style>{`
          @media (min-width: 1024px) {
            .cinematic-pan {
              animation: cinematicPan 20s ease-in-out infinite;
            }
          }
          @keyframes cinematicPan {
            0% { transform: scale(1) translate(0, 0); }
            50% { transform: scale(1.05) translate(-1%, -1%); }
            100% { transform: scale(1) translate(0, 0); }
          }
        `}</style>
        <NextImage
          src="/hero/trade_in_user_gen.jpg"
          alt="TechStop Trade-In"
          fill
          priority
          quality={82}
          sizes="(max-width: 768px) 100vw, 100vw"
          className="object-cover object-right lg:object-center brightness-75 cinematic-pan"
        />
        <div className="absolute inset-0 bg-zinc-950/60 lg:bg-zinc-950/30" />
      </div>

      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="max-w-md sm:max-w-lg flex flex-col items-start text-left relative">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/40 backdrop-blur-md text-white border border-white/20 text-[10px] font-black uppercase tracking-widest mb-4 shadow-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            TechStop Trade-In
          </span>

          <h2 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tight text-white leading-tight mb-3 drop-shadow-lg">
            Sell your old tech. <br />
            <span className="text-accent drop-shadow-lg">Get cash in 48 hours.</span>
          </h2>

          <p className="text-white/90 text-xs sm:text-sm md:text-base font-semibold leading-relaxed mb-5 sm:mb-6 drop-shadow-md">
            We pay premium market rates for used smartphones, laptops, tablets, and gaming consoles. Trade in online with free insured Royal Mail shipping or drop off in-store.
          </p>

          <DeviceSearchBox
            className="w-full"
            placeholder="Trade in your device (e.g. iPhone 15, PS5...)"
            showSearchButton
            buttonText="Trade In"
            onSelect={(sug) => router.push(
              `/trade-in?brand=${encodeURIComponent(sug.brand)}&model=${encodeURIComponent(sug.name)}&category=${encodeURIComponent(sug.category)}`
            )}
            onManualEntry={(q) => router.push(`/trade-in?cat=Other&q=${encodeURIComponent(q)}`)}
            onSubmit={(q) => router.push(q.trim() ? `/trade-in?cat=Other&q=${encodeURIComponent(q)}` : `/trade-in`)}
          />
        </div>
      </div>
    </section>
  );
}

const DEFAULT_BENTO_CATEGORIES: import('../lib/api').CatalogCategory[] = [
  { id: 'bento-1', name: 'Smartphones', displayName: 'Smartphones', slug: 'phones', isActive: true, isSellable: true, isRepairable: true, productCount: 1250, minPrice: 99, modelCount: 50, images: [], createdAt: '', updatedAt: '' },
  { id: 'bento-2', name: 'Laptops & MacBooks', displayName: 'Laptops', slug: 'laptops', isActive: true, isSellable: true, isRepairable: true, productCount: 450, minPrice: 249, modelCount: 30, images: [], createdAt: '', updatedAt: '' },
  { id: 'bento-3', name: 'Gaming Consoles', displayName: 'Gaming', slug: 'gaming', isActive: true, isSellable: true, isRepairable: true, productCount: 680, minPrice: 120, modelCount: 20, images: [], createdAt: '', updatedAt: '' },
  { id: 'bento-4', name: 'Tablets & iPads', displayName: 'Tablets', slug: 'tablets', isActive: true, isSellable: true, isRepairable: true, productCount: 320, minPrice: 140, modelCount: 15, images: [], createdAt: '', updatedAt: '' },
];

function CategoryBento() {
  const [categories, setCategories] = useState<import('../lib/api').CatalogCategory[]>(DEFAULT_BENTO_CATEGORIES);

  useEffect(() => {
    catalogApi.listCategories()
      .then(cats => {
        if (cats && cats.length > 0) {
          const mainCats = cats.filter(c => c.isSellable).slice(0, 6);
          if (mainCats.length > 0) {
            setCategories(mainCats);
          }
        }
      })
      .catch(() => { });
  }, []);

  if (categories.length === 0) return null;

  const formatCount = (n: number) => {
    if (n >= 1000) return `${(n / 1000).toFixed(1).replace('.0', '')}K+ devices`;
    return `${n}+ devices`;
  };

  const firstSlug = categories[0]?.slug ?? 'phones';

  return (
    <section className="bg-white border-y border-zinc-100 py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-end justify-between mb-8">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-400 mb-2.5">Browse by tech</p>
            <h2 className="font-sans text-3xl md:text-4xl lg:text-5xl font-extrabold text-zinc-950 tracking-tight leading-none">
              Pick your category
            </h2>
          </div>
          <a href={`/shop/${firstSlug}`} className="hidden md:flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-zinc-500 hover:text-zinc-950 transition-colors border-b border-zinc-300 pb-1">
            All categories <ArrowRight className="h-3.5 w-3.5" />
          </a>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 lg:grid-rows-2 gap-5 h-auto lg:h-[450px]">
          {categories.map((cat, i) => {
            const sub = cat.minPrice != null ? `From £${Math.floor(cat.minPrice)}` : null;
            const count = formatCount(cat.productCount);
            return (
              <motion.a
                href={`/shop/${cat.slug}`}
                key={cat.id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                className={`group relative overflow-hidden rounded-[2rem] bg-zinc-100 cursor-pointer border border-zinc-200/50 hover:border-zinc-300 hover:shadow-2xl transition-all duration-500 ${i === 0 ? "col-span-2 lg:col-span-2 lg:row-span-2 h-[260px] sm:h-[320px] lg:h-auto" : "h-[180px] sm:h-[220px] lg:h-auto"}`}
              >
                {cat.image && (
                  <ProductImage
                    src={cat.image}
                    alt={cat.name}
                    mode="cover"
                    className="transition-transform duration-1000 ease-out"
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  />
                )}
                {/* Double-sided gradient mask for readability */}
                <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/10 to-transparent opacity-90 group-hover:opacity-95 transition-opacity duration-300" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent opacity-85" />

                {/* Inner border glow */}
                <div className="absolute inset-0 ring-1 ring-inset ring-white/10 rounded-[2rem] z-10" />

                {/* Floating arrow bottom-right */}
                <div className="absolute bottom-6 right-6 h-10 w-10 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-white translate-x-2 opacity-0 group-hover:translate-x-0 group-hover:opacity-100 transition-all duration-300 z-20">
                  <ArrowRight className="h-5 w-5 text-white" />
                </div>

                {/* Text and Glass Badge top-left */}
                <div className="absolute top-6 left-6 z-10 flex flex-col items-start">
                  <span className="text-[9px] font-bold tracking-[0.15em] text-white/60 uppercase mb-1.5">{count}</span>
                  <h3 className="text-xl md:text-2xl lg:text-3xl font-extrabold text-white tracking-tight leading-none mb-3">
                    {cat.name}
                  </h3>
                  {sub && (
                    <span className="inline-flex items-center px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/15 text-[10px] font-bold text-white tracking-wider uppercase">
                      {sub}
                    </span>
                  )}
                </div>
              </motion.a>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ─── Trust Pillars ────────────────────────────────────────────────────────────
function TrustPillars() {
  const pillars = [
    { icon: ShieldCheck, title: "12-month warranty", body: "All devices come with a full year of coverage, no questions asked.", color: "bg-emerald-50 text-emerald-600" },
    { icon: RefreshCw, title: "30-day free returns", body: "Changed your mind? Ship it back within 30 days, completely free.", color: "bg-sky-50 text-sky-600" },
    { icon: BadgeCheck, title: "25-point inspection", body: "Certified experts test every single device before it ships to you.", color: "bg-violet-50 text-violet-600" },
  ];

  return (
    <section className="bg-zinc-950 py-12 md:py-16 overflow-hidden">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8 md:mb-10 max-w-xl">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-400 mb-2.5">Our promise</p>
          <h2 className="font-sans text-3xl md:text-4xl lg:text-5xl font-extrabold text-white leading-tight tracking-tight">
            Built on trust, backed by proof
          </h2>
        </div>

        <div className="group flex md:grid md:grid-cols-3 gap-4 md:gap-px bg-transparent md:bg-zinc-800 overflow-hidden pb-6 -mx-4 px-4 sm:-mx-6 sm:px-6 md:mx-0 md:px-0 md:pb-0 scrollbar-hide">
          <div className="flex md:contents gap-4 sm:gap-6 w-max animate-marquee md:animate-none group-hover:[animation-play-state:paused]">
            {[...pillars, ...pillars].map((p, i) => (
              <div
                key={i}
                className={`bg-zinc-950 p-6 sm:p-7 hover:bg-zinc-900 transition-colors flex-none w-[75vw] sm:w-[320px] md:w-auto rounded-[2rem] md:rounded-none border border-zinc-800/80 md:border-none ${i >= pillars.length ? 'md:hidden' : ''}`}
              >
                <div className={`h-10 w-10 md:h-9 md:w-9 rounded-xl ${p.color} flex items-center justify-center mb-5 md:mb-4`}>
                  <p.icon className="h-5 w-5 md:h-5 md:w-5" />
                </div>
                <h3 className="font-bold text-white text-lg md:text-base mb-2 md:mb-1.5 leading-tight">{p.title}</h3>
                <p className="text-sm md:text-xs text-zinc-400 leading-relaxed md:leading-normal">{p.body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Trending Deals ───────────────────────────────────────────────────────────
function TrendingDeals() {
  const [apiProducts, setApiProducts] = useState<any[]>([]);
  const [sectionRef, trigger] = useLazyFetchTrigger();

  useEffect(() => {
    if (trigger === 0) return;
    productsApi.list({ limit: 8 }).then(r => setApiProducts(r.items)).catch(() => { });
  }, [trigger]);

  const featured = apiProducts[0] ?? null;
  const secondary = apiProducts.slice(1, 5);

  return (
    <section ref={sectionRef} className="py-24 overflow-hidden min-h-[200px]">
      {featured && (
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-end justify-between mb-8">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-400 mb-2.5">Hot right now</p>
              <h2 className="font-sans text-3xl md:text-4xl lg:text-5xl font-extrabold text-zinc-950 tracking-tight leading-none">
                Trending deals
              </h2>
            </div>
            <a href="/shop/phones" className="hidden md:flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-zinc-500 hover:text-zinc-950 transition-colors border-b border-zinc-300 pb-1">
              See all <ArrowRight className="h-3.5 w-3.5" />
            </a>
          </div>

          {/* Asymmetric layout: large featured + right scroll-track */}
          <div className="grid lg:grid-cols-[1fr_1fr] gap-5">

            {/* Featured — large portrait card */}
            <motion.a
              href={`/shop/${featured.category.toLowerCase()}/${featured.slug}`}
              initial={{ opacity: 0, x: -24 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ type: "spring", stiffness: 220, damping: 26 }}
              className="group relative overflow-hidden rounded-[2.5rem] bg-zinc-100 cursor-pointer block lg:h-full"
            >
              <div className="aspect-[4/3] lg:aspect-auto lg:h-full w-full relative">
                <ProductImage
                  src={featured.images?.[0] || "https://picsum.photos/seed/featured/800/600"}
                  alt={featured.name}
                  mode="cover"
                  className="transition-transform duration-700"
                  sizes="(max-width: 1024px) 100vw, 50vw"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/80 via-zinc-950/20 to-transparent" />

                {/* Grade badge */}
                {(() => {
                  const grade = getGradeConfig(featured.condition ?? '');
                  return (
                    <div className="absolute top-6 left-6 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/90 backdrop-blur-sm text-[10px] font-bold uppercase tracking-widest shadow-sm">
                      <span className={`h-2 w-2 rounded-full ${grade.dotClass}`} />
                      {grade.label}
                      {grade.forParts && <span className="text-[10px] font-normal opacity-80">· For Parts</span>}
                    </div>
                  );
                })()}

                {/* Save pct badge */}
                {featured.comparePrice && (
                  <div className="absolute top-6 right-6 px-3 py-1.5 rounded-full bg-accent text-[10px] font-bold shadow-sm">
                    -{Math.round((1 - featured.price / featured.comparePrice) * 100)}%
                  </div>
                )}

                <div className="absolute bottom-0 left-0 right-0 p-8">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/50 mb-2">{featured.brand}</p>
                  <h3 className="font-sans text-2xl md:text-3xl font-extrabold text-white mb-1 leading-tight tracking-tight">{featured.name}</h3>
                  <p className="text-sm text-white/60 font-medium mb-5">{String((featured.specs as any)?.storage ?? featured.model ?? "—")}</p>
                  <div className="flex items-baseline gap-3">
                    {featured.price > 0 ? (
                      <>
                        <span className="text-3xl font-bold text-white tracking-tighter">£{featured.price}</span>
                        {featured.comparePrice && (
                          <span className="text-base text-white/40 line-through">£{featured.comparePrice}</span>
                        )}
                      </>
                    ) : (
                      <span className="text-xl font-bold text-white/60 italic">Price on request</span>
                    )}
                  </div>
                </div>
              </div>
            </motion.a>

            {/* Right: 2×2 grid */}
            <div className="grid grid-cols-2 gap-5">
              {secondary.map((deal, i) => (
                <motion.a
                  key={deal.id}
                  href={`/shop/${deal.category.toLowerCase()}/${deal.slug}`}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.07, type: "spring", stiffness: 240, damping: 24 }}
                  className="group cursor-pointer block"
                >
                  <div className="relative aspect-square overflow-hidden rounded-3xl bg-zinc-100 mb-3">
                    <ProductImage
                      src={deal.images?.[0]}
                      alt={deal.name}
                      mode={isOtherProduct(deal.category, deal.images?.[0]) ? "product" : "cover"}
                      sizes="(max-width: 640px) 45vw, (max-width: 1024px) 25vw, 20vw"
                    />
                    <div className="absolute inset-0 z-20 bg-gradient-to-t from-zinc-950/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                    {(() => {
                      const grade = getGradeConfig(deal.condition ?? '');
                      return (
                        <div className="absolute top-2 left-2 sm:top-3 sm:left-3 z-20 flex items-center gap-1 px-1.5 py-0.5 sm:px-2.5 sm:py-1 rounded-full bg-white/90 backdrop-blur-sm text-[8px] sm:text-[9px] font-bold uppercase tracking-widest shadow-sm">
                          <span className={`h-1 sm:h-1.5 w-1 sm:w-1.5 rounded-full ${grade.dotClass}`} />
                          {grade.label}
                          {grade.forParts && <span className="text-[10px] font-normal opacity-80">· For Parts</span>}
                        </div>
                      );
                    })()}
                    {deal.comparePrice && (
                      <span className="absolute top-2 right-2 sm:top-3 sm:right-3 z-20 px-1.5 py-0.5 sm:px-2 sm:py-1 rounded-full bg-accent text-[8px] sm:text-[9px] font-bold shadow-sm">
                        -{Math.round((1 - deal.price / deal.comparePrice) * 100)}%
                      </span>
                    )}
                    <div className="absolute bottom-3 right-3 z-20 h-10 w-10 rounded-full bg-zinc-950 text-white flex items-center justify-center opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300 shadow-lg">
                      <ShoppingCart className="h-4 w-4" />
                    </div>
                  </div>
                  <p className="font-bold text-zinc-950 text-sm truncate mb-0.5">{deal.name}</p>
                  <p className="text-[11px] text-zinc-400 font-medium mb-2 truncate">{String((deal.specs as any)?.storage ?? deal.model ?? "—")}</p>
                  <div className="flex items-baseline gap-2">
                    {deal.price > 0 ? (
                      <>
                        <span className="text-lg font-bold text-zinc-950">£{deal.price}</span>
                        {deal.comparePrice && (
                          <span className="text-xs text-zinc-300 line-through">£{deal.comparePrice}</span>
                        )}
                      </>
                    ) : (
                      <span className="text-sm font-bold text-zinc-400 italic">Price on request</span>
                    )}
                  </div>
                </motion.a>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

// ─── How It Works ─────────────────────────────────────────────────────────────
function HowItWorks() {
  const steps = [
    { num: "01", icon: Search, title: "Find your device", body: "Browse 47,000+ certified refurbished phones, laptops, tablets and more." },
    { num: "02", icon: Package, title: "We ship fast", body: "Orders placed before 2pm dispatch same day. Free tracked delivery on all orders." },
    { num: "03", icon: BadgeCheck, title: "Enjoy with confidence", body: "Every device includes a 12-month warranty and 30-day hassle-free returns." },
  ];

  return (
    <section className="bg-zinc-50 py-24 border-y border-zinc-100 overflow-hidden">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-400 mb-2.5">The process</p>
            <h2 className="font-sans text-3xl md:text-4xl lg:text-5xl font-extrabold text-zinc-950 leading-tight tracking-tight mb-6">
              Simple as it should be
            </h2>
            <p className="text-zinc-500 text-lg leading-relaxed max-w-[45ch]">
              We handle all the hard work so you don't have to. From quality checks to doorstep delivery — it's effortless.
            </p>
          </div>

          <div className="flex flex-col gap-0 divide-y divide-zinc-200">
            {steps.map((step, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: 20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.12 }}
                className="flex items-start gap-6 py-8 group"
              >
                <span className="text-[11px] font-bold text-zinc-300 tracking-widest pt-1 w-8 flex-shrink-0">{step.num}</span>
                <div className="h-10 w-10 rounded-xl bg-white border border-zinc-200 flex items-center justify-center flex-shrink-0 group-hover:bg-accent group-hover:border-accent transition-colors">
                  <step.icon className="h-5 w-5 text-zinc-600 group-hover:text-white transition-colors" />
                </div>
                <div>
                  <h3 className="font-bold text-zinc-950 mb-1">{step.title}</h3>
                  <p className="text-sm text-zinc-500 leading-relaxed">{step.body}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Reviews ──────────────────────────────────────────────────────────────────
function Reviews() {
  const [reviews, setReviews] = useState<any[]>([]);
  const [avgRating, setAvgRating] = useState(0);
  const [sectionRef, trigger] = useLazyFetchTrigger();
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (trigger === 0) return;
    reviewsApi.recent(8)
      .then(data => {
        setReviews(data);
        if (data.length > 0) {
          const avg = data.reduce((sum: number, r: any) => sum + r.rating, 0) / data.length;
          setAvgRating(Math.round(avg * 10) / 10);
        }
      })
      .catch(() => { });
  }, [trigger]);

  const displayRating = avgRating || 4.8;
  const displayCount = reviews.length;

  return (
    <section ref={sectionRef} className={reviews.length > 0 ? "py-24 bg-zinc-50 border-y border-zinc-100 overflow-hidden min-h-[200px]" : ""}>
      {reviews.length > 0 && (
        <>
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 mb-12">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-8">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-400 mb-2.5">Social proof</p>
                <h2 className="font-sans text-3xl md:text-4xl lg:text-5xl font-extrabold text-zinc-950 leading-none tracking-tight">
                  Real buyers, real reviews
                </h2>
              </div>
              <div className="flex items-center gap-6 bg-white rounded-3xl px-7 py-5 border border-zinc-100 shadow-sm self-start md:self-auto">
                <div>
                  <div className="flex gap-0.5 mb-1.5">
                    {[...Array(5)].map((_, i) => <Star key={i} className="h-5 w-5 fill-amber-400 text-amber-400" />)}
                  </div>
                  <p className="text-3xl font-bold text-zinc-950 leading-none">{displayRating}</p>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mt-1">out of 5</p>
                </div>
                <div className="h-12 w-px bg-zinc-100" />
                <div>
                  <p className="text-2xl font-bold text-zinc-950 leading-none">{displayCount.toLocaleString()}</p>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mt-1">Verified reviews</p>
                </div>
              </div>
            </div>
          </div>

          {/* Horizontal scroll */}
          <div ref={scrollRef} className="flex gap-5 overflow-x-auto scrollbar-hide pb-2">
            <div className="w-4 sm:w-6 lg:w-8 flex-shrink-0" />
            {reviews.map((r: any, i: number) => {
              const displayName = r.user?.name ?? r.guestName ?? "Verified Buyer";
              const initials = displayName.charAt(0).toUpperCase();
              const productLabel = r.product ? `${r.product.name} · ${r.product.condition}` : "";
              return (
                <motion.div
                  key={r.id}
                  initial={{ opacity: 0, x: 20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{
                    once: true
                  }}
                  transition={{ delay: i * 0.07 }}
                  className="flex-shrink-0 w-[280px] sm:w-[320px] md:w-[360px] bg-white rounded-3xl p-5 sm:p-7 border border-zinc-100 flex flex-col gap-5 shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="flex gap-0.5">
                    {[...Array(r.rating)].map((_: unknown, j: number) => <Star key={j} className="h-4 w-4 fill-amber-400 text-amber-400" />)}
                  </div>
                  <p className="text-zinc-700 leading-relaxed text-[15px] flex-1">"{r.body}"</p>
                  {r.images?.length > 0 && (
                    <div className="w-full h-44 rounded-2xl overflow-hidden">
                      <ProductImage src={r.images[0]} alt="" mode="cover" hover={false} sizes="(max-width: 768px) 90vw, 400px" />
                    </div>
                  )}
                  <div className="pt-4 border-t border-zinc-100 flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-zinc-100 flex items-center justify-center shrink-0 font-bold text-sm text-zinc-600">
                      {initials}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-zinc-950">{displayName}</p>
                      <p className="text-[11px] text-zinc-400 font-medium mt-0.5">{productLabel}</p>
                    </div>
                  </div>
                </motion.div>
              );
            })}
            <div className="w-4 sm:w-6 lg:w-8 flex-shrink-0" />
          </div>
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 mt-4 flex justify-end">
            <ScrollButtons scrollRef={scrollRef as React.RefObject<HTMLElement | null>} />
          </div>
        </>
      )}
    </section>
  );
}



// ─── App Preview ──────────────────────────────────────────────────────────────
function AppPreview() {
  const [activePage, setActivePage] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setActivePage((prev) => (prev + 1) % 4);
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  const navItems = [
    { icon: Search, label: "Search", id: 0 },
    { icon: Package, label: "Order", id: 1 },
    { icon: RefreshCw, label: "Trade-in", id: 2 },
    { icon: Wrench, label: "Repair", id: 3 },
  ];

  return (
    <section className="bg-zinc-50 py-24 overflow-hidden relative">
      <div className="absolute inset-0 bg-white/50 pointer-events-none" />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 relative">
        <div className="grid lg:grid-cols-2 gap-20 items-center">

          {/* ── Left: phone mockup ── */}
          <div className="relative flex flex-col items-center lg:items-start order-2 lg:order-1">
            <div className="absolute inset-0 bg-accent/10 blur-3xl rounded-full scale-75 pointer-events-none" />

            <div className="relative">
              {/* Frame */}
              <div className="relative w-[280px] rounded-[3rem] bg-zinc-950 p-3 shadow-[0_30px_60px_-15px_rgba(0,0,0,0.4)] ring-1 ring-white/10">
                {/* Dynamic Island / Camera Notch */}
                <div className="absolute top-5 left-1/2 -translate-x-1/2 w-20 h-5 bg-black rounded-full z-30 flex items-center justify-between px-2 pointer-events-none">
                  <div className="h-1.5 w-1.5 rounded-full bg-blue-900/40" />
                  <div className="h-2 w-2 rounded-full bg-zinc-900" />
                </div>
                {/* Screen */}
                <div className="rounded-[2.5rem] overflow-hidden bg-zinc-50 relative" style={{ aspectRatio: "9/19.5" }}>
                  <div className="flex flex-col h-full bg-zinc-50 text-zinc-950 text-[11px] relative">

                    {/* App header (static) */}
                    <div className="flex items-center justify-between px-5 pt-11 pb-3 bg-white border-b border-zinc-100 z-10 shrink-0">
                      <img src="/Icon/logo_black.png" alt="TechStop" className="h-6 w-auto object-contain" />
                      <div className="flex items-center gap-3">
                        <ShoppingCart className="h-4 w-4 text-zinc-600" />
                        <div className="h-6 w-6 rounded-full bg-zinc-100 flex items-center justify-center">
                          <span className="text-[9px] font-bold">K</span>
                        </div>
                      </div>
                    </div>

                    {/* Screen Content */}
                    <div className="flex-1 relative overflow-hidden">
                      <AnimatePresence mode="popLayout">
                        {/* PAGE 0: SHOP / SEARCH */}
                        {activePage === 0 && (
                          <motion.div
                            key="page0"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            transition={{ duration: 0.3 }}
                            className="absolute inset-0 flex flex-col"
                          >
                            <div className="px-4 py-3 shrink-0">
                              <div className="h-8 rounded-xl bg-white border border-zinc-200 shadow-sm flex items-center justify-between px-3">
                                <div className="flex items-center gap-1.5">
                                  <Search className="h-3 w-3 text-zinc-950" />
                                  <span className="text-[10px] text-zinc-950 font-extrabold">Pro</span>
                                  <span className="h-3 w-[1.5px] bg-accent animate-pulse" />
                                </div>
                              </div>
                            </div>
                            
                            <div className="flex-1 px-4 space-y-2.5 overflow-y-auto pb-4 scrollbar-hide">
                              <div className="rounded-2xl bg-accent p-3.5 text-white shadow-md shadow-accent/20">
                                <p className="text-[8px] font-bold uppercase tracking-widest text-white/80 mb-1">Flash Deal · 2h left</p>
                                <p className="text-xs font-bold mb-0.5">iPhone 15 Pro</p>
                                <div className="flex items-baseline gap-1.5">
                                  <span className="text-sm font-bold">£679</span>
                                  <span className="text-[9px] text-white/70 line-through">£1,199</span>
                                </div>
                              </div>

                              {[
                                { name: "MacBook Pro M2", price: "£849", grade: "A", img: "/products/macbook-air-m2.png" },
                                { name: "AirPods Pro 2", price: "£149", grade: "C", img: "/products/airpods-pro-2.png" },
                                { name: "iPad Pro 11\"", price: "£399", grade: "B", img: "/products/ipad-air-5.png" },
                              ].map((p, j) => (
                                <div key={j} className="flex items-center gap-3 bg-white rounded-2xl p-2.5 shadow-sm border border-zinc-100">
                                  <div className="h-10 w-10 rounded-xl bg-zinc-50 flex items-center justify-center shrink-0">
                                    <img src={p.img} alt={p.name} className="h-8 w-8 object-contain" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="font-bold truncate text-[11px]">{p.name}</p>
                                    <p className="text-[9px] text-zinc-500 font-medium">Grade {p.grade}</p>
                                  </div>
                                  <p className="font-bold shrink-0 text-xs">{p.price}</p>
                                </div>
                              ))}
                            </div>
                          </motion.div>
                        )}

                        {/* PAGE 1: ORDER TRACKING */}
                        {activePage === 1 && (
                          <motion.div
                            key="page1"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            transition={{ duration: 0.3 }}
                            className="absolute inset-0 flex flex-col bg-zinc-50"
                          >
                            <div className="p-4 flex-1">
                              <div className="flex items-center justify-between mb-3">
                                <div>
                                  <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-400 mb-0.5">Your Order</p>
                                  <h3 className="font-extrabold text-sm text-zinc-950">iPhone 14 Pro</h3>
                                  <p className="text-[9px] font-semibold text-emerald-600">Deep Purple · 128GB</p>
                                </div>
                                <div className="h-14 w-14 rounded-2xl bg-white border border-zinc-100 p-1 shadow-sm shrink-0 flex items-center justify-center">
                                  <img src="/iphone14pro-order.png" alt="iPhone 14 Pro" className="h-full w-full object-contain" />
                                </div>
                              </div>

                              <div className="bg-white rounded-2xl p-4 shadow-sm border border-zinc-100 mb-4">
                                <div className="flex items-center gap-3 mb-4">
                                  <div className="h-8 w-8 rounded-full bg-zinc-950 text-white flex items-center justify-center shrink-0">
                                    <Package className="h-4 w-4" />
                                  </div>
                                  <div>
                                    <p className="font-bold text-[11px]">Out for delivery</p>
                                    <p className="text-[9px] text-zinc-500">Arriving today by 8 PM</p>
                                  </div>
                                </div>
                                <div className="relative pl-4 border-l-2 border-emerald-500 ml-4 space-y-4 pb-1">
                                  <div className="relative">
                                    <div className="absolute -left-[21px] top-1 h-2 w-2 rounded-full bg-emerald-500 border-2 border-white ring-2 ring-emerald-500/20" />
                                    <p className="font-bold text-[10px]">Shipped</p>
                                    <p className="text-[8px] text-zinc-400">Yesterday, 14:20</p>
                                  </div>
                                  <div className="relative">
                                    <div className="absolute -left-[21px] top-1 h-2 w-2 rounded-full bg-emerald-500 border-2 border-white ring-2 ring-emerald-500/20" />
                                    <p className="font-bold text-[10px]">Order confirmed</p>
                                    <p className="text-[8px] text-zinc-400">Monday, 09:15</p>
                                  </div>
                                </div>
                              </div>
                              
                              <button className="w-full h-10 bg-zinc-950 text-white rounded-xl font-bold text-[11px] shadow-md">
                                Track Delivery
                              </button>
                            </div>
                          </motion.div>
                        )}

                        {/* PAGE 2: TRADE IN */}
                        {activePage === 2 && (
                          <motion.div
                            key="page2"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            transition={{ duration: 0.3 }}
                            className="absolute inset-0 flex flex-col bg-zinc-50"
                          >
                            <div className="p-4 flex-1 flex flex-col items-center justify-center text-center">
                              <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center shadow-sm border border-zinc-100 mb-3">
                                <RefreshCw className="h-6 w-6 text-zinc-950" />
                              </div>
                              <h3 className="font-extrabold text-sm mb-1">Instant Trade-In</h3>
                              <p className="text-[10px] text-zinc-500 mb-4 leading-relaxed">
                                Swap your old device for instant credit towards your next upgrade.
                              </p>
                              
                              <div className="w-full bg-white rounded-2xl p-3.5 shadow-sm border border-zinc-100 mb-3 text-left">
                                <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-400 mb-1">Your device</p>
                                <p className="font-bold text-[11px] mb-2">iPhone 12 Pro Max</p>
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] text-zinc-500">Est. value</span>
                                  <span className="font-bold text-accent text-sm">£320</span>
                                </div>
                              </div>

                              <button className="w-full h-10 bg-zinc-950 text-white rounded-xl font-bold text-[11px] shadow-md">
                                Get Instant Offer
                              </button>
                            </div>
                          </motion.div>
                        )}

                        {/* PAGE 3: REPAIR */}
                        {activePage === 3 && (
                          <motion.div
                            key="page3"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            transition={{ duration: 0.3 }}
                            className="absolute inset-0 flex flex-col bg-zinc-50 p-4"
                          >
                            <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-400 mb-1">Express Repairs</p>
                            <h3 className="font-extrabold text-sm mb-3">Book a Repair</h3>

                            <div className="space-y-2.5 mb-4">
                              <div className="bg-white rounded-2xl p-3 shadow-sm border border-zinc-100 flex items-center gap-3">
                                <div className="h-9 w-9 rounded-xl bg-zinc-100 flex items-center justify-center shrink-0">
                                  <Wrench className="h-4 w-4 text-zinc-950" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="font-bold text-[11px]">Screen Replacement</p>
                                  <p className="text-[9px] text-zinc-400">Genuine parts · 45 mins</p>
                                </div>
                                <span className="font-bold text-xs">£69</span>
                              </div>

                              <div className="bg-white rounded-2xl p-3 shadow-sm border border-zinc-100 flex items-center gap-3">
                                <div className="h-9 w-9 rounded-xl bg-zinc-100 flex items-center justify-center shrink-0">
                                  <Zap className="h-4 w-4 text-zinc-950" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="font-bold text-[11px]">Battery Health Swap</p>
                                  <p className="text-[9px] text-zinc-400">100% capacity · 30 mins</p>
                                </div>
                                <span className="font-bold text-xs">£39</span>
                              </div>
                            </div>

                            <button className="w-full h-10 bg-accent text-white rounded-xl font-bold text-[11px] shadow-md shadow-accent/20 mt-auto">
                              Schedule Repair
                            </button>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* Bottom nav bar with animated dot */}
                    <div className="flex items-center justify-around px-4 py-3 bg-white border-t border-zinc-100 shrink-0 z-10 pb-5">
                      {navItems.map((item) => {
                        const isActive = activePage === item.id;
                        return (
                          <button
                            key={item.id}
                            onClick={() => setActivePage(item.id)}
                            className="relative flex flex-col items-center gap-1 focus:outline-none transition-colors"
                          >
                            <item.icon className={"h-5 w-5 transition-colors " + (isActive ? "text-zinc-950" : "text-zinc-300")} />
                            {isActive ? (
                              <motion.div
                                layoutId="activeTabDot"
                                className="h-1 w-1 rounded-full bg-zinc-950"
                                transition={{ type: "spring", stiffness: 500, damping: 30 }}
                              />
                            ) : (
                              <div className="h-1 w-1" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>


            </div>
          </div>

          {/* ── Right: Clean Coming Soon Header & Store Badge Cards ── */}
          <div className="block text-center lg:text-left order-1 lg:order-2 flex flex-col items-center lg:items-start">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-zinc-900 text-white text-[11px] font-bold mb-6 shadow-sm">
              <span className="h-2 w-2 rounded-full bg-accent animate-pulse" />
              <span>COMING SOON · iOS + ANDROID</span>
            </div>

            <h2 className="font-sans text-3xl md:text-4xl lg:text-5xl font-extrabold text-zinc-950 leading-tight tracking-tight mb-8">
              Everything you need, in your pocket.
            </h2>

            <div className="flex flex-col sm:flex-row items-center gap-3.5 w-full sm:w-auto justify-center lg:justify-start">
              {/* Google Play Official Badge Card */}
              <div className="flex items-center gap-3.5 bg-black text-white px-4 py-2.5 rounded-xl border border-zinc-700/80 shadow-md cursor-pointer hover:border-zinc-500 transition-all select-none w-max">
                <img
                  src="/playstore.png"
                  alt="Google Play"
                  className="w-7 h-7 object-contain shrink-0"
                />
                <div className="flex flex-col text-left leading-tight">
                  <span className="text-[9px] uppercase tracking-wider text-zinc-300 font-semibold">Coming soon to</span>
                  <span className="text-[17px] font-bold tracking-tight text-white font-sans">Google Play</span>
                </div>
              </div>

              {/* App Store Official Badge Card */}
              <div className="flex items-center gap-3.5 bg-black text-white px-4 py-2.5 rounded-xl border border-zinc-700/80 shadow-md cursor-pointer hover:border-zinc-500 transition-all select-none w-max">
                <img
                  src="/applestore.png"
                  alt="App Store"
                  className="w-7 h-7 object-contain shrink-0"
                />
                <div className="flex flex-col text-left leading-tight">
                  <span className="text-[9px] uppercase tracking-wider text-zinc-300 font-semibold">Coming soon to</span>
                  <span className="text-[17px] font-bold tracking-tight text-white font-sans">App Store</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Shop By Budget ───────────────────────────────────────────────────────────
const BUDGET_RANGES = [
  { label: "Under £100", params: { maxPrice: 100 } as const },
  { label: "£100 – £300", params: { minPrice: 100, maxPrice: 300 } as const },
  { label: "£300 – £600", params: { minPrice: 300, maxPrice: 600 } as const },
  { label: "£600 – £1000", params: { minPrice: 600, maxPrice: 1000 } as const },
  { label: "£1000+", params: { minPrice: 1000 } as const },
];

function ShopByBudget() {
  const [activeRange, setActiveRange] = useState(0);
  const [cache, setCache] = useState<Record<number, PCard[]>>({});
  const [loading, setLoading] = useState(false);
  const [sectionRef, trigger] = useLazyFetchTrigger();
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (trigger > 1) setCache({});
  }, [trigger]);

  useEffect(() => {
    if (trigger === 0) return;
    if (cache[activeRange]) return;
    setLoading(true);
    productsApi.list({ ...BUDGET_RANGES[activeRange].params, limit: 40 })
      .then(r => {
        const mapped: PCard[] = r.items.map(p => ({
          name: p.name,
          type: p.brand,
          spec: String((p.specs as Record<string, unknown>)?.storage ?? p.model ?? "—"),
          price: `£${p.price ?? 0}`,
          was: (p.comparePrice && p.comparePrice > (p.price ?? 0)) ? `£${p.comparePrice}` : null,
          grade: p.condition,
          img: p.images?.[0] ?? "",
          link: `/shop/${p.category.toLowerCase()}/${p.slug}`,
        }));
        setCache(prev => ({ ...prev, [activeRange]: mapped }));
      })
      .catch(() => { })
      .finally(() => setLoading(false));
  }, [activeRange, trigger, cache]);

  const products = cache[activeRange] ?? [];

  return (
    <section ref={sectionRef} className="bg-zinc-50 border-y border-zinc-100 py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 mb-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-400 mb-2.5">Budget friendly</p>
            <h2 className="font-sans text-3xl md:text-4xl lg:text-5xl font-extrabold text-zinc-950 leading-none tracking-tight">
              Shop by price
            </h2>
          </div>
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide py-1">
            {BUDGET_RANGES.map((range, i) => (
              <button
                key={i}
                onClick={() => setActiveRange(i)}
                className={`flex-shrink-0 h-10 px-5 rounded-full font-bold text-sm transition-all duration-200 border ${activeRange === i
                  ? "bg-zinc-950 text-white border-zinc-950"
                  : "bg-white text-zinc-600 border-zinc-200 hover:border-zinc-950 hover:text-zinc-950"
                  }`}
              >
                {range.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="pl-4 sm:pl-6 lg:pl-8 mx-auto max-w-7xl">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeRange}
            ref={scrollRef}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
            className="flex gap-5 overflow-x-auto scrollbar-hide pr-8 pb-6"
          >
            {loading ? (
              [...Array(5)].map((_, i) => (
                <div key={i} className="w-[220px] md:w-[240px] flex-shrink-0 animate-pulse">
                  <div className="aspect-square rounded-2xl bg-zinc-200 mb-3" />
                  <div className="h-3 bg-zinc-200 rounded-full w-1/3 mb-2" />
                  <div className="h-4 bg-zinc-200 rounded-full w-3/4 mb-2" />
                  <div className="h-3 bg-zinc-200 rounded-full w-1/2 mb-3" />
                  <div className="h-5 bg-zinc-200 rounded-full w-1/3" />
                </div>
              ))
            ) : (
              products.map((p, i) => (
                <div key={i} className="w-[220px] md:w-[240px] flex-shrink-0">
                  <ProductCard {...p} index={i} />
                </div>
              ))
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 mt-2 flex items-center justify-end gap-4">
        <ScrollButtons scrollRef={scrollRef as React.RefObject<HTMLElement | null>} />
        <a
          href="/shop/phones"
          className="inline-flex items-center gap-2 h-11 px-6 rounded-full border border-zinc-200 text-sm font-bold text-zinc-700 hover:bg-zinc-950 hover:text-white hover:border-zinc-950 transition-all duration-200"
        >
          See all {BUDGET_RANGES[activeRange].label}
          <ArrowRight className="h-4 w-4" />
        </a>
      </div>
    </section>
  );
}

// ─── Best Deals Split ─────────────────────────────────────────────────────────
function BestDealsSplit() {
  const [allProducts, setAllProducts] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const { addItem } = useCart();
  const [sectionRef, trigger] = useLazyFetchTrigger();
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (trigger === 0) return;
    productsApi.list({ limit: 80 }).then(r => {
      const filtered = r.items.filter(p => isOtherProduct(p.category, p.images?.[0]));
      setAllProducts(filtered.sort((a, b) => (b.price ?? 0) - (a.price ?? 0)));
    }).catch(() => { });
  }, [trigger]);

  // Category pills sorted by product count descending
  const categoryPills = (() => {
    const countMap = new Map<string, { count: number; img: string }>();
    for (const p of allProducts) {
      const existing = countMap.get(p.category);
      if (existing) {
        existing.count++;
      } else {
        countMap.set(p.category, { count: 1, img: p.images?.[0] ?? "" });
      }
    }
    return Array.from(countMap.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 6)
      .map(([cat, { img }]) => ({ name: cat, img, category: cat }));
  })();

  const filtered = selectedCategory === "all"
    ? allProducts
    : allProducts.filter(p => p.category === selectedCategory);

  const [WARZONE_IMG, setWARZONE_IMG] = useState<string | null>(null);
  useEffect(() => {
    bannersApi.random(1).then(b => setWARZONE_IMG(b[0]?.url ?? null)).catch(() => { });
  }, []);
  const isAllSelected = selectedCategory === "all";
  const leftImage = isAllSelected
    ? WARZONE_IMG
    : (filtered[0]?.images?.[0] ?? allProducts[0]?.images?.[0] ?? WARZONE_IMG);

  async function handleAdd(p: any) {
    try {
      await addItem({ productId: p.id, quantity: 1, price: p.price, name: p.name, slug: p.slug, image: p.images?.[0] });
    } catch { }
    setAddedIds(prev => new Set(prev).add(p.id));
    setTimeout(() => setAddedIds(prev => { const s = new Set(prev); s.delete(p.id); return s; }), 2000);
  }

  return (
    <section ref={sectionRef} className="bg-zinc-50 py-5 md:py-7 overflow-hidden border-t border-zinc-100">
      <div className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8">
        <div className="mb-6">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-400 mb-2.5">Explore & discover</p>
          <h2 className="font-sans text-3xl md:text-4xl lg:text-5xl font-extrabold text-zinc-950 leading-none tracking-tight">
            You might love these
          </h2>
        </div>

        <div className="flex flex-col lg:flex-row gap-6 lg:gap-8 lg:items-start">
          {/* Left Image — static banner for All, product image for categories */}
          <div className="w-full lg:w-[340px] xl:w-[380px] flex-shrink-0 rounded-2xl overflow-hidden aspect-[4/3] lg:aspect-auto lg:h-[390px]">
            {leftImage && (
              <ProductImage
                src={leftImage}
                alt="Featured product"
                mode={isAllSelected ? "cover" : "product"}
                bg={isAllSelected ? "bg-zinc-900" : "bg-image-light"}
                className={isAllSelected ? "" : "p-6"}
                sizes="(max-width: 1024px) 100vw, 380px"
              />
            )}
          </div>

          {/* Right Content */}
          <div className="flex-1 min-w-0 flex flex-col">
            {/* Category Pills from DB */}
            <div className="flex gap-2.5 overflow-x-auto scrollbar-hide pb-4 mb-2">
              {/* All pill */}
              <button
                onClick={() => setSelectedCategory("all")}
                className="flex flex-col items-center gap-1.5 flex-shrink-0 w-[64px] group"
              >
                <div className={`h-12 w-[64px] rounded-xl border flex items-center justify-center transition-colors ${selectedCategory === "all"
                  ? "bg-zinc-950 border-zinc-950 dark:bg-white dark:border-white"
                  : "bg-image-light border-transparent hover:border-zinc-200 dark:hover:border-zinc-700"
                  }`}>
                  <Zap className={`h-4 w-4 ${selectedCategory === "all" ? "text-accent dark:text-zinc-950" : "text-emerald-600"}`} />
                </div>
                <span className="text-[10px] font-medium text-zinc-600 dark:text-zinc-400 text-center leading-tight">All Deals</span>
              </button>

              {categoryPills.map((pill) => {
                const Icon = getSubcategoryIcon(pill.name);
                const isSelected = selectedCategory === pill.category;
                return (
                  <button
                    key={pill.category}
                    onClick={() => setSelectedCategory(pill.category)}
                    className="flex flex-col items-center gap-1.5 flex-shrink-0 w-[68px] group"
                  >
                    <div className={`h-12 w-[64px] rounded-xl border flex items-center justify-center transition-all ${isSelected
                      ? "bg-zinc-950 border-zinc-950 text-white dark:bg-white dark:border-white dark:text-zinc-950 shadow-sm"
                      : "bg-image-light border-transparent hover:border-zinc-200 dark:hover:border-zinc-700 text-zinc-700 dark:text-zinc-300"
                      }`}>
                      <Icon className={`h-5 w-5 ${isSelected ? "text-white dark:text-zinc-950" : "text-zinc-700 dark:text-zinc-300"}`} />
                    </div>
                    <span className="text-[10px] font-medium text-zinc-600 dark:text-zinc-400 text-center leading-tight truncate w-full px-0.5">{pill.name}</span>
                  </button>
                );
              })}
            </div>

            {/* Products */}
            <div ref={scrollRef} className="flex gap-4 overflow-x-auto scrollbar-hide pb-4 flex-nowrap">
              {filtered.map((p) => {
                const priceStr = (p.price ?? 0).toFixed(2);
                const was = (p.comparePrice && p.comparePrice > (p.price ?? 0)) ? `£${p.comparePrice} new` : null;
                const [pWhole, pDec] = priceStr.split(".");
                const added = addedIds.has(p.id);
                return (
                  <div key={p.id} className="w-[240px] flex-shrink-0 bg-white rounded-xl p-3.5 border border-zinc-200/60 shadow-sm hover:shadow-md transition-shadow flex flex-col relative group">
                    <Link href={`/shop/${p.category.toLowerCase()}/${p.slug}`} className="block">
                      <div className="relative h-32 w-full rounded-xl mb-2 overflow-hidden bg-[#f5f5f7]">
                        {/* Flash Deal Overlay Badge */}
                        <div className="absolute top-2 left-2 z-20 flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500 text-white text-[8px] font-bold uppercase tracking-wider shadow-sm">
                          <Zap className="h-2 w-2 fill-white" /> Flash
                        </div>
                        <ProductImage src={p.images?.[0]} alt={p.name} category={p.category} />
                      </div>
                      <p className="font-semibold text-zinc-950 text-[12.5px] leading-snug mb-1 line-clamp-2 hover:underline min-h-[36px]">{p.name}</p>
                    </Link>
                    <div className="flex items-center justify-between mb-2">
                      <GradeBadge condition={p.condition ?? ''} />
                      <div className="flex items-center gap-0.5 text-zinc-950">
                        <Star className="h-3 w-3 fill-zinc-950 text-zinc-950" />
                        <span className="text-[10px] font-bold">{p.rating?.toFixed(1)}</span>
                        <span className="text-[9px] text-zinc-400">({p.reviewCount})</span>
                      </div>
                    </div>
                    <div className="mt-auto pt-2 border-t border-zinc-100 flex items-end justify-between gap-2">
                      <div>
                        {p.price > 0 ? (
                          <>
                            <p className="text-lg font-black text-emerald-700 leading-none">
                              £{pWhole}<span className="text-xs font-bold">.{pDec}</span>
                            </p>
                            <p className="text-[10px] text-zinc-400 line-through mt-0.5">{was}</p>
                          </>
                        ) : (
                          <p className="text-sm font-bold text-zinc-400 italic">Price on request</p>
                        )}
                      </div>
                      <button
                        onClick={() => handleAdd(p)}
                        className={`h-8 px-3 rounded-lg font-bold text-[11px] flex items-center justify-center gap-1 transition-colors ${added ? "bg-emerald-500 text-white border-emerald-500 border" : "border border-zinc-200 text-zinc-950 hover:border-zinc-950 hover:bg-zinc-950 hover:text-white"}`}
                      >
                        {added ? <Check className="h-3 w-3" /> : "+ Add"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end mt-4">
              <ScrollButtons scrollRef={scrollRef as React.RefObject<HTMLElement | null>} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── New Arrivals ─────────────────────────────────────────────────────────────
function NewArrivals() {
  const [items, setItems] = useState<any[]>([]);
  const [sectionRef, trigger] = useLazyFetchTrigger();
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (trigger === 0) return;
    productsApi.list({ limit: 20 }).then(r => setItems(r.items)).catch(() => { });
  }, [trigger]);

  return (
    <section ref={sectionRef} className="py-10 md:py-14 overflow-hidden">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 mb-6">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-400 mb-2.5">Just added</p>
            <h2 className="font-sans text-3xl md:text-4xl lg:text-5xl font-extrabold text-zinc-950 leading-none tracking-tight">
              New arrivals
            </h2>
          </div>
          <a href="/shop/phones" className="hidden md:flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-zinc-500 hover:text-zinc-950 transition-colors border-b border-zinc-300 pb-1">
            See all <ArrowRight className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>

      <div ref={scrollRef} className="flex gap-5 overflow-x-auto scrollbar-hide pb-2">
        <div className="w-4 sm:w-6 lg:w-8 flex-shrink-0" />
        {items.map((item, i) => (
          <Link href={`/shop/${item.category.toLowerCase()}/${item.slug}`} key={i} className="block group flex-shrink-0 w-[220px] md:w-[240px] cursor-pointer">
            <div className="relative aspect-square rounded-3xl bg-image-light overflow-hidden mb-4">
              <ProductImage
                src={item.images?.[0]}
                alt={item.name}
                mode={isOtherProduct(item.category, item.images?.[0]) ? "product" : "cover"}
                sizes="(max-width: 640px) 90vw, (max-width: 1024px) 45vw, 240px"
              />
              <GradeBadge condition={item.condition ?? ''} className="absolute top-3 left-3 z-20" />
              <div className="absolute top-3 right-3 z-20 px-2.5 py-1 rounded-full bg-zinc-950 text-white text-[9px] font-bold uppercase tracking-widest">
                New
              </div>
              <button className="absolute bottom-3 right-3 z-20 h-10 w-10 rounded-full bg-zinc-950 text-white flex items-center justify-center opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300 shadow-lg">
                <ShoppingCart className="h-4 w-4" />
              </button>
            </div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-1">{item.category}</p>
            <p className="font-bold text-zinc-950 mb-1 truncate">{item.name}</p>
            {item.price > 0 ? (
              <p className="text-lg font-bold text-zinc-950">£{item.price}</p>
            ) : (
              <p className="text-sm font-bold text-zinc-400 italic">Price on request</p>
            )}
          </Link>
        ))}
        <div className="w-4 sm:w-6 lg:w-8 flex-shrink-0" />
      </div>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 mt-4 flex justify-end">
        <ScrollButtons scrollRef={scrollRef as React.RefObject<HTMLElement | null>} />
      </div>
    </section>
  );
}

// ─── Grade Guide ──────────────────────────────────────────────────────────────
function GradeGuide() {
  const [gradeImgs, setGradeImgs] = useState<Record<string, string | null>>({});
  const [sectionRef, trigger] = useLazyFetchTrigger();

  useEffect(() => {
    if (trigger === 0) return;
    bannersApi.gradePreview().then(rows => {
      setGradeImgs(Object.fromEntries(rows.map(r => [r.grade, r.url])));
    }).catch(() => { });
  }, [trigger]);

  const grades: {
    condition: string;
    num: string;
    name: string;
    tagline: string;
    featured: boolean;
    img: string | null;
    textClass: string;
    featuredRing: string;
  }[] = [
      {
        condition: "NEW",
        num: "01", name: "New", tagline: "Brand new, sealed or equivalent.",
        featured: false, img: gradeImgs["NEW"] ?? null,
        textClass: "text-zinc-300", featuredRing: "",
      },
      {
        condition: "A",
        num: "02", name: "A Grade", tagline: "Used but like new — zero visible marks.",
        featured: true, img: gradeImgs["A"] ?? null,
        textClass: "text-emerald-400",
        featuredRing: "border-emerald-500/60 shadow-[0_0_30px_rgba(16,185,129,0.15)] ring-1 ring-emerald-500/20",
      },
      {
        condition: "B",
        num: "03", name: "B Grade", tagline: "Minor signs of usage, small scratches.",
        featured: false, img: gradeImgs["B"] ?? null,
        textClass: "text-blue-400", featuredRing: "",
      },
      {
        condition: "C",
        num: "04", name: "C Grade", tagline: "Heavy scratches or marks, fully working.",
        featured: false, img: gradeImgs["C"] ?? null,
        textClass: "text-amber-400", featuredRing: "",
      },
      {
        condition: "F",
        num: "05", name: "F Grade", tagline: "Non-working — for parts or repair only.",
        featured: false, img: gradeImgs["F"] ?? null,
        textClass: "text-red-400", featuredRing: "",
      },
    ];

  return (
    <section ref={sectionRef} className="py-24 bg-zinc-950 overflow-hidden">
      <div className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8">

        <div className="mb-16 flex flex-col lg:flex-row lg:items-end justify-between gap-6">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-400 mb-2.5">How grading works</p>
            <h2 className="font-sans text-3xl md:text-4xl lg:text-5xl font-extrabold text-white leading-none tracking-tight">
              What does each grade mean?
            </h2>
          </div>
          <p className="text-zinc-500 text-base max-w-[42ch] leading-relaxed">
            Every device is independently tested before listing. Pick the grade that fits your budget — all are 100% functional.
          </p>
        </div>

        <div className="group flex xl:grid xl:grid-cols-5 gap-4 sm:gap-6 items-stretch overflow-hidden pb-6 -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 xl:mx-0 xl:px-0 xl:overflow-x-visible xl:pb-0 scrollbar-hide" style={{ WebkitMaskImage: 'linear-gradient(to right, transparent, black 5%, black 95%, transparent)', maskImage: 'linear-gradient(to right, transparent, black 5%, black 95%, transparent)' }}>
          <div className="flex xl:contents gap-4 sm:gap-6 w-max animate-marquee xl:animate-none group-hover:[animation-play-state:paused]">
            {[...grades, ...grades].map((g, i) => (
              <div
                key={i}
                className={`relative rounded-[2rem] overflow-hidden flex flex-col hover:-translate-y-1.5 transition-all duration-300 border bg-zinc-950/40 flex-none w-[75vw] max-w-[300px] xl:w-auto xl:max-w-none ${g.featured ? g.featuredRing : "border-zinc-800/80 hover:border-zinc-700/80"} ${i >= grades.length ? 'xl:hidden' : ''}`}
              >
                {/* Photo */}
                <div className="h-[300px] overflow-hidden flex-shrink-0 relative">
                {g.img && (
                  <ProductImage
                    src={g.img}
                    alt={g.name}
                    mode="cover"
                    bg="bg-zinc-950"
                    className="transition-transform duration-700"
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 20vw"
                  />
                )}
                <div className="absolute inset-0 z-10 bg-gradient-to-b from-zinc-950/40 via-transparent to-zinc-950" />

                {g.featured && (
                  <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-accent text-white text-[9px] font-bold uppercase tracking-widest px-4 py-1.5 rounded-full whitespace-nowrap shadow-lg">
                    Most Popular
                  </div>
                )}

                <span className="absolute top-4 left-5 z-20 text-[10px] font-bold text-white/30 uppercase tracking-widest">{g.num}</span>

                {/* Grade + name + price */}
                <div className="absolute bottom-0 left-0 right-0 p-5 z-20">
                  <div className="mb-2">
                    <GradeBadge condition={g.condition} />
                  </div>
                  <p className="font-sans text-2xl font-extrabold text-white leading-none tracking-tight">{g.name}</p>
                  <p className="text-white/50 text-xs font-medium mt-1">{g.tagline}</p>
                </div>
              </div>

              {/* CTA */}
              <div className="p-4 border-t border-zinc-800/60">
                <a
                  href="/shop/phones"
                  className="flex items-center justify-center gap-2 h-10 rounded-2xl bg-zinc-800 hover:bg-accent text-zinc-300 hover:text-white font-bold text-sm transition-all duration-200"
                >
                  Browse devices <ArrowRight className="h-4 w-4" />
                </a>
              </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}


// ─── Savings Comparison ───────────────────────────────────────────────────────
function SavingsComparison() {
  const [rawProducts, setRawProducts] = useState<any[]>([]);
  const [sectionRef, trigger] = useLazyFetchTrigger();

  useEffect(() => {
    if (trigger === 0) return;
    productsApi.list({ limit: 100 }).then(r => {
      const main = r.items
        .filter(p =>
          !isOtherProduct(p.category, p.images?.[0]) &&
          p.price != null && p.price > 0 &&
          p.comparePrice && p.comparePrice > p.price
        )
        .sort(() => Math.random() - 0.5)
        .slice(0, 6);
      setRawProducts(main);
    }).catch(() => { });
  }, [trigger]);

  const items = rawProducts
    .filter(p => p.price != null && p.price > 0 && p.comparePrice && p.comparePrice > p.price)
    .map(p => ({
      device: p.name,
      newPrice: p.comparePrice as number,
      ourPrice: p.price as number,
      grade: p.condition,
      img: p.images?.[0] ?? "",

      category: p.category,
    }));

  return (
    <section ref={sectionRef} className="py-24 bg-white border-t border-zinc-100 min-h-[200px] overflow-hidden">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-end justify-between mb-8">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-400 mb-2.5">Why refurbished?</p>
            <h2 className="font-sans text-3xl md:text-4xl lg:text-5xl font-extrabold text-zinc-950 leading-none tracking-tight">
              Refurbished vs retail
            </h2>
          </div>
          <div className="hidden md:flex items-center gap-10 text-sm font-bold text-zinc-400">
            <span>Retail price</span>
            <span className="text-zinc-950">TechStop price</span>
          </div>
        </div>

        <div className="space-y-3">
          {items.length === 0
            ? [...Array(4)].map((_, i) => (
              <div key={i} className="h-[76px] rounded-2xl bg-zinc-100 animate-pulse" />
            ))
            : items.map((item, i) => {
              const saving = item.newPrice - item.ourPrice;
              const pct = Math.round((saving / item.newPrice) * 100);
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -16 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.07 }}
                >
                  <Link
                    href={`/shop/${item.category?.toLowerCase() ?? "phones"}`}
                    className="group flex items-center gap-3 md:gap-6 p-3 md:p-5 rounded-2xl border border-zinc-100 hover:shadow-md hover:border-zinc-200 transition-all cursor-pointer"
                  >
                    <div className="relative h-12 w-12 md:h-16 md:w-16 rounded-2xl bg-image-light flex-shrink-0 overflow-hidden">
                      <ProductImage src={item.img} alt={item.device} hover={false} sizes="64px" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-zinc-950 text-xs sm:text-sm truncate">{item.device}</p>
                      <p className={`text-[9px] sm:text-[10px] font-bold uppercase tracking-widest mt-0.5 ${getGradeConfig(item.grade ?? '').textClass}`}>{getGradeConfig(item.grade ?? '').label} · Certified</p>
                    </div>
                    <div className="hidden sm:block text-right flex-shrink-0 min-w-[80px]">
                      <p className="text-zinc-300 line-through text-sm font-bold">£{item.newPrice.toLocaleString()}</p>
                      <p className="text-[10px] font-bold uppercase text-zinc-400 mt-0.5">Retail</p>
                    </div>
                    <div className="text-right flex-shrink-0 min-w-[64px] sm:min-w-[80px]">
                      <p className="text-sm sm:text-xl md:text-2xl font-bold text-zinc-950">£{item.ourPrice.toLocaleString()}</p>
                      <p className="text-[9px] sm:text-[10px] font-bold uppercase text-zinc-400 mt-0.5">TechStop</p>
                    </div>
                    <div className="flex-shrink-0 h-12 w-[72px] sm:h-14 sm:w-[90px] bg-accent rounded-2xl flex flex-col items-center justify-center text-white">
                      <p className="text-xs sm:text-base font-bold leading-none">-{pct}%</p>
                      <p className="text-[7px] sm:text-[9px] font-bold text-white/90 mt-0.5">Save £{saving}</p>
                    </div>
                  </Link>
                </motion.div>
              );
            })}
        </div>

        <div className="mt-10 text-center">
          <a href="/shop/phones" className="inline-flex items-center gap-2 h-12 px-8 bg-zinc-950 text-white rounded-2xl font-bold text-sm hover:bg-zinc-800 transition-colors">
            Browse all deals <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </div>
    </section>
  );
}

// ─── Shared product card ──────────────────────────────────────────────────────
interface PCard {
  name: string; type: string; spec: string;
  price: string; was?: string | null; grade: string; img: string; index?: number;
  link?: string;
}
function ProductCard({ name, type, spec, price, was, grade, img, index = 0, link = "/shop/phones" }: PCard) {
  const numericPrice = Number(price.replace(/[^0-9.]/g, ""));
  const isUnpriced = !numericPrice;
  const numericWas = was ? Number(was.replace(/[^0-9.]/g, "")) : 0;
  const pct = isUnpriced || !numericWas ? 0 : Math.round((1 - numericPrice / numericWas) * 100);
  return (
    <Link href={link} className="block group">
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.04, duration: 0.3 }}
        className="cursor-pointer"
      >
        <div className="relative aspect-square rounded-2xl bg-image-light overflow-hidden mb-3 ring-1 ring-zinc-200/10 group-hover:ring-transparent group-hover:shadow-xl transition-all duration-300">
          <ProductImage src={img} alt={name} />
          <GradeBadge condition={grade ?? ''} className="absolute top-3 left-3 z-20" />
          {!isUnpriced && pct > 0 && <div className="absolute top-3 right-3 z-20 px-2 py-1 rounded-full bg-accent text-white text-[9px] font-bold">-{pct}%</div>}
          <button className="absolute bottom-3 right-3 z-20 h-10 w-10 rounded-full bg-zinc-950 text-white flex items-center justify-center opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300 shadow-lg">
            <ShoppingCart className="h-4 w-4" />
          </button>
        </div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-0.5">{type}</p>
        <p className="font-bold text-zinc-950 text-sm leading-tight truncate mb-1">{name}</p>
        <p className="text-[11px] text-zinc-400 mb-2 truncate">{spec}</p>
        {isUnpriced ? (
          <span className="text-sm font-bold text-zinc-400 italic">Price on request</span>
        ) : (
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-bold text-zinc-950">{price}</span>
            {was && <span className="text-xs text-zinc-400 line-through">{was}</span>}
            {pct > 0 && <span className="text-xs font-bold text-emerald-600">-{pct}%</span>}
          </div>
        )}
      </motion.div>
    </Link>
  );
}

// ─── Featured Shop (sticky tabs + animated product grid) ──────────────────────

function FeaturedShop() {
  const [categories, setCategories] = useState<import('../lib/api').CatalogCategory[]>([]);
  const [active, setActive] = useState("");
  const [cache, setCache] = useState<Record<string, PCard[]>>({});
  const [loading, setLoading] = useState(false);
  const [sectionRef, trigger] = useLazyFetchTrigger();
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    catalogApi.listCategories()
      .then(cats => {
        const mainCats = cats.filter(c => c.isSellable);
        setCategories(mainCats);
        if (mainCats.length > 0) setActive(mainCats[0].slug);
      })
      .catch(() => { });
  }, []);

  useEffect(() => {
    if (trigger > 1) {
      setCache({});
    }
  }, [trigger]);

  useEffect(() => {
    if (trigger === 0 || !active) return;
    if (cache[active]) return;
    const cat = categories.find(c => c.slug === active);
    if (!cat) return;
    setLoading(true);
    productsApi.list({ category: cat.name, limit: 20 })
      .then(r => {
        const mapped: PCard[] = r.items.map(p => ({
          name: p.name,
          type: p.brand,
          spec: String((p.specs as Record<string, unknown>)?.storage ?? p.model ?? "—"),
          price: `£${p.price ?? 0}`,
          was: (p.comparePrice && p.comparePrice > (p.price ?? 0)) ? `£${p.comparePrice}` : null,
          grade: p.condition,
          img: p.images?.[0] ?? "",
          link: `/shop/${active}/${p.slug}`,
        }));
        const shuffled = mapped.sort(() => Math.random() - 0.5);
        setCache(prev => ({ ...prev, [active]: shuffled }));
      })
      .catch(() => { })
      .finally(() => setLoading(false));
  }, [active, trigger, cache, categories]);

  const filtered = cache[active] ?? [];

  return (
    <section ref={sectionRef} id="shop" className="py-16 border-t border-zinc-100 bg-white overflow-hidden">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 mb-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-400 mb-2.5">Trending favorites</p>
            <h2 className="font-sans text-3xl md:text-4xl lg:text-5xl font-extrabold text-zinc-950 leading-none tracking-tight">
              Shop our most wanted
            </h2>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide py-1">
            {categories.map((cat) => (
              <button
                key={cat.slug}
                onClick={() => setActive(cat.slug)}
                className={`flex-shrink-0 h-10 px-5 rounded-full font-bold text-sm transition-all duration-200 border ${active === cat.slug
                  ? "bg-zinc-950 text-white border-zinc-950 dark:bg-white dark:text-zinc-950 dark:border-white"
                  : "bg-white text-zinc-600 border-zinc-200 hover:border-zinc-950 hover:text-zinc-950 dark:bg-zinc-900/40 dark:text-zinc-400 dark:border-zinc-800 dark:hover:text-white dark:hover:border-zinc-400"
                  }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Horizontal Scroll Grid */}
      <div className="w-full">
        <AnimatePresence mode="wait">
          <motion.div
            key={active}
            ref={scrollRef}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
            className="flex gap-5 overflow-x-auto scrollbar-hide pb-6"
          >
            {loading ? (
              <>
                <div className="w-4 sm:w-6 lg:w-8 flex-shrink-0" />
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="w-[220px] md:w-[240px] flex-shrink-0 animate-pulse">
                    <div className="aspect-square rounded-2xl bg-zinc-100 mb-3" />
                    <div className="h-3 bg-zinc-100 rounded-full w-1/3 mb-2" />
                    <div className="h-4 bg-zinc-100 rounded-full w-3/4 mb-2" />
                    <div className="h-3 bg-zinc-100 rounded-full w-1/2 mb-3" />
                    <div className="h-5 bg-zinc-100 rounded-full w-1/3" />
                  </div>
                ))}
                <div className="w-4 sm:w-6 lg:w-8 flex-shrink-0" />
              </>
            ) : (
              <>
                <div className="w-4 sm:w-6 lg:w-8 flex-shrink-0" />
                {filtered.map((p, i) => (
                  <div key={`${active}-${i}`} className="w-[220px] md:w-[240px] flex-shrink-0">
                    <ProductCard {...p} index={i} />
                  </div>
                ))}
                <div className="w-[220px] md:w-[240px] flex-shrink-0 flex rounded-2xl border border-zinc-200/60 bg-zinc-50/50 hover:bg-zinc-50 hover:border-zinc-300 hover:shadow-md transition-all duration-300">
                  <Link
                    href={`/shop/${active || "phones"}`}
                    className="flex flex-col items-center justify-center gap-4 w-full p-6 text-zinc-500 hover:text-zinc-950 transition-colors group text-center"
                  >
                    <div className="h-12 w-12 rounded-full border-2 border-zinc-300 group-hover:border-zinc-950 flex items-center justify-center group-hover:bg-zinc-950 group-hover:text-white transition-all duration-300 shadow-sm group-hover:shadow-md">
                      <ArrowRight className="h-5 w-5 group-hover:translate-x-0.5 transition-transform duration-200" />
                    </div>
                    <span className="font-bold text-xs uppercase tracking-widest leading-relaxed">
                      See all<br />{categories.find(c => c.slug === active)?.name ?? active}
                    </span>
                  </Link>
                </div>
                <div className="w-4 sm:w-6 lg:w-8 flex-shrink-0" />
              </>
            )}
          </motion.div>
        </AnimatePresence>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 mt-4 flex justify-end">
          <ScrollButtons scrollRef={scrollRef as React.RefObject<HTMLElement | null>} />
        </div>
      </div>
    </section>
  );
}

// ─── Top Brands Split ─────────────────────────────────────────────────────────


function TopBrandsSplit() {
  const [deskImg, setDeskImg] = useState<string | null>(null);
  const [brands, setBrands] = useState<CatalogBrand[]>([]);
  const [activeBrand, setActiveBrand] = useState<string>("all");
  const [cache, setCache] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(false);
  const sectionRef = useRef<HTMLElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Load "All" and brands on mount — no lazy trigger needed for this section
  useEffect(() => {
    bannersApi.random(1).then(b => setDeskImg(b[0]?.url ?? null)).catch(() => { });
    catalogApi.listBrands()
      .then(res => setBrands(res.filter(b => b.isActive && b.logo).sort((a, b) => (b.productCount ?? 0) - (a.productCount ?? 0))))
      .catch(() => { });
    // Fetch "all" — larger limit so filtering out "others" still leaves ~20 main products
    setLoading(true);
    productsApi.list({ limit: 100 })
      .then(r => {
        const filtered = r.items
          .filter(p => !isOtherProduct(p.category, p.images?.[0]))
          .sort(() => Math.random() - 0.5)
          .slice(0, 20);
        setCache({ all: filtered });
      })
      .catch(() => { })
      .finally(() => setLoading(false));
  }, []);

  // Fetch brand-specific (or "all") products when activeBrand changes
  useEffect(() => {
    if (cache[activeBrand]?.length) return;
    setLoading(true);
    if (activeBrand === "all") {
      productsApi.list({ limit: 100 })
        .then(r => {
          const filtered = r.items
            .filter(p => !isOtherProduct(p.category, p.images?.[0]))
            .sort(() => Math.random() - 0.5)
            .slice(0, 20);
          setCache(prev => ({ ...prev, all: filtered }));
        })
        .catch(() => { })
        .finally(() => setLoading(false));
    } else {
      productsApi.list({ brand: activeBrand, limit: 20 })
        .then(r => {
          const shuffled = r.items.sort(() => Math.random() - 0.5);
          setCache(prev => ({ ...prev, [activeBrand]: shuffled }));
        })
        .catch(() => { })
        .finally(() => setLoading(false));
    }
  }, [activeBrand]);

  const products = cache[activeBrand] ?? [];

  return (
    <section className="bg-zinc-50 py-8 md:py-12 border-t border-zinc-100 overflow-hidden">
      <div className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-400 mb-2.5">Direct to consumer</p>
          <h2 className="font-sans text-3xl md:text-4xl lg:text-5xl font-extrabold text-zinc-950 leading-none tracking-tight">
            Top brands, refurbished
          </h2>
        </div>

        <div className="flex flex-col lg:flex-row gap-6 lg:gap-8 lg:items-start">
          {/* Left Image */}
          <div className="w-full lg:w-[320px] xl:w-[360px] flex-shrink-0 rounded-2xl overflow-hidden aspect-[4/3] lg:aspect-auto lg:h-[420px]">
            {deskImg && (
              <ProductImage
                src={deskImg}
                alt="Desk with tech"
                mode="cover"
                sizes="(max-width: 1024px) 100vw, 360px"
              />
            )}
          </div>

          {/* Right Content */}
          <div className="flex-1 min-w-0 flex flex-col gap-5">

            {/* Brand tabs */}
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
              {/* All tab */}
              <button
                onClick={() => setActiveBrand("all")}
                className={`flex-shrink-0 h-10 px-5 rounded-full font-bold text-sm transition-all duration-200 border ${activeBrand === "all"
                  ? "bg-zinc-950 text-white border-zinc-950 dark:bg-white dark:text-zinc-950 dark:border-white"
                  : "bg-white text-zinc-600 border-zinc-200 hover:border-zinc-950 hover:text-zinc-950 dark:bg-zinc-900/40 dark:text-zinc-400 dark:border-zinc-800 dark:hover:text-white dark:hover:border-zinc-400"
                  }`}
              >
                All
              </button>

              {brands.map((brand) => {
                const SvgLogo = BRAND_SVGS[brand.name];
                return (
                  <button
                    key={brand.id}
                    onClick={() => setActiveBrand(brand.name)}
                    className={`flex-shrink-0 h-10 px-4 rounded-full font-bold text-sm transition-all duration-200 border flex items-center gap-2 ${activeBrand === brand.name
                      ? "bg-zinc-950 text-white border-zinc-950 dark:bg-white dark:text-zinc-950 dark:border-white"
                      : "bg-white text-zinc-600 border-zinc-200 hover:border-zinc-950 hover:text-zinc-950 dark:bg-zinc-900/40 dark:text-zinc-400 dark:border-zinc-800 dark:hover:text-white dark:hover:border-zinc-400"
                      }`}
                  >
                    {SvgLogo && (
                      <span className={`shrink-0 ${activeBrand === brand.name ? "text-white dark:text-zinc-950" : "text-zinc-800 dark:text-zinc-200"}`}>
                        {SvgLogo}
                      </span>
                    )}
                    <span>{brand.name}</span>
                  </button>
                );
              })}
            </div>

            {/* Products horizontal scroll */}
            <AnimatePresence mode="wait">
              <motion.div
                key={activeBrand}
                ref={scrollRef}
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.25 }}
                className="flex gap-4 overflow-x-auto scrollbar-hide pb-4"
              >
                {loading ? (
                  [...Array(4)].map((_, i) => (
                    <div key={i} className="w-[220px] flex-shrink-0 animate-pulse">
                      <div className="h-44 rounded-xl bg-zinc-200 mb-3" />
                      <div className="h-3 bg-zinc-200 rounded-full w-3/4 mb-2" />
                      <div className="h-3 bg-zinc-200 rounded-full w-1/2 mb-3" />
                      <div className="h-5 bg-zinc-200 rounded-full w-1/3" />
                    </div>
                  ))
                ) : products.map((p, i) => {
                  const comparePrice = (p.comparePrice && p.comparePrice > p.price) ? p.comparePrice : null;
                  const ratingFilled = Math.round(p.rating ?? 4);
                  return (
                    <Link
                      key={p.id ?? i}
                      href={`/shop/${p.category.toLowerCase()}/${p.slug}`}
                      className="w-[220px] flex-shrink-0 bg-white rounded-xl p-4 border border-zinc-200/60 shadow-sm hover:shadow-md transition-shadow flex flex-col group cursor-pointer"
                    >
                      <div className="relative h-40 w-full rounded-xl mb-3 overflow-hidden bg-image-light">
                        <ProductImage src={p.images?.[0]} alt={p.name} />
                        <GradeBadge condition={p.condition ?? ''} className="absolute top-2 left-2 z-20" />
                      </div>
                      <p className="font-semibold text-zinc-950 text-[13px] leading-snug mb-2 line-clamp-2">{p.name}</p>
                      <div className="flex items-center gap-1 mb-auto">
                        {[...Array(5)].map((_, k) => <Star key={k} className={`h-3 w-3 ${k < ratingFilled ? "fill-zinc-950 text-zinc-950" : "fill-zinc-200 text-zinc-200"}`} />)}
                        <span className="text-[10px] font-bold text-zinc-400 ml-1">{(p.rating ?? 0).toFixed(1)}/5 ({p.reviewCount ?? 0})</span>
                      </div>
                      <div className="pt-3 mt-3 border-t border-zinc-100">
                        {p.price > 0 ? (
                          <>
                            <p className="text-xl font-bold text-zinc-950">£{p.price}</p>
                            <p className="text-[11px] text-zinc-400 line-through">£{comparePrice} new</p>
                          </>
                        ) : (
                          <p className="text-sm font-bold text-zinc-400 italic">Price on request</p>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </motion.div>
            </AnimatePresence>
            <div className="flex justify-end mt-2">
              <ScrollButtons scrollRef={scrollRef as React.RefObject<HTMLElement | null>} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}



const DISCOVER_SECTIONS = [
  { eyebrow: "Just in", title: "New Arrivals", params: { condition: "NEW", limit: 20 } },
  { eyebrow: "Community picks", title: "Top Rated", params: { limit: 20 } },
];

function DiscoverMore() {
  const [rows, setRows] = useState<PCard[][]>(DISCOVER_SECTIONS.map(() => []));
  const [sectionRef, trigger] = useLazyFetchTrigger();
  const rowScrollRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    if (trigger === 0) return;
    const toCard = (p: any): PCard => ({
      name: p.name,
      type: p.brand,
      spec: String((p.specs as any)?.storage ?? p.model ?? p.condition),
      price: `£${p.price ?? 0}`,
      was: (p.comparePrice && p.comparePrice > (p.price ?? 0)) ? `£${p.comparePrice}` : null,
      grade: p.condition,
      img: p.images?.[0] ?? "",
      link: `/shop/${p.category.toLowerCase()}/${p.slug}`,
    });
    Promise.all(
      DISCOVER_SECTIONS.map(s =>
        productsApi.list(s.params)
          .then(res => res.items
            .filter(p => !isOtherProduct(p.category, p.images?.[0]))
            .sort(() => Math.random() - 0.5)
            .map(toCard)
          )
          .catch(() => [] as PCard[])
      )
    ).then(setRows);
  }, [trigger]);

  const hasData = rows.some(r => r.length > 0);
  if (!hasData) return <section ref={sectionRef} className="min-h-[1px]" />;

  return (
    <section ref={sectionRef} className="py-10 bg-white overflow-hidden">
      {DISCOVER_SECTIONS.map((row, i) => {
        const items = rows[i];
        if (items.length === 0) return null;
        return (
          <div key={i} className="mb-14 last:mb-0">
            <div className="flex items-end justify-between mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 mb-6">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-400 mb-2.5">{row.eyebrow}</p>
                <h2 className="font-sans text-3xl md:text-4xl font-extrabold text-zinc-950 leading-none tracking-tight">
                  {row.title}
                </h2>
              </div>
              <a href="/shop/phones" className="hidden sm:flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-zinc-500 hover:text-zinc-950 transition-colors">
                See all <ArrowRight className="h-3.5 w-3.5" />
              </a>
            </div>
            <div
              ref={el => { rowScrollRefs.current[i] = el; }}
              className="flex gap-4 overflow-x-auto scrollbar-hide pl-4 sm:pl-6 lg:pl-8 pr-8 pb-2"
            >
              {items.map((p, j) => (
                <Link href={p.link ?? "/shop/phones"} key={j} className="block flex-shrink-0 w-[190px] md:w-[210px] group cursor-pointer">
                  <motion.div
                    initial={{ opacity: 0, x: 16 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: j * 0.05 }}
                    className="w-full"
                  >
                    <div className="relative aspect-square rounded-2xl bg-zinc-100 overflow-hidden mb-3 group-hover:shadow-lg transition-shadow duration-300">
                      <ProductImage
                        src={p.img}
                        alt={p.name}
                        mode={isOtherProduct(p.type, p.img) ? "product" : "cover"}
                        sizes="(max-width: 640px) 50vw, 210px"
                      />
                      <GradeBadge condition={p.grade ?? ''} className="absolute top-2.5 left-2.5 z-20" />
                    </div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-0.5">{p.type}</p>
                    <p className="font-bold text-zinc-950 text-xs leading-tight truncate mb-1.5">{p.name}</p>
                    {Number(p.price.replace(/[^0-9.]/g, "")) > 0 ? (
                      <div className="flex items-baseline gap-2">
                        <span className="text-base font-bold text-zinc-950">{p.price}</span>
                        {p.was && <span className="text-[11px] text-zinc-400 line-through">{p.was}</span>}
                      </div>
                    ) : (
                      <span className="text-sm font-bold text-zinc-400 italic">Price on request</span>
                    )}
                  </motion.div>
                </Link>
              ))}
            </div>
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 mt-3 flex justify-end">
              <ScrollButtons scrollRef={{ get current() { return rowScrollRefs.current[i]; } } as React.RefObject<HTMLElement | null>} />
            </div>
          </div>
        );
      })}
    </section>
  );
}

// ─── Budget Picks ──────────────────────────────────────────────────────────────
const BUDGET_ROWS = [
  { title: "Under £100", badge: "Great Value", params: { maxPrice: 100 } },
  { title: "£100 – £300", badge: "Best Sellers", params: { minPrice: 100, maxPrice: 300 } },
  { title: "£300 – £600", badge: "Most Popular", params: { minPrice: 300, maxPrice: 600 } },
  { title: "£600 – £1000", badge: "Premium Picks", params: { minPrice: 600, maxPrice: 1000 } },
  { title: "£1000+", badge: "Top of the Range", params: { minPrice: 1000 } },
];

function BudgetPicks() {
  const [rows, setRows] = useState<PCard[][]>(BUDGET_ROWS.map(() => []));
  const [sectionRef, trigger] = useLazyFetchTrigger();

  useEffect(() => {
    if (trigger === 0) return;
    const toCard = (p: any): PCard => ({
      name: p.name,
      type: p.brand,
      spec: String((p.specs as any)?.storage ?? p.model ?? p.condition),
      price: `£${p.price ?? 0}`,
      was: (p.comparePrice && p.comparePrice > (p.price ?? 0)) ? `£${p.comparePrice}` : null,
      grade: p.condition,
      img: p.images?.[0] ?? "",
      link: `/shop/${p.category.toLowerCase()}/${p.slug}`,
    });
    Promise.all(
      BUDGET_ROWS.map(r =>
        productsApi.list({ ...r.params, limit: 40 })
          .then(res => res.items.map(toCard))
          .catch(() => [] as PCard[])
      )
    ).then(setRows);
  }, [trigger]);

  function PriceRow({ title, badge, items }: { title: string; badge: string; items: PCard[] }) {
    const priceRowScrollRef = useRef<HTMLDivElement | null>(null);
    if (items.length === 0) return null;
    return (
      <div className="mb-12 last:mb-0">
        <div className="flex items-center justify-between mb-6 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-4">
            <h3 className="text-2xl md:text-3xl font-bold tracking-tight text-zinc-950">{title}</h3>
            <span className="px-3 py-1 bg-accent text-white text-[10px] font-bold uppercase tracking-widest rounded-full">{badge}</span>
          </div>
          <a href="/shop/phones" className="hidden sm:flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-zinc-500 hover:text-zinc-950 transition-colors">
            See all <ArrowRight className="h-3.5 w-3.5" />
          </a>
        </div>
        <div ref={priceRowScrollRef} className="flex gap-4 overflow-x-auto scrollbar-hide pb-2">
          <div className="w-4 sm:w-6 lg:w-8 flex-shrink-0" />
          {items.map((p, i) => (
            <Link href={p.link ?? "/shop/phones"} key={i} className="block flex-shrink-0 w-[190px] md:w-[210px] group cursor-pointer">
              <motion.div
                initial={{ opacity: 0, x: 16 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.06 }}
                className="w-full"
              >
                <div className="relative aspect-square rounded-2xl bg-zinc-100 overflow-hidden mb-3 group-hover:shadow-lg transition-shadow duration-300">
                  <ProductImage
                    src={p.img}
                    alt={p.name}
                    mode={isOtherProduct(p.type, p.img) ? "product" : "cover"}
                    sizes="(max-width: 640px) 50vw, 210px"
                  />
                  <GradeBadge condition={p.grade ?? ''} className="absolute top-2.5 left-2.5 z-20" />
                  <button className="absolute bottom-2.5 right-2.5 z-20 h-9 w-9 rounded-full bg-zinc-950 text-white flex items-center justify-center opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300">
                    <ShoppingCart className="h-3.5 w-3.5" />
                  </button>
                </div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-0.5">{p.type}</p>
                <p className="font-bold text-zinc-950 text-xs leading-tight truncate mb-1.5">{p.name}</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-base font-bold text-zinc-950">{p.price}</span>
                  <span className="text-[11px] text-zinc-400 line-through">{p.was}</span>
                </div>
              </motion.div>
            </Link>
          ))}
          <div className="w-4 sm:w-6 lg:w-8 flex-shrink-0" />
        </div>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 mt-3 flex justify-end">
          <ScrollButtons scrollRef={priceRowScrollRef as React.RefObject<HTMLElement | null>} />
        </div>
      </div>
    );
  }

  const hasData = rows.some(r => r.length > 0);

  return (
    <section ref={sectionRef} className="py-20 bg-zinc-50 border-y border-zinc-100 overflow-hidden min-h-[200px]">
      {hasData && (
        <>
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 mb-8">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-400 mb-2.5">Pocket friendly</p>
            <h2 className="font-sans text-3xl md:text-4xl lg:text-5xl font-extrabold text-zinc-950 leading-none tracking-tight">
              Budget deals
            </h2>
          </div>
          {BUDGET_ROWS.map((r, i) => (
            <PriceRow key={i} title={r.title} badge={r.badge} items={rows[i]} />
          ))}
        </>
      )}
    </section>
  );
}

// ─── Sell Your Device CTA ─────────────────────────────────────────────────────
function SellCTA() {
  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-24">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="relative overflow-hidden rounded-[2.5rem] bg-zinc-950 px-10 py-16 md:px-20 md:py-20"
      >
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-accent/10 rounded-full blur-[100px] translate-x-1/3 -translate-y-1/3 pointer-events-none" />
        <div className="relative z-10 grid lg:grid-cols-2 gap-10 items-center">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-400 mb-2.5">Sell with TechStop</p>
            <h2 className="font-sans text-3xl md:text-4xl lg:text-5xl font-extrabold text-white leading-tight tracking-tight mb-4">
              Your old tech is worth more than you think
            </h2>
            <p className="text-zinc-400 text-lg leading-relaxed">
              Get an instant quote, free collection, and same-week payment. No hassle, no lowball offers.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row lg:flex-col xl:flex-row gap-4 lg:justify-end">
            <a href="/trade-in" className="h-14 px-8 bg-accent text-white rounded-2xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-accent-dark transition-colors">
              Get instant quote <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </div>
      </motion.div>
    </section>
  );
}

// ─── Newsletter ───────────────────────────────────────────────────────────────
function Newsletter() {
  const [mounted, setMounted] = useState(false);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => setMounted(true), []);

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    if (!email.trim()) {
      setStatus("error");
      setErrorMsg("Please enter your email address.");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setStatus("error");
      setErrorMsg("Please enter a valid email address.");
      return;
    }

    setStatus("loading");

    // Simulate API call
    setTimeout(() => {
      setStatus("success");
      setEmail("");
      if (typeof window !== "undefined") {
        localStorage.setItem("ts_newsletter_subscribed", "true");
      }
    }, 1000);
  };

  return (
    <section className="border-t border-zinc-100 dark:border-zinc-900 bg-zinc-50 dark:bg-zinc-950/20 py-20 font-sans">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-400 mb-2.5">Stay in the loop</p>
          <h2 className="font-sans text-3xl md:text-4xl lg:text-5xl font-extrabold text-zinc-950 dark:text-white leading-tight tracking-tight mb-4">
            Deals before they sell out
          </h2>
          <p className="text-zinc-500 dark:text-zinc-400 mb-10">Weekly drops, exclusive discounts, and e-waste reports. No spam.</p>

          {mounted ? (
            <div className="max-w-md mx-auto">
              <AnimatePresence mode="wait">
                {status === "success" ? (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="p-6 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 rounded-3xl text-left flex items-start gap-4"
                  >
                    <div className="h-10 w-10 bg-emerald-500/10 dark:bg-emerald-500/25 rounded-full flex items-center justify-center shrink-0 text-emerald-600 dark:text-emerald-400">
                      <Check className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-extrabold text-zinc-900 dark:text-zinc-100">Successfully Subscribed!</h4>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 font-semibold">Thank you! We've sent a welcome code with 10% discount to your email.</p>
                    </div>
                  </motion.div>
                ) : (
                  <form onSubmit={handleSubscribe} className="space-y-2">
                    <div className="flex flex-col sm:flex-row gap-3">
                      <input
                        type="text"
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          if (status === "error") setStatus("idle");
                        }}
                        disabled={status === "loading"}
                        placeholder="you@example.com"
                        className={`h-14 flex-1 px-6 rounded-2xl bg-white dark:bg-zinc-900 border ${status === "error"
                          ? "border-red-500 focus:ring-red-500"
                          : "border-zinc-200 dark:border-zinc-800 focus:ring-accent"
                          } text-sm font-medium outline-none focus:ring-2 transition-all text-foreground`}
                      />
                      <button
                        type="submit"
                        disabled={status === "loading"}
                        className="h-14 px-7 bg-zinc-950 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-950 rounded-2xl font-bold text-sm transition-colors flex-shrink-0 flex items-center justify-center min-w-[120px]"
                      >
                        {status === "loading" ? (
                          <svg className="animate-spin h-5 w-5 text-current" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                        ) : (
                          "Subscribe"
                        )}
                      </button>
                    </div>
                    {status === "error" && (
                      <p className="text-left text-xs font-bold text-red-500 px-2 mt-1">{errorMsg}</p>
                    )}
                  </form>
                )}
              </AnimatePresence>
            </div>
          ) : (
            <div className="h-14 max-w-md mx-auto rounded-2xl bg-zinc-200/60 animate-pulse" />
          )}
        </div>
      </div>
    </section>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

// ─── Store Location Section ──────────────────────────────────────────────────
function StoreLocationSection() {
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string>("");

  useEffect(() => {
    storesApi.list()
      .then(data => {
        setStores(data);
        if (data.length > 0) {
          setSelectedStoreId(data[0].id);
        }
      })
      .catch(() => { });
  }, []);

  const activeStore = stores.find(s => s.id === selectedStoreId) || stores[0];
  const storeName = activeStore?.name || "TechStop Leicester";
  const storeAddress = activeStore ? `${activeStore.address}, ${activeStore.city} ${activeStore.postcode}` : "148B Melton Rd, Leicester LE4 5EE";
  const storeHours = activeStore?.openingHours || "Mon–Sat, 9:00 AM – 6:00 PM";
  const storePhone = activeStore?.phone || "+447343055398";
  const mapsLink = activeStore ? `https://maps.google.com/?q=${encodeURIComponent(`${activeStore.name}, ${activeStore.address}, ${activeStore.city} ${activeStore.postcode}`)}` : "https://maps.app.goo.gl/fyc8Zuy4hjh3tG3x8";

  return (
    <section className="relative py-12 lg:py-16 bg-zinc-950 overflow-hidden font-sans border-t border-b border-zinc-900/80">

      {/* Premium Background Decor */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.03] dark:opacity-[0.05]" style={{ backgroundImage: 'linear-gradient(to right, #888 1px, transparent 1px), linear-gradient(to bottom, #888 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
      <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-red-500/10 dark:bg-red-500/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 left-1/4 w-[400px] h-[400px] bg-zinc-400/10 dark:bg-white/5 rounded-full blur-[100px] pointer-events-none" />

      <div className="relative mx-auto w-full max-w-[1500px] px-4 sm:px-6 lg:px-12">
        <div className="flex flex-col-reverse lg:grid lg:grid-cols-12 gap-8 lg:gap-16 items-center">

          {/* Left info column */}
          <div className="w-full lg:col-span-5 flex flex-col items-start text-left relative z-10 justify-center">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-extrabold text-white mb-4 tracking-tight">
              Visit our store.
            </h2>
            <p className="text-zinc-400 mb-8 max-w-md font-medium leading-relaxed">
              Drop by for instant diagnostics, 45-minute repairs, or trade in your old device for cash on the spot.
            </p>

            {stores.length > 1 && (
              <div className="w-full mb-8 relative z-20">
                <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400 dark:text-zinc-500 block mb-2">Select Store Location</label>
                <div className="relative">
                  <select
                    value={selectedStoreId}
                    onChange={(e) => setSelectedStoreId(e.target.value)}
                    className="appearance-none h-14 w-full max-w-md rounded-xl bg-white/70 dark:bg-zinc-900/70 backdrop-blur-md border border-zinc-200 dark:border-zinc-800 px-5 pr-10 text-sm font-bold text-zinc-900 dark:text-zinc-100 outline-none focus:border-red-500 dark:focus:border-red-500 focus:ring-4 focus:ring-red-500/10 transition-all shadow-sm"
                  >
                    {stores.map(s => (
                      <option key={s.id} value={s.id} className="text-zinc-900 dark:text-zinc-900">{s.name} ({s.city})</option>
                    ))}
                  </select>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-400">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                  </div>
                </div>
              </div>
            )}

            <div className="relative w-full max-w-md bg-zinc-800/40 backdrop-blur-xl rounded-[1.5rem] border border-zinc-700/50 p-5 space-y-4 mb-6 shadow-xl overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-red-500/50 to-transparent" />

              <div className="flex gap-3 items-center group">
                <div className="h-9 w-9 bg-red-500/10 rounded-xl border border-red-500/20 flex items-center justify-center shrink-0 group-hover:scale-110 group-hover:bg-red-500 group-hover:text-white transition-all duration-300 text-red-400">
                  <MapPin className="h-4 w-4" />
                </div>
                <div>
                  <span className="text-[9px] font-black uppercase tracking-wider text-zinc-500 block leading-none mb-1">Store Address</span>
                  <span className="text-sm font-bold text-zinc-100">{storeAddress}</span>
                </div>
              </div>

              <div className="flex gap-3 items-center group">
                <div className="h-9 w-9 bg-red-500/10 rounded-xl border border-red-500/20 flex items-center justify-center shrink-0 group-hover:scale-110 group-hover:bg-red-500 group-hover:text-white transition-all duration-300 text-red-400">
                  <Clock className="h-4 w-4" />
                </div>
                <div>
                  <span className="text-[9px] font-black uppercase tracking-wider text-zinc-500 block leading-none mb-1">Opening Hours</span>
                  <span className="text-sm font-bold text-zinc-100">{storeHours}</span>
                </div>
              </div>

              <div className="flex gap-3 items-center group">
                <div className="h-9 w-9 bg-red-500/10 rounded-xl border border-red-500/20 flex items-center justify-center shrink-0 group-hover:scale-110 group-hover:bg-red-500 group-hover:text-white transition-all duration-300 text-red-400">
                  <Phone className="h-4 w-4" />
                </div>
                <div>
                  <span className="text-[9px] font-black uppercase tracking-wider text-zinc-500 block leading-none mb-1">Store Contact</span>
                  <a href={`tel:${storePhone}`} className="text-sm font-bold text-zinc-100 hover:text-red-400 transition-colors">{storePhone}</a>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 w-full max-w-md lg:w-auto">
              <a
                href={mapsLink}
                target="_blank"
                rel="noopener noreferrer"
                className="group relative px-8 py-4 bg-white text-zinc-950 rounded-xl text-sm font-black transition-all flex items-center justify-center gap-2 text-center overflow-hidden hover:scale-105 active:scale-95 shadow-[0_10px_20px_rgba(255,255,255,0.1)]"
              >
                <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-red-600 to-red-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                <span className="relative flex items-center gap-2 group-hover:text-white">Get Directions <MapPin className="h-4 w-4" /></span>
              </a>
            </div>
          </div>

          {/* Right map column */}
          <div className="w-full lg:col-span-7 h-[300px] lg:h-[450px] rounded-[2rem] lg:rounded-[2.5rem] overflow-hidden border-4 lg:border-[6px] border-white/50 dark:border-zinc-800/30 shadow-[0_15px_30px_-10px_rgba(0,0,0,0.1)] dark:shadow-[0_30px_60px_-15px_rgba(0,0,0,0.5)] relative group bg-zinc-100 dark:bg-zinc-950 backdrop-blur-sm z-10">
            <iframe
              title="TechStop Store Locations Map"
              width="100%"
              height="100%"
              frameBorder="0"
              style={{ border: 0 }}
              src={activeStore?.mapsEmbedUrl ?? `https://maps.google.com/maps?q=${encodeURIComponent(`${storeName}, ${storeAddress}`)}&t=&z=17&ie=UTF8&iwloc=&output=embed`}
              allowFullScreen
              className="w-full h-full transition-all duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)]"
            />
          </div>

        </div>
      </div>
    </section>
  );
}

export default function HomePage() {
  useEffect(() => {
    const handlePageShow = (e: PageTransitionEvent) => {
      if (e.persisted) window.location.reload();
    };
    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, []);

  return (
    <main className="flex min-h-screen flex-col bg-background text-foreground font-sans">
      <div className="bg-zinc-950 flex flex-col -mt-[1px] pt-[1px]">
        <PromoCarouselBanner />
        <MarqueeStrip />
      </div>
      {/* <Hero /> */}
      <CategoryQuickNav />
      <TradeInCTASection />

      {/* <CategoryBento /> */}
      <FeaturedShop />
      <TopBrandsSplit />
      <NewArrivals />
      <BestDealsSplit />
      <DiscoverMore />
      <BudgetPicks />
      <TrustPillars />
      <SavingsComparison />
      <HowItWorks />
      <GradeGuide />
      <AppPreview />
      <Reviews />

      <StoreLocationSection />
      <Footer />
    </main>
  );
}
