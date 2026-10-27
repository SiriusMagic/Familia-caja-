#!/usr/bin/env bash
# Prueba schema.sql en una base PostgreSQL vacía y temporal.
# Uso: bash supabase/pruebas/ejecutar.sh   (necesita psql y un PostgreSQL al que conectarse;
#      la conexión se toma de PGHOST/PGPORT/PGUSER, como cualquier comando psql)
set -euo pipefail
cd "$(dirname "$0")"
DB="ahorro_pruebas_$$"
createdb "$DB"
trap 'dropdb --if-exists "$DB"' EXIT
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f supabase_simulado.sql
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f ../schema.sql
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f ../schema.sql   # se puede ejecutar dos veces
psql -q -v ON_ERROR_STOP=1 -o /dev/null -d "$DB" -f pruebas.sql
