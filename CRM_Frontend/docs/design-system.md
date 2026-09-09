# CRM_Frontend — Sistema de diseño ("ADN premium")

Guía obligatoria para cualquier UI nueva o modificada en `CRM_Frontend`. El objetivo es que
todo el panel se vea como **un solo producto**, en tema claro y oscuro, sin importar quién
(o qué IA) escriba el componente.

Stack visual: **Tailwind 3** + **shadcn/ui (Radix)** + **lucide-react** + **Recharts**.
Tokens en `src/index.css` (`:root` y `.dark`). Tema gestionado por `components/theme-provider.jsx`.

---

## 1. Regla de oro: tokens de tema, nunca colores crudos para superficie/borde

Usar siempre las variables semánticas de Tailwind mapeadas a los tokens:

| Uso | Clase |
|-----|-------|
| Fondo de página | `bg-background` |
| Fondo de panel / tarjeta | `bg-card` (con opacidad: `bg-card/60`) |
| Fondo sutil / cabecera de tabla / hover de fila | `bg-muted/40` |
| Borde | `border-border` / `border-border/80` |
| Texto principal | `text-foreground` |
| Texto secundario | `text-muted-foreground` |
| Acento / interacción | `text-primary`, `bg-primary`, `text-primary-foreground` |

**Prohibido** para superficies, bordes y hovers: `bg-white/5`, `bg-white/10`, `border-white/10`,
`text-slate-*` como color base, `bg-black/*`. Solo se ven en un tema y "rompen" en el otro.

Colores crudos **sí** se permiten para **identidad semántica puntual**: estados
(`text-emerald-400` ok, `text-rose-500` error), marcas de canal (`#25D366` WhatsApp,
`#2AABEE` Telegram), y acentos de podio (oro/plata/bronce). Nunca para el chasis del componente.

---

## 2. Superficie estándar de panel

```jsx
<div className="bg-card/60 backdrop-blur-xl border border-border/80 rounded-2xl shadow-sm">
```

Variantes válidas: `bg-card/40 backdrop-blur-sm` (paneles secundarios), `bg-card/70` (cabeceras).
Hover de panel interactivo: `hover:border-primary/30 transition-all`.

### Radios
| Elemento | Radio |
|----------|-------|
| Botones, inputs, chips | `rounded-xl` (chips pequeños `rounded-lg`) |
| Paneles y tarjetas | `rounded-2xl` |
| Contenedor de cabecera de módulo | `rounded-3xl` |

### Sombras
`shadow-sm` por defecto; `shadow-md` para la cabecera del módulo; `shadow-lg` solo destacados (podio).

---

## 3. Tipografía

| Rol | Clase |
|-----|-------|
| **Encabezado de módulo (página)** | Título `text-2xl font-bold tracking-tight text-foreground`; subtítulo `text-sm font-medium text-muted-foreground` (frase, **no** mayúsculas). Usar `src/components/PageHeader.jsx` (`{ icon, title, subtitle, actions }`). |
| Título de sección con icon-badge (dentro de página) | `text-lg font-black tracking-tight text-foreground` |
| Título de panel / gráfica | `text-base font-semibold` |
| Subtítulo de sección/panel | `text-xs text-muted-foreground font-medium` |
| Micro-etiqueta (KPI, encabezado de columna) | `text-[11px] font-extrabold text-muted-foreground uppercase tracking-wider` (o `text-[10px]`) |
| Valor KPI | `text-2xl sm:text-3xl font-black tracking-tight` |
| Número destacado en tabla | `font-black text-sm` |

> El **encabezado de módulo** (el `<h1>` superior de cada página del shell) usa peso `bold`,
> no `black`: es más legible en títulos largos. El `font-black` se reserva para valores KPI,
> números de tabla e icon-badges. Referencia: `src/pages/Contacts.jsx` (spec 0006).

---

## 4. Icon-badge (identificador de sección)

```jsx
<div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600
                flex items-center justify-center text-white font-black shadow-inner shrink-0">
  <Icono size={22} />
</div>
```

El par de colores del gradiente identifica la sección (Analítica: azul→índigo; Ranking:
ámbar→amarillo). Iconos siempre de `lucide-react`, `size` 14–22.

---

## 5. Control segmentado (toggle de vistas / filtros)

```jsx
<div className="flex bg-background border border-border rounded-xl p-1 gap-1">
  <button className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all
    ${active
      ? "bg-primary text-primary-foreground shadow-sm"
      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"}`}>
    …
  </button>
</div>
```

Versión grande (selector de módulo): `px-5 py-2.5 rounded-xl text-xs`, contenedor `rounded-2xl`.

---

## 6. Tablas

- Contenedor: superficie estándar + `overflow-hidden`; scroll horizontal propio
  (`<div className="overflow-x-auto">`), la página nunca hace scroll-x.
- Cabecera (`<thead tr>` y barra superior): `bg-muted/40 border-b border-border/80`,
  texto `text-muted-foreground font-extrabold uppercase tracking-wider text-[10px]`.
- Fila: `hover:bg-muted/40 transition-colors`; separadores `divide-y divide-border/40`.
- Columna ordenable: la cabecera es un `<button>` con chevron (`ChevronUp`/`ChevronDown`),
  activo `text-primary`, inactivo `opacity-30`.
- Paginación: barra inferior `bg-muted/40 border-t border-border/80`; botones
  `border border-border bg-card hover:border-primary/40 hover:bg-muted/60 disabled:opacity-40`.

---

## 7. Gráficas (Recharts)

- Alturas vía `ResponsiveContainer`; `CartesianGrid stroke="rgba(255,255,255,0.05)"` sutil.
- Ejes: `tick={{ fontSize: 11, fill: "#888" }}`, `tickLine={false}`, `axisLine={false}`.
- Tooltip: componente propio con superficie estándar (`bg-card border border-border rounded-lg`).
- Series de canal con sus colores de marca; degradados con `<linearGradient>` a opacidad 0.

---

## 8. Densidad y layout

- Dashboards compactos y escaneables: útiles en una sola pantalla, sin scroll infinito.
- Grids: `grid gap-4` (KPIs), `gap-6` (paneles); `space-y-6`/`space-y-8` entre bloques.
- **No** crear landing pages, hero sections ni onboarding para herramientas internas.
- Estados vacíos siempre resueltos ("Sin interacciones aún", "No se encontraron…"),
  nunca un panel en blanco ni un crash.

---

## 9. Checklist antes de entregar UI

- [ ] Solo tokens de tema para chasis; probado en claro y oscuro.
- [ ] Radios, sombras y tipografía según esta guía.
- [ ] Iconos de `lucide-react`.
- [ ] Estados vacíos y de error contemplados.
- [ ] Sin scroll horizontal de página.
- [ ] `npm run lint` y `npm run build` verdes.
