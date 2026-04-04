import json
import re
from pathlib import Path
from difflib import SequenceMatcher


ROOT = Path(__file__).resolve().parents[2]
AGENT_DIR = ROOT / "agent"
CONFIG_DIR = AGENT_DIR / "config"
PROMPTS_DIR = AGENT_DIR / "prompts"
STATE_DIR = AGENT_DIR / "state"


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def read_json(path: Path):
    return json.loads(read_text(path))


def write_json(path: Path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def strip_html(html: str) -> str:
    html = re.sub(r"<script.*?</script>", " ", html, flags=re.DOTALL | re.IGNORECASE)
    html = re.sub(r"<style.*?</style>", " ", html, flags=re.DOTALL | re.IGNORECASE)
    html = re.sub(r"<[^>]+>", " ", html)
    html = re.sub(r"\s+", " ", html)
    return html.strip()


def normalize_text(text: str, city_names: list[str]) -> str:
    text = text.lower()
    for city in city_names:
        text = re.sub(re.escape(city.lower()), " ", text)

    boilerplate = [
        "kostenlose besichtigung",
        "unverbindliche einschätzung",
        "besenrein",
        "perfekt sauber service",
        "whatsapp",
        "kontakt",
        "preisrechner",
        "leistungen",
        "entrümpelung",
    ]
    for phrase in boilerplate:
        text = text.replace(phrase, " ")

    text = re.sub(r"\s+", " ", text).strip()
    return text


def similarity(a: str, b: str) -> int:
    return round(SequenceMatcher(None, a, b).ratio() * 100)


def extract_h2(html: str) -> list[str]:
    return re.findall(r"<h2[^>]*>(.*?)</h2>", html, flags=re.IGNORECASE | re.DOTALL)


def extract_faq_block(html: str) -> str:
    h3s = re.findall(
        r"<h3[^>]*>(.*?)</h3>\s*<p[^>]*>(.*?)</p>",
        html,
        flags=re.IGNORECASE | re.DOTALL,
    )
    return " ".join([f"{q} {a}" for q, a in h3s]).strip()


def extract_cta_block(html: str) -> str:
    match = re.search(
        r'<section class="section" id="kontakt" style="margin-top:20px">.*?</section>',
        html,
        flags=re.IGNORECASE | re.DOTALL,
    )
    if not match:
        return ""

    cta_html = match.group(0)

    cta_text = re.sub(
        r'<a [^>]*>(.*?)</a>',
        r" \1 ",
        cta_html,
        flags=re.IGNORECASE | re.DOTALL,
    )
    cta_text = re.sub(r"<[^>]+>", " ", cta_text)
    cta_text = re.sub(r"\s+", " ", cta_text).strip()

    common = [
        "whatsapp",
        "kontaktformular",
        "kontakt",
        "preisrechner",
        "leistungen",
        "einsatzgebiete",
        "anfrage",
        "entrümpelung",
    ]

    text = cta_text.lower()
    for phrase in common:
        text = text.replace(phrase, " ")

    text = re.sub(r"\s+", " ", text).strip()
    return text


def detect_problem_blocks(overall, structure_sim, faq_sim, cta_sim, thresholds):
    problems = []
    targets = []

    if overall >= thresholds["warn_if"]["overall_similarity_gte"]:
        problems.append("Overall similarity too high")
        targets.append("body")

    if structure_sim >= thresholds["warn_if"]["structure_similarity_gte"]:
        problems.append("Structure too similar")
        targets.append("section_order")

    if faq_sim >= thresholds["warn_if"]["faq_similarity_gte"]:
        problems.append("FAQ too similar")
        targets.append("faq")

    if cta_sim >= thresholds["warn_if"]["cta_similarity_gte"]:
        problems.append("CTA too similar")
        targets.append("cta")

    return list(dict.fromkeys(problems)), list(dict.fromkeys(targets))


def score_risk(overall: int, thresholds: dict) -> str:
    if overall >= thresholds["red_min"]:
        return "high"
    if overall > thresholds["yellow_max"]:
        return "medium"
    return "low"


def compare_page(target_file: Path, compare_files: list[Path], cities: list[str], thresholds: dict):
    target_html = read_text(target_file)
    target_plain = strip_html(target_html)
    target_norm = normalize_text(target_plain, cities)
    target_h2 = " | ".join(extract_h2(target_html))
    target_faq = extract_faq_block(target_html)
    target_cta = extract_cta_block(target_html)

    matches = []

    for other in compare_files:
        if other == target_file:
            continue

        other_html = read_text(other)
        other_plain = strip_html(other_html)
        other_norm = normalize_text(other_plain, cities)
        other_h2 = " | ".join(extract_h2(other_html))
        other_faq = extract_faq_block(other_html)
        other_cta = extract_cta_block(other_html)

        raw_sim = similarity(target_plain, other_plain)
        norm_sim = similarity(target_norm, other_norm)
        structure_sim = similarity(target_h2, other_h2)
        faq_sim = similarity(target_faq, other_faq)
        cta_sim = similarity(target_cta, other_cta)

        overall = round(
            (raw_sim * 0.25)
            + (norm_sim * 0.30)
            + (structure_sim * 0.20)
            + (faq_sim * 0.15)
            + (cta_sim * 0.10)
        )

        matches.append(
            {
                "file": other.name,
                "raw_similarity": raw_sim,
                "normalized_similarity": norm_sim,
                "structure_similarity": structure_sim,
                "faq_similarity": faq_sim,
                "cta_similarity": cta_sim,
                "overall_similarity": overall,
            }
        )

    matches.sort(key=lambda x: x["overall_similarity"], reverse=True)
    top = matches[:5]

    if top:
        worst = top[0]
        problems, targets = detect_problem_blocks(
            worst["overall_similarity"],
            worst["structure_similarity"],
            worst["faq_similarity"],
            worst["cta_similarity"],
            thresholds,
        )
        report = {
            "page": target_file.name,
            "overall_similarity": worst["overall_similarity"],
            "risk": score_risk(worst["overall_similarity"], thresholds),
            "closest_matches": [
                {"file": m["file"], "similarity": m["overall_similarity"]}
                for m in top
            ],
            "block_similarity": {
                "hero": worst["raw_similarity"],
                "structure": worst["structure_similarity"],
                "faq": worst["faq_similarity"],
                "cta": worst["cta_similarity"],
            },
            "problems": problems,
            "rewrite_targets": targets,
        }
    else:
        report = {
            "page": target_file.name,
            "overall_similarity": 0,
            "risk": "low",
            "closest_matches": [],
            "block_similarity": {
                "hero": 0,
                "structure": 0,
                "faq": 0,
                "cta": 0,
            },
            "problems": [],
            "rewrite_targets": [],
        }

    return report


def publish_guard(report: dict, html_file: Path, thresholds: dict):
    html = read_text(html_file)

    reasons = []
    fixes = []

    missing_critical = False

    if "<title>" not in html:
        reasons.append("Missing title")
        fixes.append("Add title")
        missing_critical = True

    if 'meta name="description"' not in html:
        reasons.append("Missing meta description")
        fixes.append("Add meta description")
        missing_critical = True

    if 'rel="canonical"' not in html:
        reasons.append("Missing canonical")
        fixes.append("Add canonical")
        missing_critical = True

    if "<h1" not in html:
        reasons.append("Missing h1")
        fixes.append("Add h1")
        missing_critical = True

    h2_count = len(re.findall(r"<h2[^>]*>", html, flags=re.IGNORECASE))
    if h2_count < 6:
        reasons.append("Too few sections")
        fixes.append("Add more useful sections")

    link_count = len(re.findall(r'href="([^"]+)"', html))
    if link_count < 3:
        reasons.append("Too few internal links")
        fixes.append("Add at least 3 internal links")

    faq_count = len(re.findall(r"<h3[^>]*>", html, flags=re.IGNORECASE))
    if faq_count < 2:
        reasons.append("FAQ too weak")
        fixes.append("Expand FAQ")

    overall_block = thresholds["block_if"]["overall_similarity_gte"]
    structure_block = thresholds["block_if"]["structure_similarity_gte"]
    faq_block = thresholds["block_if"]["faq_similarity_gte"]
    cta_block = thresholds["block_if"]["cta_similarity_gte"]

    if report["overall_similarity"] >= overall_block:
        reasons.append("Overall similarity too high")
        fixes.append("Rewrite body")

    if report["block_similarity"]["structure"] >= structure_block:
        reasons.append("Structure similarity too high")
        fixes.append("Change section order")

    if report["block_similarity"]["faq"] >= faq_block:
        reasons.append("FAQ similarity too high")
        fixes.append("Rewrite FAQ")

    if report["block_similarity"]["cta"] >= cta_block:
        reasons.append("CTA similarity too high")
        fixes.append("Rewrite CTA")

    hard_duplicate_problem = (
        report["overall_similarity"] >= overall_block
        or report["block_similarity"]["structure"] >= structure_block
        or report["block_similarity"]["faq"] >= faq_block
    )

    cta_only_problem = (
        report["block_similarity"]["cta"] >= cta_block
        and report["overall_similarity"] < overall_block
        and report["block_similarity"]["structure"] < structure_block
        and report["block_similarity"]["faq"] < faq_block
    )

    if missing_critical or hard_duplicate_problem:
        status = "BLOCK"
    elif cta_only_problem or reasons:
        status = "REVIEW"
    else:
        status = "PASS"

    if status == "PASS":
        summary = "Page passed guard."
    elif status == "REVIEW":
        summary = "Page needs review but is not critically blocked."
    else:
        summary = "Page blocked for review."

    return {
        "page": html_file.name,
        "status": status,
        "reasons": reasons,
        "required_fixes": list(dict.fromkeys(fixes)),
        "summary": summary,
    }


def main():
    thresholds = read_json(CONFIG_DIR / "duplicate-thresholds.json")
    cities_json = read_json(CONFIG_DIR / "cities.json")
    city_names = [
        c["slug"].replace("-", " ") if isinstance(c, dict) and "slug" in c else str(c)
        for c in cities_json
    ]

    target_name = input("Enter target HTML file name: ").strip()
    target_file = ROOT / target_name

    if not target_file.exists():
        print(f"File not found: {target_file}")
        return

    compare_files = list(ROOT.glob("entruempelung-*.html"))

    similarity_report = compare_page(target_file, compare_files, city_names, thresholds)
    write_json(STATE_DIR / "page-similarity-report.json", similarity_report)

    guard_report = publish_guard(similarity_report, target_file, thresholds)
    write_json(STATE_DIR / "publish-guard-report.json", guard_report)

    print("\n=== SIMILARITY REPORT ===")
    print(json.dumps(similarity_report, ensure_ascii=False, indent=2))

    print("\n=== PUBLISH GUARD REPORT ===")
    print(json.dumps(guard_report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
