import json
import re
from pathlib import Path

from agent.scripts.run_local_guard import (
    compare_page,
    read_json,
)


ROOT = Path(__file__).resolve().parents[2]
AGENT_DIR = ROOT / "agent"
CONFIG_DIR = AGENT_DIR / "config"
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


def stable_variant_index(file_name: str, count: int) -> int:
    return sum(ord(c) for c in file_name) % count


def replace_section_order_variant(html: str, variant: int) -> str:
    sections = re.findall(
        r'(<section class="section">.*?</section>)',
        html,
        flags=re.DOTALL,
    )
    if len(sections) < 6:
        return html

    patterns = [
        [sections[2], sections[0], sections[4], sections[1], sections[3], sections[5]],
        [sections[1], sections[3], sections[0], sections[4], sections[2], sections[5]],
        [sections[4], sections[0], sections[2], sections[1], sections[3], sections[5]],
        [sections[3], sections[1], sections[4], sections[0], sections[2], sections[5]],
        [sections[2], sections[4], sections[0], sections[3], sections[1], sections[5]],
        [sections[1], sections[4], sections[2], sections[0], sections[3], sections[5]],
    ]
    new_order = patterns[variant % len(patterns)]

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


def build_faq(city: str, variant: int) -> str:
    faq_variants = [
        f"""
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
""",
        f"""
  <section class="section" style="margin-top:20px">
    <h2>Wichtige Fragen zur Entrümpelung in {city}</h2>

    <h3>Wie läuft die erste Einschätzung ab?</h3>
    <p>Oft reichen schon Fotos und kurze Informationen zum Objekt, damit der Aufwand grob eingeschätzt werden kann.</p>

    <h3>Werden auch Keller, Garagen oder Dachböden berücksichtigt?</h3>
    <p>Ja, wenn mehrere Bereiche betroffen sind, können diese direkt gemeinsam eingeplant werden.</p>

    <h3>Kann ich auch ohne Besichtigung anfragen?</h3>
    <p>Ja, für eine erste Orientierung ist eine Anfrage mit Fotos oft schon ausreichend.</p>

    <h3>Wird nach der Räumung ordentlich übergeben?</h3>
    <p>Auf Wunsch werden die geräumten Bereiche ordentlich und besenrein hinterlassen.</p>
  </section>
""",
        f"""
  <section class="section" style="margin-top:20px">
    <h2>FAQ zur Entrümpelung in {city}</h2>

    <h3>Sind kurzfristige Termine möglich?</h3>
    <p>Je nach Auslastung können auch kurzfristige Einsätze eingeplant werden.</p>

    <h3>Kann ich verschiedene Räume in einer Anfrage zusammenfassen?</h3>
    <p>Ja, mehrere Räume oder Nebenbereiche können in einer gemeinsamen Planung berücksichtigt werden.</p>

    <h3>Ist die Einschätzung kostenlos?</h3>
    <p>Ja, die erste Besichtigung oder grobe Einschätzung ist unverbindlich und kostenlos.</p>

    <h3>Welche Infos helfen bei der Anfrage?</h3>
    <p>Hilfreich sind Fotos, Angaben zur Etage, zu den Zugängen und zu den betroffenen Räumen.</p>
  </section>
""",
        f"""
  <section class="section" style="margin-top:20px">
    <h2>Häufig gestellte Fragen für {city}</h2>

    <h3>Was hilft für eine schnelle Rückmeldung?</h3>
    <p>Am besten senden Sie Fotos und kurze Angaben dazu, ob Wohnung, Haus, Keller oder Garage betroffen sind.</p>

    <h3>Ist auch eine Räumung von Nebenflächen möglich?</h3>
    <p>Ja, neben Wohnräumen können auch Abstellräume, Keller, Garagen und Dachböden einbezogen werden.</p>

    <h3>Muss vorher ein Termin vor Ort stattfinden?</h3>
    <p>Nicht immer. Für kleinere oder klar erkennbare Einsätze reicht oft eine erste Einschätzung anhand von Fotos.</p>

    <h3>Wird alles strukturiert geplant?</h3>
    <p>Ja, Ziel ist immer ein klarer Ablauf mit möglichst wenig unnötigem Aufwand.</p>
  </section>
""",
        f"""
  <section class="section" style="margin-top:20px">
    <h2>Fragen und Antworten zur Entrümpelung in {city}</h2>

    <h3>Kann ich auch nur einzelne Bereiche räumen lassen?</h3>
    <p>Ja, es muss nicht immer das ganze Objekt betroffen sein. Auch einzelne Räume oder Nebenflächen sind möglich.</p>

    <h3>Wie bekomme ich eine erste Kosteneinschätzung?</h3>
    <p>Eine erste Orientierung ist oft schon nach Fotos und kurzen Infos zum Umfang möglich.</p>

    <h3>Ist die Anfrage unverbindlich?</h3>
    <p>Ja, Ihre Anfrage ist unverbindlich und dient zunächst nur der Einschätzung.</p>

    <h3>Werden größere Mengen berücksichtigt?</h3>
    <p>Ja, auch bei mehreren Bereichen oder größerem Volumen kann die Räumung entsprechend geplant werden.</p>
  </section>
""",
        f"""
  <section class="section" style="margin-top:20px">
    <h2>Antworten zur Entrümpelung in {city}</h2>

    <h3>Welche Räume werden häufig angefragt?</h3>
    <p>Oft geht es um Wohnungen, Häuser, Keller, Garagen, Dachböden oder mehrere Bereiche gleichzeitig.</p>

    <h3>Kann ich Bilder direkt schicken?</h3>
    <p>Ja, Bilder helfen sehr, damit Umfang und Zugänglichkeit besser eingeschätzt werden können.</p>

    <h3>Wie schnell erfolgt die Planung?</h3>
    <p>Nach der ersten Anfrage erfolgt in der Regel zeitnah eine Rückmeldung zur weiteren Einschätzung.</p>

    <h3>Ist eine besenreine Übergabe möglich?</h3>
    <p>Ja, wenn gewünscht, werden die geräumten Bereiche ordentlich und besenrein übergeben.</p>
  </section>
""",
        f"""
  <section class="section" style="margin-top:20px">
    <h2>Typische Fragen zur Entrümpelung in {city}</h2>

    <h3>Wie wird der Aufwand eingeschätzt?</h3>
    <p>Entscheidend sind meist Menge, Zugänge, Etage, Laufwege und die Anzahl der betroffenen Räume.</p>

    <h3>Können auch Haus und Keller zusammen geräumt werden?</h3>
    <p>Ja, zusammenhängende Bereiche lassen sich in einer gemeinsamen Planung organisieren.</p>

    <h3>Ist eine Vor-Ort-Besichtigung zwingend nötig?</h3>
    <p>Nicht zwingend. Für eine erste Orientierung reichen oft gute Fotos und kurze Angaben.</p>

    <h3>Wie läuft die Anfrage am einfachsten?</h3>
    <p>Am einfachsten per WhatsApp mit Fotos oder über das Kontaktformular mit den wichtigsten Infos.</p>
  </section>
""",
        f"""
  <section class="section" style="margin-top:20px">
    <h2>Wissenswertes zur Entrümpelung in {city}</h2>

    <h3>Kann ich eine schnelle Einschätzung bekommen?</h3>
    <p>Ja, mit Fotos und einer kurzen Beschreibung ist oft schnell eine erste Einschätzung möglich.</p>

    <h3>Sind auch kleinere Entrümpelungen möglich?</h3>
    <p>Ja, auch einzelne Räume oder kleinere Nebenflächen können angefragt werden.</p>

    <h3>Werden mehrere Etagen berücksichtigt?</h3>
    <p>Ja, Etage, Zugänglichkeit und Laufwege fließen in die Einschätzung und Planung ein.</p>

    <h3>Wird individuell geplant?</h3>
    <p>Ja, jede Anfrage wird nach Umfang und Situation des Objekts individuell betrachtet.</p>
  </section>
""",
        f"""
  <section class="section" style="margin-top:20px">
    <h2>Entrümpelung {city}: häufige Fragen</h2>

    <h3>Welche Informationen sind bei der Anfrage wichtig?</h3>
    <p>Wichtig sind Fotos, betroffene Räume, Zugangssituation und eine grobe Beschreibung des Umfangs.</p>

    <h3>Kann auch nur eine Garage oder ein Keller angefragt werden?</h3>
    <p>Ja, es können auch einzelne Nebenräume separat angefragt werden.</p>

    <h3>Wann erhalte ich eine Rückmeldung?</h3>
    <p>Nach Ihrer Anfrage erfolgt in der Regel schnell eine erste Rückmeldung zur Einschätzung.</p>

    <h3>Ist der Ablauf klar planbar?</h3>
    <p>Ja, Ziel ist immer ein strukturierter und nachvollziehbarer Ablauf.</p>
  </section>
""",
        f"""
  <section class="section" style="margin-top:20px">
    <h2>Noch Fragen zur Entrümpelung in {city}?</h2>

    <h3>Ist eine kostenlose Besichtigung möglich?</h3>
    <p>Ja, eine Besichtigung oder erste unverbindliche Einschätzung ist kostenlos möglich.</p>

    <h3>Kann ich Haus, Keller und Dachboden zusammen anfragen?</h3>
    <p>Ja, mehrere betroffene Bereiche können gemeinsam aufgenommen und eingeplant werden.</p>

    <h3>Sind auch kurzfristige Einsätze realistisch?</h3>
    <p>Je nach Auslastung können auch kurzfristige Termine möglich sein.</p>

    <h3>Wie starte ich die Anfrage am besten?</h3>
    <p>Am besten senden Sie Fotos und kurze Informationen direkt per WhatsApp oder über das Kontaktformular.</p>
  </section>
""",
    ]
    return faq_variants[variant]


def build_cta(city: str, variant: int) -> str:
    cta_variants = [
        f"""
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
""",
        f"""
  <section class="section" id="kontakt" style="margin-top:20px">
    <h2>Jetzt Entrümpelung in {city} anfragen</h2>
    <p>
      Wenn Sie schnell wissen möchten, wie Ihre Anfrage eingeschätzt wird,
      senden Sie uns einfach ein paar Fotos und kurze Infos zum Objekt.
    </p>

    <div class="cta-row">
      <a class="cta" href="https://wa.me/491639087197" target="_blank" rel="noreferrer">Fotos per WhatsApp schicken</a>
    </div>

    <p style="margin-top:16px;color:#475569;">
      Alternativ können Sie uns über das <a href="/kontakt.html">Kontaktformular</a>
      schreiben oder vorab den <a href="/preisrechner.html">Preisrechner</a> nutzen.
    </p>
  </section>
""",
        f"""
  <section class="section" id="kontakt" style="margin-top:20px">
    <h2>Schnelle Einschätzung für {city}</h2>
    <p>
      Senden Sie uns Bilder und eine kurze Beschreibung, damit wir den Umfang
      Ihrer Entrümpelung in {city} besser einschätzen können.
    </p>

    <p style="margin-top:18px;">
      <a class="cta secondary" href="https://wa.me/491639087197" target="_blank" rel="noreferrer">Jetzt WhatsApp-Nachricht senden</a>
    </p>

    <p style="margin-top:16px;color:#475569;">
      Weitere Informationen finden Sie unter
      <a href="/leistungen.html">Leistungen</a> und
      <a href="/einsatzgebiete.html">Einsatzgebiete</a>.
    </p>
  </section>
""",
        f"""
  <section class="section" id="kontakt" style="margin-top:20px">
    <h2>Entrümpelung {city} unverbindlich prüfen lassen</h2>
    <p>
      Mit Fotos und kurzen Angaben zu den betroffenen Räumen lässt sich der
      Aufwand oft schneller einordnen.
    </p>

    <div class="cta-row">
      <a class="cta" href="/kontakt.html">Kontaktformular ausfüllen</a>
      <a class="cta secondary" href="https://wa.me/491639087197" target="_blank" rel="noreferrer">WhatsApp öffnen</a>
    </div>

    <p style="margin-top:14px;color:#475569;">
      Für eine grobe Orientierung können Sie zusätzlich den
      <a href="/preisrechner.html">Preisrechner</a> nutzen.
    </p>
  </section>
""",
        f"""
  <section class="section" id="kontakt" style="margin-top:20px">
    <h2>Ihre Anfrage für {city}</h2>
    <p>
      Je genauer die ersten Informationen sind, desto schneller kann eine
      passende Einschätzung für Ihr Objekt erfolgen.
    </p>

    <ul style="margin-top:14px;color:#475569; padding-left:18px;">
      <li>Fotos der betroffenen Räume senden</li>
      <li>Umfang kurz beschreiben</li>
      <li>Zugang und Etage nennen</li>
    </ul>

    <p style="margin-top:18px;">
      <a class="cta" href="https://wa.me/491639087197" target="_blank" rel="noreferrer">Infos jetzt senden</a>
    </p>
  </section>
""",
        f"""
  <section class="section" id="kontakt" style="margin-top:20px">
    <h2>Kontakt für Entrümpelung in {city}</h2>
    <p>
      Schreiben Sie uns, welche Räume betroffen sind und ob es Besonderheiten
      bei Zugang, Etage oder Umfang gibt.
    </p>

    <div class="cta-row">
      <a class="cta secondary" href="/kontakt.html">Kontakt aufnehmen</a>
    </div>

    <p style="margin-top:16px;color:#475569;">
      Fotos können Sie zusätzlich direkt per
      <a href="https://wa.me/491639087197" target="_blank" rel="noreferrer">WhatsApp</a> senden.
    </p>
  </section>
""",
        f"""
  <section class="section" id="kontakt" style="margin-top:20px">
    <h2>Unkompliziert anfragen in {city}</h2>
    <p>
      Für eine erste Einschätzung brauchen wir meist nur ein paar Fotos und
      kurze Angaben zu den betroffenen Bereichen.
    </p>

    <p style="margin-top:18px;">
      <a class="cta" href="https://wa.me/491639087197" target="_blank" rel="noreferrer">WhatsApp-Anfrage starten</a>
    </p>

    <p style="margin-top:16px;color:#475569;">
      Alternativ:
      <a href="/preisrechner.html">Preisrechner</a> ·
      <a href="/kontakt.html">Kontaktformular</a> ·
      <a href="/leistungen.html">Leistungen</a>
    </p>
  </section>
""",
        f"""
  <section class="section" id="kontakt" style="margin-top:20px">
    <h2>Entrümpelung in {city}: so starten Sie Ihre Anfrage</h2>
    <p>
      Senden Sie uns kurze Informationen zum Objekt, damit wir Aufwand und
      mögliche nächsten Schritte besser einschätzen können.
    </p>

    <div class="cta-row">
      <a class="cta secondary" href="https://wa.me/491639087197" target="_blank" rel="noreferrer">Nachricht senden</a>
      <a class="cta" href="/preisrechner.html">Preis zuerst prüfen</a>
    </div>
  </section>
""",
        f"""
  <section class="section" id="kontakt" style="margin-top:20px">
    <h2>Fragen Sie jetzt für {city} an</h2>
    <p>
      Ob einzelne Räume oder mehrere Bereiche: mit den wichtigsten Infos kann
      die Anfrage schneller eingeordnet werden.
    </p>

    <p style="margin-top:16px;">
      <a class="cta" href="/kontakt.html">Anfrageformular öffnen</a>
    </p>

    <p style="margin-top:14px;color:#475569;">
      Bilder können Sie ergänzend per
      <a href="https://wa.me/491639087197" target="_blank" rel="noreferrer">WhatsApp</a> senden.
    </p>
  </section>
""",
        f"""
  <section class="section" id="kontakt" style="margin-top:20px">
    <h2>Anfrage und erste Orientierung für {city}</h2>
    <p>
      Nutzen Sie den Weg, der für Sie am einfachsten ist: WhatsApp, Formular
      oder zuerst eine grobe Preisschätzung.
    </p>

    <ul style="margin-top:14px;color:#475569; padding-left:18px;">
      <li><a href="https://wa.me/491639087197" target="_blank" rel="noreferrer">WhatsApp-Nachricht senden</a></li>
      <li><a href="/kontakt.html">Kontaktformular nutzen</a></li>
      <li><a href="/preisrechner.html">Preis grob einschätzen</a></li>
    </ul>
  </section>
""",
    ]
    return cta_variants[variant]


def rewrite_faq(html: str, file_name: str, faq_variant: int) -> str:
    city = (
        file_name.replace("entruempelung-", "")
        .replace(".html", "")
        .replace("-", " ")
        .title()
    )
    new_faq = build_faq(city, faq_variant)

    patterns = [
        r'<section class="section" style="margin-top:20px">\s*<h2>.*?</h2>.*?</section>',
        r'<section class="section">\s*<h2>.*?</h2>.*?</section>',
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


def rewrite_cta(html: str, file_name: str, cta_variant: int) -> str:
    city = (
        file_name.replace("entruempelung-", "")
        .replace(".html", "")
        .replace("-", " ")
        .title()
    )
    new_cta = build_cta(city, cta_variant)

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


def score_candidate(target_file: Path, candidate_html: str, cities: list[str], thresholds: dict) -> tuple[int, dict]:
    temp_path = ROOT / "__temp_candidate__.html"
    temp_path.write_text(candidate_html, encoding="utf-8")

    compare_files = list(ROOT.glob("entruempelung-*.html"))
    report = compare_page(temp_path, compare_files, cities, thresholds)

    try:
        temp_path.unlink()
    except FileNotFoundError:
        pass

    score = (
        report["overall_similarity"] * 3
        + report["block_similarity"]["structure"] * 2
        + report["block_similarity"]["faq"] * 4
        + report["block_similarity"]["cta"] * 4
    )
    return score, report


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

    original_html = read_text(target_file)

    best_html = original_html
    best_score = 10**9
    best_meta = {
        "section_variant": None,
        "faq_variant": None,
        "cta_variant": None,
        "report": None,
    }

    for section_variant in range(6):
        section_html = replace_section_order_variant(original_html, section_variant)

        for faq_variant in range(10):
            faq_html = rewrite_faq(section_html, target_file.name, faq_variant)

            for cta_variant in range(10):
                candidate_html = rewrite_cta(faq_html, target_file.name, cta_variant)
                score, report = score_candidate(target_file, candidate_html, city_names, thresholds)

                if score < best_score:
                    best_score = score
                    best_html = candidate_html
                    best_meta = {
                        "section_variant": section_variant,
                        "faq_variant": faq_variant,
                        "cta_variant": cta_variant,
                        "report": report,
                    }

    changed = best_html != original_html
    if changed:
        write_text(target_file, best_html)

    log = {
        "page": target_file.name,
        "changes": [
            "Selected best section order variant",
            "Selected best FAQ variant",
            "Selected best CTA variant",
        ],
        "selected_variants": {
            "section_variant": best_meta["section_variant"],
            "faq_variant": best_meta["faq_variant"],
            "cta_variant": best_meta["cta_variant"],
        },
        "best_report": best_meta["report"],
        "status": "repaired" if changed else "no_changes_detected",
    }

    write_json(STATE_DIR / "differentiation-log.json", log)
    print(json.dumps(log, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
