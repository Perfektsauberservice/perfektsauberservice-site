import json
import os
import re
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Any, Optional

ROOT = Path(".")

AUDIT_PATH = ROOT / "agent" / "state" / "copy-audit-report.json"
OUT = ROOT / "agent" / "state" / "copy-rewrite-report.json"

MODE = os.getenv("REWRITE_MODE", "full-site").strip().lower()
DRY_RUN = os.getenv("DRY_RUN", "true").strip().lower() == "true"
TARGET_FILE = os.getenv("TARGET_FILE", "").strip()

ALLOWED_EXTENSIONS = {
    ".html", ".astro", ".tsx", ".jsx", ".md", ".mdx", ".vue"
}

EXCLUDE_DIRS = {
    ".git",
    ".github",
    "node_modules",
    "dist",
    "build",
    ".netlify",
    ".vercel",
    "__pycache__",
    ".idea",
    ".vscode",
    "agent",
    "dashboard",
}

INCLUDE_DIRS = set()

MIN_PARAGRAPH_LENGTH = 90

SHORT_COPY_TAG_WHITELIST = {"p", "li", "blockquote"}
HEADING_TAGS = {"h1", "h2", "h3", "h4", "h5", "h6", "title"}

IGNORE_PAGE_PATTERNS = [
    r"(^|/)404\.html$",
    r"(^|/)410\.html$",
    r"(^|/)403\.html$",
    r"(^|/)500\.html$",
    r"(^|/)502\.html$",
    r"(^|/)503\.html$",
    r"/auto/",
    r"\btest\b",
    r"\bdraft\b",
    r"seite wurde entfernt",
    r"page removed",
    r"test-draft",
]

REPLACEMENTS = [
    (
        r"Telefon\s*&\s*WhatsApp\s+gut\s+sichtbar",
        "Schnelle Kontaktaufnahme per Telefon oder WhatsApp"
    ),
    (
        r"Städte\s+direkt\s+auf\s+der\s+Startseite\s+eingebunden",
        "Wir sind in Rastatt, Baden-Baden, Gaggenau und Karlsruhe für Sie im Einsatz"
    ),
    (
        r"Kernleistungen\s+klar\s+und\s+sofort\s+verständlich",
        "Unsere Leistungen auf einen Blick"
    ),
    (
        r"Reale\s+Vorher/Nachher\s+Beispiele\s+für\s+Vertrauen",
        "Vorher-und-Nachher-Beispiele zeigen, wie gründlich und zuverlässig wir arbeiten"
    ),
    (
        r"Ziel:\s*schnelle\s+und\s+einfache\s+Anfrage",
        "Schnelle und unkomplizierte Anfrage"
    ),
    (
        r"Diese\s+Städte\s+stehen\s+direkt\s+im\s+Fokus\.\s*Daraus\s+können\s+wir\s+danach\s+einzelne\s+lokale\s+Seiten\s+bauen\s+und\s+die\s+interne\s+Verlinkung\s+sauber\s+erweitern\.",
        "Wir unterstützen Kunden besonders häufig in Rastatt, Baden-Baden, Gaggenau und Karlsruhe."
    ),
    (
        r"\bdirekt\s+sichtbar\b",
        "schnell erreichbar"
    ),
    (
        r"\bim\s+Fokus\b",
        "besonders häufig im Einsatz"
    ),
    (
        r"klar\s+und\s+sofort\s+verständlich",
        "klar und übersichtlich"
    ),
]

SUSPICIOUS_PATTERNS = [
    r"\b\d+\s+Städte\b",
    r"\b\d+\s+Kernleistungen\b",
    r"\b\d+\s+Ziel\b",
    r"\bdirekt sichtbar\b",
    r"\bim Fokus\b",
    r"\bdaraus können wir\b",
    r"\binterne Verlinkung\b",
    r"\bStartseite eingebunden\b",
    r"\bgut sichtbar\b",
    r"\blokale Seiten bauen\b",
    r"\bVorher/Nachher Beispiele für Vertrauen\b",
]

WEAK_COPY_PATTERNS = [
    r"\bWir helfen Ihnen gerne\.?$",
    r"\bWir sind für Sie da\.?$",
    r"\bKontaktieren Sie uns\.?$",
    r"\bWir arbeiten schnell und zuverlässig\.?$",
    r"\bprofessionelle Lösungen\b",
    r"\bsauber,\s*diskret und zuverlässig\b",
    r"\bschnell,\s*sauber und zuverlässig\b",
    r"\bzuverlässig und professionell\b",
]

WEAK_CTA_PATTERNS = [
    r"^\s*Jetzt anfragen\s*$",
    r"^\s*Mehr erfahren\s*$",
    r"^\s*Hier klicken\s*$",
]

TRUST_SIGNALS = [
    r"\bkostenlose Besichtigung\b",
    r"\bkostenloses Angebot\b",
    r"\bunverbindlich\b",
    r"\bdiskret\b",
    r"\bnachhaltig\b",
    r"\bbesenrein\b",
    r"\bbesenreine Übergabe\b",
    r"\bkurzfristig\b",
    r"\bWhatsApp\b",
    r"\btransparente Preise\b",
    r"\btransparenter Preis\b",
]

TECHNICAL_LINE_PATTERNS = [
    r"^\s*import\s+",
    r"^\s*export\s+",
    r"^\s*const\s+",
    r"^\s*let\s+",
    r"^\s*var\s+",
    r"^\s*function\s+",
    r"^\s*class\s+",
    r"^\s*return\s+",
    r"https?://",
    r"href\s*=",
    r"src\s*=",
    r"class(Name)?\s*=",
    r"id\s*=",
    r"schema\.org",

    # CSS
    r"^\s*@media\s*\(",
    r"^\s*\.[A-Za-z0-9_-]+\s*\{",
    r"^\s*#[A-Za-z0-9_-]+\s*\{",
    r"^\s*[A-Za-z0-9_.#:\-\[\]=\"'\s,>]+\{",
    r"^\s*[A-Za-z-]+\s*:\s*[^;]+;\s*$",
    r"^\s*\}\s*$",

    # inline JS / DOM code
    r"window\.location",
    r"document\.getElementById\s*\(",
    r"addEventListener\s*\(",
    r"\.indexOf\s*\(",
    r"\.includes\s*\(",
    r"\.replace\s*\(",
    r"\.style\.[A-Za-z0-9_]+\s*=",
    r"^\s*[A-Za-z0-9_.$]+\s*=\s*.*;$",
    r"function\s*\(",
    r"^\s*if\s*\(",
    r"^\s*for\s*\(",
    r"^\s*while\s*\(",
    r"^\s*\}\s*\)\s*;?\s*$",
]

def utc_now() -> str:
    return datetime.utcnow().isoformat() + "Z"

def is_in_included_dir(path: Path) -> bool:
    if not INCLUDE_DIRS:
        return True
    return any(part in INCLUDE_DIRS for part in path.parts)

def should_scan(path: Path) -> bool:
    if not path.is_file():
        return False
    if path.suffix.lower() not in ALLOWED_EXTENSIONS:
        return False
    parts = set(path.parts)
    if parts & EXCLUDE_DIRS:
        return False
    if not is_in_included_dir(path):
        return False
    return True

def load_audit_targets() -> Optional[set]:
    if not AUDIT_PATH.exists():
        return None
    try:
        data = json.loads(AUDIT_PATH.read_text(encoding="utf-8"))
        results = data.get("results", [])
        targets = {
            item["file"] for item in results
            if isinstance(item, dict) and item.get("file")
        }
        return targets or set()
    except Exception:
        return None

def strip_html(line: str) -> str:
    return re.sub(r"<[^>]+>", "", line).strip()

def extract_tag_name(line: str) -> Optional[str]:
    match = re.match(r"^\s*<\s*([a-zA-Z0-9]+)", line.strip())
    if match:
        return match.group(1).lower()
    return None

def should_ignore_page(rel: str, content: str) -> bool:
    haystack = f"{rel}\n{content}".lower()
    for pattern in IGNORE_PAGE_PATTERNS:
        if re.search(pattern, haystack, flags=re.I):
            return True
    return False

def is_technical_line(line: str) -> bool:
    stripped = line.strip()
    if not stripped:
        return True

    tag = extract_tag_name(stripped)
    if tag in {"script", "style"}:
        return True

    # inline CSS / media queries / compact style blocks
    if stripped.startswith("@media"):
        return True
    if "{" in stripped and "}" in stripped and ":" in stripped and ";" in stripped:
        return True

    # inline JS / DOM / helpers / conditions
    js_markers = [
        "window.location",
        "document.getElementById",
        "addEventListener(",
        ".indexOf(",
        ".includes(",
        ".replace(",
        ".style.",
        "function(",
        "function (",
        "=>",
        "&&",
        "||",
    ]
    if any(marker in stripped for marker in js_markers):
        return True

    for pattern in TECHNICAL_LINE_PATTERNS:
        if re.search(pattern, stripped, flags=re.I):
            return True

    return False

def looks_like_customer_text(line: str) -> bool:
    stripped = line.strip()
    if not stripped:
        return False
    if is_technical_line(stripped):
        return False

    text_only = strip_html(stripped)
    if not text_only:
        return False

    letter_count = len(re.findall(r"[A-Za-zÄÖÜäöüß]", text_only))
    return letter_count >= 18

def is_short_copy_candidate(line: str) -> bool:
    stripped = line.strip()
    if not stripped:
        return False

    tag = extract_tag_name(stripped)

    if tag in HEADING_TAGS:
        return False

    if tag is not None and tag not in SHORT_COPY_TAG_WHITELIST:
        return False

    text_only = strip_html(stripped)
    if not text_only:
        return False

    if len(re.findall(r"[A-Za-zÄÖÜäöüß]", text_only)) < 25:
        return False

    return True

def scan_and_rewrite_line(line: str) -> Dict[str, Any]:
    result = {
        "original": line,
        "updated": line,
        "replacements": [],
        "flags": [],
        "changed": False,
    }

    if is_technical_line(line):
        return result

    updated = line
    stripped = line.strip()

    for pattern, replacement in REPLACEMENTS:
        new_updated, count = re.subn(pattern, replacement, updated, flags=re.I)
        if count > 0:
            result["replacements"].append({
                "pattern": pattern,
                "replacement": replacement,
                "count": count,
            })
            updated = new_updated

    for pattern in SUSPICIOUS_PATTERNS:
        if re.search(pattern, updated, flags=re.I):
            result["flags"].append({
                "type": "internal_copy",
                "pattern": pattern,
                "status": "flagged_for_manual_review",
            })

    if looks_like_customer_text(stripped):
        text_only = strip_html(stripped)

        if is_short_copy_candidate(stripped) and 0 < len(text_only) < MIN_PARAGRAPH_LENGTH:
            result["flags"].append({
                "type": "short_copy",
                "pattern": f"length_lt_{MIN_PARAGRAPH_LENGTH}",
                "status": "flagged_for_manual_review",
            })

        for pattern in WEAK_COPY_PATTERNS:
            if re.search(pattern, text_only, flags=re.I):
                result["flags"].append({
                    "type": "weak_generic_copy",
                    "pattern": pattern,
                    "status": "flagged_for_manual_review",
                })

        for pattern in WEAK_CTA_PATTERNS:
            if re.search(pattern, text_only, flags=re.I):
                result["flags"].append({
                    "type": "weak_cta",
                    "pattern": pattern,
                    "status": "flagged_for_manual_review",
                })

    result["updated"] = updated
    result["changed"] = updated != line
    return result

def get_target_files() -> List[Path]:
    if MODE == "single-file":
        if not TARGET_FILE:
            raise ValueError("REWRITE_MODE=single-file requires TARGET_FILE")
        target = ROOT / TARGET_FILE
        if not target.exists():
            raise FileNotFoundError(f"TARGET_FILE not found: {TARGET_FILE}")
        if not should_scan(target):
            raise ValueError(f"TARGET_FILE is not eligible for scanning: {TARGET_FILE}")
        return [target]

    audit_targets = load_audit_targets() if MODE == "audit-only" else None

    files = []
    for path in ROOT.rglob("*"):
        if not should_scan(path):
            continue
        rel = path.as_posix()
        if MODE == "audit-only" and audit_targets is not None and rel not in audit_targets:
            continue
        files.append(path)

    return sorted(files)

def analyze_page_quality(rel: str, lines: List[str]) -> Dict[str, Any]:
    full_content = "".join(lines)

    if should_ignore_page(rel, full_content):
        return {
            "file": rel,
            "wordCount": 0,
            "shortCopyHits": 0,
            "weakCopyHits": 0,
            "weakCtaHits": 0,
            "trustSignalHits": 0,
            "score": 100,
            "rating": "ignored",
            "pageFlags": ["ignored_page"],
        }

    visible_lines = []
    weak_copy_hits = 0
    weak_cta_hits = 0
    short_copy_hits = 0
    trust_signal_hits = 0

    for line in lines:
        if not looks_like_customer_text(line):
            continue

        text_only = strip_html(line)
        if not text_only:
            continue

        visible_lines.append(text_only)

        if is_short_copy_candidate(line) and len(text_only) < MIN_PARAGRAPH_LENGTH:
            short_copy_hits += 1

        for pattern in WEAK_COPY_PATTERNS:
            if re.search(pattern, text_only, flags=re.I):
                weak_copy_hits += 1
                break

        for pattern in WEAK_CTA_PATTERNS:
            if re.search(pattern, text_only, flags=re.I):
                weak_cta_hits += 1
                break

        for pattern in TRUST_SIGNALS:
            if re.search(pattern, text_only, flags=re.I):
                trust_signal_hits += 1

    word_count = len(re.findall(r"\b\w+\b", " ".join(visible_lines), flags=re.UNICODE))
    score = 100

    if word_count < 250:
        score -= 25
    if short_copy_hits >= 3:
        score -= 15
    if weak_copy_hits >= 2:
        score -= 15
    if weak_cta_hits >= 1:
        score -= 10
    if trust_signal_hits == 0:
        score -= 20
    elif trust_signal_hits == 1:
        score -= 10

    if score >= 85:
        rating = "good"
    elif score >= 65:
        rating = "needs_improvement"
    else:
        rating = "weak"

    page_flags = []
    if word_count < 250:
        page_flags.append("page_too_thin")
    if short_copy_hits >= 3:
        page_flags.append("too_many_short_sections")
    if weak_copy_hits >= 2:
        page_flags.append("too_much_generic_copy")
    if weak_cta_hits >= 1:
        page_flags.append("weak_cta_present")
    if trust_signal_hits == 0:
        page_flags.append("missing_trust_signals")

    return {
        "file": rel,
        "wordCount": word_count,
        "shortCopyHits": short_copy_hits,
        "weakCopyHits": weak_copy_hits,
        "weakCtaHits": weak_cta_hits,
        "trustSignalHits": trust_signal_hits,
        "score": max(score, 0),
        "rating": rating,
        "pageFlags": page_flags,
    }

def main() -> None:
    files = get_target_files()

    summary = {
        "generatedAt": utc_now(),
        "mode": MODE,
        "dryRun": DRY_RUN,
        "targetFile": TARGET_FILE or None,
        "filesScanned": 0,
        "filesUpdated": 0,
        "linesScanned": 0,
        "linesChanged": 0,
        "flaggedLines": 0,
        "skippedFiles": [],
        "changes": [],
        "pageQuality": [],
    }

    for path in files:
        rel = path.as_posix()
        try:
            content = path.read_text(encoding="utf-8", errors="ignore")
        except Exception as e:
            summary["skippedFiles"].append({
                "file": rel,
                "reason": f"read_error: {str(e)}"
            })
            continue

        if should_ignore_page(rel, content):
            summary["filesScanned"] += 1
            summary["pageQuality"].append({
                "file": rel,
                "wordCount": 0,
                "shortCopyHits": 0,
                "weakCopyHits": 0,
                "weakCtaHits": 0,
                "trustSignalHits": 0,
                "score": 100,
                "rating": "ignored",
                "pageFlags": ["ignored_page"],
            })
            continue

        lines = content.splitlines(keepends=True)
        updated_lines = []
        file_changes = []
        file_changed = False

        summary["filesScanned"] += 1

        for idx, line in enumerate(lines, start=1):
            summary["linesScanned"] += 1
            outcome = scan_and_rewrite_line(line)

            if outcome["changed"]:
                file_changed = True
                summary["linesChanged"] += 1

            if outcome["flags"]:
                summary["flaggedLines"] += 1

            if outcome["changed"] or outcome["flags"]:
                file_changes.append({
                    "line": idx,
                    "original": outcome["original"].rstrip("\n"),
                    "updated": outcome["updated"].rstrip("\n"),
                    "changed": outcome["changed"],
                    "replacements": outcome["replacements"],
                    "flags": outcome["flags"],
                })

            updated_lines.append(outcome["updated"])

        page_quality = analyze_page_quality(rel, lines)
        summary["pageQuality"].append(page_quality)

        if file_changed:
            summary["filesUpdated"] += 1
            if not DRY_RUN:
                path.write_text("".join(updated_lines), encoding="utf-8")

        if file_changes:
            summary["changes"].append({
                "file": rel,
                "changed": file_changed,
                "issues": file_changes,
            })

    summary["pageQuality"] = sorted(
        summary["pageQuality"],
        key=lambda x: (0 if x["rating"] != "ignored" else 1, x["score"], x["wordCount"])
    )

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8")

    print(
        f"Rewrite scan complete | mode={MODE} | dry_run={DRY_RUN} | "
        f"files_scanned={summary['filesScanned']} | files_updated={summary['filesUpdated']} | "
        f"lines_scanned={summary['linesScanned']} | lines_changed={summary['linesChanged']} | "
        f"flagged_lines={summary['flaggedLines']} | page_quality_scored={len(summary['pageQuality'])}"
    )

if __name__ == "__main__":
    main()
