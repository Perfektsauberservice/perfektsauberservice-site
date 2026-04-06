import json
import re
from pathlib import Path
from datetime import datetime
from html import unescape

ROOT = Path(".")
OUT = ROOT / "content" / "auto" / "blog-index.json"
LOCATION_IMAGES_DIR = ROOT / "public" / "images" / "locations"

EXCLUDE_FILES = {
    "index.html",
    "blog.html",
    "410.html",
    "einsatzgebiete.html",
    "einsatzgebiete-block.html",
    "einsatzgebite.html",
}
EXCLUDE_DIR_PREFIXES = {
    ".git",
    ".github",
    "dashboard",
    "netlify",
    "images",
    "agent",
    "content",
}

CITY_FRAGMENTS = [
    ("baden-baden", "Baden-Baden"),
    ("bad-herrenalb", "Bad Herrenalb"),
    ("bad-wildbad", "Bad Wildbad"),
    ("gaggenau", "Gaggenau"),
    ("karlsruhe", "Karlsruhe"),
    ("rastatt", "Rastatt"),
    ("kuppenheim", "Kuppenheim"),
    ("durmersheim", "Durmersheim"),
    ("muggensturm", "Muggensturm"),
    ("oetigheim", "Ötigheim"),
    ("bietigheim", "Bietigheim"),
    ("malsch", "Malsch"),
    ("sinzheim", "Sinzheim"),
    ("buehl", "Bühl"),
    ("achern", "Achern"),
    ("ettlingen", "Ettlingen"),
    ("gernsbach", "Gernsbach"),
    ("loffenau", "Loffenau"),
    ("iffezheim", "Iffezheim"),
    ("huegelsheim", "Hügelsheim"),
    ("rheinmuenster", "Rheinmünster"),
    ("steinmauern", "Steinmauern"),
    ("elchesheim-illingen", "Elchesheim-Illingen"),
    ("au-am-rhein", "Au am Rhein"),
    ("bischweier", "Bischweier"),
    ("weisenbach", "Weisenbach"),
    ("forbach", "Forbach"),
    ("rheinstetten", "Rheinstetten"),
    ("stutensee", "Stutensee"),
    ("pforzheim", "Pforzheim"),
]

SERVICE_FRAGMENTS = [
    ("entruempelung", "Entrümpelung"),
    ("haushaltsaufloesung", "Haushaltsauflösung"),
    ("wohnungsaufloesung", "Wohnungsauflösung"),
    ("kellerentruempelung", "Kellerentrümpelung"),
]

def slugify(text: str) -> str:
    text = text.lower().strip()
    repl = {"ä": "ae", "ö": "oe", "ü": "ue", "ß": "ss"}
    for k, v in repl.items():
        text = text.replace(k, v)
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return text.strip("-")

def read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return ""

def extract(pattern: str, text: str, flags=re.I | re.S) -> str:
    m = re.search(pattern, text, flags)
    return unescape(m.group(1).strip()) if m else ""

def iso_from_mtime(path: Path) -> str:
    return datetime.utcfromtimestamp(path.stat().st_mtime).isoformat() + "Z"

def rel_url(path: Path) -> str:
    rel = path.as_posix().lstrip("./")
    return f"https://perfektsauberservice.com/{rel}"

def should_include(path: Path) -> bool:
    rel = path.relative_to(ROOT).as_posix()
    parts = rel.split("/")
    if any(p in EXCLUDE_DIR_PREFIXES for p in parts[:-1]):
        return False
    name = path.name
    if name in EXCLUDE_FILES or name.startswith("_") or not name.endswith(".html"):
        return False
    # Only include actual blog articles from blog/ folder — service pages stay out
    if parts[0] == "blog":
        return True
    return False

def city_from_slug(slug: str) -> str:
    for frag, city in CITY_FRAGMENTS:
        if frag in slug:
            return city
    return ""

def service_from_slug(slug: str) -> str:
    for frag, service in SERVICE_FRAGMENTS:
        if frag in slug:
            return service
    return ""

def intro_from_html(text: str) -> str:
    paras = re.findall(r"<p[^>]*>(.*?)</p>", text, re.I | re.S)
    for p in paras:
        clean = re.sub(r"<[^>]+>", " ", p)
        clean = re.sub(r"\s+", " ", clean).strip()
        if len(clean) > 120:
            return clean[:320].strip()
    body = re.sub(r"<script.*?</script>|<style.*?</style>", " ", text, flags=re.I | re.S)
    body = re.sub(r"<[^>]+>", " ", body)
    body = re.sub(r"\s+", " ", body).strip()
    return body[:320].strip()

def build_item(path: Path) -> dict:
    text = read_text(path)
    slug = path.stem
    title = extract(r"<title>(.*?)</title>", text) or slug.replace("-", " ").title()
    meta_desc = extract(r'<meta[^>]+name=["\']description["\'][^>]+content=["\'](.*?)["\']', text)
    canonical = extract(r'<link[^>]+rel=["\']canonical["\'][^>]+href=["\'](.*?)["\']', text)
    intro = intro_from_html(text)
    city = city_from_slug(slug)
    city_slug = slugify(city) if city else ""
    service = service_from_slug(slug)
    service_slug = slugify(service) if service else ""

    return {
        "slug": slug,
        "title": title.split("|")[0].strip(),
        "seoTitle": title,
        "metaDescription": meta_desc,
        "intro": intro,
        "city": city,
        "citySlug": city_slug,
        "service": service,
        "serviceSlug": service_slug,
        "topic": title.split("|")[0].strip(),
        "image": "",
        "publishedAt": iso_from_mtime(path),
        "url": canonical or rel_url(path),
        "htmlPath": path.relative_to(ROOT).as_posix(),
    }

def sort_key_natural(path: Path):
    name = path.stem
    m = re.search(r"(\d+)$", name)
    return int(m.group(1)) if m else 999999

def available_images_for_city(city_slug: str):
    if not city_slug or not LOCATION_IMAGES_DIR.exists():
        return []
    exts = {".jpg", ".jpeg", ".png", ".webp"}
    candidates = []
    for p in LOCATION_IMAGES_DIR.iterdir():
        if p.is_file() and p.suffix.lower() in exts and p.name.lower().startswith(city_slug.lower() + "-"):
            candidates.append(p)
    candidates.sort(key=sort_key_natural)
    return [f"/public/images/locations/{p.name}" for p in candidates]

def assign_rotating_images(items):
    grouped = {}
    for item in items:
        city_slug = item.get("citySlug") or ""
        grouped.setdefault(city_slug, []).append(item)

    for city_slug, city_items in grouped.items():
        images = available_images_for_city(city_slug)
        if not images:
            continue
        city_items.sort(key=lambda x: x.get("publishedAt", ""))
        for idx, item in enumerate(city_items):
            item["image"] = images[idx % len(images)]

def main():
    items = []
    for path in ROOT.rglob("*.html"):
        if should_include(path):
            items.append(build_item(path))

    assign_rotating_images(items)
    items.sort(key=lambda x: x["publishedAt"], reverse=True)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "updatedAt": datetime.utcnow().isoformat() + "Z",
        "items": items,
    }
    OUT.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Rebuilt blog index: {OUT} with {len(items)} items")

if __name__ == "__main__":
    main()
