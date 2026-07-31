"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, Check, X, Trash2, Upload, Image as ImageIcon,
  Package, Tag, Layers, ToggleLeft, ToggleRight, ExternalLink,
  Scissors, Loader2, Sparkles, Camera,
} from "lucide-react";
import { productsApi, ordersApi, catalogCategoriesApi, type Product } from "../../../lib/api";
import { removeBackground } from "../../../lib/removeBackground";
import { useBgRemoval } from "../../../context/bg-removal-context";
import CameraCaptureModal from "../../../components/CameraCaptureModal";

const CONDITIONS = [
  { value: 'NEW', label: 'New' },
  { value: 'A',   label: 'A Grade' },
  { value: 'B',   label: 'B Grade' },
  { value: 'C',   label: 'C Grade' },
  { value: 'F',   label: 'F Grade' },
];
const CATEGORIES = ["Phones", "Tablets", "Gaming", "Laptops", "Audio", "Accessories"];

const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-blue-50 text-blue-700 border-blue-100",
  CONFIRMED: "bg-purple-50 text-purple-700 border-purple-100",
  SHIPPED: "bg-indigo-50 text-indigo-700 border-indigo-100",
  DELIVERED: "bg-emerald-50 text-emerald-700 border-emerald-100",
  CANCELLED: "bg-red-50 text-red-600 border-red-100",
};

const getStatusLabel = (status: string) => {
  switch (status) {
    case "PENDING": return "Processing";
    case "CONFIRMED": return "Confirmed";
    case "SHIPPED": return "Dispatched";
    case "DELIVERED": return "Delivered";
    case "CANCELLED": return "Cancelled";
    default: return status;
  }
};

const fmtDate = (s: string) =>
  new Date(s).toLocaleString("en-GB", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [product, setProduct] = useState<Product | null>(null);
  const [rawImagePaths, setRawImagePaths] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [uploadingImg, setUploadingImg] = useState(false);
  const [removingBgIndex, setRemovingBgIndex] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const { startBgRemoval, stopBgRemoval } = useBgRemoval();

  const [buyers, setBuyers] = useState<{
    orderId: string;
    date: string;
    status: string;
    quantity: number;
    price: number;
    user: { name: string; email: string } | null;
  }[]>([]);
  const [loadingBuyers, setLoadingBuyers] = useState(true);
  const [categories, setCategories] = useState<string[]>(CATEGORIES);

  // form state mirrors product fields
  const [form, setForm] = useState({
    name: "", brand: "", model: "", category: "Phones", condition: "A",
    price: null as number | null, comparePrice: undefined as number | undefined,
    stock: 0, description: "", isActive: true,
    storage: "",
  });

  useEffect(() => {
    setLoading(true);
    setLoadingBuyers(true);
    productsApi.getById(id)
      .then(p => {
        setProduct(p);
        setRawImagePaths(p.rawImages ?? []);
        setForm({
          name: p.name, brand: p.brand, model: p.model,
          category: p.category, condition: p.condition,
          price: p.price, comparePrice: p.comparePrice,
          stock: p.stock ?? 0, description: p.description ?? "",
          isActive: p.isActive,
          storage: p.storage ?? "",
        });

        // Fetch category options dynamically
        catalogCategoriesApi.list(true)
          .then(cats => {
            const names = cats.map(c => c.name);
            setCategories(Array.from(new Set([...CATEGORIES, ...names])));
          })
          .catch(err => console.error("Failed to load catalog categories", err));

        // Fetch purchase history
        ordersApi.list({ limit: 500 })
          .then(res => {
            const list = res.items.filter(o => o.items.some(i => i.product?.id === p.id));
            setBuyers(
              list.map(o => {
                const item = o.items.find(i => i.product?.id === p.id)!;
                const customerName = o.user?.name ?? o.shippingAddress?.name ?? "Guest";
                const customerEmail = o.user?.email ?? o.shippingAddress?.email ?? "—";
                return {
                  orderId: o.id,
                  date: o.createdAt,
                  status: o.status,
                  quantity: item.quantity,
                  price: item.price,
                  user: { name: customerName, email: customerEmail },
                };
              })
            );
          })
          .catch(err => {
            console.error("Failed to load buyers list", err);
          })
          .finally(() => {
            setLoadingBuyers(false);
          });
      })
      .catch(() => router.replace("/products"))
      .finally(() => setLoading(false));
  }, [id]);

  async function save() {
    if (!product) return;
    setSaving(true); setError(""); setSuccess("");
    try {
      await productsApi.update(product.id, {
        name: form.name, condition: form.condition,
        storage: form.storage,
        price: form.price != null ? Number(form.price) : null,
        comparePrice: form.comparePrice ? Number(form.comparePrice) : undefined,
        stock: Number(form.stock), description: form.description,
        isActive: form.isActive,
        specs: product.specs,
        images: rawImagePaths,
      });
      // re-fetch to get fresh presigned display URLs
      const refreshed = await productsApi.getById(product.id);
      setProduct(refreshed);
      setRawImagePaths(refreshed.rawImages ?? []);
      setSuccess("Saved successfully");
      setTimeout(() => setSuccess(""), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally { setSaving(false); }
  }

  async function uploadImageFile(file: File) {
    if (!product) return;
    setUploadingImg(true);
    try {
      const { filePath } = await productsApi.uploadImage(file);
      const newRawPaths = [...rawImagePaths, filePath];
      await productsApi.update(product.id, { images: newRawPaths });
      const refreshed = await productsApi.getById(product.id);
      setProduct(refreshed);
      setRawImagePaths(refreshed.rawImages ?? []);
    } catch {
      setError("Image upload failed");
    } finally {
      setUploadingImg(false);
    }
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadImageFile(file);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleRemoveBg(index: number) {
    const rawKey = rawImagePaths[index];
    if (!rawKey || !product) return;
    setRemovingBgIndex(index);
    startBgRemoval(product.name, `/products/${product.id}`);
    try {
      const file = await removeBackground(rawKey, rawKey.split("/").pop() ?? "product.jpg");
      const { filePath } = await productsApi.uploadImage(file);
      const newRawPaths = rawImagePaths.map((p, i) => i === index ? filePath : p);
      await productsApi.update(product.id, { images: newRawPaths });
      const refreshed = await productsApi.getById(product.id);
      setProduct(refreshed);
      setRawImagePaths(refreshed.rawImages ?? []);
    } catch (e: unknown) {
      setError((e instanceof Error ? e.message : null) ?? "Background removal failed. Please try again.");
    } finally {
      setRemovingBgIndex(null);
      stopBgRemoval();
    }
  }

  async function removeImage(idx: number) {
    if (!product) return;
    const newRawPaths = rawImagePaths.filter((_, i) => i !== idx);
    try {
      await productsApi.update(product.id, { images: newRawPaths });
      setRawImagePaths(newRawPaths);
      setProduct(p => p ? { ...p, images: p.images.filter((_, i) => i !== idx) } : p);
    } catch { setError("Failed to remove image"); }
  }

  if (loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="h-8 w-8 border-4 border-zinc-200 border-t-black rounded-full animate-spin" />
    </div>
  );

  if (!product) return null;

  return (
    <>
      <CameraCaptureModal open={cameraOpen} onClose={() => setCameraOpen(false)} onCapture={uploadImageFile} />

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <button className="absolute top-4 right-4 h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center" onClick={() => setLightbox(null)}>
            <X className="h-5 w-5 text-white" />
          </button>
          <img src={lightbox} alt="Product" className="max-h-[90vh] max-w-[90vw] rounded-2xl object-contain" onClick={e => e.stopPropagation()} />
        </div>
      )}

      <div className="min-h-screen bg-background p-6 lg:p-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => router.push("/products")}
            className="h-10 w-10 rounded-2xl border border-zinc-200 bg-white hover:border-zinc-400 flex items-center justify-center transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold tracking-tight truncate">{product.name}</h1>
            <p className="text-xs text-zinc-400 font-medium mt-0.5">ID: {product.id} · Added {fmtDate(product.createdAt)}</p>
          </div>
          <div className="flex items-center gap-3">
            {success && (
              <span className="flex items-center gap-1.5 text-emerald-600 text-sm font-bold">
                <Check className="h-4 w-4" /> {success}
              </span>
            )}
            <button
              onClick={save}
              disabled={saving}
              className="h-10 px-5 rounded-2xl bg-black text-white font-bold text-sm hover:bg-zinc-800 transition-colors disabled:opacity-60 flex items-center gap-2"
            >
              {saving ? <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Check className="h-4 w-4" />}
              Save
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-2xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-600 font-medium">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

          {/* ── Left: Images ── */}
          <div className="xl:col-span-2 space-y-6">

            {/* Images */}
            <div className="bg-white rounded-3xl border border-zinc-100 shadow-sm p-6">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <ImageIcon className="h-4 w-4 text-zinc-400" />
                  <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-400">
                    Photos ({product.images.length})
                  </h2>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => fileRef.current?.click()}
                    disabled={uploadingImg}
                    className="flex items-center gap-2 h-9 px-4 rounded-xl bg-zinc-950 text-white text-xs font-bold hover:bg-zinc-800 transition-colors disabled:opacity-60"
                  >
                    {uploadingImg
                      ? <div className="h-3.5 w-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      : <Upload className="h-3.5 w-3.5" />
                    }
                    Upload image
                  </button>
                  <button
                    onClick={() => setCameraOpen(true)}
                    disabled={uploadingImg}
                    className="flex items-center gap-2 h-9 px-4 rounded-xl border border-zinc-200 text-zinc-600 text-xs font-bold hover:border-zinc-400 transition-colors disabled:opacity-60"
                  >
                    <Camera className="h-3.5 w-3.5" />
                    Take photo
                  </button>
                </div>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
              </div>

              {product.images.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {product.images.map((url, i) => (
                    <div key={i} className="relative group aspect-square rounded-2xl overflow-hidden border border-zinc-100">
                      <img
                        src={url}
                        alt={`Photo ${i + 1}`}
                        className="w-full h-full object-cover cursor-pointer group-hover:scale-105 transition-transform duration-300"
                        onClick={() => setLightbox(url)}
                      />
                      <button
                        onClick={() => handleRemoveBg(i)}
                        disabled={removingBgIndex !== null}
                        className="absolute top-2 left-2 h-7 px-2 rounded-lg bg-zinc-900/80 backdrop-blur-sm text-white text-[10px] font-bold flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-40"
                      >
                        {removingBgIndex === i
                          ? <><Loader2 className="h-3 w-3 animate-spin" /> Processing...</>
                          : <><Scissors className="h-3 w-3" /> Remove BG</>
                        }
                      </button>
                      <button
                        onClick={() => removeImage(i)}
                        className="absolute top-2 right-2 h-7 w-7 rounded-lg bg-red-600 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-700"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                      {i === 0 && (
                        <span className="absolute bottom-2 left-2 bg-black/60 text-white text-[10px] font-bold px-2 py-0.5 rounded-md">
                          Main
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="w-full border-2 border-dashed border-zinc-200 rounded-2xl py-10 flex flex-col items-center gap-4 text-zinc-400">
                  <Upload className="h-8 w-8 opacity-40" />
                  <p className="text-sm font-medium">Add product photos</p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => fileRef.current?.click()}
                      className="flex items-center gap-2 h-9 px-4 rounded-xl bg-zinc-950 text-white text-xs font-bold hover:bg-zinc-800 transition-colors"
                    >
                      <Upload className="h-3.5 w-3.5" />
                      Choose files
                    </button>
                    <button
                      onClick={() => setCameraOpen(true)}
                      className="flex items-center gap-2 h-9 px-4 rounded-xl border border-zinc-200 text-zinc-600 text-xs font-bold hover:border-zinc-400 hover:text-zinc-800 transition-colors"
                    >
                      <Camera className="h-3.5 w-3.5" />
                      Take photo
                    </button>
                  </div>
                </div>
              )}
              <p className="text-[10px] text-zinc-400 font-medium mt-3">First image is shown as the main product photo. Click any image to enlarge.</p>
              <p className="text-[10px] text-zinc-400 font-medium flex items-center gap-1.5 mt-1">
                <Sparkles className="h-3 w-3 shrink-0" />
                Hover an image and click <strong>Remove BG</strong> to create a cleaner look for customers
              </p>
            </div>

            {/* Details form */}
            <div className="bg-white rounded-3xl border border-zinc-100 shadow-sm p-6">
              <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-400 mb-5">Product Details</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  { key: "name", label: "Product Name", placeholder: "iPhone 14 Pro" },
                  { key: "brand", label: "Brand", placeholder: "Apple" },
                  { key: "model", label: "Model", placeholder: "iPhone 14 Pro" },
                  { key: "storage", label: "Storage / Spec", placeholder: "256 GB" },
                ].map(({ key, label, placeholder }) => (
                  <div key={key} className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-bold uppercase tracking-widest text-zinc-400">{label}</label>
                    <input
                      type="text"
                      placeholder={placeholder}
                      value={(form as any)[key]}
                      onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                      disabled={key === "brand" || key === "model"}
                      className="h-11 rounded-2xl border-2 border-zinc-200 px-4 text-sm font-medium outline-none focus:border-black transition-colors disabled:bg-zinc-50 disabled:text-zinc-400 disabled:cursor-not-allowed"
                    />
                  </div>
                ))}

                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-bold uppercase tracking-widest text-zinc-400">Category</label>
                  <select
                    value={form.category}
                    onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                    disabled
                    className="h-11 rounded-2xl border-2 border-zinc-200 px-4 text-sm font-medium outline-none focus:border-black transition-colors bg-white disabled:bg-zinc-50 disabled:text-zinc-400 disabled:cursor-not-allowed"
                  >
                    {categories.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-bold uppercase tracking-widest text-zinc-400">Condition</label>
                  <select
                    value={form.condition}
                    onChange={e => setForm(f => ({ ...f, condition: e.target.value }))}
                    className="h-11 rounded-2xl border-2 border-zinc-200 px-4 text-sm font-medium outline-none focus:border-black transition-colors bg-white"
                  >
                    {CONDITIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>

                <div className="sm:col-span-2 flex flex-col gap-1.5">
                  <label className="text-[11px] font-bold uppercase tracking-widest text-zinc-400">Description</label>
                  <textarea
                    placeholder="Brief product description..."
                    value={form.description}
                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                    rows={3}
                    className="rounded-2xl border-2 border-zinc-200 px-4 py-3 text-sm font-medium outline-none focus:border-black transition-colors resize-none"
                  />
                </div>
              </div>

              {/* Attributes (Color, Edition, etc.) — set from the Products list edit modal, shown here read-only */}
              {product && Object.entries(product.attributes ?? {}).filter(([, v]) => v).length > 0 && (
                <div className="mt-5 pt-5 border-t border-zinc-100">
                  <label className="text-[11px] font-bold uppercase tracking-widest text-zinc-400 mb-2 block">Attributes</label>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(product.attributes ?? {}).filter(([, v]) => v).map(([label, value]) => (
                      <span key={label} className="px-3 py-1.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-semibold text-zinc-600">
                        <span className="text-zinc-400">{label}:</span> {value}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Purchase History */}
            <div className="bg-white rounded-3xl border border-zinc-100 shadow-sm p-6">
              <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-400 mb-5">Purchase History</h2>
              {loadingBuyers ? (
                <div className="py-8 flex items-center justify-center">
                  <div className="h-6 w-6 border-2 border-zinc-200 border-t-black rounded-full animate-spin" />
                </div>
              ) : buyers.length > 0 ? (
                <div className="overflow-x-auto -mx-6">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-zinc-100 text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                        <th className="py-3 px-6">Customer</th>
                        <th className="py-3 px-6">Date</th>
                        <th className="py-3 px-6 text-center">Qty</th>
                        <th className="py-3 px-6 text-right">Price Paid</th>
                        <th className="py-3 px-6">Status</th>
                        <th className="py-3 px-6 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-50 text-sm">
                      {buyers.map((buyer, idx) => (
                        <tr key={idx} className="hover:bg-zinc-50/50 transition-colors">
                          <td className="py-4 px-6">
                            <div className="font-bold text-zinc-800">{buyer.user?.name}</div>
                            <div className="text-xs text-zinc-400 font-medium mt-0.5">{buyer.user?.email}</div>
                          </td>
                          <td className="py-4 px-6 text-zinc-500 font-medium">
                            {fmtDate(buyer.date)}
                          </td>
                          <td className="py-4 px-6 text-center text-zinc-600 font-bold">
                            {buyer.quantity}
                          </td>
                          <td className="py-4 px-6 text-right font-bold text-zinc-800">
                            £{buyer.price.toFixed(2)}
                          </td>
                          <td className="py-4 px-6">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${STATUS_STYLES[buyer.status] || "bg-zinc-100 text-zinc-800 border-zinc-200"}`}>
                              {getStatusLabel(buyer.status)}
                            </span>
                          </td>
                          <td className="py-4 px-6 text-right">
                            <button
                              onClick={() => router.push(`/orders?q=${buyer.orderId}`)}
                              className="h-8 w-8 inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-600 hover:border-zinc-400 hover:text-black transition-colors"
                              title="View Order"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="py-12 text-center text-zinc-400 font-medium">
                  No purchase records found for this product.
                </div>
              )}
            </div>
          </div>

          {/* ── Right: Pricing + Inventory + Status ── */}
          <div className="space-y-6">

            {/* Pricing */}
            <div className="bg-zinc-950 text-white rounded-3xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <Tag className="h-4 w-4 text-zinc-400" />
                <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-400">Pricing</h2>
              </div>
              <div className="space-y-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">Sale Price (£)</label>
                  <input
                    type="number"
                    value={form.price ?? ""}
                    onChange={e => setForm(f => ({ ...f, price: e.target.value === "" ? null : Number(e.target.value) }))}
                    className="h-12 rounded-2xl bg-white/10 border border-white/10 px-4 text-xl font-black text-white outline-none focus:border-white/30 transition-colors"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">Compare Price (£)</label>
                  <input
                    type="number"
                    placeholder="Original RRP"
                    value={form.comparePrice ?? ""}
                    onChange={e => setForm(f => ({ ...f, comparePrice: e.target.value === "" ? undefined : Number(e.target.value) }))}
                    className="h-11 rounded-2xl bg-white/10 border border-white/10 px-4 text-sm font-medium text-white/70 outline-none focus:border-white/30 transition-colors placeholder:text-white/30"
                  />
                </div>
              </div>
            </div>

            {/* Inventory */}
            <div className="bg-white rounded-3xl border border-zinc-100 shadow-sm p-6">
              <div className="flex items-center gap-2 mb-4">
                <Package className="h-4 w-4 text-zinc-400" />
                <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-400">Inventory</h2>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-bold uppercase tracking-widest text-zinc-400">Stock Quantity</label>
                <input
                  type="number"
                  value={form.stock}
                  onChange={e => setForm(f => ({ ...f, stock: Number(e.target.value) }))}
                  className="h-12 rounded-2xl border-2 border-zinc-200 px-4 text-2xl font-black outline-none focus:border-black transition-colors"
                />
              </div>
              {form.stock === 0 && (
                <p className="text-xs text-red-500 font-bold mt-2">Out of stock — product hidden from store</p>
              )}
            </div>

            {/* Status */}
            <div className="bg-white rounded-3xl border border-zinc-100 shadow-sm p-6">
              <div className="flex items-center gap-2 mb-4">
                <Layers className="h-4 w-4 text-zinc-400" />
                <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-400">Status</h2>
              </div>
              <button
                onClick={() => setForm(f => ({ ...f, isActive: !f.isActive }))}
                className="w-full flex items-center justify-between p-4 rounded-2xl bg-zinc-50 border border-zinc-100 hover:border-zinc-300 transition-colors"
              >
                <div className="text-left">
                  <p className="text-sm font-bold">{form.isActive ? "Active" : "Hidden"}</p>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    {form.isActive ? "Visible on the web store" : "Not visible to customers"}
                  </p>
                </div>
                {form.isActive
                  ? <ToggleRight className="h-8 w-8 text-emerald-500 shrink-0" />
                  : <ToggleLeft className="h-8 w-8 text-zinc-300 shrink-0" />
                }
              </button>
            </div>

            {/* Slug / meta */}
            <div className="bg-white rounded-3xl border border-zinc-100 shadow-sm p-6">
              <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-400 mb-3">Meta</h2>
              <div className="space-y-2 text-xs text-zinc-400">
                <div className="flex justify-between gap-2">
                  <span className="font-bold uppercase tracking-widest">Slug</span>
                  <span className="font-mono text-zinc-600 truncate">{product.slug}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="font-bold uppercase tracking-widest">Created</span>
                  <span>{fmtDate(product.createdAt)}</span>
                </div>
              </div>
            </div>

            {/* Delete */}
            <button
              onClick={async () => {
                if (!confirm("Delete this product? This cannot be undone.")) return;
                await productsApi.remove(product.id);
                router.push("/products");
              }}
              className="w-full h-11 rounded-2xl bg-red-50 text-red-600 font-bold text-sm hover:bg-red-100 transition-colors flex items-center justify-center gap-2"
            >
              <Trash2 className="h-4 w-4" /> Delete product
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
