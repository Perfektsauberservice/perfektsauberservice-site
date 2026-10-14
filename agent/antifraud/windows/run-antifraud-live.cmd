@echo off
rem PSS Anti-Click-Fraud runner - LIVE: real IP exclusions in Google Ads.
rem Only IP/CIDR exclusions can be written (code guard). Approved by Laura 14.10.2026.
set AF_ENFORCE=1
cd /d C:\tmp\pss-antifraud-v1
:loop
node agent\antifraud\runner.mjs loop --store prod --interval 10 --enforce >> C:\tmp\pss-antifraud-data\runner-prod.log 2>&1
timeout /t 15 /nobreak >nul
goto loop
