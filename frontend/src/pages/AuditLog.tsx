import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchAuditLog } from "../lib/api";
import type { AuditLogRow } from "../lib/types";
import { Download, ChevronLeft, ChevronRight, Search } from "lucide-react";

function exportJson(rows: AuditLogRow[]) {
  const blob = new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = `audit_log_${Date.now()}.json`;
  a.click(); URL.revokeObjectURL(url);
}

export default function AuditLog() {
  const [page, setPage]         = useState(1);
  const [search, setSearch]     = useState("");
  const [sortKey, setSortKey]   = useState<keyof AuditLogRow>("id");
  const [sortAsc, setSortAsc]   = useState(false);
  const PAGE_SIZE = 20;

  const { data, isLoading } = useQuery({
    queryKey: ["audit-log", page],
    queryFn: () => fetchAuditLog(page, PAGE_SIZE),
  });

  const rows   = data?.rows ?? [];
  const total  = data?.total ?? 0;
  const pages  = Math.ceil(total / PAGE_SIZE);

  const filtered = rows.filter((r) => {
    if (!search) return true;
    return (
      r.session_id.includes(search) ||
      r.patient_json.toLowerCase().includes(search.toLowerCase()) ||
      String(r.id).includes(search)
    );
  });

  const sorted = [...filtered].sort((a, b) => {
    const av = a[sortKey], bv = b[sortKey];
    return sortAsc ? (av < bv ? -1 : 1) : (av > bv ? -1 : 1);
  });

  const toggleSort = (key: keyof AuditLogRow) => {
    if (sortKey === key) setSortAsc((p) => !p);
    else { setSortKey(key); setSortAsc(false); }
  };

  const TH = ({ label, k }: { label: string; k: keyof AuditLogRow }) => (
    <th
      className="pb-2 pr-3 text-left text-slate-500 text-xs uppercase cursor-pointer hover:text-teal-400 select-none whitespace-nowrap"
      onClick={() => toggleSort(k)}
    >
      {label} {sortKey === k ? (sortAsc ? "↑" : "↓") : ""}
    </th>
  );

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Audit Log</h1>
          <p className="text-slate-400 text-sm mt-1">
            {total.toLocaleString()} total predictions logged to SQLite
          </p>
        </div>
        <button
          onClick={() => exportJson(sorted)}
          disabled={sorted.length === 0}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-500/20 border border-teal-500/30 text-teal-300 text-sm hover:bg-teal-500/30 disabled:opacity-40"
        >
          <Download className="w-4 h-4" />
          Export JSON
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
        <input
          value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by ID, session, diagnosis…"
          className="w-full bg-navy-800 border border-navy-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white focus:border-teal-500 focus:outline-none"
        />
        <p className="mt-1 text-xs text-slate-600">Filtering within current page only.</p>
      </div>

      <div className="glass-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-navy-700">
            <tr>
              <TH label="ID" k="id" />
              <TH label="Timestamp" k="timestamp" />
              <TH label="Probability" k="probability" />
              <TH label="Threshold" k="threshold" />
              <TH label="Prediction" k="prediction" />
              <TH label="Session" k="session_id" />
              <th className="pb-2 text-left text-slate-500 text-xs uppercase">Diagnoses</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={7} className="py-8 text-center text-slate-500">Loading…</td></tr>
            ) : sorted.length === 0 ? (
              <tr><td colSpan={7} className="py-8 text-center text-slate-500">No records found</td></tr>
            ) : (
              sorted.map((r) => {
                let patient: Record<string, unknown> = {};
                try { patient = JSON.parse(r.patient_json); } catch { /**/ }
                return (
                  <tr key={r.id} className="border-b border-navy-800/50 hover:bg-navy-800/30">
                    <td className="py-2 pr-3 font-mono text-slate-400">#{r.id}</td>
                    <td className="py-2 pr-3 text-slate-400 text-xs whitespace-nowrap">
                      {new Date(r.timestamp).toLocaleString()}
                    </td>
                    <td className="py-2 pr-3 font-mono text-teal-400">
                      {(r.probability * 100).toFixed(1)}%
                    </td>
                    <td className="py-2 pr-3 text-slate-400">{(r.threshold * 100).toFixed(0)}%</td>
                    <td className="py-2 pr-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                        r.prediction === 1
                          ? "bg-red-500/20 text-red-300"
                          : "bg-green-500/20 text-green-300"
                      }`}>
                        {r.prediction === 1 ? "HIGH" : "LOW"}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-slate-500 text-xs font-mono truncate max-w-[100px]">
                      {r.session_id || "—"}
                    </td>
                    <td className="py-2 text-xs text-slate-400">
                      <span className="font-mono">{String(patient.diag_1 ?? "")}</span>{" "}
                      <span className="font-mono">{String(patient.diag_2 ?? "")}</span>{" "}
                      <span className="font-mono">{String(patient.diag_3 ?? "")}</span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center gap-3 justify-center text-sm">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
            className="p-1.5 rounded-lg bg-navy-800 disabled:opacity-40 hover:bg-navy-700">
            <ChevronLeft className="w-4 h-4 text-slate-400" />
          </button>
          <span className="text-slate-400">Page {page} of {pages}</span>
          <button onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page === pages}
            className="p-1.5 rounded-lg bg-navy-800 disabled:opacity-40 hover:bg-navy-700">
            <ChevronRight className="w-4 h-4 text-slate-400" />
          </button>
        </div>
      )}
    </div>
  );
}
