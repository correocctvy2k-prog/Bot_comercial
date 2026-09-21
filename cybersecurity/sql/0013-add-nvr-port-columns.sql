-- Migration: NVR NAT port reachability for puntos_venta (spec 0013, Ciberseguridad)
-- monitor_puntos_wpp.py ya escribe active/latency/updated_at en esta tabla (ping ICMP
-- al hAP lite). Esta migración agrega el resultado de un segundo chequeo: si el puerto
-- NAT del grabador (4455 o 4456, ver spec 0013 §0) respondió en la última corrida.
-- nvr_port = NULL significa "sin puerto abierto" (host caído o puerto cerrado), no
-- "sin revisar" -- se sobreescribe en cada corrida, igual que active/latency.
-- Run this in the Supabase SQL Editor.

ALTER TABLE puntos_venta
ADD COLUMN IF NOT EXISTS nvr_port INTEGER DEFAULT NULL;

ALTER TABLE puntos_venta
ADD COLUMN IF NOT EXISTS nvr_checked_at TIMESTAMPTZ DEFAULT NULL;
