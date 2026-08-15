"use client";

import React, { useState, useEffect, useCallback } from "react";

interface BrandPillProps {
  brand: string;
  logo?: string | null;
  isActive: boolean;
  onClick: () => void;
  className?: string;
  variant?: "default" | "card";
}

export function BrandPill({
  brand,
  logo,
  isActive,
  onClick,
  className = "",
  variant = "default",
}: BrandPillProps) {
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);
  }, [logo]);

  const handleRef = useCallback((imgNode: HTMLImageElement | null) => {
    if (imgNode && imgNode.complete && imgNode.naturalWidth === 0) {
      setImgFailed(true);
    }
  }, []);

  const hasLogo = Boolean(logo && logo.trim().length > 0 && !imgFailed);

  if (variant === "card") {
    return (
      <button
        onClick={onClick}
        className={`h-12 px-4.5 min-w-[76px] rounded-2xl transition-all border flex items-center justify-center gap-2 bg-white ${
          isActive
            ? "border-black dark:border-white shadow-sm text-zinc-950 dark:text-white"
            : "border-zinc-200 dark:border-zinc-800 text-zinc-600 hover:border-zinc-400 dark:hover:border-zinc-500"
        } ${className}`}
      >
        {hasLogo && (
          <img
            ref={handleRef}
            src={logo!}
            alt={brand}
            onError={() => setImgFailed(true)}
            className="h-6 w-auto max-w-[70px] max-h-6 object-contain shrink-0"
          />
        )}
        <span className={`font-extrabold text-xs tracking-tight ${
          isActive ? "text-zinc-950 dark:text-white" : "text-zinc-700 dark:text-zinc-300"
        }`}>
          {brand}
        </span>
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      className={`flex-shrink-0 h-9.5 sm:h-10 px-3.5 sm:px-4 rounded-full font-bold text-xs sm:text-sm transition-all duration-200 border flex items-center gap-2 ${
        isActive
          ? "bg-zinc-950 text-white border-zinc-950 dark:bg-white dark:text-zinc-950 dark:border-white"
          : "bg-white text-zinc-600 border-zinc-200 hover:border-zinc-950 hover:text-zinc-950 dark:bg-zinc-900/40 dark:text-zinc-400 dark:border-zinc-800 dark:hover:text-white dark:hover:border-zinc-400"
      } ${className}`}
    >
      {hasLogo && (
        <img
          ref={handleRef}
          src={logo!}
          alt={brand}
          onError={() => setImgFailed(true)}
          className="h-5 w-auto max-w-[28px] max-h-5 object-contain shrink-0"
        />
      )}
      <span className="whitespace-nowrap">{brand}</span>
    </button>
  );
}
