import json
import re
from pathlib import Path
from datetime import datetime, timezone
from html import escape

ROOT = Path(".")
TOPIC_PLAN_PATH = ROOT / "agent" / "state" / "topic-plan.json"
QUEUE_PATH = ROOT / "agent" / "state" / "autopost-queue.json"
STAGING_DIR = ROOT / "agent" / "staging"
LOCATION_IMAGES_DIR = ROOT / "public" / "images" / "locations"

SITE = "https://perfektsauberservice.com"

def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")

def load_json(path: Path, default):
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))

def save_json(path: Path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")

def slugify(text: str) -> str:
    text = text.lower().strip()
    for k, v in {"ä":"ae", "ö":"oe", "ü":"ue", "ß":"ss"}.items():
        text = text.replace(k, v)
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return text.strip("-")

def available_city_images(city_slug: str):
    if not LOCATION_IMAGES_DIR.exists():
        return []
    result = []
    for p in LOCATION_IMAGES_DIR.iterdir():
        if p.is_file() and p.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"} and p.name.lower().startswith(city_slug.lower() + "-"):
            result.append(p.name)
    def sort_key(name: str):
        m = re.search(r"-(\d+)\.", name)
        return int(m.group(1)) if m else 999999
    result.sort(key=sort_key)
    return [f"/public/images/locations/{name}" for name in result]

def count_existing_for_city(city_slug: str) -> int:
    count = 0
    for path in ROOT.rglob("*.html"):
        rel = path.relative_to(ROOT).as_posix()
        if rel.startswith(("agent/", "dashboard/", "netlify/", "images/", "content/")):
            continue
        if city_slug in path.stem:
            count += 1
    return count

def choose_image(city_slug: str) -> str:
    images = available_city_images(city_slug)
    if not images:
        return ""
    idx = count_existing_for_city(city_slug) % len(images)
    return images[idx]

def target_path(item: dict) -> str:
    return f"{item['serviceSlug']}-{item['citySlug']}.html"

def meta_description(item: dict) -> str:
    return f"{item['service']} in {item['city']}. Schnell, zuverlässig und besenrein mit Perfekt Sauber Service. Jetzt kostenlos anfragen."

def title_text(item: dict) -> str:
    return f"{item['service']} {item['city']} | Perfekt Sauber Service"

def h1_text(item: dict) -> str:
    return f"{item['service']} {item['city']}"

def intro_text(item: dict) -> str:
    return (
        f"Wenn Sie eine {item['service']} in {item['city']} benötigen, ist ein strukturierter Ablauf wichtig. "
        f"Perfekt Sauber Service unterstützt Sie schnell, zuverlässig und besenrein – egal ob Wohnung, Keller, Haus oder einzelne Räume geräumt werden sollen."
    )

def build_html(item: dict) -> str:
    page_title = title_text(item)
    h1 = h1_text(item)
    desc = meta_description(item)
    image = choose_image(item["citySlug"])
    canonical = f"{SITE}/{target_path(item)}"

    hero_image = f'<img class="hero-img" src="{escape(image)}" alt="{escape(h1)}" />' if image else ""

    sections = [
        ("Wann ist eine professionelle Unterstützung sinnvoll?",
         f"Gerade bei umfangreichen Räumungen in {item['city']} spart eine professionelle {item['service'].lower()} viel Zeit, Kraft und Organisation. "
         "Auch enge Treppenhäuser, volle Keller, Dachböden oder kurzfristige Termine lassen sich so deutlich entspannter umsetzen."),
        ("Wie läuft die Räumung ab?",
         "In der Regel beginnt alles mit einer kurzen Anfrage und einer Einschätzung des Umfangs. Danach wird geplant, was geräumt, entsorgt oder getrennt werden soll. "
         "Am Einsatztag wird strukturiert gearbeitet, damit die Räume am Ende sauber und ordentlich übergeben werden können."),
        ("Worauf kommt es bei der Planung an?",
         f"Wichtig sind vor allem Größe des Objekts, Zugänglichkeit, Menge des Inhalts und besondere Anforderungen. "
         f"Bei einer {item['service'].lower()} in {item['city']} helfen klare Fotos und kurze Informationen vorab, damit die Planung schneller und genauer möglich ist."),
        ("Jetzt unverbindlich anfragen",
         f"Wenn Sie für {item['city']} eine zuverlässige Unterstützung suchen, können Sie direkt Kontakt mit Perfekt Sauber Service aufnehmen. "
         "So lässt sich schnell klären, welcher Umfang sinnvoll ist und wann ein Termin möglich wäre.")
    ]

    rendered_sections = "\n".join(
        f"<section class='section'><h2>{escape(head)}</h2><p>{escape(body)}</p></section>"
        for head, body in sections
    )

    return f"""<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="index,follow" />
<title>{escape(page_title)}</title>
<meta name="description" content="{escape(desc)}" />
<link rel="canonical" href="{escape(canonical)}" />
<style>
body{{margin:0;font-family:Inter,Arial,sans-serif;background:#f6f8fb;color:#10213f;line-height:1.7}}
.wrap{{max-width:1100px;margin:0 auto;padding:32px 18px 56px}}
.hero{{background:#fff;border:1px solid #e5e7eb;border-radius:28px;padding:28px;box-shadow:0 10px 30px rgba(15,23,42,.06);overflow:hidden}}
.hero h1{{font-size:44px;line-height:1.1;margin:0 0 12px}}
.hero p{{font-size:18px;color:#475569;margin:0 0 16px}}
.hero-img{{width:100%;height:360px;object-fit:cover;border-radius:20px;margin-top:8px}}
.badges{{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px}}
.badge{{background:#eef2ff;color:#17315c;border-radius:999px;padding:8px 14px;font-weight:700;font-size:14px}}
.grid{{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:22px}}
.section{{background:#fff;border:1px solid #e5e7eb;border-radius:24px;padding:24px;box-shadow:0 8px 24px rgba(15,23,42,.05)}}
.section h2{{margin:0 0 10px;font-size:24px}}
.cta{{display:inline-block;margin-top:16px;background:#77c043;color:#17315c;text-decoration:none;font-weight:800;padding:14px 20px;border-radius:16px}}
@media (max-width:860px){{.grid{{grid-template-columns:1fr}}.hero h1{{font-size:34px}}.hero-img{{height:260px}}}}
</style>
</head>
<body>
<div class="wrap">
  <article class="hero">
    <div class="badges">
      <span class="badge">{escape(item['city'])}</span>
      <span class="badge">{escape(item['service'])}</span>
    </div>
    <h1>{escape(h1)}</h1>
    <p>{escape(intro_text(item))}</p>
    {hero_image}
    <a class="cta" href="#kontakt">Kostenloses Angebot anfragen</a>
  </article>

  <div class="grid">
    {rendered_sections}
  </div>

  <section class="section" id="kontakt" style="margin-top:20px">
    <h2>Kontakt</h2>
    <p>Sie möchten eine schnelle Einschätzung oder einen Termin anfragen? Dann kontaktieren Sie Perfekt Sauber Service direkt und unverbindlich.</p>
  </section>
</div>
</body>
</html>
"""

def already_published_or_queued(item: dict, queue: dict) -> bool:
    target = target_path(item)
    if (ROOT / target).exists():
        return True
    for queued in queue.get("items", []):
        if queued.get("path") == target:
            return True
    return False

def main():
    plan = load_json(TOPIC_PLAN_PATH, {"items": []})
    queue = load_json(QUEUE_PATH, {"dailyLimit": 10, "publishedToday": 0, "lastPublishedAt": "", "items": []})

    selected = None
    for item in plan.get("items", []):
        if item.get("status") not in {"ready", "queued"}:
            continue
        if already_published_or_queued(item, queue):
            continue
        selected = item
        break

    if not selected:
        print("No eligible topic found. Nothing generated.")
        return

    slug = selected["slug"]
    staged_name = f"{slug}.html"
    staged_path = STAGING_DIR / staged_name
    final_path = target_path(selected)

    STAGING_DIR.mkdir(parents=True, exist_ok=True)
    staged_path.write_text(build_html(selected), encoding="utf-8")

    queue.setdefault("items", []).append({
        "id": slug,
        "title": title_text(selected),
        "path": final_path,
        "stagedPath": staged_path.as_posix(),
        "status": "queued",
        "queuedAt": now_iso()
    })
    save_json(QUEUE_PATH, queue)

    selected["status"] = "queued"
    selected["lastGeneratedAt"] = now_iso()
    selected["lastPath"] = final_path
    save_json(TOPIC_PLAN_PATH, plan)

    print(f"Generated and queued: {slug} -> {final_path}")

if __name__ == "__main__":
    main()
