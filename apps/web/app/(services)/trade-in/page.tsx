"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import Fuse from "fuse.js";
import { tradeInsApi, storesApi, uploadsApi, catalogApi, productsApi, authApi, type Store, type CatalogCategory, type Product } from "@/lib/api";
import DeviceSearchBox from "@/components/DeviceSearchBox";
import CameraCaptureModal from "@/components/CameraCaptureModal";
import AccordionGallery from "@/components/AccordionGallery";
import {
  Smartphone, Tablet, Gamepad2, Laptop, ArrowLeft, ArrowRight,
  Check, ChevronRight, MapPin, Zap, Shield, Clock,
  Star, CheckCircle2, Truck, Gift, RefreshCw,
  Search, ChevronDown, Sparkles, HelpCircle, Watch, Headphones,
  Upload, X, Plus, Package, Loader2, UserCircle, Camera
} from "lucide-react";
import Footer from "@/components/Footer";
import { useAuth } from "@/context/auth-context";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3002";

function GoogleIcon() {
  return (
    <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

// ─── Data ──────────────────────────────────────────────────────────────────

// Visual metadata keyed by category slug — the list itself comes from the API
const CAT_METADATA: Record<string, {
  oldId: string; Icon: React.ElementType;
  img: string; mood: string; moodIcon: string; glow: string; sub: string;
}> = {
  phones:      { oldId: "Phone",      Icon: Smartphone, img: "/phones/samsung/bento_smartphones.png",             mood: "bg-sky-500/10 border-sky-500/20",     moodIcon: "text-sky-500",     glow: "hover:shadow-sky-500/10",     sub: "iPhone, Galaxy, Pixel, OnePlus"         },
  tablets:     { oldId: "Tablet",     Icon: Tablet,     img: "/tablets/ipad/showcase_ipad_pro.png",               mood: "bg-rose-500/10 border-rose-500/20",   moodIcon: "text-rose-500",    glow: "hover:shadow-rose-500/10",    sub: "iPad, Galaxy Tab, Surface Pro"          },
  gaming:      { oldId: "Console",    Icon: Gamepad2,   img: "/consoles/showcase_ps5.png",                        mood: "bg-violet-500/10 border-violet-500/20",moodIcon: "text-violet-500",  glow: "hover:shadow-violet-500/10",  sub: "PS5, Xbox Series, Switch"               },
  laptops:     { oldId: "Laptop",     Icon: Laptop,     img: "/laptops/MacBook/showcase_macbook.png",             mood: "bg-amber-500/10 border-amber-500/20",  moodIcon: "text-amber-600",   glow: "hover:shadow-amber-500/10",   sub: "MacBook, XPS, ThinkPad"                 },
  audio:       { oldId: "Audio",      Icon: Headphones, img: "/audio/bento_audio.png",                            mood: "bg-indigo-500/10 border-indigo-500/20",moodIcon: "text-indigo-500",  glow: "hover:shadow-indigo-500/10",  sub: "AirPods, Sony, Bose"                    },
  smartwatches:{ oldId: "Smartwatch", Icon: Watch,      img: "/Other/watch/galaxy_watch_promo_1778927696615.png", mood: "bg-emerald-500/10 border-emerald-500/20",moodIcon:"text-emerald-500", glow: "hover:shadow-emerald-500/10", sub: "Apple Watch, Galaxy Watch, Fitbit"       },
};

// Maps product.category (DB name) → wizard category ID used by SPECS / CONDITION_QUESTIONS
const CAT_NAME_TO_WIZARD_ID: Record<string, string> = {
  Phones: "Phone", Tablets: "Tablet", Gaming: "Console",
  Laptops: "Laptop", Audio: "Audio", Smartwatches: "Smartwatch",
};
const CAT_NAME_MOOD: Record<string, string> = {
  Phones: "bg-sky-500/10", Tablets: "bg-rose-500/10",
  Gaming: "bg-violet-500/10", Laptops: "bg-amber-500/10",
  Audio: "bg-indigo-500/10", Smartwatches: "bg-emerald-500/10",
};

// The "Other Search Devices" list uses different brand strings for the same real
// brand than DeviceCatalog does ("Sony PlayStation" vs "Sony", "Microsoft Xbox" vs
// "Microsoft") — without normalizing, merging the two sources shows the same brand
// twice as separate buttons, and picking one wouldn't pull in the other's models.
const BRAND_ALIAS: Record<string, string> = {
  "sony playstation": "Sony",
  "microsoft xbox": "Microsoft",
};
function normBrand(b: string): string {
  return BRAND_ALIAS[b.toLowerCase().trim()] ?? b;
}

const SPECS: Record<string, { label: string; options: string[] }[]> = {
  Phone: [
    { label: "Storage", options: ["64 GB", "128 GB", "256 GB", "512 GB", "1 TB"] },
    { label: "Network", options: ["Unlocked", "EE", "Vodafone", "O2", "Three"] },
  ],
  Tablet: [
    { label: "Storage", options: ["64 GB", "128 GB", "256 GB", "512 GB", "1 TB"] },
    { label: "Connectivity", options: ["Wi-Fi Only", "Wi-Fi + Cellular"] },
  ],
  Console: [
    { label: "Controllers", options: ["1 Controller Included", "2 Controllers Included", "No Controllers"] },
    { label: "Cables", options: ["HDMI + Power Cables", "Power Cable Only", "No Cables"] },
  ],
  Laptop: [
    { label: "RAM", options: ["8 GB", "16 GB", "32 GB", "64 GB"] },
    { label: "Storage", options: ["256 GB SSD", "512 GB SSD", "1 TB SSD", "2 TB SSD"] },
  ],
  Smartwatch: [
    { label: "Case Size", options: ["40mm/41mm", "44mm/45mm", "49mm (Ultra)"] },
    { label: "Connectivity", options: ["GPS Only", "GPS + Cellular"] },
  ],
  Audio: [
    { label: "Type", options: ["Over-Ear", "In-Ear Wireless"] },
    { label: "Colorway", options: ["Signature Black/Silver", "Special Edition / Other"] },
  ],
};

const CONDITIONS = [
  { id: "A", label: "A Grade", desc: "Used but like new — zero visible marks.",  color: "border-emerald-500/40 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-950/20", dot: "bg-emerald-500", descColor: "text-emerald-700 dark:text-emerald-400" },
  { id: "B", label: "B Grade", desc: "Minor signs of usage, small scratches.",   color: "border-blue-500/40 bg-blue-50 dark:border-blue-500/30 dark:bg-blue-950/20",      dot: "bg-blue-500",    descColor: "text-blue-700 dark:text-blue-400" },
  { id: "C", label: "C Grade", desc: "Heavy scratches or marks, fully working.", color: "border-amber-500/40 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-950/20",    dot: "bg-amber-500",   descColor: "text-amber-700 dark:text-amber-400" },
  { id: "F", label: "F Grade", desc: "Non-working — for parts or repair only.",  color: "border-red-500/40 bg-red-50 dark:border-red-500/30 dark:bg-red-950/20",        dot: "bg-red-500",     descColor: "text-red-700 dark:text-red-400" },
];

const CONDITION_QUESTIONS: Record<string, { id: string; question: string; options: string[] }[]> = {
  Phone: [
    { id: "screen", question: "How is the screen?", options: ["No cracks or scratches", "Light surface scratches", "Cracked but display works", "Shattered / unusable display"] },
    { id: "back", question: "How is the back of the phone?", options: ["Perfect — no marks", "Minor scuffs", "Cracked back glass"] },
    { id: "battery", question: "What's the battery health?", options: ["90%+: (Excellent)", "80–89% (Good)", "70–79% (Fair)", "Below 70% / Unknown"] },
    { id: "biometrics", question: "Is Face ID / Touch ID working?", options: ["Yes, fully working", "No / Faulty"] },
    { id: "charging", question: "Is the charging port working?", options: ["Yes", "No / Loose"] },
    { id: "reset", question: "Is the phone factory reset?", options: ["Yes, already reset", "I'll reset before sending"] },
  ],
  Tablet: [
    { id: "screen", question: "How is the screen?", options: ["No damage at all", "Light surface scratches", "Cracked but usable", "Shattered"] },
    { id: "body", question: "How is the body / casing?", options: ["Like new", "Light scratches", "Dents or significant marks"] },
    { id: "battery", question: "How's the battery life?", options: ["Holds charge well (6+ hours)", "Drains a bit fast (3–5 hours)", "Very poor under 3 hours"] },
    { id: "charging", question: "Is the charging port working?", options: ["Yes", "No / Loose"] },
    { id: "reset", question: "Is the tablet factory reset?", options: ["Yes, already reset", "I'll reset before sending"] },
  ],
  Console: [
    { id: "power", question: "Does the console power on and work?", options: ["Yes, works perfectly", "Yes but has some issues", "No, won't power on"] },
    { id: "disc", question: "Is the disc drive working?", options: ["Yes, works great", "No / Faulty", "No disc drive (digital edition)"] },
    { id: "body", question: "Any visible body damage?", options: ["Like new", "Minor scratches", "Significant damage"] },
    { id: "reset", question: "Have you done a factory reset?", options: ["Yes, already reset", "I'll reset before sending"] },
  ],
  Laptop: [
    { id: "power", question: "Does it power on?", options: ["Yes, works perfectly", "No"] },
    { id: "screen", question: "How is the screen?", options: ["No damage", "Minor scratches", "Cracked"] },
    { id: "input", question: "Are the keyboard and trackpad fully working?", options: ["Yes, all working", "Minor issues", "Major issues"] },
    { id: "battery", question: "How's the battery?", options: ["Holds charge well (4+ hours)", "Drains quickly (1–3 hours)", "Very poor under 1 hour"] },
    { id: "body", question: "Any body damage?", options: ["None", "Minor dents or scratches", "Significant damage"] },
    { id: "reset", question: "Have you done a factory reset?", options: ["Yes, already reset", "I'll reset before sending"] },
  ],
  Smartwatch: [
    { id: "power", question: "Does the watch power on and function?", options: ["Yes, fully working", "Powers on but has screen/sensor issues", "Won't power on"] },
    { id: "screen", question: "How is the screen glass?", options: ["Pristine - no scratches", "Light micro-scratches", "Deep scratches or chips", "Cracked screen"] },
    { id: "battery", question: "Does battery hold a normal charge?", options: ["Holds charge well (1+ day)", "Degraded charge (under 12 hours)"] },
    { id: "charging", question: "Is the charger working and connecting?", options: ["Yes", "No / loose connection"] },
    { id: "reset", question: "Is Activation Lock / iCloud turned off?", options: ["Yes, fully removed", "I will remove before posting"] },
  ],
  Audio: [
    { id: "sound", question: "How is the sound quality?", options: ["Perfect - crisp audio & active ANC", "Muffled sound or static in one ear", "No sound in one/both ears"] },
    { id: "body", question: "How is the cosmetic condition?", options: ["Like new - clean pads/tips", "Minor scratches or wear on case", "Heavy wear or staining"] },
    { id: "battery", question: "How is the battery health?", options: ["Excellent charge", "Low capacity - drains fast"] },
    { id: "charging", question: "Does the charging case work?", options: ["Yes, charges fully", "No / faulty connection"] },
  ],
  Other: [
    { id: "power",    question: "Does the device power on and work?",    options: ["Yes, fully working", "Powers on but has issues", "No, won't power on"] },
    { id: "physical", question: "What is the physical condition?",        options: ["Like new — no damage", "Minor wear or scratches", "Heavy wear or damage"] },
    { id: "function", question: "Is all functionality working?",          options: ["Yes, fully working", "Partial issues", "Major issues"] },
    { id: "reset",    question: "Will you factory reset before sending?", options: ["Yes, already done", "I'll do it before sending"] },
  ],
};

// ─── Types ─────────────────────────────────────────────────────────────────

interface TradeInState {
  category: string;
  brand: string;
  model: string;
  tradeInMode: 'auto' | 'manual_price' | 'unpriced';
  specs: Record<string, string>;
  condition: string;
  answers: Record<string, string>;
  customerNotes: string;
  fulfillment: string;
  storeId: string;
  contact: { name: string; email: string; phone: string; address: string; postcode: string };
}

const TOTAL_STEPS = 11;

const stepVariants = {
  enter: (dir: number) => ({ x: dir > 0 ? 32 : -32, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? -32 : 32, opacity: 0 }),
};

// ─── Sub-components ─────────────────────────────────────────────────────────

function OptionButton({ label, selected, onClick, desc, icon: Icon }: {
  label: string; selected?: boolean; onClick: () => void;
  desc?: string; icon?: React.ElementType;
}) {
  return (
    <motion.button
      whileHover={{ scale: 1.02, y: -3 }}
      whileTap={{ scale: 0.975 }}
      onClick={onClick}
      className={`w-full group flex items-start gap-5 p-6 rounded-3xl border-2 text-left transition-all duration-300 ${selected
        ? "border-zinc-950 bg-zinc-950 text-white shadow-xl shadow-zinc-950/10"
        : "border-zinc-200 bg-white hover:border-zinc-400 hover:shadow-lg"
        }`}
    >
      {Icon && (
        <div className={`mt-0.5 h-12 w-12 rounded-2xl flex items-center justify-center shrink-0 transition-all ${selected ? "bg-white/15" : "bg-zinc-100 group-hover:bg-zinc-50"}`}>
          <Icon className={`h-6 w-6 ${selected ? "text-white" : "text-zinc-600"}`} strokeWidth={1.7} />
        </div>
      )}
      <div className="flex-1 pt-1 min-w-0">
        <p className={`font-semibold text-[17px] ${selected ? "text-white" : "text-zinc-900"}`}>{label}</p>
        {desc && <p className={`mt-2 text-sm leading-snug ${selected ? "text-white/70" : "text-zinc-500"}`}>{desc}</p>}
      </div>
      <motion.div
        initial={false}
        animate={{ scale: selected ? 1 : 0, opacity: selected ? 1 : 0 }}
        transition={{ type: "spring", stiffness: 450, damping: 25 }}
        className="h-8 w-8 rounded-2xl bg-white flex items-center justify-center mt-1 shrink-0"
      >
        <Check className="h-5 w-5 text-black" strokeWidth={3.5} />
      </motion.div>
    </motion.button>
  );
}

function AnimatedPrice({ value }: { value: number }) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    let start = 0;
    const end = value;
    if (start === end) {
      setDisplayValue(end);
      return;
    }

    const duration = 1200; // 1.2s for counting up
    const startTime = performance.now();
    let animationFrameId: number;

    const updateNumber = (currentTime: number) => {
      const elapsedTime = currentTime - startTime;
      if (elapsedTime >= duration) {
        setDisplayValue(end);
      } else {
        const progress = elapsedTime / duration;
        const easeProgress = 1 - Math.pow(1 - progress, 3); // ease-out cubic
        const currentVal = Math.round(start + (end - start) * easeProgress);
        setDisplayValue(currentVal);
        animationFrameId = requestAnimationFrame(updateNumber);
      }
    };

    animationFrameId = requestAnimationFrame(updateNumber);
    return () => cancelAnimationFrame(animationFrameId);
  }, [value]);

  return <span>£{displayValue}</span>;
}

function AnimatedNumber({ value, format, suffix = "", duration = 1500, startOffset = 0 }: {
  value: number;
  format: (val: number) => string;
  suffix?: string;
  duration?: number;
  startOffset?: number;
}) {
  const [displayValue, setDisplayValue] = useState(value - startOffset);

  useEffect(() => {
    const start = value - startOffset;
    const end = value;
    if (start === end) {
      setDisplayValue(end);
      return;
    }

    const startTime = performance.now();
    let animationFrameId: number;

    const updateNumber = (currentTime: number) => {
      const elapsedTime = currentTime - startTime;
      if (elapsedTime >= duration) {
        setDisplayValue(end);
      } else {
        const progress = elapsedTime / duration;
        const easeProgress = 1 - Math.pow(1 - progress, 3); // ease-out cubic
        const currentVal = Math.round(start + (end - start) * easeProgress);
        setDisplayValue(currentVal);
        animationFrameId = requestAnimationFrame(updateNumber);
      }
    };

    animationFrameId = requestAnimationFrame(updateNumber);
    return () => cancelAnimationFrame(animationFrameId);
  }, [value, startOffset, duration]);

  return <span>{format(displayValue)}{suffix}</span>;
}

function StepHeader({ label, sub }: { label: string; sub?: string }) {
  return (
    <div className="space-y-0.5 sm:space-y-1">
      <h2 className="font-sans text-lg sm:text-2xl md:text-3xl font-extrabold tracking-tight text-zinc-950 dark:text-white">{label}</h2>
      {sub && <p className="text-[11px] sm:text-xs font-semibold text-zinc-400 dark:text-zinc-400">{sub}</p>}
    </div>
  );
}

export default function TradeInPage() {
  const [isWizardActive, setIsWizardActive] = useState(false);
  const [phase, setPhase] = useState(1);
  const [dir, setDir] = useState(1);
  const [state, setState] = useState<TradeInState>({
    category: "", brand: "", model: "", tradeInMode: "auto", specs: {}, condition: "",
    answers: {}, customerNotes: "", fulfillment: "", storeId: "",
    contact: { name: "", email: "", phone: "", address: "", postcode: "" },
  });
  const [stores, setStores] = useState<Store[]>([]);
  const [storesLoading, setStoresLoading] = useState(false);
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [stats, setStats] = useState({
    ukIdlePhones: 55,
    lifespanExtension: 2.0,
    idleElectronics: 5000000000,
  });


  // Pre-fill contact from logged-in user profile
  useEffect(() => {
    if (user) {
      setState(s => ({
        ...s,
        contact: {
          ...s.contact,
          name:    user.name    || s.contact.name,
          email:   user.email   || s.contact.email,
          phone:   user.phone   || s.contact.phone,
          address: user.address || s.contact.address,
        },
      }));
    }
  }, [user]);

  // Fetch stores when dropoff is chosen
  useEffect(() => {
    if (state.fulfillment === "dropoff" && stores.length === 0) {
      setStoresLoading(true);
      storesApi.list()
        .then(setStores)
        .catch(() => {})
        .finally(() => setStoresLoading(false));
    }
  }, [state.fulfillment]);

  // Dynamic brand + model loading from catalog API
  const CATEGORY_SLUG_MAP: Record<string, string> = {
    Phone: "phones", Tablet: "tablets", Console: "gaming",
    Laptop: "laptops", Audio: "audio", Smartwatch: "smartwatches",
  };
  const [dynamicBrands, setDynamicBrands] = useState<string[]>([]);
  // Brands/models that exist only in the "Other Search Devices" list (e.g. Xiaomi,
  // Huawei, Nintendo, Nokia) — dynamicBrands/dynamicModelData above only reflect
  // DeviceCatalog, so without this merge these brands never show up as selectable
  // at all in the step-by-step wizard, only via the free-text search box.
  const [otherDevices, setOtherDevices] = useState<{ name: string; brand: string; category: string }[]>([]);
  useEffect(() => {
    // The admin-curated "Other Search Devices" list is the only source for this — no
    // static fallback. If the call fails, this just stays empty rather than showing
    // stale/unmanaged data the admin has no way to edit or remove.
    catalogApi.listTradeInModels()
      .then(items => setOtherDevices(items))
      .catch(() => {});
  }, []);
  const [dynamicModelData, setDynamicModelData] = useState<{ model: string; tradeInMode: 'auto' | 'manual_price' | 'unpriced'; attributeOptions?: { label: string; options: string[] }[] }[]>([]);
  // Real per-device attributes (e.g. RAM for a specific MacBook) pulled from the catalog entry
  // the customer actually selected — takes priority over the generic per-category spec list
  // below so search-picked and wizard-picked devices show identical, accurate specs.
  const [catalogAttributeOptions, setCatalogAttributeOptions] = useState<{ label: string; options: string[] }[]>([]);

  // Custom / unlisted device state
  const [brandFilter, setBrandFilter] = useState("");
  const [showCustomBrand, setShowCustomBrand] = useState(false);
  const [customBrandInput, setCustomBrandInput] = useState("");
  const [aiSpecs, setAiSpecs] = useState<{ label: string; options: string[] }[]>([]);
  const [aiSpecsLoading, setAiSpecsLoading] = useState(false);

  useEffect(() => {
    setDynamicBrands([]); setDynamicModelData([]);
    const slug = CATEGORY_SLUG_MAP[state.category];
    if (!slug) return;
    productsApi.brands(slug)
      .then(data => {
        if (data.length > 0) setDynamicBrands(data.map(b => b.brand));
      })
      .catch(() => {});
  }, [state.category]);

  useEffect(() => {
    setDynamicModelData([]);
    const catSlug = CATEGORY_SLUG_MAP[state.category];
    if (!catSlug || !state.brand) return;
    const brandSlug = state.brand.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3002"}/device-catalog?forTradeIn=true&categorySlug=${catSlug}&brandSlug=${brandSlug}`)
      .then(r => r.json())
      .then((entries: { model: string; tradeInMode?: 'auto' | 'manual_price' | 'unpriced'; attributeOptions?: { label: string; options: string[] }[] }[]) =>
        setDynamicModelData(entries.map(e => ({ model: e.model, tradeInMode: e.tradeInMode ?? 'unpriced', attributeOptions: e.attributeOptions ?? [] })))
      )
      .catch(() => {});
  }, [state.category, state.brand]);

  // Fetch AI-generated specs for all unlisted/unpriced devices — gives device-specific options
  // (e.g. Xiaomi Redmi Note 13 → Storage: 128GB/256GB, RAM: 6GB/8GB vs generic Phone options)
  useEffect(() => {
    if (!state.model || !state.brand || state.tradeInMode !== 'unpriced') { setAiSpecs([]); return; }
    setAiSpecs([]);
    setAiSpecsLoading(true);
    tradeInsApi.suggestSpecs({ brand: state.brand, model: state.model, category: state.category })
      .then(specs => setAiSpecs(specs))
      .catch(() => {})
      .finally(() => setAiSpecsLoading(false));
  }, [state.model, state.brand, state.tradeInMode, state.category]);

  const [catalogCats, setCatalogCats] = useState<CatalogCategory[]>([]);
  const [catFallbackImages, setCatFallbackImages] = useState<Record<string, string>>({});
  useEffect(() => {
    catalogApi.listCategories()
      .then(cats => {
        const sellable = cats.filter(c => c.isSellable);
        setCatalogCats(sellable);
        // For categories with no DB image, fetch a random product image as fallback
        sellable.filter(c => !c.image).forEach(c => {
          productsApi.list({ category: c.name, limit: 12 })
            .then(r => {
              const pool = r.items.flatMap(p => p.images ?? []);
              const img = pool[Math.floor(Math.random() * pool.length)];
              if (img) setCatFallbackImages(prev => ({ ...prev, [c.slug]: img }));
            })
            .catch(() => {});
        });
      })
      .catch(() => {});
  }, []);

  const [hotItems, setHotItems] = useState<Product[]>([]);
  useEffect(() => {
    productsApi.list({ limit: 20, condition: "Pristine" }).then(r => {
      // pick the most expensive product from each category, up to 4
      const seen = new Set<string>();
      const picks: Product[] = [];
      for (const p of [...r.items].sort((a, b) => (b.price ?? 0) - (a.price ?? 0))) {
        if (!seen.has(p.category) && picks.length < 4) {
          seen.add(p.category);
          picks.push(p);
        }
      }
      setHotItems(picks.length > 0 ? picks : r.items.slice(0, 4));
    }).catch(() => {});
  }, []);

  const [submitting, setSubmitting] = useState(false);
  const [submitRef, setSubmitRef] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [serverOfferPrice, setServerOfferPrice] = useState<number | null>(null);
  const [profileGateOpen, setProfileGateOpen] = useState(false);
  const [missingDetailsOpen, setMissingDetailsOpen] = useState(false);
  const [missingFields, setMissingFields] = useState<string[]>([]);

  // AI pricing states
  const [images, setImages] = useState<{ filePath: string; previewUrl: string }[]>([]);
  const [batchId, setBatchId] = useState(() => crypto.randomUUID());
  const [imageUploading, setImageUploading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiPrice, setAiPrice] = useState<number | null>(null);
  const [aiError, setAiError] = useState(false);
  const [aiLoadingText, setAiLoadingText] = useState("Analyzing your device...");
  const [aiRetryCount, setAiRetryCount] = useState(0);
  const [aiRecalcCount, setAiRecalcCount] = useState(0);
  const [aiManualFallback, setAiManualFallback] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const modalScrollRef = useRef<HTMLDivElement>(null);
  const breadcrumbScrollRef = useRef<HTMLDivElement>(null);

  // Keep the most recently picked breadcrumb (the current step) in view when the
  // chain gets long enough to overflow its single-line scroll container on mobile.
  useEffect(() => {
    const el = breadcrumbScrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [state.category, state.brand, state.model]);

  // Device pre-selection from home page search or login redirect
  const [pendingDevice, setPendingDevice] = useState<{ brand: string; model: string; category: string } | null>(null);

  // Restore wizard state on mount; also pick up URL params / pending device from login redirect
  useEffect(() => {
    const saved = sessionStorage.getItem("ts_wizard_tradein");
    if (saved) {
      try {
        const { state: s, phase: savedPhase, aiPrice: savedAiPrice, images: savedImages, batchId: savedBatchId } = JSON.parse(saved);
        // Backfill fields that may be missing from old saved state
        setState({ ...s, customerNotes: s.customerNotes ?? "" });
        setPhase(savedPhase);
        if (savedAiPrice != null) setAiPrice(savedAiPrice);
        if (savedImages?.length) setImages(savedImages);
        if (savedBatchId) setBatchId(savedBatchId);
        setIsWizardActive(true);
      } catch {}
    } else {
      // No saved wizard — check if we arrived here with a device to pre-select
      const params = new URLSearchParams(window.location.search);
      const brand = params.get("brand");
      const model = params.get("model");
      const category = params.get("category");

      if (brand && model && category) {
        setPendingDevice({ brand, model, category });
      } else {
        // Check sessionStorage for intent that survived a login redirect
        const pending = sessionStorage.getItem("ts_pending_device");
        if (pending) {
          try {
            sessionStorage.removeItem("ts_pending_device");
            setPendingDevice(JSON.parse(pending));
          } catch {}
        } else {
          const q   = params.get("q");
          const cat = params.get("cat");
          if (q) {
            // Manual/unlisted device from search bar — jump straight to brand step
            setPendingDevice({ brand: "", model: q, category: cat ?? "Other" });
          } else if (cat) {
            // Category card clicked on home page — open wizard at brand step for that category
            setPendingDevice({ brand: "", model: "", category: cat });
          }
        }
      }
    }

    storesApi.list().then(setStores).catch(() => {});
  }, []);

  // Auto-open wizard once auth resolves and there is a pending device selection.
  // Works for guests too — no account required to start a trade-in.
  useEffect(() => {
    if (authLoading || !pendingDevice || isWizardActive) return;
    const isFullDevice = !!pendingDevice.brand; // brand known → jump to Phase 2
    setState({
      category: pendingDevice.category,
      brand: pendingDevice.brand,
      model: isFullDevice ? pendingDevice.model : "",
      tradeInMode: "auto",
      specs: {}, condition: "", answers: {}, customerNotes: "",
      fulfillment: "", storeId: "",
      contact: {
        name: user?.name || "", email: user?.email || "",
        phone: user?.phone || "", address: user?.address || "", postcode: "",
      },
    });
    if (!isFullDevice) {
      // Manual entry: category set but no brand — land on brand step (Phase 1, category already set)
      setWizardModelSearch(pendingDevice.model);
    }
    setPhase(isFullDevice ? 2 : 1);
    setIsWizardActive(true);
    setPendingDevice(null);
  }, [authLoading, pendingDevice, user, isWizardActive]);

  // Auto-save wizard state to sessionStorage whenever anything changes
  useEffect(() => {
    if (isWizardActive) {
      sessionStorage.setItem("ts_wizard_tradein", JSON.stringify({ state, phase, images, batchId, aiPrice }));
    }
  }, [state, phase, images, batchId, aiPrice, isWizardActive]);

  // Lock body scroll when wizard modal is active
  useEffect(() => {
    if (isWizardActive) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isWizardActive]);

  // Search autocomplete states
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [storeDropOpen, setStoreDropOpen] = useState(false);

  // Model search query inside Phase 1 wizard
  const [wizardModelSearch, setWizardModelSearch] = useState("");

  // One-question-at-a-time tracker for Phase 3
  const [diagIndex, setDiagIndex] = useState(0);



  const scrollToTop = () => {
    if (modalScrollRef.current) {
      modalScrollRef.current.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handleCategorySelect = (catId: string) => {
    setState(s => ({
      ...s,
      category: catId,
      brand: "",
      model: "",
      tradeInMode: "auto",
      specs: {},
      answers: {},
      customerNotes: "",
    }));
    setWizardModelSearch("");
    setBrandFilter("");
    setShowCustomBrand(false);
    setCustomBrandInput("");
    setAiSpecs([]);
    scrollToTop();
  };

  const handleBrandSelect = (brandName: string) => {
    setState(s => ({
      ...s,
      brand: brandName,
      model: "",
      tradeInMode: "auto",
      specs: {},
      answers: {},
      customerNotes: "",
    }));
    // intentionally NOT resetting wizardModelSearch here so any pre-filled
    // model query from the search bar is preserved into the model step
    setShowCustomBrand(false);
    setCustomBrandInput("");
    setAiSpecs([]);
    scrollToTop();
  };

  const goToPhase = (p: number) => {
    if (p === 3) setDiagIndex(0);
    setPhase(p);
    scrollToTop();
  };

  const closeWizard = () => {
    sessionStorage.removeItem("ts_wizard_tradein");
    setIsWizardActive(false);
  };

  const handleBack = () => {
    if (phase === 1) {
      if (state.model) {
        setState(s => ({ ...s, model: "" }));
        setWizardModelSearch("");
      } else if (state.brand) {
        setState(s => ({ ...s, brand: "" }));
      } else if (state.category) {
        setState(s => ({ ...s, category: "" }));
      } else {
        closeWizard();
      }
    } else {
      if (phase === 4) {
        setAiPrice(null);
        setAiError(false);
        setAiRetryCount(0);
        setAiRecalcCount(0);
        setAiManualFallback(false);
      }
      const prev = phase - 1;
      if (prev === 3) setDiagIndex(currentQuestions.length - 1);
      setPhase(prev);
      scrollToTop();
    }
  };

  const currentSpecs = SPECS[state.category] ?? [];
  const currentQuestions = CONDITION_QUESTIONS[state.category] ?? [];

  async function compressToBlob(file: File): Promise<{ blob: Blob; previewUrl: string }> {
    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const MAX = 800;
        let { width, height } = img;
        if (width > MAX || height > MAX) {
          if (width > height) { height = Math.round(height * MAX / width); width = MAX; }
          else { width = Math.round(width * MAX / height); height = MAX; }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
        URL.revokeObjectURL(url);
        const previewUrl = canvas.toDataURL("image/jpeg", 0.75);
        canvas.toBlob(blob => resolve({ blob: blob!, previewUrl }), "image/jpeg", 0.75);
      };
      img.src = url;
    });
  }

  async function handleImageFiles(files: File[]) {
    if (files.length === 0) return;
    setImageUploading(true);
    try {
      const results = await Promise.all(
        files.slice(0, 6 - images.length).map(async (file) => {
          const { blob, previewUrl } = await compressToBlob(file);
          let filePath = previewUrl;
          try {
            const uploadFile = new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" });
            const res = await uploadsApi.tradeInImage(uploadFile, batchId);
            if (res?.presignedUrl) filePath = res.presignedUrl;
            else if (res?.filePath) filePath = res.filePath;
          } catch (uploadErr) {
            console.warn("Background upload failed, falling back to local preview:", uploadErr);
          }
          return { filePath, previewUrl };
        })
      );
      setImages(prev => [...prev, ...results].slice(0, 6));
    } catch (err) {
      console.error("Error processing captured photos:", err);
    } finally {
      setImageUploading(false);
    }
  }

  async function fetchAiPrice() {
    setAiLoading(true);
    const texts = ["Analyzing device specs...", "Checking UK market rates...", "Calculating your offer..."];
    let i = 0;
    const interval = setInterval(() => { i = (i + 1) % texts.length; setAiLoadingText(texts[i]); }, 1500);
    try {
      const result = await tradeInsApi.aiPrice({
        model: state.model, brand: state.brand, category: state.category,
        condition: state.condition, specs: state.specs, answers: state.answers,
        images: images.length > 0 ? images.map(i => i.previewUrl) : undefined,
      });
      setAiPrice(result.price);
      setAiError(false);
    } catch {
      if (aiRetryCount >= 1) {
        // Already used the one extra retry — stop asking and fall back to manual review.
        setAiError(false);
        setAiManualFallback(true);
        setState(s => ({ ...s, tradeInMode: "unpriced" }));
      } else {
        setAiRetryCount(c => c + 1);
        setAiError(true);
      }
    } finally {
      clearInterval(interval);
      setAiLoading(false);
    }
  }

  const guardedOpen = (action: () => void) => {
    if (authLoading) return;
    if (!user) {
      // Guests can proceed straight into the wizard — they'll give their name and
      // contact details on the contact step instead of needing an account.
      action();
      return;
    }
    // Always fetch fresh profile — context can be stale after settings updates
    authApi.me()
      .then(fresh => {
        const filled = (v: unknown) => typeof v === "string" && v.trim().length > 0;
        const complete = filled(fresh.name) && filled(fresh.phone) &&
                         filled(fresh.address) && filled(fresh.city) && filled(fresh.postcode);
        if (!complete) { setProfileGateOpen(true); return; }
        action();
      })
      .catch(() => {
        const filled = (v: unknown) => typeof v === "string" && v.trim().length > 0;
        const complete = filled(user.name) && filled(user.phone) &&
                         filled(user.address) && filled(user.city) && filled(user.postcode);
        if (!complete) { setProfileGateOpen(true); return; }
        action();
      });
  };

  const startWizard = (catId?: string, prefilledModelQuery?: string) => {
    guardedOpen(() => {
      setState({
        category: catId ?? "",
        brand: "",
        model: "",
        tradeInMode: "auto",
        specs: {},
        condition: "",
        answers: {},
        customerNotes: "",
        fulfillment: "", storeId: "",
        contact: {
          name: user?.name || "", email: user?.email || "",
          phone: user?.phone || "", address: user?.address || "", postcode: "",
        },
      });
      setWizardModelSearch(prefilledModelQuery ?? "");
      setBrandFilter("");
      setShowCustomBrand(false);
      setCustomBrandInput("");
      setAiSpecs([]);
      setCatalogAttributeOptions([]);
      setPhase(1);
      setIsWizardActive(true);
      scrollToTop();
    });
  };

  const handleSelectSuggestion = (suggestion: {
    name: string; category: string; brand: string;
    catalogId?: string; tradeInMode?: 'auto' | 'manual_price' | 'unpriced';
    attributeOptions?: { label: string; options: string[] }[];
  }) => {
    guardedOpen(() => {
      // Open wizard immediately at phase 2 with unpriced as safe default
      setState({
        category: suggestion.category,
        brand: suggestion.brand,
        model: suggestion.name,
        tradeInMode: suggestion.tradeInMode ?? "unpriced", // upgraded below if not already known
        specs: {},
        condition: "",
        answers: {},
        customerNotes: "",
        fulfillment: "", storeId: "",
        contact: {
          name: user?.name || "", email: user?.email || "",
          phone: user?.phone || "", address: user?.address || "", postcode: "",
        },
      });
      setCatalogAttributeOptions(suggestion.attributeOptions ?? []);
      setPhase(2);
      setIsWizardActive(true);
      scrollToTop();

      // Suggestion already came from the real catalog (DeviceSearchBox merges it in
      // directly) — no need to re-resolve it by name.
      if (suggestion.catalogId || suggestion.tradeInMode) return;

      // Fallback for callers passing only name/category/brand (e.g. the hardcoded
      // "Popular" quick links) — best-effort catalog lookup by exact model match.
      const catSlugMap: Record<string, string> = {
        Phone: "phones", Tablet: "tablets", Console: "gaming",
        Laptop: "laptops", Audio: "audio", Smartwatch: "smartwatches",
      };
      const catSlug = catSlugMap[suggestion.category];
      const brandSlug = suggestion.brand.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      if (catSlug) {
        fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3002"}/device-catalog?forTradeIn=true&categorySlug=${catSlug}&brandSlug=${brandSlug}`)
          .then(r => r.json())
          .then((entries: { model: string; tradeInMode?: string; attributeOptions?: { label: string; options: string[] }[] }[]) => {
            const match = entries.find(e => e.model.toLowerCase() === suggestion.name.toLowerCase());
            if (match?.tradeInMode && match.tradeInMode !== "unpriced") {
              setState(s => ({ ...s, tradeInMode: match.tradeInMode as "auto" | "manual_price" | "unpriced" }));
              setCatalogAttributeOptions(match.attributeOptions ?? []);
            }
          })
          .catch(() => {}); // stays unpriced on error → manual review
      }
    });
  };

  const PHASE_LABELS = [
    "Device Selection",
    "Configuration & Condition",
    "Quick Check",
    "Offer Valuation",
    "Fulfillment & Details",
    "Done"
  ];




  const [selectedStoreId, setSelectedStoreId] = useState<string>("");
  useEffect(() => {
    if (stores.length > 0 && !selectedStoreId) {
      setSelectedStoreId(stores[0].id);
    }
  }, [stores, selectedStoreId]);

  const activeStore = stores.find(s => s.id === selectedStoreId) || stores[0];
  const storeName = activeStore?.name || "TechStop Leicester";
  const storeAddress = activeStore ? `${activeStore.address}, ${activeStore.city} ${activeStore.postcode}` : "148B Melton Rd, Leicester LE4 5EE";
  const storeHours = activeStore?.openingHours || "Mon–Sat, 9:00 AM – 6:00 PM";
  const mapsLink = activeStore
    ? `https://maps.google.com/?q=${encodeURIComponent(`${activeStore.name}, ${activeStore.address}, ${activeStore.city} ${activeStore.postcode}`)}`
    : "https://maps.app.goo.gl/fyc8Zuy4hjh3tG3x8";

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground font-sans relative overflow-x-hidden selection:bg-accent selection:text-white">

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .animate-spin-slow {
          animation: spin-slow 15s linear infinite;
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #e4e4e7;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #d4d4d8;
        }
        [data-theme="dark"] .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #27272a;
        }
        [data-theme="dark"] .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #3f3f46;
        }
      ` }} />
      <div className="flex-1 bg-background relative">

          {/* Subtle top background decorative orb */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-[600px] h-[350px] bg-sky-500/10 blur-[130px] rounded-full pointer-events-none -z-10" />

          {/* Hero Section */}
          <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-12 lg:pt-16 pb-12">
            
            <div className="grid lg:grid-cols-12 gap-8 lg:gap-12 items-center text-left mb-12">
              
              {/* Left Column: Headline and Search */}
              <div className="lg:col-span-5 flex flex-col justify-center items-start text-left space-y-5">
                <h1 className="font-sans text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight text-zinc-950 dark:text-white leading-[1.05]">
                  Sell your tech <br />
                  for cash. <br />
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-600 via-rose-500 to-red-600">Fast. Fair. Easy.</span>
                </h1>

                {/* Shared DeviceSearchBox — same component as home page */}
                <div className="w-full max-w-xl">
                  <DeviceSearchBox
                    className="w-full shadow-md border border-zinc-200 dark:border-zinc-800 rounded-2xl"
                    placeholder="Search your device (e.g. iPhone 15 Pro...)"
                    onSelect={(sug) => handleSelectSuggestion(sug)}
                    onManualEntry={(q) => startWizard("Other", q)}
                  />

                  {/* Popular quick links */}
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-zinc-500 mt-3">
                    <span className="text-zinc-500 font-extrabold">Popular:</span>
                    {[
                      { name: "iPhone 15 Pro Max", category: "Phone", brand: "Apple" },
                      { name: "PS5 Disc Edition", category: "Console", brand: "Sony PlayStation" },
                      { name: "MacBook Air 13\" M2", category: "Laptop", brand: "Apple" },
                    ].map((item, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => handleSelectSuggestion({ name: item.name, category: item.category, brand: item.brand })}
                        className="px-2.5 py-1 bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-200 rounded-lg transition-colors font-bold shadow-2xs"
                      >
                        {item.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right Column: Category Accordion Gallery */}
              <div className="lg:col-span-7 w-full flex flex-col justify-center">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-sans text-lg md:text-xl font-extrabold tracking-tight text-zinc-950 dark:text-white leading-none">
                    Select category to get started
                  </h2>
                </div>

                <AccordionGallery
                  items={
                    catalogCats && catalogCats.length > 0
                      ? catalogCats.map((cat) => {
                          const meta = CAT_METADATA[cat.slug];
                          const catImgs = (cat.images ?? []).length > 0 ? cat.images : (cat.image ? [cat.image] : []);
                          const img = catImgs.length > 0
                            ? catImgs[0]
                            : (catFallbackImages[cat.slug] ?? "/phones/samsung/bento_smartphones.png");
                          const catId = meta?.oldId ?? cat.slug;
                          return {
                            image: img,
                            label: cat.name,
                            catId: catId,
                          };
                        })
                      : [
                          { image: "/phones/samsung/bento_smartphones.png", label: "Phones", catId: "Phone" },
                          { image: "/laptops/MacBook/showcase_macbook.png", label: "Laptops", catId: "Laptop" },
                          { image: "/consoles/showcase_ps5.png", label: "Gaming", catId: "Console" },
                          { image: "/tablets/ipad/showcase_ipad_pro.png", label: "Tablets", catId: "Tablet" },
                          { image: "/Other/watch/galaxy_watch_promo_1778927696615.png", label: "Smartwatches", catId: "Smartwatch" },
                          { image: "/audio/bento_audio.png", label: "Audio", catId: "Audio" },
                        ]
                  }
                  defaultIndex={2}
                  expandRatio={0.52}
                  trigger="click"
                  accentColor="#ffffff"
                  overlayColor="#060010"
                  textColor="#ffffff"
                  grayscale
                  showLabels
                  duration={1.5}
                  ease="power3.out"
                  parallax={0.5}
                  tilt={8}
                  stagger={0.06}
                  height={420}
                  gap={10}
                  radius={16}
                  orientation="horizontal"
                  autoplay
                  autoplayInterval={2400}
                  onSelect={(item) => startWizard(item.catId)}
                />
              </div>

            </div>

            {/* Value Proposition Grid below the fold */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-7xl mx-auto border-t border-zinc-200 dark:border-zinc-800 pt-10 mb-28 text-left">
              {[
                { Icon: Shield, title: "Highest Value Guaranteed", desc: "Always-updated market rates" },
                { Icon: Zap, title: "Paid Within 48 Hours", desc: "Straight bank transfer deposit" },
                { Icon: Truck, title: "Free & Insured Postage", desc: "Insured Royal Mail shipping label" },
                { Icon: Clock, title: "14-Day Offer Lock-in", desc: "Protection against price drop" },
              ].map((item, idx) => (
                <div key={idx} className="flex gap-3 items-start">
                  <div className="h-10 w-10 bg-zinc-50 dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 flex items-center justify-center shrink-0">
                    <item.Icon className="h-5 w-5 text-zinc-700 dark:text-zinc-300" strokeWidth={1.8} />
                  </div>
                  <div>
                    <h4 className="text-xs font-black uppercase tracking-wider text-zinc-900 dark:text-zinc-200 leading-tight mb-1">{item.title}</h4>
                    <p className="text-[9px] text-zinc-400 font-semibold">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Choose How to Trade In */}
            <div className="max-w-5xl mx-auto mb-20 text-left font-sans">
              <div className="text-center mb-12">
                <h3 className="font-sans text-3xl md:text-4xl font-extrabold tracking-tight text-zinc-950 dark:text-white leading-none mb-3">
                  Two Convenient Ways to Get Paid
                </h3>
                <p className="text-zinc-500 dark:text-zinc-400 font-semibold text-sm max-w-xl mx-auto leading-relaxed">
                  Whether you prefer the ease of shipping from home or the speed of in-person trade, we've got you covered.
                </p>
              </div>

              <div className="grid md:grid-cols-2 gap-8">
                {/* Method 1: Postal */}
                <div className="flex flex-col justify-between p-8 rounded-[2.5rem] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm hover:shadow-xl transition-all group">
                  <div>
                    <div className="h-12 w-12 bg-sky-500/10 dark:bg-sky-500/20 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-105 transition-transform">
                      <Truck className="h-6 w-6 text-sky-500" />
                    </div>
                    <h4 className="font-black text-xl text-zinc-950 dark:text-white mb-2">Post it Free &amp; Insured</h4>
                    <p className="text-zinc-500 dark:text-zinc-400 text-xs font-semibold leading-relaxed mb-6">
                      Accept your instant valuation online and we'll generate a prepaid, fully-insured Royal Mail postage label. Wrap your device, drop it off at any Post Office counter, and get paid directly to your bank account within 48 hours of inspection.
                    </p>
                    <ul className="space-y-2.5 mb-8">
                      {[
                        "Free insured Royal Mail trackable shipping",
                        "Paid directly via Faster Payments bank transfer",
                        "Data wipe certificate emailed to you",
                      ].map((item, i) => (
                        <li key={i} className="flex items-center gap-2.5 text-xs font-bold text-zinc-700 dark:text-zinc-300">
                          <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <button
                    type="button"
                    onClick={() => startWizard("Phone")}
                    className="w-full py-3.5 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-750 text-zinc-900 dark:text-zinc-100 rounded-xl text-xs font-black transition-colors flex items-center justify-center gap-1.5"
                  >
                    Start Postal Quote <ChevronRight className="h-4 w-4" />
                  </button>
                </div>

                {/* Method 2: In-Store */}
                <div className="flex flex-col justify-between p-8 rounded-[2.5rem] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm hover:shadow-xl transition-all group relative">
                  <div className="absolute top-6 right-6 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 px-3 py-1 text-[9px] font-black uppercase tracking-widest">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                    </span>
                    Open Now
                  </div>
                  <div>
                    <div className="h-12 w-12 bg-emerald-500/10 dark:bg-emerald-500/20 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-105 transition-transform">
                      <MapPin className="h-6 w-6 text-emerald-500" />
                    </div>
                    <h4 className="font-black text-xl text-zinc-950 dark:text-white mb-2">Leicester Store Drop-Off</h4>
                    <p className="text-zinc-500 dark:text-zinc-400 text-xs font-semibold leading-relaxed mb-6">
                      Prefer instant hand-to-hand transactions? Bring your device directly to our retail store. Our on-site diagnostics team will inspect your hardware on the spot and hand you cash or apply a 10% bonus store credit index in under 15 minutes.
                    </p>
                    {stores.length > 1 && (
                      <div className="mb-4 relative">
                        <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400 dark:text-zinc-500 block mb-1.5">Select Store Location</label>
                        <button
                          type="button"
                          onClick={() => setStoreDropOpen(o => !o)}
                          className="w-full h-11 px-4 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs font-bold text-zinc-900 dark:text-zinc-100 flex items-center justify-between gap-2 hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors"
                        >
                          <span className="truncate">
                            {(stores.find(s => s.id === selectedStoreId) || stores[0])?.name}
                            {" "}({(stores.find(s => s.id === selectedStoreId) || stores[0])?.city})
                          </span>
                          <ChevronDown className={`h-4 w-4 text-zinc-400 shrink-0 transition-transform duration-200 ${storeDropOpen ? "rotate-180" : ""}`} />
                        </button>
                        <AnimatePresence>
                          {storeDropOpen && (
                            <motion.div
                              initial={{ opacity: 0, y: -4 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -4 }}
                              transition={{ duration: 0.15 }}
                              className="absolute left-0 right-0 top-full mt-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl z-50 overflow-hidden"
                            >
                              {stores.map(s => {
                                const isSelected = selectedStoreId === s.id || (!selectedStoreId && s.id === stores[0]?.id);
                                return (
                                  <button
                                    key={s.id}
                                    type="button"
                                    onClick={() => { setSelectedStoreId(s.id); setStoreDropOpen(false); }}
                                    className={`w-full text-left px-4 py-3 text-xs font-bold flex items-center justify-between transition-colors ${
                                      isSelected
                                        ? "bg-zinc-950 dark:bg-white text-white dark:text-zinc-950"
                                        : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                                    }`}
                                  >
                                    <span>{s.name}</span>
                                    <span className={`text-[10px] font-semibold ${isSelected ? "opacity-60" : "text-zinc-400"}`}>{s.city}</span>
                                  </button>
                                );
                              })}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )}
                    <div className="bg-zinc-50 dark:bg-zinc-950/40 rounded-2xl p-4 border border-zinc-200/60 dark:border-zinc-800/80 space-y-2.5 mb-6">
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-1 sm:gap-4 text-xs">
                        <span className="text-zinc-400 font-bold shrink-0">Address</span>
                        <span className="text-zinc-900 dark:text-zinc-200 font-black text-left sm:text-right leading-snug">{storeAddress}</span>
                      </div>
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-1 sm:gap-4 text-xs">
                        <span className="text-zinc-400 font-bold shrink-0">Opening Hours</span>
                        <span className="text-zinc-900 dark:text-zinc-200 font-black text-left sm:text-right leading-snug">{storeHours}</span>
                      </div>
                    </div>
                    {/* Interactive Store Location Map */}
                    <div className="w-full h-40 rounded-2xl overflow-hidden border border-zinc-200/80 dark:border-zinc-800 mb-6 shadow-inner relative bg-zinc-100 dark:bg-zinc-950">
                      <iframe
                        title="Store Location Map"
                        width="100%"
                        height="100%"
                        frameBorder="0"
                        style={{ border: 0 }}
                        src={activeStore?.mapsEmbedUrl ?? `https://maps.google.com/maps?q=${encodeURIComponent(`${storeName}, ${storeAddress}`)}&t=&z=17&ie=UTF8&iwloc=&output=embed`}
                        allowFullScreen
                        className="transition-all duration-500 pointer-events-none"
                      />
                    </div>
                  </div>
                  <a
                    href={mapsLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-3.5 bg-zinc-950 dark:bg-white hover:bg-zinc-800 dark:hover:bg-zinc-100 text-white dark:text-zinc-950 rounded-xl text-xs font-black transition-colors flex items-center justify-center gap-1.5 text-center"
                  >
                    Get Directions <MapPin className="h-4 w-4" />
                  </a>
                </div>
              </div>
            </div>
          </section>
        </div>

      {/* ─── Profile Gate Modal ───────────────────────────────────────────────── */}
      <AnimatePresence>
        {profileGateOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-md"
            onClick={() => setProfileGateOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 16 }}
              transition={{ type: "spring", duration: 0.35 }}
              onClick={e => e.stopPropagation()}
              className="bg-white dark:bg-zinc-900 rounded-3xl p-8 max-w-sm w-full shadow-2xl border border-zinc-200 dark:border-zinc-800"
            >
              <div className="text-center space-y-4">
                <div className="h-14 w-14 bg-amber-50 dark:bg-amber-950/30 rounded-2xl flex items-center justify-center mx-auto">
                  <UserCircle className="h-7 w-7 text-amber-500" />
                </div>
                <div>
                  <h2 className="text-xl font-extrabold text-zinc-900 dark:text-white">Complete your profile first</h2>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed mt-2">
                    We need a few details to process your trade-in and send you an offer.
                  </p>
                </div>
                <div className="bg-zinc-50 dark:bg-zinc-800 rounded-2xl p-4 text-left space-y-2">
                  {[
                    { field: user?.name,     label: "Full name" },
                    { field: user?.phone,    label: "Phone number" },
                    { field: user?.address,  label: "Street address" },
                    { field: user?.city,     label: "City" },
                    { field: user?.postcode, label: "Postcode" },
                  ].filter(({ field }) => !(typeof field === "string" && field.trim().length > 0))
                   .map(({ label }) => (
                    <div key={label} className="flex items-center gap-2 text-xs font-bold text-red-500">
                      <X className="h-3.5 w-3.5 shrink-0" /> {label} is missing or empty
                    </div>
                  ))}
                </div>
                <div className="flex flex-col gap-2 pt-1">
                  <button
                    onClick={() => {
                      setProfileGateOpen(false);
                      sessionStorage.setItem("ts_login_redirect", "/trade-in");
                      router.push("/account/settings");
                    }}
                    className="h-12 bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 rounded-xl text-sm font-black hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-colors"
                  >
                    Update Profile
                  </button>
                  <button
                    onClick={() => setProfileGateOpen(false)}
                    className="h-10 text-xs font-bold text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
                  >
                    Not now
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── HIGH-FIDELITY OVERHAULED WIZARD MODAL ─────────────────────────── */}
      <AnimatePresence>
        {isWizardActive && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-6 overflow-hidden animate-fade-in">
            {/* Backdrop Overlay with blur */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeWizard}
              className="fixed inset-0 bg-zinc-950/60 backdrop-blur-md"
            />

            {/* Modal Dialog Container */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: "spring", duration: 0.4 }}
              className="relative bg-zinc-50 dark:bg-zinc-900 rounded-[2.5rem] border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden w-full max-w-4xl min-h-[500px] flex flex-col z-10 max-h-[90vh]"
            >
              {/* Close Button */}
              <button
                type="button"
                onClick={closeWizard}
                className="absolute top-3.5 right-3.5 sm:top-5 sm:right-5 h-8 w-8 sm:h-10 sm:w-10 rounded-full border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 hover:border-zinc-950 dark:hover:border-white flex items-center justify-center text-zinc-500 hover:text-zinc-950 dark:hover:text-white transition-colors z-20 cursor-pointer shadow-sm shadow-zinc-900/5"
              >
                <X className="h-4 w-4 sm:h-5 sm:w-5" />
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={async (e) => {
                  const files = Array.from(e.target.files ?? []);
                  e.target.value = "";
                  await handleImageFiles(files);
                }}
              />
              <CameraCaptureModal
                open={cameraOpen}
                onClose={() => setCameraOpen(false)}
                onCapture={(file) => handleImageFiles([file])}
                continuous
              />

              {/* Wizard Content Inner wrapper with scroll */}
              <div ref={modalScrollRef} className="p-3 sm:p-6 md:p-8 flex-1 flex flex-col justify-between overflow-y-auto custom-scrollbar pt-3 sm:pt-6 md:pt-8">
                <div className="w-full max-w-4xl mx-auto space-y-2 sm:space-y-6">

                  {/* Wizard Navigation / Progress Header */}
                  <div className="bg-white dark:bg-zinc-950 rounded-2xl sm:rounded-3xl border border-zinc-200/80 dark:border-zinc-800 shadow-sm p-2.5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-2 md:gap-4">
                    <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                      <button
                        onClick={handleBack}
                        className="h-8 sm:h-10 px-2.5 sm:px-4 rounded-lg sm:rounded-xl border border-zinc-200 dark:border-zinc-800 hover:border-zinc-950 dark:hover:border-white flex items-center gap-2 text-xs font-bold text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white transition-colors bg-white dark:bg-zinc-800"
                      >
                  <ArrowLeft className="h-4 w-4" /> <span className="hidden sm:inline">Back</span>
                </button>
                <div className="h-4 w-px bg-zinc-200 dark:bg-zinc-800 hidden md:block" />
                <div className="hidden sm:block">
                  <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block">Step {phase} of 6</span>
                  <span className="text-sm font-extrabold text-zinc-800 dark:text-zinc-200">{PHASE_LABELS[phase - 1]}</span>
                </div>
                <span className="sm:hidden text-[11px] font-extrabold text-zinc-800 dark:text-zinc-200">{PHASE_LABELS[phase - 1]}</span>
              </div>

              <div className="w-full sm:flex-1 sm:min-w-0 flex items-center justify-center sm:justify-end">
                <div className="flex items-center w-full max-w-sm justify-between px-1">
                  {[1, 2, 3, 4, 5, 6].map((s, idx) => {
                    const isCompleted = phase > s;
                    const isCurrent = phase === s;
                    const active = isCompleted || isCurrent;
                    return (
                      <div key={s} className="flex items-center flex-1 last:flex-none">
                        <div className={`flex items-center justify-center shrink-0 w-5 h-5 sm:w-10 sm:h-10 rounded-full transition-colors duration-300 ${active ? 'bg-indigo-50 dark:bg-indigo-500/10' : 'bg-transparent'}`}>
                          <div className={`flex items-center justify-center w-5 h-5 sm:w-8 sm:h-8 rounded-full transition-all duration-300 ${active ? 'bg-indigo-600 text-white shadow-sm' : 'border-2 border-zinc-200 dark:border-zinc-700 text-zinc-400 bg-white dark:bg-zinc-900'}`}>
                            {isCompleted ? (
                              <Check className="h-2.5 w-2.5 sm:h-4 sm:w-4" strokeWidth={3} />
                            ) : (
                              <span className="text-[8px] sm:text-sm font-bold">{s}</span>
                            )}
                          </div>
                        </div>
                        {idx < 5 && (
                          <div className={`flex-1 h-0.5 sm:h-1 mx-0.5 sm:mx-2 rounded-full transition-colors duration-300 ${phase > s ? 'bg-indigo-600' : 'bg-zinc-200 dark:bg-zinc-800'}`} />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Breadcrumb Indicators */}
            {isWizardActive && (state.category || state.brand || state.model) && (
              <div ref={breadcrumbScrollRef} className="w-full max-w-full flex items-center gap-0.5 sm:gap-1.5 flex-nowrap overflow-x-auto scrollbar-hide px-0.5 pr-2 py-1 my-0.5">
                {state.category && (
                  <button
                    onClick={() => {
                      setState(s => ({ ...s, category: "", brand: "", model: "" }));
                      setPhase(1);
                    }}
                    className="shrink-0 whitespace-nowrap text-[10px] sm:text-[11px] font-bold bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-full px-2 sm:px-3.5 py-0.5 sm:py-1 text-zinc-700 dark:text-zinc-300 hover:border-red-400 hover:text-red-500 dark:hover:border-red-500 transition-colors shadow-2xs"
                  >
                    <span className="hidden sm:inline text-zinc-400 font-normal mr-1">Category:</span>
                    {state.category}
                  </button>
                )}
                {state.brand && (
                  <>
                    <ChevronRight className="shrink-0 h-2.5 w-2.5 sm:h-3 w-3 text-zinc-300 dark:text-zinc-700 -mx-0.5" />
                    <button
                      onClick={() => {
                        setState(s => ({ ...s, brand: "", model: "" }));
                        setPhase(1);
                      }}
                      className="shrink-0 whitespace-nowrap text-[10px] sm:text-[11px] font-bold bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-full px-2 sm:px-3.5 py-0.5 sm:py-1 text-zinc-700 dark:text-zinc-300 hover:border-red-400 hover:text-red-500 dark:hover:border-red-500 transition-colors shadow-2xs"
                    >
                      <span className="hidden sm:inline text-zinc-400 font-normal mr-1">Brand:</span>
                      {state.brand}
                    </button>
                  </>
                )}
                {state.model && (
                  <>
                    <ChevronRight className="shrink-0 h-2.5 w-2.5 sm:h-3 w-3 text-zinc-300 dark:text-zinc-700 -mx-0.5" />
                    <span className="min-w-0 flex-1 max-w-[120px] sm:max-w-xs whitespace-nowrap text-[10px] sm:text-[11px] font-black bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 rounded-full px-2 sm:px-3.5 py-0.5 sm:py-1 shadow-sm truncate" title={state.model}>
                      <span className="hidden sm:inline font-normal opacity-75 mr-1">Model:</span>
                      {state.model}
                    </span>
                  </>
                )}
              </div>
            )}

            {/* Main Stepper Card */}
            <div className="bg-white dark:bg-zinc-950 rounded-2xl sm:rounded-[2rem] border border-zinc-200 dark:border-zinc-800 shadow-xl overflow-hidden flex flex-col">
              <div className="p-3 sm:p-8 md:p-10 flex-1 flex flex-col justify-between">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={phase}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -15 }}
                    transition={{ duration: 0.25 }}
                    className="w-full flex-1 flex flex-col justify-between"
                  >
                    
                    {/* ── PHASE 1: Device Selection ── */}
                    {phase === 1 && (
                      <div className="space-y-6 flex-1">
                        <AnimatePresence mode="wait">
                          {!state.category ? (
                            <motion.div
                              key="select-category"
                              initial={{ opacity: 0, x: 15 }}
                              animate={{ opacity: 1, x: 0 }}
                              exit={{ opacity: 0, x: -15 }}
                              transition={{ duration: 0.2 }}
                              className="space-y-3 sm:space-y-6"
                            >
                              <StepHeader label="What device are we trading in?" sub="Select a category from our supported devices list." />
                              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                {catalogCats.map((cat) => {
                                  const meta = CAT_METADATA[cat.slug];
                                  const Icon = meta?.Icon ?? Smartphone;
                                  const glow = meta?.glow ?? "hover:shadow-zinc-500/10";
                                  const mood = meta?.mood ?? "bg-zinc-500/10 border-zinc-500/20";
                                  const moodIcon = meta?.moodIcon ?? "text-zinc-500";
                                  const catId = meta?.oldId ?? cat.slug;
                                  const count = cat.modelCount > 0 ? `${cat.modelCount}+ models` : "";
                                  return (
                                    <motion.button
                                      key={cat.id}
                                      whileHover={{ y: -4, scale: 1.02 }}
                                      whileTap={{ scale: 0.98 }}
                                      onClick={() => handleCategorySelect(catId)}
                                      className={`flex flex-col items-center gap-4 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 hover:border-zinc-950 dark:hover:border-zinc-200 transition-all text-center group bg-zinc-50 dark:bg-zinc-900 hover:bg-white dark:hover:bg-zinc-950 hover:shadow-lg ${glow}`}
                                    >
                                      <div className={`h-14 w-14 rounded-2xl bg-white dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-800 flex items-center justify-center shadow-sm group-hover:${mood} group-hover:border-transparent transition-all`}>
                                        <Icon className={`h-6 w-6 text-zinc-500 dark:text-zinc-400 group-hover:${moodIcon} transition-colors`} strokeWidth={1.5} />
                                      </div>
                                      <div>
                                        <p className="text-sm font-extrabold text-zinc-900 dark:text-zinc-100">{cat.name}</p>
                                        <p className="text-[10px] text-zinc-400 dark:text-zinc-500 font-bold uppercase tracking-wider mt-0.5">{count}</p>
                                      </div>
                                    </motion.button>
                                  );
                                })}
                                {/* Other Device tile */}
                                <motion.button
                                  key="other"
                                  whileHover={{ y: -4, scale: 1.02 }}
                                  whileTap={{ scale: 0.98 }}
                                  onClick={() => handleCategorySelect("Other")}
                                  className="flex flex-col items-center gap-4 p-6 rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-700 hover:border-zinc-950 dark:hover:border-white transition-all text-center group bg-zinc-50 dark:bg-zinc-900 hover:bg-white dark:hover:bg-zinc-950 hover:shadow-lg"
                                >
                                  <div className="h-14 w-14 rounded-2xl bg-white dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-800 flex items-center justify-center shadow-sm transition-all">
                                    <Package className="h-6 w-6 text-zinc-400 dark:text-zinc-500" strokeWidth={1.5} />
                                  </div>
                                  <div>
                                    <p className="text-sm font-extrabold text-zinc-900 dark:text-zinc-100">Other Device</p>
                                    <p className="text-[10px] text-zinc-400 dark:text-zinc-500 font-bold uppercase tracking-wider mt-0.5">Not listed above</p>
                                  </div>
                                </motion.button>
                              </div>
                            </motion.div>
                          ) : !state.brand ? (
                            <motion.div
                              key="select-brand"
                              initial={{ opacity: 0, x: 15 }}
                              animate={{ opacity: 1, x: 0 }}
                              exit={{ opacity: 0, x: -15 }}
                              transition={{ duration: 0.2 }}
                              className="space-y-3 sm:space-y-6"
                            >
                              <StepHeader label="Which brand is it?" sub={`Choose the manufacturer for your ${state.category === "Other" ? "device" : state.category.toLowerCase()}.`} />

                              {/* Brand filter / search */}
                              {(() => {
                                const catalogBrands = dynamicBrands;
                                const catalogKeys = new Set(catalogBrands.map(b => b.toLowerCase()));
                                // Brands that only exist in the "Other Search Devices" list — kept
                                // visually separate below so it's clear they're not full catalog devices.
                                const otherSeen = new Map<string, string>();
                                for (const d of otherDevices) {
                                  if (d.category !== state.category) continue;
                                  const b = normBrand(d.brand);
                                  const k = b.toLowerCase();
                                  if (!catalogKeys.has(k) && !otherSeen.has(k)) otherSeen.set(k, b);
                                }
                                const otherBrands = [...otherSeen.values()];
                                const allBrands = [...catalogBrands, ...otherBrands];
                                const applyFilter = (list: string[]) =>
                                  brandFilter.trim() ? list.filter(b => b.toLowerCase().includes(brandFilter.toLowerCase())) : list;
                                const filteredCatalog = applyFilter(catalogBrands);
                                const filteredOther = applyFilter(otherBrands);
                                return (
                                  <>
                                    {allBrands.length > 6 && (
                                      <div className="relative">
                                        <input
                                          type="text"
                                          value={brandFilter}
                                          onChange={(e) => setBrandFilter(e.target.value)}
                                          placeholder="Filter brands..."
                                          className="h-9 sm:h-11 w-full rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 pl-9 sm:pl-10 pr-4 text-xs font-semibold outline-none focus:border-accent text-zinc-900 dark:text-white transition-all"
                                        />
                                        <Search className="absolute left-3 sm:left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 sm:h-4 sm:w-4 text-zinc-400" />
                                        {brandFilter && (
                                          <button onClick={() => setBrandFilter("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-950 dark:hover:text-white">
                                            <X className="h-4 w-4" />
                                          </button>
                                        )}
                                      </div>
                                    )}

                                    <div
                                      className="overflow-y-auto pr-1 custom-scrollbar space-y-3"
                                      style={{ maxHeight: 'clamp(220px, calc(100dvh - 400px), 480px)' }}
                                    >
                                      {filteredCatalog.length > 0 && (
                                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                                          {filteredCatalog.map((brand) => (
                                            <motion.button
                                              key={brand}
                                              whileHover={{ scale: 1.02 }}
                                              whileTap={{ scale: 0.97 }}
                                              onClick={() => handleBrandSelect(brand)}
                                              className="p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-zinc-950 dark:hover:border-white text-center font-extrabold text-sm text-zinc-800 dark:text-zinc-200 transition-all hover:shadow-md"
                                            >
                                              {brand}
                                            </motion.button>
                                          ))}
                                        </div>
                                      )}
                                      {filteredOther.length > 0 && (
                                        <>
                                          <div className="flex items-center gap-3">
                                            <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
                                            <span className="text-[10px] font-black uppercase tracking-wide text-zinc-400 shrink-0">Other brands</span>
                                            <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
                                          </div>
                                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                                            {filteredOther.map((brand) => (
                                              <motion.button
                                                key={brand}
                                                whileHover={{ scale: 1.02 }}
                                                whileTap={{ scale: 0.97 }}
                                                onClick={() => handleBrandSelect(brand)}
                                                className="p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-zinc-950 dark:hover:border-white text-center font-extrabold text-sm text-zinc-800 dark:text-zinc-200 transition-all hover:shadow-md"
                                              >
                                                {brand}
                                              </motion.button>
                                            ))}
                                          </div>
                                        </>
                                      )}
                                      {filteredCatalog.length === 0 && filteredOther.length === 0 && (
                                        <p className="text-xs text-zinc-400 text-center py-4">No brands match &quot;{brandFilter}&quot;</p>
                                      )}
                                    </div>
                                  </>
                                );
                              })()}

                              {/* Custom brand entry */}
                              <div className="border-t border-zinc-100 dark:border-zinc-800 pt-4">
                                {!showCustomBrand ? (
                                  <button
                                    onClick={() => setShowCustomBrand(true)}
                                    className="w-full flex items-center justify-center gap-2 text-xs font-bold text-zinc-400 hover:text-zinc-950 dark:hover:text-white transition-colors"
                                  >
                                    <Plus className="h-3.5 w-3.5" />
                                    My brand isn&apos;t listed — enter it manually
                                  </button>
                                ) : (
                                  <div className="flex gap-2">
                                    <input
                                      autoFocus
                                      type="text"
                                      value={customBrandInput}
                                      onChange={(e) => setCustomBrandInput(e.target.value)}
                                      onKeyDown={(e) => { if (e.key === 'Enter' && customBrandInput.trim()) handleBrandSelect(customBrandInput.trim()); }}
                                      placeholder="e.g. Fairphone, DJI, Caterpillar..."
                                      className="flex-1 h-12 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-4 text-sm font-semibold outline-none focus:border-accent text-zinc-900 dark:text-white"
                                    />
                                    <button
                                      disabled={!customBrandInput.trim()}
                                      onClick={() => handleBrandSelect(customBrandInput.trim())}
                                      className="h-12 px-5 rounded-xl bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 text-xs font-black disabled:opacity-40 transition-all hover:bg-zinc-800 dark:hover:bg-zinc-100"
                                    >
                                      Continue →
                                    </button>
                                  </div>
                                )}
                              </div>
                            </motion.div>
                          ) : (
                            <motion.div
                              key="select-model"
                              initial={{ opacity: 0, x: 15 }}
                              animate={{ opacity: 1, x: 0 }}
                              exit={{ opacity: 0, x: -15 }}
                              transition={{ duration: 0.2 }}
                              className="space-y-3 sm:space-y-6"
                            >
                              <StepHeader label="Which model is it?" />

                              {/* Smart fuzzy search */}
                              {(() => {
                                // Merge real catalog models for this brand with "other" list models
                                // for the same brand+category — a brand can be catalog-only (Apple),
                                // other-only (Xiaomi), or occasionally both, so neither source alone
                                // is reliable for every brand.
                                const otherModelsForBrand = otherDevices
                                  .filter(d => d.category === state.category && normBrand(d.brand).toLowerCase() === normBrand(state.brand).toLowerCase())
                                  .map(d => ({ model: d.name, tradeInMode: 'unpriced' as const, attributeOptions: [] as { label: string; options: string[] }[] }));
                                const catalogModelNames = new Set(dynamicModelData.map(m => m.model.toLowerCase()));
                                const dedupedOther = otherModelsForBrand.filter(m => !catalogModelNames.has(m.model.toLowerCase()));
                                const otherModelsGroup = dedupedOther;

                                const modelPool = [...dynamicModelData, ...otherModelsGroup];

                                const fuse = new Fuse(modelPool, {
                                  keys: ['model'],
                                  threshold: 0.45,
                                  ignoreLocation: true,
                                  includeScore: true,
                                });

                                const isSearching = !!wizardModelSearch.trim();
                                const suggestions = isSearching
                                  ? fuse.search(wizardModelSearch).slice(0, 6).map(r => r.item)
                                  : modelPool;

                                const renderModelButton = ({ model, tradeInMode, attributeOptions }: { model: string; tradeInMode: 'auto' | 'manual_price' | 'unpriced'; attributeOptions?: { label: string; options: string[] }[] }) => (
                                  <motion.button
                                    key={model}
                                    whileHover={{ x: 4 }}
                                    onClick={() => {
                                      setState(s => ({ ...s, model, tradeInMode }));
                                      setCatalogAttributeOptions(attributeOptions ?? []);
                                      goToPhase(2);
                                    }}
                                    className="flex items-center justify-between px-5 py-4 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:border-zinc-950 dark:hover:border-white hover:bg-zinc-50 dark:hover:bg-zinc-950 bg-white dark:bg-zinc-900 text-xs font-bold text-left transition-all hover:shadow-sm group text-zinc-800 dark:text-zinc-200"
                                  >
                                    <span>{model}</span>
                                    <div className="flex items-center gap-2 shrink-0">
                                      {tradeInMode === 'auto' && (
                                        <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">Auto-price</span>
                                      )}
                                      {tradeInMode === 'manual_price' && (
                                        // Same customer-facing text as the real "auto" badge — the blue
                                        // (vs emerald) color is only an internal signal that an admin
                                        // manually set/adjusted this price, not for the customer to notice.
                                        <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">Auto-price</span>
                                      )}
                                      {tradeInMode === 'unpriced' && (
                                        <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">Manual Review</span>
                                      )}
                                      <ChevronRight className="h-4 w-4 text-zinc-400 group-hover:text-zinc-950 dark:group-hover:text-white group-hover:translate-x-0.5 transition-all" />
                                    </div>
                                  </motion.button>
                                );

                                return (
                                  <>
                                    {/* Search input */}
                                    <div className="relative">
                                      <input
                                        type="text"
                                        autoFocus={modelPool.length === 0}
                                        placeholder={modelPool.length === 0 ? "Type your model name..." : `Search ${state.brand} models...`}
                                        value={wizardModelSearch}
                                        onChange={(e) => setWizardModelSearch(e.target.value)}
                                        className="h-10 sm:h-12 w-full rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 pl-9 sm:pl-11 pr-9 sm:pr-10 text-xs font-semibold outline-none focus:border-accent focus:bg-white dark:focus:bg-zinc-950 text-zinc-900 dark:text-white transition-all"
                                      />
                                      <Search className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 h-3.5 w-3.5 sm:h-4.5 sm:w-4.5 text-zinc-400" />
                                      {wizardModelSearch && (
                                        <button
                                          onClick={() => setWizardModelSearch("")}
                                          className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                                        >
                                          Clear
                                        </button>
                                      )}
                                    </div>

                                    {/* Suggestion list */}
                                    {!isSearching && suggestions.length > 0 && (
                                      <div
                                      className="overflow-y-auto pr-1 custom-scrollbar space-y-3"
                                      style={{ maxHeight: 'clamp(220px, calc(100dvh - 400px), 480px)' }}
                                    >
                                        {dynamicModelData.length > 0 && (
                                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                            {dynamicModelData.map(renderModelButton)}
                                          </div>
                                        )}
                                        {otherModelsGroup.length > 0 && (
                                          <>
                                            {dynamicModelData.length > 0 && (
                                              <div className="flex items-center gap-3">
                                                <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
                                                <span className="text-[10px] font-black uppercase tracking-wide text-zinc-400 shrink-0">Other models</span>
                                                <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
                                              </div>
                                            )}
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                              {otherModelsGroup.map(renderModelButton)}
                                            </div>
                                          </>
                                        )}
                                      </div>
                                    )}
                                    {isSearching && suggestions.length > 0 && (
                                      <div
                                        className="grid grid-cols-1 sm:grid-cols-2 gap-2 overflow-y-auto pr-1 custom-scrollbar"
                                        style={{ maxHeight: 'clamp(220px, calc(100dvh - 400px), 480px)' }}
                                      >
                                        {suggestions.map(renderModelButton)}
                                      </div>
                                    )}

                                    {/* Empty state for unknown brand */}
                                    {modelPool.length === 0 && !wizardModelSearch && (
                                      <p className="text-xs text-zinc-400 text-center py-3">
                                        We don&apos;t have models for this brand yet — type your model name above to continue.
                                      </p>
                                    )}

                                    {/* "Use this name" escape hatch */}
                                    {wizardModelSearch.trim() && (
                                      <motion.button
                                        initial={{ opacity: 0, y: 6 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        onClick={() => {
                                          setState(s => ({ ...s, model: wizardModelSearch.trim(), tradeInMode: 'unpriced' }));
                                          goToPhase(2);
                                        }}
                                        className="w-full flex items-center gap-3 px-5 py-4 rounded-xl border-2 border-dashed border-zinc-300 dark:border-zinc-700 hover:border-zinc-950 dark:hover:border-white text-xs font-bold text-zinc-500 hover:text-zinc-950 dark:hover:text-white transition-all group"
                                      >
                                        <Plus className="h-4 w-4 shrink-0 text-zinc-400 group-hover:text-zinc-950 dark:group-hover:text-white" />
                                        <span>Use &quot;<strong>{wizardModelSearch}</strong>&quot; — submit for manual review</span>
                                        <span className="ml-auto text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-400 dark:bg-zinc-800 shrink-0">Manual Review</span>
                                      </motion.button>
                                    )}
                                  </>
                                );
                              })()}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )}

                    {/* ── PHASE 2: Configuration & Grading ── */}
                    {phase === 2 && (() => {
                      // Real per-device attributes (from the catalog entry actually selected) win over
                      // AI-guessed specs, which in turn win over the generic per-category fallback list.
                      // Condition/grade is always captured by the dedicated Physical Grade selector
                      // below, so drop any spec (AI-guessed or otherwise) that would duplicate it.
                      // Region/import-variant is never relevant to a trade-in and must never be asked.
                      const dropConditionSpec = (specs: { label: string; options: string[] }[]) =>
                        specs.filter(s => !/condition|grade|physical state/i.test(s.label))
                             .filter(s => !/^(region|region\s*\/\s*model variant|model variant|import region|carrier region|network region)$/i.test(s.label.trim()));
                      const isMultiSelectSpec = (spec: { label: string; options: string[]; isMulti?: boolean }) => {
                        if (typeof spec.isMulti === "boolean") return spec.isMulti;
                        const label = spec.label.trim();
                        if (/^(controllers|cables|storage|ram|color|colorway|network|connectivity|type|case size|model|edition)$/i.test(label)) {
                          return false;
                        }
                        const isAccessoryLabel = /(included accessories|accessories included|accessories|bundled items|extras included|optional extras|included extras)/i.test(label);
                        if (!isAccessoryLabel) return false;
                        const hasMutuallyExclusiveOptions = spec.options.some(opt =>
                          /^(no |none$|only$|\d+\s*(controller|cable|item|accessory))/i.test(opt.trim())
                        );
                        return !hasMutuallyExclusiveOptions;
                      };
                      // A category that already has its own dedicated fields (e.g. Controllers/Cables
                      // for consoles) should never also get the AI's generic catch-all accessory
                      // bucket merged in — that's what was asking "Controllers" and "Cables" twice,
                      // once standalone and once folded into "Accessories Included".
                      const GENERIC_ACCESSORY_LABEL = /^(accessories( included)?|included accessories|bundled items|extras included|optional extras|included extras)$/i;
                      const dedupedAiSpecs = currentSpecs.length > 0
                        ? aiSpecs.filter(s => !GENERIC_ACCESSORY_LABEL.test(s.label.trim()))
                        : aiSpecs;
                      const rawSpecs = catalogAttributeOptions.length > 0 ? catalogAttributeOptions
                        : dedupedAiSpecs.length > 0 ? dedupedAiSpecs : currentSpecs;
                      const mergedSpecs = [...rawSpecs];
                      currentSpecs.forEach(sysSpec => {
                        const exists = mergedSpecs.some(s => s.label.trim().toLowerCase() === sysSpec.label.trim().toLowerCase());
                        if (!exists) {
                          mergedSpecs.push(sysSpec);
                        }
                      });
                      const specsToShow = dropConditionSpec(mergedSpecs);
                      const specsComplete = specsToShow.length === 0 || specsToShow.every(s => isMultiSelectSpec(s) || !!state.specs[s.label]);
                      const canProceedPhase2 = specsComplete && !!state.condition;
                      return (
                        <div className="space-y-8 flex-1 flex flex-col justify-between">
                          <div className="space-y-2.5 sm:space-y-3">
                            <div className="flex items-center gap-2">
                              <h2 className="font-sans text-lg sm:text-2xl md:text-3xl font-extrabold tracking-tight text-zinc-950 dark:text-white">
                                Device Specifications
                              </h2>
                              {aiSpecs.length > 0 && !aiSpecsLoading && (
                                <Sparkles className="h-4 w-4 sm:h-5 sm:w-5 text-zinc-950 dark:text-white shrink-0" strokeWidth={2} />
                              )}
                            </div>

                            {/* Specification selectors — skeleton while AI loads, then pills */}
                            {aiSpecsLoading ? (
                              <div className="space-y-3 border-b border-zinc-100 dark:border-zinc-800 pb-3">
                                <div className="flex items-center gap-2 text-xs text-zinc-400">
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  <span className="font-semibold">Getting relevant specs for your device...</span>
                                </div>
                                <div className="grid gap-2.5 sm:gap-3 sm:grid-cols-2">
                                  {[1, 2].map(i => (
                                    <div key={i} className="space-y-1">
                                      <div className="h-3 w-20 bg-zinc-100 dark:bg-zinc-800 rounded animate-pulse" />
                                      <div className="flex gap-1.5">
                                        {[1, 2, 3].map(j => (
                                          <div key={j} className="h-9 w-16 bg-zinc-100 dark:bg-zinc-800 rounded-xl animate-pulse" />
                                        ))}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : specsToShow.length > 0 ? (
                              <div className="space-y-2.5 border-b border-zinc-100 dark:border-zinc-800 pb-3">
                                <div className="grid gap-2.5 sm:gap-3 sm:grid-cols-2">
                                  {specsToShow.map((spec) => {
                                    const isMulti = isMultiSelectSpec(spec);
                                    const selectedValues = (state.specs[spec.label] || "")
                                      .split(",")
                                      .map(s => s.trim())
                                      .filter(Boolean);

                                    return (
                                      <div key={spec.label} className="space-y-1">
                                        <div className="flex items-center justify-between gap-2">
                                          <span className="text-xs font-extrabold text-zinc-800 dark:text-zinc-200">{spec.label}</span>
                                          {isMulti && (
                                            <span className="text-[9px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">(Multi-select)</span>
                                          )}
                                        </div>
                                        <div className="flex flex-wrap gap-1.5">
                                          {spec.options.map((opt) => {
                                            const isSelected = isMulti
                                              ? selectedValues.includes(opt)
                                              : state.specs[spec.label] === opt;

                                            const handleOptionClick = () => {
                                              if (isMulti) {
                                                let updated: string[];
                                                if (selectedValues.includes(opt)) {
                                                  updated = selectedValues.filter(v => v !== opt);
                                                } else {
                                                  updated = [...selectedValues, opt];
                                                }
                                                setState(s => ({
                                                  ...s,
                                                  specs: { ...s.specs, [spec.label]: updated.join(", ") },
                                                }));
                                              } else {
                                                setState(s => ({
                                                  ...s,
                                                  specs: { ...s.specs, [spec.label]: isSelected ? "" : opt },
                                                }));
                                              }
                                            };

                                            return (
                                              <button
                                                key={opt}
                                                type="button"
                                                onClick={handleOptionClick}
                                                className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all ${
                                                  isSelected
                                                    ? "border-zinc-950 bg-zinc-950 text-white shadow-sm dark:border-white dark:bg-white dark:text-zinc-950"
                                                    : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-950 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-white"
                                                }`}
                                              >
                                                {opt}
                                              </button>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            ) : (
                              <p className="text-xs text-zinc-400 font-semibold pb-2">
                                No specific configuration options for this device — just select the physical grade below.
                              </p>
                            )}

                            {/* Condition grade selector */}
                            <div className="space-y-3 pt-1">
                              <h4 className="text-xs font-black uppercase tracking-widest text-zinc-400">Condition</h4>
                              <div className="grid gap-3 sm:grid-cols-2">
                                {CONDITIONS.map((c) => {
                                  const isSelected = state.condition === c.id;
                                  return (
                                    <button
                                      key={c.id}
                                      onClick={() => setState(s => ({ ...s, condition: c.id }))}
                                      className={`p-4 w-full rounded-2xl border text-left transition-all flex items-start gap-3 ${
                                        isSelected
                                          ? "border-zinc-950 bg-zinc-950 text-white shadow-md dark:border-white dark:bg-white dark:text-zinc-950"
                                          : `${c.color} hover:border-zinc-300 dark:hover:border-zinc-700 text-zinc-800 dark:text-zinc-200`
                                      }`}
                                    >
                                      <div className={`h-3 w-3 rounded-full mt-1 shrink-0 ${c.dot}`} />
                                      <div className="flex-1">
                                        <p className={`text-xs font-black ${isSelected ? "text-white dark:text-zinc-950" : "text-zinc-900 dark:text-zinc-100"}`}>{c.label}</p>
                                        <p className={`text-[10px] leading-snug mt-1 ${isSelected ? "text-white/70 dark:text-zinc-950/70" : c.descColor}`}>{c.desc}</p>
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          </div>

                          {/* Continue Button */}
                          <div className="pt-6 border-t border-zinc-100 dark:border-zinc-800 flex flex-col sm:flex-row sm:justify-end">
                            <motion.button
                              whileHover={{ y: -2 }}
                              whileTap={{ scale: 0.98 }}
                              disabled={!canProceedPhase2}
                              onClick={() => goToPhase(3)}
                              className="w-full sm:w-auto h-12 px-8 bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-50 disabled:pointer-events-none rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 shadow-lg shrink-0"
                            >
                              <span className="whitespace-nowrap">Quick Check</span>
                              <ArrowRight className="h-4 w-4 shrink-0" />
                            </motion.button>
                          </div>
                        </div>
                      );
                    })()}

                    {/* ── PHASE 3: Diagnostics (one question at a time) ── */}
                    {phase === 3 && (() => {
                      const q = currentQuestions[diagIndex];
                      const isLast = diagIndex === currentQuestions.length - 1;
                      // Check each question individually — more reliable than counting keys
                      const allAnswered = currentQuestions.length > 0 &&
                        currentQuestions.every(cq => typeof state.answers[cq.id] === "string" && state.answers[cq.id].length > 0);

                      if (!q) {
                        // No questions for this category — skip straight to offer
                        goToPhase(4);
                        return null;
                      }
                      return (
                        <div className="flex-1 flex flex-col justify-between gap-6">
                          <div className="space-y-5">
                            {/* Progress dots — green when answered, dark for current, grey for future */}
                            <div className="flex gap-1.5">
                              {currentQuestions.map((cq, i) => (
                                <div
                                  key={i}
                                  className={`h-1.5 rounded-full flex-1 transition-all duration-300 ${
                                    state.answers[cq.id] ? "bg-emerald-500" :
                                    i === diagIndex ? "bg-zinc-950 dark:bg-white" :
                                    "bg-zinc-200 dark:bg-zinc-800"
                                  }`}
                                />
                              ))}
                            </div>

                            <div className="flex items-center justify-between">
                              <StepHeader
                                label={q.question}
                                sub={`Question ${diagIndex + 1} of ${currentQuestions.length}`}
                              />
                            </div>

                            <AnimatePresence mode="wait">
                              <motion.div
                                key={diagIndex}
                                initial={{ opacity: 0, x: 16 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -16 }}
                                transition={{ duration: 0.2 }}
                                className="space-y-2.5"
                              >
                                {q.options.map((opt) => {
                                  const isSelected = state.answers[q.id] === opt;
                                  return (
                                    <button
                                      key={opt}
                                      type="button"
                                      onClick={() => {
                                        // Build new answers with this answer included
                                        const newAnswers = { ...state.answers, [q.id]: opt };
                                        setState(s => ({ ...s, answers: newAnswers }));

                                        if (isLast) {
                                          // Last question: auto-advance to offer once all are answered
                                          const nowComplete = currentQuestions.every(
                                            cq => typeof newAnswers[cq.id] === "string" && newAnswers[cq.id].length > 0
                                          );
                                          if (nowComplete) {
                                            setTimeout(() => goToPhase(4), 350);
                                          }
                                        } else {
                                          setTimeout(() => setDiagIndex(i => i + 1), 260);
                                        }
                                      }}
                                      className={`w-full px-5 py-4 rounded-2xl border text-sm font-semibold text-left transition-all flex items-center justify-between ${
                                        isSelected
                                          ? "border-zinc-950 bg-zinc-950 text-white shadow-sm dark:border-white dark:bg-white dark:text-zinc-950"
                                          : "border-zinc-200 bg-white hover:border-zinc-400 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-white dark:hover:bg-zinc-950"
                                      }`}
                                    >
                                      <span>{opt}</span>
                                      {isSelected && <Check className="h-4 w-4 shrink-0 text-white dark:text-zinc-950" strokeWidth={3} />}
                                    </button>
                                  );
                                })}
                              </motion.div>
                            </AnimatePresence>
                          </div>

                          <div className="pt-6 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between gap-3">
                            <button
                              onClick={() => {
                                if (diagIndex > 0) setDiagIndex(i => i - 1);
                                else goToPhase(2);
                              }}
                              className="h-12 px-5 border border-zinc-200 dark:border-zinc-800 rounded-xl font-bold text-xs text-zinc-600 dark:text-zinc-400 hover:border-zinc-950 dark:hover:border-white hover:text-zinc-950 dark:hover:text-white transition-colors flex items-center gap-2"
                            >
                              <ArrowLeft className="h-4 w-4" /> Back
                            </button>

                            {isLast ? (
                              <motion.button
                                whileHover={{ y: -2 }}
                                whileTap={{ scale: 0.98 }}
                                disabled={!allAnswered}
                                onClick={() => goToPhase(4)}
                                className="h-12 px-8 bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-50 disabled:pointer-events-none rounded-xl text-xs font-black transition-all flex items-center gap-2 shadow-lg"
                              >
                                <span>Get My Offer</span>
                                <ArrowRight className="h-4 w-4" />
                              </motion.button>
                            ) : (
                              <motion.button
                                whileHover={{ y: -2 }}
                                disabled={!state.answers[q.id]}
                                onClick={() => setDiagIndex(i => i + 1)}
                                className="h-12 px-8 bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-50 disabled:pointer-events-none rounded-xl text-xs font-black transition-all flex items-center gap-2 shadow-lg"
                              >
                                <span>Next</span>
                                <ArrowRight className="h-4 w-4" />
                              </motion.button>
                            )}
                          </div>
                        </div>
                      );
                    })()}

                    {/* ── PHASE 4: Valuation & Offer ── */}
                    {phase === 4 && (
                      <div className="space-y-6 flex-1 flex flex-col justify-between">

                        {/* Manual Review Path — no pricing data available for this model */}
                        {state.tradeInMode === 'unpriced' && (
                          <div className="flex-1 flex flex-col justify-between animate-fade-in">
                            <div className="space-y-6">
                              <div className="flex flex-col items-center text-center gap-4 pt-4">
                                <div className="h-16 w-16 rounded-2xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 flex items-center justify-center">
                                  <Clock className="h-8 w-8 text-amber-500" />
                                </div>
                                <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 text-amber-700 border border-amber-500/25 px-3 py-1 text-[10px] font-black uppercase tracking-wider">
                                  Manual Review Required
                                </div>
                                <h3 className="text-xl font-black text-zinc-950 dark:text-white leading-snug max-w-xs">
                                  We'll personally assess your {state.model}
                                </h3>
                                <p className="text-sm font-semibold text-zinc-500 dark:text-zinc-400 max-w-sm leading-relaxed">
                                  {aiManualFallback
                                    ? "Our instant pricing service is unavailable right now. Add a few photos so our team can assess the condition, then submit and we'll send you a custom cash offer within 24 hours."
                                    : "We don't have live market pricing for this model yet. Add a few photos so our team can assess the condition, then submit and we'll send you a custom cash offer within 24 hours."}
                                </p>
                              </div>

                              <div className="max-w-md mx-auto w-full space-y-3">
                                <span className="text-xs font-black uppercase tracking-widest text-zinc-400 block">Device Photos <span className="text-red-500 dark:text-red-400">(Required · min 1)</span></span>

                                <div className="grid grid-cols-2 gap-2">
                                  <motion.button
                                    whileHover={{ scale: 1.01 }}
                                    whileTap={{ scale: 0.99 }}
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={imageUploading}
                                    className="border-2 border-dashed border-zinc-300 dark:border-zinc-800 hover:border-zinc-950 dark:hover:border-white rounded-2xl p-6 flex flex-col items-center gap-3 transition-all bg-zinc-50 dark:bg-zinc-900 hover:bg-white dark:hover:bg-zinc-950 group disabled:opacity-60 disabled:pointer-events-none"
                                  >
                                    <div className="h-11 w-11 rounded-xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 shadow-sm flex items-center justify-center group-hover:bg-zinc-950 dark:group-hover:bg-white group-hover:border-zinc-950 dark:group-hover:border-white transition-all">
                                      {imageUploading ? (
                                        <div className="h-5 w-5 border-2 border-zinc-300 dark:border-zinc-700 border-t-zinc-700 dark:border-t-zinc-200 rounded-full animate-spin" />
                                      ) : (
                                        <Upload className="h-5 w-5 text-zinc-400 dark:text-zinc-500 group-hover:text-white dark:group-hover:text-zinc-950 transition-colors" />
                                      )}
                                    </div>
                                    <div className="text-center">
                                      <p className="text-xs font-black text-zinc-800 dark:text-zinc-200">{imageUploading ? "Uploading…" : "Upload photos"}</p>
                                      <p className="text-[10px] text-zinc-400 dark:text-zinc-500 font-bold mt-1">JPEG or PNG · up to 6</p>
                                    </div>
                                  </motion.button>
                                  <motion.button
                                    whileHover={{ scale: 1.01 }}
                                    whileTap={{ scale: 0.99 }}
                                    onClick={() => setCameraOpen(true)}
                                    disabled={imageUploading}
                                    className="border-2 border-dashed border-zinc-300 dark:border-zinc-800 hover:border-zinc-950 dark:hover:border-white rounded-2xl p-6 flex flex-col items-center gap-3 transition-all bg-zinc-50 dark:bg-zinc-900 hover:bg-white dark:hover:bg-zinc-950 group disabled:opacity-60 disabled:pointer-events-none"
                                  >
                                    <div className="h-11 w-11 rounded-xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 shadow-sm flex items-center justify-center group-hover:bg-zinc-950 dark:group-hover:bg-white group-hover:border-zinc-950 dark:group-hover:border-white transition-all">
                                      <Camera className="h-5 w-5 text-zinc-400 dark:text-zinc-500 group-hover:text-white dark:group-hover:text-zinc-950 transition-colors" />
                                    </div>
                                    <div className="text-center">
                                      <p className="text-xs font-black text-zinc-800 dark:text-zinc-200">Take photo</p>
                                      <p className="text-[10px] text-zinc-400 dark:text-zinc-500 font-bold mt-1">Use your camera</p>
                                    </div>
                                  </motion.button>
                                </div>

                                {images.length > 0 && (
                                  <div className="grid grid-cols-3 gap-2">
                                    {images.map((img, i) => (
                                      <div key={i} className="relative aspect-square rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800 group">
                                        <img src={img.previewUrl} alt={`Preview ${i + 1}`} className="w-full h-full object-cover" />
                                        <button
                                          onClick={() => setImages(prev => prev.filter((_, idx) => idx !== i))}
                                          className="absolute top-1.5 right-1.5 h-6 w-6 bg-zinc-950/80 hover:bg-red-500 rounded-full flex items-center justify-center transition-colors"
                                        >
                                          <X className="h-3.5 w-3.5 text-white" />
                                        </button>
                                      </div>
                                    ))}
                                    {images.length < 6 && (
                                      <button
                                        onClick={() => fileInputRef.current?.click()}
                                        disabled={imageUploading}
                                        className="aspect-square rounded-xl border-2 border-dashed border-zinc-200 dark:border-zinc-800 hover:border-zinc-950 dark:hover:border-white bg-zinc-50 dark:bg-zinc-900 flex items-center justify-center transition-colors text-zinc-400 hover:text-zinc-900 dark:hover:text-white disabled:opacity-50"
                                      >
                                        <Plus className="h-5 w-5" />
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>

                              {/* Additional notes */}
                              <div className="max-w-md mx-auto w-full space-y-2">
                                <label className="text-xs font-black uppercase tracking-widest text-zinc-400 block">
                                  Additional Notes <span className="text-zinc-300 font-bold normal-case tracking-normal">(optional)</span>
                                </label>
                                <textarea
                                  rows={3}
                                  maxLength={1000}
                                  placeholder="Any extra info about the device — damage, accessories included, original box, etc."
                                  value={state.customerNotes ?? ""}
                                  onChange={e => setState(s => ({ ...s, customerNotes: e.target.value }))}
                                  className="w-full rounded-2xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-4 py-3 text-sm font-semibold outline-none focus:border-zinc-950 dark:focus:border-white text-zinc-900 dark:text-white resize-none transition-colors placeholder:font-normal placeholder:text-zinc-400"
                                />
                                <p className="text-[10px] text-zinc-400 text-right">{(state.customerNotes ?? "").length}/1000</p>
                              </div>

                              <div className="max-w-md mx-auto bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 sm:p-5 text-left space-y-3">
                                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-1 sm:gap-4 text-xs">
                                  <span className="font-extrabold text-zinc-400 uppercase tracking-wide shrink-0">Device Model</span>
                                  <span className="font-black text-zinc-900 dark:text-zinc-100 text-left sm:text-right">{state.model}</span>
                                </div>
                                {Object.keys(state.specs).length > 0 && (
                                  <>
                                    <div className="h-px bg-zinc-200/60 dark:bg-zinc-800" />
                                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-1 sm:gap-4 text-xs">
                                      <span className="font-extrabold text-zinc-400 uppercase tracking-wide shrink-0">Specs selected</span>
                                      <span className="font-black text-zinc-900 dark:text-zinc-100 text-left sm:text-right leading-snug">
                                        {Object.entries(state.specs).filter(([_, val]) => !!val).map(([_, val]) => val).join(" · ")}
                                      </span>
                                    </div>
                                  </>
                                )}
                                <div className="h-px bg-zinc-200/60 dark:bg-zinc-800" />
                                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-1 sm:gap-4 text-xs">
                                  <span className="font-extrabold text-zinc-400 uppercase tracking-wide shrink-0">Grade</span>
                                  <span className="font-black text-zinc-900 dark:text-zinc-100 text-left sm:text-right">{state.condition}</span>
                                </div>
                                <div className="h-px bg-zinc-200/60 dark:bg-zinc-800" />
                                <div className="flex items-start gap-2 text-[10px] font-semibold text-amber-600 dark:text-amber-400 pt-1">
                                  <Clock className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                                  Offer sent by email within 24 hours of submission
                                </div>
                              </div>
                            </div>

                            <div className="pt-6 border-t border-zinc-100 dark:border-zinc-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-3">
                              <button
                                disabled={images.length === 0}
                                onClick={() => goToPhase(5)}
                                className="w-full sm:w-auto h-12 px-8 bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-50 disabled:pointer-events-none rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 shadow-lg shrink-0"
                              >
                                <span className="whitespace-nowrap">Submit for Review</span>
                                <ArrowRight className="h-4 w-4 shrink-0" />
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Auto-price path */}
                        {state.tradeInMode !== 'unpriced' && (
                        <>
                        {/* Loading State */}
                        {aiLoading && (
                          <div className="flex-1 flex flex-col items-center justify-center py-12 text-center">
                            <motion.div
                              animate={{ rotate: 360 }}
                              transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }}
                              className="h-14 w-14 border-4 border-zinc-200 dark:border-zinc-800 border-t-zinc-950 dark:border-t-white rounded-full mb-6"
                            />
                            <h3 className="text-lg font-black text-zinc-900 dark:text-white mb-2">Analyzing Valuation</h3>
                            <p className="text-xs font-semibold text-zinc-400 tracking-wider animate-pulse uppercase">{aiLoadingText}</p>
                          </div>
                        )}

                        {/* Error Screen */}
                        {!aiLoading && aiError && aiPrice === null && (
                          <div className="flex-1 flex flex-col items-center justify-center gap-6 py-8">
                            <div className="h-14 w-14 rounded-full bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30 flex items-center justify-center">
                              <X className="h-6 w-6 text-red-500" />
                            </div>
                            <div className="text-center space-y-2">
                              <p className="text-sm font-black text-zinc-950 dark:text-white">Could not reach pricing service</p>
                              <p className="text-xs font-semibold text-zinc-400 max-w-xs">Check your connection and try again. If it fails once more, we'll send your device for manual review instead.</p>
                            </div>
                            <button
                              onClick={() => { setAiError(false); fetchAiPrice(); }}
                              className="h-11 px-6 bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 rounded-xl text-xs font-black hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors"
                            >
                              Retry
                            </button>
                          </div>
                        )}

                        {/* Setup Screen (Before Calculation) */}
                        {!aiLoading && !aiError && aiPrice === null && (
                          <div className="space-y-6 flex-1 flex flex-col justify-between">
                            <div className="space-y-4">
                              <StepHeader label="Device Photos" />

                              <div className="grid grid-cols-2 gap-2.5">
                                <motion.button
                                  whileHover={{ scale: 1.01 }}
                                  whileTap={{ scale: 0.99 }}
                                  onClick={() => fileInputRef.current?.click()}
                                  disabled={imageUploading}
                                  className="border-2 border-dashed border-zinc-300 dark:border-zinc-800 hover:border-zinc-950 dark:hover:border-white rounded-2xl p-4 sm:p-6 py-5 flex flex-col items-center justify-center gap-2 sm:gap-3 transition-all bg-zinc-50 dark:bg-zinc-900 hover:bg-white dark:hover:bg-zinc-950 group disabled:opacity-60 disabled:pointer-events-none"
                                >
                                  <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 shadow-sm flex items-center justify-center group-hover:bg-zinc-950 dark:group-hover:bg-white group-hover:border-zinc-950 dark:group-hover:border-white transition-all">
                                    {imageUploading ? (
                                      <div className="h-5 w-5 border-2 border-zinc-300 dark:border-zinc-700 border-t-zinc-700 dark:border-t-zinc-200 rounded-full animate-spin" />
                                    ) : (
                                      <Upload className="h-5 w-5 text-zinc-400 dark:text-zinc-500 group-hover:text-white dark:group-hover:text-zinc-950 transition-colors" />
                                    )}
                                  </div>
                                  <div className="text-center">
                                    <p className="text-xs font-black text-zinc-800 dark:text-zinc-200">{imageUploading ? "Uploading…" : "Upload photos"}</p>
                                    <p className="text-[10px] text-zinc-400 dark:text-zinc-500 font-bold mt-0.5">JPEG or PNG · 1–6 required</p>
                                  </div>
                                </motion.button>
                                <motion.button
                                  whileHover={{ scale: 1.01 }}
                                  whileTap={{ scale: 0.99 }}
                                  onClick={() => setCameraOpen(true)}
                                  disabled={imageUploading}
                                  className="border-2 border-dashed border-zinc-300 dark:border-zinc-800 hover:border-zinc-950 dark:hover:border-white rounded-2xl p-4 sm:p-6 py-5 flex flex-col items-center justify-center gap-2 sm:gap-3 transition-all bg-zinc-50 dark:bg-zinc-900 hover:bg-white dark:hover:bg-zinc-950 group disabled:opacity-60 disabled:pointer-events-none"
                                >
                                  <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 shadow-sm flex items-center justify-center group-hover:bg-zinc-950 dark:group-hover:bg-white group-hover:border-zinc-950 dark:group-hover:border-white transition-all">
                                    <Camera className="h-5 w-5 text-zinc-400 dark:text-zinc-500 group-hover:text-white dark:group-hover:text-zinc-950 transition-colors" />
                                  </div>
                                  <div className="text-center">
                                    <p className="text-xs font-black text-zinc-800 dark:text-zinc-200">Take photo</p>
                                    <p className="text-[10px] text-zinc-400 dark:text-zinc-500 font-bold mt-0.5">Use your camera</p>
                                  </div>
                                </motion.button>
                              </div>

                              {images.length > 0 && (
                                <div className="grid grid-cols-3 gap-2">
                                  {images.map((img, i) => (
                                    <div key={i} className="relative aspect-square rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800 group">
                                      <img src={img.previewUrl} alt={`Preview ${i + 1}`} className="w-full h-full object-cover" />
                                      <button
                                        onClick={() => setImages(prev => prev.filter((_, idx) => idx !== i))}
                                        className="absolute top-1.5 right-1.5 h-6 w-6 bg-zinc-950/80 hover:bg-red-500 rounded-full flex items-center justify-center transition-colors"
                                      >
                                        <X className="h-3.5 w-3.5 text-white" />
                                      </button>
                                    </div>
                                  ))}
                                  {images.length < 6 && (
                                    <button
                                      onClick={() => fileInputRef.current?.click()}
                                      disabled={imageUploading}
                                      className="aspect-square rounded-xl border-2 border-dashed border-zinc-200 dark:border-zinc-800 hover:border-zinc-950 dark:hover:border-white bg-zinc-50 dark:bg-zinc-900 flex items-center justify-center transition-colors text-zinc-400 hover:text-zinc-900 dark:hover:text-white disabled:opacity-50"
                                    >
                                      <Plus className="h-5 w-5" />
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>

                            <div className="pt-6 border-t border-zinc-100 dark:border-zinc-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                              {images.length === 0 && !imageUploading && (
                                <p className="text-xs text-amber-600 dark:text-amber-400 font-semibold flex items-center gap-1.5">
                                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
                                  At least 1 photo is required to get your offer
                                </p>
                              )}
                              <button
                                onClick={fetchAiPrice}
                                disabled={imageUploading || images.length === 0}
                                className="w-full sm:w-auto h-12 px-8 bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-50 disabled:pointer-events-none rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 shadow-lg shrink-0 ml-auto"
                              >
                                <Sparkles className="h-4 w-4 fill-white dark:fill-zinc-950 shrink-0" />
                                <span className="whitespace-nowrap">Get My Cash Offer</span>
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Offer Reveal Screen */}
                        {!aiLoading && aiPrice !== null && (
                          <div className="space-y-6 flex-1 flex flex-col justify-between animate-fade-in">
                            <div className="text-center space-y-4">
                              <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 text-emerald-700 border border-emerald-500/25 px-3 py-1 text-[10px] font-black uppercase tracking-wider mb-2">
                                <Zap className="h-3.5 w-3.5 fill-emerald-600 text-emerald-600 dark:text-emerald-400" />
                                Instant Offer Generated
                              </div>

                              <div className="bg-gradient-to-b from-emerald-500/5 to-emerald-500/10 border border-emerald-500/20 rounded-3xl p-8 relative overflow-hidden max-w-sm mx-auto shadow-sm">
                                <div className="absolute -top-12 -right-12 w-24 h-24 bg-emerald-400/25 rounded-full blur-2xl pointer-events-none" />
                                <div className="absolute -bottom-12 -left-12 w-24 h-24 bg-emerald-400/25 rounded-full blur-2xl pointer-events-none" />
                                <div className="text-[10px] font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-400 relative z-10">Guaranteed Offer</div>
                                <div className="text-6xl font-black font-mono text-zinc-950 dark:text-white my-2 relative z-10">
                                  <AnimatedPrice value={aiPrice} />
                                </div>
                                <div className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center justify-center gap-1 relative z-10">
                                  <Clock className="h-3.5 w-3.5" /> Price locked for 14 days
                                </div>
                              </div>

                              {/* Price adjustment breakdown details */}
                              <div className="max-w-md mx-auto bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 sm:p-5 text-left space-y-3">
                                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-1 sm:gap-4 text-xs">
                                  <span className="font-extrabold text-zinc-400 uppercase tracking-wide shrink-0">Device Model</span>
                                  <span className="font-black text-zinc-900 dark:text-zinc-100 text-left sm:text-right">{state.model}</span>
                                </div>
                                {Object.keys(state.specs).length > 0 && (
                                  <>
                                    <div className="h-px bg-zinc-200/60 dark:bg-zinc-800" />
                                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-1 sm:gap-4 text-xs">
                                      <span className="font-extrabold text-zinc-400 uppercase tracking-wide shrink-0">Specs selected</span>
                                      <span className="font-black text-zinc-900 dark:text-zinc-100 text-left sm:text-right leading-snug">
                                        {Object.entries(state.specs).filter(([_, val]) => !!val).map(([_, val]) => val).join(" · ")}
                                      </span>
                                    </div>
                                  </>
                                )}
                                <div className="h-px bg-zinc-200/60 dark:bg-zinc-800" />
                                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-1 sm:gap-4 text-xs">
                                  <span className="font-extrabold text-zinc-400 uppercase tracking-wide shrink-0">Grade</span>
                                  <span className="font-black text-zinc-900 dark:text-zinc-100 text-left sm:text-right">{state.condition}</span>
                                </div>
                                {Object.entries(state.answers).some(([k, v]) => v.toLowerCase().includes("crack") || v.toLowerCase().includes("faulty") || v.toLowerCase().includes("issue") || v.toLowerCase().includes("no")) && (
                                  <>
                                    <div className="h-px bg-zinc-200/60 dark:bg-zinc-800" />
                                    <div className="space-y-1.5">
                                      <span className="text-[10px] font-black uppercase tracking-widest text-red-500 block">Condition Adjustments</span>
                                      <div className="flex flex-wrap gap-1.5">
                                        {Object.entries(state.answers).map(([qid, ans]) => {
                                          if (ans.toLowerCase().includes("crack") || ans.toLowerCase().includes("faulty") || ans.toLowerCase().includes("issue") || ans.toLowerCase().includes("no")) {
                                            return (
                                              <span key={qid} className="inline-block bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30 text-red-650 dark:text-red-400 font-bold text-[9px] px-2 py-0.5 rounded-md">
                                                {ans}
                                              </span>
                                            );
                                          }
                                          return null;
                                        })}
                                      </div>
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>

                            <div className="pt-6 border-t border-zinc-100 dark:border-zinc-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-3">
                              <button
                                onClick={() => {
                                  if (aiRecalcCount >= 1) {
                                    // Already used the one extra recalculation — send to manual review instead.
                                    setAiManualFallback(true);
                                    setState(s => ({ ...s, tradeInMode: "unpriced" }));
                                    return;
                                  }
                                  setAiRecalcCount(c => c + 1);
                                  setAiRetryCount(0);
                                  setAiPrice(null); setAiError(false);
                                }}
                                className="w-full sm:w-auto h-12 px-6 border border-zinc-200 dark:border-zinc-800 rounded-xl font-bold text-xs text-zinc-600 dark:text-zinc-400 hover:border-zinc-950 dark:hover:border-white hover:text-zinc-950 dark:hover:text-white transition-colors flex items-center justify-center shrink-0"
                              >
                                <span className="whitespace-nowrap">{aiRecalcCount >= 1 ? "Request Manual Review" : "Recalculate"}</span>
                              </button>
                              <button
                                onClick={() => goToPhase(5)}
                                className="w-full sm:w-auto h-12 px-8 bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 hover:bg-zinc-800 dark:hover:bg-zinc-200 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 shadow-lg shrink-0"
                              >
                                <span className="whitespace-nowrap">Accept Cash Offer</span>
                                <ArrowRight className="h-4 w-4 shrink-0" />
                              </button>
                            </div>
                          </div>
                        )}
                        </> )}
                      </div>
                    )}

                    {/* ── PHASE 5: Fulfillment & Details ── */}
                    {phase === 5 && (
                      <div className="space-y-6 flex-1 flex flex-col justify-between">
                        <form
                          className="space-y-6 flex-1 flex flex-col justify-between"
                          onSubmit={async (e) => {
                            e.preventDefault();
                            setSubmitting(true);
                            setSubmitError("");
                            try {
                              const result = await tradeInsApi.submit({
                                category: state.category, brand: state.brand, model: state.model,
                                specs: state.specs, condition: state.condition, answers: state.answers,
                                fulfillment: state.fulfillment,
                                offerPrice: state.tradeInMode === 'unpriced' ? 0 : (aiPrice ?? 0),
                                images: images.map(i => i.filePath),
                                customerNotes: state.customerNotes || undefined,
                                storeId: state.storeId || undefined,
                                contact: state.contact,
                              });
                              setSubmitRef(result.reference);
                              setServerOfferPrice(result.offerPrice);
                              goToPhase(6);
                            } catch (err) {
                              setSubmitError(err instanceof Error ? err.message : "Submission failed");
                            } finally {
                              setSubmitting(false);
                            }
                          }}
                        >
                          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
                            {/* Left Column: Form Controls */}
                            <div className="lg:col-span-2 space-y-6">
                              <StepHeader label="Fulfillment & Contact" sub="Select shipping preference and fill out your verification info." />

                              {/* Fulfillment method select */}
                              <div className="space-y-3">
                                <span className="text-xs font-black uppercase tracking-widest text-zinc-400 block">Collection Choice</span>
                                <div className="grid gap-4 sm:grid-cols-2">
                                  {[
                                    {
                                      id: "ship", title: "Ship via Royal Mail", icon: Truck,
                                      desc: "Prepaid insured label emailed instantly. Drop at any Post Office.",
                                      badge: "Free Insured Shipping"
                                    },
                                    {
                                      id: "dropoff", title: "Drop off In Store", icon: MapPin,
                                      desc: "Visit TechStop Leicester for instant inspection and cash hand-off.",
                                      badge: "Instant Cash Payout"
                                    }
                                  ].map((m) => {
                                    const Icon = m.icon;
                                    const isSelected = state.fulfillment === m.id;
                                    return (
                                      <button
                                        key={m.id}
                                        type="button"
                                        onClick={() => setState(s => ({ ...s, fulfillment: m.id }))}
                                        className={`p-5 rounded-2xl border text-left transition-all flex items-start gap-4 ${
                                          isSelected
                                            ? "border-zinc-950 bg-zinc-950 text-white shadow-md dark:border-white dark:bg-white dark:text-zinc-950"
                                            : "border-zinc-200 bg-white hover:border-zinc-400 text-zinc-800 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-white"
                                        }`}
                                      >
                                        <div className={`h-11 w-11 rounded-xl flex items-center justify-center border shrink-0 ${isSelected ? "bg-white/10 border-white/20 text-white dark:bg-zinc-950/20 dark:text-zinc-950 dark:border-zinc-950" : "bg-zinc-50 border-zinc-200 text-zinc-600 dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-400"}`}>
                                          <Icon className="h-5 w-5" strokeWidth={1.6} />
                                        </div>
                                        <div className="space-y-1">
                                          <p className="text-xs font-black">{m.title}</p>
                                          <p className={`text-[10px] leading-normal ${isSelected ? "text-white/70 dark:text-zinc-950/70" : "text-zinc-500 dark:text-zinc-400"}`}>{m.desc}</p>
                                          <span className={`inline-block text-[9px] font-extrabold px-2 py-0.5 rounded-full border mt-2 ${
                                            isSelected ? "bg-white/10 text-white border-white/20 dark:bg-zinc-950/30 dark:text-zinc-950 dark:border-zinc-950/30" : "bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-950 dark:text-zinc-400 dark:border-zinc-800"
                                          }`}>
                                            {m.badge}
                                          </span>
                                        </div>
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>

                              {/* Store picker — shown when dropoff is selected */}
                              {state.fulfillment === "dropoff" && (
                                <div className="space-y-3 pt-4 border-t border-zinc-100 dark:border-zinc-800 animate-fade-in">
                                  <span className="text-xs font-black uppercase tracking-widest text-zinc-400 block">Select Your Nearest Store</span>
                                  {storesLoading ? (
                                    <div className="flex items-center gap-2 text-xs text-zinc-400 py-3">
                                      <div className="h-4 w-4 border-2 border-zinc-200 border-t-zinc-500 rounded-full animate-spin" />
                                      Loading store locations…
                                    </div>
                                  ) : stores.length === 0 ? (
                                    <p className="text-xs text-zinc-400 py-2">No store locations available. Please contact us directly.</p>
                                  ) : (
                                    <div className="grid gap-3">
                                      {stores.map(store => {
                                        const isSelected = state.storeId === store.id;
                                        return (
                                          <button
                                            key={store.id}
                                            type="button"
                                            onClick={() => setState(s => ({ ...s, storeId: store.id }))}
                                            className={`p-4 rounded-2xl border text-left transition-all flex items-start gap-3 ${
                                              isSelected
                                                ? "border-zinc-950 bg-zinc-950 text-white shadow-md dark:border-white dark:bg-white dark:text-zinc-950"
                                                : "border-zinc-200 bg-white hover:border-zinc-400 text-zinc-800 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-white"
                                            }`}
                                          >
                                            <div className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 border ${isSelected ? "bg-white/10 border-white/20 text-white dark:bg-zinc-950/20 dark:text-zinc-950" : "bg-zinc-50 border-zinc-200 text-zinc-500 dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-400"}`}>
                                              <MapPin className="h-4 w-4" strokeWidth={1.8} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                              <p className={`text-xs font-black leading-tight ${isSelected ? "text-white dark:text-zinc-950" : "text-zinc-900 dark:text-zinc-100"}`}>{store.name}</p>
                                              <p className={`text-[11px] mt-0.5 ${isSelected ? "text-white/70 dark:text-zinc-950/70" : "text-zinc-500 dark:text-zinc-400"}`}>{store.address}, {store.city}, {store.postcode}</p>
                                              {store.phone && <p className={`text-[11px] mt-0.5 ${isSelected ? "text-white/60 dark:text-zinc-950/60" : "text-zinc-400 dark:text-zinc-500"}`}>{store.phone}</p>}
                                              {store.openingHours && <p className={`text-[11px] mt-0.5 ${isSelected ? "text-white/60 dark:text-zinc-950/60" : "text-zinc-400 dark:text-zinc-500"}`}>{store.openingHours}</p>}
                                            </div>
                                            {isSelected && <Check className="h-4 w-4 text-white dark:text-zinc-950 shrink-0 mt-0.5" />}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Contact Form Details */}
                              {state.fulfillment && (
                                <div className="space-y-4 pt-4 border-t border-zinc-100 dark:border-zinc-800 animate-fade-in">
                                  <span className="text-xs font-black uppercase tracking-widest text-zinc-400 block">Personal Details</span>

                                  {(() => {
                                    const visibleFields = [
                                      { key: "name",     label: "Full Name",                   type: "text",  placeholder: "e.g. Jordan Mitchell",  span: false, mandatory: true },
                                      { key: "email",    label: "Email Address",                type: "email", placeholder: "e.g. you@domain.com",   span: false, mandatory: true },
                                      { key: "phone",    label: "Phone Number",                 type: "tel",   placeholder: "e.g. +44 7700 900077",  span: false, mandatory: true },
                                      ...(state.fulfillment === "ship" ? [
                                        { key: "address",  label: "Collection / Return Address", type: "text",  placeholder: "e.g. 10 High Street",   span: true,  mandatory: false },
                                        { key: "postcode", label: "Postcode",                    type: "text",  placeholder: "e.g. LE1 1AA",          span: false, mandatory: false },
                                      ] : []),
                                    ];
                                    return (
                                      <div className="space-y-4">
                                        {!user && (
                                          <div className="space-y-3">
                                            <a
                                              href={`${API_URL}/auth/google`}
                                              onClick={() => { /* auto-save handles sessionStorage */ }}
                                              className="w-full h-12 bg-white dark:bg-zinc-900 border-2 border-zinc-200 dark:border-zinc-800 rounded-2xl font-bold transition-all hover:scale-[1.02] hover:border-zinc-400 active:scale-[0.98] flex items-center justify-center gap-3 text-sm text-zinc-700 dark:text-zinc-300 shadow-sm"
                                            >
                                              <GoogleIcon />
                                              Continue with Google
                                            </a>
                                            <div className="flex items-center gap-3">
                                              <div className="flex-1 h-px bg-zinc-200 dark:bg-zinc-800" />
                                              <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">or fill manually</span>
                                              <div className="flex-1 h-px bg-zinc-200 dark:bg-zinc-800" />
                                            </div>
                                          </div>
                                        )}
                                        <div className="grid gap-4 sm:grid-cols-2">
                                          {visibleFields.map((inp) => (
                                            <div key={inp.key} className={inp.span ? "sm:col-span-2" : ""}>
                                              <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300 block mb-1.5">
                                                {inp.label} {inp.mandatory && <span className="text-red-500">*</span>}
                                              </label>
                                              <input
                                                type={inp.type}
                                                required={inp.mandatory}
                                                placeholder={inp.placeholder}
                                                value={state.contact[inp.key as keyof typeof state.contact] || (user ? (user[inp.key as keyof typeof user] as string || "") : "")}
                                                onChange={(e) => setState(s => ({
                                                  ...s,
                                                  contact: { ...s.contact, [inp.key]: e.target.value }
                                                }))}
                                                className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-800 px-4 text-xs font-semibold outline-none focus:border-zinc-950 dark:focus:border-white transition-colors bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white"
                                              />
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    );
                                  })()}
                                </div>
                              )}

                              {submitError && (
                                <p className="text-xs font-bold text-red-600 bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30 rounded-xl px-4 py-3">{submitError}</p>
                              )}
                            </div>

                            {/* Right Column: Sticky Summary Card */}
                            <div className="lg:col-span-1 lg:sticky lg:top-6 space-y-4">
                              <div className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 text-left space-y-4 shadow-sm">
                                <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block">Trade-In Summary</span>
                                
                                <div className="space-y-1">
                                  <span className="text-[9px] font-extrabold text-zinc-400 uppercase tracking-wide block">Device</span>
                                  <p className="text-sm font-black text-zinc-900 dark:text-zinc-100">{state.brand} {state.model}</p>
                                  <span className="inline-block bg-zinc-200/60 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-bold text-[9px] px-2 py-0.5 rounded-md mt-0.5">
                                    {state.category}
                                  </span>
                                </div>

                                <div className="h-px bg-zinc-200/60 dark:bg-zinc-800" />

                                <div className="space-y-1">
                                  <span className="text-[9px] font-extrabold text-zinc-400 uppercase tracking-wide block">Condition Grade</span>
                                  <p className="text-xs font-black text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                                    <span className="inline-block bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 text-emerald-700 dark:text-emerald-400 font-bold text-[10px] px-2 py-0.5 rounded-md">
                                      Grade {state.condition}
                                    </span>
                                  </p>
                                  {Object.entries(state.answers).some(([k, v]) => v.toLowerCase().includes("crack") || v.toLowerCase().includes("faulty") || v.toLowerCase().includes("issue") || v.toLowerCase().includes("no")) && (
                                    <div className="space-y-1 mt-2">
                                      <span className="text-[9px] font-black uppercase tracking-widest text-red-500 block">Reported Issues</span>
                                      <div className="flex flex-wrap gap-1">
                                        {Object.entries(state.answers).map(([qid, ans]) => {
                                          if (ans.toLowerCase().includes("crack") || ans.toLowerCase().includes("faulty") || ans.toLowerCase().includes("issue") || ans.toLowerCase().includes("no")) {
                                            return (
                                              <span key={qid} className="inline-block bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30 text-red-600 dark:text-red-400 font-bold text-[9px] px-2 py-0.5 rounded-md">
                                                {ans}
                                              </span>
                                            );
                                          }
                                          return null;
                                        })}
                                      </div>
                                    </div>
                                  )}
                                </div>

                                {state.fulfillment && (
                                  <>
                                    <div className="h-px bg-zinc-200/60 dark:bg-zinc-800" />
                                    <div className="space-y-1">
                                      <span className="text-[9px] font-extrabold text-zinc-400 uppercase tracking-wide block">Fulfillment Method</span>
                                      <p className="text-xs font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5 mt-1">
                                        {state.fulfillment === "ship" ? (
                                          <>
                                            <Truck className="h-4 w-4 text-zinc-500 dark:text-zinc-400" /> Free Insured Shipping
                                          </>
                                        ) : (
                                          <>
                                            <MapPin className="h-4 w-4 text-zinc-500 dark:text-zinc-400" /> Store Drop off (Leicester)
                                          </>
                                        )}
                                      </p>
                                    </div>
                                  </>
                                )}

                                <div className="h-px bg-zinc-200/60 dark:bg-zinc-800" />

                                {state.tradeInMode === 'unpriced' ? (
                                  <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30 rounded-xl p-3.5 text-center">
                                    <span className="text-[9px] font-black uppercase tracking-widest text-amber-800 dark:text-amber-400 block">Offer Type</span>
                                    <p className="text-sm font-black text-amber-900 dark:text-amber-300 mt-1">Manual Review</p>
                                    <div className="text-[9px] font-bold text-amber-600 dark:text-amber-400 flex items-center justify-center gap-1 mt-1">
                                      <Clock className="h-3 w-3" /> Offer sent within 24 hours
                                    </div>
                                  </div>
                                ) : (
                                  <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 rounded-xl p-3.5 text-center">
                                    <span className="text-[9px] font-black uppercase tracking-widest text-emerald-800 dark:text-emerald-400 block">Total Offer Value</span>
                                    <p className="text-3xl font-black font-mono text-emerald-950 dark:text-emerald-400 mt-1">£{aiPrice}</p>
                                    <div className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center justify-center gap-1 mt-1">
                                      <Clock className="h-3 w-3" /> Locked for 14 days
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="pt-6 border-t border-zinc-100 dark:border-zinc-800 flex flex-col sm:flex-row sm:justify-end">
                            <motion.button
                              whileHover={{ y: -2 }}
                              whileTap={{ scale: 0.98 }}
                              type="submit"
                              disabled={submitting || !state.fulfillment || (state.fulfillment === "dropoff" && !state.storeId)}
                              className="w-full sm:w-auto h-12 px-8 bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-50 disabled:pointer-events-none rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 shadow-lg shrink-0"
                            >
                              {submitting ? (
                                <span className="whitespace-nowrap">Submitting Trade-In...</span>
                              ) : (
                                <>
                                  <span className="whitespace-nowrap">Submit Trade-In</span>
                                  <ArrowRight className="h-4 w-4 shrink-0" />
                                </>
                              )}
                            </motion.button>
                          </div>

                          {/* Missing profile details modal */}
                          {missingDetailsOpen && (
                            <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
                              <div className="absolute inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-sm" onClick={() => setMissingDetailsOpen(false)} />
                              <div className="relative bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl p-6 max-w-sm w-full space-y-4">
                                <div className="flex items-start justify-between">
                                  <div>
                                    <h3 className="text-base font-black text-zinc-950 dark:text-white">Complete your profile first</h3>
                                    <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium mt-1">We need a few more details before you can submit.</p>
                                  </div>
                                  <button onClick={() => setMissingDetailsOpen(false)} className="text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-white transition-colors ml-4 mt-0.5">
                                    <X className="h-4 w-4" />
                                  </button>
                                </div>
                                <ul className="space-y-2">
                                  {missingFields.map(f => (
                                    <li key={f} className="flex items-center gap-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                                      <span className="h-1.5 w-1.5 rounded-full bg-red-500 shrink-0" />
                                      {f} is missing
                                    </li>
                                  ))}
                                </ul>
                                <button
                                  onClick={() => {
                                    setMissingDetailsOpen(false);
                                    router.push("/account/settings");
                                  }}
                                  className="w-full h-11 bg-black dark:bg-white text-white dark:text-zinc-950 rounded-xl text-sm font-black hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors"
                                >
                                  Go to Account Settings →
                                </button>
                              </div>
                            </div>
                          )}
                        </form>
                      </div>
                    )}

                    {/* ── PHASE 6: Done ── */}
                    {phase === 6 && (
                      <div className="space-y-6 flex-1 flex flex-col justify-between">
                        <div className="text-center space-y-6 py-6">
                          <motion.div
                            initial={{ scale: 0.5, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ type: "spring", stiffness: 280, damping: 20 }}
                            className="mx-auto h-16 w-16 bg-emerald-500 rounded-full flex items-center justify-center shadow-lg shadow-emerald-500/10 text-white"
                          >
                            <CheckCircle2 className="h-9 w-9" strokeWidth={1.8} />
                          </motion.div>

                          <div className="space-y-2">
                            <h2 className="font-sans text-3xl font-extrabold tracking-tight text-zinc-950 dark:text-white">
                              {state.tradeInMode === 'unpriced' ? 'Trade-in Submitted!' : 'Valuation Confirmed!'}
                            </h2>
                            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">
                              Reference ID: <strong className="text-zinc-800 dark:text-zinc-200 font-mono font-black">{submitRef}</strong>
                            </p>
                            <p className="text-sm font-semibold text-zinc-500 dark:text-zinc-400 max-w-md mx-auto leading-relaxed pt-2">
                              {state.tradeInMode === 'unpriced'
                                ? <>Your {state.brand} {state.model} has been registered for manual review. We'll send a custom cash offer to <strong className="text-zinc-950 dark:text-white">{state.contact.email}</strong> within 24 hours.</>
                                : <>Your device is registered for buyback. We have locked in a trade offer value of <strong className="text-zinc-950 dark:text-white font-black">£{serverOfferPrice ?? aiPrice}</strong>.</>
                              }
                            </p>
                          </div>

                          {/* Interactive Vertical Roadmap Steps */}
                          <div className="max-w-md mx-auto bg-zinc-50 dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-2xl overflow-hidden text-left">
                            <div className="px-5 py-3 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-100/50 dark:bg-zinc-950/50 flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-zinc-500">
                              <span>Your Checklist</span>
                              {state.fulfillment === "ship" ? <Truck className="h-4 w-4" /> : <MapPin className="h-4 w-4" />}
                            </div>
                            <div className="p-5 space-y-5">
                              {(state.fulfillment === "ship" ? [
                                { step: "1", title: "Prepaid shipping slip", desc: `Insured shipping label sent to ${state.contact.email}.` },
                                { step: "2", title: "Pack & Ship", desc: "Place the device safely inside a box and post it free of charge." },
                                { step: "3", title: "Verify & Get Paid", desc: "Once processed at our depot, bank payout is deposited within 48h." },
                              ] : [
                                { step: "1", title: "Drop-off appointment confirmation", desc: `Slot details sent to ${state.contact.email}.` },
                                { step: "2", title: "Visit TechStop Leicester", desc: "Bring your unit in-store for a quick, 5-minute technical validation check." },
                                { step: "3", title: "Instant Bank / Cash payout", desc: "Collect your payment immediately after inspection." },
                              ]).map((item) => (
                                <div key={item.step} className="flex gap-4">
                                  <div className="h-8 w-8 rounded-lg bg-zinc-950 dark:bg-zinc-800 text-white dark:text-zinc-200 font-mono font-black flex items-center justify-center shrink-0 text-xs shadow-sm">
                                    {item.step}
                                  </div>
                                  <div>
                                    <p className="text-xs font-black text-zinc-900 dark:text-zinc-100">{item.title}</p>
                                    <p className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 leading-relaxed mt-0.5">{item.desc}</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Back to Home Button */}
                        <div className="pt-6 border-t border-zinc-100 flex items-center justify-center">
                          <button
                            onClick={() => { closeWizard(); setPhase(1); setImages([]); setAiPrice(null); setAiRetryCount(0); setAiRecalcCount(0); setAiManualFallback(false); setBatchId(crypto.randomUUID()); }}
                            className="h-12 w-full max-w-xs bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 hover:bg-zinc-800 dark:hover:bg-zinc-200 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 shadow-lg"
                          >
                            Return to Homepage <ArrowRight className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    )}

                  </motion.div>
                </AnimatePresence>
              </div>
            </div>

                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

      <Footer />
    </div>
  );
}
