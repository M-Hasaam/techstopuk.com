"use client";

import React, { useState, useEffect, useRef } from "react";
import { notFound, useParams } from "next/navigation";
import { useCart } from "@/context/cart-context";
import { productsApi } from "@/lib/api";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  ChevronDown, ChevronLeft, ChevronRight, ShoppingCart, Star, Check,
  ArrowLeft, ArrowRight, Zap, RefreshCw, Wrench, X, SlidersHorizontal,
  Battery, Camera, Monitor, Wifi, Cpu, BadgeCheck
} from "lucide-react";
import Footer from "@/components/Footer";
import { catalogApi } from "@/lib/api";
import { GradeKey, GRADE_CONFIG, getGradeConfig } from "@/lib/grades";
import { GradeBadge } from "@/components/GradeBadge";
import ProductImage from "@/components/ProductImage";
import { BRAND_SVGS, getSubcategoryIcon } from "@/lib/brand-logos";

// ─── Scroll Buttons ───────────────────────────────────────────────────────────
function ScrollButtons({ scrollRef }: { scrollRef: React.RefObject<HTMLElement | null> }) {
  const scroll = (dir: "left" | "right") => {
    if (!scrollRef.current) return;
    const w = scrollRef.current.clientWidth;
    scrollRef.current.scrollBy({ left: dir === "left" ? -w * 0.75 : w * 0.75, behavior: "smooth" });
  };
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => scroll("left")}
        aria-label="Scroll left"
        className="h-10 w-10 rounded-full bg-zinc-100 text-zinc-600 flex items-center justify-center hover:bg-zinc-200 transition-colors"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <button
        onClick={() => scroll("right")}
        aria-label="Scroll right"
        className="h-10 w-10 rounded-full bg-zinc-950 text-white flex items-center justify-center hover:bg-zinc-800 transition-colors"
      >
        <ChevronRight className="h-5 w-5" />
      </button>
    </div>
  );
}



const GRADES: GradeKey[] = ['NEW', 'A', 'B', 'C', 'F'];

const SORT_OPTIONS = [
  { id: "featured",   label: "Featured" },
  { id: "price-asc",  label: "Price: Low to High" },
  { id: "price-desc", label: "Price: High to Low" },
  { id: "rating",     label: "Top Rated" },
];


const BRAND_LOGOS: Record<string, React.ReactNode> = {
  Apple: (
    <svg className="w-5 h-5 fill-current" viewBox="0 0 170 170">
      <path d="M150.37 130.25c-2.45 5.66-5.35 10.87-8.71 15.66-4.58 6.53-8.33 11.05-11.22 13.56-4.48 4.12-9.28 6.23-14.42 6.35-3.69 0-8.14-1.05-13.32-3.18-5.19-2.12-9.97-3.17-14.34-3.17-4.58 0-9.49 1.05-14.75 3.17-5.26 2.13-9.5 3.24-12.74 3.35-4.34.13-9.13-1.92-14.36-6.17-2.9-2.42-6.66-6.87-11.28-13.38-5.31-7.5-9.87-15.93-13.68-25.3-3.82-9.37-5.73-18.41-5.73-27.13 0-14.68 4.13-26.69 12.39-36.03 8.26-9.34 18.26-14.07 30-14.18 5.7.1 11.23 1.57 16.58 4.41 5.35 2.84 9.17 4.26 11.48 4.26 2.12 0 6.06-1.48 11.83-4.44 5.76-2.96 11.29-4.38 16.59-4.26 12.18.23 22.06 4.79 29.62 13.68 5.48 6.4 9.27 13.68 11.39 21.84-12.83 5.25-21.43 12.98-25.8 23.2-4.38 10.22-4.14 20.9 0 32.06 3.1 8.35 8.1 15.35 15.02 21.02zm-28.53-118.73c0 7.9-2.88 15.15-8.63 21.75-5.76 6.6-12.79 10.5-21.1 11.72.13-7.5 3.12-14.8 8.98-21.87 5.86-7.07 13-11.13 21.42-12.18.63 8.33-.67 15.2-1.67 20.58z"/>
    </svg>
  ),
  Samsung: (
    <span className="font-extrabold text-[9px] tracking-widest uppercase">Samsung</span>
  ),
  Google: (
    <svg className="w-5 h-5" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
    </svg>
  ),
  OnePlus: (
    <span className="font-extrabold text-[10px] tracking-tight border-2 border-black px-1.5 py-0.5 rounded-sm uppercase">1+</span>
  ),
  Sony: (
    <span className="font-black text-[10px] tracking-widest uppercase italic">Sony</span>
  ),
  Nintendo: (
    <span className="font-extrabold text-[8px] bg-red-600 text-white px-2 py-0.5 rounded-full uppercase tracking-wider">Nintendo</span>
  ),
  Microsoft: (
    <svg className="w-4 h-4" viewBox="0 0 23 23">
      <rect width="10.8" height="10.8" fill="#F25022"/>
      <rect x="12.2" width="10.8" height="10.8" fill="#7FBA00"/>
      <rect y="12.2" width="10.8" height="10.8" fill="#00A4EF"/>
      <rect x="12.2" y="12.2" width="10.8" height="10.8" fill="#FFB900"/>
    </svg>
  ),
  Dell: (
    <span className="font-extrabold text-[9px] border border-black rounded-full px-1.5 py-0.5">DELL</span>
  ),
  Lenovo: (
    <span className="font-bold text-[9px] bg-red-600 text-white px-1.5 py-0.5 uppercase tracking-tighter">Lenovo</span>
  ),
  Bose: (
    <span className="font-bold text-[8px] tracking-widest uppercase italic">Bose</span>
  ),
};

const DIAGNOSTIC_STEPS: { id: string; label: string; icon: React.ComponentType<{ className?: string }>; description: string; checks: string[] }[] = [
  { id: "battery", label: "Battery Health", icon: Battery, description: "Every device is certified to have at least 85% battery capacity compared to new, often higher.", checks: ["Capacity verification", "Amperage testing", "Charge cycles count", "Overheating check"] },
  { id: "camera", label: "Camera & Lens", icon: Camera, description: "Lenses are inspected for scratches, autofocus calibration is tested, and flash output is verified.", checks: ["Autofocus speed calibration", "Flash synchronization", "Front/rear sensor check", "Lens scratch audit"] },
  { id: "screen", label: "Screen & Touch", icon: Monitor, description: "Digitizer response is scanned across the whole screen. Pixels are inspected for discoloration or dead spots.", checks: ["Multi-touch responsiveness", "Dead pixel scan", "Backlight consistency", "Scratch/crack assessment"] },
  { id: "wireless", label: "Connectivity", icon: Wifi, description: "WiFi modules, Bluetooth chips, and cellular bands are connected to diagnostic relays to verify signal strengths.", checks: ["WiFi 6 bandwidth test", "Bluetooth pair stability", "Cellular band activation", "NFC chip test"] },
  { id: "buttons", label: "Buttons & Ports", icon: Cpu, description: "Haptic engines, mechanical buttons, USB-C/Lightning ports, and headphone jacks are physically cycle-tested.", checks: ["Haptic feedback check", "USB port current stability", "Button tactile response", "Speaker grill cleaning"] },
];




export default function CategoryPage() {
  const params = useParams();
  const categorySlug = (params?.category as string)?.toLowerCase();

  // All category content comes from the API — admin panel is the single source of truth
  const [dynamicCat, setDynamicCat] = useState<{ name: string; displayName?: string; description?: string } | null>(null);
  const [catNotFound, setCatNotFound] = useState(false);
  useEffect(() => {
    catalogApi.listCategories({ includeInactive: false } as any)
      .then(cats => {
        const found = cats.find(c => c.slug === categorySlug);
        if (found) setDynamicCat({
          name: found.name,
          displayName: found.displayName ?? undefined,
          description: found.description ?? undefined,
        });
        else setCatNotFound(true);
      })
      .catch(() => setCatNotFound(true));
  }, [categorySlug]);

  // meta — name = short nav label, plural = full display heading
  const meta = dynamicCat
    ? {
        label:       dynamicCat.name,
        plural:      dynamicCat.displayName ?? dynamicCat.name,
        description: dynamicCat.description ?? "",
      }
    : null;

  const [activeBrands, setActiveBrands] = useState<string[]>([]);
  const [activeGrades, setActiveGrades] = useState<string[]>([]);
  const [sort, setSort] = useState("featured");
  const [showSort, setShowSort] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [activeTabBrand, setActiveTabBrand] = useState<string>("all");
  const [selectedDiagnostic, setSelectedDiagnostic] = useState<string>("battery");
  const [displayProducts, setDisplayProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [subBrands, setSubBrands] = useState<{ brand: string; slug: string; logo: string | null; image: string | null }[]>([]);

  const { addItem } = useCart();
  const topPicksScrollRef = useRef<HTMLDivElement | null>(null);
  const brandsScrollRef = useRef<HTMLDivElement | null>(null);


  useEffect(() => {
    setLoading(true);
    catalogApi.listCategories()
      .then(cats => cats.find(c => c.name.toLowerCase() === categorySlug.toLowerCase())?.name ?? null)
      .catch(() => null)
      .then(async (apiCategory) => {
        if (!apiCategory) { setLoading(false); return; }
        productsApi.brands(apiCategory).then(setSubBrands).catch(() => {});
        try {
          const res = await productsApi.list({ category: apiCategory, limit: 100 });
          const mapped = res.items.map(p => ({
            id: p.slug, title: p.name, brand: p.brand, grade: p.condition,
            storage: String((p.specs as Record<string, unknown>)?.storage ?? "—"),
            price: p.price, originalPrice: p.comparePrice ?? p.price,
            rating: p.rating, reviews: p.reviewCount, image: p.images[0] ?? "", stock: p.stock,
          }));
          const shuffled = mapped.sort(() => Math.random() - 0.5);
          setDisplayProducts(shuffled);
        } catch { /* ignore */ } finally { setLoading(false); }
      });
  }, [categorySlug]);

  if (catNotFound) { notFound(); return null; }
  if (!meta) return null; // still loading dynamic meta

  async function handleAdd(id: string) {
    const product = displayProducts.find(p => p.id === id);
    if (product) {
      try {
        await addItem({
          productId: product.id,
          quantity: 1,
          price: product.price,
          name: product.title,
          slug: product.id,
          image: product.image,
        });
      } catch { /* offline fallback handled by cart context */ }
    }
    setAddedIds(prev => new Set(prev).add(id));
    setTimeout(() => setAddedIds(prev => { const s = new Set(prev); s.delete(id); return s; }), 2000);
  }

  function toggleFilter(item: string, list: string[], setList: (v: string[]) => void) {
    setList(list.includes(item) ? list.filter(x => x !== item) : [...list, item]);
  }

  const allProducts = displayProducts;
  const dynamicBrands = subBrands.map(b => b.brand);
  const bannerImage = activeTabBrand === "all"
    ? displayProducts[0]?.image ?? ""
    : (displayProducts.find(p => p.brand === activeTabBrand)?.image ?? displayProducts[0]?.image ?? "");

  let filtered = allProducts.filter(p => {
    const matchBrand = activeBrands.length === 0 || activeBrands.includes(p.brand);
    const matchGrade = activeGrades.length === 0 || activeGrades.includes(p.grade);
    return matchBrand && matchGrade;
  });

  if (sort === "price-asc") filtered = [...filtered].sort((a, b) => a.price - b.price);
  if (sort === "price-desc") filtered = [...filtered].sort((a, b) => b.price - a.price);
  if (sort === "rating") filtered = [...filtered].sort((a, b) => b.rating - a.rating);

  return (
    <div className="min-h-screen pt-16 lg:pt-20 bg-background text-foreground font-sans selection:bg-accent selection:text-white">

      {/* ── Most Wanted Sub-brands & Accessories ────────────────────────── */}
      <section className="bg-white border-b border-zinc-100 pb-8 pt-4">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          
          {/* Sub-brand Grid */}
          {subBrands.length > 0 && (
            <div>
              <h2 className="text-lg font-extrabold mb-4 tracking-tight">Shop our most wanted</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {subBrands.map((item) => (
                  <button
                    key={item.brand}
                    onClick={() => {
                      setActiveBrands([item.brand]);
                      setActiveGrades([]);
                      const element = document.getElementById("product-grid");
                      if (element) element.scrollIntoView({ behavior: "smooth" });
                    }}
                    className="flex flex-col gap-2.5 group text-left"
                  >
                    <div className="relative w-full aspect-[3/4] rounded-[24px] overflow-hidden bg-zinc-100">
                      <ProductImage src={item.image} alt={item.brand} mode="cover" sizes="(max-width: 640px) 45vw, 25vw" />
                    </div>
                    <span className="font-extrabold text-sm text-zinc-900 group-hover:text-black pl-1">
                      {item.brand}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

        </div>
      </section>

      {/* ── Reassurance Bar ─────────────────────────────────────────────────── */}
      <div className="bg-zinc-50 border-b border-zinc-200 py-3">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex flex-wrap justify-start items-center gap-4 md:gap-6 text-[11px] font-bold text-zinc-600">
          <div className="flex items-center gap-2">
            <span className="text-emerald-600">✓</span> 90-point quality check on all devices
          </div>
          <div className="w-1 h-1 rounded-full bg-zinc-300 hidden md:block"></div>
          <div className="flex items-center gap-2">
            <span className="text-emerald-600">✓</span> Free 30-Day Returns
          </div>
          <div className="w-1 h-1 rounded-full bg-zinc-300 hidden md:block"></div>
          <div className="flex items-center gap-2">
            <span className="text-emerald-600">✓</span> Free Express 1-2 Day Delivery
          </div>
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────────────────────────── */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-8 pb-12">
        <div className="flex flex-col">

          {/* ── Top Picks Carousel ────────────────────────────────────────────────── */}
          <div className="mb-12">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold tracking-tight">Top Picks for You</h2>
            </div>
            <div ref={topPicksScrollRef} className="flex gap-4 md:gap-6 overflow-x-auto scrollbar-hide pb-4 -mx-4 px-4 sm:mx-0 sm:px-0">
              {allProducts.slice(0, 8).map(product => (
                <Link href={`/shop/${categorySlug}/${product.id}`} key={`top-${product.id}`} className="shrink-0 w-[240px] md:w-[280px] group block">
                  <div className="bg-white rounded-[32px] p-3 border border-zinc-200 hover:border-black hover:shadow-xl transition-all duration-300 h-full flex flex-col">
                    <div className="relative aspect-square rounded-[24px] bg-image-light mb-5 overflow-hidden">
                      <span className="absolute top-4 left-4 inline-flex px-2.5 py-1 rounded-full bg-accent text-[10px] font-bold text-white border border-accent shadow-sm uppercase tracking-wider z-20">
                        Best Seller
                      </span>
                      <ProductImage src={product.image} alt={product.title} />
                    </div>
                    <div className="px-2 flex flex-col flex-1 pb-2">
                      <h3 className="font-bold text-lg leading-tight mb-1">{product.title}</h3>
                      <div className="flex items-baseline gap-2 mt-auto pt-4">
                        {product.price > 0
                          ? <span className="text-xl md:text-2xl font-bold tracking-tight">£{product.price}</span>
                          : <span className="text-sm font-bold text-zinc-400 italic">Price on Request</span>
                        }
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
            <div className="flex justify-end mt-4">
              <ScrollButtons scrollRef={topPicksScrollRef as React.RefObject<HTMLElement | null>} />
            </div>
          </div>

          {/* ── Top Brands Refurbished (Screenshot 2 Alignment) ────────────────── */}
          <div className="mb-12">
            <h2 className="text-xl font-extrabold tracking-tight text-zinc-900 mb-5">Top brands, refurbished</h2>
            
            <div className="bg-[#f0f2f5]/40 border border-zinc-200 rounded-[32px] p-5 md:p-7 flex flex-col lg:flex-row gap-6 md:gap-8">
              
              {/* Left Column: Lifestyle Flatlay Banner */}
              <div className="w-full lg:w-[260px] h-[340px] md:h-[400px] rounded-[24px] overflow-hidden shrink-0 relative shadow-sm bg-[#f5f5f7]">
                {bannerImage && (
                  <ProductImage src={bannerImage} alt="Tech Stop lifestyle flatlay" mode="product" hover={false} sizes="(max-width: 1024px) 100vw, 260px" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent flex flex-col justify-end p-5">
                  <span className="text-[10px] font-bold text-accent uppercase tracking-widest mb-1">TechStop Certified</span>
                  <h3 className="text-white font-extrabold text-lg leading-tight">Refurbished & Tested by Experts</h3>
                </div>
              </div>

              {/* Right Column: Logos & Product Carousel */}
              <div className="flex-1 min-w-0 flex flex-col justify-between">
                
                {/* Brand Tabs Logo Row */}
                <div className="flex flex-wrap items-center gap-3 mb-6">
                  <button
                    onClick={() => setActiveTabBrand("all")}
                    className={`h-14 px-5 rounded-2xl text-xs font-bold transition-all border flex items-center justify-center bg-white ${
                      activeTabBrand === "all"
                        ? "border-black dark:border-white shadow-sm text-zinc-950 dark:text-white"
                        : "border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:border-zinc-400 dark:hover:border-zinc-500"
                    }`}
                  >
                    All Brands
                  </button>
                  {subBrands.map((b) => {
                    const SvgLogo = BRAND_SVGS[b.brand];
                    return (
                      <button
                        key={b.brand}
                        onClick={() => setActiveTabBrand(b.brand)}
                        className={`h-14 px-5 min-w-[72px] rounded-2xl transition-all border flex items-center justify-center gap-2 bg-white ${
                          activeTabBrand === b.brand
                            ? "border-black dark:border-white shadow-sm text-zinc-950 dark:text-white"
                            : "border-zinc-200 dark:border-zinc-800 text-zinc-600 hover:border-zinc-400 dark:hover:border-zinc-500"
                        }`}
                      >
                        {SvgLogo && (
                          <span className={`shrink-0 ${activeTabBrand === b.brand ? "text-zinc-950 dark:text-white" : "text-zinc-700 dark:text-zinc-300"}`}>
                            {SvgLogo}
                          </span>
                        )}
                        <span className={`font-extrabold text-xs tracking-tight ${
                          activeTabBrand === b.brand ? "text-zinc-950 dark:text-white" : "text-zinc-700 dark:text-zinc-300"
                        }`}>{b.brand}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Horizontal Product Carousel */}
                <div className="relative flex-1">
                  <div ref={brandsScrollRef} className="flex gap-4 overflow-x-auto scrollbar-hide pb-2 -mx-4 px-4 sm:mx-0 sm:px-0">
                    {allProducts
                      .filter(p => activeTabBrand === "all" || p.brand === activeTabBrand)
                      .map(product => (
                        <Link href={`/shop/${categorySlug}/${product.id}`} key={`tab-${product.id}`} className="shrink-0 w-[210px] md:w-[230px] group block">
                          <div className="bg-white rounded-[24px] p-3 border border-zinc-200 hover:border-black hover:shadow-lg transition-all duration-300 h-full flex flex-col justify-between">
                            
                            {/* Centered Image */}
                            <div className="relative aspect-square rounded-[18px] bg-[#f5f5f7] mb-3 overflow-hidden">
                              <ProductImage src={product.image} alt={product.title} />
                              <GradeBadge condition={product.grade ?? ''} className="absolute top-2 left-2 z-20" />
                            </div>

                            {/* Product Info */}
                            <div className="px-1 flex flex-col flex-1">
                              <h3 className="font-bold text-xs leading-tight mb-1 text-zinc-900 group-hover:text-black">
                                {product.title}
                              </h3>
                              <span className="text-[10px] font-semibold text-zinc-400 block mb-1">
                                {product.brand} • {product.storage} • {getGradeConfig(product.grade).label}
                              </span>
                              
                              {/* Rating stars */}
                              <div className="flex items-center gap-1.5 mb-3">
                                <div className="flex items-center text-amber-400">
                                  <Star className="h-3 w-3 fill-amber-400 text-amber-400" strokeWidth={3} />
                                </div>
                                <span className="text-[10px] font-bold text-zinc-800 dark:text-zinc-300">{product.rating}</span>
                                <span className="text-[10px] text-zinc-400 font-semibold">({product.reviews})</span>
                              </div>

                              {/* Price */}
                              <div className="flex items-baseline gap-2 mt-auto pt-1">
                                {product.price > 0
                                  ? <>
                                      <span className="text-sm font-extrabold text-zinc-950">£{product.price}</span>
                                      <span className="text-[10px] text-zinc-400 line-through font-semibold">£{product.originalPrice} new</span>
                                    </>
                                  : <span className="text-xs font-bold text-zinc-400 italic">Price on Request</span>
                                }
                              </div>
                            </div>

                          </div>
                        </Link>
                      ))}
                    {allProducts.filter(p => activeTabBrand === "all" || p.brand === activeTabBrand).length === 0 && (
                      <div className="py-12 w-full text-center text-zinc-400 font-medium">
                        No refurbished {activeTabBrand} products currently featured.
                      </div>
                    )}
                  </div>

                  {/* Carousel navigation arrows */}
                  <div className="flex justify-end mt-4">
                    <ScrollButtons scrollRef={brandsScrollRef as React.RefObject<HTMLElement | null>} />
                  </div>
                </div>

              </div>

            </div>
          </div>

          {/* ── Main Grid ───────────────────────────────────────────────────────── */}
          <div className="flex-1 min-w-0" id="product-grid">

            {/* Toolbar & Horizontal Filters */}
            <div className="mb-8 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-zinc-600">
                  {filtered.length} products
                </p>
                
                <div className="flex items-center gap-3">
                  {/* Mobile Filter Toggle */}
                  <button
                    onClick={() => setShowFilters(true)}
                    className="lg:hidden flex items-center gap-2 h-11 px-5 rounded-full bg-white border border-zinc-200 text-sm font-bold"
                  >
                    <SlidersHorizontal className="h-4 w-4" /> Filters
                    {(activeGrades.length > 0 || activeBrands.length > 0) && (
                      <span className="h-5 w-5 rounded-full bg-black text-white text-[10px] font-bold flex items-center justify-center ml-1">
                        {activeGrades.length + activeBrands.length}
                      </span>
                    )}
                  </button>

                  {/* Sort Dropdown */}
                  <div className="relative z-20">
                    <button
                      onClick={() => setShowSort(s => !s)}
                      className="flex items-center gap-2 h-11 px-5 rounded-full bg-white border border-zinc-200 text-sm font-bold hover:border-black transition-colors"
                    >
                      Sort: {SORT_OPTIONS.find(o => o.id === sort)?.label}
                      <ChevronDown className="h-4 w-4" />
                    </button>
                    <AnimatePresence>
                      {showSort && (
                        <motion.div
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 4 }}
                          className="absolute right-0 top-full mt-2 w-56 bg-white border border-zinc-200 rounded-[24px] shadow-xl overflow-hidden"
                        >
                          {SORT_OPTIONS.map(opt => (
                            <button
                             key={opt.id}
                             onClick={() => { setSort(opt.id); setShowSort(false); }}
                             className={`w-full text-left px-5 py-4 text-sm font-bold hover:bg-zinc-50 transition-colors ${sort === opt.id ? "text-black bg-zinc-50" : "text-zinc-600"}`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </div>

              {/* Desktop Horizontal Filters */}
              <div className="hidden lg:flex flex-wrap items-center gap-6 bg-white p-3 px-5 rounded-full border border-zinc-200">
                <div className="flex items-center gap-3">
                  <span className="font-bold text-xs text-zinc-400 uppercase tracking-widest">Brand</span>
                  <div className="flex gap-2">
                    {dynamicBrands.map(brand => {
                      const isActive = activeBrands.includes(brand);
                      return (
                        <button
                          key={brand}
                          onClick={() => toggleFilter(brand, activeBrands, setActiveBrands)}
                          className={`px-3 py-1.5 rounded-full text-sm font-bold transition-all border ${
                            isActive
                              ? "bg-black text-white border-black dark:bg-white dark:text-zinc-950 dark:border-white"
                              : "bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400 dark:border-zinc-800 dark:text-zinc-400 dark:hover:border-zinc-600"
                          }`}
                        >
                          {brand}
                        </button>
                      );
                    })}
                  </div>
                </div>
                
                <div className="w-px h-6 bg-zinc-200"></div>
                
                <div className="flex items-center gap-3">
                  <span className="font-bold text-xs text-zinc-400 uppercase tracking-widest">Condition</span>
                  <div className="flex gap-2">
                    {GRADES.map(g => {
                      const isActive = activeGrades.includes(g);
                      return (
                        <button
                          key={g}
                          onClick={() => toggleFilter(g, activeGrades, setActiveGrades)}
                          className={`px-3 py-1.5 rounded-full text-sm font-bold transition-all border ${
                            isActive
                              ? "bg-black text-white border-black dark:bg-white dark:text-zinc-950 dark:border-white"
                              : "bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400 dark:border-zinc-800 dark:text-zinc-400 dark:hover:border-zinc-600"
                          }`}
                        >
                          {GRADE_CONFIG[g].label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>



            {/* Active Filters Display (Mobile Only) */}
            {(activeGrades.length > 0 || activeBrands.length > 0) && (
              <div className="flex lg:hidden flex-wrap gap-2 mb-6">
                {[...activeBrands, ...activeGrades].map(f => (
                  <button
                    key={f}
                    onClick={() => {
                      if (activeBrands.includes(f)) setActiveBrands(prev => prev.filter(x => x !== f));
                      if (activeGrades.includes(f)) setActiveGrades(prev => prev.filter(x => x !== f));
                    }}
                    className="flex items-center gap-1.5 h-8 px-3 rounded-full bg-white border border-zinc-200 text-xs font-bold hover:border-zinc-400"
                  >
                    {f} <X className="h-3 w-3" />
                  </button>
                ))}
                <button
                  onClick={() => { setActiveBrands([]); setActiveGrades([]); }}
                  className="h-8 px-3 text-xs font-bold text-zinc-500 hover:text-black underline"
                >
                  Clear all
                </button>
              </div>
            )}

            {/* Product Grid */}
            {loading ? (
              <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-6">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="bg-white rounded-[24px] md:rounded-[32px] p-3 border border-zinc-200 h-[250px] md:h-[400px] animate-pulse">
                    <div className="aspect-square rounded-[16px] md:rounded-[24px] bg-zinc-100 mb-5" />
                    <div className="px-2 space-y-2 md:space-y-3">
                      <div className="h-3 md:h-5 bg-zinc-100 rounded-full w-3/4" />
                      <div className="h-3 md:h-4 bg-zinc-100 rounded-full w-1/2" />
                      <div className="h-4 md:h-6 bg-zinc-100 rounded-full w-1/3 mt-2 md:mt-4" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-20 text-center bg-white rounded-[32px] border border-zinc-200">
                <p className="font-bold text-xl mb-3">No products match your filters</p>
                <button
                  onClick={() => { setActiveBrands([]); setActiveGrades([]); }}
                  className="h-12 px-8 rounded-full bg-black text-white font-bold mt-4"
                >
                  Clear filters
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-6">

                {filtered.map((product, index) => {
                  const added = addedIds.has(product.id);
                  
                  return (
                    <Link href={`/shop/${categorySlug}/${product.id}`} key={product.id} className="group block">
                      <div className={`bg-white rounded-[32px] p-3 border transition-all duration-300 h-full flex flex-col ${product.stock === 0 ? "border-zinc-200 hover:border-zinc-300" : "border-zinc-200 hover:border-black hover:shadow-xl"}`}>

                        <div className="relative aspect-square rounded-[24px] bg-[#f5f5f7] mb-5 overflow-hidden">
                          <div className="absolute top-2.5 left-2.5 right-2.5 sm:top-3.5 sm:left-3.5 sm:right-3.5 z-20 flex items-center justify-between pointer-events-none">
                            <GradeBadge condition={product.grade} className="pointer-events-auto" />

                            {product.stock > 0 && product.stock <= 2 && (
                              <span className="pointer-events-auto inline-flex items-center px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full bg-amber-500 text-[8.5px] sm:text-[9.5px] font-bold text-white uppercase tracking-tight shadow-xs whitespace-nowrap">
                                Only {product.stock} left
                              </span>
                            )}

                            {product.stock === 0 && (
                              <span className="pointer-events-auto inline-flex items-center text-[8.5px] sm:text-[9.5px] font-bold bg-orange-100 text-orange-700 px-2 py-0.5 rounded-md border border-orange-200 shadow-xs whitespace-nowrap">
                                Out of Stock
                              </span>
                            )}
                          </div>

                          <ProductImage src={product.image} alt={product.title} hover={product.stock > 0} priority={index < 4} />

                          {product.stock > 0 && product.price > 0 && (
                            <button
                              onClick={e => { e.preventDefault(); handleAdd(product.id); }}
                              className={`absolute bottom-4 right-4 z-20 h-11 w-11 rounded-full flex items-center justify-center shadow-md transition-all duration-300 ${
                                added ? "bg-emerald-500 text-white scale-110" : "bg-white text-black hover:bg-black hover:text-white translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100"
                              }`}
                            >
                              {added ? <Check className="h-5 w-5" strokeWidth={3} /> : <ShoppingCart className="h-5 w-5" />}
                            </button>
                          )}
                        </div>

                        <div className="px-2 flex flex-col flex-1 pb-2">
                          <h3 className="font-bold text-lg leading-tight mb-1">{product.title}</h3>
                          <div className="flex items-center gap-2 mb-3">
                            <span className="text-xs font-bold text-zinc-500 uppercase tracking-wide">{product.storage}</span>
                            <span className="w-1 h-1 rounded-full bg-zinc-300" />
                            <div className="flex items-center gap-1">
                              <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                              <span className="text-xs font-bold text-foreground">{product.rating}</span>
                              <span className="text-xs text-zinc-400 font-medium">({product.reviews})</span>
                            </div>
                          </div>

                          <div className="mt-auto pt-4 flex items-end justify-between">
                            <div>
                              {product.price > 0
                                ? <>
                                    <div className="flex items-baseline gap-2">
                                      <span className="text-2xl font-bold tracking-tight">£{product.price}</span>
                                    </div>
                                    <div className="text-sm font-bold text-zinc-400 line-through">
                                        £{product.originalPrice} new
                                    </div>
                                  </>
                                : <span className="text-base font-bold text-zinc-400 italic">Price on Request</span>
                              }
                            </div>
                            {product.stock === 0 && (
                              <span className="text-xs font-bold text-zinc-400">Unavailable</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Promo Grid ──────────────────────────────────────────────────────────── */}
      <section className="py-10 bg-white border-t border-zinc-200">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          

          {/* Double Promo Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Trade-in card — accent/red theme */}
            <div className="bg-accent/[8%] dark:bg-accent/10 border border-accent/20 dark:border-accent/25 rounded-[28px] p-6 flex flex-col justify-between items-start relative overflow-hidden group">
              {/* decorative blobs */}
              <div className="pointer-events-none absolute -top-12 -right-12 w-56 h-56 bg-accent/15 dark:bg-accent/20 rounded-full blur-3xl" />
              <div className="pointer-events-none absolute bottom-0 left-1/2 w-40 h-40 bg-accent/10 rounded-full blur-2xl" />

              <div className="relative z-10">
                <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-accent mb-4 bg-accent/10 dark:bg-accent/15 px-3 py-1 rounded-full border border-accent/20">
                  <RefreshCw className="h-3 w-3" /> Trade-in Service
                </span>
                <h3 className="font-extrabold text-2xl md:text-3xl mb-1 leading-tight text-foreground">
                  Swap your old tech<br className="hidden sm:block" /> for cash in hand
                </h3>
              </div>

              <Link
                href="/trade-in"
                className="mt-6 relative z-10 inline-flex items-center gap-2 h-11 px-6 rounded-full bg-accent text-white font-bold text-sm hover:bg-accent/90 hover:gap-3 transition-all shadow-sm shadow-accent/30"
              >
                Get an offer <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            {/* Help Centre card — foreground/dark theme */}
            <div className="bg-foreground dark:bg-zinc-900 border border-foreground/10 dark:border-zinc-700 rounded-[28px] p-6 flex flex-col justify-between items-start relative overflow-hidden group">
              {/* decorative blobs */}
              <div className="pointer-events-none absolute -top-10 -right-10 w-52 h-52 bg-white/5 rounded-full blur-3xl" />
              <div className="pointer-events-none absolute bottom-0 left-0 w-48 h-48 bg-accent/10 rounded-full blur-3xl" />

              <div className="relative z-10">
                <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-accent mb-4 bg-accent/15 px-3 py-1 rounded-full border border-accent/25">
                  <Wrench className="h-3 w-3" /> Local Experts
                </span>
                <h3 className="font-extrabold text-2xl md:text-3xl mb-1 leading-tight text-white">
                  Leicester-based<br className="hidden sm:block" /> technical support
                </h3>
              </div>

              <Link
                href="/help"
                className="mt-6 relative z-10 inline-flex items-center gap-2 h-11 px-6 rounded-full bg-white text-zinc-950 font-bold text-sm hover:bg-zinc-100 hover:gap-3 transition-all shadow-sm"
              >
                Visit Help Centre <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>



        </div>
      </section>

      {/* ── Trust bar ────────────────────────────────────────────────────────── */}
      <div className="border-t border-zinc-200 bg-white py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row justify-center items-start sm:items-center gap-8 md:gap-24 w-fit mx-auto pl-6 sm:pl-0">
            {[
              { icon: BadgeCheck,  text: "90-Point Quality Check" },
              { icon: Zap,         text: "Free Express Shipping" },
              { icon: RefreshCw,   text: "30-Day Returns" },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-full bg-accent flex items-center justify-center shrink-0">
                   <Icon className="h-5 w-5 text-white" />
                </div>
                <span className="text-sm font-bold">{text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Mobile filter drawer ──────────────────────────────────────────────── */}
      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex justify-end"
            onClick={() => setShowFilters(false)}
          >
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-[340px] h-full bg-white p-6 flex flex-col"
            >
              <div className="flex items-center justify-between mb-8">
                <h3 className="font-bold text-2xl">Filters</h3>
                <button onClick={() => setShowFilters(false)} className="h-10 w-10 rounded-full bg-zinc-100 flex items-center justify-center hover:bg-zinc-200">
                  <X className="h-5 w-5" />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto space-y-8 pr-2">
                <div>
                  <h4 className="font-bold text-lg mb-4">Brand</h4>
                  <div className="space-y-4">
                    {dynamicBrands.map(brand => (
                      <label key={brand} className="flex items-center gap-3 cursor-pointer">
                        <div onClick={() => toggleFilter(brand, activeBrands, setActiveBrands)} className={`h-6 w-6 rounded border-2 flex items-center justify-center ${activeBrands.includes(brand) ? "border-black bg-black" : "border-zinc-300"}`}>
                          {activeBrands.includes(brand) && <Check className="h-4 w-4 text-white" strokeWidth={3} />}
                        </div>
                        <span className="font-bold">{brand}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="pt-8 border-t border-zinc-200">
                  <h4 className="font-bold text-lg mb-4">Condition</h4>
                  <div className="space-y-4">
                    {GRADES.map(g => (
                      <label key={g} className="flex items-center gap-3 cursor-pointer">
                        <div onClick={() => toggleFilter(g, activeGrades, setActiveGrades)} className={`h-6 w-6 rounded border-2 flex items-center justify-center ${activeGrades.includes(g) ? "border-black bg-black" : "border-zinc-300"}`}>
                          {activeGrades.includes(g) && <Check className="h-4 w-4 text-white" strokeWidth={3} />}
                        </div>
                        <span className="font-bold">{GRADE_CONFIG[g].label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="pt-6 border-t border-zinc-200 mt-auto">
                <button onClick={() => setShowFilters(false)} className="w-full h-14 rounded-full bg-black text-white font-bold text-lg">
                  Show {filtered.length} results
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <Footer />
    </div>
  );
}
