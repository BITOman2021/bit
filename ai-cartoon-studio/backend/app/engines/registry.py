"""Engine registry. Every AI engine is an independent adapter implementing a tiny interface, so any of them can
be replaced or added without touching the rest of the platform. Each reports honest availability."""
from dataclasses import dataclass, field


@dataclass
class EngineInfo:
    id: str
    kind: str  # image | video | tts | llm | lipsync | image_ops
    name: str
    license: str
    commercial_use: str
    requirements: str
    available: bool = False
    detail: str = ""
    extra: dict = field(default_factory=dict)

    def dict(self):
        return self.__dict__.copy()


class EngineUnavailable(Exception):
    """Raised when an engine cannot run; the message is shown to the user (never a fake success)."""


def all_engines() -> list[EngineInfo]:
    from . import comfyui, llm, lipsync, tts, imageops
    return [*comfyui.describe(), *tts.describe(), *llm.describe(), *lipsync.describe(), *imageops.describe()]
