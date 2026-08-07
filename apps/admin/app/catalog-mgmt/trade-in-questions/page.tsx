"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  tradeInQuestionsApi,
  catalogCategoriesApi,
  type TradeInQuestionItem,
  type TradeInQuestionOptionItem,
  type UpsertTradeInQuestion,
} from "../../../lib/api";
import {
  Plus, Pencil, Trash2, Check, X, ArrowLeft, RefreshCw, ChevronUp, ChevronDown,
  Image as ImageIcon, Loader2,
  BatteryCharging, BatteryMedium, BatteryWarning, BatteryLow, Power, PowerOff, AlertTriangle,
  ScanFace, Zap, ZapOff, RotateCcw, Clock, Disc, Disc3, Keyboard, Volume2, Volume1, VolumeX,
  CheckCircle2, CircleAlert,
} from "lucide-react";

// The trade-in wizard's category ids predate — and in two cases (Gaming→Console,
// plural→singular) diverge from — the real catalog category names. Translate
// through this map only for those pre-existing mismatches; any catalog category
// added later (with no entry here) is used as-is, so new categories just work
// without code changes.
const CATALOG_TO_TRADE_IN_CATEGORY: Record<string, string> = {
  Phones: "Phone", Tablets: "Tablet", Gaming: "Console", Laptops: "Laptop", Audio: "Audio",
};
const OTHER_CATEGORY = "Other";

// Must stay in sync with the ICON_LIBRARY keys in apps/web's trade-in wizard —
// these are the only icon values an option's `icon` field is allowed to carry.
const ICON_LIBRARY: { key: string; label: string; Icon: React.ElementType }[] = [
  { key: "battery-charging", label: "Battery — full", Icon: BatteryCharging },
  { key: "battery-medium", label: "Battery — medium", Icon: BatteryMedium },
  { key: "battery-warning", label: "Battery — low", Icon: BatteryWarning },
  { key: "battery-low", label: "Battery — critical", Icon: BatteryLow },
  { key: "power-on", label: "Power — on", Icon: Power },
  { key: "power-off", label: "Power — off", Icon: PowerOff },
  { key: "alert-triangle", label: "Warning", Icon: AlertTriangle },
  { key: "scan-face", label: "Face scan", Icon: ScanFace },
  { key: "zap", label: "Charging — ok", Icon: Zap },
  { key: "zap-off", label: "Charging — faulty", Icon: ZapOff },
  { key: "rotate-ccw", label: "Reset done", Icon: RotateCcw },
  { key: "clock", label: "Pending", Icon: Clock },
  { key: "disc", label: "Disc — ok", Icon: Disc },
  { key: "disc3", label: "Disc — alt", Icon: Disc3 },
  { key: "keyboard", label: "Keyboard", Icon: Keyboard },
  { key: "volume-high", label: "Volume — high", Icon: Volume2 },
  { key: "volume-low", label: "Volume — low", Icon: Volume1 },
  { key: "volume-mute", label: "Volume — muted", Icon: VolumeX },
  { key: "check-circle", label: "Check", Icon: CheckCircle2 },
  { key: "circle-alert", label: "Alert", Icon: CircleAlert },
  { key: "check", label: "Plain check", Icon: Check },
];
const ICON_MAP = new Map(ICON_LIBRARY.map((i) => [i.key, i.Icon]));

const TONES: { value: string; label: string; dot: string; ring: string }[] = [
  { value: "success", label: "Green",  dot: "bg-emerald-500", ring: "ring-emerald-500" },
  { value: "info",    label: "Blue",   dot: "bg-blue-500",    ring: "ring-blue-500" },
  { value: "warning", label: "Amber",  dot: "bg-amber-500",   ring: "ring-amber-500" },
  { value: "danger",  label: "Red",    dot: "bg-red-500",     ring: "ring-red-500" },
  { value: "neutral", label: "Grey",   dot: "bg-zinc-400",    ring: "ring-zinc-400" },
];

let optionSeq = 0;
// A freshly uploaded image's raw storage key isn't directly renderable, so each
// form option also carries a `preview` URL to display until the question is saved.
type FormOption = TradeInQuestionOptionItem & { preview?: string };

function blankOption(order: number): FormOption {
  optionSeq += 1;
  return { label: "", order, image: null, icon: null, tone: null, id: `__new_${optionSeq}` };
}

type Form = { category: string; question: string; isActive: boolean; options: FormOption[] };
function emptyForm(category = "Phone"): Form {
  return { category, question: "", isActive: true, options: [blankOption(0), blankOption(1)] };
}

export default function TradeInQuestionsPage() {
  const [questions, setQuestions] = useState<TradeInQuestionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [filterCat, setFilterCat] = useState("All");
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null);
  const [deletingAll, setDeletingAll] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [bulkMsg, setBulkMsg] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingUploadIdx = useRef<number | null>(null);

  // Live from Categories & Brands — add or remove a category there and this list
  // (and the tabs/dropdown below) picks it up on next load, no code change needed.
  const [catalogCategories, setCatalogCategories] = useState<string[]>([]);
  useEffect(() => {
    catalogCategoriesApi.list(false)
      .then((cats) => setCatalogCategories(cats.map((c) => CATALOG_TO_TRADE_IN_CATEGORY[c.name] ?? c.name)))
      .catch(() => {});
  }, []);
  const CATEGORIES = useMemo(() => [...catalogCategories, OTHER_CATEGORY], [catalogCategories]);
  // A question edited here may carry a category no longer in the live list (e.g. a
  // catalog category that was since removed or renamed) — keep it selectable while
  // editing that question so the dropdown doesn't silently show the wrong value.
  const formCategoryOptions = useMemo(
    () => (form.category && !CATEGORIES.includes(form.category) ? [form.category, ...CATEGORIES] : CATEGORIES),
    [CATEGORIES, form.category],
  );

  const load = () => {
    setLoading(true);
    tradeInQuestionsApi.list(true).then(setQuestions).finally(() => setLoading(false));
  };
  useEffect(load, []);

  function startCreate(category = filterCat !== "All" ? filterCat : (CATEGORIES[0] ?? "Other")) {
    setEditing("new");
    setForm(emptyForm(category));
    setError("");
  }
  function startEdit(q: TradeInQuestionItem) {
    setEditing(q.id);
    setForm({
      category: q.category,
      question: q.question,
      isActive: q.isActive,
      options: q.options.length ? q.options.map((o) => ({ ...o })) : [blankOption(0), blankOption(1)],
    });
    setError("");
  }
  function cancel() { setEditing(null); setError(""); }

  function updateOption(idx: number, patch: Partial<FormOption>) {
    setForm((f) => ({ ...f, options: f.options.map((o, i) => (i === idx ? { ...o, ...patch } : o)) }));
  }
  function addOption() {
    setForm((f) => ({ ...f, options: [...f.options, blankOption(f.options.length)] }));
  }
  function removeOption(idx: number) {
    setForm((f) => {
      if (f.options.length <= 1) return f;
      return { ...f, options: f.options.filter((_, i) => i !== idx).map((o, i) => ({ ...o, order: i })) };
    });
  }
  function moveOption(idx: number, dir: -1 | 1) {
    setForm((f) => {
      const target = idx + dir;
      if (target < 0 || target >= f.options.length) return f;
      const next = [...f.options];
      [next[idx], next[target]] = [next[target], next[idx]];
      return { ...f, options: next.map((o, i) => ({ ...o, order: i })) };
    });
  }

  function triggerUpload(idx: number) {
    pendingUploadIdx.current = idx;
    fileInputRef.current?.click();
  }
  async function handleFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    const idx = pendingUploadIdx.current;
    if (!file || idx === null) return;
    setUploadingIdx(idx);
    setError("");
    try {
      const { filePath, presignedUrl } = await tradeInQuestionsApi.uploadImage(file);
      // Store the raw key for persistence but show the presigned view URL immediately —
      // resolved on every future read the same way category/brand images are.
      updateOption(idx, { image: filePath, preview: presignedUrl });
    } catch (err: any) {
      setError(err.message ?? "Upload failed");
    } finally {
      setUploadingIdx(null);
      pendingUploadIdx.current = null;
    }
  }

  async function save() {
    if (!form.question.trim()) { setError("Question text is required"); return; }
    if (form.options.some((o) => !o.label.trim())) { setError("Every option needs a label"); return; }
    setSaving(true); setError("");
    const payload: UpsertTradeInQuestion = {
      category: form.category,
      question: form.question.trim(),
      isActive: form.isActive,
      options: form.options.map((o, i) => ({
        id: o.id?.startsWith("__new_") ? undefined : o.id,
        label: o.label.trim(),
        order: i,
        image: o.image ?? null,
        icon: o.icon ?? null,
        tone: o.tone ?? null,
      })),
    };
    try {
      if (editing === "new") await tradeInQuestionsApi.create(payload);
      else if (editing) await tradeInQuestionsApi.update(editing, payload);
      cancel(); load();
    } catch (e: any) { setError(e.message ?? "Save failed"); }
    finally { setSaving(false); }
  }

  async function remove(id: string, question: string) {
    if (!confirm(`Delete "${question}"? This removes all its options too.`)) return;
    await tradeInQuestionsApi.remove(id).catch(() => {});
    load();
  }

  async function toggleActive(q: TradeInQuestionItem) {
    const next = !q.isActive;
    setQuestions((prev) => prev.map((x) => (x.id === q.id ? { ...x, isActive: next } : x)));
    await tradeInQuestionsApi
      .update(q.id, { category: q.category, key: q.key, question: q.question, order: q.order, isActive: next, options: q.options })
      .catch(() => setQuestions((prev) => prev.map((x) => (x.id === q.id ? { ...x, isActive: !next } : x))));
  }

  async function handleDeleteAll() {
    if (!confirm(`Delete all ${questions.length} questions? This cannot be undone — use "Seed defaults" afterwards to restore the default set.`)) return;
    setDeletingAll(true); setBulkMsg("");
    try {
      const { deleted } = await tradeInQuestionsApi.removeAll();
      setBulkMsg(`Deleted ${deleted} question${deleted !== 1 ? "s" : ""}.`);
      load();
    } catch (e: any) { setBulkMsg(e.message ?? "Delete failed"); }
    finally { setDeletingAll(false); }
  }
  async function handleSeedDefaults() {
    setSeeding(true); setBulkMsg("");
    try {
      const { seeded } = await tradeInQuestionsApi.seedDefaults();
      setBulkMsg(`Seeded ${seeded} default question${seeded !== 1 ? "s" : ""} (existing entries left untouched).`);
      load();
    } catch (e: any) { setBulkMsg(e.message ?? "Seed failed"); }
    finally { setSeeding(false); }
  }

  const filtered = useMemo(
    () => (filterCat === "All" ? questions : questions.filter((q) => q.category === filterCat)),
    [questions, filterCat],
  );
  const grouped = useMemo(() => {
    const map = new Map<string, TradeInQuestionItem[]>();
    for (const q of filtered) {
      if (!map.has(q.category)) map.set(q.category, []);
      map.get(q.category)!.push(q);
    }
    for (const list of map.values()) list.sort((a, b) => a.order - b.order);
    return map;
  }, [filtered]);

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto">
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChosen} />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <Link href="/catalog-mgmt" className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-700 mb-1">
            <ArrowLeft className="h-3 w-3" /> Catalog Management
          </Link>
          <h1 className="text-2xl font-bold text-zinc-900">Trade-In Questions</h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            The &quot;Quick Check&quot; condition-assessment questions shown per device category in the trade-in wizard —
            each option can carry a photo, or an icon + color badge picked from a fixed palette.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleSeedDefaults}
            disabled={seeding}
            title="Create any default question that's missing — safe to run any time, never overwrites edits"
            className="flex items-center gap-2 h-9 px-4 rounded-xl border border-zinc-200 text-zinc-600 text-xs font-bold hover:border-zinc-400 hover:text-zinc-900 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${seeding ? "animate-spin" : ""}`} /> {seeding ? "Seeding…" : "Seed defaults"}
          </button>
          <button
            onClick={handleDeleteAll}
            disabled={deletingAll || questions.length === 0}
            className="flex items-center gap-2 h-9 px-4 rounded-xl border border-zinc-200 text-zinc-500 text-xs font-bold hover:border-red-200 hover:text-red-700 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Trash2 className="h-3.5 w-3.5" /> {deletingAll ? "Deleting…" : "Delete All"}
          </button>
          <button
            onClick={() => startCreate()}
            className="flex items-center gap-2 h-9 px-4 rounded-xl bg-zinc-950 text-white text-xs font-bold hover:bg-zinc-800"
          >
            <Plus className="h-3.5 w-3.5" /> Add question
          </button>
        </div>
      </div>

      {bulkMsg && (
        <div className="text-xs font-semibold text-zinc-600 bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 mb-4">{bulkMsg}</div>
      )}

      {/* Add / Edit form */}
      {editing && (
        <div className="bg-white border border-zinc-200 rounded-2xl p-5 mb-6">
          <h2 className="font-bold mb-4 text-sm">{editing === "new" ? "Add question" : "Edit question"}</h2>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 block mb-1">Category *</label>
              <select
                className="w-full h-9 border border-zinc-200 rounded-xl px-3 text-sm outline-none focus:border-zinc-400"
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                disabled={editing !== "new"}
              >
                {formCategoryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="col-span-2 sm:col-span-3">
              <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 block mb-1">Question text *</label>
              <input
                className="w-full h-9 border border-zinc-200 rounded-xl px-3 text-sm outline-none focus:border-zinc-400"
                placeholder="e.g. How is the screen?"
                value={form.question}
                onChange={(e) => setForm((f) => ({ ...f, question: e.target.value }))}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs font-semibold mb-4 cursor-pointer">
            <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} />
            Active (shown in the wizard)
          </label>

          {/* Options editor */}
          <div className="space-y-3 mb-4">
            <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 block">Options *</label>
            {form.options.map((opt, idx) => {
              const previewUrl = opt.preview ?? opt.image ?? null;
              const isRawKeyOnly = !previewUrl && !!opt.image; // saved key with no local preview (shouldn't normally happen)
              return (
                <div key={opt.id} className="border border-zinc-200 rounded-2xl p-3.5 space-y-3 bg-zinc-50/40">
                  <div className="flex items-start gap-3">
                    {/* Order controls */}
                    <div className="flex flex-col gap-0.5 pt-1.5 shrink-0">
                      <button type="button" onClick={() => moveOption(idx, -1)} disabled={idx === 0}
                        className="h-5 w-5 flex items-center justify-center text-zinc-300 hover:text-zinc-700 disabled:opacity-30">
                        <ChevronUp className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" onClick={() => moveOption(idx, 1)} disabled={idx === form.options.length - 1}
                        className="h-5 w-5 flex items-center justify-center text-zinc-300 hover:text-zinc-700 disabled:opacity-30">
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {/* Image */}
                    <div className="shrink-0">
                      {previewUrl ? (
                        <div className="relative h-16 w-16 rounded-xl overflow-hidden border border-zinc-200 group">
                          <img src={previewUrl} alt="" className="h-full w-full object-cover" />
                          <button
                            type="button"
                            onClick={() => updateOption(idx, { image: null, preview: undefined })}
                            className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => triggerUpload(idx)}
                          disabled={uploadingIdx === idx}
                          className="h-16 w-16 rounded-xl border-2 border-dashed border-zinc-300 flex items-center justify-center text-zinc-400 hover:border-zinc-400 hover:text-zinc-600 disabled:opacity-50"
                          title="Upload photo (optional)"
                        >
                          {uploadingIdx === idx ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
                        </button>
                      )}
                      {isRawKeyOnly && <p className="text-[9px] text-zinc-400 mt-1 w-16 text-center">saved</p>}
                    </div>

                    {/* Label */}
                    <div className="flex-1 min-w-0">
                      <input
                        className="w-full h-9 border border-zinc-200 rounded-xl px-3 text-sm outline-none focus:border-zinc-400 bg-white"
                        placeholder="Option label, e.g. No cracks or scratches"
                        value={opt.label}
                        onChange={(e) => updateOption(idx, { label: e.target.value })}
                      />

                      {/* Icon + tone pickers */}
                      <div className="mt-2.5 flex flex-wrap items-start gap-3">
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {ICON_LIBRARY.map(({ key, label, Icon }) => (
                            <button
                              key={key}
                              type="button"
                              title={label}
                              onClick={() => updateOption(idx, { icon: opt.icon === key ? null : key })}
                              className={`h-6 w-6 rounded-md flex items-center justify-center border transition-colors ${
                                opt.icon === key
                                  ? "bg-zinc-950 border-zinc-950 text-white"
                                  : "bg-white border-zinc-200 text-zinc-400 hover:border-zinc-400 hover:text-zinc-700"
                              }`}
                            >
                              <Icon className="h-3.5 w-3.5" />
                            </button>
                          ))}
                        </div>
                        <div className="flex gap-1 shrink-0">
                          {TONES.map((t) => (
                            <button
                              key={t.value}
                              type="button"
                              title={t.label}
                              onClick={() => updateOption(idx, { tone: opt.tone === t.value ? null : t.value })}
                              className={`h-6 w-6 rounded-full ${t.dot} ${opt.tone === t.value ? `ring-2 ring-offset-2 ${t.ring}` : "opacity-50 hover:opacity-80"}`}
                            />
                          ))}
                        </div>
                      </div>
                    </div>

                    <button type="button" onClick={() => removeOption(idx)} disabled={form.options.length <= 1}
                      className="text-zinc-300 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed shrink-0 mt-1.5">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
            <button type="button" onClick={addOption}
              className="flex items-center gap-1.5 h-8 px-3 rounded-xl border border-dashed border-zinc-300 text-zinc-500 text-xs font-bold hover:border-zinc-400 hover:text-zinc-700">
              <Plus className="h-3.5 w-3.5" /> Add option
            </button>
          </div>

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
      <div className="flex gap-1.5 flex-wrap mb-5">
        {["All", ...CATEGORIES].map((c) => (
          <button
            key={c}
            onClick={() => setFilterCat(c)}
            className={`h-8 px-3 rounded-xl text-xs font-bold transition-colors ${filterCat === c ? "bg-zinc-950 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"}`}
          >
            {c}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-6 w-6 border-4 border-zinc-200 border-t-black rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-sm text-zinc-400">
          {filterCat !== "All" ? "No questions in this category yet." : "No questions yet — click Add question or Seed defaults to get started."}
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
              <div className="space-y-2">
                {items.map((q) => (
                  <div key={q.id} className="bg-white border border-zinc-100 rounded-2xl p-4 flex items-center gap-4 hover:border-zinc-200">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-zinc-900 text-sm truncate">{q.question}</p>
                        <span className="text-[9px] font-bold uppercase tracking-wide text-zinc-400 bg-zinc-50 px-1.5 py-0.5 rounded-full border border-zinc-100 shrink-0">{q.key}</span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                        {q.options.map((o) => {
                          const Icon = o.icon ? ICON_MAP.get(o.icon) : null;
                          const tone = TONES.find((t) => t.value === o.tone);
                          return (
                            <span key={o.id} className="flex items-center gap-1 text-[10px] font-semibold text-zinc-600 bg-zinc-50 border border-zinc-100 rounded-full pl-1 pr-2 py-0.5">
                              {o.image ? (
                                <img src={o.image} alt="" className="h-4 w-4 rounded-full object-cover" />
                              ) : Icon ? (
                                <span className={`h-4 w-4 rounded-full flex items-center justify-center text-white ${tone?.dot ?? "bg-zinc-300"}`}>
                                  <Icon className="h-2.5 w-2.5" />
                                </span>
                              ) : (
                                <span className="h-4 w-4 rounded-full bg-zinc-200" />
                              )}
                              {o.label}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                    <button
                      onClick={() => toggleActive(q)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0 ${q.isActive ? "bg-emerald-500" : "bg-zinc-300"}`}
                    >
                      <span className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${q.isActive ? "translate-x-4.5" : "translate-x-0.5"}`} />
                    </button>
                    <div className="flex items-center gap-3 shrink-0">
                      <button onClick={() => startEdit(q)} className="text-zinc-300 hover:text-zinc-700">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => remove(q.id, q.question)} className="text-zinc-300 hover:text-red-500">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
