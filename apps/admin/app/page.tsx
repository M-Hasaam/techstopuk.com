"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  TrendingUp, Package, RefreshCw, Wrench,
  ShoppingBag, ArrowRight, BarChart3, SlidersHorizontal, Users
} from "lucide-react";
import { adminApi, tradeInsApi, type DashboardData, type TradeIn } from "../lib/api";

const ORDER_STATUS_CFG: Record<string, { label: string; className: string }> = {
  PENDING:   { label: "Processing", className: "bg-blue-100 text-blue-700" },
  CONFIRMED: { label: "Confirmed",  className: "bg-violet-100 text-violet-700" },
  SHIPPED:   { label: "Dispatched", className: "bg-violet-100 text-violet-700" },
  DELIVERED: { label: "Delivered",  className: "bg-emerald-100 text-emerald-700" },
  CANCELLED: { label: "Cancelled",  className: "bg-red-100 text-red-500" },
};

const TRADE_STATUS_CFG: Record<string, { label: string; className: string }> = {
  PENDING:         { label: "Pending",       className: "bg-amber-100 text-amber-700" },
  UNDER_REVIEW:    { label: "Under review",  className: "bg-blue-100 text-blue-700" },
  APPROVED:        { label: "Approved",      className: "bg-emerald-100 text-emerald-700" },
  REJECTED:        { label: "Rejected",      className: "bg-red-100 text-red-700" },
  COUNTER_OFFERED: { label: "Counter offer", className: "bg-violet-100 text-violet-700" },
  COMPLETED:       { label: "Completed",     className: "bg-zinc-100 text-zinc-500" },
};

export default function AdminDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [recentTradeIns, setRecentTradeIns] = useState<TradeIn[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      adminApi.dashboard(),
      tradeInsApi.list({ limit: 5 }),
    ]).then(([dash, ti]) => {
      setData(dash);
      setRecentTradeIns(ti.items);
    }).catch(() => {/* ignore */}).finally(() => setLoading(false));
  }, []);

  const fmtDate = (s: string) => new Date(s).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  const fmtCurrency = (n: number) => `£${n.toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  const stats = data?.stats;

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6 md:p-8">
      <div className="mb-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-zinc-500 mt-1">
            {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-2xl bg-white border border-zinc-200 px-4 py-2.5 text-sm font-medium shadow-sm shrink-0">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
          </span>
          <span>All systems operational</span>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-40">
          <div className="h-8 w-8 border-4 border-zinc-200 border-t-black rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
            {[
              {
                label: "Revenue (MTD)",
                value: fmtCurrency(stats?.orders.revenueThisMonth ?? 0),
                sub: `${fmtCurrency(stats?.orders.revenue ?? 0)} all-time`,
                icon: BarChart3,
                iconBg: "bg-violet-50 text-violet-600",
              },
              {
                label: "Orders",
                value: String(stats?.orders.total ?? 0),
                sub: `${stats?.orders.pending ?? 0} pending`,
                icon: ShoppingBag,
                iconBg: "bg-blue-50 text-blue-600",
              },
              {
                label: "Trade-ins",
                value: String(stats?.tradeIns.total ?? 0),
                sub: `${stats?.tradeIns.pending ?? 0} pending`,
                icon: RefreshCw,
                iconBg: "bg-amber-50 text-amber-600",
              },
              {
                label: "Repairs",
                value: String(stats?.repairs.total ?? 0),
                sub: `${stats?.repairs.pending ?? 0} pending`,
                icon: Wrench,
                iconBg: "bg-rose-50 text-rose-600",
              },
            ].map((stat, i) => {
              const Icon = stat.icon;
              return (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.06, type: "spring", stiffness: 260, damping: 24 }}
                  className="bg-white rounded-3xl border border-zinc-100 p-6 shadow-sm"
                >
                  <div className="flex items-start justify-between mb-5">
                    <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${stat.iconBg}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <span className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold bg-zinc-100 text-zinc-500">
                      <TrendingUp className="h-3 w-3" />
                      live
                    </span>
                  </div>
                  <p className="text-2xl font-bold tracking-tight mb-1 font-mono">{stat.value}</p>
                  <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">{stat.label}</p>
                  <p className="text-xs text-zinc-400 mt-1">{stat.sub}</p>
                </motion.div>
              );
            })}
          </div>

          <div className="grid xl:grid-cols-[1fr_280px] gap-5 mb-5">
            {/* Breakdown chart */}
            <div className="bg-white rounded-3xl border border-zinc-100 p-7 shadow-sm">
              <div className="flex items-center justify-between mb-7">
                <div>
                  <h2 className="font-bold text-lg tracking-tight">Revenue</h2>
                  <p className="text-xs text-zinc-400 font-medium mt-0.5">This month vs all-time</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold font-mono tracking-tight">{fmtCurrency(stats?.orders.revenueThisMonth ?? 0)}</p>
                  <p className="text-[11px] font-bold text-zinc-400 mt-0.5">this month</p>
                </div>
              </div>

              {/* Order status breakdown bars */}
              <div className="space-y-3">
                {(data?.breakdown.orders ?? []).map(({ status, count }) => {
                  const cfg = ORDER_STATUS_CFG[status];
                  const total = (data?.stats.orders.total ?? 1);
                  const pct = Math.round((count / total) * 100);
                  return (
                    <div key={status} className="flex items-center gap-3">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 w-20 shrink-0">
                        {cfg?.label ?? status}
                      </span>
                      <div className="flex-1 h-2.5 bg-zinc-100 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ type: "spring", stiffness: 180, damping: 22 }}
                          className="h-full rounded-full bg-zinc-900"
                        />
                      </div>
                      <span className="text-xs font-bold font-mono text-zinc-500 w-8 text-right">{count}</span>
                    </div>
                  );
                })}
                {(data?.breakdown.orders ?? []).length === 0 && (
                  <p className="text-xs text-zinc-400 font-medium">No order data yet.</p>
                )}
              </div>
            </div>

            {/* Quick actions */}
            <div className="bg-white rounded-3xl border border-zinc-100 p-6 shadow-sm">
              <h2 className="font-bold text-base mb-4 tracking-tight">Quick actions</h2>
              <div className="space-y-1.5">
                {[
                  { label: "Add product",    href: "/products",  icon: Package,           color: "bg-blue-50 text-blue-600" },
                  { label: "Trade-ins",      href: "/trade-ins", icon: RefreshCw,         color: "bg-amber-50 text-amber-600" },
                  { label: "Repair queue",   href: "/repairs",   icon: Wrench,            color: "bg-rose-50 text-rose-600" },
                  { label: "Pricing rules",  href: "/pricing",   icon: SlidersHorizontal, color: "bg-violet-50 text-violet-600" },
                  { label: "Users",          href: "/users",     icon: Users,             color: "bg-zinc-100 text-zinc-600" },
                ].map(({ label, href, icon: Icon, color }) => (
                  <a
                    key={label}
                    href={href}
                    className="flex items-center gap-3 p-3 rounded-2xl hover:bg-zinc-50 transition-colors group"
                  >
                    <div className={`h-8 w-8 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <span className="text-sm font-medium flex-1">{label}</span>
                    <ArrowRight className="h-4 w-4 text-zinc-300 group-hover:text-black group-hover:translate-x-0.5 transition-all" />
                  </a>
                ))}
              </div>
            </div>
          </div>

          <div className="grid xl:grid-cols-2 gap-5">
            {/* Recent Trade-Ins */}
            <div className="bg-white rounded-3xl border border-zinc-100 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-6 py-5 border-b border-zinc-100">
                <h2 className="font-bold tracking-tight">Recent Trade-Ins</h2>
                <a href="/trade-ins" className="text-xs font-bold text-zinc-400 hover:text-black flex items-center gap-1 transition-colors">
                  View all <ArrowRight className="h-3.5 w-3.5" />
                </a>
              </div>
              <div className="divide-y divide-zinc-50">
                {recentTradeIns.length === 0 && (
                  <p className="px-6 py-10 text-sm text-zinc-400 font-medium text-center">No trade-ins yet.</p>
                )}
                {recentTradeIns.map(t => {
                  const cfg = TRADE_STATUS_CFG[t.status] ?? TRADE_STATUS_CFG.PENDING;
                  return (
                    <div key={t.id} className="flex items-center gap-4 px-6 py-4 hover:bg-zinc-50/60 transition-colors">
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-sm truncate">{t.brand} {t.model}</p>
                        <p className="text-xs text-zinc-400 mt-0.5">{t.reference} · {fmtDate(t.createdAt)}</p>
                      </div>
                      <p className="font-bold text-sm font-mono">£{t.offerPrice}</p>
                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide shrink-0 ${cfg.className}`}>
                        {cfg.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Recent Orders */}
            <div className="bg-white rounded-3xl border border-zinc-100 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-6 py-5 border-b border-zinc-100">
                <h2 className="font-bold tracking-tight">Recent Orders</h2>
                <a href="/orders" className="text-xs font-bold text-zinc-400 hover:text-black flex items-center gap-1 transition-colors">
                  View all <ArrowRight className="h-3.5 w-3.5" />
                </a>
              </div>
              <div className="divide-y divide-zinc-50">
                {(data?.recentOrders ?? []).length === 0 && (
                  <p className="px-6 py-10 text-sm text-zinc-400 font-medium text-center">No orders yet.</p>
                )}
                {(data?.recentOrders ?? []).map(o => {
                  const cfg = ORDER_STATUS_CFG[o.status] ?? ORDER_STATUS_CFG.PENDING;
                  const customerName = o.user?.name ?? "Guest";
                  const itemsSummary = o.items.map(i => i.product.name).join(", ");
                  return (
                    <div key={o.id} className="flex items-center gap-4 px-6 py-4 hover:bg-zinc-50/60 transition-colors">
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-sm truncate">{customerName}</p>
                        <p className="text-xs text-zinc-400 mt-0.5 truncate">{itemsSummary || "—"}</p>
                      </div>
                      <p className="font-bold text-sm font-mono">£{o.total}</p>
                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide shrink-0 ${cfg.className}`}>
                        {cfg.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
