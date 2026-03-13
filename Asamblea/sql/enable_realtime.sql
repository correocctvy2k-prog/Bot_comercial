-- sql/enable_realtime.sql
-- Ejecuta este script en el SQL Editor de Supabase para habilitar las actualizaciones en tiempo real.

-- 1. Habilitar la replicación para las tablas principales
ALTER TABLE public.asamblea_registro REPLICA IDENTITY FULL;
ALTER TABLE public.asamblea_votos REPLICA IDENTITY FULL;
ALTER TABLE public.asamblea_encuestas REPLICA IDENTITY FULL;
ALTER TABLE public.interactions_log REPLICA IDENTITY FULL;

-- 2. Asegurar que las tablas estén en la publicación 'supabase_realtime'
-- Intentamos agregar cada una (si ya están, fallará silenciosamente o dará un aviso manejable)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'asamblea_registro'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.asamblea_registro;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'asamblea_votos'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.asamblea_votos;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'asamblea_encuestas'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.asamblea_encuestas;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'interactions_log'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.interactions_log;
    END IF;
END $$;
