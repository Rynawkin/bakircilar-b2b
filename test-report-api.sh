#!/bin/bash

curl -s "http://localhost:5000/api/admin/reports/cost-update-alerts?page=1&limit=5" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2NzY4YzkyZC0yOTA1LTQzMWEtOTMxYy0wNjhkOGNhNDM4MjIiLCJlbWFpbCI6ImFkbWluQGJha2lyY2lsYXIuY29tIiwicm9sZSI6IkFETUlOIiwiaWF0IjoxNzMzMTM3NzE2fQ.FpQCekxpwFWfTZsxlDhb1sOrOpVgmBLH7vPi7QzEnQM" \
  | jq .
