-- Fix real (2026-09-21, primer monitoreo real corrido): update_haplite_results_in_supabase
-- (monitor_puntos_wpp.py) hace upsert de SOLO las columnas de estado vivo
-- (ip/active/latency/updated_at/nvr_port/nvr_checked_at) -- nunca tower_name/
-- point_names, que son responsabilidad exclusiva del script de sincronización de
-- identidad. Postgres exige que la fila candidata del INSERT satisfaga los NOT NULL
-- de la tabla ANTES de evaluar el ON CONFLICT DO UPDATE, aunque el conflicto vaya a
-- resolver con UPDATE -- el primer monitoreo real falló con:
--   null value in column "tower_name" violates not-null constraint
-- Sin daño real (la transacción se revirtió completa, las 96 filas conservaron su
-- tower_name real), pero bloqueaba completamente la escritura del estado vivo.
-- Run this in the Supabase SQL Editor.

ALTER TABLE cyber_known_haplites ALTER COLUMN tower_name DROP NOT NULL;
ALTER TABLE cyber_known_haplites ALTER COLUMN point_names DROP NOT NULL;
