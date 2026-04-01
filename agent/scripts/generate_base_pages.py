import json
from pathlib import Path
from datetime import datetime

ROOT = Path(".")
PLAN_PATH = ROOT / "agent" / "state" / "base-pages-plan.json"
LOCATION_IMAGES_DIR = ROOT / "public" / "images" / "locations"
SITE = "https://perfektsauberservice.com"

def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))

def save_json(path: Path, payload):
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")

def iso_now() -> str:
    return datetime.utcnow().isoformat() + "Z"

def available_city_images(city_slug: str):
    if not LOCATION_IMAGES_DIR.exists():
        return []
    files = []
    for p in LOCATION_IMAGES_DIR.iterdir():
        if p.is_file() and p.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"} and p.name.lower().startswith(city_slug.lower() + "-"):
            files.append(p.name)
    def sort_key(name: str):
        import re
        m = re.search(r"-(\d+)\.", name)
        return int(m.group(1)) if m else 999999
    files.sort(key=sort_key)
    return [f"/public/images/locations/{name}" for name in files]

def choose_image(city_slug: str):
    images = available_city_images(city_slug)
    return images[0] if images else ""

def page_title(item):
    return f"{item['service']} {item['city']} | Perfekt Sauber Service"

def meta_description(item):
    return f"{item['service']} in {item['city']}. Schnell, zuverlässig und besenrein mit Perfekt Sauber Service. Jetzt kostenlos anfragen."

def h1_text(item):
    return f"{item['service']} {item['city']}"

def intro_text(item):
    service = item["service"]
    city = item["city"]
    return (
        f"Wenn Sie eine {service} in {city} benötigen, ist eine klare und verlässliche Unterstützung wichtig. "
        f"Perfekt Sauber Service hilft Ihnen schnell, zuverlässig und besenrein – egal ob Wohnung, Haus, Keller, Büro oder andere Räume geräumt werden sollen."
    )

def section_blocks(item):
    service = item["service"].lower()
    city = item["city"]
    return [
        ("Wann ist professionelle Unterstützung sinnvoll?",
         f"Gerade bei umfangreichen Räumungen in {city} spart eine professionelle {service} Zeit, Kraft und Organisation. "
         "Auch kurze Fristen, enge Treppenhäuser oder größere Mengen können so deutlich strukturierter gelöst werden."),
        ("Wie läuft der Einsatz ab?",
         "In der Regel beginnt alles mit einer kurzen Anfrage und einer Einschätzung des Umfangs. Danach wird geplant, was geräumt, entsorgt oder getrennt werden soll. "
         "Am Einsatztag wird zügig und strukturiert gearbeitet, damit die Räume am Ende ordentlich übergeben werden können."),
        ("Worauf kommt es bei der Planung an?",
         f"Wichtig sind vor allem Größe des Objekts, Zugänglichkeit, Laufwege, Menge des Inhalts und besondere Anforderungen. "
         f"Gerade bei einer {service} in {city} helfen Fotos und kurze Infos vorab, damit die Planung schneller und realistischer wird."),
        ("Jetzt unverbindlich anfragen",
         f"Wenn Sie in {city} eine zuverlässige Unterstützung suchen, können Sie Perfekt Sauber Service direkt kontaktieren. "
         "So lässt sich schnell klären, welcher Umfang sinnvoll ist und wann ein Termin möglich wäre.")
    ]

def build_html(item):
    title = page_title(item)
    desc = meta_description(item)
    h1 = h1_text(item)
    intro = intro_text(item)
    image = choose_image(item["citySlug"])
    canonical = f"{SITE}/{item['targetPath']}"
    hero_image = f'<img class="hero-img" src="{image}" alt="{h1}" />' if image else ""

    blocks = "\n".join(
        f"<section class='section'><h2>{head}</h2><p>{body}</p></section>"
        for head, body in section_blocks(item)
    )

    return f"""<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="index,follow" />
<title>{title}</title>
<meta name="description" content="{desc}" />
<link rel="canonical" href="{canonical}" />
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
      <span class="badge">{item['city']}</span>
      <span class="badge">{item['service']}</span>
    </div>
    <h1>{h1}</h1>
    <p>{intro}</p>
    {hero_image}
    <a class="cta" href="#kontakt">Kostenloses Angebot anfragen</a>
  </article>

  <div class="grid">
    {blocks}
  </div>

  <section class="section" id="kontakt" style="margin-top:20px">
    <h2>Kontakt</h2>
    <p>Sie möchten eine schnelle Einschätzung oder einen Termin anfragen? Dann kontaktieren Sie Perfekt Sauber Service direkt und unverbindlich.</p>
  </section>
</div>
</body>
</html>
"""

def main():
    plan = load_json(PLAN_PATH)
    created = 0
    skipped = 0

    for item in plan.get("items", []):
        target = ROOT / item["targetPath"]
        if target.exists():
            skipped += 1
            continue
        target.write_text(build_html(item), encoding="utf-8")
        item["status"] = "created"
        item["createdAt"] = iso_now()
        created += 1

    plan["updatedAt"] = iso_now()
    save_json(PLAN_PATH, plan)
    print(f"Base pages created: {created}, skipped existing: {skipped}")

if __name__ == "__main__":
    main()
