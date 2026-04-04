def extract_cta_block(html: str) -> str:
    # ia doar textul vizibil din blocul de contact/cta, nu si href-urile
    match = re.search(
        r'<section class="section" id="kontakt" style="margin-top:20px">.*?</section>',
        html,
        flags=re.IGNORECASE | re.DOTALL
    )
    if not match:
        return ""

    cta_html = match.group(0)

    # scoate linkurile, dar păstrează etichetele vizibile
    cta_text = re.sub(r'<a [^>]*>(.*?)</a>', r' \1 ', cta_html, flags=re.IGNORECASE | re.DOTALL)
    cta_text = re.sub(r'<[^>]+>', ' ', cta_text)
    cta_text = re.sub(r'\s+', ' ', cta_text).strip()

    # scoate expresiile super comune ca sa nu umfle scorul artificial
    common = [
        "whatsapp",
        "kontaktformular",
        "kontakt",
        "preisrechner",
        "leistungen",
        "einsatzgebiete",
        "anfrage",
        "entrümpelung"
    ]
    text = cta_text.lower()
    for phrase in common:
        text = text.replace(phrase, " ")

    text = re.sub(r'\s+', ' ', text).strip()
    return text
