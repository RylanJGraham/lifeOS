"use client";

import { motion } from "framer-motion";
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip } from "recharts";
import { Activity } from "lucide-react";

interface BiometricRadarProps {
  data: {
    domain: string;
    score: number;
    fullMark: number;
  }[];
}

export default function BiometricRadar({ data }: BiometricRadarProps) {
  return (
    <div className="w-full h-[400px] bg-white border border-slate-200 rounded-xl relative shadow-sm flex flex-col items-center justify-center p-4">
      <div className="absolute top-4 left-6 z-10 flex items-center gap-2">
        <Activity size={16} className="text-emerald-500" />
        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-widest">System Balance Matrix</h3>
      </div>
      
      <div className="w-full h-full mt-4">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart cx="50%" cy="50%" outerRadius="70%" data={data}>
            <PolarGrid stroke="#e2e8f0" />
            <PolarAngleAxis 
              dataKey="domain" 
              tick={{ fill: '#64748b', fontSize: 11, fontWeight: 700 }} 
            />
            <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
            <Tooltip 
              contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
              itemStyle={{ color: '#0f172a', fontWeight: 'bold' }}
            />
            <Radar
              name="Current Balance"
              dataKey="score"
              stroke="#10b981"
              strokeWidth={3}
              fill="#10b981"
              fillOpacity={0.2}
            />
            <Radar
              name="Optimal Baseline"
              dataKey="fullMark"
              stroke="#94a3b8"
              strokeWidth={1}
              strokeDasharray="4 4"
              fill="transparent"
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
