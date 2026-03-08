"""
POST /chat

Receives {session_id, message, patient_context?}, invokes the LangGraph ReAct agent,
streams the response as Server-Sent Events (SSE).

Each event is a JSON object with one of:
  {"type": "token",     "content": "..."}
  {"type": "tool_call", "tool": "...", "input": "..."}
  {"type": "done",      "content": "...full final reply..."}
  {"type": "error",     "content": "..."}
"""

from __future__ import annotations

import json
import os
from typing import AsyncGenerator

from fastapi import APIRouter
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse
from langchain_core.messages import AIMessageChunk, ToolMessage

router = APIRouter()


class ChatRequest(BaseModel):
    session_id:      str
    message:         str
    patient_context: dict | None = None


async def _stream_agent(req: ChatRequest) -> AsyncGenerator[str, None]:
    """Async generator that yields SSE-formatted JSON strings."""
    from backend.agents.clinical_agent import TOOLS, _build_llm, _session_memory, get_session_history
    from langchain_core.messages import HumanMessage, AIMessage
    from langgraph.prebuilt import create_react_agent

    if not os.getenv("OPENAI_API_KEY"):
        yield json.dumps({"type": "error", "content": "OPENAI_API_KEY not set."})
        return

    try:
        llm   = _build_llm()
        agent = create_react_agent(llm, TOOLS)
    except Exception as exc:
        yield json.dumps({"type": "error", "content": str(exc)})
        return

    history = _session_memory.setdefault(req.session_id, [])

    # Prepend patient context on first message
    if req.patient_context and not history:
        ctx_str = (
            "Patient context loaded:\n"
            + "\n".join(f"  {k}: {v}" for k, v in req.patient_context.items())
        )
        history.append(HumanMessage(content=ctx_str))
        history.append(AIMessage(content="Patient context received. How can I help?"))

    history.append(HumanMessage(content=req.message))

    full_reply = ""
    try:
        async for event in agent.astream_events(
            {"messages": history},
            version="v1",
        ):
            kind = event.get("event", "")

            if kind == "on_chat_model_stream":
                chunk = event["data"]["chunk"]
                if isinstance(chunk, AIMessageChunk) and chunk.content:
                    token = chunk.content
                    full_reply += token
                    yield json.dumps({"type": "token", "content": token})

            elif kind == "on_tool_start":
                tool_input = event["data"].get("input", {})
                yield json.dumps({
                    "type": "tool_call",
                    "tool":  event.get("name", "unknown"),
                    "input": str(tool_input),
                })

            elif kind == "on_tool_end":
                raw = event["data"].get("output", "")
                # langgraph 1.x returns a ToolMessage object; extract .content
                if hasattr(raw, "content"):
                    tool_output = str(raw.content)
                else:
                    tool_output = str(raw)
                yield json.dumps({
                    "type":   "tool_result",
                    "tool":   event.get("name", "unknown"),
                    "output": tool_output[:500],
                })

    except Exception as exc:
        yield json.dumps({"type": "error", "content": str(exc)})
        return

    # Persist the updated history
    _session_memory[req.session_id] = history + [AIMessage(content=full_reply)]
    yield json.dumps({"type": "done", "content": full_reply})


@router.post("/chat")
async def chat(req: ChatRequest) -> EventSourceResponse:
    return EventSourceResponse(_stream_agent(req))


@router.get("/chat/{session_id}/history")
def chat_history(session_id: str) -> list[dict]:
    """Return the conversation history for a session."""
    from backend.agents.clinical_agent import get_session_history
    return get_session_history(session_id)


@router.delete("/chat/{session_id}")
def clear_chat(session_id: str) -> dict:
    """Clear the conversation history for a session."""
    from backend.agents.clinical_agent import clear_session
    clear_session(session_id)
    return {"cleared": session_id}
