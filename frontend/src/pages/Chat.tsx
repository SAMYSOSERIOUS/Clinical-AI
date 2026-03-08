import { useState, useRef, useEffect } from "react";
import { streamChat, fetchAuditLog } from "../lib/api";
import type { ChatMessage, AuditLogRow } from "../lib/types";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Send, Trash2, Bot, User, Wrench, Database } from "lucide-react";

const SESSION_KEY = "clinical-ai-session";

function getSession(): string {
  let s = sessionStorage.getItem(SESSION_KEY);
  if (!s) { s = crypto.randomUUID(); sessionStorage.setItem(SESSION_KEY, s); }
  return s;
}

function MessageBubble({ msg, showTools }: { msg: ChatMessage; showTools: boolean }) {
  // Tool call — compact inline indicator
  if (msg.role === "tool_call") {
    return (
      <div className="flex items-center gap-1.5 text-xs text-amber-400/50 pl-12 py-0.5">
        <Wrench className="w-3 h-3 flex-shrink-0" />
        <span className="font-mono">{msg.tool}</span>
      </div>
    );
  }
  // Tool result — hidden by default, visible when debug toggle on
  if (msg.role === "tool_result") {
    if (!showTools) return null;
    return (
      <div className="mx-12 px-3 py-1.5 rounded-md bg-slate-800/60 border border-slate-700/40 text-xs text-slate-500 font-mono break-all">
        {msg.content.slice(0, 300)}{msg.content.length > 300 ? "…" : ""}
      </div>
    );
  }

  const isUser = msg.role === "user";
  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm ${
        isUser ? "bg-teal-500/30" : "bg-[#1e3056]"
      }`}>
        {isUser ? <User className="w-4 h-4 text-teal-300" /> : <Bot className="w-4 h-4 text-slate-300" />}
      </div>
      <div className={`max-w-[78%] rounded-xl px-4 py-3 text-sm leading-relaxed ${
        isUser
          ? "bg-teal-500/20 border border-teal-500/30 text-white"
          : "bg-[#141f38] border border-[#1e3056] text-slate-200"
      }`}>
        {msg.content === "" && !isUser ? (
          <span className="inline-flex gap-1">
            {[0, 150, 300].map((d) => (
              <span key={d} className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: `${d}ms` }} />
            ))}
          </span>
        ) : (
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              code({ children }) { return <code className="bg-[#0f1729] px-1 rounded text-teal-300 font-mono text-xs">{children}</code>; },
              strong({ children }) { return <strong className="text-white font-semibold">{children}</strong>; },
              p({ children }) { return <p className="mb-1 last:mb-0">{children}</p>; },
              ul({ children }) { return <ul className="list-disc list-inside space-y-0.5 mt-1">{children}</ul>; },
              li({ children }) { return <li className="text-slate-300">{children}</li>; },
            }}
          >
            {msg.content}
          </ReactMarkdown>
        )}
      </div>
    </div>
  );
}

export default function Chat() {
  const [messages, setMessages]         = useState<ChatMessage[]>([]);
  const [input, setInput]               = useState("");
  const [streaming, setStreaming]       = useState(false);
  const [loadPatient, setLoadPatient]   = useState(false);
  const [showTools, setShowTools]       = useState(false);
  const [auditRows, setAuditRows]       = useState<AuditLogRow[]>([]);
  const [auditLoaded, setAuditLoaded]   = useState(false);
  const endRef   = useRef<HTMLDivElement>(null);
  const abortRef = useRef<(() => void) | null>(null);
  const sessionId = getSession();

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const loadAuditContext = async () => {
    try {
      const data = await fetchAuditLog(1, 5);
      setAuditRows(data.rows);
      setAuditLoaded(true);
    } catch { /* ignore */ }
  };

  const buildContext = (): Record<string, unknown> | null => {
    let ctx: Record<string, unknown> = {};
    if (loadPatient) {
      const raw = sessionStorage.getItem("lastPrediction");
      if (raw) ctx = { ...ctx, ...JSON.parse(raw) };
    }
    if (auditLoaded && auditRows.length) {
      const lines = ["Recent predictions (audit log):"];
      auditRows.forEach((r, i) => {
        const pt = (() => { try { return JSON.parse(r.patient_json); } catch { return {}; } })();
        lines.push(`${i + 1}. ${r.timestamp.slice(0, 16)} — prob=${r.probability.toFixed(3)}, thr=${r.threshold}, outcome=${r.prediction === 1 ? "READMITTED" : "ok"}, diag_1=${pt.diag_1 ?? "?"}`);
      });
      ctx.audit_context = lines.join("\n");
    }
    return Object.keys(ctx).length ? ctx : null;
  };

  const sendMessage = () => {
    if (!input.trim() || streaming) return;
    const userMsg: ChatMessage = { role: "user", content: input.trim() };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setStreaming(true);
    setMessages((m) => [...m, { role: "assistant", content: "" }]);

    abortRef.current = streamChat(
      sessionId, userMsg.content, buildContext(),
      (evt) => {
        if (evt.type === "token") {
          setMessages((m) => {
            const up = [...m];
            const last = up[up.length - 1];
            if (last?.role === "assistant") {
              up[up.length - 1] = { ...last, content: last.content + (evt.content ?? "") };
            } else {
              // After a tool_result the last message isn't an assistant bubble —
              // create a fresh one so tokens aren't dropped.
              up.push({ role: "assistant", content: evt.content ?? "" });
            }
            return up;
          });
        } else if (evt.type === "tool_call") {
          setMessages((m) => [...m, { role: "tool_call", content: evt.input ?? "", tool: evt.tool }]);
        } else if (evt.type === "tool_result") {
          setMessages((m) => [...m, { role: "tool_result", content: evt.output ?? "" }]);
        }
      },
      () => setStreaming(false),
      (err) => {
        setMessages((m) => {
          const up = [...m];
          const last = up[up.length - 1];
          if (last?.role === "assistant" && !last.content) up[up.length - 1] = { ...last, content: `❌ ${err}` };
          else up.push({ role: "assistant", content: `❌ ${err}` });
          return up;
        });
        setStreaming(false);
      }
    );
  };

  const clearChat = () => {
    abortRef.current?.();
    setMessages([]);
    setAuditLoaded(false);
    setAuditRows([]);
    sessionStorage.removeItem(SESSION_KEY);
  };

  const STARTERS = [
    "What does ICD-9 code 428.0 mean?",
    "Explain SHAP values for readmission risk",
    "What's the recall at threshold 0.32?",
    "Show fairness audit by race",
    "Suggest interventions for a high-risk patient",
  ];

  return (
    <div className="flex flex-col" style={{ height: "100vh" }}>
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="px-6 py-3 border-b border-white/10 flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-base font-bold text-white flex items-center gap-2">
            <Bot className="w-4 h-4 text-teal-400" /> Clinical AI Agent
          </h1>
          <p className="text-xs text-slate-600 mt-0.5">
            icd9_lookup · explain_shap · suggest_interventions · fairness_audit · recall_at_threshold
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Load audit context */}
          <button
            onClick={loadAuditContext}
            title="Inject last 5 audit-log predictions as context"
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              auditLoaded
                ? "bg-teal-500/20 text-teal-300 border-teal-500/30"
                : "text-slate-500 border-slate-700 hover:border-teal-500/40 hover:text-teal-400"
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            {auditLoaded ? `Audit (${auditRows.length})` : "Audit Log"}
          </button>
          {/* Load last patient */}
          <label className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border cursor-pointer transition-colors ${
            loadPatient ? "bg-teal-500/20 text-teal-300 border-teal-500/30" : "text-slate-500 border-slate-700 hover:border-teal-500/40"
          }`}>
            <input type="checkbox" checked={loadPatient} onChange={(e) => setLoadPatient(e.target.checked)} className="accent-teal-500 w-3 h-3" />
            Last Patient
          </label>
          {/* Debug tool details */}
          <button
            onClick={() => setShowTools((v) => !v)}
            title="Toggle tool call details"
            className={`px-2.5 py-1.5 rounded-lg text-xs border transition-colors ${
              showTools ? "bg-amber-500/20 text-amber-300 border-amber-500/30" : "text-slate-600 border-slate-700 hover:text-slate-400"
            }`}
          >
            <Wrench className="w-3.5 h-3.5" />
          </button>
          <button onClick={clearChat} className="p-1.5 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-500/10 border border-slate-700 transition-colors">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Audit context banner */}
      {auditLoaded && (
        <div className="px-6 py-1.5 bg-teal-500/10 border-b border-teal-500/20 flex items-center gap-2 flex-shrink-0">
          <Database className="w-3.5 h-3.5 text-teal-400 flex-shrink-0" />
          <p className="text-xs text-teal-300 flex-1">{auditRows.length} recent predictions loaded as context for next message</p>
          <button onClick={() => { setAuditLoaded(false); setAuditRows([]); }} className="text-teal-500 hover:text-teal-300 text-xs ml-auto">✕</button>
        </div>
      )}

      {/* ── Messages ────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-16 space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center mx-auto">
              <Bot className="w-7 h-7 text-teal-400/60" />
            </div>
            <p className="text-slate-500 text-sm">Ask anything about patient risk, diagnoses, or model performance</p>
            <div className="flex flex-wrap gap-2 justify-center max-w-lg mx-auto">
              {STARTERS.map((s) => (
                <button key={s} onClick={() => setInput(s)}
                  className="px-3 py-1.5 rounded-full bg-[#141f38] border border-[#1e3056] text-xs text-slate-400 hover:border-teal-500/40 hover:text-teal-300 transition-colors text-left">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((msg, i) => {
          // Don't render empty assistant placeholders that were bypassed by a
          // tool call — they'd show as stuck bouncing-dot bubbles.
          if (msg.role === "assistant" && msg.content === "" && i < messages.length - 1) return null;
          return <MessageBubble key={i} msg={msg} showTools={showTools} />;
        })}
        <div ref={endRef} />
      </div>

      {/* ── Input bar ───────────────────────────────────────────────── */}
      <div className="px-6 py-4 border-t border-white/10 flex-shrink-0">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
            placeholder="Ask about ICD-9 codes, SHAP values, thresholds, fairness…"
            className="flex-1 bg-[#141f38] border border-[#1e3056] rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:border-teal-500/50 focus:outline-none transition-colors"
            disabled={streaming}
          />
          {streaming && (
            <button onClick={() => { abortRef.current?.(); setStreaming(false); }}
              className="px-3 py-2.5 rounded-xl bg-red-500/20 border border-red-500/30 text-red-400 text-xs font-medium">
              Stop
            </button>
          )}
          <button
            onClick={sendMessage}
            disabled={streaming || !input.trim()}
            className="px-4 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-600 disabled:opacity-40 text-white transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
