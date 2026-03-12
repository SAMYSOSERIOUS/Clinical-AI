import { useQuery } from "@tanstack/react-query";
import { fetchHealth, fetchAuditLog, fetchRecallCurve } from "../lib/api";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Activity, AlertTriangle, TrendingUp, Database } from "lucide-react";

function StatCard({
  label,
  value,
  icon: Icon,
  accent = false,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  accent?: boolean;
}) {
  return (
    <div className={`glass-card p-5 flex items-center gap-4 ${accent ? "border-teal-500/30" : ""}`}>
      <div className={`p-3 rounded-lg ${accent ? "bg-teal-500/20" : "bg-navy-700"}`}>
        <Icon className={`w-6 h-6 ${accent ? "text-teal-400" : "text-slate-400"}`} />
      </div>
      <div>
        <p className="text-2xl font-bold text-white">{value}</p>
        <p className="text-sm text-slate-400">{label}</p>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const health = useQuery({ queryKey: ["health"], queryFn: fetchHealth, refetchInterval: 30000 });
  const log    = useQuery({ queryKey: ["audit-log", 1], queryFn: () => fetchAuditLog(1, 5) });
  const curve  = useQuery({ queryKey: ["recall-curve"], queryFn: fetchRecallCurve });

  const rows        = log.data?.rows ?? [];
  const total       = log.data?.total ?? 0;
  const flagged     = rows.filter((r) => r.prediction === 1).length;
  const avgProb     = rows.length
    ? (rows.reduce((s, r) => s + r.probability, 0) / rows.length * 100).toFixed(1)
    : "—";
  const recallAt032 = curve.data?.length
    ? curve.data.reduce((best, p) =>
        Math.abs(p.threshold - 0.32) < Math.abs(best.threshold - 0.32) ? p : best,
        curve.data[0]
      ).recall
    : undefined;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-slate-400 text-sm mt-1">
          Diabetes 30-day readmission risk — live model status
        </p>
      </div>

      {/* Model status banner */}
      {health.data && !health.data.model_loaded && (
        <div className="flex items-center gap-3 p-4 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <span>
            Model not trained yet. Run{" "}
            <code className="bg-amber-500/20 px-1 rounded">
              python -m backend.scripts.train_model --skip-enrichment
            </code>{" "}
            to generate artefacts.
          </span>
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Predictions" value={total.toLocaleString()} icon={Database} />
        <StatCard
          label="Recall @ 32%"
          value={recallAt032 ? `${(recallAt032 * 100).toFixed(1)}%` : "—"}
          icon={TrendingUp}
          accent
        />
        <StatCard
          label="Flagged (latest 5)"
          value={`${flagged} / ${rows.length}`}
          icon={AlertTriangle}
        />
        <StatCard label="Avg Readmission Probability" value={`${avgProb}%`} icon={Activity} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Recall curve chart */}
        <div className="glass-card p-5">
          <h2 className="text-base font-semibold text-white mb-4">Recall–Precision Curve</h2>
          {curve.data ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={curve.data.filter((_, i) => i % 2 === 0)} barSize={8}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e3056" />
                <XAxis dataKey="threshold" stroke="#64748b" tick={{ fontSize: 11 }}
                  tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} />
                <YAxis stroke="#64748b" tick={{ fontSize: 11 }} domain={[0, 1]}
                  tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} />
                <Tooltip
                  contentStyle={{ background: "#141f38", border: "1px solid #1e3056", borderRadius: 8 }}
                  labelStyle={{ color: "#e2e8f0" }}
                  labelFormatter={(v) => `Threshold: ${(Number(v) * 100).toFixed(0)}%`}
                  formatter={(v) => [typeof v === "number" ? `${(v * 100).toFixed(1)}%` : v]}
                />
                <Bar dataKey="recall" fill="#14b8a6" name="Recall" radius={[4, 4, 0, 0]} />
                <Bar dataKey="precision" fill="#6366f1" name="Precision" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-slate-500">
              {curve.isLoading ? "Loading…" : "Recall curve unavailable"}
            </div>
          )}
        </div>

        {/* Recent predictions table */}
        <div className="glass-card p-5">
          <h2 className="text-base font-semibold text-white mb-4">Recent Predictions</h2>
          {rows.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-navy-700">
                    <th className="pb-2 pr-3">Time</th>
                    <th className="pb-2 pr-3">Prob.</th>
                    <th className="pb-2 pr-3">Thr.</th>
                    <th className="pb-2">Risk</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b border-navy-800/50 hover:bg-navy-800/40">
                      <td className="py-2 pr-3 text-slate-400 text-xs">
                        {new Date(r.timestamp).toLocaleTimeString()}
                      </td>
                      <td className="py-2 pr-3 font-mono">{(r.probability * 100).toFixed(1)}%</td>
                      <td className="py-2 pr-3 text-slate-400">{(r.threshold * 100).toFixed(0)}%</td>
                      <td className="py-2">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                            r.prediction === 1
                              ? "bg-red-500/20 text-red-300"
                              : "bg-green-500/20 text-green-300"
                          }`}
                        >
                          {r.prediction === 1 ? "HIGH" : "LOW"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="h-[180px] flex items-center justify-center text-slate-500">
              No predictions yet — use the Predict page to get started.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
