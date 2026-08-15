import React from "react";
import {
  Smartphone, Laptop, Gamepad2, Tablet, Headphones,
  HardDrive, Cpu, Zap, Watch, Monitor, Mouse, Package, ShieldCheck
} from "lucide-react";

export const BRAND_SVGS: Record<string, React.ReactNode> = {
  Apple: (
    <svg className="w-4 h-4 fill-current shrink-0" viewBox="0 0 170 170">
      <path d="M150.37 130.25c-2.45 5.66-5.35 10.87-8.71 15.66-4.58 6.53-8.33 11.05-11.22 13.56-4.48 4.12-9.28 6.23-14.42 6.35-3.69 0-8.14-1.05-13.32-3.18-5.19-2.12-9.97-3.17-14.34-3.17-4.58 0-9.49 1.05-14.75 3.17-5.26 2.13-9.5 3.24-12.74 3.35-4.34.13-9.13-1.92-14.36-6.17-2.9-2.42-6.66-6.87-11.28-13.38-5.31-7.5-9.87-15.93-13.68-25.3-3.82-9.37-5.73-18.41-5.73-27.13 0-14.68 4.13-26.69 12.39-36.03 8.26-9.34 18.26-14.07 30-14.18 5.7.1 11.23 1.57 16.58 4.41 5.35 2.84 9.17 4.26 11.48 4.26 2.12 0 6.06-1.48 11.83-4.44 5.76-2.96 11.29-4.38 16.59-4.26 12.18.23 22.06 4.79 29.62 13.68 5.48 6.4 9.27 13.68 11.39 21.84-12.83 5.25-21.43 12.98-25.8 23.2-4.38 10.22-4.14 20.9 0 32.06 3.1 8.35 8.1 15.35 15.02 21.02zm-28.53-118.73c0 7.9-2.88 15.15-8.63 21.75-5.76 6.6-12.79 10.5-21.1 11.72.13-7.5 3.12-14.8 8.98-21.87 5.86-7.07 13-11.13 21.42-12.18.63 8.33-.67 15.2-1.67 20.58z"/>
    </svg>
  ),
  Samsung: (
    <span className="font-black text-[9px] tracking-widest uppercase">Samsung</span>
  ),
  Google: (
    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
    </svg>
  ),
  OnePlus: (
    <span className="font-extrabold text-[9px] tracking-tight border border-current px-1 py-0.2 rounded-sm uppercase">1+</span>
  ),
  Sony: (
    <span className="font-black text-[9px] tracking-widest uppercase italic">Sony</span>
  ),
  Nintendo: (
    <span className="font-extrabold text-[8px] bg-red-600 text-white px-1.5 py-0.5 rounded-full uppercase tracking-wider">Nintendo</span>
  ),
  Microsoft: (
    <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 23 23">
      <rect width="10.8" height="10.8" fill="#F25022"/>
      <rect x="12.2" width="10.8" height="10.8" fill="#7FBA00"/>
      <rect y="12.2" width="10.8" height="10.8" fill="#00A4EF"/>
      <rect x="12.2" y="12.2" width="10.8" height="10.8" fill="#FFB900"/>
    </svg>
  ),
  Asus: (
    <span className="font-black text-[9px] tracking-widest uppercase italic">Asus</span>
  ),
  Dell: (
    <span className="font-extrabold text-[8px] border border-current rounded-full px-1.5 py-0.2">DELL</span>
  ),
  Lenovo: (
    <span className="font-bold text-[8px] bg-red-600 text-white px-1 py-0.2 uppercase">Lenovo</span>
  ),
  Bose: (
    <span className="font-bold text-[8px] tracking-widest uppercase italic">Bose</span>
  ),
};

export const SUBCATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  storage: HardDrive,
  ssd: HardDrive,
  hdd: HardDrive,
  memory: Cpu,
  ram: Cpu,
  cpu: Cpu,
  chargers: Zap,
  charger: Zap,
  cable: Zap,
  power: Zap,
  smartwatches: Watch,
  smartwatch: Watch,
  watch: Watch,
  "graphics card": Monitor,
  "graphics cards": Monitor,
  gpu: Monitor,
  monitor: Monitor,
  display: Monitor,
  screen: Monitor,
  "mouse & pen": Mouse,
  mouse: Mouse,
  pen: Mouse,
  audio: Headphones,
  headphone: Headphones,
  headphones: Headphones,
  earbuds: Headphones,
  speaker: Headphones,
  phone: Smartphone,
  phones: Smartphone,
  iphone: Smartphone,
  mobile: Smartphone,
  laptop: Laptop,
  laptops: Laptop,
  macbook: Laptop,
  gaming: Gamepad2,
  console: Gamepad2,
  consoles: Gamepad2,
  playstation: Gamepad2,
  xbox: Gamepad2,
  nintendo: Gamepad2,
  tablet: Tablet,
  tablets: Tablet,
  ipad: Tablet,
};

export function getSubcategoryIcon(name?: string | null) {
  if (!name) return Package;
  const key = name.toLowerCase().trim();
  for (const [k, Icon] of Object.entries(SUBCATEGORY_ICONS)) {
    if (key.includes(k)) return Icon;
  }
  return Package;
}
