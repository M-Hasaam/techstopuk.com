"use client";

import React, { useState, useEffect, useRef } from "react";

export interface AccordionItem {
  image: string;
  label: string;
  catId?: string;
  link?: string;
  ctaText?: string;
}

export interface AccordionGalleryProps {
  items: AccordionItem[];
  defaultIndex?: number;
  expandRatio?: number;
  trigger?: "hover" | "click";
  accentColor?: string;
  overlayColor?: string;
  textColor?: string;
  grayscale?: boolean;
  showLabels?: boolean;
  duration?: number;
  ease?: string;
  parallax?: number;
  tilt?: number;
  stagger?: number;
  height?: number | string;
  gap?: number;
  radius?: number;
  orientation?: "horizontal" | "vertical";
  autoplay?: boolean;
  autoplayInterval?: number;
  ctaText?: string;
  onSelect?: (item: AccordionItem, index: number) => void;
}

const DEFAULT_FALLBACK_ITEMS: AccordionItem[] = [
  { image: "/phones/samsung/bento_smartphones.png", label: "Phones", catId: "Phone" },
  { image: "/laptops/MacBook/showcase_macbook.png", label: "Laptops", catId: "Laptop" },
  { image: "/consoles/showcase_ps5.png", label: "Gaming", catId: "Console" },
  { image: "/tablets/ipad/showcase_ipad_pro.png", label: "Tablets", catId: "Tablet" },
  { image: "/Other/watch/galaxy_watch_promo_1778927696615.png", label: "Smartwatches", catId: "Smartwatch" },
  { image: "/audio/bento_audio.png", label: "Audio", catId: "Audio" },
];

export default function AccordionGallery({
  items,
  defaultIndex = 0,
  expandRatio = 0.52,
  trigger = "hover",
  accentColor = "#ffffff",
  overlayColor = "#060010",
  textColor = "#ffffff",
  grayscale = true,
  showLabels = true,
  duration = 0.8,
  height = 420,
  gap = 10,
  radius = 16,
  orientation = "horizontal",
  autoplay = true,
  autoplayInterval = 2400,
  ctaText = "TRADE IN NOW",
  onSelect,
}: AccordionGalleryProps) {
  const displayItems = items && items.length > 0 ? items : DEFAULT_FALLBACK_ITEMS;
  const count = displayItems.length;

  const [activeIndex, setActiveIndex] = useState<number>(defaultIndex < count ? defaultIndex : 0);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const pauseTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-switch interval effect
  useEffect(() => {
    if (!autoplay || isPaused || count <= 1) return;
    const interval = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % count);
    }, autoplayInterval);

    return () => clearInterval(interval);
  }, [autoplay, isPaused, count, autoplayInterval]);

  const pauseTemporarily = (ms = 3500) => {
    setIsPaused(true);
    if (pauseTimeoutRef.current) clearTimeout(pauseTimeoutRef.current);
    pauseTimeoutRef.current = setTimeout(() => {
      setIsPaused(false);
    }, ms);
  };

  const handleHover = (index: number) => {
    pauseTemporarily(3500);
    if (trigger === "hover") setActiveIndex(index);
  };

  const handleMouseEnter = () => {
    setIsPaused(true);
  };

  const handleMouseLeave = () => {
    if (pauseTimeoutRef.current) clearTimeout(pauseTimeoutRef.current);
    setIsPaused(false);
  };

  const handleTileClick = (index: number) => {
    pauseTemporarily(3500);
    if (index !== activeIndex) {
      setActiveIndex(index);
    }
  };

  const handleCtaClick = (e: React.MouseEvent, item: AccordionItem, index: number) => {
    e.stopPropagation();
    if (onSelect) onSelect(item, index);
  };

  return (
    <div
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onTouchStart={() => pauseTemporarily(4000)}
      className="w-full max-w-full overflow-hidden relative flex flex-col md:flex-row select-none h-[520px] md:h-[420px]"
      style={{
        gap: `${gap}px`,
      }}
    >
      {displayItems.map((item, index) => {
        const isActive = index === activeIndex;

        const activeFlex = expandRatio * 100;
        const collapsedFlex = count > 1 ? ((1 - expandRatio) * 100) / (count - 1) : 100;
        const currentFlex = isActive ? activeFlex : collapsedFlex;

        return (
          <div
            key={index}
            onMouseEnter={() => handleHover(index)}
            onClick={() => handleTileClick(index)}
            style={{
              flex: `${currentFlex} 1 0%`,
              borderRadius: `${radius}px`,
              transition: `flex ${duration}s cubic-bezier(0.25, 1, 0.5, 1), filter ${duration}s cubic-bezier(0.25, 1, 0.5, 1)`,
            }}
            className={`relative overflow-hidden border min-h-[52px] transition-colors duration-300 ${
              isActive
                ? "border-red-600 dark:border-red-500 shadow-xl cursor-default"
                : "border-zinc-200 dark:border-zinc-800 shadow-md cursor-pointer hover:border-zinc-400 dark:hover:border-zinc-600"
            }`}
          >
            {/* Category Image */}
            <div className="absolute inset-0 w-full h-full bg-zinc-900">
              <img
                src={item.image}
                alt={item.label}
                style={{
                  filter: grayscale && !isActive ? "grayscale(100%) opacity(0.55)" : "grayscale(0%) opacity(1)",
                  transition: `filter ${duration}s cubic-bezier(0.25, 1, 0.5, 1)`,
                }}
                className="w-full h-full object-cover"
              />
            </div>

            {/* Dark Overlay Gradient */}
            <div
              className="absolute inset-0 pointer-events-none transition-opacity duration-500"
              style={{
                background: `linear-gradient(to top, ${overlayColor} 0%, rgba(6,0,16,0.35) 60%, transparent 100%)`,
                opacity: isActive ? 0.85 : 0.7,
              }}
            />

            {/* COLLAPSED LABEL */}
            {!isActive && showLabels && (
              <div className="absolute inset-0 p-3 flex flex-col justify-end items-center pointer-events-none transition-opacity duration-300">
                {/* Desktop Rotated Label */}
                <span
                  className="font-black text-xs uppercase tracking-widest text-white/90 whitespace-nowrap hidden md:block"
                  style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
                >
                  {item.label}
                </span>

                {/* Mobile Clean Horizontal Bar Label */}
                <div className="flex md:hidden items-center w-full h-full px-2">
                  <span className="font-black text-xs uppercase tracking-widest text-white drop-shadow-md">
                    {item.label}
                  </span>
                </div>
              </div>
            )}

            {/* ACTIVE / EXPANDED CONTENT WITH DASH INDICATOR & ACTIVE CTA CLICK */}
            {isActive && showLabels && (
              <div
                className="absolute inset-x-0 bottom-0 p-4 sm:p-5 flex items-center justify-between gap-3 z-10 overflow-hidden transition-all duration-500 ease-out"
                style={{ color: textColor }}
              >
                {/* Title with Vertical Dash Indicator */}
                <div className="flex items-center gap-2.5 min-w-0 flex-1 overflow-hidden">
                  <div className="w-1 h-5 sm:h-6 rounded-full bg-white shrink-0 shadow-xs" />
                  <div className="min-w-0 flex-1 overflow-hidden">
                    <h3 className="font-sans text-lg sm:text-xl md:text-2xl font-black tracking-tight text-white leading-none whitespace-nowrap overflow-hidden text-ellipsis">
                      {item.label}
                    </h3>
                    <button
                      type="button"
                      onClick={(e) => handleCtaClick(e, item, index)}
                      className="text-[10px] sm:text-[11px] font-extrabold text-red-500 hover:text-red-400 uppercase tracking-wider flex items-center gap-1 cursor-pointer transition-colors pt-1 whitespace-nowrap overflow-hidden"
                    >
                      <span>{item.ctaText ?? ctaText ?? "TRADE IN NOW"}</span>
                      <span>→</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
