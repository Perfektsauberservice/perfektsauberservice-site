PSS Auto Agent
===============

Ce face:
- citește orașele și serviciile din agent/config
- generează drafturi locale în content/auto
- păstrează imaginea corectă pe oraș pentru noile articole
- oferă un endpoint Netlify pregătit pentru modul full-auto

Pași rapizi:
1. Rulează local: node agent/scripts/generate-articles.mjs
2. Verifică drafturile din content/auto
3. Adaugă variabilele OPENAI / GITHUB / NETLIFY în panoul de deploy
4. Extinde netlify/functions/pss-auto-content.mjs pentru push live


POST test example:
fetch('/.netlify/functions/pss-auto-content',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({city:'rastatt',service:'entruempelung'})})
