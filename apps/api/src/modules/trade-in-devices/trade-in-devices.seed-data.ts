// Canonical "Other Search Devices" list — genuine gaps not already covered by a real
// DeviceCatalog entry. Shared by the standalone seed script (scripts/seed-trade-in-devices.ts)
// and the admin "Seed this only" action so both stay in sync with a single source of truth.
export interface TradeInDeviceSeed {
    name: string;
    brand: string;
    category: string;
}

export const DEFAULT_TRADE_IN_DEVICES: TradeInDeviceSeed[] = [
    // Phones
    // (iPhone 11–15 range removed — already real DeviceCatalog entries)
    { name: "Galaxy S24+",             brand: "Samsung",         category: "Phone" },
    { name: "Galaxy S23+",             brand: "Samsung",         category: "Phone" },
    { name: "Galaxy S22+",             brand: "Samsung",         category: "Phone" },
    { name: "Galaxy S21 Ultra",        brand: "Samsung",         category: "Phone" },
    { name: "Galaxy S21+",             brand: "Samsung",         category: "Phone" },
    { name: "Galaxy S21",              brand: "Samsung",         category: "Phone" },
    { name: "Galaxy A54",              brand: "Samsung",         category: "Phone" },
    { name: "Galaxy A34",              brand: "Samsung",         category: "Phone" },
    { name: "Galaxy Z Fold 5",         brand: "Samsung",         category: "Phone" },
    { name: "Galaxy Z Flip 5",         brand: "Samsung",         category: "Phone" },
    { name: "Pixel 7 Pro",             brand: "Google",          category: "Phone" },
    { name: "Pixel 6 Pro",             brand: "Google",          category: "Phone" },
    { name: "Pixel 6",                 brand: "Google",          category: "Phone" },
    { name: "OnePlus 12",              brand: "OnePlus",         category: "Phone" },
    { name: "OnePlus 10 Pro",          brand: "OnePlus",         category: "Phone" },
    { name: "Nothing Phone (2)",       brand: "Nothing",         category: "Phone" },
    { name: "Nothing Phone (1)",       brand: "Nothing",         category: "Phone" },
    { name: "Edge 50 Pro",             brand: "Motorola",        category: "Phone" },
    { name: "Edge 40 Pro",             brand: "Motorola",        category: "Phone" },
    { name: "Moto G84",                brand: "Motorola",        category: "Phone" },
    { name: "Redmi Note 13 Pro",       brand: "Xiaomi",          category: "Phone" },
    { name: "Redmi Note 13",           brand: "Xiaomi",          category: "Phone" },
    { name: "Redmi Note 12",           brand: "Xiaomi",          category: "Phone" },
    { name: "Redmi Note 11 Pro",       brand: "Xiaomi",          category: "Phone" },
    { name: "Redmi Note 10 Pro",       brand: "Xiaomi",          category: "Phone" },
    { name: "Redmi Note 10 5G",        brand: "Xiaomi",          category: "Phone" },
    { name: "Redmi Note 9S",           brand: "Xiaomi",          category: "Phone" },
    { name: "Xiaomi 13 Pro",           brand: "Xiaomi",          category: "Phone" },
    { name: "Xiaomi 13",               brand: "Xiaomi",          category: "Phone" },
    { name: "P60 Pro",                 brand: "Huawei",          category: "Phone" },
    { name: "P50 Pro",                 brand: "Huawei",          category: "Phone" },
    { name: "Mate 50 Pro",             brand: "Huawei",          category: "Phone" },
    { name: "Nokia G60 5G",            brand: "Nokia",           category: "Phone" },
    { name: "Nokia XR21",              brand: "Nokia",           category: "Phone" },
    { name: "Xperia 1 V",              brand: "Sony",            category: "Phone" },
    { name: "Xperia 5 V",              brand: "Sony",            category: "Phone" },
    { name: "Xperia 10 V",             brand: "Sony",            category: "Phone" },
    { name: "Find X6 Pro",             brand: "Oppo",            category: "Phone" },
    { name: "Reno 10 Pro",             brand: "Oppo",            category: "Phone" },
    { name: "Magic5 Pro",              brand: "Honor",           category: "Phone" },
    { name: "Fairphone 5",             brand: "Fairphone",       category: "Phone" },
    { name: "Fairphone 4",             brand: "Fairphone",       category: "Phone" },
    // Laptops
    // (MacBook Air/Pro M1–M3 range and ZenBook 14 OLED removed — already real DeviceCatalog entries)
    { name: "XPS 15 (2024)",           brand: "Dell",            category: "Laptop" },
    { name: "XPS 13 (2024)",           brand: "Dell",            category: "Laptop" },
    { name: "Inspiron 15",             brand: "Dell",            category: "Laptop" },
    { name: "ThinkPad X1 Carbon Gen 12", brand: "Lenovo",        category: "Laptop" },
    { name: "ThinkPad T14s Gen 5",     brand: "Lenovo",          category: "Laptop" },
    { name: "IdeaPad Slim 5",          brand: "Lenovo",          category: "Laptop" },
    { name: "Legion 5i Gen 9",         brand: "Lenovo",          category: "Laptop" },
    { name: "Spectre x360 14",         brand: "HP",              category: "Laptop" },
    { name: "EliteBook 840 G11",       brand: "HP",              category: "Laptop" },
    { name: "Pavilion 15",             brand: "HP",              category: "Laptop" },
    { name: "ROG Zephyrus G14 2024",   brand: "ASUS",            category: "Laptop" },
    { name: "Surface Pro 11",          brand: "Microsoft",       category: "Laptop" },
    { name: "Surface Pro 10",          brand: "Microsoft",       category: "Laptop" },
    { name: "Surface Laptop 5",        brand: "Microsoft",       category: "Laptop" },
    // Consoles
    // (Xbox One S/X, Series S/X, and PS4/PS4 Pro/PS4 Slim/PS5 Disc/PS5 Digital removed —
    // already real DeviceCatalog entries under "Microsoft"/"Sony" as "Xbox ..."/"PlayStation ...")
    { name: "PS3",                     brand: "Sony PlayStation", category: "Console" },
    { name: "Xbox 360",                brand: "Microsoft Xbox",  category: "Console" },
    { name: "Nintendo Switch OLED",    brand: "Nintendo",        category: "Console" },
    { name: "Nintendo Switch V2",      brand: "Nintendo",        category: "Console" },
    { name: "Nintendo Switch Lite",    brand: "Nintendo",        category: "Console" },
    // Tablets
    // (iPad 9th/10th Gen, iPad Air 5th Gen, iPad Pro 11 M2 removed — already real DeviceCatalog entries)
    { name: "iPad Pro 13 M4",          brand: "Apple",           category: "Tablet" },
    { name: "iPad Pro 11 M4",          brand: "Apple",           category: "Tablet" },
    { name: "iPad Air 13 M2",          brand: "Apple",           category: "Tablet" },
    { name: "iPad Air 11 M2",          brand: "Apple",           category: "Tablet" },
    { name: "iPad mini 7th Gen",       brand: "Apple",           category: "Tablet" },
    { name: "iPad Pro 13 M2",          brand: "Apple",           category: "Tablet" },
    { name: "Galaxy Tab S10 Ultra",    brand: "Samsung",         category: "Tablet" },
    { name: "Galaxy Tab S10+",         brand: "Samsung",         category: "Tablet" },
    { name: "Galaxy Tab S10",          brand: "Samsung",         category: "Tablet" },
    { name: "Galaxy Tab S9 Ultra",     brand: "Samsung",         category: "Tablet" },
    { name: "Galaxy Tab S9+",          brand: "Samsung",         category: "Tablet" },
    { name: "Galaxy Tab S9",           brand: "Samsung",         category: "Tablet" },
    // Smartwatches
    { name: "Apple Watch Ultra 2",     brand: "Apple",           category: "Smartwatch" },
    { name: "Apple Watch Series 9",    brand: "Apple",           category: "Smartwatch" },
    { name: "Apple Watch Series 8",    brand: "Apple",           category: "Smartwatch" },
    { name: "Apple Watch SE 2nd Gen",  brand: "Apple",           category: "Smartwatch" },
    { name: "Galaxy Watch 6 Classic",  brand: "Samsung",         category: "Smartwatch" },
    { name: "Galaxy Watch 6",          brand: "Samsung",         category: "Smartwatch" },
    { name: "Galaxy Watch 5 Pro",      brand: "Samsung",         category: "Smartwatch" },
    { name: "Fitbit Sense 2",          brand: "Fitbit",          category: "Smartwatch" },
    { name: "Fitbit Versa 4",          brand: "Fitbit",          category: "Smartwatch" },
    // Audio
    // (AirPods Max/Pro 2, WF-1000XM5, WH-1000XM4/5 removed — already real DeviceCatalog entries)
    { name: "AirPods Pro",             brand: "Apple",           category: "Audio" },
    { name: "AirPods 3rd Gen",         brand: "Apple",           category: "Audio" },
    { name: "QuietComfort Ultra",      brand: "Bose",            category: "Audio" },
    { name: "QuietComfort Earbuds II", brand: "Bose",            category: "Audio" },
];
