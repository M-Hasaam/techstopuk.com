"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  catalogBrandsApi,
  catalogCategoriesApi,
  catalogBrandCategoryApi,
  type CatalogBrandItem,
  type BrandCategoryOption,
  type CatalogCategoryItem,
} from "../../../../lib/api";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Upload,
  X,
  Check,
  Image as ImageIcon,
  AlertTriangle,
  ToggleLeft,
  ToggleRight,
  ShoppingBag,
  Scissors,
  Loader2,
} from "lucide-react";
import { removeBackground } from "../../../../lib/removeBackground";
import { useBgRemoval } from "../../../../context/bg-removal-context";

const MAX_IMAGES = 10;
const MAIN_CATEGORIES_SLUGS = new Set(["phones", "tablets", "gaming", "laptops", "audio"]);

export default function BrandDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [brand, setBrand] = useState<CatalogBrandItem | null>(null);
  const [bcs, setBcs] = useState<BrandCategoryOption[]>([]);
  const [allCats, setAllCats] = useState<CatalogCategoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Unified Editing states
  const [brandName, setBrandName] = useState("");
  const [brandSlug, setBrandSlug] = useState("");
  const [brandActive, setBrandActive] = useState(true);
  const [savingBrand, setSavingBrand] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  // Categories Assignments states
  const [assignCatId, setAssignCatId] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [uploadingBcId, setUploadingBcId] = useState<string | null>(null);
  const [removingBgLogo, setRemovingBgLogo] = useState(false);
  const [removingBgImageUrl, setRemovingBgImageUrl] = useState<string | null>(null);
  const { startBgRemoval, stopBgRemoval } = useBgRemoval();

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const pendingBcId = useRef<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [brands, bcList, cats] = await Promise.all([
        catalogBrandsApi.list(true),
        catalogBrandCategoryApi.list({ includeInactive: true, brandId: id }),
        catalogCategoriesApi.list(true),
      ]);
      const found = brands.find((b) => b.id === id);
      if (!found) {
        router.replace("/catalog-mgmt/brands");
        return;
      }
      setBrand(found);
      setBrandName(found.name);
      setBrandSlug(found.slug);
      setBrandActive(found.isActive);
      setBcs(bcList);
      setAllCats(cats);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [id]);

  const assignedCatIds = new Set(bcs.map((bc) => bc.categoryId));
  const unassigned = allCats.filter((c) => !assignedCatIds.has(c.id));

  const mainBcs = bcs.filter((bc) =>
    MAIN_CATEGORIES_SLUGS.has(bc.category.name.toLowerCase())
  );
  const otherBcs = bcs.filter((bc) =>
    !MAIN_CATEGORIES_SLUGS.has(bc.category.name.toLowerCase())
  );

  const renderBcItem = (bc: BrandCategoryOption, idx: number) => {
    const hasZeroImages = bc.images.length === 0;

    return (
      <div key={bc.id} className={`space-y-4 ${idx > 0 ? "pt-6" : ""}`}>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-extrabold text-zinc-900">{bc.category.name}</h3>
            <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest mt-0.5">
              {bc.images.length} images assigned
            </p>
          </div>

          <div className="flex items-center gap-3">
            {hasZeroImages && (
              <span className="flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-100 animate-pulse">
                <AlertTriangle className="h-3 w-3" /> Minimum 1 image required
              </span>
            )}
            <button
              onClick={() => router.push(`/catalog-mgmt/brands/${id}/${bc.categoryId}`)}
              className="h-8 px-3 inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white text-zinc-600 hover:border-zinc-400 hover:text-black text-xs font-bold transition-colors shadow-sm"
              title="View related products"
            >
              <ShoppingBag className="h-3.5 w-3.5" /> Products
            </button>
            <button
              onClick={() => handleUnassign(bc.id)}
              className="text-zinc-400 hover:text-red-500 flex items-center gap-1 text-xs font-bold transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" /> Remove Assignment
            </button>
          </div>
        </div>

        {/* Images grid */}
        <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-6 gap-3">
          {(bc.images as string[]).map((img, i) => (
            <div
              key={i}
              className="relative group aspect-square rounded-2xl overflow-hidden bg-zinc-50 border border-zinc-100"
            >
              <img src={img} alt="" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
              <button
                onClick={() => handleRemoveCategoryImageBg(bc.id, img)}
                disabled={removingBgImageUrl !== null}
                className="absolute top-1.5 left-1.5 h-6 px-1.5 rounded-lg bg-zinc-900/80 text-white text-[9px] font-bold flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-40"
                title="Remove background"
              >
                {removingBgImageUrl === img
                  ? <Loader2 className="h-2.5 w-2.5 animate-spin" />
                  : <Scissors className="h-2.5 w-2.5" />
                }
              </button>
              <button
                onClick={() => handleDeleteImage(bc.id, img)}
                disabled={removingBgImageUrl !== null}
                className="absolute top-1.5 right-1.5 h-6 w-6 rounded-lg bg-red-600/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-40"
                title="Delete image"
              >
                <X className="h-3 w-3 text-white" />
              </button>
            </div>
          ))}
          {(bc.images as string[]).length < MAX_IMAGES && (
            <button
              onClick={() => {
                pendingBcId.current = bc.id;
                fileRef.current?.click();
              }}
              disabled={uploadingBcId === bc.id}
              className="aspect-square rounded-2xl border-2 border-dashed border-zinc-200 hover:border-zinc-400 flex flex-col items-center justify-center gap-1.5 text-zinc-400 hover:text-zinc-600 transition-colors bg-zinc-50/30"
            >
              {uploadingBcId === bc.id ? (
                <div className="h-5 w-5 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  <span className="text-[10px] font-bold">Add</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    );
  };

  // Remove background from brand logo
  async function handleRemoveLogoBg() {
    if (!brand?.logo) return;
    setRemovingBgLogo(true);
    startBgRemoval(`${brand.name} logo`, `/catalog-mgmt/brands/${id}`);
    setError("");
    try {
      const file = await removeBackground(brand.logo, "logo.png");
      await catalogBrandsApi.uploadLogo(id, file);
      await load();
    } catch (e: unknown) {
      setError((e instanceof Error ? e.message : null) ?? "Logo background removal failed. Please try again.");
    } finally {
      setRemovingBgLogo(false);
      stopBgRemoval();
    }
  }

  // Remove background from a brand-category presentation image
  async function handleRemoveCategoryImageBg(bcId: string, imgUrl: string) {
    setRemovingBgImageUrl(imgUrl);
    startBgRemoval(`${brand?.name ?? "Brand"} image`, `/catalog-mgmt/brands/${id}`);
    setError("");
    try {
      const file = await removeBackground(imgUrl, imgUrl.split("/").pop() ?? "image.jpg");
      await catalogBrandCategoryApi.uploadImage(bcId, file);
      await catalogBrandCategoryApi.deleteImage(bcId, imgUrl);
      await load();
    } catch (e: unknown) {
      setError((e instanceof Error ? e.message : null) ?? "Background removal failed. Please try again.");
    } finally {
      setRemovingBgImageUrl(null);
      stopBgRemoval();
    }
  }

  // Save Brand info
  async function handleSaveBrandInfo() {
    if (!brandName.trim() || !brandSlug.trim()) {
      setError("Brand name and slug cannot be empty.");
      return;
    }
    setSavingBrand(true);
    setError("");
    setSuccess("");
    try {
      await catalogBrandsApi.update(id, {
        name: brandName.trim(),
        slug: brandSlug.trim(),
        isActive: brandActive,
      });
      setSuccess("Brand details saved successfully!");
      setTimeout(() => setSuccess(""), 3000);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSavingBrand(false);
    }
  }

  // Upload Brand Logo
  async function handleLogoUpload(file: File) {
    setUploadingLogo(true);
    setError("");
    try {
      await catalogBrandsApi.uploadLogo(id, file);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setUploadingLogo(false);
    }
  }

  // Assign Brand-Category
  async function handleAssignCategory() {
    if (!assignCatId) return;
    setAssigning(true);
    setError("");
    try {
      await catalogBrandCategoryApi.create({
        brandId: id,
        categoryId: assignCatId,
      });
      setAssignCatId("");
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setAssigning(false);
    }
  }

  // Remove Brand-Category link
  async function handleUnassign(bcId: string) {
    if (!confirm("Remove this brand–category link and all its images?")) return;
    try {
      await catalogBrandCategoryApi.delete(bcId);
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  // Upload category presentation image
  async function handleImageUpload(file: File) {
    const bcId = pendingBcId.current;
    if (!bcId) return;
    setUploadingBcId(bcId);
    setError("");
    try {
      await catalogBrandCategoryApi.uploadImage(bcId, file);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setUploadingBcId(null);
      pendingBcId.current = null;
    }
  }

  // Delete category presentation image with min 1 validation
  async function handleDeleteImage(bcId: string, imgUrl: string) {
    const link = bcs.find((bc) => bc.id === bcId);
    if (!link) return;

    if (link.images.length <= 1) {
      alert(
        "Cannot delete the last image. A minimum of 1 image is required for this brand-category link. Please upload another image first."
      );
      return;
    }

    setError("");
    try {
      await catalogBrandCategoryApi.deleteImage(bcId, imgUrl);
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="h-8 w-8 border-4 border-zinc-200 border-t-black rounded-full animate-spin" />
      </div>
    );
  }

  if (!brand) return null;

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-8">
      {/* Header and Back Link */}
      <div>
        <Link
          href="/catalog-mgmt/brands"
          className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-700 font-bold mb-2 transition-colors"
        >
          <ArrowLeft className="h-3 w-3" /> Back to brands
        </Link>
        <h1 className="text-3xl font-extrabold text-zinc-900 tracking-tight">Brand Details</h1>
      </div>

      {error && (
        <div className="rounded-2xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-600 font-medium">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-2xl bg-emerald-50 border border-emerald-100 px-4 py-3 text-sm text-emerald-600 font-medium flex items-center gap-1.5">
          <Check className="h-4 w-4" /> {success}
        </div>
      )}

      {/* Inputs for files */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleImageUpload(f);
          e.target.value = "";
        }}
      />
      <input
        ref={logoInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleLogoUpload(f);
          e.target.value = "";
        }}
      />

      {/* ── CARD 1: Brand Info Editor (Name, Slug, Status, Logo) ── */}
      <div className="bg-white border border-zinc-100 rounded-3xl p-6 shadow-sm">
        <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-400 mb-5">
          Brand Information
        </h2>

        <div className="flex flex-col md:flex-row gap-6">
          {/* Logo container */}
          <div className="flex flex-col items-center gap-3">
            <div className="relative group h-24 w-24 rounded-2xl overflow-hidden bg-zinc-50 border border-zinc-100 flex items-center justify-center p-2">
              {brand.logo ? (
                <img src={brand.logo} alt="" className="h-full w-full object-contain" />
              ) : (
                <ImageIcon className="h-10 w-10 text-zinc-300" />
              )}
              {uploadingLogo && (
                <div className="absolute inset-0 bg-white/80 flex items-center justify-center">
                  <div className="h-5 w-5 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </div>
            <button
              onClick={() => logoInputRef.current?.click()}
              disabled={uploadingLogo}
              className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-zinc-200 hover:border-zinc-400 bg-white text-[11px] font-bold transition-colors disabled:opacity-60"
            >
              <Upload className="h-3 w-3" /> Upload Logo
            </button>
            {brand.logo && (
              <button
                onClick={handleRemoveLogoBg}
                disabled={removingBgLogo || uploadingLogo}
                className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-zinc-200 hover:border-zinc-400 bg-white text-[11px] font-bold transition-colors disabled:opacity-60"
              >
                {removingBgLogo
                  ? <><Loader2 className="h-3 w-3 animate-spin" /> Processing...</>
                  : <><Scissors className="h-3 w-3" /> Remove BG</>
                }
              </button>
            )}
          </div>

          {/* Form details */}
          <div className="flex-1 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-bold uppercase tracking-widest text-zinc-400">
                  Brand Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Apple"
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                  className="h-10 rounded-xl border-2 border-zinc-200 px-3 text-sm font-medium outline-none focus:border-black transition-colors"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-bold uppercase tracking-widest text-zinc-400">
                  Slug
                </label>
                <input
                  type="text"
                  placeholder="e.g. apple"
                  value={brandSlug}
                  onChange={(e) => setBrandSlug(e.target.value)}
                  className="h-10 rounded-xl border-2 border-zinc-200 px-3 text-sm font-mono outline-none focus:border-black transition-colors"
                />
              </div>
            </div>

            {/* Brand Active status */}
            <div className="flex items-center justify-between p-3.5 rounded-xl bg-zinc-50 border border-zinc-100">
              <div>
                <p className="text-sm font-bold text-zinc-800">Active status</p>
                <p className="text-xs text-zinc-400 font-medium mt-0.5">
                  Decides if this brand is visible in filtering bars
                </p>
              </div>
              <button
                onClick={() => setBrandActive((a) => !a)}
                className="shrink-0 transition-colors"
              >
                {brandActive ? (
                  <ToggleRight className="h-8 w-8 text-emerald-500" />
                ) : (
                  <ToggleLeft className="h-8 w-8 text-zinc-300" />
                )}
              </button>
            </div>

            {/* Save details action */}
            <div className="flex justify-end pt-2">
              <button
                onClick={handleSaveBrandInfo}
                disabled={savingBrand}
                className="flex items-center gap-1.5 h-10 px-5 rounded-xl bg-zinc-950 text-white text-xs font-bold hover:bg-zinc-800 transition-colors disabled:opacity-60 shadow-sm"
              >
                {savingBrand ? (
                  <div className="h-3.5 w-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
                Save Info
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── CARD 2: Categories Assignments & Presentation Images ── */}
      <div className="bg-white border border-zinc-100 rounded-3xl p-6 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-100 pb-5">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-400">
              Category Assignments
            </h2>
            <p className="text-xs text-zinc-400 font-medium mt-1">
              Associate categories with this brand and upload presentation images for each assignment.
            </p>
          </div>

          {/* Add Category Assignment */}
          {unassigned.length > 0 && (
            <div className="flex items-center gap-2">
              <select
                value={assignCatId}
                onChange={(e) => setAssignCatId(e.target.value)}
                className="h-9 border-2 border-zinc-200 rounded-xl px-3 text-xs font-bold bg-white outline-none focus:border-black transition-colors"
              >
                <option value="">Link Category…</option>
                {unassigned.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <button
                onClick={handleAssignCategory}
                disabled={!assignCatId || assigning}
                className="flex items-center gap-1.5 h-9 px-4 rounded-xl bg-zinc-950 text-white text-xs font-bold hover:bg-zinc-800 transition-colors disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" /> Link
              </button>
            </div>
          )}
        </div>

        {/* Assigned list */}
        <div className="space-y-8">
          {/* Main Categories Section */}
          {mainBcs.length > 0 && (
            <div className="space-y-6">
              <div className="text-[11px] font-bold uppercase tracking-widest text-zinc-400 border-b border-zinc-100 pb-2">
                Main Categories
              </div>
              <div className="space-y-6 divide-y divide-zinc-100">
                {mainBcs.map((bc, idx) => renderBcItem(bc, idx))}
              </div>
            </div>
          )}

          {/* Other Categories Section */}
          {otherBcs.length > 0 && (
            <div className="space-y-6 pt-4">
              <div className="text-[11px] font-bold uppercase tracking-widest text-zinc-400 border-b border-zinc-100 pb-2">
                Other Categories
              </div>
              <div className="space-y-6 divide-y divide-zinc-100">
                {otherBcs.map((bc, idx) => renderBcItem(bc, idx))}
              </div>
            </div>
          )}

          {bcs.length === 0 && (
            <div className="bg-zinc-50 border border-dashed border-zinc-200 rounded-3xl p-8 text-center text-sm font-bold text-zinc-400">
              No categories linked to this brand yet. Select a category in the dropdown to assign.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
