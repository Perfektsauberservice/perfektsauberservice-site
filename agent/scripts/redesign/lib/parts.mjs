// Reusable HTML chunks: nav, footer, cookie banner, mobile FAB.
// All paths are absolute (/file.html) so they work from any URL depth.

export const NAV = `<nav class="nav">
  <a href="/" class="nav-brand">
    <img src="/images/logo.webp" alt="Perfekt Sauber Service Logo" onerror="this.src='/images/echipa.webp'"/>
    <span style="display:flex; flex-direction:column; line-height:1;">
      <span style="font-family:'Fraunces',serif; font-size:1.15rem; letter-spacing:-0.01em; color:var(--ink); text-transform:none; font-weight:500;"><b>Perfekt</b> <em>Sauber</em></span>
      <span class="sub">Service · Rastatt</span>
    </span>
  </a>
  <div class="nav-links">
    <a href="/leistungen">Leistungen</a>
    <a href="/einsatzgebiete">Einsatzgebiete</a>
    <a href="/portfolio">Galerie</a>
    <a href="/preisrechner">Preis-Rechner</a>
  </div>
  <a href="/kontakt" class="nav-cta">Anfrage</a>
</nav>`;

export const STRIP = `<div class="strip">
  <div class="strip-row">
    <span><b>Familiengeführt</b> · seit 2025</span>
    <span><b>Festpreis-Garantie</b> · schriftlich</span>
    <span><span class="star">★★★★★</span> <b>5,0</b> Google</span>
    <span><b>DSGVO-konform</b> · Diskret</span>
    <span><b>Vollständig versichert</b></span>
  </div>
</div>`;

export function contactSection(city, serviceLabel, waText) {
  const wa = encodeURIComponent(waText || `Hallo, ich möchte eine Anfrage für ${serviceLabel || 'eine Räumung'}${city ? ' in ' + city : ''} stellen.`);
  return `<section class="contact" id="kontakt">
  <div class="contact-wrap">
    <div>
      <h2>Sprechen wir <em>kurz</em>?</h2>
      <p>Eine Nachricht, ein Anruf, ein Termin. Wir antworten innerhalb von 24 Stunden — meist schneller. Vor-Ort-Termin und Angebot sind <b>kostenlos</b>.</p>
    </div>
    <div class="contact-btns">
      <a href="https://wa.me/491639087197?text=${wa}" class="cb cb-w"><span>WhatsApp</span><span>+49 163 9087197 →</span></a>
      <a href="tel:+491639087197" class="cb cb-p"><span>Anruf</span><span>+49 163 9087197 →</span></a>
      <a href="mailto:kontakt@perfektsauberservice.com" class="cb cb-m"><span>E-Mail</span><span>kontakt@perfektsauberservice.com →</span></a>
    </div>
  </div>
</section>`;
}

export const FOOTER = `<footer class="foot">
  <span>© <span id="year">2026</span> Perfekt Sauber Service · Inh. Laura Craciun</span>
  <span>Reutstraße 9 · 76597 Loffenau</span>
  <span>perfektsauberservice.com · <a href="/impressum">Impressum</a> · <a href="/datenschutz">Datenschutz</a> · <a href="#" id="cookieReopen">Cookies</a></span>
</footer>`;

export const FAB = `<div class="fab">
  <a class="w" href="https://wa.me/491639087197" aria-label="WhatsApp">✆</a>
  <a class="p" href="tel:+491639087197" aria-label="Anruf">☎</a>
</div>`;

export const COOKIE = `<div id="cookieBanner">
  <div class="lab">Cookie-Hinweis</div>
  <p>Wir verwenden notwendige Cookies, damit die Website funktioniert. Optionale Analyse-Cookies helfen uns, sie zu verbessern.</p>
  <div class="row">
    <button class="acc" id="cookieAccept" aria-label="Alle Cookies akzeptieren">Alle akzeptieren</button>
    <button class="dec" id="cookieDecline" aria-label="Nur notwendige Cookies">Nur notwendige</button>
  </div>
</div>`;

export const GA4 = `<!-- Google Analytics 4 -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-BMC32KSYKF"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-BMC32KSYKF');
</script>`;

export const SCRIPTS = `<script>
(function(){
  document.getElementById('year').textContent = new Date().getFullYear();
  // cookie banner
  var b = document.getElementById('cookieBanner');
  if (!localStorage.getItem('psCookieChoice')) { setTimeout(function(){ b.style.display='block'; }, 1200); }
  function close(c){ localStorage.setItem('psCookieChoice', c); b.style.display='none'; }
  document.getElementById('cookieAccept').onclick = function(){ close('all'); };
  document.getElementById('cookieDecline').onclick = function(){ close('necessary'); };
  document.getElementById('cookieReopen').onclick = function(e){ e.preventDefault(); b.style.display='block'; };
})();
</script>`;
