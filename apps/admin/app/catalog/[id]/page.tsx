"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, ArrowUpRight, ShieldCheck, Database, Layers, TrendingUp, Clock,
  RefreshCw, AlertCircle, RefreshCcw, PoundSterling, Check, X as XIcon,
} from "lucide-react";
import {
  deviceCatalogApi, productsApi, scraperApi,
  type DeviceCatalogItem, type Product, type ScrapedPriceRow,
} from "../../../lib/api";


const SCRAPER_ENABLED = process.env.NEXT_PUBLIC_SCRAPER_ENABLED === "true";

function fmt(v: number | null) {
  return v !== null && v > 0 ? `£${v.toFixed(0)}` : <span className="text-zinc-300">—</span>;
}

function ageDays(date: string) {
  return Math.round((Date.now() - new Date(date).getTime()) / 86_400_000);
}

export default function CatalogDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [device, setDevice]     = useState<DeviceCatalogItem | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [prices, setPrices]     = useState<ScrapedPriceRow[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState("");

  // Per-device re-scrape
  const [scraping, setScraping]   = useState(false);
  const [scrapeMsg, setScrapeMsg] = useState("");

  // Trade-in toggle
  const [togglingTradeIn, setTogglingTradeIn] = useState(false);

  // Manual market price
  const [manualPriceInput, setManualPriceInput] = useState<string>("");
  const [savingManualPrice, setSavingManualPrice] = useState(false);
  const [manualPriceSaved, setManualPriceSaved] = useState(false);
  const [manualPriceError, setManualPriceError] = useState("");

  async function handleToggleTradeIn() {
    if (!device) return;
    setTogglingTradeIn(true);
    try {
      const updated = await deviceCatalogApi.update(device.id, { tradeInEnabled: !device.tradeInEnabled });
      setDevice(updated);
    } catch (e: any) {
      alert(e.message ?? "Failed to update trade-in availability");
    } finally {
      setTogglingTradeIn(false);
    }
  }

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const devItem = await deviceCatalogApi.getById(id);
        setDevice(devItem);
        setManualPriceInput(devItem.manualMarketPrice != null ? String(devItem.manualMarketPrice) : "");

        // Products and scraper prices are non-fatal
        productsApi.list({ limit: 200 })
          .then(prodList =>
            setProducts(
              prodList.items.filter(p =>
                p.catalogId === devItem.id ||
                (p.brand?.toLowerCase() === devItem.brandCategory.brand.name.toLowerCase() &&
                 p.model?.toLowerCase() === devItem.model.toLowerCase()),
              ),
            ),
          )
          .catch(() => {});

        scraperApi.devicePrices(devItem.brandCategory.brand.name, devItem.model)
          .then(setPrices)
          .catch(() => {});
      } catch (err: any) {
        setError(err.message || "Failed to load catalog details");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  async function handleScrapeDevice() {
    if (!device) return;
    setScraping(true);
    setScrapeMsg("");
    try {
      // Scrape only this device's storage variants — much faster than the full catalog scrape
      const res = await scraperApi.scrapeDevice(device.brandCategory.brand.name, device.model);
      setScrapeMsg(res.message);
      // Reload prices after 15 s to allow per-storage scrapes to finish
      setTimeout(async () => {
        const fresh = await scraperApi.devicePrices(device.brandCategory.brand.name, device.model).catch(() => null);
        if (fresh) setPrices(fresh);
        setScrapeMsg("");
      }, 15000);
    } catch (e: any) {
      setScrapeMsg(e.message ?? "Failed to start scraper");
    } finally {
      setScraping(false);
    }
  }

  async function handleSaveManualPrice(clear = false) {
    if (!device) return;
    setManualPriceError("");
    const parsed = clear ? null : parseFloat(manualPriceInput);
    if (!clear && (isNaN(parsed!) || parsed! <= 0)) {
      setManualPriceError("Enter a valid price above £0");
      return;
    }
    setSavingManualPrice(true);
    try {
      const updated = await deviceCatalogApi.update(device.id, { manualMarketPrice: parsed });
      setDevice(updated);
      if (clear) setManualPriceInput("");
      setManualPriceSaved(true);
      setTimeout(() => setManualPriceSaved(false), 2500);
    } catch (e: any) {
      setManualPriceError(e.message ?? "Failed to save");
    } finally {
      setSavingManualPrice(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f8f9fa] flex items-center justify-center p-8">
        <div className="h-8 w-8 border-4 border-zinc-200 border-t-black rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !device) {
    return (
      <div className="min-h-screen bg-[#f8f9fa] p-8 max-w-3xl mx-auto">
        <button onClick={() => router.push("/catalog")} className="flex items-center gap-2 text-zinc-500 hover:text-black font-semibold mb-6 transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back to catalog
        </button>
        <div className="bg-white rounded-3xl p-8 border border-zinc-150 text-center shadow-sm">
          <p className="text-red-500 font-bold mb-4">{error || "Catalog device not found"}</p>
          <button onClick={() => router.push("/catalog")} className="px-6 py-2.5 bg-black text-white rounded-xl text-sm font-bold">
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const categoryLabel = device.brandCategory.category.name;
  const totalStock = products.reduce((acc, p) => acc + p.stock, 0);
  const scrapeIsError = scrapeMsg.toLowerCase().includes("fail") || scrapeMsg.toLowerCase().includes("error");

  // Compute trade-in offer: 30% margin applied to CeX sell price
  function tradeInOffer(sellPrice: number | null): string {
    if (!sellPrice || sellPrice <= 0) return "—";
    return `£${Math.max(Math.round(sellPrice * 0.7 / 5) * 5, 10)}`;
  }

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto min-h-screen bg-[#f8f9fa] text-zinc-900 font-sans">
      <button onClick={() => router.push("/catalog")} className="flex items-center gap-2 text-zinc-500 hover:text-black font-semibold mb-6 transition-colors text-sm">
        <ArrowLeft className="h-4 w-4" /> Back to catalog
      </button>

      {/* Main grid: Device info + Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        {/* Device Info */}
        <div className="md:col-span-2 bg-white rounded-3xl p-6 border border-zinc-150 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="inline-flex items-center px-3 py-1 rounded-lg text-xs font-bold bg-zinc-100 text-zinc-600">
                {categoryLabel}
              </span>
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${device.isActive ? "bg-emerald-100 text-emerald-800" : "bg-zinc-100 text-zinc-500"}`}>
                  {device.isActive ? "Active" : "Inactive"}
                </span>
                <button
                  onClick={handleToggleTradeIn}
                  disabled={togglingTradeIn}
                  title={device.tradeInEnabled ? "Disable for trade-in" : "Enable for trade-in"}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider border transition-colors disabled:opacity-50 ${
                    device.tradeInEnabled
                      ? "bg-sky-100 text-sky-800 border-sky-200 hover:bg-sky-200"
                      : "bg-zinc-100 text-zinc-500 border-zinc-200 hover:bg-zinc-200"
                  }`}
                >
                  {togglingTradeIn
                    ? <RefreshCcw className="h-3 w-3 animate-spin" />
                    : null}
                  Trade-in: {device.tradeInEnabled ? "On" : "Off"}
                </button>
              </div>
            </div>
            <h1 className="text-3xl font-extrabold text-zinc-950 mb-1 leading-tight">{device.brandCategory.brand.name} {device.model}</h1>
            <p className="text-zinc-400 text-xs font-medium">Device Catalog ID: <span className="font-mono text-[10px]">{device.id}</span></p>
            <div className="mt-6">
              <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-400 mb-2">Configured Storage Variants</h3>
              <div className="flex flex-wrap gap-2">
                {device.storageOptions.length > 0 ? (
                  device.storageOptions.map(option => (
                    <span key={option} className="px-3 py-1 bg-zinc-100 text-zinc-600 rounded-xl text-xs font-semibold border border-zinc-200/50">{option}</span>
                  ))
                ) : (
                  <span className="text-sm text-zinc-400 italic">No storage options configured.</span>
                )}
              </div>
            </div>
            {(device.attributeOptions ?? []).length > 0 && (
              <div className="mt-6">
                <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-400 mb-2">Configured Attributes</h3>
                <div className="space-y-2.5">
                  {device.attributeOptions.map(group => (
                    <div key={group.label} className="flex items-start gap-3">
                      <span className="shrink-0 pt-1 text-xs font-bold text-zinc-500 w-20">{group.label}</span>
                      <div className="flex flex-wrap gap-2">
                        {group.options.map(option => (
                          <span key={option} className="px-3 py-1 bg-blue-50 text-blue-700 rounded-xl text-xs font-semibold border border-blue-100">{option}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="mt-8 pt-4 border-t border-zinc-100 flex items-center justify-between text-xs text-zinc-400 font-medium">
            <span>Created: {new Date(device.createdAt).toLocaleDateString()}</span>
            <span>Last Updated: {new Date(device.updatedAt).toLocaleDateString()}</span>
          </div>
        </div>

        {/* Stats */}
        <div className="bg-white rounded-3xl p-6 border border-zinc-150 shadow-sm flex flex-col justify-between">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-400 mb-4">Stock & Items Overview</h2>
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 bg-zinc-50 border border-zinc-100 rounded-xl flex items-center justify-center shrink-0">
                  <Database className="h-5 w-5 text-zinc-500" />
                </div>
                <div>
                  <p className="text-xs text-zinc-400 font-bold">Total E-Commerce Listings</p>
                  <p className="text-xl font-bold">{products.length} products</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 bg-zinc-50 border border-zinc-100 rounded-xl flex items-center justify-center shrink-0">
                  <Layers className="h-5 w-5 text-zinc-500" />
                </div>
                <div>
                  <p className="text-xs text-zinc-400 font-bold">Total Available Stock</p>
                  <p className="text-xl font-bold">{totalStock} units</p>
                </div>
              </div>
            </div>
          </div>
          <div className="mt-6 p-3 bg-zinc-50 rounded-2xl border border-zinc-100 flex items-center gap-2 text-xs text-zinc-500">
            <ShieldCheck className="h-4 w-4 text-emerald-500 shrink-0" />
            <span>Metrics calculated from active product listings matching this brand & model.</span>
          </div>
        </div>
      </div>

      {/* ── Manual Market Price ───────────────────────────────────────────────── */}
      <div className="bg-white rounded-3xl border border-zinc-150 shadow-sm p-6 mb-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-base font-bold text-zinc-900 flex items-center gap-2">
              <PoundSterling className="h-4 w-4 text-blue-500" />
              Manual Market Price
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Set a market reference price when no scraper data exists. The trade-in offer is calculated from this value using the configured pricing rules.
              {device.manualMarketPrice
                ? <span className="ml-1 font-semibold text-blue-600">Currently set to £{device.manualMarketPrice}</span>
                : <span className="ml-1 text-amber-500 font-semibold">Not set — this device shows as "Unpriced" in trade-in.</span>}
            </p>
          </div>
          {device.manualMarketPrice != null && (
            <button
              onClick={() => handleSaveManualPrice(true)}
              disabled={savingManualPrice}
              className="flex items-center gap-1.5 text-xs font-bold text-zinc-400 hover:text-red-500 transition-colors disabled:opacity-50"
            >
              <XIcon className="h-3.5 w-3.5" /> Clear price
            </button>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-xs">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-zinc-400">£</span>
            <input
              type="number"
              min={1}
              step={1}
              value={manualPriceInput}
              onChange={e => setManualPriceInput(e.target.value)}
              placeholder="e.g. 350"
              className="w-full h-10 pl-7 pr-4 rounded-xl border border-zinc-200 text-sm font-mono font-bold focus:outline-none focus:border-blue-400 transition-colors"
            />
          </div>
          <button
            onClick={() => handleSaveManualPrice(false)}
            disabled={savingManualPrice || !manualPriceInput}
            className={`flex items-center gap-2 h-10 px-5 rounded-xl text-sm font-bold transition-all disabled:opacity-50 ${
              manualPriceSaved ? "bg-emerald-500 text-white" : "bg-blue-600 hover:bg-blue-700 text-white"
            }`}
          >
            {manualPriceSaved ? <><Check className="h-3.5 w-3.5" /> Saved!</> : "Save price"}
          </button>
        </div>
        {manualPriceError && (
          <p className="text-xs text-red-500 font-medium mt-2 flex items-center gap-1">
            <AlertCircle className="h-3.5 w-3.5" /> {manualPriceError}
          </p>
        )}
      </div>

      {/* ── Competitor Prices ─────────────────────────────────────────────────── */}
      {SCRAPER_ENABLED && <div className="bg-white rounded-3xl border border-zinc-150 shadow-sm overflow-hidden mb-6">
        <div className="px-6 py-5 border-b border-zinc-100 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-emerald-500" /> Competitor Prices
            </h2>
            <p className="text-xs text-zinc-400 font-medium mt-0.5">
              Live CeX market data per storage variant. Used as the primary source for trade-in pricing.
            </p>
          </div>
          <button
            onClick={handleScrapeDevice}
            disabled={scraping}
            className="flex items-center gap-2 h-9 px-4 rounded-xl border-2 border-zinc-200 text-xs font-bold text-zinc-600 hover:border-zinc-400 hover:text-black transition-colors disabled:opacity-50"
          >
            {scraping
              ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Scraping…</>
              : <><RefreshCw className="h-3.5 w-3.5" /> Re-scrape</>}
          </button>
        </div>

        {/* Scrape message */}
        {scrapeMsg && (
          <div className={`flex items-center gap-3 px-6 py-3 text-sm font-medium border-b ${
            scrapeIsError ? "bg-red-50 border-red-100 text-red-700" : "bg-emerald-50 border-emerald-100 text-emerald-700"
          }`}>
            {scrapeIsError ? <AlertCircle className="h-4 w-4 shrink-0" /> : <RefreshCw className="h-4 w-4 shrink-0" />}
            {scrapeMsg}
            {!scrapeIsError && <span className="font-normal text-emerald-600 ml-1">— prices will refresh below in ~8 seconds.</span>}
          </div>
        )}

        {prices.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <TrendingUp className="h-10 w-10 text-zinc-200 mx-auto mb-3" />
            <p className="font-bold text-zinc-500 text-sm mb-1">No price data yet</p>
            <p className="text-xs text-zinc-400">Click "Re-scrape" to fetch CeX market prices for all storage variants of this device.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[750px]">
            <thead>
              <tr className="border-b border-zinc-100 bg-zinc-50/50">
                {["Storage", "CeX Sell", "CeX Cash", "CeX Exchange", "Est. Trade-in Offer", "Scraped"].map(h => (
                  <th key={h} className="text-left px-6 py-3 text-[10px] font-bold uppercase tracking-widest text-zinc-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {prices.map(row => {
                const days = ageDays(row.scrapedAt);
                const stale = days > 7;
                return (
                  <tr key={row.id} className="hover:bg-zinc-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <span className="px-2.5 py-1 bg-zinc-100 text-zinc-600 rounded-lg text-xs font-semibold">
                        {row.storage || "—"}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-mono font-bold text-zinc-800">{fmt(row.cexSellPrice)}</td>
                    <td className="px-6 py-4 font-mono text-zinc-500">{fmt(row.cexCashPrice)}</td>
                    <td className="px-6 py-4 font-mono text-zinc-500">{fmt(row.cexExchangePrice)}</td>
                    <td className="px-6 py-4">
                      {row.cexSellPrice && row.cexSellPrice > 0 ? (
                        <span className="inline-flex items-center font-bold font-mono text-xs text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg">
                          {tradeInOffer(row.cexSellPrice)}
                        </span>
                      ) : (
                        <span className="text-zinc-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`flex items-center gap-1.5 text-xs font-medium whitespace-nowrap ${stale ? "text-amber-500" : "text-zinc-400"}`}>
                        <Clock className="h-3 w-3" />
                        {days === 0 ? "Today" : `${days}d ago`}
                        {stale && <span className="text-[10px] font-bold bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded ml-1">Stale</span>}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>}

      {/* ── Linked Products ───────────────────────────────────────────────────── */}
      <div className="bg-white rounded-3xl border border-zinc-150 shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-zinc-100">
          <h2 className="text-lg font-bold text-zinc-900">Linked E-Commerce Products</h2>
          <p className="text-xs text-zinc-400 font-medium mt-0.5">Click any product listing to edit or manage its details.</p>
        </div>

        {products.length === 0 ? (
          <div className="px-6 py-12 text-center text-zinc-400 font-medium">
            <p className="text-sm mb-2">No products currently linked to this catalog model.</p>
            <p className="text-xs text-zinc-300">New product listings with this exact brand and model will automatically link here.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="border-b border-zinc-100 bg-zinc-50/50">
                <th className="text-left px-6 py-3 text-xs font-bold uppercase tracking-widest text-zinc-400">Product Name</th>
                <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-widest text-zinc-400">Condition</th>
                <th className="text-right px-4 py-3 text-xs font-bold uppercase tracking-widest text-zinc-400">Price</th>
                <th className="text-right px-4 py-3 text-xs font-bold uppercase tracking-widest text-zinc-400">Stock</th>
                <th className="text-center px-4 py-3 text-xs font-bold uppercase tracking-widest text-zinc-400">Status</th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {products.map(p => (
                <tr key={p.id} onClick={() => router.push(`/products/${p.id}`)} className="hover:bg-zinc-50/50 transition-colors group cursor-pointer">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      {p.images?.[0] ? (
                        <img src={p.images[0]} alt={p.name} className="h-10 w-10 rounded-xl object-cover border border-zinc-100 shrink-0" />
                      ) : (
                        <div className="h-10 w-10 rounded-xl bg-zinc-50 border border-zinc-150 flex items-center justify-center shrink-0">
                          <span className="text-zinc-300 text-xs font-bold">Img</span>
                        </div>
                      )}
                      <div>
                        <p className="font-bold text-zinc-950 group-hover:text-black">{p.name}</p>
                        <p className="text-xs text-zinc-400 mt-0.5">
                          Storage: {p.storage || "—"}
                          {Object.values(p.attributes ?? {}).filter(Boolean).length > 0 &&
                            ` · ${Object.values(p.attributes ?? {}).filter(Boolean).join(" · ")}`}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <span className="rounded-full bg-zinc-100 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-zinc-600">{p.condition}</span>
                  </td>
                  <td className="px-4 py-4 text-right font-bold font-mono text-zinc-900">£{p.price}</td>
                  <td className={`px-4 py-4 text-right font-bold font-mono ${p.stock === 0 ? "text-red-500" : p.stock <= 2 ? "text-amber-500" : "text-zinc-700"}`}>
                    {p.stock}
                  </td>
                  <td className="px-4 py-4 text-center">
                    <span className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase ${p.isActive ? "bg-emerald-100 text-emerald-700" : "bg-zinc-100 text-zinc-500"}`}>
                      {p.isActive ? "Active" : "Hidden"}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-zinc-400 group-hover:text-black transition-colors">
                      Edit <ArrowUpRight className="h-3 w-3" />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  );
}
