"use client";

import React, { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { ImageOff } from "lucide-react";

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
  { image: "", label: "Phones", catId: "Phone" },
  { image: "", label: "Laptops", catId: "Laptop" },
  { image: "", label: "Gaming", catId: "Console" },
  { image: "", label: "Tablets", catId: "Tablet" },
  { image: "", label: "Smartwatches", catId: "Smartwatch" },
  { image: "", label: "Audio", catId: "Audio" },
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

  // Per-tile image load state — shows a shimmer until the image paints, and a
  // plain icon (never a broken-image glyph) if there's no image or it fails to load.
  const [loadedIdx, setLoadedIdx] = useState<Set<number>>(new Set());
  const [erroredIdx, setErroredIdx] = useState<Set<number>>(new Set());
  // Reset per-tile load/error tracking when the actual image URLs change (e.g. real
  // catalog images arriving after the initial fallback render) — keyed on the URLs
  // themselves (not the `items` array reference, which is re-created every parent
  // render) so this doesn't fire — and flicker the shimmer back in — on every render.
  const itemsKey = displayItems.map((i) => i.image).join("|");
  useEffect(() => {
    setLoadedIdx(new Set());
    setErroredIdx(new Set());
  }, [itemsKey]);

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
        // The dark gradient overlay below sits on top of everything (needed for label
        // contrast against real photos) — at its usual ~0.7-0.85 opacity it swallows a
        // shimmer or placeholder icon almost entirely, reading as plain black instead of
        // "loading". Dial it back while there's nothing to contrast against yet.
        const isImageLoading = !!item.image && !loadedIdx.has(index) && !erroredIdx.has(index);
        const hasVisibleImage = loadedIdx.has(index) && !erroredIdx.has(index);

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
              {item.image && !erroredIdx.has(index) ? (
                <>
                  {/* Shimmer skeleton — visible until the image actually paints */}
                  {!loadedIdx.has(index) && (
                    <div className="absolute inset-0 bg-zinc-700 animate-pulse" />
                  )}
                  <Image
                    src={item.image}
                    alt={item.label}
                    fill
                    sizes="(max-width: 768px) 100vw, 20vw"
                    priority={index === 0}
                    ref={(el) => {
                      // On client-side route transitions the browser can serve this image
                      // from cache before React's onLoad listener is attached, so `load`
                      // never fires and the tile stays stuck invisible even though the
                      // image is fully decoded. Catch that case as soon as the node mounts.
                      if (el && el.complete && el.naturalWidth > 0) {
                        setLoadedIdx((prev) => (prev.has(index) ? prev : new Set(prev).add(index)));
                      }
                    }}
                    onLoad={() => setLoadedIdx((prev) => new Set(prev).add(index))}
                    onError={() => setErroredIdx((prev) => new Set(prev).add(index))}
                    style={{
                      filter: grayscale && !isActive ? "grayscale(100%) opacity(0.55)" : "grayscale(0%) opacity(1)",
                      transition: `filter ${duration}s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.3s ease-out`,
                      opacity: loadedIdx.has(index) ? 1 : 0,
                    }}
                    className="object-cover"
                  />
                </>
              ) : (
                // No image (or it failed to load) — a plain icon reads far better than a broken-image glyph
                <div className="absolute inset-0 flex items-center justify-center bg-zinc-700">
                  <ImageOff className="h-6 w-6 text-zinc-400" strokeWidth={1.5} />
                </div>
              )}
            </div>

            {/* Dark Overlay Gradient — dialed back while loading/placeholder so the
                shimmer or icon underneath doesn't just read as solid black */}
            <div
              className="absolute inset-0 pointer-events-none transition-opacity duration-500"
              style={{
                background: `linear-gradient(to top, ${overlayColor} 0%, rgba(6,0,16,0.35) 60%, transparent 100%)`,
                opacity: hasVisibleImage ? (isActive ? 0.85 : 0.7) : (isImageLoading ? 0.25 : 0.5),
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
