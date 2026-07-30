"use client";

import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, ChevronRight, Plus, Smartphone } from "lucide-react";
import Fuse from "fuse.js";
import { TRADE_IN_MODELS, type TradeInModel } from "@/lib/trade-in-data";
import { catalogApi } from "@/lib/api";

// Category name from DB → wizard category ID used by trade-in/repair pages
const CAT_NAME_TO_ID: Record<string, string> = {
  Phones: "Phone", Tablets: "Tablet",
  Laptops: "Laptop", Audio: "Audio", Smartwatches: "Smartwatch",
  Gaming: "Console",
};

interface DeviceSearchBoxProps {
  placeholder?: string;
  className?: string;
  /** Show a "Search" submit button inside the input (used on home page) */
  showSearchButton?: boolean;
  /** Max suggestion rows shown in dropdown */
  maxSuggestions?: number;
  /** Only show results from these categories (e.g. repair page only supports Phone/Tablet/Console/Laptop) */
  filterCategories?: string[];
  /** Called when user picks a known device from the suggestions list */
  onSelect: (device: TradeInModel) => void;
  /** Called when user clicks "not listed / manual trade-in" */
  onManualEntry: (query: string) => void;
  /** Called when the Search button is clicked (only relevant when showSearchButton=true) */
  onSubmit?: (query: string) => void;
  /** Custom text for the search button */
  buttonText?: string;
}

const FUSE_OPTIONS = {
  keys: [
    { name: "name",     weight: 0.7 },
    { name: "brand",    weight: 0.25 },
    { name: "category", weight: 0.05 },
  ],
  threshold: 0.4,
  ignoreLocation: true,
};

// Static fallback Fuse — used instantly while the API call is in flight
const STATIC_FUSE = new Fuse(TRADE_IN_MODELS, FUSE_OPTIONS);

export default function DeviceSearchBox({
  placeholder = "Search your device (e.g. Samsung Galaxy, iPhone 15 Pro...)",
  className = "",
  showSearchButton = false,
  maxSuggestions = 7,
  filterCategories,
  onSelect,
  onManualEntry,
  onSubmit,
  buttonText = "Search",
}: DeviceSearchBoxProps) {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  // Starts with static fallback; upgraded to live catalog data once the API responds
  const [fuseInstance, setFuseInstance] = useState<Fuse<TradeInModel>>(STATIC_FUSE);

  useEffect(() => {
    catalogApi.listTradeInModels()
      .then(items => {
        const dbModels: TradeInModel[] = items.map(item => ({
          name:     item.name,
          brand:    item.brand,
          category: CAT_NAME_TO_ID[item.category] ?? item.category,
        }));

        // Merge: DB models first, then any static models not already in the DB
        // This ensures models in the admin catalog take priority, but the static
        // list (e.g. Nothing Phone, Fairphone) fills gaps until they're added to the catalog
        const dbKeys = new Set(dbModels.map(m => `${m.brand}:${m.name}`));
        const staticOnly = TRADE_IN_MODELS.filter(m => !dbKeys.has(`${m.brand}:${m.name}`));
        const merged = [...dbModels, ...staticOnly];

        setFuseInstance(new Fuse(merged, FUSE_OPTIONS));
      })
      .catch(() => {}); // silently keep static fallback on error
  }, []);

  const suggestions: TradeInModel[] = useMemo(
    () => query.trim()
      ? fuseInstance.search(query)
          .map(r => r.item)
          .filter(m => !filterCategories || filterCategories.includes(m.category))
          .slice(0, maxSuggestions)
      : [],
    [query, fuseInstance, filterCategories, maxSuggestions],
  );

  const handleSelect = (device: TradeInModel) => {
    setQuery("");
    onSelect(device);
  };

  const handleManual = () => {
    const q = query.trim();
    setQuery("");
    onManualEntry(q);
  };

  return (
    <div className={`relative ${className}`}>
      <div className="relative group">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 220)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              if (suggestions.length > 0) handleSelect(suggestions[0]);
              else if (query.trim()) handleManual();
              else onSubmit?.(query);
            }
          }}
          placeholder={placeholder}
          className={`h-14 w-full rounded-2xl bg-zinc-50 dark:bg-zinc-900/40 border-2 border-zinc-200 dark:border-zinc-800 focus:border-accent focus:bg-white dark:focus:bg-zinc-900 text-sm font-semibold outline-none text-zinc-900 dark:text-white transition-all shadow-sm ${showSearchButton ? "pl-12 pr-28" : "pl-12 pr-6"}`}
        />
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-400 group-focus-within:text-accent transition-colors pointer-events-none" />
        {showSearchButton && (
          <button
            type="button"
            onClick={() => onSubmit?.(query)}
            className="absolute right-2 top-2 bottom-2 bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 rounded-xl px-4 font-bold text-xs hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-colors"
          >
            {buttonText}
          </button>
        )}
      </div>

      <AnimatePresence>
        {focused && query.trim() && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.15 }}
            className="absolute left-0 right-0 top-full mt-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden z-50 p-2 text-left"
          >
            {suggestions.length === 0 ? (
              <p className="text-xs text-zinc-400 font-semibold text-center py-3 px-3">
                No results for &quot;{query}&quot; — use the option below to start a manual quote.
              </p>
            ) : (
              suggestions.map((sug, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleSelect(sug)}
                  className="w-full flex items-center justify-between p-3.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 rounded-xl transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 bg-zinc-100 dark:bg-zinc-800 rounded-lg flex items-center justify-center text-zinc-500 shrink-0">
                      <Smartphone className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-xs font-extrabold text-zinc-950 dark:text-white">{sug.name}</p>
                      <p className="text-[9px] text-zinc-400 font-bold uppercase tracking-wider mt-0.5">
                        {sug.brand} · {sug.category}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-[10px] font-bold text-zinc-400 shrink-0">
                    Get Cash <ChevronRight className="h-3.5 w-3.5" />
                  </div>
                </button>
              ))
            )}

            <div className="border-t border-zinc-100 dark:border-zinc-800 mt-1 pt-1">
              <button
                type="button"
                onClick={handleManual}
                className="w-full flex items-center gap-3 p-3.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 rounded-xl transition-colors text-left"
              >
                <div className="h-8 w-8 bg-zinc-950 dark:bg-white rounded-lg flex items-center justify-center shrink-0">
                  <Plus className="h-4 w-4 text-white dark:text-zinc-950" />
                </div>
                <div>
                  <p className="text-xs font-extrabold text-zinc-950 dark:text-white">
                    &quot;{query}&quot; — not in our list?
                  </p>
                  <p className="text-[9px] text-zinc-400 font-bold uppercase tracking-wider mt-0.5">
                    Start a manual trade-in · Our team will review &amp; quote
                  </p>
                </div>
                <ChevronRight className="h-3.5 w-3.5 text-zinc-400 ml-auto shrink-0" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
