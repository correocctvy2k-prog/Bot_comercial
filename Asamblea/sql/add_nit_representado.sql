-- Migration: add nit_representado for Apoderados/Representantes Legales
-- This column stores the NIT/accicodi of the COMPANY being represented in SIISS
-- For regular Accionistas and Invitados, this column remains NULL.
-- Run this in the Supabase SQL Editor.

ALTER TABLE asamblea_padron
ADD COLUMN IF NOT EXISTS nit_representado TEXT DEFAULT NULL;

-- Example: Update Sanquin's representative record
-- UPDATE asamblea_padron SET nit_representado = '<NIT_SANQUIN_EN_SIISS>' WHERE documento LIKE '%3127570549%';

-- Example: Update Luceyda's company
-- UPDATE asamblea_padron SET nit_representado = '<NIT_EMPRESA_LUCEYDA_EN_SIISS>' WHERE wa_id = '<LUCEYDA_WA_ID>';

-- Once nit_representado is set, the bot will automatically use it
-- instead of the representative's personal cedula when calling SIISS.
