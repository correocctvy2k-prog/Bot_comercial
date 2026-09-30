-- Fix: cyber_known_haplites tiene RLS activado por defecto (comportamiento estándar
-- de Supabase en tablas nuevas), sin ninguna policy -- eso bloquea la lectura con la
-- clave anon que usa el frontend (CRM_Frontend), aunque la escritura con la clave
-- service_role sí funciona. Confirmado 2026-09-21: las 96 filas se sincronizaron bien
-- (visibles con service_role), pero el frontend veía 0 filas hasta este fix.
-- Run this in the Supabase SQL Editor.

ALTER TABLE cyber_known_haplites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on cyber_known_haplites"
ON cyber_known_haplites
FOR SELECT
USING (true);
