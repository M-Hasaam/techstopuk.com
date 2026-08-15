"use client";

import React, { useState } from "react";
import {
  Package, HardDrive, Cpu, Zap, Watch, Monitor, Mouse, Headphones,
  Smartphone, Laptop, Gamepad2, Tablet, Camera, Tv, Speaker, Cable,
  Battery, Wifi, Printer, Keyboard, Radio, Disc, Mic, Check, Search,
  Shield, Plug, Server, Globe, Sparkles, Tag, Percent, Gift, Heart,
  Star, Lightbulb, Film, Music, Video, Sliders, Flame, Layers,
  Glasses, Bluetooth, Activity, PenTool, Wrench, Briefcase, ShoppingBag,
  Fan, Database, Usb, CircuitBoard
} from "lucide-react";

export interface IconOption {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const ADMIN_ICON_LIST: IconOption[] = [
  { id: "package", label: "Box (Default)", icon: Package },
  { id: "hard-drive", label: "Storage / SSD", icon: HardDrive },
  { id: "cpu", label: "Memory / CPU", icon: Cpu },
  { id: "zap", label: "Charger / Power", icon: Zap },
  { id: "watch", label: "Smartwatch", icon: Watch },
  { id: "monitor", label: "Display / GPU", icon: Monitor },
  { id: "mouse", label: "Mouse / Pen", icon: Mouse },
  { id: "headphones", label: "Headphones / Audio", icon: Headphones },
  { id: "smartphone", label: "Phone", icon: Smartphone },
  { id: "laptop", label: "Laptop", icon: Laptop },
  { id: "tablet", label: "Tablet", icon: Tablet },
  { id: "gamepad-2", label: "Gaming / Console", icon: Gamepad2 },
  { id: "camera", label: "Camera / Lens", icon: Camera },
  { id: "tv", label: "TV / Display", icon: Tv },
  { id: "speaker", label: "Speaker", icon: Speaker },
  { id: "cable", label: "Cable / Adapter", icon: Cable },
  { id: "battery", label: "Battery", icon: Battery },
  { id: "wifi", label: "Wi-Fi / Network", icon: Wifi },
  { id: "printer", label: "Printer", icon: Printer },
  { id: "keyboard", label: "Keyboard", icon: Keyboard },
  { id: "radio", label: "Radio", icon: Radio },
  { id: "disc", label: "Games / Disc", icon: Disc },
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

export const ADMIN_ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> =
  Object.fromEntries(ADMIN_ICON_LIST.map(i => [i.id, i.icon]));

export function getAdminCategoryIcon(iconKey?: string | null) {
  if (iconKey && ADMIN_ICON_MAP[iconKey]) {
    return ADMIN_ICON_MAP[iconKey];
  }
  return Package;
}

interface IconPickerProps {
  value: string;
  onChange: (iconId: string) => void;
  label?: string;
  defaultExpanded?: boolean;
}

export function IconPicker({
  value,
  onChange,
  label = "CHOOSE ICON",
  defaultExpanded = true,
}: IconPickerProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [search, setSearch] = useState("");

  const activeId = value || "package";
  const ActiveIcon = ADMIN_ICON_MAP[activeId] ?? Package;
  const activeLabel = ADMIN_ICON_LIST.find(i => i.id === activeId)?.label ?? "Box (Default)";

  const filteredIcons = ADMIN_ICON_LIST.filter(opt =>
    opt.id.toLowerCase().includes(search.toLowerCase().trim()) ||
    opt.label.toLowerCase().includes(search.toLowerCase().trim())
  );

  return (
    <div className="space-y-1.5">
      {label && (
        <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 block mb-1.5">
          {label}
        </label>
      )}

      {/* Primary Selection Card — Exactly 52px tall */}
      <div className="bg-white border border-zinc-200 rounded-2xl px-3.5 h-[52px] flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-xl bg-zinc-950 text-white flex items-center justify-center shrink-0 shadow-xs">
            <ActiveIcon className="h-4 w-4" />
          </div>
          <div>
            <span className="font-extrabold text-xs text-zinc-900 block leading-tight">{activeLabel}</span>
            <span className="text-[10px] font-medium text-zinc-400 block leading-tight">Key: {activeId}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="h-8 px-3 rounded-xl border border-zinc-200 text-xs font-bold text-zinc-700 hover:bg-zinc-950 hover:text-white hover:border-zinc-950 transition-all cursor-pointer shrink-0"
        >
          {expanded ? "Hide Icons" : "Change Icon"}
        </button>
      </div>

      {/* Icon Selection Grid — Modern Square Tile Grid */}
      {expanded && (
        <div className="bg-white border border-zinc-200 rounded-2xl p-3 shadow-xs mt-1.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
              Select Icon ({filteredIcons.length} shown):
            </p>
            <div className="relative w-full sm:w-48">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search icon..."
                className="w-full h-7 border border-zinc-200 rounded-lg pl-8 pr-2 text-xs focus:outline-none focus:border-zinc-400"
              />
            </div>
          </div>
          <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 gap-2 max-h-56 overflow-y-auto p-1">
            {filteredIcons.map(opt => {
              const IconComp = opt.icon;
              const isSelected = activeId === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  title={`${opt.label} (${opt.id})`}
                  onClick={() => onChange(opt.id)}
                  className={`relative h-11 w-full rounded-xl border flex items-center justify-center transition-all cursor-pointer ${
                    isSelected
                      ? "bg-zinc-950 text-white border-zinc-950 shadow-md ring-2 ring-zinc-950/20 scale-[1.05]"
                      : "bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400 hover:bg-zinc-100 hover:text-zinc-900"
                  }`}
                >
                  <IconComp className="h-5 w-5 shrink-0" />
                  {isSelected && (
                    <span className="absolute -top-1 -right-1 h-3.5 w-3.5 bg-emerald-500 rounded-full flex items-center justify-center text-white shadow-xs">
                      <Check className="h-2 w-2" />
                    </span>
                  )}
                </button>
              );
            })}
            {filteredIcons.length === 0 && (
              <div className="col-span-full py-6 text-center text-xs text-zinc-400 font-medium">
                No icons matching &ldquo;{search}&rdquo;
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
