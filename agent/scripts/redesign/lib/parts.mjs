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
    <span><b>Zufriedenheits-Garantie</b> · kostenfrei nachbessern</span>
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

// Lead capture form — Netlify Forms (auto-detected at deploy via data-netlify="true").
// Submissions land in Netlify dashboard + email notification (configured separately).
// `serviceLabel` and `city` pre-fill the dropdown / context.
export function leadFormSection(city, serviceLabel) {
  const ctx = [serviceLabel, city].filter(Boolean).join(' · ');
  return `<section class="sec lead-form-sec" id="anfrage">
  <div style="max-width:720px; margin:0 auto;">
    <div class="sec-mark">Festpreis anfordern</div>
    <h2 class="sec-h">Kostenloses <em>Festpreis-Angebot</em> in 24 h</h2>
    <p class="sec-p">Schreiben Sie uns kurz, was geräumt werden soll. Wir antworten binnen 24 Stunden — meist deutlich schneller. Antwort per Anruf, WhatsApp oder E-Mail, ganz wie Sie wollen.</p>
    <form name="lead" method="POST" data-netlify="true" data-netlify-honeypot="bot-field" action="/danke" class="lead-form">
      <input type="hidden" name="form-name" value="lead"/>
      <input type="hidden" name="seite" value="${escapeAttr(ctx)}"/>
      <p class="hp"><label>Bitte leer lassen: <input name="bot-field"/></label></p>
      <div class="lf-row">
        <label class="lf-field">
          <span>Name</span>
          <input type="text" name="name" autocomplete="name" required/>
        </label>
        <label class="lf-field">
          <span>Telefon (oder WhatsApp)</span>
          <input type="tel" name="telefon" autocomplete="tel" inputmode="tel" required placeholder="+49…"/>
        </label>
      </div>
      <label class="lf-field">
        <span>Was soll geräumt werden? (optional)</span>
        <textarea name="nachricht" rows="3" placeholder="Z. B. 2-Zimmer-Wohnung in Rastatt, Keller voll, Termin nächste Woche…"></textarea>
      </label>
      <label class="lf-field">
        <span>Wann passt es Ihnen? (optional)</span>
        <select name="dringlichkeit">
          <option value="">— bitte wählen —</option>
          <option>Diese Woche (Express)</option>
          <option>Nächste Woche</option>
          <option>Innerhalb 2 Wochen</option>
          <option>Innerhalb 1 Monat</option>
          <option>Flexibel</option>
        </select>
      </label>
      <button type="submit" class="lf-submit">Festpreis-Angebot anfordern →</button>
      <p class="lf-note">Antwort innerhalb 24 h · Vor-Ort-Termin und Angebot kostenlos · DSGVO-konform</p>
    </form>
  </div>
</section>
<style>
.lead-form-sec{background:var(--bg-2,#f3ede0);}
.lead-form{display:flex;flex-direction:column;gap:18px;margin-top:24px;}
.lead-form .hp{position:absolute;left:-9999px;}
.lf-row{display:grid;grid-template-columns:1fr 1fr;gap:14px;}
@media(max-width:620px){.lf-row{grid-template-columns:1fr;}}
.lf-field{display:flex;flex-direction:column;gap:6px;}
.lf-field>span{font-family:"Geist Mono",monospace;font-size:.66rem;letter-spacing:.16em;text-transform:uppercase;color:var(--muted,#4a5160);}
.lf-field input,.lf-field textarea,.lf-field select{padding:14px 16px;border:1.5px solid var(--line,#e5dccb);border-radius:10px;background:#fff;font:inherit;color:var(--ink,#1a2030);transition:border-color .2s;}
.lf-field input:focus,.lf-field textarea:focus,.lf-field select:focus{outline:none;border-color:var(--blue,#1d6dd6);}
.lf-field textarea{resize:vertical;font-family:inherit;}
.lf-submit{background:var(--green,#5aa83a);color:#fff;padding:16px 24px;border-radius:999px;font-family:"Geist Mono",monospace;font-size:.78rem;letter-spacing:.16em;text-transform:uppercase;font-weight:500;cursor:pointer;border:none;transition:all .25s;margin-top:8px;}
.lf-submit:hover{background:var(--green-dk,#3d8222);transform:translateY(-1px);box-shadow:0 12px 28px -10px rgba(61,130,34,.5);}
.lf-note{font-size:.84rem;color:var(--muted,#4a5160);text-align:center;margin-top:4px;}
</style>`;
}

function escapeAttr(s) {
  if (s == null) return '';
  return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

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
  // GA4 conversion event tracking — phone/whatsapp/email clicks
  document.addEventListener('click', function(e){
    var a = e.target && e.target.closest && e.target.closest('a');
    if (!a || typeof gtag !== 'function') return;
    var href = a.getAttribute('href') || '';
    if (href.indexOf('tel:') === 0) {
      gtag('event', 'phone_click', {link_url: href, page_path: location.pathname});
    } else if (href.indexOf('wa.me') > -1 || href.indexOf('api.whatsapp') > -1) {
      gtag('event', 'whatsapp_click', {link_url: href, page_path: location.pathname});
    } else if (href.indexOf('mailto:') === 0) {
      gtag('event', 'email_click', {link_url: href, page_path: location.pathname});
    }
  });
})();
</script>`;
