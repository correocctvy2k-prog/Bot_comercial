---
name: creador-de-habilidades
description: Una habilidad para crear otras habilidades en el workspace, con soporte completo para el idioma español.
---

# Creador de Habilidades

Esta habilidad te permite generar nuevas habilidades para Antigravity siguiendo los estándares oficiales. Está diseñada específicamente para trabajar en español.

## Cuándo usar esta habilidad
- Cuando necesites crear una nueva herramienta o conjunto de instrucciones especializadas para el agente.
- Cuando quieras estandarizar la creación de habilidades en un proyecto.
- Cuando necesites una plantilla base para una nueva habilidad en español.

## Cómo usar esta habilidad
Para crear una nueva habilidad, sigue estos pasos:

1. **Definir el nombre**: El nombre debe ser descriptivo y usar minúsculas con guiones (kebab-case).
2. **Crear el directorio**: Las habilidades del workspace deben guardarse en `.agent/skills/<nombre-de-la-habilidad>/`.
3. **Generar el archivo SKILL.md**: Este es el archivo principal. Debe contener:
    - **YAML Frontmatter**: Con los campos `name` y `description`.
    - **Cuerpo en Markdown**: Con instrucciones claras, casos de uso y ejemplos.
4. **Estructura Recomendada**:
    - `SKILL.md` (Obligatorio)
    - `scripts/` (Opcional, para utilidades)
    - `examples/` (Opcional, para mostrar cómo usar la habilidad)
    - `resources/` (Opcional, para archivos adicionales)

## Plantilla SKILL.md (Cópiala y edítala)
```markdown
---
name: nombre-de-la-habilidad
description: Una descripción breve y clara de lo que hace esta habilidad.
---

# Nombre de la Habilidad

Descripción detallada de la habilidad.

## Propósito
¿Por qué existe esta habilidad?

## Guía de Uso
1. Paso uno...
2. Paso dos...

## Ejemplos
- Ejemplo 1: "Haz esto..."
```

## Reglas Críticas
- Siempre usa rutas absolutas si es necesario referenciar archivos.
- Las habilidades deben ser modulares y no duplicar funciones existentes.
- Mantén la documentación en español para facilitar la colaboración.
