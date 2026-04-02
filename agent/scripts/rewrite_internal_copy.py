import json
import os
import re
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Any, Optional

ROOT = Path(".")

AUDIT_PATH = ROOT / "agent" / "state" / "copy-audit-report.json"
OUT = ROOT / "agent" / "state" / "copy-rewrite-report.json"

# Modes:
# - full-site   -> scan all relevant files
# - audit-only  -> scan only files from copy-audit-report.json
# - single-file -> scan one explicit file
MODE = os.getenv("REWRITE_MODE", "full-site").strip().lower()
DRY_RUN = os.getenv("DRY_RUN", "true").strip().lower() == "true"
TARGET_FILE = os.getenv("TARGET_FILE", "").strip()

ALLOWED_EXTENSIONS = {
    ".html", ".astro", ".tsx", ".jsx", ".js", ".ts", ".md", ".mdx", ".vue"
}

# Keep only technical folders excluded.
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
}

# Customer-facing exact replacements
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

# Broader suspicious patterns for flagging lines that may still sound internal / SEO-planning-like.
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
    r"\bSEO\b",
    r"\bKeyword\b",
    r"\bCTA\b",
    r"\bContent-Strategie\b",
    r"\blokale Seiten bauen\b",
    r"\bVorher/Nachher Beispiele für Vertrauen\b",
]

# Avoid rewriting obvious technical lines.
TECHNICAL_LINE_PATTERNS = [
    r"^\s*import\s+",
    r"^\s*export\s+",
    r"^\s*const\s+",
    r"^\s*let\s+",
    r"^\s*var\s+",
    r"^\s*function\s+",
    r"^\s*class\s+",
    r"^\s*return\s+",
    r"^\s*</?[A-Za-z][^>]*>\s*$",   # pure html tag line
    r"https?://",
    r"href\s*=",
    r"src\s*=",
    r"class(Name)?\s*=",
    r"id\s*=",
    r"schema\.org",
]

def utc_now() -> str:
    return datetime.utcnow().isoformat() + "Z"

def should_scan(path: Path) -> bool:
    if not path.is_file():
        return False
    if path.suffix.lower() not in ALLOWED_EXTENSIONS:
        return False
    parts = set(path.parts)
    if parts & EXCLUDE_DIRS:
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

def is_technical_line(line: str) -> bool:
    stripped = line.strip()
    if not stripped:
        return True
    for pattern in TECHNICAL_LINE_PATTERNS:
        if re.search(pattern, stripped, flags=re.I):
            return True
    return False

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

    # Exact replacements
    for pattern, replacement in REPLACEMENTS:
        new_updated, count = re.subn(pattern, replacement, updated, flags=re.I)
        if count > 0:
            result["replacements"].append({
                "pattern": pattern,
                "replacement": replacement,
                "count": count,
            })
            updated = new_updated

    # Suspicious patterns remaining after replacement
    for pattern in SUSPICIOUS_PATTERNS:
        if re.search(pattern, updated, flags=re.I):
            result["flags"].append({
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

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8")

    print(
        f"Rewrite scan complete | mode={MODE} | dry_run={DRY_RUN} | "
        f"files_scanned={summary['filesScanned']} | files_updated={summary['filesUpdated']} | "
        f"lines_scanned={summary['linesScanned']} | lines_changed={summary['linesChanged']} | "
        f"flagged_lines={summary['flaggedLines']}"
    )

if __name__ == "__main__":
    main()
