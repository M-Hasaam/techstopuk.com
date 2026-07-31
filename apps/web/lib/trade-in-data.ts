import Fuse from 'fuse.js';

export interface TradeInModel {
  name: string;
  category: string;
  brand: string;
  tradeInMode?: 'auto' | 'manual_price' | 'unpriced';
  /** Present only when this suggestion is a real, cataloged device — lets the
   *  picker route straight into that device's real trade-in flow instead of
   *  treating it as an unlisted/manual entry. */
  catalogId?: string;
  attributeOptions?: { label: string; options: string[] }[];
  storageOptions?: string[];
  /** Common abbreviations customers actually type (e.g. "ps5" for "PlayStation 5 ...")
   *  — fuzzy search alone doesn't bridge that gap against the full canonical name. */
  aliases?: string[];
}

// Devices NOT already in DeviceCatalog — every entry here should be a genuine gap
// (a brand/model the catalog doesn't carry yet), never a duplicate of a real catalog
// device. See "Other Search Devices" in admin catalog management before adding more.
export const TRADE_IN_MODELS: TradeInModel[] = [
  // ── Phones ──────────────────────────────────────────────────────────────
  { name: "Galaxy S24+",            category: "Phone", brand: "Samsung" },
  { name: "Galaxy S23+",            category: "Phone", brand: "Samsung" },
  { name: "Galaxy S22+",            category: "Phone", brand: "Samsung" },
  { name: "Galaxy S21 Ultra",       category: "Phone", brand: "Samsung" },
  { name: "Galaxy S21+",            category: "Phone", brand: "Samsung" },
  { name: "Galaxy S21",             category: "Phone", brand: "Samsung" },
  { name: "Galaxy A54",             category: "Phone", brand: "Samsung" },
  { name: "Galaxy A34",             category: "Phone", brand: "Samsung" },
  { name: "Galaxy Z Fold 5",        category: "Phone", brand: "Samsung" },
  { name: "Galaxy Z Flip 5",        category: "Phone", brand: "Samsung" },
  { name: "Pixel 7 Pro",            category: "Phone", brand: "Google" },
  { name: "Pixel 6 Pro",            category: "Phone", brand: "Google" },
  { name: "Pixel 6",                category: "Phone", brand: "Google" },
  { name: "OnePlus 12",             category: "Phone", brand: "OnePlus" },
  { name: "OnePlus 10 Pro",         category: "Phone", brand: "OnePlus" },
  { name: "Nothing Phone (2)",      category: "Phone", brand: "Nothing" },
  { name: "Nothing Phone (1)",      category: "Phone", brand: "Nothing" },
  { name: "Edge 50 Pro",            category: "Phone", brand: "Motorola" },
  { name: "Edge 40 Pro",            category: "Phone", brand: "Motorola" },
  { name: "Moto G84",               category: "Phone", brand: "Motorola" },
  { name: "Redmi Note 13 Pro",      category: "Phone", brand: "Xiaomi" },
  { name: "Redmi Note 13",          category: "Phone", brand: "Xiaomi" },
  { name: "Redmi Note 12",          category: "Phone", brand: "Xiaomi" },
  { name: "Redmi Note 11 Pro",      category: "Phone", brand: "Xiaomi" },
  { name: "Redmi Note 10 Pro",      category: "Phone", brand: "Xiaomi" },
  { name: "Redmi Note 10 5G",       category: "Phone", brand: "Xiaomi" },
  { name: "Redmi Note 9S",          category: "Phone", brand: "Xiaomi" },
  { name: "Xiaomi 13 Pro",          category: "Phone", brand: "Xiaomi" },
  { name: "Xiaomi 13",              category: "Phone", brand: "Xiaomi" },
  { name: "P60 Pro",                category: "Phone", brand: "Huawei" },
  { name: "P50 Pro",                category: "Phone", brand: "Huawei" },
  { name: "Mate 50 Pro",            category: "Phone", brand: "Huawei" },
  { name: "Nokia G60 5G",           category: "Phone", brand: "Nokia" },
  { name: "Nokia XR21",             category: "Phone", brand: "Nokia" },
  { name: "Xperia 1 V",             category: "Phone", brand: "Sony" },
  { name: "Xperia 5 V",             category: "Phone", brand: "Sony" },
  { name: "Xperia 10 V",            category: "Phone", brand: "Sony" },
  { name: "Find X6 Pro",            category: "Phone", brand: "Oppo" },
  { name: "Reno 10 Pro",            category: "Phone", brand: "Oppo" },
  { name: "Magic5 Pro",             category: "Phone", brand: "Honor" },
  { name: "Fairphone 5",            category: "Phone", brand: "Fairphone" },
  { name: "Fairphone 4",            category: "Phone", brand: "Fairphone" },
  // ── Laptops ─────────────────────────────────────────────────────────────
  { name: "XPS 15 (2024)",          category: "Laptop", brand: "Dell" },
  { name: "XPS 13 (2024)",          category: "Laptop", brand: "Dell" },
  { name: "Inspiron 15",            category: "Laptop", brand: "Dell" },
  { name: "ThinkPad X1 Carbon Gen 12", category: "Laptop", brand: "Lenovo" },
  { name: "ThinkPad T14s Gen 5",    category: "Laptop", brand: "Lenovo" },
  { name: "IdeaPad Slim 5",         category: "Laptop", brand: "Lenovo" },
  { name: "Legion 5i Gen 9",        category: "Laptop", brand: "Lenovo" },
  { name: "Spectre x360 14",        category: "Laptop", brand: "HP" },
  { name: "EliteBook 840 G11",      category: "Laptop", brand: "HP" },
  { name: "Pavilion 15",            category: "Laptop", brand: "HP" },
  { name: "ROG Zephyrus G14 2024",  category: "Laptop", brand: "ASUS" },
  { name: "Surface Pro 11",         category: "Laptop", brand: "Microsoft" },
  { name: "Surface Pro 10",         category: "Laptop", brand: "Microsoft" },
  { name: "Surface Laptop 5",       category: "Laptop", brand: "Microsoft" },
  // ── Consoles ────────────────────────────────────────────────────────────
  // Every PlayStation/Xbox generation except the two below is already a real
  // DeviceCatalog entry (under "Sony"/"Microsoft", not "Sony PlayStation"/"Microsoft
  // Xbox") — this list only needs to fill the genuine gaps: the original PS3 ("Fat",
  // pre-Slim) and original Xbox 360 (pre-"S" slim revision) were never added to the
  // catalog, so they'd otherwise have no searchable entry at all.
  { name: "PS3",                    category: "Console", brand: "Sony PlayStation" },
  { name: "Xbox 360",               category: "Console", brand: "Microsoft Xbox" },
  { name: "Nintendo Switch OLED",   category: "Console", brand: "Nintendo" },
  { name: "Nintendo Switch (V2)",   category: "Console", brand: "Nintendo" },
  { name: "Nintendo Switch Lite",   category: "Console", brand: "Nintendo" },
  // ── Tablets ─────────────────────────────────────────────────────────────
  { name: 'iPad Pro 13" M4',        category: "Tablet", brand: "Apple" },
  { name: 'iPad Pro 11" M4',        category: "Tablet", brand: "Apple" },
  { name: 'iPad Air 13" M2',        category: "Tablet", brand: "Apple" },
  { name: 'iPad Air 11" M2',        category: "Tablet", brand: "Apple" },
  { name: "iPad mini 7th Gen",      category: "Tablet", brand: "Apple" },
  { name: 'iPad Pro 13" M2',        category: "Tablet", brand: "Apple" },
  { name: "Galaxy Tab S10 Ultra",   category: "Tablet", brand: "Samsung" },
  { name: "Galaxy Tab S10+",        category: "Tablet", brand: "Samsung" },
  { name: "Galaxy Tab S10",         category: "Tablet", brand: "Samsung" },
  { name: "Galaxy Tab S9 Ultra",    category: "Tablet", brand: "Samsung" },
  { name: "Galaxy Tab S9+",         category: "Tablet", brand: "Samsung" },
  { name: "Galaxy Tab S9",          category: "Tablet", brand: "Samsung" },
  // ── Smartwatches ────────────────────────────────────────────────────────
  { name: "Apple Watch Ultra 2",    category: "Smartwatch", brand: "Apple" },
  { name: "Apple Watch Series 9",   category: "Smartwatch", brand: "Apple" },
  { name: "Apple Watch Series 8",   category: "Smartwatch", brand: "Apple" },
  { name: "Apple Watch SE 2nd Gen", category: "Smartwatch", brand: "Apple" },
  { name: "Galaxy Watch 6 Classic", category: "Smartwatch", brand: "Samsung" },
  { name: "Galaxy Watch 6",         category: "Smartwatch", brand: "Samsung" },
  { name: "Galaxy Watch 5 Pro",     category: "Smartwatch", brand: "Samsung" },
  { name: "Fitbit Sense 2",         category: "Smartwatch", brand: "Fitbit" },
  { name: "Fitbit Versa 4",         category: "Smartwatch", brand: "Fitbit" },
  // ── Audio ────────────────────────────────────────────────────────────────
  { name: "AirPods Pro",            category: "Audio", brand: "Apple" },
  { name: "AirPods 3rd Gen",        category: "Audio", brand: "Apple" },
  { name: "QuietComfort Ultra",     category: "Audio", brand: "Bose" },
  { name: "QuietComfort Earbuds II",category: "Audio", brand: "Bose" },
];

export const TRADE_IN_MODELS_FUSE = new Fuse(TRADE_IN_MODELS, {
  keys: [
    { name: 'name',     weight: 0.7 },  // model name (primary)
    { name: 'brand',    weight: 0.25 }, // brand — "samsung" matches Galaxy models
    { name: 'category', weight: 0.05 }, // category — "phone" / "laptop" shows results
  ],
  threshold: 0.4,
  ignoreLocation: true,
});
