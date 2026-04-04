import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
AGENT_DIR = ROOT / "agent"
STATE_DIR = AGENT_DIR / "state"


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def write_text(path: Path, content: str):
    path.write_text(content, encoding="utf-8")


def write_json(path: Path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(data, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def replace_section_order(html: str) -> str:
    sections = re.findall(
        r'(<section class="section">.*?</section>)',
        html,
        flags=re.DOTALL,
    )
    if len(sections) < 6:
        return html

    new_order = [
        sections[2] if len(sections) > 2 else sections[0],
        sections[0],
        sections[4] if len(sections) > 4 else sections[1],
        sections[1],
        sections[3] if len(sections) > 3 else sections[-1],
        sections[5] if len(sections) > 5 else sections[-1],
    ]

    grid_match = re.search(
        r'(<div class="grid">)(.*?)(</div>\s*<section class="section")',
        html,
        flags=re.DOTALL,
    )
    if not grid_match:
        return html

    new_grid = (
        '<div class="grid">\n'
        + "\n\n".join(new_order[:6])
        + '\n  </div>\n\n  <section class="section"'
    )

    html = re.sub(
        r'<div class="grid">.*?</div>\s*<section class="section"',
        new_grid,
        html,
        count=1,
        flags=re.DOTALL,
    )
    return html


def rewrite_faq(html: str, file_name: str) -> str:
    city = (
        file_name.replace("entruempelung-", "")
        .replace(".html", "")
        .replace("-", " ")
        .title()
    )

    new_faq = f"""
  <section class="section" style="margin-top:20px">
    <h2>Häufige Fragen zur Entrümpelung in {city}</h2>

    <h3>Kann ich vorab Fotos schicken?</h3>
    <p>Ja, Fotos per WhatsApp helfen sehr bei der ersten Einschätzung von Aufwand, Zugang und Umfang.</p>

    <h3>Räumen Sie auch mehrere Bereiche auf einmal?</h3>
    <p>Ja, auf Wunsch können Wohnungen, Keller, Garagen, Dachböden und weitere Nebenräume in einem Einsatz kombiniert werden.</p>

    <h3>Ist die Besichtigung kostenlos?</h3>
    <p>Ja, die Besichtigung ist unverbindlich und kostenlos.</p>

    <h3>Wie schnell bekomme ich eine erste Rückmeldung?</h3>
    <p>In der Regel erhalten Sie nach Ihrer Anfrage oder nach dem Senden von Fotos schnell eine erste Einschätzung.</p>
  </section>
"""

    patterns = [
        r'<section class="section" style="margin-top:20px">\s*<h2>Häufige Fragen.*?</section>',
        r'<section class="section">\s*<h2>Häufige Fragen.*?</section>',
    ]

    for pattern in patterns:
        new_html, count = re.subn(
            pattern,
            new_faq,
            html,
            count=1,
            flags=re.DOTALL,
        )
        if count:
            return new_html

    return html


def rewrite_cta(html: str, file_name: str) -> str:
    city = (
        file_name.replace("entruempelung-", "")
        .replace(".html", "")
        .replace("-", " ")
        .title()
    )

    new_cta = f"""
  <section class="section" id="kontakt" style="margin-top:20px">
    <h2>Unverbindliche Anfrage für {city}</h2>
    <p>
      Beschreiben Sie kurz, welche Räume betroffen sind und ob es sich um
      Wohnung, Haus, Keller, Garage oder mehrere Bereiche handelt. So lässt
      sich der Aufwand für {city} schneller einordnen.
    </p>

    <p style="margin-top:16px;">
      <a class="cta" href="https://wa.me/491639087197" target="_blank" rel="noreferrer">Anfrage direkt senden</a>
    </p>

    <p style="margin-top:16px;color:#475569;">
      Für eine erste Orientierung können Sie auch unseren Preisrechner nutzen
      oder uns später über das Kontaktformular schreiben.
    </p>

    <ul style="margin-top:14px;color:#475569; padding-left:18px;">
      <li><a href="/preisrechner.html">Preis grob berechnen</a></li>
      <li><a href="/kontakt.html">Kontaktformular öffnen</a></li>
      <li><a href="/leistungen.html">Leistungsübersicht ansehen</a></li>
    </ul>
  </section>
"""

    patterns = [
        r'<section class="section" id="kontakt" style="margin-top:20px">.*?</section>\s*</div>\s*</body>',
        r'<section class="section" id="kontakt">.*?</section>\s*</div>\s*</body>',
    ]

    for pattern in patterns:
        new_html, count = re.subn(
            pattern,
            new_cta + "\n</div>\n</body>",
            html,
            count=1,
            flags=re.DOTALL,
        )
        if count:
            return new_html

    return html


def main():
    target_name = input("Enter target HTML file name: ").strip()
    target_file = ROOT / target_name

    if not target_file.exists():
        print(f"File not found: {target_file}")
        return

    html = read_text(target_file)
    original_html = html

    html = replace_section_order(html)
    html = rewrite_faq(html, target_file.name)
    html = rewrite_cta(html, target_file.name)

    changed = html != original_html
    if changed:
        write_text(target_file, html)

    log = {
        "page": target_file.name,
        "changes": [
            "Reordered content sections",
            "Rewrote FAQ block",
            "Rewrote CTA block",
        ],
        "status": "repaired" if changed else "no_changes_detected",
    }

    write_json(STATE_DIR / "differentiation-log.json", log)
    print(json.dumps(log, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
