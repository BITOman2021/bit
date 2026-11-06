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


def _hdr() -> dict:
    return {"Authorization": f"Bearer {settings.llm_key}"} if settings.llm_key else {}


def gateway_health() -> tuple[bool, str]:
    try:
        r = httpx.get(f"{settings.llm_url}/models", headers=_hdr(), timeout=4)
        if r.status_code in (401, 403):
            return False, "Gateway reachable but rejected the key: set ACS_LLM_KEY (OmniRoute dashboard > API Keys)"
        r.raise_for_status()
        n = len(r.json().get("data", []))
        return (True, f"gateway online, {n} model(s)") if n else (False, "Gateway online but no models/providers configured in its dashboard")
    except Exception as e:
        return False, f"LLM gateway not reachable at {settings.llm_url} ({type(e).__name__})"


def gateway_generate(prompt: str, system: str = "", as_json: bool = False, timeout: int = 300) -> str:
    ok, detail = gateway_health()
    if not ok:
        raise EngineUnavailable(detail)
    body = {"model": settings.llm_model, "messages": ([{"role": "system", "content": system}] if system else []) + [{"role": "user", "content": prompt}]}
    if as_json:
        body["response_format"] = {"type": "json_object"}
    try:
        r = httpx.post(f"{settings.llm_url}/chat/completions", json=body, headers=_hdr(), timeout=timeout)
        r.raise_for_status()
        return r.json()["choices"][0]["message"]["content"] or ""
    except Exception as e:
        raise EngineUnavailable(f"LLM gateway request failed: {e}")


def generate(engine: str, prompt: str, system: str = "", as_json: bool = False) -> str:
    return (gateway_generate if engine == "gateway" else ollama_generate)(prompt, system, as_json)


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
    gok, gdetail = gateway_health()
    return [
        EngineInfo("gateway", "llm", f"OpenAI-compatible gateway (OmniRoute) - model '{settings.llm_model}'", "OmniRoute: MIT; each upstream provider has its own terms",
                   "Depends on the provider you route to; free tiers are external services with limits, not local or unlimited", "Network access to the gateway; provider accounts/keys configured in its dashboard",
                   available=gok, detail=gdetail),
        EngineInfo("ollama", "llm", f"Ollama LLM ({settings.ollama_model})", "Depends on the model (Qwen2.5: Apache-2.0 for most sizes; Llama: community license)",
                   "Check the model's license", "8 GB RAM for 3-7B models on CPU (slow); GPU recommended", available=ok, detail=detail),
        EngineInfo("template", "llm", "Template scaffold (no AI)", "MIT (this project)", "Yes", "None", available=True,
                   detail="Structures your own idea into scenes; does not write creative text. Use Ollama for real generation."),
    ]
