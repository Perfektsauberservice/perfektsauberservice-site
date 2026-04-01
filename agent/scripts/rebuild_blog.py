
import json
import re
from pathlib import Path
from datetime import datetime
from html import unescape

ROOT = Path(".")
OUT = ROOT / "content" / "auto" / "blog-index.json"

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
    if name in EXCLUDE_FILES:
        return False
    if name.startswith("_"):
        return False
    if not name.endswith(".html"):
        return False
    # include blog/, auto/, and root-level local/seo pages
    if parts[0] in {"blog", "auto"}:
        return True
    if len(parts) == 1:
        # root-level pages that are likely SEO/article pages
        if re.match(r"^(entruempelung|haushaltsaufloesung|wohnungsaufloesung|kellerentruempelung|gewerbe|was-|wie-).+\.html$", name):
            return True
    return False

def city_from_slug(slug: str) -> str:
    known = [
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
    for frag, city in known:
        if frag in slug:
            return city
    return ""

def service_from_slug(slug: str) -> str:
    mapping = [
        ("entruempelung", "Entrümpelung"),
        ("haushaltsaufloesung", "Haushaltsauflösung"),
        ("wohnungsaufloesung", "Wohnungsauflösung"),
        ("kellerentruempelung", "Kellerentrümpelung"),
    ]
    for frag, service in mapping:
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
    og_image = extract(r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\'](.*?)["\']', text)
    intro = intro_from_html(text)
    city = city_from_slug(slug)
    service = service_from_slug(slug)
    item = {
        "slug": slug,
        "title": title.split("|")[0].strip(),
        "seoTitle": title,
        "metaDescription": meta_desc,
        "intro": intro,
        "city": city,
        "citySlug": slug if city and slug.endswith(city.lower().replace("ü","ue").replace("ö","oe").replace("ä","ae").replace("ß","ss")) else city.lower().replace(" ", "-") if city else "",
        "service": service,
        "serviceSlug": service.lower().replace("ü","ue").replace("ö","oe").replace("ä","ae").replace("ß","ss") if service else "",
        "topic": title.split("|")[0].strip(),
        "image": og_image,
        "publishedAt": iso_from_mtime(path),
        "url": canonical or rel_url(path),
        "htmlPath": path.relative_to(ROOT).as_posix(),
    }
    return item

def main():
    items = []
    for path in ROOT.rglob("*.html"):
        if should_include(path):
            items.append(build_item(path))
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
