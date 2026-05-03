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


def city_from_file(file_name: str) -> str:
    return (
        file_name.replace("entruempelung-", "")
        .replace(".html", "")
        .replace("-", " ")
        .title()
    )


def count_h2(html: str) -> int:
    return len(re.findall(r"<h2[^>]*>", html, flags=re.IGNORECASE))


def count_h3(html: str) -> int:
    return len(re.findall(r"<h3[^>]*>", html, flags=re.IGNORECASE))


def count_links(html: str) -> int:
    return len(re.findall(r'href="([^"]+)"', html, flags=re.IGNORECASE))


def ensure_extra_sections(html: str, city: str) -> tuple[str, bool]:
    changed = False

    if "Ablauf der Entrümpelung" not in html:
        extra_section_1 = f"""
  <section class="section">
    <h2>Ablauf der Entrümpelung in {city}</h2>
    <p>
      Nach der ersten Anfrage erfolgt eine grobe Einschätzung anhand Ihrer
      Angaben und Fotos. Danach wird abgestimmt, welche Bereiche betroffen
      sind, wie der Zugang aussieht und welcher Umfang realistisch einzuplanen ist.
    </p>
  </section>
"""
        html = re.sub(r"</div>\s*<section class=\"section\"", f"{extra_section_1}\n\n  <section class=\"section\"", html, count=1)
        changed = True

    if "Welche Bereiche häufig betroffen sind" not in html:
        extra_section_2 = f"""
  <section class="section">
    <h2>Welche Bereiche häufig betroffen sind</h2>
    <p>
      In {city} geht es bei Anfragen häufig nicht nur um Wohnungen, sondern
      auch um Keller, Garagen, Dachböden, Abstellräume oder komplette Häuser.
      Mehrere Bereiche können sinnvoll gemeinsam geplant werden.
    </p>
  </section>
"""
        html = re.sub(r"</div>\s*<section class=\"section\"", f"{extra_section_2}\n\n  <section class=\"section\"", html, count=1)
        changed = True

    return html, changed


def ensure_faq_strength(html: str, city: str) -> tuple[str, bool]:
    faq_count = count_h3(html)
    if faq_count >= 4:
        return html, False

    faq_section = f"""
  <section class="section" style="margin-top:20px">
    <h2>Weitere Fragen zur Entrümpelung in {city}</h2>

    <h3>Kann ich auch nur einzelne Räume anfragen?</h3>
    <p>Ja, auch einzelne Räume wie Keller, Garage oder Dachboden können separat angefragt werden.</p>

    <h3>Welche Angaben helfen bei der ersten Einschätzung?</h3>
    <p>Hilfreich sind Fotos, Angaben zur Etage, zum Zugang und zum ungefähren Umfang.</p>

    <h3>Ist die Anfrage unverbindlich?</h3>
    <p>Ja, die erste Anfrage dient zunächst nur der unverbindlichen Einschätzung.</p>

    <h3>Sind auch mehrere Bereiche gleichzeitig möglich?</h3>
    <p>Ja, zusammenhängende Bereiche können in einer gemeinsamen Planung berücksichtigt werden.</p>
  </section>
"""
    if re.search(r"<h3[^>]*>", html, flags=re.IGNORECASE):
        html = re.sub(
            r'<section class="section" style="margin-top:20px">\s*<h2>.*?</section>',
            faq_section,
            html,
            count=1,
            flags=re.DOTALL,
        )
    else:
        html = re.sub(r"</div>\s*</body>", f"{faq_section}\n</div>\n</body>", html, count=1)
    return html, True


def ensure_internal_links(html: str) -> tuple[str, bool]:
    changed = False

    needs_preis = "/preisrechner.html" not in html
    needs_leist = "/leistungen.html" not in html
    needs_einsatz = "/einsatzgebiete.html" not in html

    if not (needs_preis or needs_leist or needs_einsatz):
        return html, False

    links = []
    if needs_preis:
        links.append('<a href="/preisrechner.html">Preisrechner</a>')
    if needs_leist:
        links.append('<a href="/leistungen.html">Leistungen</a>')
    if needs_einsatz:
        links.append('<a href="/einsatzgebiete.html">Einsatzgebiete</a>')

    links_block = f"""
  <section class="section">
    <h2>Weitere Informationen</h2>
    <p>
      {' · '.join(links)}
    </p>
  </section>
"""
    html = re.sub(r"</div>\s*<section class=\"section\"", f"{links_block}\n\n  <section class=\"section\"", html, count=1)
    changed = True
    return html, changed


def main():
    target_name = input("Enter target HTML file name: ").strip()
    target_file = ROOT / target_name

    if not target_file.exists():
        print(f"File not found: {target_file}")
        return

    city = city_from_file(target_file.name)
    html = read_text(target_file)
    original_html = html

    changes = []

    if count_h2(html) < 6:
        html, changed = ensure_extra_sections(html, city)
        if changed:
            changes.append("Added missing informational sections")

    if count_h3(html) < 4:
        html, changed = ensure_faq_strength(html, city)
        if changed:
            changes.append("Strengthened FAQ block")

    if count_links(html) < 3:
        html, changed = ensure_internal_links(html)
        if changed:
            changes.append("Added internal links section")

    changed = html != original_html
    if changed:
        write_text(target_file, html)

    log = {
        "page": target_file.name,
        "changes": changes,
        "status": "repaired" if changed else "no_changes_detected",
    }

    write_json(STATE_DIR / "structural-repair-log.json", log)
    print(json.dumps(log, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
