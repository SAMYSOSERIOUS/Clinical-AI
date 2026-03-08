import { useQuery } from "@tanstack/react-query";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceLine, CartesianGrid,
} from "recharts";
import { BrainCircuit, CheckCircle2, AlertTriangle, Info } from "lucide-react";
import { fetchRecallCurve, fetchFairnessAll } from "../lib/api";

const MODEL_PARAMS = [
  { param: "Algorithm",             value: "XGBClassifier  (Gradient Boosted Decision Trees)" },
  { param: "n_estimators",          value: "800 trees"                                        },
  { param: "max_depth",             value: "5 levels"                                         },
  { param: "learning_rate (η)",     value: "0.05"                                             },
  { param: "scale_pos_weight",      value: "10  (compensates 11.2 % positive class)"         },
  { param: "Objective",             value: "binary:logistic"                                  },
  { param: "Default threshold",     value: "0.32  (targets ~87 % recall)"                    },
  { param: "Explainability",        value: "shap.TreeExplainer  (exact Shapley values)"       },
];

const FEATURE_PIPELINE = [
  { name: "TF-IDF on ICD-9 codes", dim: 2000, color: "#14b8a6", detail: "TfidfVectorizer(max_features=2000, sublinear_tf=True) — diag_1, diag_2, diag_3 concatenated per encounter" },
  { name: "total_visits",           dim: 1,    color: "#3b82f6", detail: "number_outpatient + number_emergency + number_inpatient (StandardScaler)" },
  { name: "num_medications",        dim: 1,    color: "#3b82f6", detail: "Distinct medication count (StandardScaler)" },
  { name: "time_in_hospital",       dim: 1,    color: "#3b82f6", detail: "Length of stay in days, range 1–14 (StandardScaler)" },
  { name: "num_lab_procedures",     dim: 1,    color: "#3b82f6", detail: "Count of laboratory tests ordered (StandardScaler)" },
];

const LIMITATIONS = [
  { ok: false, text: "Trained on US data (1999–2008): temporal and geographic distribution shift is expected in modern EU/UK clinical settings" },
  { ok: false, text: "Uses legacy ICD-9 codes (deprecated 2015). Requires mapping from ICD-10 for integration with modern EHR systems" },
  { ok: false, text: "Significant class imbalance (11.2% positive) — model precision is low; most flagged patients will not be readmitted" },
  { ok: false, text: "Fairness disparities in FNR exist across race, gender, and age groups — see the Fairness Audit page for details" },
  { ok: false, text: "SHAP values are local (per-prediction) — global feature importance may differ across demographic sub-populations" },
  { ok: true,  text: "All predictions are advisory only. Clinical judgement must override model output in every case" },
  { ok: true,  text: "Every prediction is logged with threshold, probability, and input features for full auditability" },
];

const TS = { background: "#141f38", border: "1px solid #1e3056", borderRadius: 8, color: "#cbd5e1" };

export default function ModelTransparency() {
  const curve    = useQuery({ queryKey: ["recall-curve"], queryFn: fetchRecallCurve });
  const fairness = useQuery({ queryKey: ["fairness-all"], queryFn: fetchFairnessAll });

  const curveData  = curve.data ?? [];
  const defaultPt  = curveData.find((p) => p.threshold === 0.32) ??
                     curveData.reduce((best, p) =>
                       Math.abs(p.threshold - 0.32) < Math.abs(best.threshold - 0.32) ? p : best,
                       curveData[0]);

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <BrainCircuit className="w-6 h-6 text-teal-400" />
          Model Transparency
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          Full technical disclosure of the XGBoost 30-day diabetes readmission model:
          architecture, feature engineering, performance tradeoffs, fairness, and limitations.
        </p>
      </div>

      {/* Performance tiles at default threshold */}
      {defaultPt && (
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Recall @ 0.32",    value: `${(defaultPt.recall * 100).toFixed(1)}%`,    sub: "Sensitivity — true positive rate",    color: "text-teal-400"   },
            { label: "Precision @ 0.32", value: `${(defaultPt.precision * 100).toFixed(1)}%`, sub: "Positive predictive value",           color: "text-blue-400"   },
            { label: "Accuracy @ 0.32",  value: `${(defaultPt.accuracy * 100).toFixed(1)}%`,  sub: "Overall correct classification rate", color: "text-green-400"  },
            { label: "Feature dims",     value: "2,004",                                        sub: "2 000 TF-IDF + 4 scaled numeric",    color: "text-purple-400" },
          ].map((c) => (
            <div key={c.label} className="glass-card p-4">
              <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
              <p className="text-sm text-white mt-0.5">{c.label}</p>
              <p className="text-xs text-slate-500 mt-0.5">{c.sub}</p>
            </div>
          ))}
        </div>
      )}

      {/* Recall / Precision / Accuracy vs threshold curve */}
      <div className="glass-card p-4 space-y-3">
        <h3 className="text-sm font-semibold text-white">Recall · Precision · Accuracy vs Threshold</h3>
        {curveData.length > 0 ? (
          <>
            <ResponsiveContainer width="100%" height={210}>
              <LineChart data={curveData} margin={{ right: 24, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e3056" />
                <XAxis
                  dataKey="threshold"
                  stroke="#64748b"
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v) => v.toFixed(2)}
                />
                <YAxis
                  stroke="#64748b"
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                  domain={[0, 1]}
                />
                <Tooltip
                  contentStyle={TS}
                  formatter={(v, name) => [typeof v === "number" ? `${(v * 100).toFixed(1)}%` : String(v), String(name)]}  
                  labelFormatter={(l) => `Threshold: ${Number(l).toFixed(2)}`}
                />
                <ReferenceLine
                  x={0.32}
                  stroke="#14b8a6"
                  strokeDasharray="5 5"
                  label={{ value: "default 0.32", fill: "#14b8a6", fontSize: 10, position: "insideTopRight" }}
                />
                <Line type="monotone" dataKey="recall"    name="Recall"    stroke="#14b8a6" dot={false} strokeWidth={2} />
                <Line type="monotone" dataKey="precision" name="Precision" stroke="#3b82f6" dot={false} strokeWidth={2} />
                <Line type="monotone" dataKey="accuracy"  name="Accuracy"  stroke="#a78bfa" dot={false} strokeWidth={1.5} strokeDasharray="5 5" />
              </LineChart>
            </ResponsiveContainer>
            <div className="flex gap-5">
              {[["Recall", "#14b8a6"], ["Precision", "#3b82f6"], ["Accuracy (dashed)", "#a78bfa"]].map(([l, c]) => (
                <div key={l} className="flex items-center gap-1.5 text-xs text-slate-400">
                  <span className="w-4 h-0.5 rounded" style={{ background: c }} />
                  {l}
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="py-12 text-center text-slate-500 text-sm">
            {curve.isPending ? "Loading curve data…" : "Train the model to generate the recall curve."}
          </div>
        )}
      </div>

      {/* Hyperparameters + Feature pipeline side-by-side */}
      <div className="grid grid-cols-2 gap-4">
        {/* Hyperparameters */}
        <div className="glass-card p-4">
          <h3 className="text-sm font-semibold text-white mb-3">Model Hyperparameters</h3>
          <div className="divide-y divide-white/5">
            {MODEL_PARAMS.map((p) => (
              <div key={p.param} className="py-2 flex justify-between gap-3">
                <span className="text-xs text-slate-400 flex-shrink-0">{p.param}</span>
                <span className="text-xs text-white font-mono text-right">{p.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Feature pipeline */}
        <div className="glass-card p-4">
          <h3 className="text-sm font-semibold text-white mb-3">Feature Engineering Pipeline</h3>
          <div className="space-y-4">
            {FEATURE_PIPELINE.map((f) => (
              <div key={f.name}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-white font-medium">{f.name}</span>
                  <span className="text-xs font-mono" style={{ color: f.color }}>{f.dim.toLocaleString()} dim</span>
                </div>
                <div className="h-1.5 rounded-full bg-white/5 overflow-hidden mb-1">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${Math.min((f.dim / 2000) * 100, 100)}%`, background: f.color }}
                  />
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">{f.detail}</p>
              </div>
            ))}
            <div className="pt-1 border-t border-white/5 flex justify-between">
              <span className="text-xs text-slate-400">Total input dimensions</span>
              <span className="text-xs text-white font-mono font-bold">2,004</span>
            </div>
          </div>
        </div>
      </div>

      {/* Fairness summary */}
      {fairness.data && (
        <div className="glass-card p-4">
          <h3 className="text-sm font-semibold text-white mb-3">Fairness — False Negative Rate Disparity by Group</h3>
          <div className="grid grid-cols-3 gap-4">
            {(["race", "gender", "age"] as const).map((g) => {
              const r = fairness.data[g];
              const riskColor =
                r.risk_level === "HIGH"   ? { text: "text-red-400",   border: "border-red-500/20",   bg: "bg-red-500/10"   } :
                r.risk_level === "MEDIUM" ? { text: "text-amber-400", border: "border-amber-500/20", bg: "bg-amber-500/10" } :
                                            { text: "text-green-400", border: "border-green-500/20", bg: "bg-green-500/10" };
              return (
                <div key={g} className={`p-3 rounded-lg border ${riskColor.border} ${riskColor.bg}`}>
                  <p className="text-xs text-slate-400 capitalize">{g}</p>
                  <p className="text-2xl font-bold text-white mt-0.5">{(r.disparity.FNR * 100).toFixed(1)}%</p>
                  <p className="text-xs text-slate-500">FNR disparity gap</p>
                  <p className="text-xs text-slate-500">FPR gap: {(r.disparity.FPR * 100).toFixed(1)}%</p>
                  <span className={`text-xs font-semibold ${riskColor.text}`}>{r.risk_level} risk</span>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-slate-500 mt-3">
            FNR disparity = max FNR across groups − min FNR. See Fairness Audit page for full per-group breakdown.
          </p>
        </div>
      )}

      {/* SHAP explainability */}
      <div className="glass-card p-4">
        <h3 className="text-sm font-semibold text-white mb-3">Explainability — SHAP (SHapley Additive Explanations)</h3>
        <div className="grid grid-cols-2 gap-6">
          <div>
            <p className="text-sm text-slate-300 leading-relaxed">
              Every prediction returned by the API includes a{" "}
              <strong className="text-white">per-patient SHAP breakdown</strong> showing the top 10 features
              that drove the prediction. Powered by{" "}
              <code className="bg-[#0f1729] px-1 rounded text-teal-300">shap.TreeExplainer</code> — which
              computes <em>exact</em> Shapley values for tree models (not approximate sampling).
            </p>
            <p className="text-xs text-slate-500 mt-2">
              SHAP values are additive: they sum to the difference between the individual prediction and the
              global base rate (mean prediction across the training set).
            </p>
          </div>
          <div className="space-y-1.5 text-xs text-slate-400">
            <p className="text-white font-medium mb-2">How to read the SHAP chart</p>
            <p><span className="text-red-400 font-bold">Red bar →</span> feature pushes prediction <strong className="text-white">higher</strong> (more risk)</p>
            <p><span className="text-blue-400 font-bold">Blue bar →</span> feature pushes prediction <strong className="text-white">lower</strong> (less risk)</p>
            <p>Bar length = magnitude of contribution to the log-odds</p>
            <p>Feature value is shown alongside each bar for context</p>
            <p className="text-slate-600 mt-2">
              Note: ICD-9 TF-IDF features dominate because 2000 of the 2004 input dimensions come from diagnosis codes.
            </p>
          </div>
        </div>
      </div>

      {/* Limitations + intended use */}
      <div className="glass-card p-4">
        <h3 className="text-sm font-semibold text-white mb-3">Limitations &amp; Intended Use</h3>
        <div className="space-y-2.5">
          {LIMITATIONS.map((l, i) => {
            const Icon = l.ok ? CheckCircle2 : AlertTriangle;
            return (
              <div key={i} className="flex gap-2.5 items-start">
                <Icon className={`w-4 h-4 flex-shrink-0 mt-0.5 ${l.ok ? "text-green-400" : "text-amber-400"}`} />
                <p className="text-sm text-slate-300 leading-snug">{l.text}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Training command */}
      <div className="flex gap-2 p-3 rounded-lg bg-slate-800/50 border border-slate-700">
        <Info className="w-4 h-4 text-slate-500 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-slate-500">
          Retrain the model with:{" "}
          <code className="bg-[#0f1729] px-1.5 py-0.5 rounded text-slate-300">
            python -m backend.scripts.train_model --skip-enrichment
          </code>
          . Metrics above reflect the held-out 20 % test set after stratified 80/20 splitting.
        </p>
      </div>
    </div>
  );
}
