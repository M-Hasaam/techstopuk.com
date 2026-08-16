"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { repairsApi, storesApi, uploadsApi, catalogApi, productsApi, authApi, type Store, type CatalogCategory } from "@/lib/api";
import {
  Smartphone, Tablet, Gamepad2, Laptop, Package, ArrowLeft, ArrowRight,
  Check, MapPin, Truck, Wrench, Clock, Shield, X,
  Monitor, Zap, Battery, Wifi, HardDrive, CircleAlert,
  Star, HelpCircle, ChevronDown, Sparkles, ChevronRight, Upload, Plus,
  CheckCircle2, UserCircle, Camera
} from "lucide-react";
import Footer from "@/components/Footer";
import { useAuth } from "@/context/auth-context";
import DeviceSearchBox from "@/components/DeviceSearchBox";
import CameraCaptureModal from "@/components/CameraCaptureModal";
import AccordionGallery from "@/components/AccordionGallery";
import { LayoutTextFlip } from "@/components/ui/layout-text-flip";

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

// Visual metadata keyed by category slug — the list itself comes from the API
const DEVICE_TYPE_META: Record<string, {
  oldId: string; Icon: React.ElementType;
  gradient: string; glow: string; accent: string;
}> = {
  phones:   { oldId: "Phone",   Icon: Smartphone, gradient: "from-sky-700 via-blue-900 to-zinc-950",     glow: "hover:shadow-sky-500/30",    accent: "bg-sky-500"    },
  tablets:  { oldId: "Tablet",  Icon: Tablet,     gradient: "from-rose-600 via-pink-900 to-zinc-950",    glow: "hover:shadow-rose-500/30",   accent: "bg-rose-500"   },
  gaming:   { oldId: "Console", Icon: Gamepad2,   gradient: "from-violet-700 via-purple-900 to-zinc-950",glow: "hover:shadow-violet-500/30", accent: "bg-violet-500" },
  laptops:  { oldId: "Laptop",  Icon: Laptop,     gradient: "from-amber-600 via-orange-900 to-zinc-950", glow: "hover:shadow-amber-500/30",  accent: "bg-amber-500"  },
  audio:    { oldId: "Audio",   Icon: Package,    gradient: "from-indigo-600 via-blue-900 to-zinc-950",  glow: "hover:shadow-indigo-500/30", accent: "bg-indigo-500" },
  smartwatches: { oldId: "Smartwatch", Icon: Package, gradient: "from-emerald-600 via-teal-900 to-zinc-950", glow: "hover:shadow-emerald-500/30", accent: "bg-emerald-500" },
};

const BRANDS: Record<string, string[]> = {
  Phone: ["Apple", "Samsung", "Google", "OnePlus", "Nothing", "Other"],
  Tablet: ["Apple", "Samsung", "Microsoft", "Other"],
  Console: ["Sony PlayStation", "Microsoft Xbox", "Nintendo", "Other"],
  Laptop: ["Apple", "Dell", "Lenovo", "HP", "ASUS", "Other"],
};

const ISSUES: Record<string, { id: string; label: string; desc: string; icon: React.ElementType }[]> = {
  Phone: [
    { id: "screen", label: "Cracked / damaged screen", desc: "Screen repair, glass replacement or display fix", icon: Monitor },
    { id: "battery", label: "Battery replacement", desc: "Battery draining fast or swollen", icon: Battery },
    { id: "charging", label: "Charging port issue", desc: "Won't charge or loose connection", icon: Zap },
    { id: "camera", label: "Camera not working", desc: "Blurry, black screen or broken lens", icon: Smartphone },
    { id: "software", label: "Software / boot issue", desc: "Stuck in recovery, boot loop, or data recovery", icon: HardDrive },
    { id: "water", label: "Water damage", desc: "Device got wet or exposed to liquid", icon: Wifi },
    { id: "other", label: "Something else", desc: "Describe the issue in the notes field", icon: CircleAlert },
  ],
  Tablet: [
    { id: "screen", label: "Cracked / damaged screen", desc: "Screen repair or glass replacement", icon: Monitor },
    { id: "battery", label: "Battery replacement", desc: "Battery draining fast or not charging", icon: Battery },
    { id: "charging", label: "Charging port issue", desc: "Won't charge or loose connection", icon: Zap },
    { id: "software", label: "Software / boot issue", desc: "Factory reset, data recovery, iOS issues", icon: HardDrive },
    { id: "other", label: "Something else", desc: "Describe the issue in the notes field", icon: CircleAlert },
  ],
  Console: [
    { id: "disc", label: "Disc drive issue", desc: "Won't read, eject discs or drive clicking", icon: HardDrive },
    { id: "hdmi", label: "HDMI / video port", desc: "No display signal or broken HDMI port", icon: Monitor },
    { id: "controller", label: "Controller repair", desc: "Joystick drift, buttons or trigger issues", icon: Gamepad2 },
    { id: "overheating", label: "Overheating / fan noise", desc: "Loud fan, thermal paste, or shutting off", icon: Zap },
    { id: "power", label: "Won't power on", desc: "Dead console or power supply issue", icon: Battery },
    { id: "other", label: "Something else", desc: "Describe the issue in the notes field", icon: CircleAlert },
  ],
  Laptop: [
    { id: "screen", label: "Cracked / damaged screen", desc: "Screen replacement or display cable fix", icon: Monitor },
    { id: "keyboard", label: "Keyboard or trackpad", desc: "Keys not working or trackpad unresponsive", icon: Laptop },
    { id: "battery", label: "Battery replacement", desc: "Battery not holding charge", icon: Battery },
    { id: "charging", label: "Charging port / board", desc: "Won't charge or broken charging connector", icon: Zap },
    { id: "software", label: "Software / OS issue", desc: "macOS / Windows reinstall or data recovery", icon: HardDrive },
    { id: "overheating", label: "Overheating", desc: "Very hot, noisy fan or thermal paste", icon: CircleAlert },
    { id: "other", label: "Something else", desc: "Describe the issue in the notes field", icon: CircleAlert },
  ],
};

const stepVariants = {
  enter: (dir: number) => ({ x: dir > 0 ? 60 : -60, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? -60 : 60, opacity: 0 }),
};

interface RepairState {
  deviceType: string;
  brand: string;
  model: string;
  issue: string[];
  issueNotes: string;
  fulfillment: string;
  contact: { name: string; email: string; phone: string; address: string; postcode: string };
}

const STEP_LABELS = ["Brand & Model", "Issue", "Delivery", "Contact", "Done"];
const TOTAL_STEPS = 5;



export default function RepairPage() {
  const [isWizardActive, setIsWizardActive] = useState(false);
  const [step, setStep] = useState(1);
  const [dir, setDir] = useState(1);
  const [state, setState] = useState<RepairState>({
    deviceType: "", brand: "", model: "", issue: [], issueNotes: "",
    fulfillment: "",
    contact: { name: "", email: "", phone: "", address: "", postcode: "" },
  });

  const [catalogCats, setCatalogCats] = useState<CatalogCategory[]>(() => {
    try {
      const cached = sessionStorage.getItem("ts_repair_cats");
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed.length > 0) return parsed;
      }
    } catch {}
    return [
      { id: "cat-phone", name: "Phones", slug: "phones", isActive: true, isRepairable: true, icon: "Phone", description: "iPhones, Samsung Galaxy & Google Pixel" } as any,
      { id: "cat-tablet", name: "Tablets", slug: "tablets", isActive: true, isRepairable: true, icon: "Tablet", description: "iPads, Galaxy Tabs & Surface Tablets" } as any,
      { id: "cat-laptop", name: "Laptops", slug: "laptops", isActive: true, isRepairable: true, icon: "Laptop", description: "MacBooks, Windows Laptops & Chromebooks" } as any,
      { id: "cat-gaming", name: "Gaming", slug: "gaming", isActive: true, isRepairable: true, icon: "Gamepad2", description: "PlayStation, Xbox, Nintendo & Handhelds" } as any,
    ];
  });
  const [catFallbackImages, setCatFallbackImages] = useState<Record<string, string>>(() => {
    try {
      const cached = sessionStorage.getItem("ts_repair_cat_imgs");
      if (cached) return JSON.parse(cached);
    } catch {}
    return {};
  });
  const [stores, setStores] = useState<Store[]>(() => {
    try {
      const cached = sessionStorage.getItem("ts_stores_cache");
      if (cached) return JSON.parse(cached);
    } catch {}
    return [];
  });

  useEffect(() => {
    try {
      const cachedCats = sessionStorage.getItem("ts_repair_cats");
      if (cachedCats) setCatalogCats(JSON.parse(cachedCats));
      const cachedImgs = sessionStorage.getItem("ts_repair_cat_imgs");
      if (cachedImgs) setCatFallbackImages(JSON.parse(cachedImgs));
      const cachedStores = sessionStorage.getItem("ts_stores_cache");
      if (cachedStores) setStores(JSON.parse(cachedStores));
    } catch {}

    catalogApi.listCategories()
      .then(cats => {
        const active = cats.filter(c => c.isActive !== false);
        const displayCats = active.length > 0 ? active : cats;
        setCatalogCats(displayCats);
        try { sessionStorage.setItem("ts_repair_cats", JSON.stringify(displayCats)); } catch {}

        displayCats.forEach(c => {
          productsApi.list({ category: c.name, limit: 12 })
            .then(r => {
              const pool = r.items.flatMap(p => p.images ?? []);
              if (c.image) pool.push(c.image);
              const img = pool[Math.floor(Math.random() * pool.length)];
              if (img) {
                setCatFallbackImages(prev => {
                  const next = { ...prev, [c.slug]: img };
                  try { sessionStorage.setItem("ts_repair_cat_imgs", JSON.stringify(next)); } catch {}
                  return next;
                });
              }
            })
            .catch(() => {});
        });
      })
      .catch(() => {});
  }, []);

  const [submitting, setSubmitting] = useState(false);
  const [submitRef, setSubmitRef] = useState("");
  const [submitError, setSubmitError] = useState("");

  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const [images, setImages] = useState<{ filePath: string; previewUrl: string }[]>([]);
  const [batchId, setBatchId] = useState(() => crypto.randomUUID());
  const [imageUploading, setImageUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [cameraOpen, setCameraOpen] = useState(false);

  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [profileGateOpen, setProfileGateOpen] = useState(false);
  const [missingDetailsOpen, setMissingDetailsOpen] = useState(false);
  const [missingFields, setMissingFields] = useState<string[]>([]);
  const modalScrollRef = useRef<HTMLDivElement>(null);

  // Device pre-selection from search or login redirect
  const [pendingRepair, setPendingRepair] = useState<{ brand: string; model: string; deviceType: string } | null>(null);

  // Restore wizard state on mount; also pick up URL params / pending device
  useEffect(() => {
    const saved = sessionStorage.getItem("ts_wizard_repair");
    if (saved) {
      try {
        const { state: s, step: savedStep, images: savedImages, batchId: savedBatchId } = JSON.parse(saved);
        setState(s);
        setStep(savedStep);
        if (savedImages?.length) setImages(savedImages);
        if (savedBatchId) setBatchId(savedBatchId);
        setIsWizardActive(true);
      } catch {}
    } else {
      // Check URL params for device pre-selection
      const params = new URLSearchParams(window.location.search);
      const brand = params.get("brand");
      const model = params.get("model");
      const category = params.get("category");
      const CAT_TO_DEVICE: Record<string, string> = {
        Phone: "Phone", Tablet: "Tablet", Console: "Console", Laptop: "Laptop",
      };
      if (brand && model && category && CAT_TO_DEVICE[category]) {
        setPendingRepair({ brand, model, deviceType: CAT_TO_DEVICE[category] });
      } else {
        const pending = sessionStorage.getItem("ts_pending_repair");
        if (pending) {
          try {
            sessionStorage.removeItem("ts_pending_repair");
            setPendingRepair(JSON.parse(pending));
          } catch {}
        }
      }
    }

    storesApi.list()
      .then(s => {
        setStores(s);
        try { sessionStorage.setItem("ts_stores_cache", JSON.stringify(s)); } catch {}
      })
      .catch(() => {});
  }, []);

  // Auto-open wizard once auth resolves and there is a pending repair device.
  // Works for guests too — no account required to book a repair.
  useEffect(() => {
    if (authLoading || !pendingRepair || isWizardActive) return;
    setState(prev => ({
      ...prev,
      deviceType: pendingRepair.deviceType,
      brand: pendingRepair.brand,
      model: pendingRepair.model,
      issue: [], issueNotes: "", fulfillment: "",
    }));
    setImages([]);
    setBatchId(crypto.randomUUID());
    setStep(1);
    setIsWizardActive(true);
    setPendingRepair(null);
  }, [authLoading, pendingRepair, user, isWizardActive]);

  // Auto-save wizard state to sessionStorage whenever anything changes
  useEffect(() => {
    if (isWizardActive) {
      sessionStorage.setItem("ts_wizard_repair", JSON.stringify({ state, step, images, batchId }));
    }
  }, [state, step, images, batchId, isWizardActive]);

  // Auto-fill contact from logged-in user
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

  useEffect(() => {
    if (isWizardActive) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [isWizardActive]);

  const scrollToTop = () => {
    modalScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  const go = (n: number) => {
    setDir(n > 0 ? 1 : -1);
    setStep(s => s + n);
    scrollToTop();
  };

  const closeWizard = () => {
    sessionStorage.removeItem("ts_wizard_repair");
    setIsWizardActive(false);
  };

  const back = () => {
    if (step === 1) { closeWizard(); return; }
    go(-1);
  };

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
      img.onerror = () => {
        resolve({ blob: file, previewUrl: url });
      };
      img.src = url;
    });
  }

  const getImageSrc = (img: { previewUrl?: string; filePath?: string }) => {
    const src = img.previewUrl || img.filePath || "";
    if (!src) return "";
    if (src.startsWith("data:") || src.startsWith("blob:") || src.startsWith("http")) return src;
    return `${API_URL}${src.startsWith("/") ? "" : "/"}${src}`;
  };

  async function handleImageFiles(files: File[]) {
    if (files.length === 0) return;
    const availableSlots = 6 - images.length;
    if (availableSlots <= 0) return;

    const validFiles = files.slice(0, availableSlots);

    // 1. Instantly create local object URLs and add to state for zero-lag shutter response
    const instantItems = validFiles.map(file => {
      const previewUrl = URL.createObjectURL(file);
      return { file, previewUrl, filePath: previewUrl };
    });

    setImages(prev => [...prev, ...instantItems.map(i => ({ filePath: i.filePath, previewUrl: i.previewUrl }))].slice(0, 6));

    // 2. Compress and upload to storage asynchronously in the background
    instantItems.forEach(async (item) => {
      try {
        const { blob, previewUrl: compressedPreview } = await compressToBlob(item.file);
        const uploadFile = new File([blob], item.file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" });
        const res = await uploadsApi.repairImage(uploadFile, batchId);
        const finalUrl = res?.presignedUrl || res?.filePath || compressedPreview || item.previewUrl;
        
        setImages(prev => prev.map(img => img.previewUrl === item.previewUrl ? { ...img, filePath: finalUrl, previewUrl: finalUrl } : img));
      } catch (err) {
        console.warn("Background repair photo upload failed, retaining local preview:", err);
      }
    });
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

  const openWizardWithDevice = (deviceId: string) => {
    setState({ deviceType: deviceId, brand: "", model: "", issue: [], issueNotes: "", fulfillment: "", contact: { name: "", email: "", phone: "", address: "", postcode: "" } });
    setImages([]);
    setBatchId(crypto.randomUUID());
    setStep(1);
    setIsWizardActive(true);
  };

  const progress = Math.round(((step - 1) / (TOTAL_STEPS - 1)) * 100);



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
    <div className="flex min-h-screen flex-col bg-background text-foreground font-sans relative overflow-x-hidden selection:bg-accent selection:text-white">

      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e4e4e7; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #d4d4d8; }
      ` }} />

      {/* ─── LANDING PAGE ────────────────────────────────────────────────────── */}
      <main className="flex-1 bg-background text-foreground relative">
        {/* Ambient Glow Orbs */}
        <div className="absolute top-[-100px] right-[10%] w-[350px] h-[350px] bg-violet-500/10 blur-[130px] rounded-full pointer-events-none -z-10" />
        <div className="absolute top-[100px] left-[5%] w-[400px] h-[400px] bg-sky-500/8 blur-[130px] rounded-full pointer-events-none -z-10" />
        
        {/* Background Grid Pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808008_1px,transparent_1px),linear-gradient(to_bottom,#80808008_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none" />

        <div className="bg-background relative text-foreground">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[350px] bg-mood-violet blur-[130px] rounded-full pointer-events-none -z-10" />

          <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-10 sm:pt-14 md:pt-20 lg:pt-24 pb-8 md:pb-12 w-full">
            
            <div className="grid lg:grid-cols-12 gap-6 lg:gap-12 items-center text-left mb-8 md:mb-12 w-full min-w-0">
              
              {/* Left Column: Headline and Search */}
              <div className="lg:col-span-5 min-w-0 flex flex-col justify-center items-start text-left w-full mb-6 lg:mb-0 relative z-30">
                <h1 className="font-sans text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight text-zinc-950 dark:text-white leading-[1.04] mb-5 md:mb-8">
                  Professional <br />
                  device repairs. <br />
                  <LayoutTextFlip
                    words={["Fast. Fair. Right.", "1-Year Warranty.", "Same-Day Service.", "Free Postage."]}
                    wordClassName="text-transparent bg-clip-text bg-gradient-to-r from-red-600 via-rose-500 to-red-600 pb-1"
                  />
                </h1>

                {/* Device search — finds device and opens repair wizard with it pre-filled */}
                <div className="w-full min-w-0 max-w-full lg:max-w-xl mb-4 md:mb-6 relative z-40">
                  <DeviceSearchBox
                    className="w-full shadow-md border border-zinc-200 dark:border-zinc-800 rounded-2xl"
                    placeholder="Search device to repair (e.g. iPhone, Galaxy S24...)"
                    filterCategories={["Phone", "Tablet", "Console", "Laptop"]}
                    onSelect={(sug) => {
                      const CAT_TO_DEVICE: Record<string, string> = {
                        Phone: "Phone", Tablet: "Tablet", Console: "Console", Laptop: "Laptop",
                      };
                      const deviceType = CAT_TO_DEVICE[sug.category];
                      if (!deviceType) return;
                      guardedOpen(() => {
                        setState(prev => ({
                          ...prev,
                          deviceType,
                          brand: sug.brand,
                          model: sug.name,
                          issue: [], issueNotes: "", fulfillment: "",
                        }));
                        setImages([]);
                        setBatchId(crypto.randomUUID());
                        setStep(1);
                        setIsWizardActive(true);
                      });
                    }}
                    onManualEntry={(q) => {
                      guardedOpen(() => {
                        setState(prev => ({
                          ...prev,
                          deviceType: "Phone",
                          brand: "",
                          model: q,
                          issue: [], issueNotes: "", fulfillment: "",
                        }));
                        setImages([]);
                        setBatchId(crypto.randomUUID());
                        setStep(1);
                        setIsWizardActive(true);
                      });
                    }}
                  />
                </div>

                {/* Popular quick links — Full Width Infinite Sliding Marquee */}
                <div className="flex flex-col gap-2.5 w-full min-w-0 max-w-full lg:max-w-xl">
                  <div className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-300 font-extrabold uppercase tracking-wider text-[10px]">
                    <Sparkles className="h-3.5 w-3.5 text-red-500 shrink-0" />
                    <span>Popular Repairs:</span>
                  </div>

                  <div className="relative overflow-hidden w-full flex items-center group py-1">
                    {/* Left & Right gradient edge masks */}
                    <div className="absolute left-0 top-0 bottom-0 w-12 sm:w-16 bg-gradient-to-r from-white via-white/80 to-transparent dark:from-zinc-950 dark:via-zinc-950/80 z-20 pointer-events-none" />
                    <div className="absolute right-0 top-0 bottom-0 w-12 sm:w-16 bg-gradient-to-l from-white via-white/80 to-transparent dark:from-zinc-950 dark:via-zinc-950/80 z-20 pointer-events-none" />

                    <motion.div
                      className="flex gap-2.5 whitespace-nowrap shrink-0"
                      animate={{ x: ["0%", "-50%"] }}
                      transition={{
                        repeat: Infinity,
                        repeatType: "loop",
                        duration: 22,
                        ease: "linear",
                      }}
                    >
                      {[
                        { name: "iPhone Screen Repair", category: "Phone", brand: "Apple", issue: "screen" },
                        { name: "MacBook Battery Fix", category: "Laptop", brand: "Apple", issue: "battery" },
                        { name: "PS5 HDMI Port", category: "Console", brand: "Sony PlayStation", issue: "hdmi" },
                        { name: "Switch Drift Fix", category: "Console", brand: "Nintendo", issue: "controller" },
                        { name: "Galaxy Screen Fix", category: "Phone", brand: "Samsung", issue: "screen" },
                        { name: "iPad Glass Repair", category: "Tablet", brand: "Apple", issue: "screen" },
                        // Duplicated array for 100% infinite seamless loop
                        { name: "iPhone Screen Repair", category: "Phone", brand: "Apple", issue: "screen" },
                        { name: "MacBook Battery Fix", category: "Laptop", brand: "Apple", issue: "battery" },
                        { name: "PS5 HDMI Port", category: "Console", brand: "Sony PlayStation", issue: "hdmi" },
                        { name: "Switch Drift Fix", category: "Console", brand: "Nintendo", issue: "controller" },
                        { name: "Galaxy Screen Fix", category: "Phone", brand: "Samsung", issue: "screen" },
                        { name: "iPad Glass Repair", category: "Tablet", brand: "Apple", issue: "screen" },
                      ].map((item, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => guardedOpen(() => {
                            setState({
                              deviceType: item.category, brand: item.brand,
                              model: `${item.brand} ${item.category} (Est. Repair)`,
                              issue: [item.issue], issueNotes: `Shortcut select: ${item.name}`,
                              fulfillment: "", contact: { name: "", email: "", phone: "", address: "", postcode: "" }
                            });
                            setStep(3);
                            setIsWizardActive(true);
                          })}
                          className="px-3.5 py-1 bg-zinc-100 dark:bg-zinc-900 hover:bg-red-600 hover:text-white dark:hover:bg-red-600 border border-zinc-200/80 dark:border-zinc-800 text-zinc-800 dark:text-zinc-200 rounded-full transition-all duration-200 font-bold text-[11px] shrink-0 cursor-pointer shadow-2xs"
                        >
                          {item.name}
                        </button>
                      ))}
                    </motion.div>
                  </div>
                </div>
              </div>

              {/* Right Column: Category Accordion Gallery */}
              <div className="lg:col-span-7 min-w-0 w-full flex flex-col justify-center">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-sans text-lg md:text-xl font-extrabold tracking-tight text-zinc-950 dark:text-white leading-none">
                    Select category to get started
                  </h2>
                </div>

                <AccordionGallery
                  ctaText="BOOK REPAIR"
                  items={
                    catalogCats && catalogCats.length > 0
                      ? catalogCats.map((cat) => {
                          const meta = DEVICE_TYPE_META[cat.slug] ?? {
                            oldId: cat.slug,
                            Icon: Package,
                            gradient: "from-zinc-700 via-zinc-800 to-zinc-950",
                            glow: "hover:shadow-zinc-500/20",
                            accent: "bg-zinc-500",
                          };
                          const catImgs = (cat.images ?? []).length > 0 ? cat.images : (cat.image ? [cat.image] : []);
                          const img = catImgs.length > 0
                            ? catImgs[0]
                            : (catFallbackImages[cat.slug] ?? "");
                          return {
                            label: cat.name,
                            catId: meta.oldId ?? cat.slug,
                            image: img,
                          };
                        })
                      : [
                          { label: "Audio", catId: "Audio", image: "" },
                          { label: "Gaming", catId: "Console", image: "" },
                          { label: "Laptops", catId: "Laptop", image: "" },
                          { label: "Phones", catId: "Phone", image: "" },
                          { label: "Tablets", catId: "Tablet", image: "" },
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
                  onSelect={(item) => {
                    guardedOpen(() => openWizardWithDevice(item.catId ?? "Phone"));
                  }}
                />
              </div>

            </div>

            {/* Value Proposition Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-7xl mx-auto border-t border-zinc-200 dark:border-zinc-800 pt-10 mb-28 text-left font-sans">
              {[
                { Icon: Shield, title: "1-Year Warranty", desc: "All repair work covered" },
                { Icon: Wrench, title: "Certified Technicians", desc: "Qualified in-house engineers" },
                { Icon: Clock, title: "Same-Day Turnaround", desc: "Completed in under 45 mins" },
                { Icon: Zap, title: "OEM-Grade Parts", desc: "Premium quality guaranteed" },
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
                  Two Convenient Ways to Get Serviced
                </h3>
                <p className="text-zinc-500 dark:text-zinc-400 font-semibold text-sm max-w-xl mx-auto leading-relaxed">
                  Whether you prefer mailing your device from home or dropping in for an on-the-spot repair, we've got you covered.
                </p>
              </div>

              <div className="grid md:grid-cols-2 gap-8">
                {/* Method 1: Postal */}
                <div className="flex flex-col justify-between p-8 rounded-[2.5rem] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm hover:shadow-xl transition-all group">
                  <div>
                    <div className="h-12 w-12 bg-sky-500/10 dark:bg-sky-500/20 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-105 transition-transform">
                      <Truck className="h-6 w-6 text-sky-500" />
                    </div>
                    <h4 className="font-black text-xl text-zinc-950 dark:text-white mb-2">Mail it to Us (Free &amp; Insured)</h4>
                    <p className="text-zinc-500 dark:text-zinc-400 text-xs font-semibold leading-relaxed mb-6">
                      Book online, and we'll instantly generate a prepaid, fully-insured Royal Mail shipping label. Print it out, wrap your device securely, and hand it to any Post Office counter. Our Leicester lab will fix, test, and ship it back completely free of charge.
                    </p>
                    <ul className="space-y-2.5 mb-8">
                      {[
                        "Free insured Royal Mail postage label included",
                        "Repaired & shipped back within 3-5 working days",
                        "1-Year warranty on all parts and labor",
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
                    onClick={() => guardedOpen(() => openWizardWithDevice("Phone"))}
                    className="w-full py-3.5 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-750 text-zinc-900 dark:text-zinc-100 rounded-xl text-xs font-black transition-colors flex items-center justify-center gap-1.5"
                  >
                    Start Postal Repair <ChevronRight className="h-4 w-4" />
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
                      Bring your device directly to our high-street retail store for an express evaluation and repair. Most screen and battery replacements are completed by our certified technicians in under 45 minutes while you wait.
                    </p>
                    {stores.length > 1 && (
                      <div className="mb-4">
                        <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400 dark:text-zinc-500 block mb-1.5">Select Store Location</label>
                        <select
                          value={selectedStoreId}
                          onChange={(e) => setSelectedStoreId(e.target.value)}
                          className="h-10 w-full rounded-xl bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200/60 dark:border-zinc-800/80 px-3 text-xs font-bold text-zinc-800 dark:text-zinc-200 outline-none focus:border-accent"
                        >
                          {stores.map(s => (
                            <option key={s.id} value={s.id}>{s.name} ({s.city})</option>
                          ))}
                        </select>
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
                    <div className="w-full h-40 rounded-2xl overflow-hidden border border-zinc-200/80 dark:border-zinc-850 mb-6 shadow-inner relative group bg-zinc-100 dark:bg-zinc-950">
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
      </main>

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
                    We need a few details to book your repair and keep you updated.
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
                      sessionStorage.setItem("ts_login_redirect", "/repair");
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

      <Footer />

      {/* ─── WIZARD MODAL ────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {isWizardActive && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-6 overflow-hidden">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeWizard}
              className="fixed inset-0 bg-zinc-950/60 backdrop-blur-md"
            />

            {/* Modal container */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: "spring", duration: 0.4 }}
              className="relative bg-zinc-50 rounded-[2.5rem] border border-zinc-200 shadow-2xl overflow-hidden w-full max-w-3xl min-h-[500px] flex flex-col z-10 max-h-[90vh]"
            >
              {/* Close button */}
              <button
                type="button"
                onClick={closeWizard}
                className="absolute top-6 right-6 h-10 w-10 rounded-full border border-zinc-200 bg-white hover:border-zinc-950 flex items-center justify-center text-zinc-500 hover:text-zinc-950 transition-colors z-20 cursor-pointer shadow-sm"
              >
                <X className="h-5 w-5" />
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
                capturedPreviews={images}
                onRemoveCaptured={(idx) => setImages(prev => prev.filter((_, i) => i !== idx))}
              />

              {/* Scrollable content */}
              <div ref={modalScrollRef} className="p-3 sm:p-6 md:p-10 flex-1 flex flex-col overflow-y-auto custom-scrollbar pt-14 md:pt-14">
                <div className="w-full max-w-3xl mx-auto space-y-4 sm:space-y-6">

                  {/* Progress header */}
                  <div className="bg-white rounded-3xl border border-zinc-200/80 shadow-sm p-4 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-3 md:gap-4">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={back}
                        className="h-10 px-4 rounded-xl border border-zinc-200 hover:border-zinc-950 flex items-center gap-2 text-xs font-bold text-zinc-600 hover:text-zinc-950 transition-colors"
                      >
                        <ArrowLeft className="h-4 w-4" /> <span className="hidden sm:inline">Back</span>
                      </button>
                      <div className="h-4 w-px bg-zinc-200 hidden md:block" />
                      <div>
                        <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block">Step {step} of {TOTAL_STEPS}</span>
                        <span className="text-sm font-extrabold text-zinc-800">{STEP_LABELS[step - 1]}</span>
                      </div>
                    </div>
                    <div className="w-full md:flex-1 md:ml-auto flex items-center justify-center md:justify-end mt-2 md:mt-0">
                      <div className="flex items-center w-full max-w-sm justify-between px-1">
                        {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map((s, idx) => {
                          const isCompleted = step > s;
                          const isCurrent = step === s;
                          const active = isCompleted || isCurrent;
                          return (
                            <div key={s} className="flex items-center flex-1 last:flex-none">
                              <div className={`flex items-center justify-center shrink-0 w-8 h-8 sm:w-10 sm:h-10 rounded-full transition-colors duration-300 ${active ? 'bg-indigo-50 dark:bg-indigo-500/10' : 'bg-transparent'}`}>
                                <div className={`flex items-center justify-center w-6 h-6 sm:w-8 sm:h-8 rounded-full transition-all duration-300 ${active ? 'bg-indigo-600 text-white shadow-sm' : 'border-2 border-zinc-200 dark:border-zinc-700 text-zinc-400 bg-white dark:bg-zinc-900'}`}>
                                  {isCompleted ? (
                                    <Check className="h-3 w-3 sm:h-4 sm:w-4" strokeWidth={3} />
                                  ) : (
                                    <span className="text-[10px] sm:text-sm font-bold">{s}</span>
                                  )}
                                </div>
                              </div>
                              {idx < TOTAL_STEPS - 1 && (
                                <div className={`flex-1 h-1 mx-0.5 sm:mx-2 rounded-full transition-colors duration-300 ${step > s ? 'bg-indigo-600' : 'bg-zinc-200 dark:bg-zinc-800'}`} />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Step card */}
                  <div className="bg-white rounded-2xl sm:rounded-[2rem] border border-zinc-200 shadow-xl overflow-hidden min-h-[400px] flex flex-col">
                    <div className="p-4 sm:p-8 md:p-10 flex-1 flex flex-col">
                      <AnimatePresence mode="wait" custom={dir}>
                        <motion.div
                          key={step}
                          custom={dir}
                          variants={stepVariants}
                          initial="enter"
                          animate="center"
                          exit="exit"
                          transition={{ type: "spring", stiffness: 320, damping: 30 }}
                          className="flex-1 flex flex-col"
                        >

                          {/* STEP 1 – Brand & Model */}
                          {step === 1 && (
                            <div className="flex-1 flex flex-col justify-between">
                              <div className="space-y-6">
                                <div>
                                  <h2 className="font-sans text-3xl md:text-4xl font-extrabold tracking-tight mb-2">Brand &amp; model</h2>
                                  <p className="text-zinc-400 font-medium text-sm">Tell us exactly what device you have.</p>
                                </div>
                                <div className="space-y-3">
                                  <p className="text-xs font-bold uppercase tracking-widest text-zinc-400">Brand</p>
                                  <div className="flex flex-wrap gap-2">
                                    {BRANDS[state.deviceType]?.map(brand => (
                                      <button
                                        key={brand}
                                        onClick={() => setState(s => ({ ...s, brand }))}
                                        className={`px-5 py-3 rounded-[1rem] border-2 font-bold text-sm transition-all ${state.brand === brand ? "border-zinc-950 bg-zinc-950 text-white dark:border-white dark:bg-white dark:text-zinc-950" : "border-zinc-200 hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-700 dark:text-zinc-300"}`}
                                      >
                                        {brand}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                                <div className="flex flex-col gap-2">
                                  <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">Exact model</label>
                                  <input
                                    type="text"
                                    placeholder={`E.g. ${state.deviceType === "Phone" ? "iPhone 14 Pro, Galaxy S23" : state.deviceType === "Console" ? "PS5 Digital, Xbox Series X" : "MacBook Air M2, XPS 15"}`}
                                    value={state.model}
                                    onChange={e => setState(s => ({ ...s, model: e.target.value }))}
                                    className="h-14 rounded-[1rem] border-2 border-zinc-200 px-5 text-sm font-medium outline-none focus:border-accent transition-colors"
                                  />
                                </div>
                              </div>
                              <div className="pt-6 border-t border-zinc-100">
                                <button
                                  onClick={() => { if (state.brand && state.model) go(1); }}
                                  disabled={!state.brand || !state.model}
                                  className="w-full h-14 bg-black text-white rounded-[1.5rem] font-bold text-base flex items-center justify-center gap-2 disabled:opacity-40 hover:bg-zinc-800 transition-colors"
                                >
                                  Continue <ArrowRight className="h-5 w-5" />
                                </button>
                              </div>
                            </div>
                          )}

                          {/* STEP 2 – Issue */}
                          {step === 2 && (
                            <div className="flex-1 flex flex-col justify-between">
                              <div className="space-y-6">
                                <div>
                                  <h2 className="font-sans text-3xl md:text-4xl font-extrabold tracking-tight mb-2">What&apos;s the problem?</h2>
                                  <p className="text-zinc-400 font-medium text-sm">Select the closest description — don&apos;t worry if you&apos;re not sure.</p>
                                </div>
                                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Select all that apply</p>
                                <div className="space-y-3">
                                  {(ISSUES[state.deviceType] ?? []).map(issue => {
                                    const Icon = issue.icon;
                                    const selected = state.issue.includes(issue.id);
                                    return (
                                      <motion.button
                                        key={issue.id}
                                        whileTap={{ scale: 0.98 }}
                                        onClick={() => setState(s => ({
                                          ...s,
                                          issue: selected
                                            ? s.issue.filter(i => i !== issue.id)
                                            : [...s.issue, issue.id],
                                        }))}
                                        className={`w-full flex items-center gap-4 p-5 rounded-[1.5rem] border-2 text-left transition-all ${selected ? "border-zinc-950 bg-zinc-950 text-white dark:border-white dark:bg-white dark:text-zinc-950 shadow-md" : "border-zinc-200 hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-700 hover:shadow-sm text-zinc-800 dark:text-zinc-200"}`}
                                      >
                                        <div className={`h-11 w-11 rounded-xl flex items-center justify-center shrink-0 ${selected ? "bg-white/10 text-white dark:bg-zinc-950/10 dark:text-zinc-950" : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"}`}>
                                          <Icon className="h-5 w-5" />
                                        </div>
                                        <div className="flex-1">
                                          <p className="font-bold text-sm">{issue.label}</p>
                                          <p className={`text-xs mt-0.5 ${selected ? "text-white/60 dark:text-zinc-950/60" : "text-zinc-400 dark:text-zinc-550"}`}>{issue.desc}</p>
                                        </div>
                                        <div className={`h-6 w-6 rounded-lg border-2 flex items-center justify-center shrink-0 transition-all ${selected ? "bg-white border-white dark:bg-zinc-950 dark:border-zinc-950" : "border-zinc-300 dark:border-zinc-700"}`}>
                                          {selected && <Check className="h-3.5 w-3.5 text-black dark:text-white" strokeWidth={3} />}
                                        </div>
                                      </motion.button>
                                    );
                                  })}
                                </div>
                                {state.issue.length > 0 && (
                                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                                    <label className="text-xs font-bold uppercase tracking-widest text-zinc-400 block mb-2">
                                      Additional details <span className="text-zinc-300">(optional)</span>
                                    </label>
                                    <textarea
                                      placeholder="Any extra info that would help our technician..."
                                      value={state.issueNotes}
                                      onChange={e => setState(s => ({ ...s, issueNotes: e.target.value }))}
                                      rows={3}
                                      className="w-full rounded-[1rem] border-2 border-zinc-200 px-5 py-4 text-sm font-medium outline-none focus:border-accent transition-colors resize-none"
                                    />
                                  </motion.div>
                                )}
                              </div>
                              {/* Image Upload (required) */}
                              {state.issue.length > 0 && (
                                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
                                  <label className="text-xs font-bold uppercase tracking-widest text-zinc-400 block">
                                    Device Photos <span className="text-red-500">*</span> <span className="text-zinc-300 font-normal normal-case tracking-normal">(min 1 required)</span>
                                  </label>
                                  <div className="grid grid-cols-2 gap-2">
                                    <button
                                      type="button"
                                      onClick={() => fileInputRef.current?.click()}
                                      disabled={imageUploading || images.length >= 6}
                                      className="border-2 border-dashed border-zinc-200 dark:border-zinc-800 hover:border-zinc-950 dark:hover:border-white rounded-[1.5rem] p-6 flex flex-col items-center gap-2 transition-all bg-zinc-50 dark:bg-zinc-900 hover:bg-white dark:hover:bg-zinc-950 group disabled:opacity-60 disabled:pointer-events-none"
                                    >
                                      <div className="h-10 w-10 rounded-xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center group-hover:bg-zinc-950 dark:group-hover:bg-white group-hover:border-zinc-950 dark:group-hover:border-white transition-all">
                                        {imageUploading ? (
                                          <div className="h-4 w-4 border-2 border-zinc-300 dark:border-zinc-700 border-t-zinc-700 dark:border-t-zinc-200 rounded-full animate-spin" />
                                        ) : (
                                          <Upload className="h-4 w-4 text-zinc-400 dark:text-zinc-500 group-hover:text-white dark:group-hover:text-zinc-950 transition-colors" />
                                        )}
                                      </div>
                                      <p className="text-xs font-bold text-zinc-700 dark:text-zinc-200">{imageUploading ? "Uploading…" : "Upload photos"}</p>
                                      <p className="text-[10px] text-zinc-400 dark:text-zinc-500">JPEG or PNG · max 6</p>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setCameraOpen(true)}
                                      disabled={imageUploading || images.length >= 6}
                                      className="border-2 border-dashed border-zinc-200 dark:border-zinc-800 hover:border-zinc-950 dark:hover:border-white rounded-[1.5rem] p-6 flex flex-col items-center gap-2 transition-all bg-zinc-50 dark:bg-zinc-900 hover:bg-white dark:hover:bg-zinc-950 group disabled:opacity-60 disabled:pointer-events-none"
                                    >
                                      <div className="h-10 w-10 rounded-xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center group-hover:bg-zinc-950 dark:group-hover:bg-white group-hover:border-zinc-950 dark:group-hover:border-white transition-all">
                                        <Camera className="h-4 w-4 text-zinc-400 dark:text-zinc-500 group-hover:text-white dark:group-hover:text-zinc-950 transition-colors" />
                                      </div>
                                      <p className="text-xs font-bold text-zinc-700 dark:text-zinc-200">Take photo</p>
                                      <p className="text-[10px] text-zinc-400 dark:text-zinc-500">Use your camera</p>
                                    </button>
                                  </div>
                                  {images.length > 0 && (
                                    <div className="grid grid-cols-3 gap-2">
                                      {images.map((img, i) => (
                                        <div key={i} className="relative aspect-square rounded-xl overflow-hidden border border-zinc-200">
                                          <img src={getImageSrc(img)} alt={`Preview ${i + 1}`} className="w-full h-full object-cover" />
                                          <button
                                            type="button"
                                            onClick={() => setImages(prev => prev.filter((_, idx) => idx !== i))}
                                            className="absolute top-1 right-1 h-6 w-6 bg-zinc-950/80 hover:bg-red-500 rounded-full flex items-center justify-center transition-colors"
                                          >
                                            <X className="h-3 w-3 text-white" />
                                          </button>
                                        </div>
                                      ))}
                                      {images.length < 6 && (
                                        <button
                                          type="button"
                                          onClick={() => fileInputRef.current?.click()}
                                          disabled={imageUploading}
                                          className="aspect-square rounded-xl border-2 border-dashed border-zinc-200 dark:border-zinc-800 hover:border-zinc-950 dark:hover:border-white bg-zinc-50 dark:bg-zinc-900 flex items-center justify-center transition-colors text-zinc-400 dark:text-zinc-500 hover:text-zinc-950 dark:hover:text-white disabled:opacity-50"
                                        >
                                          <Plus className="h-5 w-5" />
                                        </button>
                                      )}
                                    </div>
                                  )}
                                </motion.div>
                              )}
                              <div className="pt-6 border-t border-zinc-100">
                                <button
                                  onClick={() => { if (state.issue.length > 0 && images.length > 0) go(1); }}
                                  disabled={state.issue.length === 0 || images.length === 0 || imageUploading}
                                  className="w-full h-14 bg-black text-white rounded-[1.5rem] font-bold text-base flex items-center justify-center gap-2 disabled:opacity-40 hover:bg-zinc-800 transition-colors"
                                >
                                  Continue <ArrowRight className="h-5 w-5" />
                                </button>
                                {state.issue.length > 0 && images.length === 0 && !imageUploading && (
                                  <p className="text-center text-[10px] text-red-500 font-bold mt-2">Please upload at least 1 photo to continue</p>
                                )}
                              </div>
                            </div>
                          )}

                          {/* STEP 3 – Fulfillment */}
                          {step === 3 && (
                            <div className="flex-1">
                              <h2 className="font-sans text-3xl md:text-4xl font-extrabold tracking-tight mb-2">How will you get it to us?</h2>
                              <p className="text-zinc-400 font-medium text-sm mb-8">Choose the most convenient option.</p>
                              <div className="space-y-3 sm:space-y-4">
                                {[
                                  { id: "dropoff", label: "Drop off in store", desc: "Bring it to TechStop Leicester for an instant quote.", icon: MapPin, badge: "No postage needed", badgeColor: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
                                  { id: "mail", label: "Send by post", desc: "Free prepaid label. Pack and drop at any post office.", icon: Truck, badge: "Free prepaid label", badgeColor: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
                                ].map(opt => {
                                  const Icon = opt.icon;
                                  return (
                                    <motion.button
                                      key={opt.id}
                                      whileTap={{ scale: 0.98 }}
                                      onClick={() => { setState(s => ({ ...s, fulfillment: opt.id })); go(1); }}
                                      className={`w-full rounded-2xl sm:rounded-[2rem] border-2 p-5 sm:p-7 text-left transition-all ${state.fulfillment === opt.id ? "border-zinc-950 bg-zinc-950 text-white dark:border-white dark:bg-white dark:text-zinc-950 shadow-md" : "border-zinc-200 bg-zinc-50 dark:bg-zinc-900 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-700 hover:bg-white hover:dark:bg-zinc-900/60 text-zinc-800 dark:text-zinc-200"}`}
                                    >
                                      <div className="flex items-start gap-4 sm:gap-5">
                                        <div className={`h-12 w-12 sm:h-14 sm:w-14 rounded-xl sm:rounded-2xl flex items-center justify-center flex-shrink-0 ${state.fulfillment === opt.id ? "bg-white/10 text-white dark:bg-zinc-950/10 dark:text-zinc-950" : "bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 shadow-sm"}`}>
                                          <Icon className="h-6 w-6 sm:h-7 sm:w-7" strokeWidth={1.5} />
                                        </div>
                                        <div>
                                          <p className="font-bold text-base sm:text-lg mb-1">{opt.label}</p>
                                          <p className={`text-xs sm:text-sm leading-relaxed ${state.fulfillment === opt.id ? "text-white/70 dark:text-zinc-950/70" : "text-zinc-500 dark:text-zinc-450"}`}>{opt.desc}</p>
                                          <span className={`mt-2 sm:mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest ${state.fulfillment === opt.id ? "bg-accent/20 text-accent dark:bg-accent/15" : opt.badgeColor}`}>
                                            {opt.badge}
                                          </span>
                                        </div>
                                      </div>
                                    </motion.button>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* STEP 4 – Contact */}
                          {step === 4 && (
                            <form
                              className="flex-1 flex flex-col justify-between"
                              onSubmit={async (e) => {
                                e.preventDefault();
                                if (user) {
                                  const missing: string[] = [];
                                  if (!user.phone)    missing.push("Phone number");
                                  if (!user.address)  missing.push("Street address");
                                  if (!user.city)     missing.push("City");
                                  if (!user.postcode) missing.push("Postcode");
                                  if (missing.length > 0) {
                                    setMissingFields(missing);
                                    setMissingDetailsOpen(true);
                                    return;
                                  }
                                }
                                setSubmitting(true);
                                setSubmitError("");
                                try {
                                  const result = await repairsApi.submit({
                                    deviceType: state.deviceType,
                                    brand: state.brand,
                                    model: state.model,
                                    issue: state.issue.join(", "),
                                    issueNotes: state.issueNotes,
                                    fulfillment: state.fulfillment === "mail" ? "ship" : state.fulfillment,
                                    images: images.map(i => i.filePath),
                                    contact: state.contact,
                                  });
                                  setSubmitRef(result.reference);
                                  go(1);
                                } catch (err) {
                                  setSubmitError(err instanceof Error ? err.message : "Submission failed");
                                } finally {
                                  setSubmitting(false);
                                }
                              }}
                            >
                              <div className="space-y-4">
                                <div>
                                  <h2 className="font-sans text-3xl md:text-4xl font-extrabold tracking-tight mb-2">Your contact details</h2>
                                  <p className="text-zinc-400 font-medium text-sm">Our technician will reach out to confirm the booking and pricing.</p>
                                </div>

                                {user ? (
                                  <div className="flex items-center gap-2.5 bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3">
                                    <div className="h-8 w-8 rounded-full bg-emerald-100 border border-emerald-200 flex items-center justify-center font-black text-xs text-emerald-700 shrink-0">
                                      {user.name[0]}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-xs font-black text-emerald-900 truncate">{user.name}</p>
                                      <p className="text-[10px] font-bold text-emerald-600">Details filled from your account</p>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="space-y-3">
                                    <a
                                      href={`${API_URL}/auth/google`}
                                      onClick={() => { /* auto-save handles sessionStorage */ }}
                                      className="w-full h-12 bg-white border-2 border-zinc-200 rounded-2xl font-bold transition-all hover:scale-[1.02] hover:border-zinc-400 active:scale-[0.98] flex items-center justify-center gap-3 text-sm text-zinc-700 shadow-sm"
                                    >
                                      <GoogleIcon />
                                      Continue with Google
                                    </a>
                                    <div className="flex items-center gap-3">
                                      <div className="flex-1 h-px bg-zinc-200" />
                                      <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">or fill manually</span>
                                      <div className="flex-1 h-px bg-zinc-200" />
                                    </div>
                                  </div>
                                )}

                                {(() => {
                                  const allFields = [
                                    { key: "name",     label: "Full Name",          type: "text",  placeholder: "E.g. Alex Turner", mandatory: true },
                                    { key: "email",    label: "Email Address",       type: "email", placeholder: "you@example.com", mandatory: true },
                                    { key: "phone",    label: "Phone Number",        type: "tel",   placeholder: "+44 7700 000000", mandatory: true },
                                    ...(state.fulfillment === "mail" ? [
                                      { key: "address",  label: "Collection Address", type: "text",  placeholder: "Street address", mandatory: false },
                                      { key: "postcode", label: "Postcode",           type: "text",  placeholder: "LE1 1AA", mandatory: false },
                                    ] : []),
                                  ];
                                  const visibleFields = user ? [] : allFields;
                                  if (visibleFields.length === 0) return null;
                                  return visibleFields.map(({ key, label, type, placeholder, mandatory }) => (
                                    <div key={key} className="flex flex-col gap-2">
                                      <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">
                                        {label} {mandatory && <span className="text-red-500">*</span>}
                                      </label>
                                      <input
                                        type={type}
                                        required={mandatory}
                                        placeholder={placeholder}
                                        value={state.contact[key as keyof typeof state.contact]}
                                        onChange={e => setState(s => ({ ...s, contact: { ...s.contact, [key]: e.target.value } }))}
                                        className="h-14 rounded-[1rem] border-2 border-zinc-200 px-5 text-sm font-medium outline-none focus:border-accent transition-colors"
                                      />
                                    </div>
                                  ));
                                })()}

                                {submitError && (
                                  <p className="text-sm font-bold text-red-500 bg-red-50 border border-red-100 rounded-2xl px-4 py-3">{submitError}</p>
                                )}
                              </div>

                              <div className="pt-6 border-t border-zinc-100">
                                <button
                                  type="submit"
                                  disabled={submitting}
                                  className="w-full h-14 bg-black text-white rounded-[1.5rem] font-bold text-base flex items-center justify-center gap-2 hover:bg-zinc-800 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                                >
                                  {submitting ? "Submitting…" : "Book Repair"} {!submitting && <ArrowRight className="h-5 w-5" />}
                                </button>
                                <p className="text-center text-[10px] text-zinc-400 font-medium mt-3">
                                  No payment now — you approve the quote before any work begins.
                                </p>
                              </div>
                            </form>
                          )}

                          {/* STEP 5 – Confirmation */}
                          {step === 5 && (
                            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center flex-1 flex flex-col items-center justify-center">
                              <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                transition={{ type: "spring", stiffness: 260, damping: 20, delay: 0.1 }}
                                className="mx-auto h-24 w-24 bg-mood-violet rounded-[2.5rem] flex items-center justify-center mb-8 border border-violet-100"
                              >
                                <Wrench className="h-12 w-12 text-black" strokeWidth={1.5} />
                              </motion.div>
                              <h2 className="font-sans text-3xl md:text-4xl font-extrabold tracking-tight mb-4">Booking received!</h2>
                              <p className="text-zinc-400 font-medium text-base mb-8 max-w-sm mx-auto leading-relaxed">
                                Your repair request for <strong className="text-black">{state.brand} {state.model}</strong> is logged. Expect a call or email within <strong className="text-black">2 hours</strong>.
                              </p>
                              <div className="w-full rounded-[2rem] bg-zinc-50 border border-zinc-100 p-6 mb-6 text-left">
                                <div className="space-y-3 text-sm">
                                  {[
                                    ...(submitRef ? [["Reference", submitRef]] : []),
                                    ["Device", `${state.brand} ${state.model}`],
                                    ["Issue", state.issue.map(id => ISSUES[state.deviceType]?.find(i => i.id === id)?.label ?? id).join(", ")],
                                    ["Method", state.fulfillment === "dropoff" ? "Drop-off in store" : "Post to us"],
                                    ["Contact", state.contact.email],
                                  ].map(([k, v]) => (
                                    <div key={k} className="flex flex-col sm:flex-row justify-between py-3 border-b border-zinc-100 last:border-0 gap-1 sm:gap-4">
                                      <span className="text-zinc-400 font-bold uppercase tracking-widest text-[10px] sm:self-center">{k}</span>
                                      <span className="font-bold sm:text-right break-words sm:break-normal">{v}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                              <div className="w-full rounded-[1.5rem] bg-black text-white p-5 mb-8 text-left">
                                <div className="flex items-center gap-3 mb-2">
                                  <Clock className="h-5 w-5 text-accent" />
                                  <p className="font-bold text-sm">What happens next?</p>
                                </div>
                                <p className="text-white/70 text-xs leading-relaxed">
                                  Our technician will contact you to confirm the diagnosis, give you a fixed quote, and schedule the repair. You pay nothing until you approve the quote.
                                </p>
                              </div>
                              <button
                                onClick={closeWizard}
                                className="inline-flex items-center gap-2 h-12 px-8 bg-black text-white rounded-[1.5rem] font-bold text-sm hover:bg-zinc-800 transition-colors"
                              >
                                Back to repair center
                              </button>
                            </motion.div>
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

      {/* Missing profile details modal */}
      {missingDetailsOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setMissingDetailsOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-black text-zinc-950">Complete your profile first</h3>
                <p className="text-xs text-zinc-500 font-medium mt-1">We need a few more details before you can book.</p>
              </div>
              <button onClick={() => setMissingDetailsOpen(false)} className="text-zinc-400 hover:text-zinc-700 transition-colors ml-4 mt-0.5">
                <X className="h-4 w-4" />
              </button>
            </div>
            <ul className="space-y-2">
              {missingFields.map(f => (
                <li key={f} className="flex items-center gap-2 text-sm font-semibold text-zinc-700">
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
              className="w-full h-11 bg-black text-white rounded-xl text-sm font-black hover:bg-zinc-800 transition-colors"
            >
              Go to Account Settings →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
