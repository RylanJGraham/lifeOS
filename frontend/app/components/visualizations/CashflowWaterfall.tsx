"use client";

import { motion } from "framer-motion";
import { ComposedChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { DollarSign } from "lucide-react";

interface CashflowWaterfallProps {
  data: {
    name: string;
    value: number;
    cumulative: number;
  }[];
}

export default function CashflowWaterfall({ data }: CashflowWaterfallProps) {
  // We need to format the data for a waterfall chart
  // A waterfall chart typically has 'start', 'end' or 'min', 'max' for the bar
  const waterfallData = data.map((item, index) => {
    const isTotal = index === data.length - 1;
    const previousCumulative = index === 0 ? 0 : data[index - 1].cumulative;
    
    return {
      ...item,
      // The floating bar is defined by an array [bottom, top]
      range: isTotal ? [0, item.cumulative] : [previousCumulative, item.cumulative],
      isPositive: item.value >= 0,
      isTotal
    };
  });

  return (
    <div className="w-full h-[400px] bg-white border border-slate-200 rounded-xl relative shadow-sm flex flex-col items-center justify-center p-4">
      <div className="absolute top-4 left-6 z-10 flex items-center gap-2">
        <DollarSign size={16} className="text-emerald-500" />
        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-widest">Cashflow Waterfall</h3>
      </div>
      
      <div className="w-full h-full mt-6">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={waterfallData} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
            <XAxis 
              dataKey="name" 
              tick={{ fill: '#64748b', fontSize: 11, fontWeight: 600 }} 
              axisLine={false}
              tickLine={false}
            />
            <YAxis 
              tick={{ fill: '#64748b', fontSize: 11, fontWeight: 600 }} 
              axisLine={false}
              tickLine={false}
              tickFormatter={(value) => `$${value}`}
            />
            <Tooltip 
              cursor={{ fill: '#f8fafc' }}
              contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
              formatter={(value: any, name: any, props: any) => {
                if (name === "range") {
                   return [`$${Math.abs(props.payload.value)}`, "Amount"];
                }
                return value;
              }}
            />
            <Bar dataKey="range" radius={[4, 4, 4, 4]}>
              {waterfallData.map((entry, index) => {
                if (entry.isTotal) return <Cell key={`cell-${index}`} fill="#3b82f6" />; // Blue for total
                return <Cell key={`cell-${index}`} fill={entry.isPositive ? "#10b981" : "#ef4444"} />;
              })}
            </Bar>
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
