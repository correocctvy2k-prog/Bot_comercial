-- sql/create_padron_table.sql
-- Tabla para control de acceso por número de teléfono (padrón de accionistas)

-- Habilitar RLS
-- (Opcional: puedes deshabilitar RLS para pruebas rápidas si no tienes políticas configuradas)

CREATE TABLE IF NOT EXISTS public.asamblea_padron (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wa_id TEXT NOT NULL UNIQUE, -- Formato: 573001234567
    nombre TEXT NOT NULL,
    documento TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Habilitar Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE asamblea_padron;

-- Comentario informativo
COMMENT ON TABLE asamblea_padron IS 'Lista blanca de números de teléfono autorizados para interactuar con el bot de Asamblea.';

-- Ejemplo de inserción para pruebas del usuario (reemplazar con datos reales)
-- INSERT INTO asamblea_padron (wa_id, nombre, documento) VALUES ('57XXXXXXXXXX', 'Nombre Accionista', '12345678');
