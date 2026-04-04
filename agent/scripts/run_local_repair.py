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


def read_json(path: Path):
    return json.loads(read_text(path))


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
    html = re.sub(
        r'<section class="section" style="margin-top:20px">\s*<h2>Häufige Fragen.*?</section>',
        new_faq,
        html,
        count=1,
        flags=re.DOTALL,
    )
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
    <h2>Entrümpelung in {city} unverbindlich anfragen</h2>
    <p>
      Wenn Sie den Aufwand besser einschätzen lassen möchten, senden Sie uns
      einfach ein paar Fotos und eine kurze Beschreibung. So bekommen Sie
      schneller eine erste Orientierung für Ihr Objekt in {city}.
    </p>

    <div class="cta-row">
      <a class="cta" href="https://wa.me/491639087197" target="_blank" rel="noreferrer">Fotos und Infos senden</a>
    </div>

    <p style="margin-top:16px;color:#475569;">
      Alternativ können Sie zuerst den <a href="/preisrechner.html">Preisrechner</a>
      nutzen oder uns direkt über das <a href="/kontakt.html">Kontaktformular</a> schreiben.
    </p>

    <p style="margin-top:10px;color:#475569;">
      Weitere Informationen finden Sie auch unter
      <a href="/leistungen.html">Leistungen</a> und
      <a href="/einsatzgebiete.html">Einsatzgebiete</a>.
    </p>
  </section>
"""
    html = re.sub(
        r'<section class="section" id="kontakt" style="margin-top:20px">.*?</section>\s*</div>\s*</body>',
        new_cta + "\n</div>\n</body>",
        html,
        count=1,
        flags=re.DOTALL,
    )
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

    if html != original_html:
        write_text(target_file, html)

    log = {
        "page": target_file.name,
        "changes": [
            "Reordered content sections",
            "Rewrote FAQ block",
            "Rewrote CTA block",
        ],
        "status": "repaired",
    }

    write_json(STATE_DIR / "differentiation-log.json", log)
    print(json.dumps(log, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
