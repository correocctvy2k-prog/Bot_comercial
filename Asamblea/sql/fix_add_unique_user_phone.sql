-- ========================================================
-- FIX #4: Agregar restricción UNIQUE en asamblea_registro(user_phone)
-- Previene registros duplicados causados por race conditions en el bot.
-- Ejecución: Una sola vez en Supabase SQL Editor
-- ========================================================

-- Paso 1: Eliminar duplicados actuales (mantener el más reciente por user_phone)
DELETE FROM asamblea_registro
WHERE id NOT IN (
    SELECT MAX(id)
    FROM asamblea_registro
    GROUP BY user_phone
);

-- Paso 2: Agregar la restricción UNIQUE
ALTER TABLE asamblea_registro
ADD CONSTRAINT uq_asamblea_registro_user_phone UNIQUE (user_phone);

-- ✅ Hecho. El bot ahora usará upsert con onConflict: 'user_phone'
-- para que el registro sea idempotente incluso ante webhooks duplicados.
