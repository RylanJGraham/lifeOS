"use client"

import { useEffect, useState } from "react";
import { Title, Card, Grid, Badge, Text, Divider } from "@tremor/react";
import { createBrowserClient } from "@supabase/ssr";

export default function SystemObservabilityHub() {
  const [apiStatus, setApiStatus] = useState<any>(null);
  const [logs, setLogs] = useState<any[]>([]);

  useEffect(() => {
    // 1. Poll FastAPI Status
    const fetchStatus = async () => {
      try {
        const res = await fetch("http://localhost:8000/status");
        if (res.ok) {
          const data = await res.json();
          setApiStatus(data);
        }
      } catch (e) {
        console.error("FastAPI unreachable", e);
      }
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000); // Poll every 30s

    // 2. Fetch System Logs from Supabase
    // Note: requires NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local
    if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );
      
      const fetchLogs = async () => {
        const { data, error } = await supabase
          .from("system_logs")
          .select("*")
          .order("timestamp", { ascending: false })
          .limit(20);
          
        if (!error && data) setLogs(data);
      };
      
      fetchLogs();

      // Subscribe to real-time logs
      const channel = supabase
        .channel("system_logs_changes")
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "system_logs" }, (payload) => {
          setLogs((prev) => [payload.new, ...prev].slice(0, 20));
        })
        .subscribe();

      return () => {
        clearInterval(interval);
        supabase.removeChannel(channel);
      };
    }

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center mb-6">
        <Title className="text-2xl font-bold text-white">System Observability</Title>
        <div className="flex gap-2">
           <Badge color={apiStatus?.status === "online" ? "emerald" : "rose"}>
             API: {apiStatus?.status || "offline"}
           </Badge>
        </div>
      </div>
      
      <Grid numItems={1} numItemsLg={3} className="gap-6">
        {/* Service Statuses */}
        <Card className="bg-slate-900 border-slate-800">
          <Title className="text-white mb-4">Core Services</Title>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <Text className="text-slate-300">Ollama (LLM)</Text>
              <Badge color={apiStatus?.services?.ollama === "ok" ? "emerald" : "rose"}>
                {apiStatus?.services?.ollama || "unknown"}
              </Badge>
            </div>
            <div className="flex justify-between items-center">
              <Text className="text-slate-300">Supabase (Vector DB)</Text>
              <Badge color={apiStatus?.services?.supabase === "ok" ? "emerald" : "rose"}>
                {apiStatus?.services?.supabase || "unknown"}
              </Badge>
            </div>
            <div className="flex justify-between items-center">
              <Text className="text-slate-300">Ngrok (Webhook)</Text>
              <Badge color={apiStatus?.services?.ngrok === "ok" ? "emerald" : "rose"}>
                {apiStatus?.services?.ngrok || "unknown"}
              </Badge>
            </div>
          </div>
        </Card>

        {/* Tracing Links */}
        <Card className="bg-slate-900 border-slate-800 col-span-1 lg:col-span-2">
          <Title className="text-white mb-2">LangSmith Tracing</Title>
          <Text className="text-slate-400 mb-4">Deep insights into LangGraph agent reasoning and execution paths.</Text>
          <div className="p-4 border border-slate-800 rounded bg-slate-950 flex justify-between items-center">
            <Text className="text-slate-300 font-mono text-sm">LANGCHAIN_TRACING_V2 is Enabled</Text>
            <a href="https://smith.langchain.com/" target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-300 text-sm">
              Open LangSmith Dashboard ↗
            </a>
          </div>
        </Card>
      </Grid>

      {/* Real-time System Logs */}
      <Card className="bg-slate-900 border-slate-800 mt-6">
        <Title className="text-white mb-4">Live System Logs (Realtime)</Title>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-slate-400 uppercase bg-slate-950">
              <tr>
                <th className="px-4 py-3 rounded-tl-lg">Timestamp</th>
                <th className="px-4 py-3">Level</th>
                <th className="px-4 py-3">Service</th>
                <th className="px-4 py-3 rounded-tr-lg">Message</th>
              </tr>
            </thead>
            <tbody>
              {logs.length > 0 ? (
                logs.map((log, i) => (
                  <tr key={log.id || i} className="border-b border-slate-800 hover:bg-slate-800/50">
                    <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${
                        log.level === 'ERROR' || log.level === 'CRITICAL' ? 'bg-rose-900/50 text-rose-400' : 
                        log.level === 'WARNING' ? 'bg-amber-900/50 text-amber-400' : 
                        'bg-slate-800 text-slate-300'
                      }`}>
                        {log.level}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-300">{log.service}</td>
                    <td className="px-4 py-3 text-slate-300 font-mono text-xs">{log.message}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                    Waiting for system logs... Ensure NEXT_PUBLIC_SUPABASE_URL is set.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
