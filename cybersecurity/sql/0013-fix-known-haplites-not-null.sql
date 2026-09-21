-- Fix real (2026-09-21, primer monitoreo real corrido): update_haplite_results_in_supabase
-- (monitor_puntos_wpp.py) hace upsert de SOLO las columnas de estado vivo
-- (ip/active/latency/updated_at/nvr_port/nvr_checked_at) -- nunca tower_name/
-- point_names/synced_at, que son responsabilidad exclusiva del script de
-- sincronización de identidad. Postgres exige que la fila candidata del INSERT
-- satisfaga TODOS los NOT NULL de la tabla ANTES de evaluar el ON CONFLICT DO UPDATE,
-- aunque el conflicto vaya a resolver con UPDATE -- el primer intento real falló con
-- tower_name, el segundo (tras corregir tower_name/point_names) con el mismo problema
-- en synced_at, que se me había pasado la primera vez.
-- Sin daño real en ningún intento (la transacción se revirtió completa cada vez).
-- Run this in the Supabase SQL Editor.

ALTER TABLE cyber_known_haplites ALTER COLUMN tower_name DROP NOT NULL;
ALTER TABLE cyber_known_haplites ALTER COLUMN point_names DROP NOT NULL;
ALTER TABLE cyber_known_haplites ALTER COLUMN synced_at DROP NOT NULL;
