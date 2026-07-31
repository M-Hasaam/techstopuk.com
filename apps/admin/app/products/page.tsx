"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Plus, Edit2, Trash2, X, Check, Package, Image as ImageIcon,
  ChevronDown, ExternalLink, AlertTriangle, Zap, ToggleLeft, ToggleRight,
  RefreshCw, Loader2 } from "lucide-react";
import { productsApi, deviceCatalogApi, productPricingApi, pricingConfigApi,
  type Product, type CreateProductPayload, type DeviceCatalogItem,
  type PricingRunResult, type PricingJobStatus } from "../../lib/api";

const CONDITIONS = [
  { value: 'NEW', label: 'New' },
  { value: 'A',   label: 'A Grade' },
  { value: 'B',   label: 'B Grade' },
  { value: 'C',   label: 'C Grade' },
  { value: 'F',   label: 'F Grade' },
];

// Map status tab labels to server-side pricingStatus values
const STATUS_TO_API: Record<string, string | undefined> = {
  'All': undefined,
  'Auto-priced': 'auto_priced',
  'Flagged': 'flagged',
  'No Price': 'no_data',
};

const EMPTY_FORM: CreateProductPayload = {
  catalogId: "", name: "", condition: "A",
  storage: "", attributes: {}, price: 0, comparePrice: undefined,
  stock: 0, description: "", isActive: true,
};

export default function ProductsPage() {
  const router = useRouter();

  // ── Product list state ────────────────────────────────────────────────────
  const [products, setProducts]     = useState<Product[]>([]);
  const [loading, setLoading]       = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore]       = useState(false);
  const [total, setTotal]           = useState(0);

  // ── Filters ───────────────────────────────────────────────────────────────
  const [search, setSearch]         = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("All");
  const [filterStatus, setFilterStatus]     = useState<string>("All");
  const [categories, setCategories] = useState<string[]>([]);

  // ── Modals / UI state ─────────────────────────────────────────────────────
  const [showModal, setShowModal]   = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [formData, setFormData]     = useState<CreateProductPayload>(EMPTY_FORM);
  const [deleteId, setDeleteId]     = useState<string | null>(null);
  const [showDeleteAll, setShowDeleteAll] = useState(false);
  const [deleteAllInput, setDeleteAllInput] = useState("");
  const [deletingAll, setDeletingAll] = useState(false);
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState("");

  const [autoPricing, setAutoPricing]         = useState(false);
  const [autoPriceResult, setAutoPriceResult] = useState<PricingRunResult | null>(null);
  const [autoPriceJob, setAutoPriceJob]       = useState<PricingJobStatus | null>(null);
  const autoPriceIntervalRef                  = useRef<ReturnType<typeof setInterval> | null>(null);
  const [togglingId, setTogglingId]           = useState<string | null>(null);
  const [showUnpriced, setShowUnpriced]       = useState(false);
  const [savingUnpriced, setSavingUnpriced]   = useState(false);

  // Pricing panel state (modal)
  const [estimate, setEstimate]               = useState<import("../../lib/api").EstimateResult | null>(null);
  const [loadingEstimate, setLoadingEstimate] = useState(false);
  const [pricingProductId, setPricingProductId] = useState<string | null>(null);

  // Catalog device picker (used only in ADD mode)
  const [catalogDevices, setCatalogDevices]   = useState<DeviceCatalogItem[]>([]);
  const [selectedDevice, setSelectedDevice]   = useState<DeviceCatalogItem | null>(null);
  const [deviceQuery, setDeviceQuery]         = useState("");
  const [pickerOpen, setPickerOpen]           = useState(false);
  const pickerRef  = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // ── Search debounce (300ms) ───────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // ── Category list (fetched once on mount) ─────────────────────────────────
  useEffect(() => {
    productsApi.categories().then(setCategories).catch(() => {});
  }, []);

  // Increment to force a full reload from page 1 (used by auto-price completion)
  const [reloadKey, setReloadKey] = useState(0);
  const triggerReload = useCallback(() => setReloadKey(k => k + 1), []);

  // ── Core load: fires when filters change OR triggerReload() is called ─────
  useEffect(() => {
    let cancelled = false;
    async function loadFirst() {
      setLoading(true);
      setProducts([]);
      setHasMore(false);
      try {
        const res = await productsApi.list({
          page: 1, limit: 50, excludeOthers: true,
          search: debouncedSearch || undefined,
          category: filterCategory !== "All" ? filterCategory : undefined,
          pricingStatus: STATUS_TO_API[filterStatus],
        });
        if (!cancelled) {
          setProducts(res.items);
          setCurrentPage(1);
          setHasMore(res.page < res.pages);
          setTotal(res.total);
        }
      } catch { /* ignore */ }
      finally { if (!cancelled) setLoading(false); }
    }
    loadFirst();
    return () => { cancelled = true; };
  }, [debouncedSearch, filterCategory, filterStatus, reloadKey]);

  // ── Load-more function (stable ref so the observer never needs reconnecting) ─
  const loadMore = useCallback(async (page: number) => {
    setLoadingMore(true);
    try {
      const res = await productsApi.list({
        page, limit: 50, excludeOthers: true,
        search: debouncedSearch || undefined,
        category: filterCategory !== "All" ? filterCategory : undefined,
        pricingStatus: STATUS_TO_API[filterStatus],
      });
      setProducts(prev => [...prev, ...res.items]);
      setCurrentPage(res.page);
      setHasMore(res.page < res.pages);
      setTotal(res.total);
    } catch { /* ignore */ }
    finally { setLoadingMore(false); }
  }, [debouncedSearch, filterCategory, filterStatus]);

  const loadMoreRef = useRef(loadMore);
  loadMoreRef.current = loadMore;
  const currentPageRef = useRef(currentPage);
  currentPageRef.current = currentPage;
  const hasMoreRef = useRef(hasMore);
  hasMoreRef.current = hasMore;
  const loadingMoreRef = useRef(loadingMore);
  loadingMoreRef.current = loadingMore;
  const loadingRef = useRef(loading);
  loadingRef.current = loading;

  // ── IntersectionObserver: trigger next page when sentinel is visible ───────
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMoreRef.current && !loadingMoreRef.current && !loadingRef.current) {
        loadMoreRef.current(currentPageRef.current + 1);
      }
    }, { rootMargin: "200px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, []); // set up once — all current values accessed via refs

  // Close picker on outside click
  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, []);

  useEffect(() => {
    pricingConfigApi.list()
      .then(configs => {
        const c = configs.find(x => x.key === 'show_unpriced_products');
        setShowUnpriced((c?.value ?? 0) === 1);
      })
      .catch(() => {});
  }, []);

  // On mount: resume progress indicator if a pricing job is already running
  useEffect(() => {
    productPricingApi.status().then(job => {
      if (job.running) {
        setAutoPricing(true);
        setAutoPriceJob(job);
        startPricePolling();
      }
    }).catch(() => {});
    return () => {
      if (autoPriceIntervalRef.current) clearInterval(autoPriceIntervalRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadProducts = triggerReload;

  async function toggleShowUnpriced() {
    setSavingUnpriced(true);
    const next = !showUnpriced;
    try {
      await pricingConfigApi.upsert('show_unpriced_products', next ? 1 : 0, 'Show unpriced products on storefront (0=hide, 1=show)');
      setShowUnpriced(next);
    } catch { /* ignore */ }
    finally { setSavingUnpriced(false); }
  }

  const filteredCatalog = catalogDevices.filter(d => {
    const q = deviceQuery.toLowerCase();
    return !q || d.brandCategory.brand.name.toLowerCase().includes(q) || d.model.toLowerCase().includes(q);
  });

  // Filter device picker in Add mode to exclude OTHERS categories
  function openAdd() {
    setEditProduct(null);
    setFormData(EMPTY_FORM);
    setSelectedDevice(null);
    setDeviceQuery("");
    setPickerOpen(false);
    setError("");
    setShowModal(true);
    if (catalogDevices.length === 0) {
      deviceCatalogApi.list()
        .then(items => setCatalogDevices(items))
        .catch(() => {});
    }
  }

  function openEdit(p: Product, e: React.MouseEvent) {
    e.stopPropagation();
    setEditProduct(p);
    setFormData({
      catalogId: p.catalogId, name: p.name, condition: p.condition,
      storage: p.storage, attributes: p.attributes ?? {}, price: p.price, comparePrice: p.comparePrice,
      stock: p.stock, description: p.description ?? "",
      isActive: p.isActive, specs: p.specs,
    });
    setError("");
    setShowModal(true);
    if (p.catalogId && p.brand && p.model) {
      loadEstimate(p.brand, p.model, p.storage ?? '', p.condition);
    }
  }

  function selectCatalogDevice(dev: DeviceCatalogItem) {
    const firstStorage = dev.storageOptions[0] ?? "";
    const defaultAttributes: Record<string, string> = {};
    for (const group of dev.attributeOptions ?? []) {
      if (group.options[0]) defaultAttributes[group.label] = group.options[0];
    }
    setSelectedDevice(dev);
    setDeviceQuery(`${dev.brandCategory.brand.name} ${dev.model}`);
    setPickerOpen(false);
    const suggestedName = `${dev.brandCategory.brand.name} ${dev.model}${firstStorage ? ` ${firstStorage}` : ""}`;
    setFormData(f => ({
      ...f,
      catalogId: dev.id,
      name: suggestedName,
      storage: firstStorage,
      attributes: defaultAttributes,
    }));
    const brand = dev.brandCategory.brand.name;
    loadEstimate(brand, dev.model, firstStorage, formData.condition);
  }

  async function handleDeleteAll() {
    setDeletingAll(true);
    setError("");
    try {
      await productsApi.removeAll();
      setProducts([]);
      setShowDeleteAll(false);
      setDeleteAllInput("");
    } catch (e: any) {
      setError(e.message || "Delete failed. Please try again.");
    } finally {
      setDeletingAll(false);
    }
  }

  async function saveProduct() {
    setSaving(true);
    setError("");
    try {
      if (editProduct) {
        const updated = await productsApi.update(editProduct.id, formData);
        setProducts(ps => ps.map(p => p.id === editProduct.id ? updated : p));
      } else {
        const created = await productsApi.create(formData);
        setProducts(ps => [created, ...ps]);
      }
      setShowModal(false);
      setEstimate(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save product");
    } finally {
      setSaving(false);
    }
  }

  async function deleteProduct(id: string) {
    try {
      await productsApi.remove(id);
      setProducts(ps => ps.filter(p => p.id !== id));
    } catch { /* ignore */ }
    setDeleteId(null);
  }

  function startPricePolling() {
    if (autoPriceIntervalRef.current) clearInterval(autoPriceIntervalRef.current);
    autoPriceIntervalRef.current = setInterval(async () => {
      try {
        const job = await productPricingApi.status();
        setAutoPriceJob(job);
        if (!job.running) {
          clearInterval(autoPriceIntervalRef.current!);
          autoPriceIntervalRef.current = null;
          setAutoPricing(false);
          if (job.result) {
            setAutoPriceResult(job.result);
            loadProducts();
            setTimeout(() => { setAutoPriceResult(null); setAutoPriceJob(null); }, 8000);
          } else if (job.error) {
            alert(`Auto-pricing failed: ${job.error}`);
            setAutoPriceJob(null);
          }
        }
      } catch {}
    }, 4000);
  }

  async function handleAutoPrice() {
    setAutoPricing(true);
    setAutoPriceResult(null);
    setAutoPriceJob(null);
    try {
      await productPricingApi.run();
      startPricePolling();
    } catch (e: any) {
      setAutoPricing(false);
      alert(e.message ?? "Auto-pricing failed");
    }
  }

  async function handleToggleActive(product: Product) {
    setTogglingId(product.id);
    try {
      await productsApi.update(product.id, { isActive: !product.isActive });
      setProducts(prev => prev.map(p => p.id === product.id ? { ...p, isActive: !p.isActive } : p));
    } catch (e: any) {
      alert(e.message ?? "Toggle failed");
    } finally {
      setTogglingId(null);
    }
  }

  async function loadEstimate(brand: string, model: string, storage: string, condition: string) {
    if (!brand || !model) return;
    setLoadingEstimate(true);
    setEstimate(null);
    try {
      const result = await productPricingApi.estimate(brand, model, storage, condition);
      setEstimate(result);
    } catch {
      setEstimate(null);
    } finally {
      setLoadingEstimate(false);
    }
  }

  const storage = (p: Product) => p.storage || "—";
  const attributesLabel = (p: Product) => Object.values(p.attributes ?? {}).filter(Boolean).join(" · ");

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6 md:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Products</h1>
          <p className="text-sm text-zinc-500 mt-1">
            {loading ? "Loading…" : `${total} product${total !== 1 ? "s" : ""}${filterCategory !== "All" || filterStatus !== "All" || debouncedSearch ? " matching filters" : " total"}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={toggleShowUnpriced}
            disabled={savingUnpriced}
            title={showUnpriced ? "Unpriced products visible on storefront — click to hide" : "Unpriced products hidden from storefront — click to show"}
            className={`flex items-center gap-2 h-11 px-4 rounded-2xl text-sm font-bold border transition-colors ${
              showUnpriced
                ? "bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100"
                : "bg-white border-zinc-200 text-zinc-500 hover:border-zinc-400"
            } disabled:opacity-50`}
          >
            {showUnpriced ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
            Unpriced on web
          </button>
          <Link
            href="/products/others"
            className="flex items-center gap-2 h-11 px-4 border border-zinc-200 rounded-2xl text-sm font-bold text-zinc-600 hover:border-zinc-400 hover:text-black transition-colors bg-white"
          >
            View Others
          </Link>
          <button
            onClick={() => { setShowDeleteAll(true); setDeleteAllInput(""); }}
            className="flex items-center gap-2 h-11 px-4 bg-red-50 text-red-600 border border-red-200 rounded-2xl text-sm font-bold hover:bg-red-100 transition-colors"
          >
            <Trash2 className="h-4 w-4" /> Delete All
          </button>
          <button
            onClick={openAdd}
            className="flex items-center gap-2 h-11 px-5 bg-black text-white rounded-2xl text-sm font-bold hover:bg-zinc-800 transition-colors"
          >
            <Plus className="h-4 w-4" /> Add product
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative flex-1 min-w-[260px]">
          <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-zinc-400">
            <Search className="h-4 w-4" />
          </div>
          <input
            type="text"
            placeholder="Search by name or brand..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full h-11 rounded-2xl bg-white border border-zinc-200 pl-11 pr-5 text-sm font-medium outline-none focus:border-black transition-colors"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto scrollbar-hide py-1 -my-1 max-w-full">
          {["All", ...categories].map(cat => (
            <button
              key={cat}
              onClick={() => setFilterCategory(cat)}
              className={`h-11 px-4 rounded-2xl text-sm font-bold transition-all shrink-0 ${filterCategory === cat ? "bg-black text-white" : "bg-white border border-zinc-200 hover:border-zinc-400"}`}
            >
              {cat}{filterCategory === cat && total > 0 ? ` (${total})` : ""}
            </button>
          ))}
        </div>
      </div>

      {/* Status filter tabs + Auto-price All */}
      <div className="flex items-center gap-2 flex-wrap mt-2 mb-4">
        {["All", "Auto-priced", "Flagged", "No Price"].map(tab => (
          <button
            key={tab}
            onClick={() => setFilterStatus(tab)}
            className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-colors ${
              filterStatus === tab
                ? tab === "Flagged" ? "bg-amber-100 text-amber-700" : "bg-black text-white"
                : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"
            }`}
          >
            {tab}
          </button>
        ))}
        <div className="flex-1" />
        {autoPriceJob?.running && autoPriceJob.total > 0 && (
          <span className="text-xs font-bold text-blue-700 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-100">
            Pricing… {autoPriceJob.done}/{autoPriceJob.total}
          </span>
        )}
        {autoPriceResult && (
          <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-100">
            ✓ {autoPriceResult.applied} priced · {autoPriceResult.flagged} flagged
          </span>
        )}
        <button
          onClick={handleAutoPrice}
          disabled={autoPricing}
          className="flex items-center gap-1.5 h-9 px-4 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition-colors disabled:opacity-60"
        >
          {autoPricing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
          Auto-price All
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-3xl border border-zinc-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 border-4 border-zinc-200 border-t-black rounded-full animate-spin" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[800px]">
            <thead>
              <tr className="border-b border-zinc-100">
                <th className="text-left px-6 py-4 text-xs font-bold uppercase tracking-widest text-zinc-400">Product</th>
                <th className="text-left px-4 py-4 text-xs font-bold uppercase tracking-widest text-zinc-400">Category</th>
                <th className="text-left px-4 py-4 text-xs font-bold uppercase tracking-widest text-zinc-400">Condition</th>
                <th className="text-right px-4 py-4 text-xs font-bold uppercase tracking-widest text-zinc-400">Price</th>
                <th className="text-right px-4 py-4 text-xs font-bold uppercase tracking-widest text-zinc-400 whitespace-nowrap">Trade-in</th>
                <th className="text-right px-4 py-4 text-xs font-bold uppercase tracking-widest text-zinc-400">Stock</th>
                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-zinc-400">Status</th>
                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-zinc-400">Active</th>
                <th className="px-6 py-4" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {products.map(p => (
                <tr
                  key={p.id}
                  onClick={() => router.push(`/products/${p.id}`)}
                  className="hover:bg-zinc-50/50 transition-colors group cursor-pointer"
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      {p.images?.[0] ? (
                        <img src={p.images[0]} alt={p.name} className="h-10 w-10 rounded-xl object-cover border border-zinc-100 shrink-0" />
                      ) : (
                        <div className="h-10 w-10 rounded-xl bg-zinc-100 flex items-center justify-center shrink-0">
                          <ImageIcon className="h-4 w-4 text-zinc-300" />
                        </div>
                      )}
                      <div>
                        <p className="font-bold">{p.name}</p>
                        <p className="text-xs text-zinc-400 mt-0.5">
                          {p.brand} · {storage(p)}{attributesLabel(p) ? ` · ${attributesLabel(p)}` : ""}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-zinc-500 font-medium capitalize">{p.category}</td>
                  <td className="px-4 py-4">
                    <span className="rounded-full bg-zinc-100 px-3 py-1 text-[10px] font-bold uppercase tracking-widest">{p.condition}</span>
                  </td>
                  <td className="px-4 py-4 text-right font-bold font-mono">
                    {p.price != null ? `£${p.price}` : <span className="text-zinc-400 italic text-xs font-normal">No price</span>}
                    {p.comparePrice && <span className="text-zinc-300 line-through ml-2 text-xs">£{p.comparePrice}</span>}
                  </td>
                  <td className="px-4 py-4 text-right font-bold font-mono text-zinc-500">
                    {p.tradeInPrice != null ? `£${p.tradeInPrice}` : <span className="text-zinc-300 italic text-xs font-normal">—</span>}
                  </td>
                  <td className={`px-4 py-4 text-right font-bold font-mono ${p.stock === 0 ? "text-red-500" : p.stock <= 2 ? "text-amber-500" : ""}`}>
                    {p.stock}
                  </td>
                  {/* Pricing status badge + stock badge */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex flex-col gap-1">
                      {p.pricingStatus === 'auto_priced' && (
                        <span className="text-[10px] font-bold bg-blue-50 text-blue-700 px-2 py-0.5 rounded-lg w-fit">Auto-priced</span>
                      )}
                      {p.pricingStatus === 'manual' && (
                        <span className="text-[10px] font-bold bg-zinc-100 text-zinc-600 px-2 py-0.5 rounded-lg w-fit">Manual</span>
                      )}
                      {p.pricingStatus === 'flagged' && (
                        <span className="text-[10px] font-bold bg-amber-50 text-amber-700 px-2 py-0.5 rounded-lg w-fit">⚠ Flagged</span>
                      )}
                      {(p.pricingStatus === 'no_data' || !p.pricingStatus) && (
                        <span className="text-[10px] font-bold bg-red-50 text-red-600 px-2 py-0.5 rounded-lg w-fit">No price data</span>
                      )}
                      {p.stock === 0 && (
                        <span className="text-[10px] font-bold bg-orange-50 text-orange-600 px-2 py-0.5 rounded-lg w-fit">Out of stock</span>
                      )}
                    </div>
                  </td>

                  {/* Enable/disable toggle */}
                  <td className="px-4 py-3">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleToggleActive(p); }}
                      disabled={togglingId === p.id || (!p.isActive && (p.price == null || !p.images?.length))}
                      title={!p.isActive && p.price == null ? "Set a price to enable" : ""}
                      className={`flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-lg transition-colors disabled:opacity-40 ${
                        p.isActive
                          ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                          : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"
                      }`}
                    >
                      {togglingId === p.id
                        ? <RefreshCw className="h-3 w-3 animate-spin" />
                        : p.isActive ? <ToggleRight className="h-3.5 w-3.5" /> : <ToggleLeft className="h-3.5 w-3.5" />
                      }
                      {p.isActive ? "Live" : "Disabled"}
                    </button>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                      <button onClick={e => openEdit(p, e)} className="h-8 w-8 rounded-lg hover:bg-zinc-100 flex items-center justify-center transition-colors">
                        <Edit2 className="h-3.5 w-3.5 text-zinc-400" />
                      </button>
                      <button onClick={e => { e.stopPropagation(); setDeleteId(p.id); }} className="h-8 w-8 rounded-lg hover:bg-red-50 flex items-center justify-center transition-colors">
                        <Trash2 className="h-3.5 w-3.5 text-red-400" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
        {!loading && products.length === 0 && (
          <div className="text-center py-20 text-zinc-400">
            <Package className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="font-bold text-sm">No products found</p>
          </div>
        )}
        {/* Infinite scroll sentinel + load-more spinner */}
        <div ref={sentinelRef} className="h-px" />
        {loadingMore && (
          <div className="flex items-center justify-center py-6 gap-2 text-zinc-400 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading more…
          </div>
        )}
        {!loading && !loadingMore && !hasMore && products.length > 0 && total > 50 && (
          <p className="text-center text-xs text-zinc-400 py-4">
            All {total} products loaded
          </p>
        )}
      </div>

      {/* ── EDIT: right slide-over drawer ── */}
      <AnimatePresence>
        {showModal && editProduct && (
          <>
            <motion.div
              key="edit-backdrop"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/20 z-40"
              onClick={() => { setShowModal(false); setEstimate(null); }}
            />
            <motion.div
              key="edit-panel"
              initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 280 }}
              className="fixed right-0 top-0 bottom-0 w-[480px] max-w-full bg-white z-50 shadow-2xl flex flex-col"
            >
              {/* Product header — shown instantly, no loading */}
              <div className="flex items-center gap-4 px-6 py-5 border-b border-zinc-100 shrink-0">
                {editProduct.images?.[0] ? (
                  <img src={editProduct.images[0]} alt={editProduct.name}
                    className="h-14 w-14 rounded-2xl object-cover border border-zinc-100 shrink-0" />
                ) : (
                  <div className="h-14 w-14 rounded-2xl bg-zinc-100 flex items-center justify-center shrink-0">
                    <ImageIcon className="h-5 w-5 text-zinc-300" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-base truncate">{editProduct.name}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-xs text-zinc-400">{editProduct.brand}</span>
                    <span className="text-zinc-200">·</span>
                    <span className="text-xs text-zinc-400 capitalize">{editProduct.category}</span>
                    {editProduct.storage && <><span className="text-zinc-200">·</span><span className="text-xs text-zinc-400">{editProduct.storage}</span></>}
                    <span className="text-zinc-200">·</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      editProduct.pricingStatus === 'auto_priced' ? 'bg-blue-50 text-blue-600' :
                      editProduct.pricingStatus === 'flagged'     ? 'bg-amber-50 text-amber-600' :
                      'bg-zinc-100 text-zinc-500'
                    }`}>{editProduct.pricingStatus ?? 'unpriced'}</span>
                  </div>
                  {editProduct.price != null && (
                    <p className="text-sm font-bold mt-1">
                      £{editProduct.price}
                      {editProduct.comparePrice && <span className="text-zinc-300 line-through ml-2 font-normal text-xs">£{editProduct.comparePrice}</span>}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => { setShowModal(false); setEstimate(null); }}
                  className="h-8 w-8 rounded-full hover:bg-zinc-100 flex items-center justify-center shrink-0 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Scrollable form fields */}
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

                {/* Pricing Intelligence */}
                {editProduct.catalogId && (
                  <div className="rounded-2xl border-2 border-zinc-100 bg-zinc-50 p-4 space-y-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Pricing Intelligence</p>
                    {loadingEstimate && (
                      <div className="flex items-center gap-2 text-xs text-zinc-400">
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Loading competitor prices…
                      </div>
                    )}
                    {estimate?.scrapedPrices && (
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-1.5">
                          Competitor prices · {new Date(estimate.scrapedPrices.scrapedAt).toLocaleDateString('en-GB')}
                        </p>
                        <div className="grid grid-cols-4 gap-2">
                          {([
                            { label: "CeX Sell",   value: estimate.scrapedPrices.cexSellPrice },
                            { label: "CeX Cash",   value: estimate.scrapedPrices.cexCashPrice },
                            { label: "Envirofone", value: estimate.scrapedPrices.envirofonePrice },
                            { label: "Best",       value: estimate.scrapedPrices.marketPrice },
                          ] as { label: string; value: number | null }[]).map(({ label, value }) => (
                            <div key={label} className="bg-white rounded-xl border border-zinc-200 px-3 py-2 text-center">
                              <p className="text-[10px] font-bold text-zinc-400">{label}</p>
                              <p className="text-sm font-bold text-zinc-800 mt-0.5">
                                {value !== null ? `£${value.toFixed(0)}` : <span className="text-zinc-300">—</span>}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {estimate && (
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-1.5">
                          AI estimate range · {formData.condition}
                        </p>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-bold text-zinc-600">£{estimate.low}</span>
                          <div className="flex-1 h-2 bg-zinc-200 rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-400 rounded-full" style={{
                              marginLeft: `${Math.min(90, Math.max(0, ((estimate.suggested - estimate.low) / Math.max(1, estimate.high - estimate.low)) * 80))}%`,
                              width: '10%',
                            }} />
                          </div>
                          <span className="text-sm font-bold text-zinc-600">£{estimate.high}</span>
                          <button type="button" onClick={() => setFormData(f => ({ ...f, price: estimate.suggested }))}
                            className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition-colors shrink-0">
                            <Zap className="h-3 w-3" /> £{estimate.suggested}
                          </button>
                        </div>
                      </div>
                    )}
                    <button type="button" disabled={pricingProductId === editProduct.id}
                      onClick={async () => {
                        setPricingProductId(editProduct.id);
                        try {
                          const result = await productPricingApi.priceOne(editProduct.id);
                          if (result.candidatePrice !== undefined) setFormData(f => ({ ...f, price: result.candidatePrice! }));
                          await loadEstimate(editProduct.brand, editProduct.model, editProduct.storage ?? '', editProduct.condition);
                        } catch (e: any) { alert(e.message ?? 'Pricing failed'); }
                        finally { setPricingProductId(null); }
                      }}
                      className="flex items-center gap-1.5 text-xs font-bold text-zinc-600 bg-white border border-zinc-200 hover:border-zinc-400 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 w-fit"
                    >
                      {pricingProductId === editProduct.id ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                      Auto-price this product
                    </button>
                  </div>
                )}

                {/* AI range inline feedback */}
                {estimate && formData.price != null && formData.price > 0 && (
                  formData.price >= estimate.low && formData.price <= estimate.high ? (
                    <p className="text-xs font-bold text-emerald-600 flex items-center gap-1">
                      <Check className="h-3 w-3" /> Within AI range (£{estimate.low}–£{estimate.high})
                    </p>
                  ) : (
                    <p className="text-xs font-bold text-amber-600 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" /> Outside AI range (£{estimate.low}–£{estimate.high}) — you can still save
                    </p>
                  )
                )}

                {/* Price + Compare Price */}
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { key: "price", label: "Price (£)", placeholder: "579" },
                    { key: "comparePrice", label: "Compare price (£)", placeholder: "Optional" },
                  ].map(({ key, label, placeholder }) => (
                    <div key={key} className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">{label}</label>
                      <input type="number" placeholder={placeholder}
                        value={(formData[key as keyof CreateProductPayload] as number | undefined) ?? ""}
                        onChange={e => setFormData(f => ({ ...f, [key]: e.target.value === "" ? undefined : Number(e.target.value) }))}
                        className="h-12 rounded-[0.875rem] border-2 border-zinc-200 px-4 text-sm font-medium outline-none focus:border-black transition-colors"
                      />
                    </div>
                  ))}
                </div>

                {/* Stock */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">Stock quantity</label>
                  <input type="number" placeholder="3" value={formData.stock ?? ""}
                    onChange={e => setFormData(f => ({ ...f, stock: e.target.value === "" ? 0 : Number(e.target.value) }))}
                    className="h-12 rounded-[0.875rem] border-2 border-zinc-200 px-4 text-sm font-medium outline-none focus:border-black transition-colors"
                  />
                </div>

                {/* Condition */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">Condition</label>
                  <div className="relative">
                    <select value={formData.condition}
                      onChange={e => {
                        const c = e.target.value;
                        setFormData(f => ({ ...f, condition: c }));
                        if (editProduct?.catalogId && editProduct.brand && editProduct.model)
                          loadEstimate(editProduct.brand, editProduct.model, formData.storage ?? '', c);
                      }}
                      className="h-12 w-full rounded-[0.875rem] border-2 border-zinc-200 pl-4 pr-10 text-sm font-medium outline-none focus:border-black transition-colors bg-white appearance-none"
                    >
                      {CONDITIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                    <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 pointer-events-none" />
                  </div>
                </div>

                {/* Product name */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">Product name</label>
                  <input type="text" placeholder="iPhone 14 Pro 256GB" value={formData.name}
                    onChange={e => setFormData(f => ({ ...f, name: e.target.value }))}
                    className="h-12 rounded-[0.875rem] border-2 border-zinc-200 px-4 text-sm font-medium outline-none focus:border-black transition-colors"
                  />
                </div>

                {/* Description */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">Description (optional)</label>
                  <input type="text" placeholder="Brief description..." value={formData.description ?? ""}
                    onChange={e => setFormData(f => ({ ...f, description: e.target.value }))}
                    className="h-12 rounded-[0.875rem] border-2 border-zinc-200 px-4 text-sm font-medium outline-none focus:border-black transition-colors"
                  />
                </div>

                {/* Active toggle */}
                <div className="flex items-center gap-3">
                  <button onClick={() => setFormData(f => ({ ...f, isActive: !f.isActive }))}
                    className={`h-6 w-10 rounded-full transition-colors relative shrink-0 ${formData.isActive ? "bg-black" : "bg-zinc-200"}`}>
                    <span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${formData.isActive ? "translate-x-5" : "translate-x-1"}`} />
                  </button>
                  <label className="text-sm font-medium">{formData.isActive ? "Active (visible on site)" : "Hidden (not visible)"}</label>
                </div>

                {error && <p className="text-sm font-bold text-red-500 bg-red-50 rounded-xl px-4 py-3">{error}</p>}
              </div>

              {/* Fixed footer */}
              <div className="px-6 py-4 border-t border-zinc-100 flex gap-3 shrink-0">
                <button onClick={() => { setShowModal(false); setEstimate(null); }}
                  className="flex-1 h-12 rounded-2xl border-2 border-zinc-200 font-bold text-sm hover:bg-zinc-50 transition-colors">
                  Cancel
                </button>
                <button onClick={saveProduct} disabled={saving}
                  className="flex-1 h-12 rounded-2xl bg-black text-white font-bold text-sm hover:bg-zinc-800 transition-colors flex items-center justify-center gap-2 disabled:opacity-40">
                  {saving ? <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Check className="h-4 w-4" />}
                  Save changes
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── ADD: center modal ── */}
      <AnimatePresence>
        {showModal && !editProduct && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={e => { if (e.target === e.currentTarget) { setShowModal(false); setEstimate(null); } }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              className="bg-white rounded-4xl p-8 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold">Add new product</h2>
                <button onClick={() => { setShowModal(false); setEstimate(null); }} className="h-9 w-9 rounded-full hover:bg-zinc-100 flex items-center justify-center transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-4">
                {/* Device picker from catalog */}
                <div className="flex flex-col gap-1.5" ref={pickerRef}>
                  <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">
                    Device <span className="text-zinc-300 font-normal normal-case tracking-normal">(from Device Catalog)</span>
                  </label>
                  <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Search catalog — e.g. iPhone 15 Pro"
                      value={deviceQuery}
                      onChange={e => {
                        setDeviceQuery(e.target.value);
                        setPickerOpen(true);
                        setSelectedDevice(null);
                        setFormData(f => ({ ...f, brand: "", model: "" }));
                      }}
                      onFocus={() => setPickerOpen(true)}
                      className="h-12 w-full rounded-[0.875rem] border-2 border-zinc-200 pl-10 pr-10 text-sm font-medium outline-none focus:border-black transition-colors"
                    />
                    {selectedDevice && <Check className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-500 pointer-events-none" />}
                    {!selectedDevice && deviceQuery && (
                      <button type="button" onClick={() => { setDeviceQuery(""); setSelectedDevice(null); setPickerOpen(false); setFormData(f => ({ ...f, brand: "", model: "" })); }}
                        className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-300 hover:text-zinc-500">
                        <X className="h-4 w-4" />
                      </button>
                    )}
                    <AnimatePresence>
                      {pickerOpen && (
                        <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                          transition={{ duration: 0.12 }}
                          className="absolute z-20 left-0 right-0 top-[calc(100%+4px)] bg-white border border-zinc-200 rounded-2xl shadow-xl overflow-hidden">
                          {filteredCatalog.length === 0 ? (
                            <div className="px-4 py-5 text-center">
                              <p className="text-sm font-bold text-zinc-500 mb-1">Not in catalog</p>
                              <p className="text-xs text-zinc-400 mb-3">Devices must be registered in the catalog before listing them as products.</p>
                              <a href="/catalog" target="_blank" className="inline-flex items-center gap-1.5 text-xs font-bold text-black underline underline-offset-2">
                                Go to Device Catalog <ExternalLink className="h-3 w-3" />
                              </a>
                            </div>
                          ) : (
                            <div className="max-h-52 overflow-y-auto">
                              {filteredCatalog.slice(0, 30).map(dev => (
                                <button key={dev.id} type="button" onMouseDown={e => { e.preventDefault(); selectCatalogDevice(dev); }}
                                  className="w-full text-left px-4 py-3 text-sm hover:bg-zinc-50 flex items-center gap-3 border-b border-zinc-50 last:border-0">
                                  <div className="flex-1 min-w-0">
                                    <span className="font-bold text-zinc-900">{dev.brandCategory.brand.name}</span>{" "}
                                    <span className="text-zinc-700">{dev.model}</span>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">{dev.brandCategory.category.slug}</span>
                                    {!dev.isActive && <span className="text-[10px] font-bold uppercase tracking-widest text-amber-500 bg-amber-50 px-1.5 py-0.5 rounded">inactive</span>}
                                  </div>
                                </button>
                              ))}
                            </div>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  {selectedDevice ? (
                    <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-100 rounded-xl text-xs">
                      <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                      <span className="font-bold text-emerald-800">{selectedDevice.brandCategory.brand.name} {selectedDevice.model}</span>
                      <span className="text-emerald-600">· {selectedDevice.brandCategory.category.name}</span>
                      <span className="text-emerald-500 ml-auto">{selectedDevice.storageOptions.length} storage option{selectedDevice.storageOptions.length !== 1 ? "s" : ""}</span>
                    </div>
                  ) : (
                    <p className="text-xs text-zinc-400">
                      Device not in the catalog?{" "}
                      <a href="/catalog" target="_blank" className="font-bold text-zinc-600 hover:text-black underline underline-offset-2 inline-flex items-center gap-0.5">
                        Register it first <ExternalLink className="h-3 w-3" />
                      </a>
                    </p>
                  )}
                </div>

                {/* Product name */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">Product name</label>
                  <input type="text" placeholder="iPhone 14 Pro 256GB" value={formData.name}
                    onChange={e => setFormData(f => ({ ...f, name: e.target.value }))}
                    className="h-12 rounded-[0.875rem] border-2 border-zinc-200 px-4 text-sm font-medium outline-none focus:border-black transition-colors"
                  />
                  {selectedDevice && <p className="text-xs text-zinc-400">Auto-filled from device selection — edit as needed.</p>}
                </div>

                {/* Storage */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">Storage / Spec</label>
                  {selectedDevice ? (
                    <div className="relative">
                      <select value={formData.storage ?? ""}
                        onChange={e => {
                          const s = e.target.value;
                          setFormData(f => ({ ...f, storage: s, name: `${selectedDevice.brandCategory.brand.name} ${selectedDevice.model}${s ? ` ${s}` : ""}` }));
                          loadEstimate(selectedDevice.brandCategory.brand.name, selectedDevice.model, s, formData.condition);
                        }}
                        className="h-12 w-full rounded-[0.875rem] border-2 border-zinc-200 pl-4 pr-10 text-sm font-medium outline-none focus:border-black transition-colors bg-white appearance-none">
                        {selectedDevice.storageOptions.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                      <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 pointer-events-none" />
                    </div>
                  ) : (
                    <input type="text" placeholder="256 GB" value={formData.storage ?? ""}
                      onChange={e => setFormData(f => ({ ...f, storage: e.target.value }))}
                      className="h-12 rounded-[0.875rem] border-2 border-zinc-200 px-4 text-sm font-medium outline-none focus:border-black transition-colors"
                    />
                  )}
                </div>

                {/* Attributes: one select per device-defined group (Color, Edition, etc.) */}
                {selectedDevice && (selectedDevice.attributeOptions ?? []).map(group => (
                  <div key={group.label} className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">{group.label}</label>
                    <div className="relative">
                      <select value={formData.attributes?.[group.label] ?? ""}
                        onChange={e => {
                          const val = e.target.value;
                          setFormData(f => ({ ...f, attributes: { ...f.attributes, [group.label]: val } }));
                        }}
                        className="h-12 w-full rounded-[0.875rem] border-2 border-zinc-200 pl-4 pr-10 text-sm font-medium outline-none focus:border-black transition-colors bg-white appearance-none">
                        {group.options.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                      <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 pointer-events-none" />
                    </div>
                  </div>
                ))}

                {/* Pricing Intelligence (add mode) */}
                {selectedDevice && (
                  <div className="rounded-2xl border-2 border-zinc-100 bg-zinc-50 p-4 space-y-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Pricing Intelligence</p>
                    {loadingEstimate && (
                      <div className="flex items-center gap-2 text-xs text-zinc-400">
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Loading competitor prices…
                      </div>
                    )}
                    {estimate?.scrapedPrices && (
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-1.5">
                          Competitor prices · {new Date(estimate.scrapedPrices.scrapedAt).toLocaleDateString('en-GB')}
                        </p>
                        <div className="grid grid-cols-4 gap-2">
                          {([
                            { label: "CeX Sell",   value: estimate.scrapedPrices.cexSellPrice },
                            { label: "CeX Cash",   value: estimate.scrapedPrices.cexCashPrice },
                            { label: "Envirofone", value: estimate.scrapedPrices.envirofonePrice },
                            { label: "Best",       value: estimate.scrapedPrices.marketPrice },
                          ] as { label: string; value: number | null }[]).map(({ label, value }) => (
                            <div key={label} className="bg-white rounded-xl border border-zinc-200 px-3 py-2 text-center">
                              <p className="text-[10px] font-bold text-zinc-400">{label}</p>
                              <p className="text-sm font-bold text-zinc-800 mt-0.5">
                                {value !== null ? `£${value.toFixed(0)}` : <span className="text-zinc-300">—</span>}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {estimate && (
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-1.5">AI estimate range · {formData.condition}</p>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-bold text-zinc-600">£{estimate.low}</span>
                          <div className="flex-1 h-2 bg-zinc-200 rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-400 rounded-full" style={{
                              marginLeft: `${Math.min(90, Math.max(0, ((estimate.suggested - estimate.low) / Math.max(1, estimate.high - estimate.low)) * 80))}%`,
                              width: '10%',
                            }} />
                          </div>
                          <span className="text-sm font-bold text-zinc-600">£{estimate.high}</span>
                          <button type="button" onClick={() => setFormData(f => ({ ...f, price: estimate.suggested }))}
                            className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition-colors shrink-0">
                            <Zap className="h-3 w-3" /> Auto-fill £{estimate.suggested}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* AI range feedback */}
                {estimate && formData.price != null && formData.price > 0 && (
                  formData.price >= estimate.low && formData.price <= estimate.high ? (
                    <p className="text-xs font-bold text-emerald-600 flex items-center gap-1 -mt-1"><Check className="h-3 w-3" /> Within AI range (£{estimate.low}–£{estimate.high})</p>
                  ) : (
                    <p className="text-xs font-bold text-amber-600 flex items-center gap-1 -mt-1"><AlertTriangle className="h-3 w-3" /> Outside AI range (£{estimate.low}–£{estimate.high}) — you can still save</p>
                  )
                )}

                {/* Price + Compare Price */}
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { key: "price", label: "Price (£)", placeholder: "579" },
                    { key: "comparePrice", label: "Compare price (£)", placeholder: "Optional" },
                  ].map(({ key, label, placeholder }) => (
                    <div key={key} className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">{label}</label>
                      <input type="number" placeholder={placeholder}
                        value={(formData[key as keyof CreateProductPayload] as number | undefined) ?? ""}
                        onChange={e => setFormData(f => ({ ...f, [key]: e.target.value === "" ? undefined : Number(e.target.value) }))}
                        className="h-12 rounded-[0.875rem] border-2 border-zinc-200 px-4 text-sm font-medium outline-none focus:border-black transition-colors"
                      />
                    </div>
                  ))}
                </div>

                {/* Stock */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">Stock quantity</label>
                  <input type="number" placeholder="3" value={formData.stock ?? ""}
                    onChange={e => setFormData(f => ({ ...f, stock: e.target.value === "" ? 0 : Number(e.target.value) }))}
                    className="h-12 rounded-[0.875rem] border-2 border-zinc-200 px-4 text-sm font-medium outline-none focus:border-black transition-colors"
                  />
                </div>

                {/* Description */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">Description (optional)</label>
                  <input type="text" placeholder="Brief description..." value={formData.description ?? ""}
                    onChange={e => setFormData(f => ({ ...f, description: e.target.value }))}
                    className="h-12 rounded-[0.875rem] border-2 border-zinc-200 px-4 text-sm font-medium outline-none focus:border-black transition-colors"
                  />
                </div>

                {/* Condition */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">Condition</label>
                  <div className="relative">
                    <select value={formData.condition}
                      onChange={e => {
                        const c = e.target.value;
                        setFormData(f => ({ ...f, condition: c }));
                        if (selectedDevice) loadEstimate(selectedDevice.brandCategory.brand.name, selectedDevice.model, formData.storage ?? '', c);
                      }}
                      className="h-12 w-full rounded-[0.875rem] border-2 border-zinc-200 pl-4 pr-10 text-sm font-medium outline-none focus:border-black transition-colors bg-white appearance-none">
                      {CONDITIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                    <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 pointer-events-none" />
                  </div>
                </div>

                {/* Active toggle */}
                <div className="flex items-center gap-3">
                  <button onClick={() => setFormData(f => ({ ...f, isActive: !f.isActive }))}
                    className={`h-6 w-10 rounded-full transition-colors relative shrink-0 ${formData.isActive ? "bg-black" : "bg-zinc-200"}`}>
                    <span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${formData.isActive ? "translate-x-5" : "translate-x-1"}`} />
                  </button>
                  <label className="text-sm font-medium">{formData.isActive ? "Active (visible on site)" : "Hidden (not visible)"}</label>
                </div>

                {error && <p className="text-sm font-bold text-red-500 bg-red-50 rounded-xl px-4 py-3">{error}</p>}
              </div>

              <div className="flex gap-3 mt-8">
                <button onClick={() => { setShowModal(false); setEstimate(null); }} className="flex-1 h-12 rounded-2xl border-2 border-zinc-200 font-bold text-sm hover:bg-zinc-50 transition-colors">
                  Cancel
                </button>
                <button onClick={saveProduct} disabled={saving || !formData.catalogId}
                  className="flex-1 h-12 rounded-2xl bg-black text-white font-bold text-sm hover:bg-zinc-800 transition-colors flex items-center justify-center gap-2 disabled:opacity-40">
                  {saving ? <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Check className="h-4 w-4" />}
                  Add product
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete All confirm */}
      <AnimatePresence>
        {showDeleteAll && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-white rounded-3xl p-8 w-full max-w-sm shadow-2xl"
            >
              <div className="h-14 w-14 rounded-2xl bg-red-100 flex items-center justify-center mx-auto mb-5">
                <AlertTriangle className="h-6 w-6 text-red-500" />
              </div>
              <h3 className="font-bold text-lg mb-1 text-center">Delete all products?</h3>
              <p className="text-sm text-zinc-500 mb-5 text-center">This will permanently delete every product. This cannot be undone.</p>
              <p className="text-xs font-bold text-zinc-500 mb-2">Type <span className="font-mono bg-zinc-100 px-1.5 py-0.5 rounded">delete all</span> to confirm</p>
              <input
                type="text"
                value={deleteAllInput}
                onChange={e => { setDeleteAllInput(e.target.value); setError(""); }}
                placeholder="delete all"
                className="w-full h-11 rounded-xl border-2 border-zinc-200 px-4 text-sm font-medium outline-none focus:border-red-400 transition-colors mb-4"
              />
              {error && (
                <p className="text-xs text-red-600 font-medium mb-3 text-center">{error}</p>
              )}
              <div className="flex gap-3">
                <button onClick={() => { setShowDeleteAll(false); setError(""); }} className="flex-1 h-11 rounded-2xl border-2 border-zinc-200 font-bold text-sm">Cancel</button>
                <button
                  onClick={handleDeleteAll}
                  disabled={deleteAllInput !== "delete all" || deletingAll}
                  className="flex-1 h-11 rounded-2xl bg-red-500 text-white font-bold text-sm hover:bg-red-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {deletingAll ? "Deleting…" : "Delete All"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete confirm */}
      <AnimatePresence>
        {deleteId !== null && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-white rounded-3xl p-8 w-full max-w-sm shadow-2xl text-center"
            >
              <div className="h-14 w-14 rounded-2xl bg-red-100 flex items-center justify-center mx-auto mb-5">
                <Trash2 className="h-6 w-6 text-red-500" />
              </div>
              <h3 className="font-bold text-lg mb-2">Delete product?</h3>
              <p className="text-sm text-zinc-500 mb-6">This action cannot be undone.</p>
              <div className="flex gap-3">
                <button onClick={() => setDeleteId(null)} className="flex-1 h-11 rounded-2xl border-2 border-zinc-200 font-bold text-sm">Cancel</button>
                <button onClick={() => deleteProduct(deleteId!)} className="flex-1 h-11 rounded-2xl bg-red-500 text-white font-bold text-sm hover:bg-red-600 transition-colors">Delete</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
