"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  otherBrandsApi, otherSubcategoriesApi, productsApi,
  type OtherBrand, type OtherSubcategory, type Product,
} from "../../../../lib/api";
import { ArrowLeft, ChevronRight, Package, Plus } from "lucide-react";
import { IconPicker, ADMIN_ICON_MAP } from "../../../../components/IconPicker";

export default function OtherProductsLinksPage() {
  const [subcats, setSubcats]             = useState<OtherSubcategory[]>([]);
  const [brands, setBrands]               = useState<OtherBrand[]>([]);
  const [products, setProducts]           = useState<Product[]>([]);
  const [activeSubcatId, setActiveSubcatId] = useState<string>("");
  const [expandedBrandId, setExpandedBrandId] = useState<string | null>(null);
  const [loading, setLoading]             = useState(true);
  
  // Edit / Add Subcategory Form State
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [subcatForm, setSubcatForm]       = useState<{ name: string; icon: string }>({ name: "", icon: "package" });
  const [savingSubcat, setSavingSubcat]   = useState(false);
  const [subcatError, setSubcatError]     = useState("");

  const reloadSubcats = async () => {
    const list = await otherSubcategoriesApi.list();
    setSubcats(list);
    return list;
  };

  useEffect(() => {
    Promise.all([
      otherSubcategoriesApi.list(),
      otherBrandsApi.list(),
      productsApi.list({ limit: 500 }),
    ]).then(([subcatList, brandList, productRes]) => {
      setSubcats(subcatList);
      setBrands(brandList);
      setProducts(productRes.items.filter(p => !!p.otherBrandId));
      if (subcatList.length > 0) {
        setActiveSubcatId(subcatList[0].id);
        setSubcatForm({ name: subcatList[0].name, icon: subcatList[0].icon ?? "package" });
      }
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const activeSubcat  = subcats.find(s => s.id === activeSubcatId);
  const subcatProducts = products.filter(p => p.otherSubcategoryId === activeSubcatId);

  // Sync form when active subcategory changes (unless creating new)
  useEffect(() => {
    if (activeSubcat && !isCreatingNew) {
      setSubcatForm({ name: activeSubcat.name, icon: activeSubcat.icon ?? "package" });
      setSubcatError("");
    }
  }, [activeSubcatId, activeSubcat, isCreatingNew]);

  const brandGroups = brands
    .map(brand => ({ brand, items: subcatProducts.filter(p => p.otherBrandId === brand.id) }))
    .filter(g => g.items.length > 0);

  const countFor = (id: string) => products.filter(p => p.otherSubcategoryId === id).length;

  function startCreateSubcat() {
    setIsCreatingNew(true);
    setSubcatForm({ name: "", icon: "package" });
    setSubcatError("");
  }

  function cancelCreate() {
    setIsCreatingNew(false);
    if (activeSubcat) {
      setSubcatForm({ name: activeSubcat.name, icon: activeSubcat.icon ?? "package" });
    }
    setSubcatError("");
  }

  async function handleSaveSubcat(updatedIcon?: string) {
    const nameToSave = subcatForm.name.trim();
    if (!nameToSave && !isCreatingNew && activeSubcat) {
      setSubcatForm(f => ({ ...f, name: activeSubcat.name }));
    }
    const targetName = nameToSave || activeSubcat?.name || "";
    if (!targetName) return;

    const targetIcon = updatedIcon ?? subcatForm.icon;

    setSavingSubcat(true);
    setSubcatError("");
    try {
      if (isCreatingNew) {
        const created = await otherSubcategoriesApi.create({ name: targetName, icon: targetIcon });
        await reloadSubcats();
        setIsCreatingNew(false);
        setActiveSubcatId(created.id);
      } else if (activeSubcat) {
        await otherSubcategoriesApi.update(activeSubcat.id, { name: targetName, icon: targetIcon });
        await reloadSubcats();
      }
    } catch (err: any) {
      setSubcatError(err.message || "Failed to save subcategory");
    } finally {
      setSavingSubcat(false);
    }
  }

  const handleIconChange = (newIcon: string) => {
    setSubcatForm(f => ({ ...f, icon: newIcon }));
    if (!isCreatingNew && activeSubcat) {
      handleSaveSubcat(newIcon);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="h-8 w-8 border-4 border-zinc-200 border-t-black rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <Link href="/catalog-mgmt/links"
            className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-700 font-bold mb-2 transition-colors">
            <ArrowLeft className="h-3 w-3" /> Back to Links
          </Link>
          <h1 className="text-3xl font-extrabold text-zinc-900 tracking-tight">Other Products</h1>
          <p className="text-xs text-zinc-400 font-medium mt-1">
            Browse subcategories, set category icons, and manage brands in the Others track.
          </p>
        </div>
        <button
          onClick={startCreateSubcat}
          className="flex items-center gap-2 h-9 px-4 rounded-xl bg-zinc-950 text-white text-xs font-bold hover:bg-zinc-800 self-start sm:self-auto shrink-0"
        >
          <Plus className="h-3.5 w-3.5" /> Add Subcategory
        </button>
      </div>

      {/* Top Edit Subcategory Form (Automatically synced with selected subcategory) */}
      {(activeSubcat || isCreatingNew) && (
        <div className="bg-white border border-zinc-200 rounded-3xl p-5 mb-8 shadow-sm">
          <h3 className="font-extrabold text-sm mb-4 text-zinc-900">
            {isCreatingNew ? "New Subcategory" : `Edit Subcategory (${activeSubcat?.name})`}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 block mb-1.5">
                Subcategory Name
              </label>
              <input
                type="text"
                value={subcatForm.name}
                onChange={e => setSubcatForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Storage, Chargers, Audio"
                className="w-full h-[52px] border border-zinc-200 rounded-2xl px-4 text-sm font-semibold text-zinc-900 focus:outline-none focus:border-zinc-400 bg-white"
              />
            </div>
            <div>
              <IconPicker
                value={subcatForm.icon}
                onChange={handleIconChange}
                label="Choose Icon"
              />
            </div>
          </div>
          {subcatError && <p className="text-xs text-red-500 mb-3">{subcatError}</p>}
          <div className="flex gap-2">
            <button
              onClick={() => handleSaveSubcat()}
              disabled={savingSubcat}
              className="h-8 px-4 rounded-xl bg-zinc-950 text-white text-xs font-bold disabled:opacity-50"
            >
              {savingSubcat ? "Saving…" : "Save Subcategory"}
            </button>
            {isCreatingNew && (
              <button
                onClick={cancelCreate}
                className="h-8 px-4 rounded-xl border border-zinc-200 text-xs font-bold text-zinc-600 hover:bg-zinc-50"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Left sidebar: subcategories */}
        <div className="md:col-span-1 space-y-2">
          <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 px-3 mb-1">
            Subcategories
          </div>
          <div className="bg-white border border-zinc-100 rounded-3xl p-3 shadow-sm space-y-1">
            {subcats.map(s => {
              const active = s.id === activeSubcatId && !isCreatingNew;
              const SubIcon = ADMIN_ICON_MAP[s.icon ?? "package"] ?? Package;
              return (
                <button
                  key={s.id}
                  onClick={() => {
                    setIsCreatingNew(false);
                    setActiveSubcatId(s.id);
                    setExpandedBrandId(null);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left text-sm font-bold transition-all ${
                    active ? "bg-zinc-950 text-white shadow-sm" : "text-zinc-600 hover:bg-zinc-50 hover:text-black"
                  }`}
                >
                  <div className="flex items-center gap-2.5 truncate min-w-0 pr-2">
                    <SubIcon className={`h-4 w-4 shrink-0 ${active ? "text-white" : "text-zinc-400"}`} />
                    <span className="truncate">{s.name}</span>
                  </div>
                  <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded-md shrink-0 ${
                    active ? "bg-white/20 text-white" : "bg-zinc-100 text-zinc-400"
                  }`}>
                    {countFor(s.id)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right panel */}
        <div className="md:col-span-3 space-y-4">
          {activeSubcat ? (
            <>
              {/* Header card without redundant Edit Subcategory button */}
              <div className="bg-white border border-zinc-100 rounded-3xl p-6 shadow-sm">
                <div className="flex items-center gap-2.5">
                  {(() => {
                    const SubIcon = ADMIN_ICON_MAP[activeSubcat.icon ?? "package"] ?? Package;
                    return (
                      <div className="h-9 w-9 rounded-2xl bg-zinc-100 flex items-center justify-center text-zinc-700 shrink-0">
                        <SubIcon className="h-4.5 w-4.5" />
                      </div>
                    );
                  })()}
                  <h2 className="text-xl font-extrabold text-zinc-900">{activeSubcat.name}</h2>
                </div>
                <p className="text-xs text-zinc-400 font-medium mt-1">
                  {brandGroups.length} brand{brandGroups.length !== 1 ? "s" : ""} · {subcatProducts.length} product{subcatProducts.length !== 1 ? "s" : ""}
                </p>
              </div>

              {brandGroups.length === 0 ? (
                <div className="bg-white border border-zinc-100 rounded-3xl p-12 text-center text-zinc-400 font-bold shadow-sm">
                  <Package className="h-8 w-8 mx-auto mb-3 opacity-30" />
                  No products in this subcategory yet.
                </div>
              ) : (
                brandGroups.map(({ brand, items }) => (
                  <div key={brand.id} className="bg-white border border-zinc-100 rounded-3xl shadow-sm overflow-hidden">
                    <button
                      onClick={() => setExpandedBrandId(prev => prev === brand.id ? null : brand.id)}
                      className="w-full flex items-center justify-between px-6 py-4 hover:bg-zinc-50/50 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-xl bg-zinc-100 flex items-center justify-center text-xs font-black text-zinc-500 shrink-0">
                          {brand.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-extrabold text-zinc-900">{brand.name}</span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-500">
                          {items.length} product{items.length !== 1 ? "s" : ""}
                        </span>
                      </div>
                      <ChevronRight className={`h-4 w-4 text-zinc-400 transition-transform duration-200 ${expandedBrandId === brand.id ? "rotate-90" : ""}`} />
                    </button>

                    {expandedBrandId === brand.id && (
                      <div className="border-t border-zinc-100 overflow-x-auto">
                        <table className="w-full text-sm min-w-[500px]">
                          <thead>
                            <tr className="border-b border-zinc-50 bg-zinc-50/50">
                              <th className="text-left px-6 py-3 text-[10px] font-bold uppercase tracking-widest text-zinc-400">Product</th>
                              <th className="text-right px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-zinc-400">Price</th>
                              <th className="text-right px-6 py-3 text-[10px] font-bold uppercase tracking-widest text-zinc-400">Stock</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-50">
                            {items.map(p => (
                              <tr key={p.id}
                                onClick={() => window.location.href = `/products/${p.id}`}
                                className="hover:bg-zinc-50/50 transition-colors cursor-pointer">
                                <td className="px-6 py-3">
                                  <div className="flex items-center gap-3">
                                    {p.images?.[0] ? (
                                      <img src={p.images[0]} alt={p.name}
                                        className="h-9 w-9 rounded-xl object-cover border border-zinc-100 shrink-0" />
                                    ) : (
                                      <div className="h-9 w-9 rounded-xl bg-zinc-100 flex items-center justify-center shrink-0">
                                        <Package className="h-3.5 w-3.5 text-zinc-300" />
                                      </div>
                                    )}
                                    <span className="font-medium text-zinc-800 text-xs">{p.name}</span>
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-right font-bold font-mono text-zinc-900 text-xs">
                                  £{p.price}
                                </td>
                                <td className="px-6 py-3 text-right font-semibold text-zinc-500 text-xs">
                                  {p.stock}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ))
              )}
            </>
          ) : (
            <div className="bg-white border border-zinc-100 rounded-3xl p-12 text-center text-zinc-400 font-bold shadow-sm">
              Select a subcategory on the left.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
