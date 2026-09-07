# GitHub Copilot — instrucciones del repo

Puntero al modelo de trabajo canónico. **No dupliques reglas aquí.**

Antes de sugerir o generar cambios, aplica lo definido en
[`docs/WORKING_MODEL.md`](../docs/WORKING_MODEL.md) (idéntico para toda herramienta de IA;
ver `AGENTS.md`).

Puntos clave:

- **SDD**: el cambio necesita una spec en `specs/NNNN-slug/`.
- **Producto norte = `CRM_Frontend`**. Sigue `CRM_Frontend/docs/design-system.md`:
  superficies con tokens de tema (`bg-card`, `bg-muted`, `border-border`), nunca `bg-white/5`.
- Config del frontend es **build-time** (`VITE_*`); no introducir configuración en runtime.
- Verificación real en Docker local `http://127.0.0.1:3003/` antes de dar por terminado.
- Rama por tarea; nunca commit directo a `main`.
- Actualizar `CHANGELOG.md`, ficha de módulo y lección aprendida en el mismo PR.
