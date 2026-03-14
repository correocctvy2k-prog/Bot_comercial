-- sql/update_padron_categories.sql
-- Actualización del padrón para soportar múltiples categorías de participantes

-- 1. Agregar la columna categoria si no existe
ALTER TABLE public.asamblea_padron 
ADD COLUMN IF NOT EXISTS categoria TEXT DEFAULT 'ACCIONISTA';

-- 2. Comentario sobre los valores permitidos (Lógica de negocio)
-- Valores sugeridos: 'ACCIONISTA', 'INVITADO', 'REPRESENTANTE_LEGAL', 'APODERADO'
COMMENT ON COLUMN asamblea_padron.categoria IS 'Categoría del participante para ramificar la lógica del bot.';

-- 3. Actualizar la tabla de registros para guardar también la categoría detectada
ALTER TABLE public.asamblea_registro
ADD COLUMN IF NOT EXISTS categoria_oficial TEXT;

-- 4. Actualizar la tabla de sesiones para persistir la categoría durante el flujo
ALTER TABLE public.bot_sessions
ADD COLUMN IF NOT EXISTS categoria_oficial TEXT;
