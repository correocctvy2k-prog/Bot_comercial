# ChatBot Soporte Técnico - Backend Server

Servidor Node.js / Express para la gestión automatizada de soporte técnico a través de WhatsApp Business API, integrado con OpenAI Assistant, Supabase y panel interactivo embebido en el CRM Skylab.

## 🚀 Características
- **Webhook de WhatsApp:** Recepción y procesamiento de mensajes en tiempo real.
- **Asistente de IA (OpenAI):** Respuestas inteligentes basadas en contexto técnico.
- **Base de Datos (Supabase):** Registro persistente de interacciones y tickets.
- **Panel Dashboard:** Vista web embebible con sincronización de temas (Light/Dark).

## 🛠️ Instalación y Uso

1. Clonar el repositorio y navegar a la carpeta:
   ```bash
   cd ChatBotSoporte
   ```

2. Instalar dependencias:
   ```bash
   npm install
   ```

3. Crear el archivo `.env` tomando como base `.env.example`:
   ```bash
   cp .env.example .env
   ```

4. Iniciar el servidor:
   ```bash
   npm start
   ```

5. El servidor estará corriendo en `http://localhost:3004`.
