Agent Zero patch

What it does:
- reads cities.json, services.json, goals.json, content-index.json and publication-state.json
- generates candidate content briefs
- checks simple duplicate/cannibalization risk
- saves preview output to agent/output/agent-zero-preview.json

How to run locally:
node agent/scripts/run-agent-zero.mjs
