import { useState, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { predict, uploadCSV, fetchRecallCurve } from "../lib/api";
import type { PatientInput, PredictResponse, RecallPoint } from "../lib/types";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine,
} from "recharts";
import { Upload, Zap, AlertCircle } from "lucide-react";

// ── Threshold presets ─────────────────────────────────────────────────────────
const PRESETS = [
  { value: 0.20, label: "Max Sensitivity", short: "Max Sens.", color: "text-green-300",  active: "bg-green-500/25 border-green-400/60 text-green-200",  desc: "Catch almost all high-risk patients — many false alarms" },
  { value: 0.32, label: "High Sensitivity", short: "High Sens.", color: "text-teal-300",  active: "bg-teal-500/25 border-teal-400/60 text-teal-200",    desc: "Default clinical setting — prioritises recall over precision" },
  { value: 0.40, label: "Balanced",          short: "Balanced",   color: "text-blue-300",  active: "bg-blue-500/25 border-blue-400/60 text-blue-200",   desc: "Even trade-off between missed cases and false alerts" },
  { value: 0.50, label: "Standard",          short: "Standard",   color: "text-amber-300", active: "bg-amber-500/25 border-amber-400/60 text-amber-200", desc: "Conventional cutoff — higher precision, lower recall" },
  { value: 0.62, label: "High Precision",    short: "High Prec.", color: "text-red-300",   active: "bg-red-500/25 border-red-400/60 text-red-200",      desc: "Flags only the most certain cases — risk of missed readmissions" },
] as const;

// ── Recall Slider ─────────────────────────────────────────────────────────────
function RecallSlider({
  threshold,
  onChange,
  curve,
}: {
  threshold: number;
  onChange: (v: number) => void;
  curve: RecallPoint[];
}) {
  const nearest = curve.reduce(
    (best, pt) => (Math.abs(pt.threshold - threshold) < Math.abs(best.threshold - threshold) ? pt : best),
    curve[0] ?? { threshold: 0.32, recall: 0.87, precision: 0.2, accuracy: 0.67 }
  );
  const pct = ((threshold - 0.10) / (0.70 - 0.10)) * 100;

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm text-slate-400">
        <span>Decision Threshold — <span className="text-teal-400 font-mono">{(threshold * 100).toFixed(0)}%</span></span>
        <span className="text-teal-300 font-semibold">≈ {(nearest.recall * 100).toFixed(0)}% recall</span>
      </div>
      <div className="relative h-3 rounded-full overflow-hidden"
        style={{ background: "linear-gradient(to right, #22c55e, #eab308, #ef4444)" }}>
        <input
          type="range" min={0.10} max={0.70} step={0.01}
          value={threshold}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="absolute inset-0 w-full opacity-0 cursor-pointer h-full"
        />
        <div className="absolute top-0 h-full w-1 bg-white rounded shadow-lg"
          style={{ left: `calc(${pct}% - 2px)` }} />
      </div>
      <div className="flex justify-between text-xs text-slate-500">
        <span>10% (max recall)</span>
        <span>Precision: {(nearest.precision * 100).toFixed(0)}%</span>
        <span>70% (high precision)</span>
      </div>
    </div>
  );
}

// ── Risk Badge ────────────────────────────────────────────────────────────────
function RiskBadge({ label, prob }: { label: string; prob: number }) {
  const colors: Record<string, string> = {
    HIGH:   "bg-red-500/20 border-red-500/40 text-red-300",
    MEDIUM: "bg-amber-500/20 border-amber-500/40 text-amber-300",
    LOW:    "bg-green-500/20 border-green-500/40 text-green-300",
  };
  return (
    <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg border font-semibold ${colors[label] ?? colors.LOW}`}>
      <span className="text-lg">{label === "HIGH" ? "🔴" : label === "MEDIUM" ? "🟡" : "🟢"}</span>
      <span>{label} RISK</span>
      <span className="font-mono text-lg opacity-80">{(prob * 100).toFixed(1)}%</span>
    </div>
  );
}

// ── SHAP Chart ────────────────────────────────────────────────────────────────
function ShapChart({ data }: { data: PredictResponse["shap_top10"] }) {
  const sorted = [...data].sort((a, b) => Math.abs(b.shap_value) - Math.abs(a.shap_value));
  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={sorted} layout="vertical" margin={{ left: 140, right: 30 }}>
        <XAxis type="number" stroke="#64748b" tick={{ fontSize: 11 }}
          domain={["auto", "auto"]}
          tickFormatter={(v) => v.toFixed(3)}
        />
        <YAxis type="category" dataKey="feature" stroke="#64748b" tick={{ fontSize: 11 }} width={130} />
        <Tooltip
          contentStyle={{ background: "#141f38", border: "1px solid #1e3056", borderRadius: 8 }}
          formatter={(v) => [typeof v === 'number' ? v.toFixed(4) : v, "SHAP value"]}
        />
        <ReferenceLine x={0} stroke="#475569" />
        <Bar dataKey="shap_value" radius={[0, 4, 4, 0]}>
          {sorted.map((entry, i) => (
            <Cell key={i} fill={entry.shap_value > 0 ? "#ef4444" : "#3b82f6"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── ICD-9 Field ───────────────────────────────────────────────────────────────
function Icd9Field({
  label, value, onChange, description,
}: { label: string; value: string; onChange: (v: string) => void; description?: string }) {
  return (
    <div>
      <label className="block text-sm text-slate-400 mb-1">{label}</label>
      <input
        type="text" value={value} onChange={(e) => onChange(e.target.value)}
        placeholder="e.g. 428.0"
        className="w-full bg-navy-800 border border-navy-700 rounded-lg px-3 py-2 text-sm text-white focus:border-teal-500 focus:outline-none"
      />
      {description && <p className="mt-1 text-xs text-teal-400/70 truncate">{description}</p>}
    </div>
  );
}

// ── Numeric Field ─────────────────────────────────────────────────────────────
function NumField({
  label, value, onChange, min = 0, max = 100,
}: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  return (
    <div>
      <label className="block text-sm text-slate-400 mb-1">
        {label} <span className="font-mono text-teal-400">{value}</span>
      </label>
      <input
        type="range" min={min} max={max} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-teal-500"
      />
    </div>
  );
}

// ── CSV Upload tab ─────────────────────────────────────────────────────────────
function CsvTab({ threshold }: { threshold: number }) {
  const [file, setFile]   = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const csv = useMutation({ mutationFn: () => uploadCSV(file!, threshold) });

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f?.name.endsWith(".csv")) setFile(f);
  };

  return (
    <div className="space-y-4">
      <div
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onClick={() => fileRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
          dragging ? "border-teal-400 bg-teal-500/10" : "border-navy-700 hover:border-teal-500/50"
        }`}
      >
        <Upload className="w-8 h-8 text-slate-500 mx-auto mb-2" />
        <p className="text-slate-400">{file ? file.name : "Drop a CSV file here or click to browse"}</p>
        <p className="text-xs text-slate-600 mt-1">
          Required columns: diag_1, diag_2, diag_3, num_medications, total_visits, time_in_hospital, num_lab_procedures
        </p>
        <input ref={fileRef} type="file" accept=".csv" className="hidden"
          onChange={(e) => e.target.files?.[0] && setFile(e.target.files[0])}
        />
      </div>

      {file && (
        <button
          onClick={() => csv.mutate()}
          disabled={csv.isPending}
          className="w-full py-2 rounded-lg bg-teal-500 hover:bg-teal-600 text-white font-semibold disabled:opacity-50"
        >
          {csv.isPending ? "Predicting…" : `Run batch predict on ${file.name}`}
        </button>
      )}

      {csv.isError && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{(csv.error as Error).message}</span>
        </div>
      )}

      {csv.data && (
        <div className="overflow-x-auto">
          <p className="text-sm text-slate-400 mb-2">{csv.data.count} rows predicted</p>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-slate-500 border-b border-navy-700">
                {["Encounter", "Prob.", "Risk", "Recall@thr", "Primary Dx"].map((h) => (
                  <th key={h} className="pb-2 pr-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {csv.data.results.map((r, i) => (
                <tr key={i} className="border-b border-navy-800/50">
                  <td className="py-1.5 pr-3 text-slate-400">{r.encounter_id || `#${i + 1}`}</td>
                  <td className="py-1.5 pr-3 font-mono">{(r.probability * 100).toFixed(1)}%</td>
                  <td className="py-1.5 pr-3">
                    <span className={`px-1.5 py-0.5 rounded text-xs ${
                      r.risk_label === "HIGH" ? "bg-red-500/20 text-red-300" :
                      r.risk_label === "MEDIUM" ? "bg-amber-500/20 text-amber-300" :
                      "bg-green-500/20 text-green-300"
                    }`}>{r.risk_label}</span>
                  </td>
                  <td className="py-1.5 pr-3">{(r.recall_at_threshold * 100).toFixed(0)}%</td>
                  <td className="py-1.5 text-slate-400 max-w-[200px] truncate">{r.icd9_primary_label}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Main Predict page ─────────────────────────────────────────────────────────
export default function Predict() {
  const [tab, setTab]       = useState<"form" | "csv">("form");
  const [threshold, setThr] = useState(0.32);
  const [form, setForm]     = useState<Omit<PatientInput, "threshold">>({
    diag_1: "428.0",
    diag_2: "250.43",
    diag_3: "585.6",
    num_medications: 15,
    total_visits: 3,
    time_in_hospital: 4,
    num_lab_procedures: 40,
  });

  const curve  = useQuery({ queryKey: ["recall-curve"], queryFn: fetchRecallCurve });
  const predMutation = useMutation({
    mutationFn: () => predict({ ...form, threshold }),
  });

  const result: PredictResponse | undefined = predMutation.data;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Predict</h1>
        <p className="text-slate-400 text-sm mt-1">Enter patient data to estimate 30-day readmission risk</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {(["form", "csv"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium ${
              tab === t ? "bg-teal-500 text-white" : "text-slate-400 hover:text-white"
            }`}
          >
            {t === "form" ? "Patient Form" : "CSV Upload"}
          </button>
        ))}
      </div>

      {tab === "form" ? (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* Input panel */}
          <div className="glass-card p-6 space-y-5">
            <h2 className="text-base font-semibold text-white">Diagnosis Codes (ICD-9)</h2>
            <div className="grid grid-cols-3 gap-3">
              <Icd9Field label="Primary (diag_1)" value={form.diag_1}
                onChange={(v) => setForm((f) => ({ ...f, diag_1: v }))}
                description={result?.icd9_labels[form.diag_1]}
              />
              <Icd9Field label="Secondary (diag_2)" value={form.diag_2}
                onChange={(v) => setForm((f) => ({ ...f, diag_2: v }))}
                description={result?.icd9_labels[form.diag_2]}
              />
              <Icd9Field label="Tertiary (diag_3)" value={form.diag_3}
                onChange={(v) => setForm((f) => ({ ...f, diag_3: v }))}
                description={result?.icd9_labels[form.diag_3]}
              />
            </div>

            <h2 className="text-base font-semibold text-white pt-2">Clinical Numerics</h2>
            <div className="space-y-4">
              <NumField label="Total prior visits" value={form.total_visits}
                onChange={(v) => setForm((f) => ({ ...f, total_visits: v }))} max={30} />
              <NumField label="Medications" value={form.num_medications}
                onChange={(v) => setForm((f) => ({ ...f, num_medications: v }))} max={60} />
              <NumField label="Days in hospital" value={form.time_in_hospital}
                onChange={(v) => setForm((f) => ({ ...f, time_in_hospital: v }))} min={1} max={14} />
              <NumField label="Lab procedures" value={form.num_lab_procedures}
                onChange={(v) => setForm((f) => ({ ...f, num_lab_procedures: v }))} max={100} />
            </div>

            <div className="pt-2 space-y-3">
              <div>
                <p className="text-sm text-slate-400 mb-2">Decision Threshold</p>
                {/* Preset quick-select */}
                <div className="grid grid-cols-5 gap-1.5 mb-3">
                  {PRESETS.map((p) => {
                    const isActive = Math.abs(threshold - p.value) < 0.005;
                    return (
                      <button
                        key={p.value}
                        onClick={() => { setThr(p.value); if (result) predMutation.mutate(); }}
                        title={p.desc}
                        className={`flex flex-col items-center px-1 py-2 rounded-lg border text-xs font-medium transition-colors ${
                          isActive
                            ? p.active
                            : "border-slate-700 text-slate-500 hover:border-slate-500 hover:text-slate-300 bg-white/5"
                        }`}
                      >
                        <span className="font-mono text-sm font-bold">{(p.value * 100).toFixed(0)}%</span>
                        <span className="mt-0.5 leading-tight text-center">{p.short}</span>
                      </button>
                    );
                  })}
                </div>
                {/* Fine-tune slider */}
                <RecallSlider
                  threshold={threshold}
                  onChange={(v) => { setThr(v); if (result) predMutation.mutate(); }}
                  curve={curve.data ?? []}
                />
                {/* Consequence hint */}
                {(() => {
                  const nearest = PRESETS.reduce((b, p) =>
                    Math.abs(p.value - threshold) < Math.abs(b.value - threshold) ? p : b
                  );
                  return (
                    <p className="text-xs text-slate-500 mt-1.5 italic">{nearest.desc}</p>
                  );
                })()}
              </div>
            </div>

            <button
              onClick={() => predMutation.mutate()}
              disabled={predMutation.isPending}
              className="w-full mt-2 py-2.5 rounded-lg bg-teal-500 hover:bg-teal-600 text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Zap className="w-4 h-4" />
              {predMutation.isPending ? "Predicting…" : "Run Prediction"}
            </button>

            {predMutation.isError && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{(predMutation.error as Error).message}</span>
              </div>
            )}
          </div>

          {/* Result panel */}
          <div className="glass-card p-6 space-y-5">
            {result ? (
              <>
                <RiskBadge label={result.risk_label} prob={result.probability} />

                <div className="grid grid-cols-3 gap-3 text-center">
                  {[
                    ["Threshold", `${(result.threshold * 100).toFixed(0)}%`],
                    ["Recall @ thr", `${(result.recall_at_threshold * 100).toFixed(1)}%`],
                    ["Precision", `${(result.precision_at_threshold * 100).toFixed(1)}%`],
                  ].map(([k, v]) => (
                    <div key={k} className="bg-navy-800 rounded-lg p-3">
                      <p className="text-xs text-slate-500">{k}</p>
                      <p className="text-lg font-bold text-teal-400">{v}</p>
                    </div>
                  ))}
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-white mb-1">ICD-9 Labels</h3>
                  <div className="space-y-1">
                    {Object.entries(result.icd9_labels).map(([code, desc]) => (
                      <p key={code} className="text-xs text-slate-400">
                        <span className="font-mono text-teal-400">{code}</span> — {desc}
                      </p>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-white mb-2">SHAP — Top 10 Features</h3>
                  <ShapChart data={result.shap_top10} />
                </div>
              </>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-3 py-16">
                <Zap className="w-10 h-10 opacity-30" />
                <p>Run a prediction to see the risk score and SHAP explanation</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="glass-card p-6">
          <CsvTab threshold={threshold} />
        </div>
      )}
    </div>
  );
}
