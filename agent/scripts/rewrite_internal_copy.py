import json
import re
from pathlib import Path
from datetime import datetime

ROOT = Path(".")
AUDIT_PATH = ROOT / "agent" / "state" / "copy-audit-report.json"
OUT = ROOT / "agent" / "state" / "copy-rewrite-report.json"

EXCLUDE_DIRS = {".git", ".github", "agent", "dashboard", "netlify", "content"}

# Exact customer-facing replacements for internal-sounding phrases
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
        r"direkt\s+sichtbar",
        "schnell erreichbar"
    ),
    (
        r"im\s+Fokus",
        "besonders häufig im Einsatz"
    ),
    (
        r"klar\s+und\s+sofort\s+verständlich",
        "klar und übersichtlich"
    )
]

def should_scan(path: Path) -> bool:
    rel = path.as_posix()
    if not rel.endswith(".html"):
        return False
    parts = set(path.parts)
    return not bool(parts & EXCLUDE_DIRS)

def load_audit_targets():
    if not AUDIT_PATH.exists():
        return None
    try:
        data = json.loads(AUDIT_PATH.read_text(encoding="utf-8"))
        targets = {item["file"] for item in data.get("results", []) if item.get("file")}
        return targets
    except Exception:
        return None

def main():
    targets = load_audit_targets()
    files_checked = 0
    files_updated = 0
    changes = []

    for path in ROOT.rglob("*.html"):
        if not should_scan(path):
            continue

        rel = path.as_posix()
        if targets is not None and rel not in targets:
            continue

        files_checked += 1
        original = path.read_text(encoding="utf-8", errors="ignore")
        updated = original
        file_changes = []

        for pattern, replacement in REPLACEMENTS:
            new_updated, count = re.subn(pattern, replacement, updated, flags=re.I)
            if count > 0:
                updated = new_updated
                file_changes.append({
                    "pattern": pattern,
                    "replacement": replacement,
                    "count": count
                })

        if updated != original:
            path.write_text(updated, encoding="utf-8")
            files_updated += 1
            changes.append({
                "file": rel,
                "changes": file_changes
            })

    payload = {
        "generatedAt": datetime.utcnow().isoformat() + "Z",
        "filesChecked": files_checked,
        "filesUpdated": files_updated,
        "changes": changes
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Rewrite complete: checked {files_checked} files, updated {files_updated} files")

if __name__ == "__main__":
    main()
