import React from "react";
import {
  Smartphone, Laptop, Gamepad2, Tablet, Headphones,
  HardDrive, Cpu, Zap, Watch, Monitor, Mouse, Package
} from "lucide-react";

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
