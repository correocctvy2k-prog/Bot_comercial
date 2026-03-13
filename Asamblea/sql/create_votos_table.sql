-- sql/create_votos_table.sql

-- Tabla para rastrear qué encuestas se han enviado
CREATE TABLE IF NOT EXISTS public.asamblea_encuestas (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  pregunta text NOT NULL,
  opciones text[] NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

-- Tabla para registrar cada voto individual
CREATE TABLE IF NOT EXISTS public.asamblea_votos (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  encuesta_id uuid REFERENCES public.asamblea_encuestas(id),
  user_phone text NOT NULL,
  opcion_index int NOT NULL,
  opcion_texto text,
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE(encuesta_id, user_phone) -- Un voto por persona por encuesta
);

-- Index para reportes
CREATE INDEX IF NOT EXISTS idx_votos_encuesta ON public.asamblea_votos (encuesta_id);
