"use client";

import { useEffect, useState, useMemo } from "react";
import { tradeInDevicesApi, deviceCatalogApi, type TradeInDeviceItem } from "../../../lib/api";
import { Plus, Pencil, Trash2, Check, X, Search, ArrowLeft, AlertTriangle } from "lucide-react";
import Link from "next/link";

const CATEGORIES = ["Phone", "Tablet", "Console", "Laptop", "Audio", "Smartwatch", "Other"];

type Form = { name: string; brand: string; category: string; isActive: boolean };
const empty: Form = { name: "", brand: "", category: "Phone", isActive: true };

// Loose match, mirroring how brand/model naming actually varies between this list
// and the catalog (quotes, "-inch", extra whitespace) — good enough for a warning,
// doesn't need to be perfect since the admin makes the final call either way.
function normalize(s: string) {
  return s.toLowerCase()
    .replace(/["“”]/g, "")
    .replace(/[()]/g, "")
    .replace(/(\d)-inch\b/g, "$1")
    .replace(/\binch\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export default function SearchDevicesPage() {
  const [devices, setDevices] = useState<TradeInDeviceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(empty);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("All");
  const [catalogKeys, setCatalogKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    deviceCatalogApi.list()
      .then(items => setCatalogKeys(new Set(items.map(d => `${normalize(d.brandCategory.brand.name)}|${normalize(d.model)}`))))
      .catch(() => {});
  }, []);

  const duplicateMatch = form.name.trim() && form.brand.trim()
    && catalogKeys.has(`${normalize(form.brand)}|${normalize(form.name)}`);

  const load = () => {
    setLoading(true);
    tradeInDevicesApi.list(true).then(setDevices).finally(() => setLoading(false));
  };
  useEffect(load, []);

  function startEdit(d: TradeInDeviceItem) {
    setEditing(d.id);
    setForm({ name: d.name, brand: d.brand, category: d.category, isActive: d.isActive });
    setError("");
  }
  function startCreate() { setEditing("new"); setForm(empty); setError(""); }
  function cancel() { setEditing(null); setError(""); }

  async function save() {
    if (!form.name.trim() || !form.brand.trim()) { setError("Name and brand are required"); return; }
    setSaving(true); setError("");
    try {
      if (editing === "new") {
        await tradeInDevicesApi.create(form);
      } else if (editing) {
        await tradeInDevicesApi.update(editing, form);
      }
      cancel(); load();
    } catch (e: any) { setError(e.message ?? "Save failed"); }
    finally { setSaving(false); }
  }

  async function remove(id: string, name: string) {
    if (!confirm(`Delete "${name}"?`)) return;
    await tradeInDevicesApi.remove(id).catch(() => {});
    load();
  }

  async function toggleActive(d: TradeInDeviceItem) {
    const next = !d.isActive;
    setDevices(prev => prev.map(x => x.id === d.id ? { ...x, isActive: next } : x));
    await tradeInDevicesApi.update(d.id, { isActive: next }).catch(() =>
      setDevices(prev => prev.map(x => x.id === d.id ? { ...x, isActive: !next } : x))
    );
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return devices.filter(d =>
      (filterCat === "All" || d.category === filterCat) &&
      (!q || d.name.toLowerCase().includes(q) || d.brand.toLowerCase().includes(q))
    );
  }, [devices, search, filterCat]);

  // Group by category for display
  const grouped = useMemo(() => {
    const map = new Map<string, TradeInDeviceItem[]>();
    filtered.forEach(d => {
      if (!map.has(d.category)) map.set(d.category, []);
      map.get(d.category)!.push(d);
    });
    return map;
  }, [filtered]);

  const totalActive = devices.filter(d => d.isActive).length;

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <Link href="/catalog-mgmt" className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-700 mb-1">
            <ArrowLeft className="h-3 w-3" /> Catalog Management
          </Link>
          <h1 className="text-2xl font-bold text-zinc-900">Other Search Devices</h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Devices not yet in the catalog — shown as manual-quote fallbacks in the trade-in &amp; repair search bar
            alongside real catalog devices ({totalActive} active of {devices.length} total). Don&apos;t add a device
            here if it already exists in the catalog — it&apos;ll just show up twice.
          </p>
        </div>
        <button
          onClick={startCreate}
          className="flex items-center gap-2 h-9 px-4 rounded-xl bg-zinc-950 text-white text-xs font-bold hover:bg-zinc-800 shrink-0"
        >
          <Plus className="h-3.5 w-3.5" /> Add device
        </button>
      </div>

      {/* Add / Edit form */}
      {editing && (
        <div className="bg-white border border-zinc-200 rounded-2xl p-5 mb-6">
          <h2 className="font-bold mb-4 text-sm">{editing === "new" ? "Add device" : "Edit device"}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
            <div className="col-span-2 sm:col-span-1">
              <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 block mb-1">Model Name *</label>
              <input
                className="w-full h-9 border border-zinc-200 rounded-xl px-3 text-sm outline-none focus:border-zinc-400"
                placeholder="e.g. iPhone 15 Pro"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 block mb-1">Brand *</label>
              <input
                className="w-full h-9 border border-zinc-200 rounded-xl px-3 text-sm outline-none focus:border-zinc-400"
                placeholder="e.g. Apple"
                value={form.brand}
                onChange={e => setForm(f => ({ ...f, brand: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 block mb-1">Category *</label>
              <select
                className="w-full h-9 border border-zinc-200 rounded-xl px-3 text-sm outline-none focus:border-zinc-400"
                value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
              >
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs font-semibold mb-3 cursor-pointer">
            <input type="checkbox" checked={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} />
            Active (visible in search)
          </label>
          {duplicateMatch && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-3">
              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 font-medium">
                This brand + model already exists in the device catalog — adding it here will show up as a
                duplicate in the search bar. Only continue if this is genuinely a different device.
              </p>
            </div>
          )}
          {error && <p className="text-red-500 text-xs mb-2">{error}</p>}
          <div className="flex gap-2">
            <button onClick={save} disabled={saving}
              className="h-8 px-4 rounded-xl bg-zinc-950 text-white text-xs font-bold disabled:opacity-50">
              {saving ? "Saving…" : "Save"}
            </button>
            <button onClick={cancel} className="h-8 px-4 rounded-xl border border-zinc-200 text-xs font-bold">Cancel</button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="relative flex-1 min-w-48">
          <input
            className="w-full h-9 border border-zinc-200 rounded-xl pl-8 pr-3 text-sm outline-none focus:border-zinc-400"
            placeholder="Search by model or brand…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 pointer-events-none" />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {["All", ...CATEGORIES].map(c => (
            <button
              key={c}
              onClick={() => setFilterCat(c)}
              className={`h-8 px-3 rounded-xl text-xs font-bold transition-colors ${filterCat === c ? "bg-zinc-950 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"}`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-6 w-6 border-4 border-zinc-200 border-t-black rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-sm text-zinc-400">
          {search || filterCat !== "All" ? "No devices match your filters." : "No devices yet — click Add device to get started."}
        </div>
      ) : (
        <div className="space-y-6">
          {Array.from(grouped.entries()).map(([category, items]) => (
            <div key={category}>
              <div className="flex items-center gap-3 mb-3">
                <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500">{category}</h2>
                <div className="flex-1 h-px bg-zinc-100" />
                <span className="text-[10px] font-bold text-zinc-300">{items.length}</span>
              </div>
              <div className="bg-white border border-zinc-100 rounded-2xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="border-b border-zinc-100 bg-zinc-50">
                    <tr className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                      <th className="text-left px-5 py-3">Model</th>
                      <th className="text-left px-5 py-3">Brand</th>
                      <th className="text-left px-5 py-3">Status</th>
                      <th className="px-5 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-50">
                    {items.map(d => {
                      const isDup = catalogKeys.has(`${normalize(d.brand)}|${normalize(d.name)}`);
                      return (
                      <tr key={d.id} className="hover:bg-zinc-50/50">
                        <td className="px-5 py-3 font-semibold text-zinc-900">
                          <span className="flex items-center gap-1.5">
                            {d.name}
                            {isDup && (
                              <span title="This device already exists in the catalog — remove it here to avoid a duplicate search result"
                                className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-full cursor-help">
                                <AlertTriangle className="h-2.5 w-2.5" /> In catalog
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-zinc-500 text-xs font-bold">{d.brand}</td>
                        <td className="px-5 py-3">
                          <button
                            onClick={() => toggleActive(d)}
                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${d.isActive ? "bg-emerald-500" : "bg-zinc-300"}`}
                          >
                            <span className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${d.isActive ? "translate-x-4.5" : "translate-x-0.5"}`} />
                          </button>
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3 justify-end">
                            <button onClick={() => startEdit(d)} className="text-zinc-300 hover:text-zinc-700">
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => remove(d.id, d.name)} className="text-zinc-300 hover:text-red-500">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
