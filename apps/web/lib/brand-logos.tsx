import React from "react";
import {
  Package, HardDrive, Cpu, Zap, Watch, Monitor, Mouse, Headphones,
  Smartphone, Laptop, Gamepad2, Tablet, Camera, Tv, Speaker, Cable,
  Battery, Wifi, Printer, Keyboard, Radio, Disc, Mic,
  Shield, Plug, Server, Globe, Sparkles, Tag, Percent, Gift, Heart,
  Star, Lightbulb, Film, Music, Video, Sliders, Flame, Layers,
  Glasses, Bluetooth, Activity, PenTool, Wrench, Briefcase, ShoppingBag,
  Fan, Database, Usb, CircuitBoard
} from "lucide-react";

export interface CategoryIconOption {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const CATEGORY_ICON_LIST: CategoryIconOption[] = [
  { id: "package", label: "Box / Default", icon: Package },
  { id: "hard-drive", label: "Storage / SSD", icon: HardDrive },
  { id: "cpu", label: "Memory / CPU", icon: Cpu },
  { id: "zap", label: "Charger / Power", icon: Zap },
  { id: "watch", label: "Smartwatch", icon: Watch },
  { id: "monitor", label: "Display / GPU", icon: Monitor },
  { id: "mouse", label: "Mouse & Keyboard", icon: Mouse },
  { id: "headphones", label: "Headphones / Audio", icon: Headphones },
  { id: "smartphone", label: "Phone", icon: Smartphone },
  { id: "laptop", label: "Laptop", icon: Laptop },
  { id: "tablet", label: "Tablet", icon: Tablet },
  { id: "gamepad-2", label: "Gaming / Console", icon: Gamepad2 },
  { id: "camera", label: "Camera / Lens", icon: Camera },
  { id: "tv", label: "TV / Display", icon: Tv },
  { id: "speaker", label: "Speaker", icon: Speaker },
  { id: "cable", label: "Cable / Wire", icon: Cable },
  { id: "battery", label: "Battery", icon: Battery },
  { id: "wifi", label: "Wi-Fi / Network", icon: Wifi },
  { id: "printer", label: "Printer", icon: Printer },
  { id: "keyboard", label: "Keyboard", icon: Keyboard },
  { id: "radio", label: "Radio", icon: Radio },
  { id: "disc", label: "Disc / Games", icon: Disc },
  { id: "mic", label: "Microphone", icon: Mic },

  { id: "shield", label: "Protection / Glass", icon: Shield },
  { id: "plug", label: "Adapter / Plug", icon: Plug },
  { id: "server", label: "Server / Networking", icon: Server },
  { id: "globe", label: "Global / Network", icon: Globe },
  { id: "sparkles", label: "Special / AI", icon: Sparkles },
  { id: "tag", label: "Deals / Offers", icon: Tag },
  { id: "percent", label: "Discount", icon: Percent },
  { id: "gift", label: "Gift / Package", icon: Gift },
  { id: "heart", label: "Favorites", icon: Heart },
  { id: "star", label: "Popular / Featured", icon: Star },
  { id: "lightbulb", label: "Smart Lighting", icon: Lightbulb },
  { id: "film", label: "Films / Movies", icon: Film },
  { id: "music", label: "Music / Audio", icon: Music },
  { id: "video", label: "Video Recording", icon: Video },
  { id: "sliders", label: "Mixers / Controls", icon: Sliders },
  { id: "flame", label: "Hot Deals", icon: Flame },
  { id: "layers", label: "Bundles / Stacks", icon: Layers },
  { id: "glasses", label: "VR / Smart Glasses", icon: Glasses },
  { id: "bluetooth", label: "Bluetooth", icon: Bluetooth },
  { id: "activity", label: "Fitness / Tracker", icon: Activity },
  { id: "pen-tool", label: "Stylus / Pen", icon: PenTool },
  { id: "wrench", label: "Tools / Repairs", icon: Wrench },
  { id: "briefcase", label: "Bags / Sleeves", icon: Briefcase },
  { id: "shopping-bag", label: "Pouches / Cases", icon: ShoppingBag },
  { id: "fan", label: "Cooling / Fans", icon: Fan },
  { id: "database", label: "Database / Storage", icon: Database },
  { id: "usb", label: "USB / Flash Drives", icon: Usb },
  { id: "circuit-board", label: "Components / Chips", icon: CircuitBoard },
];

export const CATEGORY_ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> =
  Object.fromEntries(CATEGORY_ICON_LIST.map(item => [item.id, item.icon]));

/**
 * Dynamic DB Icon Lookup: Looks up the icon directly by database iconKey.
 * No hardcoded constant name matching.
 */
export function getSubcategoryIcon(keyOrName?: string | null, iconKey?: string | null) {
  const key = iconKey || keyOrName;
  if (key && CATEGORY_ICON_MAP[key]) {
    return CATEGORY_ICON_MAP[key];
  }
  return Package;
}
