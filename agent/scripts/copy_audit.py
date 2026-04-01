import json
import re
from pathlib import Path
from datetime import datetime

ROOT = Path(".")
OUT = ROOT / "agent" / "state" / "copy-audit-report.json"

FORBIDDEN_PATTERNS = [
    r"direkt sichtbar",
    r"eingebunden",
    r"im Fokus",
    r"\b1 Ziel\b",
    r"\b2 Beispiele\b",
    r"klar und sofort verständlich",
    r"können wir danach bauen",
    r"trust examples",
    r"core services",
    r"planning notes",
    r"project notes",
    r"wireframe text"
]

EXCLUDE_DIRS = {".git", ".github", "agent", "dashboard", "netlify", "content"}

def should_scan(path: Path) -> bool:
    rel = path.as_posix()
    if not rel.endswith(".html"):
        return False
    parts = set(path.parts)
    return not bool(parts & EXCLUDE_DIRS)

def snippet(text: str, start: int, end: int, radius: int = 90) -> str:
    a = max(0, start - radius)
    b = min(len(text), end + radius)
    return re.sub(r"\s+", " ", text[a:b]).strip()

def main():
    results = []
    files_scanned = 0

    for path in ROOT.rglob("*.html"):
        if not should_scan(path):
            continue
        files_scanned += 1
        text = path.read_text(encoding="utf-8", errors="ignore")
        hits = []
        for pattern in FORBIDDEN_PATTERNS:
            for m in re.finditer(pattern, text, flags=re.I):
                hits.append({
                    "pattern": pattern,
                    "match": m.group(0),
                    "snippet": snippet(text, m.start(), m.end())
                })
        if hits:
            results.append({
                "file": path.as_posix(),
                "issuesCount": len(hits),
                "issues": hits
            })

    payload = {
        "generatedAt": datetime.utcnow().isoformat() + "Z",
        "filesScanned": files_scanned,
        "filesWithIssues": len(results),
        "results": results
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Audit complete: scanned {files_scanned} files, found issues in {len(results)} files")
