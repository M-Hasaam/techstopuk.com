"use client";

import { Fragment, useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { scraperApi, healthApi, productPricingApi, pricingConfigApi, type ScrapedPriceRow, type ScraperStats, type ScraperRun } from "../../lib/api";
import { Play, RefreshCw, Search, TrendingUp, CheckCircle2, AlertCircle, AlertTriangle, Clock, XCircle, Loader2, Zap, Trash2, ChevronDown, ChevronRight } from "lucide-react";

function fmt(v: number | null) {
  return v !== null ? `£${v.toFixed(0)}` : <span className="text-zinc-300">—</span>;
}

// Mirrors the live calculator on /pricing — same formula the backend actually prices with
// (market × condition multiplier × (1+margin%) × (1-discount%), then × trade-in ratio × (1-margin%)).
const GRADES = [
  { key: "new", label: "New",     backendKey: "multiplier_new" },
  { key: "a",   label: "A Grade", backendKey: "multiplier_a" },
  { key: "b",   label: "B Grade", backendKey: "multiplier_b" },
  { key: "c",   label: "C Grade", backendKey: "multiplier_c" },
  { key: "f",   label: "F Grade", backendKey: "multiplier_f" },
] as const;

const GRADE_DEFAULTS: Record<string, number> = {
  multiplier_new: 1.2, multiplier_a: 1.05, multiplier_b: 0.85, multiplier_c: 0.65, multiplier_f: 0.25,
  sell_margin_pct: 0, sell_discount_pct: 0, tradein_ratio: 0.5, tradein_margin_pct: 0,
};

function round5(x: number) { return Math.max(Math.round(x / 5) * 5, 5); }

function sellPriceFor(marketPrice: number, backendKey: string, configs: Record<string, number>) {
  const mult     = configs[backendKey]          ?? GRADE_DEFAULTS[backendKey];
  const margin   = configs["sell_margin_pct"]   ?? GRADE_DEFAULTS.sell_margin_pct;
  const discount = configs["sell_discount_pct"] ?? GRADE_DEFAULTS.sell_discount_pct;
  return round5(marketPrice * mult * (1 + margin / 100) * (1 - discount / 100));
}

function tradeOfferFor(sellPrice: number, configs: Record<string, number>) {
  const ratio  = configs["tradein_ratio"]        ?? GRADE_DEFAULTS.tradein_ratio;
  const margin = configs["tradein_margin_pct"]   ?? GRADE_DEFAULTS.tradein_margin_pct;
  return round5(sellPrice * ratio * (1 - margin / 100));
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-5">
      <p className="text-xs font-bold uppercase tracking-widest text-zinc-400 mb-1">{label}</p>
      <p className="text-3xl font-bold tracking-tight">{value}</p>
      {sub && <p className="text-xs text-zinc-400 mt-1">{sub}</p>}
    </div>
  );
}

function RunStatusBadge({ status }: { status: ScraperRun["status"] }) {
  if (status === "COMPLETED") return (
    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg">
      <CheckCircle2 className="h-3 w-3" /> Completed
    </span>
  );
  if (status === "FAILED") return (
    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-red-700 bg-red-50 px-2.5 py-1 rounded-lg">
      <XCircle className="h-3 w-3" /> Failed
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg">
      <Loader2 className="h-3 w-3 animate-spin" /> Running
    </span>
  );
}

function duration(start: string, end: string | null) {
  if (!end) return "—";
  const secs = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000);
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60), s = secs % 60;
  return `${m}m ${s}s`;
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en-GB", { day: "numeric", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

const SCRAPER_ENABLED = process.env.NEXT_PUBLIC_SCRAPER_ENABLED === "true";

function hoursToForm(h: number): { val: string; unit: "hours" | "days" | "weeks" } {
  if (h >= 168 && h % 168 === 0) return { val: String(h / 168), unit: "weeks" };
  if (h >= 24  && h % 24  === 0) return { val: String(h / 24),  unit: "days" };
  return { val: String(h || 1), unit: "hours" };
}

function formToHours(val: string, unit: string): number {
  const n = Math.max(1, parseInt(val) || 1);
  if (unit === "weeks") return n * 168;
  if (unit === "days")  return n * 24;
  return n;
}

function humanizeHours(h: number): string {
  if (h >= 168 && h % 168 === 0) { const w = h / 168; return `${w} week${w > 1 ? "s" : ""}`; }
  if (h >= 24  && h % 24  === 0) { const d = h / 24;  return `${d} day${d  > 1 ? "s" : ""}`; }
  return `${h} hour${h > 1 ? "s" : ""}`;
}

export default function ScraperPage() {
  const router = useRouter();
  const [stats, setStats] = useState<ScraperStats | null>(null);
  const [runs, setRuns] = useState<ScraperRun[]>([]);
  const [allRows, setAllRows] = useState<ScrapedPriceRow[]>([]);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [catalogPage, setCatalogPage] = useState(1);
  const CATALOG_PAGE_SIZE = 50;
  const [loadingTable, setLoadingTable] = useState(false);
  const [refreshingTable, setRefreshingTable] = useState(false);
  const tableHasData = useRef(false);
  const prevRunsRef  = useRef<ScraperRun[]>([]);
  const prevStatsTotalRef = useRef<number | null>(null);
  const [running, setRunning] = useState(false);
  const [runMsg, setRunMsg] = useState("");
  const [stopping, setStopping] = useState(false);
  const [stopMsg, setStopMsg] = useState("");
  const [scrapingKey, setScrapingKey] = useState<string | null>(null);
  const [scrapeRowResult, setScrapeRowResult] = useState<{ key: string; ok: boolean } | null>(null);
  const scrapeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [cleaning, setCleaning] = useState(false);
  const [cleanMsg, setCleanMsg] = useState("");
  const [showPurgeConfirm, setShowPurgeConfirm] = useState(false);
  const [purgeInput, setPurgeInput] = useState("");
  const [purging, setPurging] = useState(false);
  const [purgeError, setPurgeError] = useState("");
  const [purgeMsg, setPurgeMsg] = useState("");
  const [serviceOnline, setServiceOnline] = useState<boolean | null>(null);
  const [scheduleHours, setScheduleHours] = useState<number | null>(null);
  const [scheduleInputVal, setScheduleInputVal] = useState("1");
  const [scheduleUnit, setScheduleUnit] = useState<"hours" | "days" | "weeks">("hours");
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [scheduleMsg, setScheduleMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [stuckThresholdHours, setStuckThresholdHours] = useState<number | null>(null);
  const [thresholdInputVal, setThresholdInputVal] = useState("3");
  const [thresholdUnit, setThresholdUnit] = useState<"hours" | "days" | "weeks">("hours");
  const [savingThreshold, setSavingThreshold] = useState(false);
  const [thresholdMsg, setThresholdMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [flaggedKeys, setFlaggedKeys] = useState<Set<string>>(new Set());
  const [flaggedGrades, setFlaggedGrades] = useState<Map<string, Set<string>>>(new Map());
  const [aiRanges, setAiRanges] = useState<Map<string, { low: number; high: number }>>(new Map());
  const [autoPriceEnabled, setAutoPriceEnabled] = useState(false);
  const [autoPriceSaving, setAutoPriceSaving] = useState(false);
  const [pricingLaunching, setPricingLaunching] = useState(false);
  const [pricingConfigs, setPricingConfigs] = useState<Record<string, number>>({});
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

  // Key must match how ScrapedPriceRow.{brand,model,storage,ram} are compared below —
  // case-insensitive, trimmed, empty storage/ram normalized the same way on both sides.
  // RAM is included so two RAM variants of the same brand/model/storage (e.g. a MacBook's
  // 8GB vs 16GB configs) don't collide onto the same flagged/range/AI-estimate entry.
  const flagKey = (brand: string, model: string, storage: string, ram = "") =>
    `${brand.trim().toLowerCase()}|${model.trim().toLowerCase()}|${(storage || "").trim().toLowerCase()}|${(ram || "").trim().toLowerCase()}`;

  const loadFlagged = useCallback(() => {
    productPricingApi.flagged()
      .then(rows => {
        setFlaggedKeys(new Set(rows.map(r => flagKey(r.brand, r.model, r.storage, r.ram))));
        const byGrade = new Map<string, Set<string>>();
        for (const r of rows) {
          const k = flagKey(r.brand, r.model, r.storage, r.ram);
          const gradeKey = r.condition.toLowerCase();
          if (!byGrade.has(k)) byGrade.set(k, new Set());
          byGrade.get(k)!.add(gradeKey);
        }
        setFlaggedGrades(byGrade);
      })
      .catch(() => {});
  }, []);

  const loadRanges = useCallback(() => {
    productPricingApi.ranges()
      .then(rows => setAiRanges(new Map(rows.map(r => [flagKey(r.brand, r.model, r.storage, r.ram), { low: r.low, high: r.high }]))))
      .catch(() => {});
  }, []);

  const loadAutoPrice = useCallback(() => {
    scraperApi.getAutoPrice().then(r => setAutoPriceEnabled(r.enabled)).catch(() => {});
  }, []);

  const loadPricingConfigs = useCallback(() => {
    pricingConfigApi.list()
      .then(rows => setPricingConfigs(Object.fromEntries(rows.map(c => [c.key, c.value]))))
      .catch(() => {});
  }, []);

  async function handleToggleAutoPrice() {
    const next = !autoPriceEnabled;
    setAutoPriceSaving(true);
    setAutoPriceEnabled(next); // optimistic
    try {
      await scraperApi.setAutoPrice(next);
    } catch {
      setAutoPriceEnabled(!next); // revert on failure
    } finally {
      setAutoPriceSaving(false);
    }
  }

  async function handleLaunchPricing() {
    setPricingLaunching(true);
    try {
      await productPricingApi.run();
      await watchPricingJob();
    } catch { /* already running or error */ } finally {
      setPricingLaunching(false);
    }
  }

  // The pricing job runs in the background with no ScraperRun row and no stats.total
  // change to key off of, so nothing else on this page notices when it finishes —
  // poll its own status endpoint until done, then refresh the ranges/flagged data it wrote.
  async function watchPricingJob() {
    const maxWaitMs = 30 * 60 * 1000;
    const pollMs = 3000;
    const deadline = Date.now() + maxWaitMs;
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, pollMs));
      const status = await productPricingApi.status().catch(() => null);
      if (!status || !status.running) break;
    }
    loadRanges();
    loadFlagged();
  }

  const loadStats = useCallback(() => {
    scraperApi.stats().then(setStats).catch(() => {});
  }, []);

  const loadSchedule = useCallback(() => {
    scraperApi.getSchedule().then(r => {
      setScheduleHours(r.hours);
      if (r.hours > 0) {
        const { val, unit } = hoursToForm(r.hours);
        setScheduleInputVal(val);
        setScheduleUnit(unit);
      }
    }).catch(() => {});
  }, []);

  const loadStuckThreshold = useCallback(() => {
    scraperApi.getStuckThreshold().then(r => {
      setStuckThresholdHours(r.hours);
      const { val, unit } = hoursToForm(r.hours);
      setThresholdInputVal(val);
      setThresholdUnit(unit);
    }).catch(() => {});
  }, []);

  const checkServiceHealth = useCallback(() => {
    healthApi.check()
      .then(h => setServiceOnline(h.scraper))
      .catch(() => setServiceOnline(false));
  }, []);

  const loadRuns = useCallback(() => {
    scraperApi.runs(20).then(setRuns).catch(() => {});
  }, []);

  const loadPrices = useCallback(() => {
    if (!tableHasData.current) {
      setLoadingTable(true);
    } else {
      setRefreshingTable(true);
    }
    // Load all rows at once so we can split catalog vs others client-side
    scraperApi.prices(1, 2000, search || undefined)
      .then(r => {
        setAllRows(r.items);
        tableHasData.current = true;
      })
      .catch(() => {})
      .finally(() => { setLoadingTable(false); setRefreshingTable(false); });
  }, [search]);

  useEffect(() => {
    if (!SCRAPER_ENABLED) { router.replace("/"); return; }
    loadStats();
    loadRuns();
    loadSchedule();
    loadStuckThreshold();
    loadFlagged();
    loadRanges();
    loadAutoPrice();
    loadPricingConfigs();
  }, [loadStats, loadRuns, loadSchedule, loadStuckThreshold, loadFlagged, loadRanges, loadAutoPrice, loadPricingConfigs, router]);

  // One-shot health check on mount so serviceOnline resolves immediately
  // rather than waiting up to 15s for the first poll tick.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (SCRAPER_ENABLED) checkServiceHealth(); }, []);

  useEffect(() => {
    if (!SCRAPER_ENABLED) return;
    // Reset so the spinner shows when page or search changes
    tableHasData.current = false;
    loadPrices();
  }, [loadPrices]);

  // Clearing the search box (backspace/select-all-delete) should drop the active filter
  // immediately — otherwise the committed `search` term stays applied to the table even
  // though the input looks empty, and the stats above (which ignore `search`) stop matching
  // what the table shows.
  useEffect(() => {
    if (searchInput === "" && search !== "") {
      setSearch("");
      setCatalogPage(1);
    }
  }, [searchInput, search]);

  // Detect full-run completion → refresh the price table exactly once.
  // This avoids calling loadPrices() on every poll tick (which re-fetches
  // 2000 rows and causes the whole table to re-render/flicker).
  useEffect(() => {
    if (!SCRAPER_ENABLED) return;
    const wasRunning = prevRunsRef.current.some(r => r.status === "RUNNING");
    const isRunning  = runs.some(r => r.status === "RUNNING");
    if (wasRunning && !isRunning) {
      loadPrices(); // run just finished — refresh table once
      loadFlagged();
      loadRanges();
    }
    prevRunsRef.current = runs;
  }, [runs, loadPrices, loadFlagged, loadRanges]);

  // Stats poll every 8-15s regardless of whether a tracked run is active — e.g. rows
  // scraped one at a time via the per-row "Scrape" button, or scraped from another
  // tab/cron trigger, bump stats.total without ever setting a RUNNING ScraperRun row,
  // so the run-completion effect above never fires. Without this, the table can sit
  // stale indefinitely while the stats cards above (which poll independently) move on.
  useEffect(() => {
    if (!SCRAPER_ENABLED || !stats) return;
    if (prevStatsTotalRef.current !== null && stats.total !== prevStatsTotalRef.current) {
      loadPrices();
      loadFlagged();
      loadRanges();
    }
    prevStatsTotalRef.current = stats.total;
  }, [stats, loadPrices, loadFlagged, loadRanges]);

  // Auto-poll: 8s while a run is active, 15s when idle (fast enough to feel
  // real-time without hammering the server).
  // Health check: every tick when idle (safe — scraper isn't busy); every 3rd
  // tick when running (avoid stressing the service mid-scrape).
  const pollCountRef = useRef(0);
  useEffect(() => {
    if (!SCRAPER_ENABLED) return;
    const isRunning = runs.some(r => r.status === "RUNNING");
    pollCountRef.current = 0; // reset cadence so health check fires predictably after run state changes
    const tick = () => {
      pollCountRef.current += 1;
      loadStats();
      loadRuns();
      if (!isRunning || pollCountRef.current % 3 === 0) checkServiceHealth();
    };
    const id = setInterval(tick, isRunning ? 8_000 : 15_000);
    return () => clearInterval(id);
  }, [runs, loadStats, loadRuns, checkServiceHealth]);

  // Cleanup per-row scrape interval on unmount
  useEffect(() => {
    return () => { if (scrapeIntervalRef.current) clearInterval(scrapeIntervalRef.current); };
  }, []);

  if (!SCRAPER_ENABLED) return null;

  async function handleRunScraper() {
    setRunning(true);
    setRunMsg("");
    try {
      const res = await scraperApi.run();
      setRunMsg(res.message);
      if (res.ok) {
        setTimeout(() => { loadStats(); loadRuns(); loadPrices(); }, 3000);
      }
    } catch (e: any) {
      setRunMsg(e.message ?? "Failed to start scraper");
    } finally {
      setRunning(false);
    }
  }

  async function handleStop() {
    setStopping(true);
    setStopMsg("");
    try {
      const res = await scraperApi.stop();
      setStopMsg(res.message);
      setTimeout(() => { loadRuns(); loadStats(); }, 2000);
    } catch (e: any) {
      setStopMsg(e.message ?? "Failed to stop scraper");
    } finally {
      setStopping(false);
      setTimeout(() => setStopMsg(""), 5000);
    }
  }

  async function handleCleanup(force = false) {
    setCleaning(true);
    setCleanMsg("");
    try {
      const res = await scraperApi.cleanup(force);
      setCleanMsg(`Cleared ${res.cleaned} stuck run${res.cleaned !== 1 ? "s" : ""}.`);
      loadRuns();
    } catch (e: any) {
      setCleanMsg(e.message ?? "Cleanup failed");
    } finally {
      setCleaning(false);
    }
  }

  async function handlePurgeAll() {
    setPurging(true);
    setPurgeError("");
    try {
      const res = await scraperApi.purgeAll();
      setShowPurgeConfirm(false);
      setPurgeInput("");
      setAllRows([]);
      setCatalogPage(1);
      setPurgeMsg(`Cleared ${res.deletedPrices} price${res.deletedPrices !== 1 ? "s" : ""} and ${res.deletedRuns} run${res.deletedRuns !== 1 ? "s" : ""}.`);
      loadStats();
      loadRuns();
      setTimeout(() => setPurgeMsg(""), 6000);
    } catch (e: any) {
      setPurgeError(e.message ?? "Failed to clear scraper data.");
    } finally {
      setPurging(false);
    }
  }

  async function handleSaveSchedule(hoursOverride?: number) {
    const hours = hoursOverride ?? formToHours(scheduleInputVal, scheduleUnit);
    setSavingSchedule(true);
    setScheduleMsg(null);
    try {
      await scraperApi.setSchedule(hours);
      setScheduleHours(hours);
      setScheduleMsg({
        ok: true,
        text: hours === 0 ? "Auto-run disabled." : `Saved — runs every ${humanizeHours(hours)}.`,
      });
    } catch (e: any) {
      setScheduleMsg({ ok: false, text: e.message ?? "Failed to save schedule." });
    } finally {
      setSavingSchedule(false);
      setTimeout(() => setScheduleMsg(null), 4000);
    }
  }

  async function handleSaveThreshold() {
    const hours = formToHours(thresholdInputVal, thresholdUnit);
    setSavingThreshold(true);
    setThresholdMsg(null);
    try {
      await scraperApi.setStuckThreshold(hours);
      setStuckThresholdHours(hours);
      setThresholdMsg({ ok: true, text: `Saved — runs older than ${humanizeHours(hours)} are considered stuck.` });
    } catch (e: any) {
      setThresholdMsg({ ok: false, text: e.message ?? "Failed to save threshold." });
    } finally {
      setSavingThreshold(false);
      setTimeout(() => setThresholdMsg(null), 4000);
    }
  }

  function applyFreshPrices(fresh: ScrapedPriceRow[]) {
    if (!fresh.length) return;
    setAllRows(prev => {
      const freshById = new Map(fresh.map(r => [r.id, r]));
      const updated = prev.map(r => freshById.get(r.id) ?? r);
      const existingIds = new Set(prev.map(r => r.id));
      const newRows = fresh.filter(f => !existingIds.has(f.id));
      return [...updated, ...newRows];
    });
  }

  async function handleScrapeRow(brand: string, model: string) {
    const key = `${brand}|${model}`;
    const startedAt = Date.now();

    setScrapingKey(key);
    setScrapeRowResult(null);

    // Snapshot current variant ids — used to detect when ALL known variants are fresh
    let watchIds: string[] = [];
    try {
      const current = await scraperApi.devicePrices(brand, model);
      watchIds = current.map(r => r.id);
    } catch {}

    // Trigger background scrape (returns in ~2s, actual scraping happens async in scraper service)
    scraperApi.scrapeDevice(brand, model).catch(() => {});

    // Poll every 3s — update rows live and detect completion via scrapedAt timestamps
    if (scrapeIntervalRef.current) clearInterval(scrapeIntervalRef.current);
    scrapeIntervalRef.current = setInterval(async () => {
      try {
        const fresh = await scraperApi.devicePrices(brand, model);
        if (fresh.length > 0) {
          applyFreshPrices(fresh);

          const freshMap = new Map(fresh.map(r => [r.id, r]));
          // "Done" = every variant we saw before scraping now has scrapedAt >= startedAt
          // (falls back to checking all returned rows if device had no prior rows)
          const allDone = watchIds.length > 0
            ? watchIds.every(id => {
                const row = freshMap.get(id);
                return row && new Date(row.scrapedAt).getTime() >= startedAt;
              })
            : fresh.every(r => new Date(r.scrapedAt).getTime() >= startedAt);

          if (allDone) {
            clearInterval(scrapeIntervalRef.current!);
            scrapeIntervalRef.current = null;
            setScrapingKey(null);
            setScrapeRowResult({ key, ok: true });
            loadStats();
            setTimeout(() => setScrapeRowResult(r => r?.key === key ? null : r), 3000);
            return;
          }
        }
      } catch {}

      // Timeout after 2 minutes
      if (Date.now() - startedAt > 120_000) {
        clearInterval(scrapeIntervalRef.current!);
        scrapeIntervalRef.current = null;
        setScrapingKey(null);
        setScrapeRowResult({ key, ok: false });
        setTimeout(() => setScrapeRowResult(r => r?.key === key ? null : r), 3000);
      }
    }, 3000);
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearch(searchInput);
    setCatalogPage(1);
  }

  const activeRun   = runs.find(r => r.status === "RUNNING") ?? null;
  const isRunActive = !!activeRun;
  const lastRun     = runs.find(r => r.status !== "RUNNING") ?? null;
  // Stalled = DB says RUNNING but the scraper service is confirmed offline.
  // In this state the run will never progress — we allow the user to force-start
  // which auto-cleans the stuck record and retries connecting to the service.
  const isStalled   = isRunActive && serviceOnline === false;

  const runProgress = activeRun?.totalCatalog != null && activeRun?.totalOthers != null
    ? {
        done:  (activeRun.catalogProgress ?? 0) + (activeRun.othersProgress ?? 0),
        total: activeRun.totalCatalog + activeRun.totalOthers,
        catDone:  activeRun.catalogProgress ?? 0,
        catTotal: activeRun.totalCatalog,
        othDone:  activeRun.othersProgress ?? 0,
        othTotal: activeRun.totalOthers,
        pct: Math.round(
          ((activeRun.catalogProgress ?? 0) + (activeRun.othersProgress ?? 0))
          / Math.max(1, activeRun.totalCatalog + activeRun.totalOthers) * 100
        ),
      }
    : null;

  const coverage = stats && stats.total > 0
    ? Math.round((stats.withMarketPrice / stats.total) * 100)
    : 0;

  // isOther is deviceKey-based (computed server-side) — storage can't be used to split:
  // several real catalog devices (controllers, AirPods, headphones) have no storage
  // variants, so their rows also carry storage: '', identical in shape to an "other" row.
  const catalogRows = allRows.filter(r => !r.isOther);
  const otherRows   = allRows.filter(r => r.isOther);
  const catalogPages = Math.max(1, Math.ceil(catalogRows.length / CATALOG_PAGE_SIZE));
  const pagedCatalog = catalogRows.slice((catalogPage - 1) * CATALOG_PAGE_SIZE, catalogPage * CATALOG_PAGE_SIZE);

  const renderPriceRow = (row: ScrapedPriceRow) => {
    const key = `${row.brand}|${row.model}`;
    const isLoading = scrapingKey === key;
    const result = scrapeRowResult?.key === key ? scrapeRowResult : null;
    const isFlagged = flaggedKeys.has(flagKey(row.brand, row.model, row.storage, row.ram));
    const aiRange = aiRanges.get(flagKey(row.brand, row.model, row.storage, row.ram));
    // No real market price? Fall back to the midpoint of the AI-estimated range as the
    // basis for Sell/Trade-in preview — same "purely informational" spirit as AI Min-Max.
    const basisPrice = row.marketPrice ?? (aiRange ? Math.round((aiRange.low + aiRange.high) / 2) : null);
    const aGradeSell = basisPrice !== null ? sellPriceFor(basisPrice, "multiplier_a", pricingConfigs) : null;
    const aGradeTradeIn = aGradeSell !== null ? tradeOfferFor(aGradeSell, pricingConfigs) : null;
    const isExpanded = expandedRowId === row.id;
    return (
      <Fragment key={row.id}>
      <tr
        onClick={() => setExpandedRowId(isExpanded ? null : row.id)}
        className="hover:bg-zinc-50 transition-colors cursor-pointer"
      >
        <td className="px-6 py-3.5 text-zinc-500 font-medium whitespace-nowrap">{row.brand}</td>
        <td className="px-6 py-3.5 font-bold text-black whitespace-nowrap">
          <span className="flex items-center gap-1.5">
            {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-zinc-300 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-zinc-300 shrink-0" />}
            {row.model}
          </span>
        </td>
        <td className="px-6 py-3.5 text-zinc-500 whitespace-nowrap">{row.storage || "—"}</td>
        <td className="px-6 py-3.5 text-zinc-500 whitespace-nowrap">{row.ram || "—"}</td>
        <td className="px-6 py-3.5 font-mono text-zinc-700">{fmt(row.cexSellPrice)}</td>
        <td className="px-6 py-3.5 font-mono text-zinc-500">{fmt(row.cexCashPrice)}</td>
        <td className="px-6 py-3.5 font-mono text-zinc-500">{fmt(row.cexExchangePrice)}</td>
        <td className="px-6 py-3.5 font-mono text-zinc-700">{fmt(row.envirofonePrice)}</td>
        <td className="px-6 py-3.5">
          <div className="flex flex-col gap-1 items-start">
            {row.marketPrice !== null ? (
              <span className="inline-flex items-center gap-1.5 font-bold font-mono text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg text-xs">
                £{row.marketPrice.toFixed(0)}
              </span>
            ) : (
              <span className="text-zinc-300 text-xs font-medium">No data</span>
            )}
            {isFlagged && (
              <span title="A linked product's computed price fell outside the AI sanity-check range and was held back for review"
                className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-lg cursor-help">
                <AlertTriangle className="h-3 w-3" /> Flagged
              </span>
            )}
          </div>
        </td>
        <td className="px-6 py-3.5 font-mono text-xs whitespace-nowrap">
          {aiRange ? (
            <span className={row.marketPrice === null ? "text-blue-600" : "text-zinc-500"}>
              £{aiRange.low.toFixed(0)} – £{aiRange.high.toFixed(0)}
              {row.marketPrice === null && (
                <span title="No scraped market price — this is a one-off AI estimate for manual pricing" className="ml-1 text-[9px] font-bold uppercase tracking-wide text-blue-400 cursor-help">
                  AI est.
                </span>
              )}
            </span>
          ) : <span className="text-zinc-300">—</span>}
        </td>
        <td className="px-6 py-3.5 font-mono text-xs text-zinc-700 whitespace-nowrap">
          {aGradeSell !== null ? `£${aGradeSell.toFixed(0)}` : <span className="text-zinc-300">—</span>}
        </td>
        <td className="px-6 py-3.5 font-mono text-xs text-zinc-700 whitespace-nowrap">
          {aGradeTradeIn !== null ? `£${aGradeTradeIn.toFixed(0)}` : <span className="text-zinc-300">—</span>}
        </td>
        <td className="px-6 py-3.5">
          <span className="flex items-center gap-1.5 text-xs text-zinc-400 whitespace-nowrap">
            <Clock className="h-3 w-3" />
            {fmtTime(row.scrapedAt)}
          </span>
        </td>
        <td className="px-6 py-3.5 whitespace-nowrap">
          {isLoading ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-lg">
              <Loader2 className="h-3 w-3 animate-spin" /> Scraping…
            </span>
          ) : result ? (
            <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-lg ${result.ok ? "text-emerald-700 bg-emerald-50" : "text-red-700 bg-red-50"}`}>
              {result.ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
              {result.ok ? "Done" : "Failed"}
            </span>
          ) : (
            <button
              onClick={e => { e.stopPropagation(); handleScrapeRow(row.brand, row.model); }}
              disabled={scrapingKey !== null}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-zinc-600 bg-zinc-100 hover:bg-zinc-200 px-2.5 py-1 rounded-lg transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Zap className="h-3 w-3" /> Scrape
            </button>
          )}
        </td>
      </tr>
      {isExpanded && (
        <tr className="bg-zinc-50/60">
          <td colSpan={14} className="px-6 py-4">
            {basisPrice === null ? (
              <p className="text-xs text-zinc-400">No market price or AI estimate available yet — nothing to calculate from.</p>
            ) : (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-2">
                  Per-grade breakdown · based on {row.marketPrice !== null ? "market price" : "AI estimate"} £{basisPrice}
                </p>
                <div className="grid grid-cols-5 gap-3">
                  {GRADES.map(g => {
                    const sell = sellPriceFor(basisPrice, g.backendKey, pricingConfigs);
                    const trade = tradeOfferFor(sell, pricingConfigs);
                    const gradeFlagged = flaggedGrades.get(flagKey(row.brand, row.model, row.storage, row.ram))?.has(g.key) ?? false;
                    return (
                      <div key={g.key} className={`rounded-xl border px-3 py-2.5 ${gradeFlagged ? "bg-amber-50 border-amber-200" : "bg-white border-zinc-100"}`}>
                        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide mb-1 flex items-center gap-1">
                          {g.label}
                          {gradeFlagged && <AlertTriangle className="h-3 w-3 text-amber-500" />}
                        </p>
                        <p className="text-sm font-bold font-mono text-zinc-900">£{sell.toFixed(0)}</p>
                        <p className="text-[11px] text-zinc-400 font-mono">trade-in £{trade.toFixed(0)}</p>
                        {gradeFlagged && (
                          <p title="This grade's computed price fell outside the AI sanity-check range and was held back for review" className="text-[10px] font-bold text-amber-700 mt-1 cursor-help">
                            Flagged
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </td>
        </tr>
      )}
      </Fragment>
    );
  };

  const priceTableHead = (
    <thead>
      <tr className="border-b border-zinc-100">
        {["Brand", "Device", "Storage", "RAM", "CeX Sell", "CeX Cash", "CeX Exchange", "Envirofone", "Market Price", "AI Min-Max", "Sell (A Grade)", "Trade-in (A Grade)", "Last Updated", ""].map(h => (
          <th key={h} className="text-left text-[10px] font-bold uppercase tracking-widest text-zinc-400 px-6 py-3 whitespace-nowrap">{h}</th>
        ))}
      </tr>
    </thead>
  );

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6 md:p-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Competitor Prices</h1>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <p className="text-sm text-zinc-500">
              Scraped from CeX &amp; Envirofone.{scheduleHours ? ` Auto-runs every ${humanizeHours(scheduleHours)}.` : ""}
            </p>

            {/* ── Scraper status badge — all states ── */}
            {isStalled ? (
              /* 1a. Stalled — DB says RUNNING but service is confirmed offline */
              <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-lg border text-amber-700 bg-amber-50 border-amber-200 shrink-0">
                <AlertCircle className="h-3 w-3" />
                Stalled — service offline
              </span>
            ) : isRunActive ? (
              /* 1b. Active run — service is online (or health not yet checked) */
              <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-lg border text-blue-700 bg-blue-50 border-blue-200 shrink-0">
                <Loader2 className="h-3 w-3 animate-spin" />
                Running
                {runProgress ? (
                  <span className="text-blue-500 font-normal">
                    • {runProgress.done}/{runProgress.total} ({runProgress.pct}%)
                  </span>
                ) : (
                  <span className="text-blue-400 font-normal">• starting…</span>
                )}
              </span>
            ) : serviceOnline === null ? (
              /* 2. Initial load — health check not yet run */
              <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-lg border text-zinc-500 bg-zinc-50 border-zinc-200 shrink-0">
                <Loader2 className="h-3 w-3 animate-spin" /> Checking…
              </span>
            ) : serviceOnline === false ? (
              /* 3. Health check failed and no active run */
              <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-lg border text-red-700 bg-red-50 border-red-200 shrink-0">
                <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" /> Scraper offline
              </span>
            ) : !lastRun ? (
              /* 4. Service online, no runs ever */
              <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-lg border text-zinc-600 bg-zinc-50 border-zinc-200 shrink-0">
                <span className="h-1.5 w-1.5 rounded-full bg-zinc-400" /> Online · no runs yet
              </span>
            ) : lastRun.status === "COMPLETED" ? (
              /* 5. Online, last run succeeded */
              <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-lg border text-emerald-700 bg-emerald-50 border-emerald-200 shrink-0">
                <CheckCircle2 className="h-3 w-3" />
                Scraper online
                {lastRun.finishedAt && (
                  <span className="text-emerald-600 font-normal">
                    · last run {fmtTime(lastRun.finishedAt)}
                    {lastRun.totalScraped != null && ` · ${lastRun.totalScraped} scraped`}
                  </span>
                )}
              </span>
            ) : (
              /* 6. Online, last run failed */
              <span
                className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-lg border text-amber-700 bg-amber-50 border-amber-200 shrink-0 cursor-help"
                title={lastRun.errorMessage ?? "Last run failed"}
              >
                <AlertCircle className="h-3 w-3" />
                Last run failed
                {lastRun.finishedAt && (
                  <span className="text-amber-600 font-normal">· {fmtTime(lastRun.finishedAt)}</span>
                )}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Auto-price-after-scrape toggle — persisted server-side, applies to manual "Run Now" runs */}
          <label
            title="When on, a manual scraper run will automatically re-price the catalog once it finishes"
            className="flex items-center gap-2 h-11 px-4 rounded-2xl border-2 border-zinc-200 text-sm font-bold text-zinc-600 cursor-pointer select-none"
          >
            <button
              type="button"
              role="switch"
              aria-checked={autoPriceEnabled}
              onClick={handleToggleAutoPrice}
              disabled={autoPriceSaving}
              className={`relative h-5 w-9 rounded-full transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${autoPriceEnabled ? "bg-emerald-500" : "bg-zinc-200"}`}
            >
              <span
                className="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-[left] duration-200"
                style={{ left: autoPriceEnabled ? 18 : 2 }}
              />
            </button>
            Auto-price after scrape
          </label>

          {/* Manual pricing run — same job the auto-price toggle triggers, available on demand */}
          <button
            onClick={handleLaunchPricing}
            disabled={pricingLaunching}
            title="Run the pricing job now against currently scraped prices"
            className="flex items-center gap-2 h-11 px-4 rounded-2xl border-2 border-zinc-200 text-zinc-600 text-sm font-bold hover:border-emerald-300 hover:text-emerald-700 hover:bg-emerald-50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {pricingLaunching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            Auto-price All
          </button>

          {/* Clear all scraped data — blocked while a run is active to avoid confusing an in-flight scrape */}
          <button
            onClick={() => setShowPurgeConfirm(true)}
            disabled={isRunActive}
            title={isRunActive ? "Stop the active run before clearing data" : "Delete all scraped prices and run history"}
            className="flex items-center gap-2 h-11 px-4 rounded-2xl border-2 border-zinc-200 text-zinc-500 text-sm font-bold hover:border-red-200 hover:text-red-700 hover:bg-red-50 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Trash2 className="h-4 w-4" /> Clear Data
          </button>

          {/* Stop button — only while genuinely running (not stalled — service is offline) */}
          {isRunActive && !isStalled && (
            <button
              onClick={handleStop}
              disabled={stopping}
              className="flex items-center gap-2 h-11 px-4 rounded-2xl border-2 border-red-200 text-red-700 text-sm font-bold hover:bg-red-50 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {stopping
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Stopping…</>
                : <><XCircle className="h-4 w-4" /> Stop</>}
            </button>
          )}

          {/* Run Now — disabled only while genuinely running (not stalled) */}
          <button
            onClick={handleRunScraper}
            disabled={running || (isRunActive && !isStalled)}
            title={
              isStalled ? "Service is offline — clicking will clear the stuck run and attempt to reconnect" :
              isRunActive ? "A run is already in progress" :
              serviceOnline === false ? "Scraper service is offline" :
              undefined
            }
            className="flex items-center gap-2 h-11 px-6 rounded-2xl bg-black text-white text-sm font-bold hover:bg-zinc-800 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {running ? (
              <><RefreshCw className="h-4 w-4 animate-spin" /> Starting…</>
            ) : isStalled ? (
              <><Play className="h-4 w-4" /> Force Start</>
            ) : isRunActive ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Running…</>
            ) : (
              <><Play className="h-4 w-4" /> Run Now</>
            )}
          </button>
        </div>
      </div>

      {/* Run message toast */}
      {runMsg && (
        <div className={`flex items-center gap-3 rounded-2xl px-5 py-3 text-sm font-bold ${
          runMsg.toLowerCase().includes("fail") || runMsg.toLowerCase().includes("error")
            ? "bg-red-50 border border-red-100 text-red-700"
            : "bg-emerald-50 border border-emerald-100 text-emerald-700"
        }`}>
          {runMsg.toLowerCase().includes("fail") ? <AlertCircle className="h-4 w-4 shrink-0" /> : <CheckCircle2 className="h-4 w-4 shrink-0" />}
          {runMsg}
          {!runMsg.toLowerCase().includes("fail") && <span className="font-normal text-emerald-600 ml-1">— prices will update in the background.</span>}
        </div>
      )}

      {/* Purge message toast */}
      {purgeMsg && (
        <div className="flex items-center gap-3 rounded-2xl px-5 py-3 text-sm font-bold bg-emerald-50 border border-emerald-100 text-emerald-700">
          <CheckCircle2 className="h-4 w-4 shrink-0" /> {purgeMsg}
        </div>
      )}

      {/* Auto-run Schedule */}
      <div className="bg-white rounded-3xl border border-zinc-100 shadow-sm p-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="font-bold text-base">Auto-run Schedule</h2>
            <p className="text-xs text-zinc-400 mt-0.5">Run the scraper automatically in the background</p>
          </div>
          {/* Active status badge */}
          {scheduleHours !== null && (
            scheduleHours === 0 ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl bg-zinc-100 text-zinc-500">
                <span className="h-1.5 w-1.5 rounded-full bg-zinc-400" />
                Disabled
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Running every {humanizeHours(scheduleHours)}
              </span>
            )
          )}
        </div>

        <div className="mt-5 flex items-center gap-3 flex-wrap">
          <span className="text-sm font-medium text-zinc-500 shrink-0">Run every</span>

          <input
            type="number"
            min="1"
            value={scheduleInputVal}
            onChange={e => setScheduleInputVal(e.target.value)}
            className="w-20 h-10 px-3 rounded-xl border-2 border-zinc-200 text-sm font-bold outline-none focus:border-emerald-500 transition-colors text-center"
          />

          <select
            value={scheduleUnit}
            onChange={e => setScheduleUnit(e.target.value as "hours" | "days" | "weeks")}
            className="h-10 px-3 pr-8 rounded-xl border-2 border-zinc-200 text-sm font-bold outline-none focus:border-emerald-500 transition-colors bg-white appearance-none cursor-pointer"
          >
            <option value="hours">Hours</option>
            <option value="days">Days</option>
            <option value="weeks">Weeks</option>
          </select>

          <button
            onClick={() => handleSaveSchedule()}
            disabled={savingSchedule}
            className="h-10 px-5 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 transition-colors disabled:opacity-60 flex items-center gap-2"
          >
            {savingSchedule ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Save
          </button>

          {scheduleHours !== null && scheduleHours > 0 && (
            <button
              onClick={() => handleSaveSchedule(0)}
              disabled={savingSchedule}
              className="h-10 px-4 rounded-xl border-2 border-zinc-200 text-sm font-bold text-zinc-500 hover:border-red-300 hover:text-red-600 transition-colors disabled:opacity-40"
            >
              Disable
            </button>
          )}

          {scheduleMsg && (
            <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl ${
              scheduleMsg.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
            }`}>
              {scheduleMsg.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
              {scheduleMsg.text}
            </span>
          )}
        </div>
      </div>

      {/* Stuck Run Threshold */}
      <div className="bg-white rounded-3xl border border-zinc-100 shadow-sm p-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="font-bold text-base">Stuck Run Threshold</h2>
            <p className="text-xs text-zinc-400 mt-0.5">How long a run can go without finishing before it's offered up to mark as failed</p>
          </div>
          {stuckThresholdHours !== null && (
            <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl bg-amber-50 text-amber-700 border border-amber-200">
              <AlertCircle className="h-3.5 w-3.5" />
              {humanizeHours(stuckThresholdHours)}
            </span>
          )}
        </div>

        <div className="mt-5 flex items-center gap-3 flex-wrap">
          <span className="text-sm font-medium text-zinc-500 shrink-0">Consider stuck after</span>

          <input
            type="number"
            min="1"
            value={thresholdInputVal}
            onChange={e => setThresholdInputVal(e.target.value)}
            className="w-20 h-10 px-3 rounded-xl border-2 border-zinc-200 text-sm font-bold outline-none focus:border-amber-500 transition-colors text-center"
          />

          <select
            value={thresholdUnit}
            onChange={e => setThresholdUnit(e.target.value as "hours" | "days" | "weeks")}
            className="h-10 px-3 pr-8 rounded-xl border-2 border-zinc-200 text-sm font-bold outline-none focus:border-amber-500 transition-colors bg-white appearance-none cursor-pointer"
          >
            <option value="hours">Hours</option>
            <option value="days">Days</option>
            <option value="weeks">Weeks</option>
          </select>

          <button
            onClick={handleSaveThreshold}
            disabled={savingThreshold}
            className="h-10 px-5 rounded-xl bg-amber-600 text-white text-sm font-bold hover:bg-amber-700 transition-colors disabled:opacity-60 flex items-center gap-2"
          >
            {savingThreshold ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Save
          </button>

          {thresholdMsg && (
            <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl ${
              thresholdMsg.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
            }`}>
              {thresholdMsg.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
              {thresholdMsg.text}
            </span>
          )}
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <StatCard label="Total devices" value={stats.total} sub={`${stats.catalog.total} catalog + ${stats.others.total} other`} />
          <StatCard label="With market price" value={stats.withMarketPrice} sub={`${coverage}% coverage`} />
          <StatCard label="CeX" value={stats.withCex} sub={`${stats.total ? Math.round(stats.withCex / stats.total * 100) : 0}%`} />
          <StatCard label="Envirofone" value={stats.withEnvirofone ?? 0} sub={`${stats.total ? Math.round((stats.withEnvirofone ?? 0) / stats.total * 100) : 0}%`} />
          <StatCard
            label="Last scraped"
            value={stats.lastScrapedAt ? new Date(stats.lastScrapedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "Never"}
            sub={stats.lastScrapedAt ? new Date(stats.lastScrapedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : undefined}
          />
        </div>
      )}

      {/* Stats — catalog vs other breakdown */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {([
            { label: "Catalog Devices", sub: "Phones, tablets, laptops & consoles", group: stats.catalog },
            { label: "Other Products", sub: "Accessories, cables, games & more", group: stats.others },
          ] as const).map(({ label, sub, group }) => (
            <div key={label} className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-5">
              <p className="text-xs font-bold uppercase tracking-widest text-zinc-400">{label}</p>
              <p className="text-[11px] text-zinc-400 mb-3">{sub}</p>
              <div className="grid grid-cols-4 gap-3">
                <div>
                  <p className="text-xl font-bold tracking-tight">{group.total}</p>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Total</p>
                </div>
                <div>
                  <p className="text-xl font-bold tracking-tight">{group.withMarketPrice}</p>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                    Priced · {group.total ? Math.round(group.withMarketPrice / group.total * 100) : 0}%
                  </p>
                </div>
                <div>
                  <p className="text-xl font-bold tracking-tight">{group.withCex}</p>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                    CeX · {group.total ? Math.round(group.withCex / group.total * 100) : 0}%
                  </p>
                </div>
                <div>
                  <p className="text-xl font-bold tracking-tight">{group.withEnvirofone}</p>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                    Envirofone · {group.total ? Math.round(group.withEnvirofone / group.total * 100) : 0}%
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Run History */}
      <div className="bg-white rounded-3xl border border-zinc-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100">
          <div>
            <h2 className="font-bold text-base">Run History</h2>
            <p className="text-xs text-zinc-400 mt-0.5">Last 20 scraper executions</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {/* Stop button — only shown while genuinely running (not stalled) */}
            {isRunActive && !isStalled && (
              <button
                onClick={handleStop}
                disabled={stopping}
                className="flex items-center gap-1.5 text-xs font-bold text-red-700 bg-red-50 border border-red-200 px-3 py-1.5 rounded-xl hover:bg-red-100 transition-colors disabled:opacity-50"
              >
                {stopping
                  ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Stopping…</>
                  : <><XCircle className="h-3.5 w-3.5" /> Stop Scraper</>
                }
              </button>
            )}
            {stopMsg && (
              <span className="text-xs font-bold text-zinc-500">{stopMsg}</span>
            )}
            {(() => {
              // Mirrors the admin-configurable "Stuck Run Threshold" setting above —
              // falls back to 3h if it hasn't loaded yet, matching the backend default.
              const thresholdMs = (stuckThresholdHours ?? 3) * 60 * 60 * 1000;
              const thresholdAgo = Date.now() - thresholdMs;
              const oldStuckCount = runs.filter(r => r.status === "RUNNING" && new Date(r.startedAt).getTime() < thresholdAgo).length;
              // Show immediately if stalled (service offline), otherwise only once genuinely old
              const showCleanup = isStalled || oldStuckCount > 0;
              const isForce = isStalled;
              const handleClick = () => {
                const warning = isForce
                  ? `Mark ${oldStuckCount || "the"} run(s) as failed? The scraper service is offline, so this just clears the stuck record — it won't stop anything real.`
                  : `Mark ${oldStuckCount} run(s) as failed?\n\nThis only updates the record — if the scraper is actually still working, it'll keep running in the background with no way to track its progress here. Only do this if you're sure it's genuinely abandoned (e.g. the service crashed).`;
                if (window.confirm(warning)) handleCleanup(isForce);
              };
              return showCleanup ? (
                <button onClick={handleClick} disabled={cleaning}
                  className="flex items-center gap-1.5 text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-xl hover:bg-amber-100 transition-colors disabled:opacity-50">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {cleaning ? "Cleaning…" : isStalled ? "Clear stuck run" : `${oldStuckCount} stuck — fix`}
                </button>
              ) : null;
            })()}
            {cleanMsg && <span className="text-xs font-bold text-emerald-600">{cleanMsg}</span>}
            <button onClick={() => { loadRuns(); loadStats(); }} className="flex items-center gap-1.5 text-xs font-bold text-zinc-500 hover:text-black transition-colors">
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </button>
          </div>
        </div>

        {runs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Clock className="h-10 w-10 text-zinc-200 mb-3" />
            <p className="font-bold text-zinc-500">No runs yet</p>
            <p className="text-sm text-zinc-400">The scraper hasn&apos;t run yet. Click &quot;Run Now&quot; or wait for the hourly trigger.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead>
                <tr className="border-b border-zinc-100">
                  {["Status", "Started", "Finished", "Duration", "Devices scraped", "Error"].map(h => (
                    <th key={h} className="text-left text-[10px] font-bold uppercase tracking-widest text-zinc-400 px-6 py-3 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-50">
                {runs.map(run => (
                  <tr key={run.id} className="hover:bg-zinc-50 transition-colors">
                    <td className="px-6 py-3.5"><RunStatusBadge status={run.status} /></td>
                    <td className="px-6 py-3.5 text-zinc-700 whitespace-nowrap font-medium">{fmtTime(run.startedAt)}</td>
                    <td className="px-6 py-3.5 text-zinc-500 whitespace-nowrap">{run.finishedAt ? fmtTime(run.finishedAt) : <span className="text-zinc-300">—</span>}</td>
                    <td className="px-6 py-3.5 text-zinc-500 font-mono">{duration(run.startedAt, run.finishedAt)}</td>
                    <td className="px-6 py-3.5 min-w-[160px]">
                      {run.status === "RUNNING" && run.totalCatalog != null && run.totalOthers != null ? (
                        <div className="space-y-2">
                          {/* Devices bar */}
                          <div className="space-y-0.5">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Devices</span>
                              <span className="text-[10px] font-bold text-blue-600">
                                {run.catalogProgress ?? 0} / {run.totalCatalog}
                              </span>
                            </div>
                            <div className="w-full bg-zinc-100 rounded-full h-1.5 overflow-hidden">
                              <div
                                className="bg-blue-500 h-full rounded-full transition-all duration-500"
                                style={{ width: `${Math.min(100, Math.round((run.catalogProgress ?? 0) / run.totalCatalog * 100))}%` }}
                              />
                            </div>
                          </div>
                          {/* Others bar */}
                          <div className="space-y-0.5">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Others</span>
                              <span className="text-[10px] font-bold text-teal-600">
                                {run.othersProgress ?? 0} / {run.totalOthers}
                              </span>
                            </div>
                            <div className="w-full bg-zinc-100 rounded-full h-1.5 overflow-hidden">
                              <div
                                className="bg-teal-500 h-full rounded-full transition-all duration-500"
                                style={{ width: `${Math.min(100, Math.round((run.othersProgress ?? 0) / (run.totalOthers || 1) * 100))}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      ) : run.totalScraped !== null ? (
                        <span className="font-bold text-zinc-700">{run.totalScraped}</span>
                      ) : (
                        <span className="text-zinc-300">—</span>
                      )}
                    </td>
                    <td className="px-6 py-3.5 text-xs max-w-70">
                      {run.errorMessage
                        ? <span className="text-red-500 truncate block cursor-help" title={run.errorMessage}>{run.errorMessage}</span>
                        : <span className="text-zinc-300">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Search bar — shared across both tables */}
      <form onSubmit={handleSearch} className="flex items-center gap-2 max-w-sm">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <input
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="Search brand or model…"
            className="w-full h-10 pl-9 pr-4 rounded-xl border-2 border-zinc-200 text-sm font-medium outline-none focus:border-black transition-colors bg-white"
          />
        </div>
        <button type="submit" className="h-10 px-4 rounded-xl bg-black text-white text-sm font-bold hover:bg-zinc-800 transition-colors">
          Search
        </button>
        {refreshingTable && (
          <span className="flex items-center gap-1.5 text-[11px] text-zinc-400 font-medium ml-1">
            <RefreshCw className="h-3 w-3 animate-spin" /> Updating…
          </span>
        )}
      </form>

      {/* Catalog Devices Table */}
      <div className="bg-white rounded-3xl border border-zinc-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100">
          <div>
            <h2 className="font-bold text-base">Catalog Devices</h2>
            <p className="text-xs text-zinc-400 mt-0.5">Phones, tablets, laptops &amp; consoles</p>
          </div>
          <p className="text-sm text-zinc-400 font-medium">{catalogRows.length} devices</p>
        </div>

        {loadingTable ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 border-4 border-zinc-200 border-t-black rounded-full animate-spin" />
          </div>
        ) : catalogRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <TrendingUp className="h-10 w-10 text-zinc-200 mb-3" />
            <p className="font-bold text-zinc-500">No catalog prices yet</p>
            <p className="text-sm text-zinc-400">Click &quot;Run Now&quot; to scrape competitor prices.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[900px]">
                {priceTableHead}
                <tbody className="divide-y divide-zinc-50">
                  {pagedCatalog.map(renderPriceRow)}
                </tbody>
              </table>
            </div>
            {catalogPages > 1 && (
              <div className="flex items-center justify-between px-6 py-4 border-t border-zinc-100">
                <button
                  onClick={() => setCatalogPage(p => Math.max(1, p - 1))}
                  disabled={catalogPage === 1}
                  className="h-9 px-4 rounded-xl border-2 border-zinc-200 text-sm font-bold hover:border-zinc-400 transition-colors disabled:opacity-40"
                >
                  Previous
                </button>
                <p className="text-sm text-zinc-500 font-medium">Page {catalogPage} of {catalogPages}</p>
                <button
                  onClick={() => setCatalogPage(p => Math.min(catalogPages, p + 1))}
                  disabled={catalogPage === catalogPages}
                  className="h-9 px-4 rounded-xl border-2 border-zinc-200 text-sm font-bold hover:border-zinc-400 transition-colors disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Other Products Table */}
      {(otherRows.length > 0 || !loadingTable) && (
        <div className="bg-white rounded-3xl border border-zinc-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100">
            <div>
              <h2 className="font-bold text-base">Other Products</h2>
              <p className="text-xs text-zinc-400 mt-0.5">Accessories, cables, games &amp; more</p>
            </div>
            <p className="text-sm text-zinc-400 font-medium">{otherRows.length} items</p>
          </div>

          {loadingTable ? (
            <div className="flex items-center justify-center py-16">
              <div className="h-8 w-8 border-4 border-zinc-200 border-t-black rounded-full animate-spin" />
            </div>
          ) : otherRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <TrendingUp className="h-10 w-10 text-zinc-200 mb-3" />
              <p className="font-bold text-zinc-500">No other product prices yet</p>
              <p className="text-sm text-zinc-400">Run the scraper to fetch prices for accessories and other items.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[900px]">
                {priceTableHead}
                <tbody className="divide-y divide-zinc-50">
                  {otherRows.map(renderPriceRow)}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Clear Data confirm */}
      {showPurgeConfirm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-8 w-full max-w-sm shadow-2xl">
            <div className="h-14 w-14 rounded-2xl bg-red-100 flex items-center justify-center mx-auto mb-5">
              <AlertTriangle className="h-6 w-6 text-red-500" />
            </div>
            <h3 className="font-bold text-lg mb-1 text-center">Clear all scraper data?</h3>
            <p className="text-sm text-zinc-500 mb-5 text-center">
              This permanently deletes every scraped price and past run record. This cannot be undone —
              you&apos;ll need to run the scraper again to repopulate prices.
            </p>
            <p className="text-xs font-bold text-zinc-500 mb-2">Type <span className="font-mono bg-zinc-100 px-1.5 py-0.5 rounded">delete all</span> to confirm</p>
            <input
              type="text"
              value={purgeInput}
              onChange={e => { setPurgeInput(e.target.value); setPurgeError(""); }}
              placeholder="delete all"
              className="w-full h-11 rounded-xl border-2 border-zinc-200 px-4 text-sm font-medium outline-none focus:border-red-400 transition-colors mb-4"
            />
            {purgeError && <p className="text-xs text-red-600 font-medium mb-3 text-center">{purgeError}</p>}
            <div className="flex gap-3">
              <button
                onClick={() => { setShowPurgeConfirm(false); setPurgeInput(""); setPurgeError(""); }}
                className="flex-1 h-11 rounded-2xl border-2 border-zinc-200 font-bold text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handlePurgeAll}
                disabled={purgeInput !== "delete all" || purging}
                className="flex-1 h-11 rounded-2xl bg-red-500 text-white font-bold text-sm hover:bg-red-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {purging ? "Clearing…" : "Clear Data"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
