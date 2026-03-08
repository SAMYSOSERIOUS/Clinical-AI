import { useState } from "react";
import { Scale, CheckCircle2, AlertCircle, Clock, ChevronDown, ChevronUp, ShieldCheck } from "lucide-react";

const STATUS = {
  met:     { icon: CheckCircle2, color: "text-green-400",  bg: "bg-green-500/10 border-green-500/20",  label: "Met"      },
  partial: { icon: AlertCircle,  color: "text-amber-400",  bg: "bg-amber-500/10 border-amber-500/20",  label: "Partial"  },
  pending: { icon: Clock,        color: "text-blue-400",   bg: "bg-blue-500/10  border-blue-500/20",   label: "Required" },
} as const;
type StatusKey = keyof typeof STATUS;

interface Req { req: string; status: StatusKey; detail: string; }

const FRAMEWORKS = [
  {
    id: "aiact", title: "EU AI Act", subtitle: "Regulation (EU) 2024/1689 · In force Aug 2024",
    badge: "High-Risk AI — Annex III §5(a)", badgeClass: "bg-blue-500/20 text-blue-300 border-blue-500/30",
    intro: "Clinical decision-support software that influences treatment of patients falls under Annex III, Category 5(a): AI systems intended to be used for evaluation of health data. This triggers the full high-risk compliance pathway.",
    requirements: [
      { req: "Risk Management System",              status: "partial", detail: "A documented risk assessment is required throughout the entire lifecycle. The SHAP explainability module and Fairlearn fairness audit provide partial technical evidence. A formal ISO 14971 risk file has not yet been produced." },
      { req: "Data Governance",                     status: "met",     detail: "UCI public dataset with documented provenance (1999–2008, 130 US hospitals). No personal PII is stored. All preprocessing steps are documented in backend/scripts/train_model.py." },
      { req: "Technical Documentation (Annex IV)",  status: "met",     detail: "Model card includes: algorithm (XGBoost), all hyperparameters, feature engineering pipeline, 80/20 stratified train/test split, performance metrics at default threshold, and Fairlearn fairness evaluation across race, gender, and age." },
      { req: "Automatic Logging & Traceability",    status: "met",     detail: "Every prediction is written to a SQLite audit log with: timestamp, input features (JSON), output probability, decision threshold, session ID, and prediction flag. Accessible via the Audit Log page and GET /audit/log." },
      { req: "Transparency to Deployers & Users",   status: "met",     detail: "SHAP top-10 feature contributions returned with every prediction. Dashboard shows live model recall and precision. Threshold Guide page explains consequences of each threshold level." },
      { req: "Human Oversight (Art. 14)",           status: "met",     detail: "System is explicitly advisory. The agent system prompt states 'Never give a definitive clinical diagnosis — always recommend clinician review.' No automated actions are taken from model output." },
      { req: "Accuracy, Robustness & Cybersecurity",status: "partial", detail: "Fairness audit (FNR by race/gender/age) addresses subgroup robustness. Full adversarial robustness testing, input validation stress-testing, and a formal cybersecurity assessment have not yet been completed." },
      { req: "Conformity Assessment (Art. 43)",     status: "pending", detail: "Third-party notified body conformity assessment required before deployment in clinical settings. Not yet initiated." },
      { req: "EU AI Database Registration (Art. 49)",status: "pending", detail: "High-risk AI providers must register the system in the EU AI database before placing it on the market." },
      { req: "Post-Market Monitoring Plan (Art. 72)",status: "pending", detail: "A structured plan to monitor real-world performance, detect distribution shift, and report serious incidents must be established before deployment." },
    ] as Req[],
  },
  {
    id: "gdpr", title: "GDPR", subtitle: "Regulation (EU) 2016/679 · Health Data = Special Category (Art. 9)",
    badge: "Art. 9 Special Category Data", badgeClass: "bg-teal-500/20 text-teal-300 border-teal-500/30",
    intro: "Patient health records (diagnoses, medication counts, hospital stay data) constitute special category data under GDPR Article 9. Processing requires an explicit legal basis and heightened safeguards.",
    requirements: [
      { req: "Lawful Basis — Art. 6 & 9",           status: "partial", detail: "Processing the public UCI dataset for research is permissible under Art. 9(2)(j). Production use on real patient data requires either explicit patient consent or an institutional research ethics approval under Art. 9(2)(j) / Art. 89." },
      { req: "Data Minimisation (Art. 5(1)(c))",    status: "met",     detail: "Only the minimum necessary features are processed: 3 ICD-9 diagnosis codes + 4 numeric clinical values. No names, NHS numbers, dates of birth, or direct identifiers are stored or transmitted." },
      { req: "Purpose Limitation (Art. 5(1)(b))",   status: "met",     detail: "The system has a single stated purpose: predicting 30-day diabetes readmission risk. No secondary profiling or cross-purpose use is implemented." },
      { req: "Automated Decision-Making (Art. 22)", status: "met",     detail: "GDPR Article 22 prohibits solely automated decisions with legal or similarly significant effects. This system is advisory only; the clinician retains the final decision. The right to explanation is satisfied by SHAP output." },
      { req: "Data Subject Rights (Art. 15–22)",    status: "pending", detail: "Right to SHAP explanation is implemented. Formal processes for handling data subject requests (access, erasure, portability, restriction) must be defined before processing real patient data." },
      { req: "DPIA (Art. 35)",                      status: "pending", detail: "A Data Protection Impact Assessment is mandatory for large-scale processing of health data. Must be completed before any deployment involving real patients." },
      { req: "Data Retention & Deletion Policy",    status: "partial", detail: "Audit log retains prediction records indefinitely. A formal retention schedule and automated deletion policy has not yet been defined or implemented." },
    ] as Req[],
  },
  {
    id: "mdr", title: "EU Medical Device Regulation", subtitle: "MDR 2017/745 — Software as Medical Device (SaMD)",
    badge: "Class IIb SaMD — Rule 11", badgeClass: "bg-purple-500/20 text-purple-300 border-purple-500/30",
    intro: "Under MDR Rule 11, software intended to provide information used to make decisions with diagnosis or therapeutic purposes classifies as a medical device. Severity of the condition (diabetes, readmission risk) and influence on clinical decisions point to Class IIb.",
    requirements: [
      { req: "SaMD Classification (Rule 11)",         status: "pending", detail: "Full MDR classification review required. Provisional classification: Class IIb (serious condition, influences clinical management). Notified body involvement required for conformity assessment." },
      { req: "Clinical Evaluation (Annex XIV)",        status: "pending", detail: "Systematic clinical evaluation on prospective real-world patient data required before CE marking. Current validation is retrospective on a public historical dataset only." },
      { req: "Quality Management System (ISO 13485)", status: "pending", detail: "A certified QMS is required covering: design controls, risk management (ISO 14971), software lifecycle (IEC 62304), and post-market surveillance." },
      { req: "Unique Device Identification (UDI)",     status: "pending", detail: "UDI-DI (device identifier) and UDI-PI (production identifier) required for all Class IIb devices placed on the EU market. EUDAMED registration required." },
      { req: "Instructions for Use (Annex I §23)",     status: "partial", detail: "README and in-app documentation provide basic usage guidance. A full IFU compliant with MDR Annex I §23 is needed — covering intended purpose, indications, contraindications, known limitations, performance data, and maintenance." },
      { req: "Post-Market Clinical Follow-up",         status: "pending", detail: "A structured PMCF plan is required to monitor real-world performance over time, detect concept drift, and feed back into the clinical evaluation." },
    ] as Req[],
  },
];

function Section({ fw }: { fw: typeof FRAMEWORKS[0] }) {
  const [open, setOpen] = useState(true);
  const met     = fw.requirements.filter(r => r.status === "met").length;
  const partial = fw.requirements.filter(r => r.status === "partial").length;
  const pending = fw.requirements.filter(r => r.status === "pending").length;

  return (
    <div className="glass-card overflow-hidden">
      <button className="w-full px-5 py-4 flex items-center justify-between" onClick={() => setOpen(v => !v)}>
        <div className="text-left">
          <div className="flex items-center gap-2">
            <h2 className="text-white font-bold">{fw.title}</h2>
            <span className={`px-2 py-0.5 rounded-full text-xs border ${fw.badgeClass}`}>{fw.badge}</span>
          </div>
          <p className="text-slate-500 text-xs mt-0.5">{fw.subtitle}</p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0 ml-4">
          <span className="text-xs text-green-400">{met} met</span>
          <span className="text-xs text-amber-400">{partial} partial</span>
          <span className="text-xs text-blue-400">{pending} required</span>
          {open ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
        </div>
      </button>

      {open && (
        <>
          <div className="px-5 pb-3 pt-0">
            <p className="text-xs text-slate-400 bg-white/5 rounded-lg px-3 py-2">{fw.intro}</p>
          </div>
          <div className="border-t border-white/5 divide-y divide-white/5">
            {fw.requirements.map((req, i) => {
              const s = STATUS[req.status];
              const Icon = s.icon;
              return (
                <div key={i} className="px-5 py-3 flex gap-3">
                  <Icon className={`w-4 h-4 flex-shrink-0 mt-0.5 ${s.color}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center flex-wrap gap-2 mb-0.5">
                      <p className="text-sm text-white font-medium">{req.req}</p>
                      <span className={`px-1.5 py-0.5 rounded text-xs border ${s.bg} ${s.color}`}>{s.label}</span>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">{req.detail}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

export default function LegalCompliance() {
  return (
    <div className="p-6 space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Scale className="w-6 h-6 text-teal-400" />
          Legal &amp; Compliance — EU
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          Regulatory mapping for deployment within the European Union. This application is classified as a{" "}
          <strong className="text-white">high-risk AI system</strong> under EU AI Act Annex III §5(a) and provisionally a{" "}
          <strong className="text-white">Class IIb Software as Medical Device</strong> under MDR 2017/745.
        </p>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "EU AI Act",      status: "High-Risk (Annex III)",  note: "Conformity assessment required",   color: "text-blue-400"   },
          { label: "GDPR",           status: "Art. 9 Special Category", note: "DPIA required before deployment", color: "text-teal-400"   },
          { label: "MDR 2017/745",   status: "Class IIb SaMD",          note: "CE marking required",             color: "text-purple-400" },
        ].map((t) => (
          <div key={t.label} className="glass-card p-4">
            <p className="text-xs text-slate-500 mb-1">{t.label}</p>
            <p className={`font-semibold text-sm ${t.color}`}>{t.status}</p>
            <p className="text-xs text-amber-400 mt-1">{t.note}</p>
          </div>
        ))}
      </div>

      {/* Deployment disclaimer */}
      <div className="flex gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/20">
        <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-slate-300">
          <strong className="text-white">Not approved for clinical deployment.</strong>{" "}
          This is a research prototype. It has not received CE marking, passed a notified body conformity assessment,
          or completed a DPIA. Use in clinical decision-making requires completion of all &ldquo;Required&rdquo; items below.
        </p>
      </div>

      {/* Framework sections */}
      {FRAMEWORKS.map((fw) => <Section key={fw.id} fw={fw} />)}

      {/* Footer note */}
      <div className="flex gap-2 p-3 rounded-lg bg-slate-800/50 border border-slate-700">
        <ShieldCheck className="w-4 h-4 text-slate-500 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-slate-500">
          Compliance mapping last reviewed March 2026. EU regulatory requirements are evolving — consult a qualified
          medical device regulatory affairs specialist and data protection officer before any clinical deployment.
        </p>
      </div>
    </div>
  );
}
