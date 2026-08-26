#!/bin/bash
set -e
echo "=== DOCKER NOVA ==="
docker ps --format 'table {{.Names}}\t{{.Ports}}\t{{.Status}}' | grep -E 'NAMES|dashboards-nova' || true
echo
echo "=== PM2 NOVA ==="
pm2 list | grep -E 'dashboards-nova|name' || true
echo
echo "=== WORKBOOK ON HOST ==="
grep -n 'calamine\|python_calamine' /home/exito/projetos/Dashboards/nova-versao/backend/app/extract/workbook.py | head
grep -n 'python-calamine' /home/exito/projetos/Dashboards/nova-versao/backend/requirements.txt
echo
echo "=== WORKBOOK IN CONTAINER ==="
docker exec dashboards-nova-api grep -n 'calamine\|python_calamine' /app/backend/app/extract/workbook.py | head
docker exec dashboards-nova-api pip show python-calamine | head -2
echo
echo "=== PORTS ==="
ss -tlnp | grep -E '8001|9527|4243|5433' || true
echo
echo "=== CURL ==="
curl -s -o /dev/null -w 'api8001_docs %{http_code}\n' http://127.0.0.1:8001/docs
curl -s -o /dev/null -w 'web9527 %{http_code}\n' http://127.0.0.1:9527/
echo
echo "=== IMPORT ROUTE EXISTS ==="
docker exec dashboards-nova-api grep -n 'preview\|commit' /app/backend/app/routers/imports.py | head -10
echo
echo "=== LIVE EXTRACT TEST ==="
docker exec -w /app/backend dashboards-nova-api python /tmp/_test_remote_classify.py
echo
echo "=== OLD SERVER.JS? ==="
pgrep -af 'node server.js' || echo 'no old EJS server.js'
ls /home/exito/projetos/Dashboards/server.js >/dev/null && echo 'server.js file exists on disk (EJS legado)' || true
