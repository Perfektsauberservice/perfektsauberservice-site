import json
import random
from pathlib import Path
from datetime import datetime

ROOT = Path(".")
PLAN_PATH = ROOT / "agent" / "state" / "base-pages-plan.json"
LOCATION_IMAGES_DIR = ROOT / "public" / "images" / "locations"
SITE = "https://perfektsauberservice.com"

CITY_SNIPPETS = {
    "rastatt": [
        "auch kurzfristig in Rastatt und Umgebung",
        "für Wohnungen, Häuser und Nebenräume in Rastatt",
        "mit schneller Planung direkt für Rastatt"
    ],
    "baden-baden": [
        "auch für Wohnungen und Häuser in Baden-Baden",
        "mit diskreter und strukturierter Umsetzung in Baden-Baden",
        "für private und gewerbliche Objekte in Baden-Baden"
    ],
    "gaggenau": [
        "mit flexiblen Terminen in Gaggenau",
        "auch bei kurzfristigem Räumungsbedarf in Gaggenau",
        "für Häuser, Keller und Wohnungen in Gaggenau"
    ],
    "karlsruhe": [
        "für Privatkunden und Gewerbe in Karlsruhe",
        "mit strukturierter Planung für Karlsruhe",
        "auch bei größeren Objekten in Karlsruhe"
    ]
}

SERVICE_CONTENT = {
    "entruempelung": {
        "intros": [
            "Wenn Sie eine Entrümpelung in {city} planen, kommt es vor allem auf Struktur, Tempo und eine saubere Umsetzung an. Perfekt Sauber Service unterstützt Sie dabei zuverlässig und besenrein.",
            "Eine Entrümpelung in {city} ist oft mit Zeitdruck, Organisation und körperlichem Aufwand verbunden. Genau dabei hilft Perfekt Sauber Service mit klaren Abläufen und schneller Umsetzung.",
            "Ob Keller, Dachboden, Garage oder komplette Wohnräume – eine Entrümpelung in {city} sollte effizient und planbar ablaufen. Wir unterstützen Sie dabei professionell und zuverlässig."
        ],
        "sections": [
            ("Wann ist eine Entrümpelung sinnvoll?",
             "Eine professionelle Entrümpelung lohnt sich immer dann, wenn Räume über längere Zeit vollgestellt wurden oder kurzfristig freigemacht werden müssen. Das betrifft oft Keller, Dachböden, Garagen, einzelne Zimmer oder ganze Häuser."),
            ("Wie läuft eine Entrümpelung ab?",
             "In der Regel beginnt alles mit einer kurzen Einschätzung des Umfangs. Danach wird geplant, welche Bereiche geräumt, sortiert und entsorgt werden sollen. Am Einsatztag wird zügig gearbeitet, damit die Räume ordentlich und frei übergeben werden können."),
            ("Welche Faktoren spielen bei der Planung eine Rolle?",
             "Entscheidend sind unter anderem Menge, Zugänglichkeit, Etage, Laufwege und besondere Anforderungen. Fotos und kurze Vorabinformationen helfen, die Räumung realistischer einzuschätzen und besser zu planen."),
            ("Für welche Bereiche ist der Service geeignet?",
             "Typische Einsätze betreffen Wohnungen, Häuser, Keller, Dachböden, Garagen, Abstellräume und Nebengebäude. Auch einzelne Problemräume können gezielt und separat geräumt werden.")
        ]
    },
    "haushaltsaufloesung": {
        "intros": [
            "Bei einer Haushaltsauflösung in {city} ist ein klarer Ablauf besonders wichtig. Perfekt Sauber Service unterstützt Sie zuverlässig, diskret und mit besenreiner Übergabe.",
            "Eine Haushaltsauflösung in {city} ist oft mit vielen Entscheidungen und organisatorischem Aufwand verbunden. Wir helfen Ihnen dabei, den gesamten Ablauf strukturierter und entspannter umzusetzen.",
            "Wenn ein kompletter Haushalt in {city} aufgelöst werden muss, zählt vor allem eine zuverlässige und planbare Unterstützung. Genau dafür ist Perfekt Sauber Service da."
        ],
        "sections": [
            ("Wann ist eine Haushaltsauflösung sinnvoll?",
             "Eine Haushaltsauflösung ist sinnvoll, wenn eine Wohnung oder ein Haus vollständig geleert werden muss. Das betrifft zum Beispiel Umzüge, Nachlasssituationen, Räumungen vor Verkauf oder Vermietung sowie langfristig nicht mehr genutzte Objekte."),
            ("Was gehört typischerweise dazu?",
             "In vielen Fällen geht es um das Leerräumen kompletter Wohnbereiche inklusive Möbeln, Hausrat, Kücheninhalt, Keller, Dachboden und Nebenräumen. Zusätzlich spielt oft die sortierte Entsorgung eine wichtige Rolle."),
            ("Wie läuft der Einsatz ab?",
             "Nach einer ersten Einschätzung wird festgelegt, welche Räume geleert werden, was entsorgt werden soll und welche Besonderheiten beachtet werden müssen. Danach wird die Haushaltsauflösung strukturiert umgesetzt, damit das Objekt frei und ordentlich übergeben werden kann."),
            ("Worauf kommt es bei sensiblen Situationen an?",
             "Gerade bei Haushaltsauflösungen sind Diskretion, Verlässlichkeit und ein ruhiger Ablauf wichtig. Eine gute Planung hilft, den Einsatz effizient umzusetzen und unnötigen Stress zu vermeiden.")
        ]
    },
    "wohnungsaufloesung": {
        "intros": [
            "Eine Wohnungsauflösung in {city} sollte gut organisiert und verlässlich umgesetzt werden. Perfekt Sauber Service unterstützt Sie schnell, strukturiert und besenrein.",
            "Wenn eine Wohnung in {city} vollständig geräumt werden muss, ist ein planbarer Ablauf besonders wichtig. Wir helfen Ihnen dabei, den Aufwand klarer und einfacher zu organisieren.",
            "Bei einer Wohnungsauflösung in {city} zählt vor allem eine saubere, zügige und gut abgestimmte Umsetzung. Genau darauf ist Perfekt Sauber Service ausgerichtet."
        ],
        "sections": [
            ("Wann ist eine Wohnungsauflösung nötig?",
             "Eine Wohnungsauflösung ist immer dann sinnvoll, wenn eine Wohnung vollständig leergeräumt werden muss. Das kann vor Übergabe, Vermietung, Verkauf, Auszug oder nach längerer Nichtnutzung erforderlich sein."),
            ("Was macht die Planung wichtig?",
             "Gerade bei Wohnungen spielen Etage, Aufzug, Laufwege, Parkplatzsituation und Zugänglichkeit eine große Rolle. Diese Punkte beeinflussen, wie effizient und schnell die Räumung umgesetzt werden kann."),
            ("Was wird typischerweise geräumt?",
             "Neben Möbeln und Haushaltsgegenständen betrifft eine Wohnungsauflösung oft auch Kellerabteile, Abstellräume, Kücheninhalte und einzelne schwer zugängliche Bereiche. Eine vollständige Planung sorgt dafür, dass nichts übersehen wird."),
            ("Wie läuft die Übergabe am Ende ab?",
             "Ziel ist eine freie und ordentliche Wohnung, die für die nächsten Schritte vorbereitet ist. Eine besenreine Übergabe schafft dabei eine gute Grundlage für Vermieter, Käufer oder Nachmieter.")
        ]
    },
    "gewerberaeumung": {
        "intros": [
            "Eine Gewerberäumung in {city} braucht vor allem Struktur, Verlässlichkeit und eine zügige Umsetzung. Perfekt Sauber Service unterstützt Unternehmen dabei professionell und planbar.",
            "Wenn Büro-, Lager- oder Gewerbeflächen in {city} freigemacht werden müssen, ist eine saubere Organisation entscheidend. Genau hier hilft Perfekt Sauber Service mit klaren Abläufen.",
            "Bei einer Gewerberäumung in {city} kommt es auf Tempo, Übersicht und eine reibungsarme Durchführung an. Wir unterstützen Sie dabei zuverlässig und effizient."
        ],
        "sections": [
            ("Wann ist eine Gewerberäumung sinnvoll?",
             "Eine Gewerberäumung ist sinnvoll, wenn Büroflächen, Lager, Werkstattbereiche oder andere gewerblich genutzte Räume vollständig geleert werden müssen. Das betrifft zum Beispiel Umzüge, Standortwechsel, Aufgabe von Flächen oder Neuvermietung."),
            ("Welche Bereiche können betroffen sein?",
             "Je nach Objekt geht es um Büroräume, Lagerflächen, Verkaufsräume, Nebenräume, Archivbereiche oder komplette Gewerbeeinheiten. Eine strukturierte Planung hilft, die Räumung möglichst effizient zu gestalten."),
            ("Warum ist eine gute Planung wichtig?",
             "Gerade im gewerblichen Bereich sind feste Abläufe, gute Erreichbarkeit und klare Zuständigkeiten entscheidend. So lassen sich unnötige Unterbrechungen vermeiden und Flächen schneller wieder nutzbar machen."),
            ("Wie läuft ein typischer Einsatz ab?",
             "Nach einer kurzen Einschätzung wird der Umfang festgelegt und die Räumung geplant. Am Einsatztag erfolgt die Umsetzung Schritt für Schritt, damit die Flächen schnell und geordnet freigemacht werden können.")
        ]
    }
}

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
    import re
    def sort_key(name: str):
        m = re.search(r"-(\d+)\.", name)
        return int(m.group(1)) if m else 999999
    files.sort(key=sort_key)
    return [f"/public/images/locations/{name}" for name in files]

def choose_image(city_slug: str):
    images = available_city_images(city_slug)
    return images[0] if images else ""

def city_snippet(city_slug: str):
    items = CITY_SNIPPETS.get(city_slug, [])
    if not items:
        return "für Privatkunden und Gewerbe in der Region"
    return random.choice(items)

def page_title(item):
    return f"{item['service']} {item['city']} | Perfekt Sauber Service"

def meta_description(item):
    return f"{item['service']} in {item['city']}. Schnell, zuverlässig und besenrein mit Perfekt Sauber Service. Jetzt kostenlos anfragen."

def h1_text(item):
    return f"{item['service']} {item['city']}"

def intro_text(item):
    service_key = item["serviceSlug"]
    variants = SERVICE_CONTENT[service_key]["intros"]
    return random.choice(variants).format(city=item["city"])

def section_blocks(item):
    service_key = item["serviceSlug"]
    blocks = SERVICE_CONTENT[service_key]["sections"][:]
    random.shuffle(blocks)
    return blocks

def build_html(item):
    title = page_title(item)
    desc = meta_description(item)
    h1 = h1_text(item)
    intro = intro_text(item)
    image = choose_image(item["citySlug"])
    canonical = f"{SITE}/{item['targetPath']}"
    snippet = city_snippet(item["citySlug"])
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
.note{{display:inline-block;margin-top:8px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:14px;padding:10px 14px;font-weight:600;color:#334155}}
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
    <div class="note">{snippet}</div>
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
    random.seed()
    plan = load_json(PLAN_PATH)
    created = 0
    updated = 0

    for item in plan.get("items", []):
        target = ROOT / item["targetPath"]
        html = build_html(item)

        if target.exists():
            target.write_text(html, encoding="utf-8")
            updated += 1
        else:
            target.write_text(html, encoding="utf-8")
            created += 1

        item["status"] = "created"
        item["createdAt"] = iso_now()

    plan["updatedAt"] = iso_now()
    save_json(PLAN_PATH, plan)
    print(f"Base pages created: {created}, updated existing: {updated}")

if __name__ == "__main__":
    main()
