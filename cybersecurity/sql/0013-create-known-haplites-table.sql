-- Migration: tabla para el estado vivo REAL del hAP lite (spec 0013, Ciberseguridad)
-- puntos_venta.ip nunca es la IP del hAP lite (0 de 96 coinciden, es el equipo de
-- apuestas por WiFi) -- verificado con datos reales 2026-09-21. Esta tabla nueva
-- guarda las IPs de hAP lite reales (sincronizadas desde la semilla local de
-- cybersecurity, ver scripts/sync-known-haplites-to-supabase.js) y su propio estado
-- de ping/puerto NAT (poblado por monitor_puntos_wpp.py, igual que ya hace con
-- puntos_venta.active/latency/nvr_port/nvr_checked_at).
-- Run this in the Supabase SQL Editor.

-- tower_name/point_names sin NOT NULL a propósito (fix real 2026-09-21, ver
-- 0013-fix-known-haplites-not-null.sql): update_haplite_results_in_supabase
-- (monitor_puntos_wpp.py) hace upsert de solo las columnas de estado vivo, nunca de
-- estas dos -- Postgres exige que la fila candidata del INSERT satisfaga los NOT
-- NULL antes de evaluar el ON CONFLICT DO UPDATE, aunque el conflicto sí resuelva
-- con UPDATE.
CREATE TABLE IF NOT EXISTS cyber_known_haplites (
  ip TEXT PRIMARY KEY,
  tower_name TEXT,
  point_names TEXT,
  active BOOLEAN,
  latency INTEGER,
  nvr_port INTEGER,
  updated_at TIMESTAMPTZ,
  nvr_checked_at TIMESTAMPTZ,
  synced_at TIMESTAMPTZ NOT NULL
);

-- Nota: si el proyecto de Supabase tiene RLS "deny by default" en tablas nuevas, agrega
-- una policy de solo lectura pública (mismo patrón que ya debe existir para
-- puntos_venta) desde el dashboard -- este repo no ha capturado RLS en SQL hasta ahora,
-- así que no se asume aquí.
