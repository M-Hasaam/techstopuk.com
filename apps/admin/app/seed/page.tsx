"use client";

import { useState } from "react";
import { DatabaseZap, CheckCircle, AlertCircle, Loader2, TriangleAlert, Trash2 } from "lucide-react";
import { useBgRemoval } from "../../context/bg-removal-context";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3002";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = typeof window !== "undefined" ? localStorage.getItem("ts_admin_token") : null;
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
  if (!res.ok) {
    if (res.status === 401) {
      throw new Error("401 Unauthorized — Admin session expired or role lacks ADMIN permissions. Please log out and log back into your admin account.");
    }
    let msg = res.statusText;
    try {
      const data = await res.json();
      msg = data.message || msg;
    } catch {
      const text = await res.text();
      msg = text || msg;
    }
    throw new Error(msg);
  }
  return res.json();
}

interface SeedResult {
  pricingConfigs: number;
  deviceCatalog: number;
  tradeInQuestions?: number;
  stores?: number;
  banners: number;
  promoSlides: number;
  others: { created: number; updated: number; errors: string[] };
  categories: number;
  brands: number;
  brandCategories: number;
  helplineSeeded: boolean;
  supportEmailSeeded: boolean;
  products: {
    created: number;
    updated: number;
    errors: string[];
    total: number;
  };
}

interface PurgeResult {
  deleted: number;
  counts: {
    orderItems: number;
    orders: number;
    tradeIns: number;
    repairs: number;
    reviews: number;
    scraperRuns: number;
    scrapedPrices: number;
    products: number;
    otherBrands: number;
    otherSubcategories: number;
    deviceCatalog: number;
    tradeInDevices?: number;
    tradeInQuestions?: number;
    stores?: number;
    brandCategories: number;
    categories: number;
    brands: number;
    banners: number;
    promoSlides: number;
    pricingConfigs: number;
    helplines: number;
    supportEmailCleared: boolean;
  };
}

export default function SeedPage() {
  const { startSeeding, stopSeeding } = useBgRemoval();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SeedResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  // Purge state
  const [purging, setPurging] = useState(false);
  const [purgeResult, setPurgeResult] = useState<PurgeResult | null>(null);
  const [purgeError, setPurgeError] = useState<string | null>(null);
  const [purgeConfirmed, setPurgeConfirmed] = useState(false);
  const [purgeTyped, setPurgeTyped] = useState("");

  async function handleSeed() {
    setLoading(true);
    setError(null);
    setResult(null);
    startSeeding();
    try {
      const res = await apiFetch<SeedResult>("/admin/seed/run", { method: "POST" });
      setResult(res);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
      stopSeeding();
    }
  }

  async function handlePurge() {
    setPurging(true);
    setPurgeError(null);
    setPurgeResult(null);
    try {
      const res = await apiFetch<PurgeResult>("/admin/seed/purge", { method: "DELETE" });
      setPurgeResult(res);
      setPurgeConfirmed(false);
      setPurgeTyped("");
    } catch (e: any) {
      setPurgeError(e.message);
    } finally {
      setPurging(false);
    }
  }

  const purgeReady = purgeConfirmed && purgeTyped === "DELETE EVERYTHING";

  return (
    <div className="min-h-screen bg-background p-8 max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Database Seed</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Seeds the production database from files in the <code className="text-xs font-mono bg-zinc-100 px-1 rounded">prisma/seed/</code> folder.
          Uploads all product images to S3 and upserts products, pricing configs, and the device trade-in catalog.
          Also fills in a default helpline number and support email if none are set yet — safe to re-run, it never overwrites those two once you've customized them.
        </p>
      </div>

      <div className="bg-white rounded-3xl border border-zinc-100 shadow-sm p-8 space-y-6">
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-100 space-y-2">
          <div className="flex items-center gap-2">
            <TriangleAlert className="h-4 w-4 text-amber-600 shrink-0" />
            <p className="text-sm font-bold text-amber-800">Before you run</p>
          </div>
          <ul className="text-xs text-amber-700 space-y-1 list-disc list-inside">
            <li>Reads <code className="bg-amber-100 px-1 rounded font-mono">prisma/seed/products.json</code> and images from the <code className="bg-amber-100 px-1 rounded font-mono">prisma/seed/</code> folder.</li>
            <li>Uploads images from that folder to S3.</li>
            <li>Upserts products by slug — existing products are updated, new ones created.</li>
            <li>Replaces the entire device trade-in catalog and upserts pricing configs.</li>
            <li>This can take <strong>1–3 minutes</strong> depending on image count — don't close the tab.</li>
          </ul>
        </div>

        {!result && (
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={e => setConfirmed(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded"
            />
            <span className="text-sm text-zinc-600">
              I understand this will modify the production database and S3 storage.
            </span>
          </label>
        )}

        {!result && (
          <button
            onClick={handleSeed}
            disabled={loading || !confirmed}
            className="w-full h-12 rounded-2xl bg-zinc-950 text-white font-bold text-sm flex items-center justify-center gap-2 hover:bg-zinc-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Seeding… this may take a couple of minutes
              </>
            ) : (
              <>
                <DatabaseZap className="h-4 w-4" />
                Run Full Seed
              </>
            )}
          </button>
        )}

        {error && (
          <div className="flex items-start gap-3 p-4 rounded-2xl bg-red-50 border border-red-100">
            <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
            <p className="text-sm text-red-700 font-medium">{error}</p>
          </div>
        )}

        {result && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-4 rounded-2xl bg-emerald-50 border border-emerald-100">
              <CheckCircle className="h-5 w-5 text-emerald-600 shrink-0" />
              <p className="font-bold text-emerald-800">Seed complete!</p>
            </div>

            <div className="rounded-2xl border border-zinc-100 overflow-hidden divide-y divide-zinc-100">
              <div className="flex items-center justify-between px-5 py-2.5">
                <span className="text-sm text-zinc-500">Pricing configs seeded</span>
                <span className="font-bold text-sm">{result.pricingConfigs}</span>
              </div>
              <div className="flex items-center justify-between px-5 py-2.5">
                <span className="text-sm text-zinc-500">Categories seeded</span>
                <span className="font-bold text-sm">{result.categories}</span>
              </div>
              <div className="flex items-center justify-between px-5 py-2.5">
                <span className="text-sm text-zinc-500">Brands seeded</span>
                <span className="font-bold text-sm">{result.brands}</span>
              </div>
              <div className="flex items-center justify-between px-5 py-2.5">
                <span className="text-sm text-zinc-500">Brand–Category links</span>
                <span className="font-bold text-sm">{result.brandCategories}</span>
              </div>
              <div className="flex items-center justify-between px-5 py-2.5">
                <span className="text-sm text-zinc-500">Trade-in catalog entries</span>
                <span className="font-bold text-sm">{result.deviceCatalog}</span>
              </div>
              <div className="flex items-center justify-between px-5 py-2.5">
                <span className="text-sm text-zinc-500">Trade-in questions seeded</span>
                <span className="font-bold text-sm">{result.tradeInQuestions ?? 0}</span>
              </div>
              <div className="flex items-center justify-between px-5 py-2.5">
                <span className="text-sm text-zinc-500">Store locations seeded</span>
                <span className="font-bold text-sm">{result.stores ?? 0}</span>
              </div>
              <div className="flex items-center justify-between px-5 py-2.5">
                <span className="text-sm text-zinc-500">Promo slides seeded</span>
                <span className="font-bold text-sm">{result.promoSlides}</span>
              </div>
              <div className="flex items-center justify-between px-5 py-2.5">
                <span className="text-sm text-zinc-500">Background banners seeded</span>
                <span className="font-bold text-sm">{result.banners}</span>
              </div>
              <div className="flex items-center justify-between px-5 py-2.5">
                <span className="text-sm text-zinc-500">Default helpline number</span>
                <span className="font-bold text-sm">{result.helplineSeeded ? "Added" : "Already set"}</span>
              </div>
              <div className="flex items-center justify-between px-5 py-2.5">
                <span className="text-sm text-zinc-500">Support contact email</span>
                <span className="font-bold text-sm">{result.supportEmailSeeded ? "Added" : "Already set"}</span>
              </div>
              <div className="flex items-center justify-between px-5 py-2.5">
                <span className="text-sm text-zinc-500">Products created</span>
                <span className="font-bold text-sm text-emerald-600">{result.products.created}</span>
              </div>
              <div className="flex items-center justify-between px-5 py-2.5">
                <span className="text-sm text-zinc-500">Products updated</span>
                <span className="font-bold text-sm text-sky-600">{result.products.updated}</span>
              </div>
              <div className="flex items-center justify-between px-5 py-2.5">
                <span className="text-sm text-zinc-500">Other items created</span>
                <span className="font-bold text-sm text-teal-600">{result.others.created}</span>
              </div>
              <div className="flex items-center justify-between px-5 py-2.5">
                <span className="text-sm text-zinc-500">Other items updated</span>
                <span className="font-bold text-sm text-sky-600">{result.others.updated}</span>
              </div>
              <div className="flex items-center justify-between px-5 py-3 bg-zinc-50/50">
                <span className="text-sm font-semibold text-zinc-700">Total products processed</span>
                <span className="font-bold text-sm">{result.products.total + result.others.created + result.others.updated}</span>
              </div>
            </div>

            {result.products.errors.length > 0 && (
              <div className="rounded-2xl border border-red-100 overflow-hidden">
                <div className="px-5 py-3 bg-red-50 border-b border-red-100">
                  <p className="text-xs font-bold text-red-600 uppercase tracking-widest">
                    {result.products.errors.length} device product errors
                  </p>
                </div>
                <div className="px-5 py-3 max-h-48 overflow-y-auto space-y-1">
                  {result.products.errors.map((e, i) => (
                    <p key={i} className="text-xs text-red-600 font-mono">{e}</p>
                  ))}
                </div>
              </div>
            )}

            {result.others.errors.length > 0 && (
              <div className="rounded-2xl border border-orange-100 overflow-hidden">
                <div className="px-5 py-3 bg-orange-50 border-b border-orange-100">
                  <p className="text-xs font-bold text-orange-600 uppercase tracking-widest">
                    {result.others.errors.length} others errors
                  </p>
                </div>
                <div className="px-5 py-3 max-h-48 overflow-y-auto space-y-1">
                  {result.others.errors.map((e, i) => (
                    <p key={i} className="text-xs text-orange-700 font-mono">{e}</p>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={() => { setResult(null); setConfirmed(false); }}
              className="w-full h-10 rounded-2xl border border-zinc-200 text-sm font-medium text-zinc-600 hover:bg-zinc-50 transition-colors"
            >
              Run again
            </button>
          </div>
        )}
      </div>
      {/* ── Danger Zone ── */}
      <div className="mt-10">
        <div className="flex items-center gap-2 mb-4">
          <Trash2 className="h-4 w-4 text-red-500" />
          <h2 className="text-lg font-bold text-red-600">Danger Zone</h2>
        </div>

        <div className="bg-white rounded-3xl border border-red-200 shadow-sm p-8 space-y-6">
          {!purgeResult ? (
            <div className="space-y-6">
              <div className="p-4 rounded-2xl bg-red-50 border border-red-100 space-y-2">
                <div className="flex items-center gap-2">
                  <TriangleAlert className="h-4 w-4 text-red-600 shrink-0" />
                  <p className="text-sm font-bold text-red-800">This is irreversible</p>
                </div>
                <ul className="text-xs text-red-700 space-y-1 list-disc list-inside">
                  <li>Wipes <strong>every file</strong> in Garage (S3) — products, banners, trade-in images, repair images, everything.</li>
                  <li>Deletes all products, categories, brands, brand-categories, device catalog entries.</li>
                  <li>Deletes all orders, order items, trade-ins, repairs, and reviews.</li>
                  <li>Removes all pricing configs and scraper history.</li>
                  <li>Clears helpline numbers and the support contact email too.</li>
                  <li>Use this before a full re-seed to start from a clean slate.</li>
                </ul>
              </div>

              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={purgeConfirmed}
                  onChange={e => setPurgeConfirmed(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded accent-red-600"
                />
                <span className="text-sm text-zinc-600">
                  I understand this will permanently delete all catalog and product data from the database and Garage storage.
                </span>
              </label>

              {purgeConfirmed && (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest">
                    Type <span className="font-mono text-red-600">DELETE EVERYTHING</span> to confirm
                  </p>
                  <input
                    type="text"
                    value={purgeTyped}
                    onChange={e => setPurgeTyped(e.target.value)}
                    placeholder="DELETE EVERYTHING"
                    className="w-full h-10 px-4 rounded-xl border border-red-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-red-400"
                  />
                </div>
              )}

              <button
                onClick={handlePurge}
                disabled={purging || !purgeReady}
                className="w-full h-12 rounded-2xl bg-red-600 text-white font-bold text-sm flex items-center justify-center gap-2 hover:bg-red-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {purging ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Purging database and Garage…
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4" />
                    Delete Everything
                  </>
                )}
              </button>

              {purgeError && (
                <div className="flex items-start gap-3 p-4 rounded-2xl bg-red-50 border border-red-100">
                  <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700 font-medium">{purgeError}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 rounded-2xl bg-emerald-50 border border-emerald-100">
                <CheckCircle className="h-5 w-5 text-emerald-600 shrink-0" />
                <p className="font-bold text-emerald-800">Purge complete — database and Garage cleared.</p>
              </div>
              <div className="rounded-2xl border border-zinc-100 overflow-hidden divide-y divide-zinc-100">
                <div className="flex items-center justify-between px-5 py-2">
                  <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Entity type</span>
                  <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Deleted</span>
                </div>
                <div className="flex items-center justify-between px-5 py-2.5">
                  <span className="text-sm text-zinc-500">Products</span>
                  <span className="font-bold text-sm text-red-600">{purgeResult.counts.products}</span>
                </div>
                <div className="flex items-center justify-between px-5 py-2.5">
                  <span className="text-sm text-zinc-500">Other Brands</span>
                  <span className="font-bold text-sm text-red-600">{purgeResult.counts.otherBrands}</span>
                </div>
                <div className="flex items-center justify-between px-5 py-2.5">
                  <span className="text-sm text-zinc-500">Other Subcategories</span>
                  <span className="font-bold text-sm text-red-600">{purgeResult.counts.otherSubcategories}</span>
                </div>
                <div className="flex items-center justify-between px-5 py-2.5">
                  <span className="text-sm text-zinc-500">Device Catalog Entries</span>
                  <span className="font-bold text-sm text-red-600">{purgeResult.counts.deviceCatalog}</span>
                </div>
                <div className="flex items-center justify-between px-5 py-2.5">
                  <span className="text-sm text-zinc-500">Trade-In Questions</span>
                  <span className="font-bold text-sm text-red-600">{purgeResult.counts.tradeInQuestions ?? 0}</span>
                </div>
                <div className="flex items-center justify-between px-5 py-2.5">
                  <span className="text-sm text-zinc-500">Store Locations</span>
                  <span className="font-bold text-sm text-red-600">{purgeResult.counts.stores ?? 0}</span>
                </div>
                <div className="flex items-center justify-between px-5 py-2.5">
                  <span className="text-sm text-zinc-500">Brand-Category Links</span>
                  <span className="font-bold text-sm text-red-600">{purgeResult.counts.brandCategories}</span>
                </div>
                <div className="flex items-center justify-between px-5 py-2.5">
                  <span className="text-sm text-zinc-500">Categories</span>
                  <span className="font-bold text-sm text-red-600">{purgeResult.counts.categories}</span>
                </div>
                <div className="flex items-center justify-between px-5 py-2.5">
                  <span className="text-sm text-zinc-500">Brands</span>
                  <span className="font-bold text-sm text-red-600">{purgeResult.counts.brands}</span>
                </div>
                <div className="flex items-center justify-between px-5 py-2.5">
                  <span className="text-sm text-zinc-500">Promo Slides</span>
                  <span className="font-bold text-sm text-red-600">{purgeResult.counts.promoSlides}</span>
                </div>
                <div className="flex items-center justify-between px-5 py-2.5">
                  <span className="text-sm text-zinc-500">Banners</span>
                  <span className="font-bold text-sm text-red-600">{purgeResult.counts.banners}</span>
                </div>
                <div className="flex items-center justify-between px-5 py-2.5">
                  <span className="text-sm text-zinc-500">Pricing Configs</span>
                  <span className="font-bold text-sm text-red-600">{purgeResult.counts.pricingConfigs}</span>
                </div>
                <div className="flex items-center justify-between px-5 py-2.5">
                  <span className="text-sm text-zinc-500">Helpline Numbers</span>
                  <span className="font-bold text-sm text-red-600">{purgeResult.counts.helplines}</span>
                </div>
                <div className="flex items-center justify-between px-5 py-2.5">
                  <span className="text-sm text-zinc-500">Support Email</span>
                  <span className="font-bold text-sm text-red-600">{purgeResult.counts.supportEmailCleared ? "Cleared" : "Was already unset"}</span>
                </div>
                <div className="flex items-center justify-between px-5 py-2.5">
                  <span className="text-sm text-zinc-500">Order Items</span>
                  <span className="font-bold text-sm text-red-600">{purgeResult.counts.orderItems}</span>
                </div>
                <div className="flex items-center justify-between px-5 py-2.5">
                  <span className="text-sm text-zinc-500">Orders</span>
                  <span className="font-bold text-sm text-red-600">{purgeResult.counts.orders}</span>
                </div>
                <div className="flex items-center justify-between px-5 py-2.5">
                  <span className="text-sm text-zinc-500">Trade-Ins</span>
                  <span className="font-bold text-sm text-red-600">{purgeResult.counts.tradeIns}</span>
                </div>
                <div className="flex items-center justify-between px-5 py-2.5">
                  <span className="text-sm text-zinc-500">Repairs</span>
                  <span className="font-bold text-sm text-red-600">{purgeResult.counts.repairs}</span>
                </div>
                <div className="flex items-center justify-between px-5 py-2.5">
                  <span className="text-sm text-zinc-500">Reviews</span>
                  <span className="font-bold text-sm text-red-600">{purgeResult.counts.reviews}</span>
                </div>
                <div className="flex items-center justify-between px-5 py-2.5">
                  <span className="text-sm text-zinc-500">Scraper Run History</span>
                  <span className="font-bold text-sm text-red-600">{purgeResult.counts.scraperRuns}</span>
                </div>
                <div className="flex items-center justify-between px-5 py-2.5">
                  <span className="text-sm text-zinc-500">Scraped Prices</span>
                  <span className="font-bold text-sm text-red-600">{purgeResult.counts.scrapedPrices}</span>
                </div>
                <div className="flex items-center justify-between px-5 py-3 bg-zinc-50/50">
                  <span className="text-sm font-semibold text-zinc-700">Garage S3 Assets Deleted</span>
                  <span className="font-black text-sm text-zinc-900">{purgeResult.deleted}</span>
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => { setPurgeResult(null); handleSeed(); }}
                  className="flex-1 h-11 rounded-2xl bg-zinc-950 text-white font-bold text-sm hover:bg-zinc-800 transition-colors flex items-center justify-center gap-2"
                >
                  <DatabaseZap className="h-4 w-4" />
                  Run Full Re-Seed Now
                </button>
                <button
                  onClick={() => setPurgeResult(null)}
                  className="h-11 px-5 rounded-2xl border border-zinc-200 text-sm font-medium text-zinc-600 hover:bg-zinc-50 transition-colors"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
