-- Tabla para la Cola de Trabajos del Bot
-- Permite persistencia, reintentos y auditoría.

CREATE TABLE IF NOT EXISTS public.bot_queue (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    status TEXT DEFAULT 'pending', -- pending, processing, completed, failed
    type TEXT DEFAULT 'incoming_message', -- incoming_message, outgoing_message, etc.
    request_payload JSONB, -- El JSON completo que llega del webhook o n8n
    response_data JSONB,   -- El resultado del procesamiento
    error_log TEXT,        -- Detalles si falla
    
    -- Índices para búsqueda rápida por estado
    CONSTRAINT valid_status CHECK (status IN ('pending', 'processing', 'completed', 'failed'))
);

-- Índice para que el Worker encuentre rápido los pendientes
CREATE INDEX IF NOT EXISTS idx_bot_queue_status ON public.bot_queue(status) WHERE status = 'pending';

-- Permisos (RLS) - Ajustar según necesidad
ALTER TABLE public.bot_queue ENABLE ROW LEVEL SECURITY;

-- Permitir lectura/escritura anonima (SOLO PARA DEV/MVP, en Prod usar Service Role)
CREATE POLICY "Enable access to all users" ON public.bot_queue FOR ALL USING (true) WITH CHECK (true);

-- (Opcional) Activar Realtime para esta tabla
-- Esto se hace usualmente desde el Dashboard de Supabase -> Database -> Replication
-- Pero si tienes permisos de superusuario:
-- ALTER PUBLICATION supabase_realtime ADD TABLE bot_queue;
