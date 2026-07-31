"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  catalogCategoriesApi,
  catalogBrandsApi,
  catalogBrandCategoryApi,
  otherSubcategoriesApi,
  otherBrandsApi,
  tradeInDevicesApi,
  type CatalogCategoryItem,
  type CatalogBrandItem,
  type BrandCategoryOption,
  type OtherSubcategory,
  type OtherBrand,
  type TradeInDeviceItem,
} from "../../lib/api";
import {
  Tag,
  Layers,
  Grid3X3,
  Plus,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  Sparkles,
  Package,
  Search,
} from "lucide-react";

export default function CatalogMgmtPage() {
  const [categories, setCategories]       = useState<CatalogCategoryItem[]>([]);
  const [brands, setBrands]               = useState<CatalogBrandItem[]>([]);
  const [bcs, setBcs]                     = useState<BrandCategoryOption[]>([]);
  const [otherSubcats, setOtherSubcats]   = useState<OtherSubcategory[]>([]);
  const [otherBrandList, setOtherBrandList] = useState<OtherBrand[]>([]);
  const [searchDevices, setSearchDevices] = useState<TradeInDeviceItem[]>([]);
  const [loading, setLoading]             = useState(true);

  useEffect(() => {
    Promise.all([
      catalogCategoriesApi.list(true),
      catalogBrandsApi.list(true),
      catalogBrandCategoryApi.list({ includeInactive: true }),
      otherSubcategoriesApi.list(),
      otherBrandsApi.list(),
      tradeInDevicesApi.list(true),
    ])
      .then(([cats, brandList, bcList, subcats, oBrands, devices]) => {
        setCategories(cats);
        setBrands(brandList);
        setBcs(bcList);
        setOtherSubcats(subcats);
        setOtherBrandList(oBrands);
        setSearchDevices(devices);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-8 animate-pulse">
        <div className="h-8 w-48 bg-zinc-200 rounded-lg" />
        <div className="h-4 w-96 bg-zinc-200 rounded-lg" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div className="h-48 bg-white border border-zinc-100 rounded-3xl animate-pulse" />
          <div className="h-48 bg-white border border-zinc-100 rounded-3xl animate-pulse" />
          <div className="h-48 bg-white border border-zinc-100 rounded-3xl animate-pulse" />
        </div>
      </div>
    );
  }

  // Calculate statistics
  const activeBrandsCount = brands.filter(b => b.isActive).length;
  const inactiveBrandsCount = brands.length - activeBrandsCount;

  const linksCount = bcs.length;
  const linksWithoutImages = bcs.filter(bc => bc.images.length === 0);
  const linksWithImagesCount = linksCount - linksWithoutImages.length;
  const completionPercent = linksCount > 0 ? Math.round((linksWithImagesCount / linksCount) * 100) : 100;

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-extrabold text-zinc-900 tracking-tight flex items-center gap-2">
          Catalog Management
          <Sparkles className="h-6 w-6 text-accent animate-pulse" />
        </h1>
        <p className="text-sm text-zinc-400 font-medium mt-1">
          Manage product categories, brands, and their marketing image representations.
        </p>
      </div>

      {/* Main Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Categories Card */}
        <Link 
          href="/catalog-mgmt/categories"
          className="group relative bg-white border border-zinc-100 rounded-3xl p-6 shadow-sm hover:border-zinc-300 hover:shadow-md transition-all duration-300 flex flex-col justify-between min-h-[200px]"
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="p-3 bg-zinc-50 rounded-2xl group-hover:bg-accent/10 transition-colors">
                <Tag className="h-5 w-5 text-zinc-400 group-hover:text-accent transition-colors" />
              </div>
              <ArrowRight className="h-4 w-4 text-zinc-300 group-hover:text-zinc-900 group-hover:translate-x-1 transition-all" />
            </div>
            <div>
              <div className="text-4xl font-black text-zinc-900">{categories.length}</div>
              <div className="font-bold text-zinc-700 text-sm mt-1">Categories</div>
              <p className="text-xs text-zinc-400 mt-1 font-medium">Device class segments for organization</p>
            </div>
          </div>

          {/* Quick list preview */}
          <div className="flex flex-wrap gap-1 mt-4 pt-4 border-t border-zinc-50">
            {categories.slice(0, 4).map(cat => (
              <span 
                key={cat.id} 
                className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-50 text-zinc-600 border border-zinc-100 group-hover:border-zinc-200 transition-colors"
              >
                {cat.name}
              </span>
            ))}
            {categories.length > 4 && (
              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-accent/5 text-accent border border-accent/10">
                +{categories.length - 4} more
              </span>
            )}
          </div>
        </Link>

        {/* Brands Card */}
        <Link 
          href="/catalog-mgmt/brands"
          className="group relative bg-white border border-zinc-100 rounded-3xl p-6 shadow-sm hover:border-zinc-300 hover:shadow-md transition-all duration-300 flex flex-col justify-between min-h-[200px]"
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="p-3 bg-zinc-50 rounded-2xl group-hover:bg-accent/10 transition-colors">
                <Layers className="h-5 w-5 text-zinc-400 group-hover:text-accent transition-colors" />
              </div>
              <ArrowRight className="h-4 w-4 text-zinc-300 group-hover:text-zinc-900 group-hover:translate-x-1 transition-all" />
            </div>
            <div>
              <div className="text-4xl font-black text-zinc-900">{brands.length}</div>
              <div className="font-bold text-zinc-700 text-sm mt-1">Brands</div>
              <p className="text-xs text-zinc-400 mt-1 font-medium">
                {activeBrandsCount} active • {inactiveBrandsCount} inactive
              </p>
            </div>
          </div>

          {/* Brands logo preview */}
          <div className="flex items-center gap-1 mt-4 pt-4 border-t border-zinc-50 overflow-hidden">
            {brands.slice(0, 5).map(brand => (
              <div 
                key={brand.id} 
                className="h-6 w-6 rounded-full border border-zinc-100 bg-zinc-50 flex items-center justify-center p-0.5 shrink-0 overflow-hidden"
                title={brand.name}
              >
                {brand.logo ? (
                  <img src={brand.logo} alt="" className="h-full w-full object-contain" />
                ) : (
                  <span className="text-[9px] font-bold text-zinc-500">
                    {brand.name.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
            ))}
            {brands.length > 5 && (
              <span className="text-[9px] font-extrabold text-zinc-400 ml-1">
                +{brands.length - 5}
              </span>
            )}
          </div>
        </Link>

        {/* Links Card */}
        <Link 
          href="/catalog-mgmt/links"
          className="group relative bg-white border border-zinc-100 rounded-3xl p-6 shadow-sm hover:border-zinc-300 hover:shadow-md transition-all duration-300 flex flex-col justify-between min-h-[200px]"
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="p-3 bg-zinc-50 rounded-2xl group-hover:bg-accent/10 transition-colors">
                <Grid3X3 className="h-5 w-5 text-zinc-400 group-hover:text-accent transition-colors" />
              </div>
              <ArrowRight className="h-4 w-4 text-zinc-300 group-hover:text-zinc-900 group-hover:translate-x-1 transition-all" />
            </div>
            <div>
              <div className="text-4xl font-black text-zinc-900">{bcs.length}</div>
              <div className="font-bold text-zinc-700 text-sm mt-1">Brand–Category Links</div>
              <div className="flex items-center gap-1.5 mt-1.5">
                <div className="w-full bg-zinc-100 h-1.5 rounded-full overflow-hidden">
                  <div 
                    className="bg-accent h-full rounded-full transition-all duration-500" 
                    style={{ width: `${completionPercent}%` }}
                  />
                </div>
                <span className="text-[10px] font-bold text-zinc-500 shrink-0">{completionPercent}%</span>
              </div>
            </div>
          </div>

          {/* Alerts preview */}
          <div className="mt-4 pt-4 border-t border-zinc-50 flex items-center justify-between">
            {linksWithoutImages.length > 0 ? (
              <span className="flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-100 animate-pulse">
                <AlertTriangle className="h-3 w-3" /> {linksWithoutImages.length} need images
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">
                <CheckCircle2 className="h-3 w-3" /> All links complete
              </span>
            )}
            <span className="text-[10px] text-zinc-400 font-medium">Images per link</span>
          </div>
        </Link>

        {/* Other Products Card */}
        <Link
          href="/catalog-mgmt/links/others"
          className="group relative bg-white border border-zinc-100 rounded-3xl p-6 shadow-sm hover:border-zinc-300 hover:shadow-md transition-all duration-300 flex flex-col justify-between min-h-[200px]"
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="p-3 bg-zinc-50 rounded-2xl group-hover:bg-accent/10 transition-colors">
                <Package className="h-5 w-5 text-zinc-400 group-hover:text-accent transition-colors" />
              </div>
              <ArrowRight className="h-4 w-4 text-zinc-300 group-hover:text-zinc-900 group-hover:translate-x-1 transition-all" />
            </div>
            <div>
              <div className="text-4xl font-black text-zinc-900">{otherSubcats.length}</div>
              <div className="font-bold text-zinc-700 text-sm mt-1">Other Products</div>
              <p className="text-xs text-zinc-400 mt-1 font-medium">
                {otherBrandList.length} brand{otherBrandList.length !== 1 ? "s" : ""} across {otherSubcats.length} subcategor{otherSubcats.length !== 1 ? "ies" : "y"}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-1 mt-4 pt-4 border-t border-zinc-50">
            {otherSubcats.slice(0, 4).map(s => (
              <span
                key={s.id}
                className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-50 text-zinc-600 border border-zinc-100 group-hover:border-zinc-200 transition-colors"
              >
                {s.name}
              </span>
            ))}
            {otherSubcats.length > 4 && (
              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-accent/5 text-accent border border-accent/10">
                +{otherSubcats.length - 4} more
              </span>
            )}
          </div>
        </Link>
        {/* Search Devices Card */}
        <Link
          href="/catalog-mgmt/search-devices"
          className="group relative bg-white border border-zinc-100 rounded-3xl p-6 shadow-sm hover:border-zinc-300 hover:shadow-md transition-all duration-300 flex flex-col justify-between min-h-[200px]"
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="p-3 bg-zinc-50 rounded-2xl group-hover:bg-accent/10 transition-colors">
                <Search className="h-5 w-5 text-zinc-400 group-hover:text-accent transition-colors" />
              </div>
              <ArrowRight className="h-4 w-4 text-zinc-300 group-hover:text-zinc-900 group-hover:translate-x-1 transition-all" />
            </div>
            <div>
              <div className="text-4xl font-black text-zinc-900">{searchDevices.length}</div>
              <div className="font-bold text-zinc-700 text-sm mt-1">Other Search Devices</div>
              <p className="text-xs text-zinc-400 mt-1 font-medium">
                {searchDevices.filter(d => d.isActive).length} active · devices not yet in the catalog, shown as manual-quote fallbacks in the search bar
              </p>
            </div>
          </div>

          {/* Category breakdown preview */}
          <div className="flex flex-wrap gap-1 mt-4 pt-4 border-t border-zinc-50">
            {Array.from(new Set(searchDevices.map(d => d.category))).slice(0, 4).map(cat => (
              <span
                key={cat}
                className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-50 text-zinc-600 border border-zinc-100 group-hover:border-zinc-200 transition-colors"
              >
                {cat}
              </span>
            ))}
            {new Set(searchDevices.map(d => d.category)).size > 4 && (
              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-accent/5 text-accent border border-accent/10">
                +{new Set(searchDevices.map(d => d.category)).size - 4} more
              </span>
            )}
          </div>
        </Link>
      </div>

      {/* Quick Action Operations Dashboard */}
      <div className="bg-white border border-zinc-100 rounded-3xl p-6 shadow-sm space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-400">
          Quick Catalog Actions
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          <Link
            href="/catalog-mgmt/search-devices"
            className="flex items-center gap-3 p-3 rounded-2xl border border-zinc-100 hover:border-zinc-300 hover:bg-zinc-50/50 transition-all font-bold text-xs text-zinc-700 hover:text-black group"
          >
            <div className="h-8 w-8 rounded-xl bg-zinc-50 flex items-center justify-center text-zinc-400 group-hover:text-black group-hover:bg-zinc-100 transition-colors shrink-0">
              <Search className="h-4 w-4" />
            </div>
            Manage Other Search Devices
          </Link>
          <Link
            href="/catalog-mgmt/brands?create=true"
            className="flex items-center gap-3 p-3 rounded-2xl border border-zinc-100 hover:border-zinc-300 hover:bg-zinc-50/50 transition-all font-bold text-xs text-zinc-700 hover:text-black group animate-fade-in"
          >
            <div className="h-8 w-8 rounded-xl bg-zinc-50 flex items-center justify-center text-zinc-400 group-hover:text-black group-hover:bg-zinc-100 transition-colors shrink-0">
              <Plus className="h-4 w-4" />
            </div>
            Create New Brand
          </Link>
          <Link 
            href="/catalog-mgmt/links"
            className="flex items-center gap-3 p-3 rounded-2xl border border-zinc-100 hover:border-zinc-300 hover:bg-zinc-50/50 transition-all font-bold text-xs text-zinc-700 hover:text-black group"
          >
            <div className="h-8 w-8 rounded-xl bg-zinc-50 flex items-center justify-center text-zinc-400 group-hover:text-black group-hover:bg-zinc-100 transition-colors shrink-0">
              <Grid3X3 className="h-4 w-4" />
            </div>
            Manage Presentation Images
          </Link>
          {linksWithoutImages.length > 0 && (
            <Link 
              href="/catalog-mgmt/links"
              className="flex items-center gap-3 p-3 rounded-2xl border border-amber-100 hover:border-amber-300 bg-amber-50/20 hover:bg-amber-50/40 transition-all font-bold text-xs text-amber-700 group"
            >
              <div className="h-8 w-8 rounded-xl bg-amber-50 flex items-center justify-center text-amber-500 group-hover:bg-amber-100 transition-colors shrink-0">
                <AlertTriangle className="h-4 w-4 animate-bounce" />
              </div>
              Fix {linksWithoutImages.length} Image Alerts
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
