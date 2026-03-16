import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  Brush,
} from "recharts";
import { Activity, Users, Heart } from "lucide-react";
import { motion } from "framer-motion";

/**
 * DashboardCharts
 * - Self-contained React component that:
 *   - Attempts to fetch sample data from Supabase if REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY are provided.
 *   - Falls back to demo data otherwise.
 * - Replace the env var usage with your preferred secret management in production.
 *
 * Notes:
 * - Do NOT use a Supabase service_role key in the browser. Use anon key + RLS or fetch via a secure server function.
 */
const DashboardCharts = () => {
  const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL || "";
  const SUPABASE_ANON = process.env.REACT_APP_SUPABASE_ANON_KEY || "";

  // Demo fallback data (7 days)
  const demoDates = [
    "2026-02-24",
    "2026-02-25",
    "2026-02-26",
    "2026-02-27",
    "2026-02-28",
    "2026-03-01",
    "2026-03-02",
  ];
  const demoData = demoDates.map((d, i) => ({
    date: d,
    occupancy: 60 + Math.round(Math.sin(i / 2) * 10 + i * 2),
    malaria: 5 + Math.round(Math.abs(Math.sin(i)) * 8),
    maternity_deliveries: 1 + Math.round(Math.abs(Math.cos(i)) * 4),
    maternity_cs: Math.round(Math.random() * 2),
  }));

  const [data, setData] = useState(demoData);
  const [loading, setLoading] = useState(!!(SUPABASE_URL && SUPABASE_ANON));
  const [error, setError] = useState(null);

  // Initialize supabase client only if envs provided
  const supabase = useMemo(() => {
    if (SUPABASE_URL && SUPABASE_ANON) {
      return createClient(SUPABASE_URL, SUPABASE_ANON);
    }
    return null;
  }, [SUPABASE_URL, SUPABASE_ANON]);

  // Fetch aggregated figures from Supabase
  useEffect(() => {
    if (!supabase) return;

    let mounted = true;
    setLoading(true);
    setError(null);

    // Example queries:
    // - occupancy per day: SELECT date_trunc('day', recorded_at) AS day, avg(occupancy) FROM occupancy_table GROUP BY day ORDER BY day;
    // - malaria per day: SELECT date_trunc('day', created_at) AS day, count(*) FROM malaria_reports GROUP BY day ORDER BY day;
    //
    // Replace table/column names with your schema. The component expects three series:
    //  { date, occupancy, malaria, maternity_deliveries, maternity_cs }
    //
    // This example demonstrates performing multiple queries in parallel and merging results client-side.
    async function load() {
      try {
        // Example: fetch occupancy averages by day
        const { data: occ, error: occErr } = await supabase
          .from("occupancy_daily") // recommended: a pre-aggregated table or view
          .select("day, avg_occupancy")
          .order("day", { ascending: true })
          .limit(100);

        if (occErr) throw occErr;

        // Example: fetch malaria counts by day
        const { data: mal, error: malErr } = await supabase
          .from("malaria_daily") // recommended pre-aggregated
          .select("day, cases")
          .order("day", { ascending: true })
          .limit(100);

        if (malErr) throw malErr;

        // Example: fetch maternity daily summary
        const { data: mat, error: matErr } = await supabase
          .from("maternity_daily")
          .select("day, deliveries, cs")
          .order("day", { ascending: true })
          .limit(100);

        if (matErr) throw matErr;

        // Merge by day
        const map = new Map();
        (occ || []).forEach((r) => {
          const date = r.day ? r.day.split("T")[0] : r.day;
          map.set(date, { date, occupancy: r.avg_occupancy });
        });
        (mal || []).forEach((r) => {
          const date = r.day ? r.day.split("T")[0] : r.day;
          const existing = map.get(date) || { date };
          existing.malaria = r.cases;
          map.set(date, existing);
        });
        (mat || []).forEach((r) => {
          const date = r.day ? r.day.split("T")[0] : r.day;
          const existing = map.get(date) || { date };
          existing.maternity_deliveries = r.deliveries;
          existing.maternity_cs = r.cs;
          map.set(date, existing);
        });

        // Convert to sorted array
        const merged = Array.from(map.values()).sort((a, b) =>
          a.date > b.date ? 1 : -1
        );

        if (mounted) {
          // If some fields missing, fill with zeros
          const normalized = merged.map((r) => ({
            date: r.date,
            occupancy: r.occupancy != null ? Number(r.occupancy) : 0,
            malaria: r.malaria != null ? Number(r.malaria) : 0,
            maternity_deliveries:
              r.maternity_deliveries != null
                ? Number(r.maternity_deliveries)
                : 0,
            maternity_cs: r.maternity_cs != null ? Number(r.maternity_cs) : 0,
          }));

          setData(normalized.length ? normalized : demoData);
          setLoading(false);
        }
      } catch (e) {
        console.error("Supabase fetch error", e);
        if (mounted) {
          setError(e.message || "Failed to fetch data");
          setLoading(false);
          setData(demoData);
        }
      }
    }

    load();

    // Optional: subscribe to realtime changes (example for malaria table)
    // const subs = supabase
    //   .from('malaria_reports')
    //   .on('INSERT', payload => { /* update local state */ })
    //   .subscribe();
    // cleanup:
    // return () => { mounted = false; supabase.removeSubscription(subs); };
    return () => {
      mounted = false;
    };
  }, [supabase]);

  // Summaries for small KPI cards
  const summary = useMemo(() => {
    const latest = data[data.length - 1] || {};
    const totalInpatients =
      Math.round(latest.occupancy || 0) + Math.round((latest.occupancy || 0) * 0.2);
    const malaria7d = data.slice(-7).reduce((s, r) => s + (r.malaria || 0), 0);
    const deliveries30d = data.slice(-30).reduce((s, r) => s + (r.maternity_deliveries || 0), 0);
    return { totalInpatients, malaria7d, deliveries30d };
  }, [data]);

  // Formatters
  const fmtDate = (iso) => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    } catch {
      return iso;
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-br from-green-600 to-green-400 text-white rounded-md w-12 h-12 flex items-center justify-center font-bold">
            BDH
          </div>
          <div>
            <div className="text-xl font-semibold">Admin Dashboard</div>
            <div className="text-sm text-gray-500">Realtime charts from Supabase (demo)</div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-sm text-gray-600">Environment: {SUPABASE_URL ? "Supabase" : "Demo"}</div>
          <button
            onClick={() => {
              // simple manual refresh
              if (!supabase) {
                setData(demoData);
                return;
              }
              setLoading(true);
              // re-trigger effect by toggling state (quick approach)
              // For clarity: call the fetching logic directly
              (async () => {
                try {
                  const { data: occ } = await supabase.from("occupancy_daily").select("day, avg_occupancy").order("day", { ascending: true }).limit(100);
                  const { data: mal } = await supabase.from("malaria_daily").select("day, cases").order("day", { ascending: true }).limit(100);
                  const { data: mat } = await supabase.from("maternity_daily").select("day, deliveries, cs").order("day", { ascending: true }).limit(100);

                  const map = new Map();
                  (occ || []).forEach((r) => {
                    const date = r.day ? r.day.split("T")[0] : r.day;
                    map.set(date, { date, occupancy: r.avg_occupancy });
                  });
                  (mal || []).forEach((r) => {
                    const date = r.day ? r.day.split("T")[0] : r.day;
                    const existing = map.get(date) || { date };
                    existing.malaria = r.cases;
                    map.set(date, existing);
                  });
                  (mat || []).forEach((r) => {
                    const date = r.day ? r.day.split("T")[0] : r.day;
                    const existing = map.get(date) || { date };
                    existing.maternity_deliveries = r.deliveries;
                    existing.maternity_cs = r.cs;
                    map.set(date, existing);
                  });
                  const merged = Array.from(map.values()).sort((a, b) => (a.date > b.date ? 1 : -1));
                  const normalized = merged.map((r) => ({
                    date: r.date,
                    occupancy: r.occupancy != null ? Number(r.occupancy) : 0,
                    malaria: r.malaria != null ? Number(r.malaria) : 0,
                    maternity_deliveries: r.maternity_deliveries != null ? Number(r.maternity_deliveries) : 0,
                    maternity_cs: r.maternity_cs != null ? Number(r.maternity_cs) : 0,
                  }));
                  setData(normalized.length ? normalized : demoData);
                } catch (e) {
                  console.error(e);
                  setError("Failed to refresh");
                  setData(demoData);
                } finally {
                  setLoading(false);
                }
              })();
            }}
            className="px-3 py-2 rounded-md border bg-white text-sm"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4 mb-4">
        <div className="p-4 bg-white rounded-lg shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-50 rounded"><Activity color="#059669" size={20} /></div>
            <div>
              <div className="text-xs text-gray-500">Current inpatients</div>
              <div className="text-xl font-bold">{summary.totalInpatients}</div>
              <div className="text-xs text-gray-400">Bed occupancy (latest avg)</div>
            </div>
          </div>
        </div>

        <div className="p-4 bg-white rounded-lg shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-yellow-50 rounded"><Users color="#b45309" size={20} /></div>
            <div>
              <div className="text-xs text-gray-500">Malaria (7d)</div>
              <div className="text-xl font-bold">{summary.malaria7d}</div>
              <div className="text-xs text-gray-400">Recent cases</div>
            </div>
          </div>
        </div>

        <div className="p-4 bg-white rounded-lg shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-pink-50 rounded"><Heart color="#be185d" size={20} /></div>
            <div>
              <div className="text-xs text-gray-500">Deliveries (30d)</div>
              <div className="text-xl font-bold">{summary.deliveries30d}</div>
              <div className="text-xs text-gray-400">Maternity activity</div>
            </div>
          </div>
        </div>
      </div>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}>
        <div className="grid lg:grid-cols-12 gap-4">
          <div className="lg:col-span-7 bg-white p-4 rounded-lg shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <div className="font-semibold">Occupancy (sparkline)</div>
              <div className="text-sm text-gray-500">Avg occupancy by day</div>
            </div>
            <div style={{ width: "100%", height: 220 }}>
              <ResponsiveContainer>
                <AreaChart data={data}>
                  <defs>
                    <linearGradient id="colorOcc" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0.06} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" tickFormatter={fmtDate} />
                  <YAxis />
                  <CartesianGrid strokeDasharray="3 3" />
                  <Tooltip labelFormatter={(v) => fmtDate(v)} />
                  <Area type="monotone" dataKey="occupancy" stroke="#059669" fill="url(#colorOcc)" dot={{ r: 2 }} />
                  <Brush dataKey="date" height={30} stroke="#059669" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="lg:col-span-5 bg-white p-4 rounded-lg shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <div className="font-semibold">Malaria trend</div>
              <div className="text-sm text-gray-500">Cases by day</div>
            </div>
            <div style={{ width: "100%", height: 220 }}>
              <ResponsiveContainer>
                <LineChart data={data}>
                  <XAxis dataKey="date" tickFormatter={fmtDate} />
                  <YAxis />
                  <CartesianGrid strokeDasharray="3 3" />
                  <Tooltip labelFormatter={(v) => fmtDate(v)} />
                  <Line type="monotone" dataKey="malaria" stroke="#b45309" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 6 }} />
                  <Brush dataKey="date" height={24} stroke="#b45309" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="lg:col-span-12 bg-white p-4 rounded-lg shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <div className="font-semibold">Maternity — deliveries vs C-sections</div>
              <div className="text-sm text-gray-500">Daily counts</div>
            </div>
            <div style={{ width: "100%", height: 260 }}>
              <ResponsiveContainer>
                <BarChart data={data}>
                  <XAxis dataKey="date" tickFormatter={fmtDate} />
                  <YAxis />
                  <CartesianGrid strokeDasharray="3 3" />
                  <Tooltip labelFormatter={(v) => fmtDate(v)} />
                  <Legend verticalAlign="top" align="right" />
                  <Bar dataKey="maternity_deliveries" name="Deliveries" fill="#06b6d4" />
                  <Bar dataKey="maternity_cs" name="C-sections" fill="#fb7185" />
                  <Brush dataKey="date" height={30} stroke="#06b6d4" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </motion.div>

      {loading && <div className="mt-4 text-sm text-gray-500">Loading data...</div>}
      {error && <div className="mt-4 text-sm text-red-600">Error: {error}</div>}
    </div>
  );
};

export default DashboardCharts; 