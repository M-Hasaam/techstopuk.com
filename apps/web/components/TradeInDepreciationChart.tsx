"use client";

import { useMemo } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceDot
} from "recharts";
import { Sparkles, ArrowDownRight } from "lucide-react";

interface TradeInDepreciationChartProps {
  currentOffer: number;
}

export default function TradeInDepreciationChart({ currentOffer }: TradeInDepreciationChartProps) {
  const chartData = useMemo(() => {
    const pNow = currentOffer;
    const p1m = Math.round(currentOffer * 0.955);
    const p3m = Math.round(currentOffer * 0.885);
    const p6m = Math.round(currentOffer * 0.775);

    return [
      {
        time: "Now",
        fullTime: "Today (Guaranteed)",
        price: pNow,
        diff: 0,
        pct: "100%",
        badge: "Highest Offer",
        isNow: true
      },
      {
        time: "1 Mo",
        fullTime: "1 Month",
        price: p1m,
        diff: p1m - pNow,
        pct: "-4.5%",
        badge: "Est. -4.5%",
        isNow: false
      },
      {
        time: "3 Mo",
        fullTime: "3 Months",
        price: p3m,
        diff: p3m - pNow,
        pct: "-11.5%",
        badge: "Est. -11.5%",
        isNow: false
      },
      {
        time: "6 Mo",
        fullTime: "6 Months",
        price: p6m,
        diff: p6m - pNow,
        pct: "-22.5%",
        badge: "Est. -22.5%",
        isNow: false
      }
    ];
  }, [currentOffer]);

  // Recharts' auto-generated ticks against a domain like ["dataMin - 15", "dataMax + 15"]
  // produce unevenly-spaced labels (e.g. £190, £172, £147, £122, £97 — a 18 gap then three
  // 25 gaps), which reads as subtly "wrong" even though the data itself is fine. Snapping
  // the domain to a round step and generating evenly-spaced ticks ourselves fixes that.
  const { yDomain, yTicks } = useMemo(() => {
    const prices = chartData.map((d) => d.price);
    const rawMin = Math.min(...prices) - 15;
    const rawMax = Math.max(...prices) + 15;

    // "Nice" step size aiming for ~5 ticks, rounded to 1/2/5 × a power of 10
    const rough = Math.max((rawMax - rawMin) / 4, 1);
    const magnitude = Math.pow(10, Math.floor(Math.log10(rough)));
    const normalized = rough / magnitude;
    const step = (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude;

    const min = Math.floor(rawMin / step) * step;
    const max = Math.ceil(rawMax / step) * step;
    const ticks: number[] = [];
    for (let v = min; v <= max + 0.001; v += step) ticks.push(Math.round(v));

    return { yDomain: [min, max] as [number, number], yTicks: ticks };
  }, [chartData]);

  return (
    <div className="bg-white dark:bg-zinc-900/90 border border-zinc-200/90 dark:border-zinc-800 rounded-3xl p-5 sm:p-6 text-left space-y-4 shadow-lg shadow-zinc-900/5 relative overflow-hidden backdrop-blur-md">
      {/* Header Bar */}
      <div className="flex items-center gap-2 border-b border-zinc-100 dark:border-zinc-800/80 pb-3">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-600 text-white font-black text-[10px] uppercase tracking-wider shadow-xs shrink-0">
          <Sparkles className="h-3 w-3 fill-white" />
          Best Time To Sell
        </div>
        <span className="text-[11px] font-extrabold text-zinc-500 dark:text-zinc-400">
          Market Depreciation Forecast
        </span>
      </div>

      {/* Recharts Area Chart */}
      <div className="w-full h-52 relative pt-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 25, right: 18, left: -20, bottom: 5 }}>
            <defs>
              <linearGradient id="emeraldDepreciationGlow" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                <stop offset="60%" stopColor="#10b981" stopOpacity={0.06} />
                <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e4e4e7" strokeOpacity={0.5} />

            <XAxis
              dataKey="time"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fontWeight: 700, fill: "#71717a" }}
              dy={6}
            />

            <YAxis
              domain={yDomain}
              ticks={yTicks}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 10, fontWeight: 600, fill: "#a1a1aa" }}
              tickFormatter={(val) => `£${val}`}
            />

            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const data = payload[0].payload;
                  return (
                    <div className="bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 px-3.5 py-2.5 rounded-2xl shadow-xl border border-zinc-800 dark:border-zinc-200 text-xs space-y-1 z-50">
                      <div className="font-extrabold flex items-center justify-between gap-3 text-[11px] text-zinc-400 dark:text-zinc-500">
                        <span>{data.fullTime}</span>
                        <span className={`px-1.5 py-0.5 rounded font-black text-[9px] ${data.isNow ? 'bg-emerald-500 text-white' : 'bg-red-500/20 text-red-400'}`}>
                          {data.badge}
                        </span>
                      </div>
                      <div className="text-base font-black font-mono flex items-center gap-1.5">
                        £{data.price}
                        {data.diff < 0 && (
                          <span className="text-red-400 text-xs font-semibold flex items-center">
                            <ArrowDownRight className="h-3 w-3" />
                            £{Math.abs(data.diff)}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />

            <Area
              type="monotone"
              dataKey="price"
              stroke="#10b981"
              strokeWidth={3.5}
              fillOpacity={1}
              fill="url(#emeraldDepreciationGlow)"
              activeDot={{ r: 7, strokeWidth: 3, stroke: "#ffffff", fill: "#059669" }}
            />

            {/* Glowing dot on NOW */}
            <ReferenceDot
              x="Now"
              y={currentOffer}
              r={6}
              fill="#10b981"
              stroke="#ffffff"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
