import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend,
} from "recharts";
import { Database, Users, Calendar, MapPin, AlertTriangle, Info } from "lucide-react";

const READMIT_DATA = [
  { name: "Not readmitted",  value: 54864, fill: "#3b82f6" },
  { name: "Readmitted >30d", value: 35545, fill: "#f59e0b" },
  { name: "Readmitted <30d", value: 11357, fill: "#ef4444" },
];

const RACE_DIST = [
  { name: "Caucasian",        pct: 75.7 },
  { name: "AfricanAmerican",  pct: 19.0 },
  { name: "Hispanic",         pct:  2.0 },
  { name: "Other",            pct:  1.5 },
  { name: "Unknown",          pct:  1.2 },
  { name: "Asian",            pct:  0.6 },
];

const AGE_DIST = [
  { name: "[0-10)",   n: 124   },
  { name: "[10-20)",  n: 345   },
  { name: "[20-30)",  n: 1002  },
  { name: "[30-40)",  n: 2330  },
  { name: "[40-50)",  n: 6817  },
  { name: "[50-60)",  n: 14506 },
  { name: "[60-70)",  n: 23208 },
  { name: "[70-80)",  n: 27825 },
  { name: "[80-90)",  n: 19707 },
  { name: "[90-100)", n: 5995  },
];

const FEATURE_GROUPS = [
  { group: "Administrative", count: 6,  features: "encounter_id, patient_nbr, admission_type, discharge_disposition, admission_source, payer_code" },
  { group: "Demographics",   count: 4,  features: "race, gender, age, weight" },
  { group: "Diagnoses",      count: 3,  features: "diag_1, diag_2, diag_3 — ICD-9 codes" },
  { group: "Clinical",       count: 9,  features: "time_in_hospital, num_lab_procedures, num_procedures, num_medications, number_outpatient, number_emergency, number_inpatient, number_diagnoses, total_visits (computed)" },
  { group: "Medications",    count: 23, features: "metformin, insulin, glipizide, glyburide, pioglitazone, rosiglitazone, and 17 other diabetes medication columns" },
  { group: "Lab Results",    count: 4,  features: "max_glu_serum, A1Cresult, change (medication change), diabetesMed" },
  { group: "Target",         count: 1,  features: "readmitted — binarised: '<30 days' → 1 (positive class); all other values → 0" },
];

const PREPROCESSING = [
  { n: 1, action: "Download dataset",      detail: "kagglehub: mshamber/diabetes-readmission — UCI 10-year diabetes CSV" },
  { n: 2, action: "Filter encounters",     detail: "Keep only first encounter per patient; remove encounters with discharge to hospice or death" },
  { n: 3, action: "Binarise target",       detail: "readmitted = '<30' → 1 (readmitted within 30 days); all other values → 0" },
  { n: 4, action: "Compute total_visits",  detail: "number_outpatient + number_emergency + number_inpatient → single aggregate feature" },
  { n: 5, action: "Build ICD-9 text",      detail: "Concatenate diag_1, diag_2, diag_3 as a space-joined string per encounter" },
  { n: 6, action: "TF-IDF vectorisation",  detail: "TfidfVectorizer(max_features=2000, sublinear_tf=True) on the ICD-9 concatenated string → 2000-dim sparse matrix" },
  { n: 7, action: "Scale numeric features",detail: "StandardScaler on [total_visits, num_medications, time_in_hospital, num_lab_procedures]" },
  { n: 8, action: "Train / test split",    detail: "80% train / 20% test, stratified on target, random_state=42 — preserves class ratio of ~11.2% positive" },
];

const TS = { background: "#141f38", border: "1px solid #1e3056", borderRadius: 8, color: "#cbd5e1" };

function Tile({ icon: Icon, label, value, sub }: { icon: React.ElementType; label: string; value: string; sub?: string }) {
  return (
    <div className="glass-card p-4 flex items-center gap-3">
      <div className="p-2.5 rounded-lg bg-teal-500/10 flex-shrink-0">
        <Icon className="w-5 h-5 text-teal-400" />
      </div>
      <div>
        <p className="text-xl font-bold text-white">{value}</p>
        <p className="text-xs text-slate-400">{label}</p>
        {sub && <p className="text-xs text-slate-600 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

export default function DataAnalysis() {
  const total = FEATURE_GROUPS.reduce((s, g) => s + g.count, 0);

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Database className="w-6 h-6 text-teal-400" />
          Data Source Analysis
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          UCI Machine Learning Repository — 10-Year Diabetes Readmission Dataset
          (Strack et al., <em>BioMed Res Int</em>, 2014)
        </p>
      </div>

      {/* Key statistics */}
      <div className="grid grid-cols-4 gap-3">
        <Tile icon={Users}    label="Patient encounters"  value="101,766" />
        <Tile icon={Database} label="Raw features"        value="50"       sub="+ 1 computed (total_visits)" />
        <Tile icon={Calendar} label="Study period"        value="1999–2008" />
        <Tile icon={MapPin}   label="US hospitals"        value="130"      sub="Across 11 states" />
      </div>

      {/* Class distribution + race */}
      <div className="grid grid-cols-2 gap-4">
        {/* Readmission pie */}
        <div className="glass-card p-4">
          <h3 className="text-sm font-semibold text-white mb-3">Readmission Distribution</h3>
          <ResponsiveContainer width="100%" height={190}>
            <PieChart>
              <Pie
                data={READMIT_DATA}
                dataKey="value"
                nameKey="name"
                cx="50%" cy="50%"
                outerRadius={65}
                label={({ percent }: { percent?: number }) => percent != null ? `${(percent * 100).toFixed(0)}%` : ""}
                labelLine={false}
              >
                {READMIT_DATA.map((d, i) => <Cell key={i} fill={d.fill} />)}
              </Pie>
              <Tooltip contentStyle={TS} formatter={(v) => [typeof v === "number" ? v.toLocaleString() : String(v), "encounters"]} />
              <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="mt-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 flex gap-2 items-start">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-300">
              <strong>11.2% positive class</strong> — severe imbalance.
              Model uses <code className="bg-amber-500/10 px-1 rounded">scale_pos_weight=10</code> to compensate.
            </p>
          </div>
        </div>

        {/* Race bar */}
        <div className="glass-card p-4">
          <h3 className="text-sm font-semibold text-white mb-3">Race Distribution (%)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={RACE_DIST} layout="vertical" margin={{ left: 100, right: 20, top: 4, bottom: 4 }}>
              <XAxis type="number" stroke="#64748b" tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`} />
              <YAxis type="category" dataKey="name" stroke="#64748b" tick={{ fontSize: 10 }} width={95} />
              <Tooltip contentStyle={TS} formatter={(v) => [typeof v === "number" ? `${v}%` : String(v), "share"]} />
              <Bar dataKey="pct" radius={[0, 4, 4, 0]}>
                {RACE_DIST.map((_, i) => <Cell key={i} fill={i === 0 ? "#14b8a6" : "#3b82f6"} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <p className="text-xs text-amber-400 mt-1 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            Caucasian over-representation contributes to fairness disparities in subgroup FNR.
          </p>
        </div>
      </div>

      {/* Age distribution */}
      <div className="glass-card p-4">
        <h3 className="text-sm font-semibold text-white mb-3">Age Distribution (10-year bands)</h3>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={AGE_DIST} margin={{ right: 20, left: 0 }}>
            <XAxis dataKey="name" stroke="#64748b" tick={{ fontSize: 9 }} />
            <YAxis stroke="#64748b" tick={{ fontSize: 10 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
            <Tooltip contentStyle={TS} formatter={(v) => [typeof v === "number" ? v.toLocaleString() : String(v), "encounters"]} />
            <Bar dataKey="n" fill="#14b8a6" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
        <p className="text-xs text-slate-500 mt-1">
          Predominantly elderly population (70–80 bracket is largest). Model may underperform for younger age groups due to limited representation.
        </p>
      </div>

      {/* Feature groups */}
      <div className="glass-card p-4">
        <h3 className="text-sm font-semibold text-white mb-3">Feature Groups ({total} total raw features)</h3>
        <div className="divide-y divide-white/5">
          {FEATURE_GROUPS.map((g) => (
            <div key={g.group} className="py-2.5 flex gap-4 items-start">
              <span className="w-16 flex-shrink-0 mt-0.5 text-center px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-400 text-xs font-mono">
                {g.count} feat
              </span>
              <div>
                <p className="text-sm text-white font-medium">{g.group}</p>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{g.features}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Preprocessing pipeline */}
      <div className="glass-card p-4">
        <h3 className="text-sm font-semibold text-white mb-3">Preprocessing Pipeline</h3>
        <div className="space-y-2.5">
          {PREPROCESSING.map((p) => (
            <div key={p.n} className="flex gap-3 items-start">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-teal-500/20 text-teal-400 text-xs flex items-center justify-center font-mono">
                {p.n}
              </span>
              <div>
                <span className="text-sm text-white font-medium">{p.action}</span>
                <span className="text-slate-500 text-xs"> — {p.detail}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Known limitations */}
      <div className="flex gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
        <Info className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm text-white font-semibold mb-1">Known Dataset Limitations</p>
          <ul className="text-xs text-slate-300 space-y-1 list-disc list-inside leading-relaxed">
            <li>Temporal drift — data from 1999–2008; clinical practice, drug regimens, and coding have changed significantly</li>
            <li>Geographic bias — US hospitals only; EU/UK/non-Western validation has not been performed</li>
            <li>Missing data — <code className="bg-amber-500/10 px-1 rounded">weight</code> (~97% missing), <code className="bg-amber-500/10 px-1 rounded">payer_code</code> (~40% missing); neither is used in the model</li>
            <li>Caucasian over-representation (~75.7%) increases risk of under-performance for minority groups</li>
            <li>Legacy coding — ICD-9 codes were deprecated in 2015; modern EHR systems use ICD-10, requiring code mapping</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
