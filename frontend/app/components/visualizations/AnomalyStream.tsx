"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Terminal, AlertCircle, AlertTriangle, Info, ChevronRight, ChevronDown } from "lucide-react";

export interface LogEntry {
  id: string;
  timestamp: string;
  level: "info" | "warning" | "alert" | "INFO" | "WARNING" | "ALERT";
  message: string;
  details: any;
}

interface AnomalyStreamProps {
  logs: LogEntry[];
}

const levelConfig: Record<string, { color: string; bg: string; icon: any }> = {
  info: { color: "text-blue-600", bg: "bg-blue-50/50 border-blue-200", icon: Info },
  warning: { color: "text-amber-600", bg: "bg-amber-50/50 border-amber-200", icon: AlertTriangle },
  alert: { color: "text-red-600", bg: "bg-red-50/50 border-red-200", icon: AlertCircle },
  INFO: { color: "text-blue-600", bg: "bg-blue-50/50 border-blue-200", icon: Info },
  WARNING: { color: "text-amber-600", bg: "bg-amber-50/50 border-amber-200", icon: AlertTriangle },
  ALERT: { color: "text-red-600", bg: "bg-red-50/50 border-red-200", icon: AlertCircle },
};

export default function AnomalyStream({ logs }: AnomalyStreamProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggleExpand = (id: string) => {
    if (expandedId === id) setExpandedId(null);
    else setExpandedId(id);
  };

  return (
    <div className="flex flex-col h-[400px] w-full bg-white border border-slate-200 rounded-xl overflow-hidden font-mono shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
        <div className="flex items-center gap-2 text-slate-500 text-xs font-bold uppercase tracking-widest">
          <Terminal size={14} className="text-emerald-600" />
          System Log Stream
        </div>
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="text-[10px] text-slate-500 uppercase">Live</span>
        </div>
      </div>

      {/* Log Stream */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
        <AnimatePresence initial={false}>
          {logs.map((log) => {
            const Config = levelConfig[log.level] || levelConfig.info;
            const Icon = Config.icon;
            const isExpanded = expandedId === log.id;

            return (
              <motion.div
                key={log.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className={`rounded-lg border overflow-hidden ${Config.bg}`}
              >
                <div 
                  className="flex items-start gap-3 p-3 cursor-pointer hover:bg-slate-50/50 transition-colors"
                  onClick={() => toggleExpand(log.id)}
                >
                  <Icon size={16} className={`mt-0.5 ${Config.color}`} />
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-slate-400">{new Date(log.timestamp).toLocaleTimeString()}</span>
                      {isExpanded ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />}
                    </div>
                    <span className={`text-sm ${log.level.toLowerCase() === 'alert' ? 'text-red-700 font-bold' : 'text-slate-700'}`}>
                      {log.message}
                    </span>
                  </div>
                </div>

                {/* Expanded Details JSON */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="p-3 bg-slate-50 border-t border-slate-200">
                        <pre className="text-[10px] text-slate-600 overflow-x-auto">
                          {JSON.stringify(log.details, null, 2)}
                        </pre>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </AnimatePresence>
        {logs.length === 0 && (
          <div className="h-full flex items-center justify-center text-slate-400 text-sm">
            Waiting for signals...
          </div>
        )}
      </div>
    </div>
  );
}
