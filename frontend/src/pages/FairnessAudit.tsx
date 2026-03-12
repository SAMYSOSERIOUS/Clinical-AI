import { useState, Fragment } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchFairnessAll } from "../lib/api";
import type { FairnessResult, FairnessGroup } from "../lib/types";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  Cell,
} from "recharts";
import { ShieldAlert, MessageSquare } from "lucide-react";
import { useNavigate } from "react-router-dom";

function RiskBadge({ level }: { level: string }) {
  const c: Record<string, string> = {
    HIGH:   "bg-red-500/20 text-red-300 border-red-500/30",
    MEDIUM: "bg-amber-500/20 text-amber-300 border-amber-500/30",
    LOW:    "bg-green-500/20 text-green-300 border-green-500/30",
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${c[level] ?? c.LOW}`}>
      {level}
    </span>
  );
}

function FnrBarChart({ data, groupKey }: { data: FairnessGroup[]; groupKey: string }) {
  const maxFnr = Math.max(...data.map((d) => d.FNR as number));
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} layout="vertical" margin={{ left: 80, right: 40 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e3056" horizontal={false} />
        <XAxis type="number" domain={[0, 1]} stroke="#64748b" tick={{ fontSize: 11 }}
          tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} />
        <YAxis type="category" dataKey={groupKey} stroke="#64748b" tick={{ fontSize: 10 }} width={70} />
        <Tooltip
          contentStyle={{ background: "#141f38", border: "1px solid #1e3056", borderRadius: 8 }}
          formatter={(v) => [typeof v === 'number' ? `${(v * 100).toFixed(1)}%` : v, "FNR"]}
        />
        <Bar dataKey="FNR" radius={[0, 4, 4, 0]}>
          {data.map((entry, i) => (
            <Cell key={i} fill={(entry.FNR as number) === maxFnr ? "#ef4444" : "#3b82f6"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function SummaryCards({ result }: { result: FairnessResult; group?: string }) {
  return (
    <div className="grid grid-cols-3 gap-3 mb-4">
      {[
        ["Overall FNR", `${(result.overall.FNR * 100).toFixed(1)}%`],
        ["Max Disparity", `${(result.disparity.FNR * 100).toFixed(1)}%`],
        ["Risk Level", <RiskBadge key="r" level={result.risk_level} />],
      ].map(([label, val]) => (
        <div key={label as string} className="bg-navy-800 rounded-lg p-3 text-center">
          <p className="text-xs text-slate-500 mb-1">{label}</p>
          <div className="text-lg font-bold text-teal-400">{val}</div>
        </div>
      ))}
    </div>
  );
}

function HeatmapProxy({ race, age }: { race: FairnessResult; age: FairnessResult }) {
  const raceGroups  = race.by_group.map((r) => r[race.sensitive_feature.charAt(0).toUpperCase() + race.sensitive_feature.slice(1)] as string);
  const ageGroups   = age.by_group.map((a) => a[age.sensitive_feature.charAt(0).toUpperCase() + age.sensitive_feature.slice(1)] as string);

  const cells: { race: string; age: string; fnr_race: number; fnr_age: number; avg: number }[] = [];
  for (const rg of raceGroups) {
    for (const ag of ageGroups) {
      const r = race.by_group.find((d) => d[Object.keys(d)[0]] === rg)?.FNR as number ?? 0;
      const a = age.by_group.find((d) => d[Object.keys(d)[0]] === ag)?.FNR as number ?? 0;
      cells.push({ race: rg, age: ag, fnr_race: r, fnr_age: a, avg: (r + a) / 2 });
    }
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-white">Race × Age FNR (approximate proxy)</h3>
      <p className="text-xs text-slate-500">Average of Race FNR and Age FNR per cell. Run train_model.py for exact joint values.</p>
      <div className="overflow-x-auto">
        <div className="grid gap-1" style={{ gridTemplateColumns: `80px repeat(${ageGroups.length}, 1fr)` }}>
          <div />
          {ageGroups.map((ag) => (
            <div key={ag} className="text-center text-xs text-slate-400 pb-1 truncate">{ag}</div>
          ))}
          {raceGroups.map((rg) => (
            <Fragment key={rg}>
              <div className="text-xs text-slate-400 flex items-center pr-2 truncate">{rg}</div>
              {ageGroups.map((ag) => {
                const cell = cells.find((c) => c.race === rg && c.age === ag);
                const v = cell?.avg ?? 0;
                const r = Math.min(255, Math.round(v * 2 * 255));
                const g = Math.min(255, Math.round((1 - v) * 255));
                return (
                  <div
                    key={ag}
                    title={`${rg} × ${ag}: ${(v * 100).toFixed(1)}%`}
                    className="rounded text-center text-xs font-mono py-1"
                    style={{ backgroundColor: `rgba(${r},${g},40,0.6)`, color: "#fff" }}
                  >
                    {(v * 100).toFixed(0)}%
                  </div>
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function FairnessAudit() {
  const [tab, setTab] = useState<"race" | "gender" | "age">("race");
  const navigate = useNavigate();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["fairness-all"],
    queryFn: fetchFairnessAll,
  });

  if (isLoading) return <div className="p-6 text-slate-400">Loading fairness metrics…</div>;
  if (isError || !data)
    return (
      <div className="p-6 text-amber-300 flex items-center gap-2">
        <ShieldAlert className="w-5 h-5" />
        Fairness data unavailable — run train_model.py first.
      </div>
    );

  const activeResult = data[tab];
  const groupKey     = tab.charAt(0).toUpperCase() + tab.slice(1);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Fairness Audit</h1>
          <p className="text-slate-400 text-sm mt-1">Fairlearn MetricFrame — False Negative Rate by demographics</p>
        </div>
        <button
          onClick={() => navigate("/chat")}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-500/20 border border-teal-500/30 text-teal-300 text-sm hover:bg-teal-500/30"
        >
          <MessageSquare className="w-4 h-4" />
          Ask AI
        </button>
      </div>

      {/* Summary across groups */}
      <div className="grid grid-cols-3 gap-4">
        {(["race", "gender", "age"] as const).map((g) => (
          <div key={g} className="glass-card p-4">
            <p className="text-xs text-slate-400 capitalize mb-1">{g}</p>
            <div className="flex items-center justify-between">
              <span className="text-xl font-bold text-white">
                {(data[g].disparity.FNR * 100).toFixed(1)}%
              </span>
              <RiskBadge level={data[g].risk_level} />
            </div>
            <p className="text-xs text-slate-500 mt-0.5">FNR disparity gap</p>
          </div>
        ))}
      </div>

      {/* Per-group detail */}
      <div className="glass-card p-6">
        <div className="flex gap-2 mb-5">
          {(["race", "gender", "age"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-lg text-sm capitalize font-medium ${
                tab === t ? "bg-teal-500 text-white" : "text-slate-400 hover:text-white"
              }`}>
              {t}
            </button>
          ))}
        </div>

        <SummaryCards result={activeResult} group={tab} />
        <FnrBarChart data={activeResult.by_group} groupKey={groupKey} />

        {tab === "race" && <div className="mt-8"><HeatmapProxy race={data.race} age={data.age} /></div>}
      </div>
    </div>
  );
}
