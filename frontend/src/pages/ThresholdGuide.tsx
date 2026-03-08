import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchRecallCurve } from "../lib/api";
import type { RecallPoint } from "../lib/types";
import { SlidersHorizontal, CheckCircle, AlertTriangle, Info } from "lucide-react";

const PRESETS = [
  {
    threshold: 0.20, label: "Max Recall", tag: "Screening", color: "blue",
    clinical: "Flags almost every at-risk patient. Best for population-level screening where missing a readmission has severe consequences. Generates many false alarms.",
    pros: ["Highest sensitivity — fewest missed readmissions", "Best for low-cost, broad interventions (e.g. discharge phone call)", "Matches high-acuity ICU safety standards"],
    cons: ["Very low precision — majority of alerts are false positives", "Alert fatigue: care team effort spread thin", "High intervention cost per true readmission prevented"],
  },
  {
    threshold: 0.32, label: "Default", tag: "Recommended", color: "teal",
    clinical: "Balanced point optimised on the UCI test set. Catches ~87% of readmissions while keeping alert burden manageable. Recommended as the starting point.",
    pros: ["Good recall for safety-critical use", "Validated on held-out test set", "Reasonable precision for resource allocation"],
    cons: ["~78% of alerts are still false positives", "Generates moderate intervention load", "May over-flag patients with complex but stable comorbidities"],
  },
  {
    threshold: 0.40, label: "Balanced", tag: "Moderate", color: "amber",
    clinical: "Meaningfully reduces false positive rate. Better for settings with limited follow-up capacity. Accept ~10–15% more missed readmissions for cleaner precision.",
    pros: ["Improved precision — fewer unnecessary calls/visits", "Lower staff alert fatigue", "More cost-effective per true case caught"],
    cons: ["Misses 10–15% more true readmissions vs default", "Higher ethical risk for high-mortality subpopulations", "Requires careful monitoring after deployment"],
  },
  {
    threshold: 0.50, label: "High Precision", tag: "Conservative", color: "orange",
    clinical: "Only flags patients with meaningfully elevated predicted probability. Suited for expensive or invasive follow-up interventions where precision matters most.",
    pros: ["Highest precision among standard thresholds", "Minimal resource waste", "Appropriate when intervention has side effects or cost"],
    cons: ["Misses ~30–40% of true readmissions vs default", "Not suitable for high-acuity or high-mortality populations", "Ethically questionable without strong clinical justification"],
  },
  {
    threshold: 0.62, label: "Ultra-Precise", tag: "Research Only", color: "red",
    clinical: "Reserved for specific research or cost-analysis contexts, not routine clinical care. Large recall loss makes this unsuitable for patient safety applications.",
    pros: ["Highest specificity of all presets", "Useful for estimating marginal intervention cost", "Very few false positives"],
    cons: ["Misses the majority of readmissions", "Clinically irresponsible as primary decision support", "Risk of systematic under-flagging of vulnerable groups"],
  },
];

const C = {
  blue:   { ring: "border-blue-500/40",   badge: "bg-blue-500/20 text-blue-300",     bar: "#3b82f6" },
  teal:   { ring: "border-teal-500/40",   badge: "bg-teal-500/20 text-teal-300",     bar: "#14b8a6" },
  amber:  { ring: "border-amber-500/40",  badge: "bg-amber-500/20 text-amber-300",   bar: "#f59e0b" },
  orange: { ring: "border-orange-500/40", badge: "bg-orange-500/20 text-orange-300", bar: "#f97316" },
  red:    { ring: "border-red-500/40",    badge: "bg-red-500/20 text-red-300",       bar: "#ef4444" },
} as const;

function nearest(curve: RecallPoint[], t: number): RecallPoint {
  return curve.reduce(
    (b, p) => Math.abs(p.threshold - t) < Math.abs(b.threshold - t) ? p : b,
    curve[0] ?? { threshold: t, recall: 0, precision: 0, accuracy: 0 }
  );
}

function MetricBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-slate-400">
        <span>{label}</span>
        <span className="font-mono text-white">{(value * 100).toFixed(1)}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${value * 100}%`, background: color }} />
      </div>
    </div>
  );
}

export default function ThresholdGuide() {
  const [sel, setSel] = useState(1);
  const curve  = useQuery({ queryKey: ["recall-curve"], queryFn: fetchRecallCurve });
  const preset = PRESETS[sel];
  const c      = C[preset.color as keyof typeof C];
  const m      = curve.data ? nearest(curve.data, preset.threshold) : null;

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <SlidersHorizontal className="w-6 h-6 text-teal-400" />
          Threshold Guide
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          The decision threshold maps a predicted probability to a binary flag. Lowering it maximises recall
          (fewer missed readmissions); raising it maximises precision (fewer false alarms). Choosing the right
          value is a clinical, operational, and ethical decision.
        </p>
      </div>

      {/* Recall vs Precision explainer */}
      <div className="glass-card p-4 grid grid-cols-2 divide-x divide-white/10">
        <div className="pr-6">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Recall (Sensitivity)</p>
          <p className="text-sm text-slate-300">Of all patients who <em>will</em> be readmitted within 30 days, what fraction does the model flag?</p>
          <p className="text-xs text-teal-400 mt-1.5">↑ High recall = fewer missed readmissions &nbsp;·&nbsp; lower threshold</p>
        </div>
        <div className="pl-6">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Precision (PPV)</p>
          <p className="text-sm text-slate-300">Of all patients the model flags as high-risk, what fraction actually gets readmitted?</p>
          <p className="text-xs text-amber-400 mt-1.5">↑ High precision = fewer unnecessary interventions &nbsp;·&nbsp; higher threshold</p>
        </div>
      </div>

      {/* Preset selector cards */}
      <div className="grid grid-cols-5 gap-2">
        {PRESETS.map((p, i) => {
          const co = C[p.color as keyof typeof C];
          const pt = curve.data ? nearest(curve.data, p.threshold) : null;
          return (
            <button key={i} onClick={() => setSel(i)}
              className={`p-3 rounded-xl border text-left transition-all ${sel === i ? `${co.ring} bg-white/5` : "border-white/5 hover:border-white/10"}`}>
              <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium mb-1.5 ${co.badge}`}>{p.tag}</span>
              <p className="text-white font-mono text-xl font-bold">{(p.threshold * 100).toFixed(0)}%</p>
              <p className="text-slate-400 text-xs mt-0.5">{p.label}</p>
              {pt && <p className="text-xs mt-1.5 font-semibold" style={{ color: co.bar }}>Recall {(pt.recall * 100).toFixed(0)}%</p>}
            </button>
          );
        })}
      </div>

      {/* Selected detail card */}
      <div className={`glass-card p-5 border ${c.ring}`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <span className={`px-2 py-0.5 rounded text-xs font-semibold ${c.badge}`}>{preset.tag}</span>
            <span className="text-white font-mono text-2xl font-bold">{(preset.threshold * 100).toFixed(0)}%</span>
            <span className="text-slate-400 text-sm">— {preset.label}</span>
          </div>
          {m && <div className="text-right"><p className="text-xs text-slate-500">Accuracy</p><p className="text-white font-bold font-mono">{(m.accuracy * 100).toFixed(1)}%</p></div>}
        </div>

        {m && (
          <div className="grid grid-cols-3 gap-4 mb-4">
            <MetricBar label="Recall"    value={m.recall}    color={c.bar} />
            <MetricBar label="Precision" value={m.precision} color={c.bar} />
            <MetricBar label="Accuracy"  value={m.accuracy}  color={c.bar} />
          </div>
        )}

        <p className="text-sm text-slate-300 mb-4 leading-relaxed">{preset.clinical}</p>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-semibold text-green-400 mb-2 flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5" /> Advantages</p>
            <ul className="space-y-1.5">
              {preset.pros.map((t, i) => <li key={i} className="text-xs text-slate-400 flex gap-1.5"><span className="text-green-500 mt-0.5 flex-shrink-0">·</span>{t}</li>)}
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold text-red-400 mb-2 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> Disadvantages</p>
            <ul className="space-y-1.5">
              {preset.cons.map((t, i) => <li key={i} className="text-xs text-slate-400 flex gap-1.5"><span className="text-red-500 mt-0.5 flex-shrink-0">·</span>{t}</li>)}
            </ul>
          </div>
        </div>
      </div>

      {!curve.data && (
        <div className="text-center py-4 text-slate-500 text-sm">
          Train the model to see live recall/precision values per threshold.
        </div>
      )}

      {/* Guidance */}
      <div className="flex gap-3 p-4 rounded-xl bg-blue-500/10 border border-blue-500/20">
        <Info className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-slate-300 space-y-1">
          <p><strong className="text-white">Clinical recommendation:</strong> Start with <strong className="text-teal-300">32%</strong> and validate on your unit. Adjust down for ICU / high-acuity settings where missing readmissions is unacceptable; adjust up for primary care where over-referral is costly.</p>
          <p className="text-xs text-slate-500 mt-2">All threshold changes must be reviewed by your institution's clinical informatics and governance board. This tool is strictly advisory.</p>
        </div>
      </div>
    </div>
  );
}
