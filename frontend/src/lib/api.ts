import axios from "axios";
import type {
  PatientInput,
  PredictResponse,
  RecallPoint,
  FairnessResult,
  AuditLogPage,
  BatchResult,
} from "./types";

// In dev (no VITE_API_URL), use empty string so requests go through the Vite proxy
// and the browser never fires a cross-origin preflight.
// In production, set VITE_API_URL to the deployed backend URL.
const BACKEND = import.meta.env.VITE_API_URL ?? "";

// Free-tier Render cold start can take ~50 s — use 65 s timeout.
const api = axios.create({
  baseURL: BACKEND,
  timeout: 65000,
  headers: { "Content-Type": "application/json" },
});

// Retry once on network / timeout errors (covers Render free-tier cold start).
api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const isRetryable =
      !err.response &&                          // network error / timeout
      err.config &&
      !err.config.__retried;                    // only retry once
    if (isRetryable) {
      err.config.__retried = true;
      await new Promise((r) => setTimeout(r, 5000)); // wait 5 s then retry
      return api(err.config);
    }
    return Promise.reject(err);
  }
);

// ── Prediction ────────────────────────────────────────────────────────────────
export async function predict(input: PatientInput): Promise<PredictResponse> {
  const { data } = await api.post<PredictResponse>("/predict", input);
  return data;
}

// ── Recall curve ──────────────────────────────────────────────────────────────
export async function fetchRecallCurve(): Promise<RecallPoint[]> {
  const { data } = await api.get<RecallPoint[]>("/recall-curve");
  return data;
}

// ── Fairness audit ────────────────────────────────────────────────────────────
export async function fetchFairness(group: "race" | "gender" | "age"): Promise<FairnessResult> {
  const { data } = await api.get<FairnessResult>(`/audit/fairness?group=${group}`);
  return data;
}

export async function fetchFairnessAll(): Promise<{
  race: FairnessResult;
  gender: FairnessResult;
  age: FairnessResult;
}> {
  const { data } = await api.get("/audit/fairness/all");
  return data;
}

// ── Audit log ─────────────────────────────────────────────────────────────────
export async function fetchAuditLog(page = 1, pageSize = 20): Promise<AuditLogPage> {
  const { data } = await api.get<AuditLogPage>(
    `/audit/log?page=${page}&page_size=${pageSize}`
  );
  return data;
}

// ── CSV upload ────────────────────────────────────────────────────────────────
export async function uploadCSV(
  file: File,
  threshold = 0.32,
  sessionId = ""
): Promise<BatchResult> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await api.post<BatchResult>(
    `/upload/csv?threshold=${threshold}&session_id=${encodeURIComponent(sessionId)}`,
    form,
    { headers: { "Content-Type": "multipart/form-data" } }
  );
  return data;
}

// ── Health ────────────────────────────────────────────────────────────────────
export async function fetchHealth(): Promise<{
  status: string;
  model_loaded: boolean;
  recall_curve: number;
}> {
  const { data } = await api.get("/health");
  return data;
}

// ── Chat (SSE streaming) ──────────────────────────────────────────────────────
export function streamChat(
  sessionId: string,
  message: string,
  patientContext: Record<string, unknown> | null,
  onEvent: (evt: { type: string; content?: string; tool?: string; output?: string; input?: string }) => void,
  onDone: () => void,
  onError: (err: string) => void
): () => void {
  let aborted = false;

  fetch(`${BACKEND}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session_id: sessionId,
      message,
      patient_context: patientContext,
    }),
  })
    .then(async (res) => {
      if (!res.body) { onError("No response body"); return; }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (!aborted) {
        const { done, value } = await reader.read();
        if (done) { onDone(); break; }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const evt = JSON.parse(line.slice(6));
              onEvent(evt);
              if (evt.type === "done") onDone();
            } catch {
              // ignore malformed SSE lines
            }
          }
        }
      }
    })
    .catch((err) => onError(String(err)));

  return () => { aborted = true; };
}

export default api;
