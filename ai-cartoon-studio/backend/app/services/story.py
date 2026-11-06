"""Story / script generation: Ollama (real LLM) or a deterministic scaffold (no AI)."""
from ..engines import llm
from ..engines.registry import EngineUnavailable

BEATS = [("hook", "الافتتاحية الجذابة", "Hook"), ("setup", "تقديم الشخصيات والمكان", "Setup"), ("problem", "ظهور المشكلة", "Problem"),
         ("rising", "محاولات الحل", "Attempts"), ("climax", "ذروة الأحداث", "Climax"), ("resolution", "الحل", "Resolution"),
         ("lesson", "الدرس / القيمة", "Lesson"), ("outro", "الخاتمة ودعوة للمتابعة", "Outro")]

SYSTEM = ("You are a children's cartoon screenwriter. Reply with a single JSON object only. Keep content age-appropriate, "
          "kind, and free of violence or frightening material. Never imitate real people.")


def _pick_beats(n: int):
    if n >= len(BEATS):
        return BEATS + [BEATS[3]] * (n - len(BEATS))
    keep = [0, len(BEATS) - 1] + list(range(1, len(BEATS) - 1))
    idx = sorted(keep[:n])
    return [BEATS[i] for i in idx]


def template_story(p: dict) -> dict:
    lang = p.get("language", "ar")
    n = max(1, int(p.get("scenes", 6)))
    total = float(p.get("duration_minutes", 3)) * 60
    chars = [c for c in p.get("characters", []) if c] or [("الشخصية الرئيسية" if lang == "ar" else "Main character")]
    per = round(total / n, 1)
    scenes = []
    for i, (key, ar, en) in enumerate(_pick_beats(n)):
        scenes.append({"title": ar if lang == "ar" else en, "beat": key, "duration": per, "characters": chars[: max(1, min(len(chars), 2 + i % 2))],
                       "description": (f"{p.get('idea', '')}" if i == 0 else ""), "action": "", "dialogue": [], "subtitle": "", "needs_user_input": True})
    return {"title": (p.get("idea", "") or "")[:60], "language": lang, "synopsis": p.get("idea", ""), "moral": p.get("moral", ""),
            "scenes": scenes, "engine": "template",
            "notice": "Template scaffold: structure and timing only. Fill in descriptions and dialogue, or run Ollama for generated text."}


def llm_story(p: dict) -> dict:
    lang = "Arabic (Modern Standard, simple, child friendly)" if p.get("language", "ar") == "ar" else "English"
    chars = ", ".join(c for c in p.get("characters", []) if c) or "invent 2-3 characters"
    prompt = (f"Write a cartoon episode script in {lang}.\nIdea: {p.get('idea')}\nAge group: {p.get('age_group', '4-7')}\nGenre: {p.get('genre', 'adventure')}\n"
              f"Duration: {p.get('duration_minutes', 3)} minutes\nNumber of scenes: {p.get('scenes', 6)}\nCharacters: {chars}\n"
              f"Comedy level (0-5): {p.get('comedy', 2)}\nEducational level (0-5): {p.get('education', 3)}\nMoral/value: {p.get('moral', '')}\n\n"
              'Return JSON: {"title": str, "synopsis": str, "moral": str, "scenes": [{"title": str, "duration": seconds(number), '
              '"characters": [str], "description": str (setting and visuals), "action": str (movement and facial expressions), '
              '"dialogue": [{"character": str, "line": str, "emotion": str}]}]}. Start with a catchy hook and end with a strong ending.')
    data = llm.parse_json(llm.ollama_generate(prompt, SYSTEM, as_json=True))
    if not isinstance(data.get("scenes"), list) or not data["scenes"]:
        raise EngineUnavailable("LLM returned no scenes")
    for s in data["scenes"]:
        s.setdefault("dialogue", [])
        s["duration"] = float(s.get("duration") or 8)
        s["subtitle"] = " ".join(d.get("line", "") for d in s["dialogue"] if isinstance(d, dict))
    data.update({"language": p.get("language", "ar"), "engine": "ollama"})
    return data


def generate(p: dict) -> dict:
    if p.get("engine") == "ollama":
        return llm_story(p)
    return template_story(p)


def youtube_meta(p: dict, chapters: list[tuple[str, str]]) -> dict:
    """p: title, synopsis, language, keywords[]. chapters: [(timestamp,title)] from real scene durations."""
    lang, title, syn = p.get("language", "ar"), p.get("title", ""), p.get("synopsis", "")
    kws = [k.strip() for k in p.get("keywords", []) if k.strip()]
    if p.get("engine") == "ollama":
        prompt = (f"YouTube metadata for a kids' cartoon video. Language: {'Arabic' if lang == 'ar' else 'English'}. Title idea: {title}. Synopsis: {syn}. "
                  'Return JSON {"titles":[3 catchy titles under 70 chars], "description": str, "tags":[up to 15 strings], "hashtags":[up to 5 starting with #]}.')
        d = llm.parse_json(llm.ollama_generate(prompt, SYSTEM, as_json=True))
        d["engine"] = "ollama"
    else:
        tags = list(dict.fromkeys(kws + [w for w in title.split() if len(w) > 2]))[:15]
        suffix = ("رسوم متحركة للأطفال" if lang == "ar" else "Kids Cartoon")
        d = {"titles": [title[:70], f"{title} | {suffix}"[:70]], "description": syn, "tags": tags,
             "hashtags": ["#" + t.replace(" ", "_") for t in tags[:5]], "engine": "template"}
    if chapters:
        head = "الفصول:" if lang == "ar" else "Chapters:"
        d["description"] = (d.get("description", "") + f"\n\n{head}\n" + "\n".join(f"{t} {n}" for t, n in chapters)).strip()
    d["made_for_kids_reminder"] = ("حدّد 'مخصص للأطفال' عند الرفع إذا كان المحتوى موجهاً للأطفال." if lang == "ar"
                                   else "Mark the video as 'Made for kids' on upload if it targets children.")
    return d
