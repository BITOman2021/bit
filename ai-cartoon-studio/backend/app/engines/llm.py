"""Story/script engines. `ollama` = a local LLM served by Ollama (free, runs on your hardware).
`template` = deterministic scaffold generator that needs no AI at all; it is clearly labelled and only structures the
user's own idea into scenes - it does not invent creative text."""
import json
import re

import httpx

from ..config import settings
from .registry import EngineInfo, EngineUnavailable


def ollama_health() -> tuple[bool, str]:
    try:
        r = httpx.get(f"{settings.ollama_url}/api/tags", timeout=3)
        r.raise_for_status()
        names = [m["name"] for m in r.json().get("models", [])]
        if not names:
            return False, "Ollama running but no model pulled"
        return True, f"models: {', '.join(names[:4])}"
    except Exception as e:
        return False, f"Ollama not reachable at {settings.ollama_url} ({type(e).__name__})"


def ollama_generate(prompt: str, system: str = "", as_json: bool = False, timeout: int = 600) -> str:
    ok, detail = ollama_health()
    if not ok:
        raise EngineUnavailable(detail)
    body = {"model": settings.ollama_model, "prompt": prompt, "system": system, "stream": False}
    if as_json:
        body["format"] = "json"
    try:
        r = httpx.post(f"{settings.ollama_url}/api/generate", json=body, timeout=timeout)
        r.raise_for_status()
    except Exception as e:
        raise EngineUnavailable(f"Ollama request failed: {e}")
    return r.json().get("response", "")


def parse_json(text: str):
    try:
        return json.loads(text)
    except Exception:
        m = re.search(r"\{.*\}", text, re.S)
        if m:
            return json.loads(m.group(0))
        raise EngineUnavailable("LLM did not return valid JSON; try again or use a larger model")


def describe() -> list[EngineInfo]:
    ok, detail = ollama_health()
    return [
        EngineInfo("ollama", "llm", f"Ollama LLM ({settings.ollama_model})", "Depends on the model (Qwen2.5: Apache-2.0 for most sizes; Llama: community license)",
                   "Check the model's license", "8 GB RAM for 3-7B models on CPU (slow); GPU recommended", available=ok, detail=detail),
        EngineInfo("template", "llm", "Template scaffold (no AI)", "MIT (this project)", "Yes", "None", available=True,
                   detail="Structures your own idea into scenes; does not write creative text. Use Ollama for real generation."),
    ]
