// ─── Domain types shared between frontend and backend ─────────────────────────

export interface ShapEntry {
  feature: string;
  shap_value: number;
  raw_value: number;
}

export interface PatientInput {
  diag_1: string;
  diag_2: string;
  diag_3: string;
  num_medications: number;
  total_visits: number;
  time_in_hospital: number;
  num_lab_procedures: number;
  threshold: number;
  session_id?: string;
}

export interface PredictResponse {
  probability: number;
  prediction: number;
  risk_label: "HIGH" | "MEDIUM" | "LOW";
  threshold: number;
  recall_at_threshold: number;
  precision_at_threshold: number;
  shap_top10: ShapEntry[];
  icd9_labels: Record<string, string>;
  audit_id: number;
}

export interface RecallPoint {
  threshold: number;
  recall: number;
  precision: number;
  accuracy: number;
}

export interface FairnessGroup {
  [key: string]: string | number;
  FNR: number;
  FPR: number;
  selection_rate: number;
}

export interface FairnessResult {
  sensitive_feature: string;
  overall: { FNR: number; FPR: number; selection_rate: number };
  disparity: { FNR: number; FPR: number; selection_rate: number };
  risk_level: "HIGH" | "MEDIUM" | "LOW";
  by_group: FairnessGroup[];
}

export interface AuditLogRow {
  id: number;
  timestamp: string;
  patient_json: string;
  probability: number;
  threshold: number;
  prediction: number;
  session_id: string;
}

export interface AuditLogPage {
  total: number;
  page: number;
  page_size: number;
  rows: AuditLogRow[];
}

export interface ChatMessage {
  role: "user" | "assistant" | "tool_call" | "tool_result";
  content: string;
  tool?: string;
}

export interface BatchRow {
  encounter_id: string;
  probability: number;
  prediction: number;
  risk_label: string;
  threshold: number;
  recall_at_threshold: number;
  icd9_primary_label: string;
  audit_id: number;
}

export interface BatchResult {
  count: number;
  results: BatchRow[];
}
