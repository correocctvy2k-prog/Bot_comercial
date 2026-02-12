-- SECURITY HARDENING
-- Bloquear acceso público a la cola de trabajos.
-- Solo el "Service Role" (Backend/n8n) podrá escribir.

-- 1. Eliminar política permisiva anterior
DROP POLICY IF EXISTS "Enable access to all users" ON public.bot_queue;

-- 2. Asegurar que RLS está activo
ALTER TABLE public.bot_queue ENABLE ROW LEVEL SECURITY;

-- 3. Crear política restrictiva (Solo Service Role)
-- Esta política bloquea cualquier petición que venga con la "anon key" del frontend.
CREATE POLICY "Service Role Only" ON public.bot_queue
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Notar que no creamos política para "anon" o "authenticated", 
-- por lo que por defecto tendrán DENY ALL.

-- 4. (Opcional) Si quisieras permitir lectura protegida a usuarios autenticados:
-- CREATE POLICY "Users can read own jobs" ON public.bot_queue
--     FOR SELECT
--     TO authenticated
--     USING (auth.uid() = user_id); -- Si tuvieras columna user_id
