import { Component, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BellRing,
  Boxes,
  BrainCircuit,
  Building2,
  Camera,
  CalendarDays,
  CarFront,
  Cctv,
  CheckCircle2,
  Clock,
  Database,
  HardDrive,
  ImageIcon,
  MapPin,
  MonitorPlay,
  Radio,
  RefreshCw,
  ScanEye,
  Search,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Store,
  Trophy,
  TrendingUp,
  Unplug,
  UsersRound,
  Video,
  Wrench,
  XCircle,
} from "lucide-react";
const CCTV_API_BASE = (import.meta.env.VITE_CCTV_API_BASE || "").replace(/\/$/, "");
import {
  Bar,
  BarChart,
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { pointsService } from "@/services/points.service";
import { evaluateOperationalSchedule, observedTimeToMinutes } from "@/utils/operationalSchedule";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const snapshot = {
  meta: {
    label: "Corte conciliado · 20 ago 2026",
    source: "Catálogo CCTV + DSS + SIIS + programación anual",
  },
  totals: {
    locations: 85,
    devices: 111,
    channels: 423,
    implemented: 45,
    projectTotal: 114,
    siisOffline: 9,
  },
  zones: [
    {
      name: "Palmira",
      total: 50,
      covered: 43,
      devices: 72,
      channels: 275,
      attention: 7,
    },
    {
      name: "Candelaria",
      total: 12,
      covered: 10,
      devices: 12,
      channels: 45,
      attention: 2,
    },
    {
      name: "Pradera",
      total: 7,
      covered: 6,
      devices: 7,
      channels: 24,
      attention: 1,
    },
    {
      name: "Occidente",
      total: 6,
      covered: 5,
      devices: 7,
      channels: 27,
      attention: 1,
    },
    {
      name: "Florida",
      total: 5,
      covered: 4,
      devices: 5,
      channels: 19,
      attention: 1,
    },
    {
      name: "Amaime",
      total: 4,
      covered: 3,
      devices: 5,
      channels: 21,
      attention: 1,
    },
    {
      name: "Rozo",
      total: 1,
      covered: 1,
      devices: 3,
      channels: 12,
      attention: 1,
    },
  ],
  points: [
    {
      code: "PAL-URIBE",
      name: "Tienda Uribe",
      zone: "Palmira",
      type: "Punto de venta",
      system: "NVR",
      coverage: "CCTV + alarma",
      channels: 4,
      state: "online",
      project: "Implementado",
      event: "Cierre detectado 14:17",
      evidence: "Correo CCTV",
      tech: ["CCTV", "PIR", "Botón de pánico"],
      action: "Sin acción pendiente",
    },
    {
      code: "PAL-ROZO",
      name: "Oficina Rozo",
      zone: "Rozo",
      type: "Oficina",
      system: "NVR",
      coverage: "CCTV + alarma",
      channels: 8,
      state: "attention",
      project: "Implementado reutilizado",
      event: "Apertura detectada 06:02",
      evidence: "Correo CCTV",
      tech: ["CCTV", "PIR", "Magnético"],
      action: "Validar enlace SIIS/DSS",
    },
    {
      code: "PAL-COSTARICA",
      name: "Tienda Costa Rica",
      zone: "Palmira",
      type: "Punto de venta",
      system: "MicroSD",
      coverage: "Cámara autónoma",
      channels: 1,
      state: "online",
      project: "Implementado",
      event: "Apertura detectada 07:58",
      evidence: "Correo CCTV",
      tech: ["Cámara IP", "MicroSD"],
      action: "Sin acción pendiente",
    },
    {
      code: "PAL-LLANOGRANDE",
      name: "Llano Grande",
      zone: "Palmira",
      type: "Punto de venta",
      system: "NVR",
      coverage: "CCTV inteligente",
      channels: 4,
      state: "online",
      project: "Implementado",
      event: "Horario conciliado",
      evidence: "Motor de horarios",
      tech: ["CCTV", "Detección inteligente"],
      action: "Monitorear precisión",
    },
    {
      code: "PAL-LICORES2283",
      name: "Licores 2283",
      zone: "Palmira",
      type: "Punto de venta",
      system: "MicroSD",
      coverage: "Cámara autónoma",
      channels: 1,
      state: "alert",
      project: "Implementado reutilizado",
      event: "Cierre sin apertura asociada",
      evidence: "Correo CCTV",
      tech: ["Cámara IP", "MicroSD"],
      action: "Conciliar evento de apertura",
    },
    {
      code: "CAN-CENTRO",
      name: "Candelaria Centro",
      zone: "Candelaria",
      type: "Punto de venta",
      system: "NVR",
      coverage: "CCTV",
      channels: 4,
      state: "online",
      project: "Pendiente",
      event: "Sin novedad en el corte",
      evidence: "DSS",
      tech: ["CCTV"],
      action: "Programar modernización",
    },
  ],
  alerts: [
    {
      severity: "critical",
      point: "Licores 2283",
      title: "Secuencia incompleta",
      detail: "Cierre sin una apertura asociada en el periodo.",
      source: "Correo CCTV",
      action: "Conciliar correo y horario",
    },
    {
      severity: "warning",
      point: "Oficina Rozo",
      title: "Identidad por confirmar",
      detail: "La relación SIIS/DSS requiere revisión humana.",
      source: "Conciliación",
      action: "Validar alias",
    },
    {
      severity: "warning",
      point: "Red CCTV",
      title: "Códigos retenidos",
      detail:
        "6 códigos siguen fuera del catálogo para evitar asociaciones incorrectas.",
      source: "Auditoría",
      action: "Revisión humana",
    },
  ],
};

const tone = {
  online: "text-emerald-400 border-emerald-500/25 bg-emerald-500/10",
  attention: "text-amber-400 border-amber-500/25 bg-amber-500/10",
  alert: "text-rose-400 border-rose-500/25 bg-rose-500/10",
};
const labels = { online: "Operativo", attention: "Revisar", alert: "Alerta" };
const Fact = ({ label, value, mono = false }) => (
  <div className="p-3 rounded-xl border border-border/50 bg-background/40">
    <p className="text-[10px] uppercase tracking-[.14em] text-muted-foreground">
      {label}
    </p>
    <p className={`font-semibold mt-1 ${mono ? "font-mono" : ""}`}>{value}</p>
  </div>
);
const Snapshot = ({ generatedAt }) => (
  <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 px-4 py-2.5 text-xs">
    <div className="flex items-center gap-2 font-bold text-blue-300">
      <Database size={14} />
      Fuentes operativas conectadas
    </div>
    <p className="text-muted-foreground mt-0.5">
      CRM/SIIS · DSS · catálogo CCTV
      {generatedAt
        ? ` · ${new Date(generatedAt).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" })}`
        : ""}
    </p>
  </div>
);
const ASSET_CATALOG = [
  ["NVR", "NVR", true, true],
  ["DVR", "DVR", false, false],
  ["CAMERA", "Cámara", true, false],
  ["STANDALONE_CAMERA", "Cámara única MicroSD", true, true],
  ["PIR", "Sensor PIR", false, false],
  ["SIREN", "Sirena", false, false],
  ["MAGNETIC_SENSOR", "Sensor magnético", false, false],
  ["PANIC_BUTTON", "Botón de pánico", false, false],
  ["POE_SWITCH", "Switch PoE", false, false],
  ["UPS", "UPS", false, false],
  ["RACK", "Rack", false, false],
  ["HAPLITE_ROUTER", "Router HapLite", true, true],
];

function Kpi({ icon, title, value, badge, color = "text-blue-400" }) {
  const IconComponent = icon;
  return (
    <div className="group relative overflow-hidden rounded-xl border border-white/[.07] bg-gradient-to-br from-[#111827]/95 to-[#080d18]/95 p-4 shadow-lg transition-all hover:-translate-y-0.5 hover:border-white/15 hover:shadow-blue-950/30">
      <div
        className={`absolute -right-5 -top-5 h-20 w-20 rounded-full bg-current opacity-[.055] blur-xl ${color}`}
      />
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[.14em] text-slate-400">
            {title}
          </p>
          <p className="mt-1.5 text-3xl font-black tracking-tight text-white">
            {value}
          </p>
        </div>
        <div
          className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-white/[.08] bg-white/[.04] ${color}`}
        >
          <IconComponent className="h-6 w-6" />
        </div>
      </div>
      <div className="mt-3 flex items-center gap-1.5 border-t border-white/[.06] pt-2.5">
        <span className={`h-1.5 w-1.5 rounded-full bg-current ${color}`} />
        <span className="truncate text-[11px] font-medium text-slate-400">
          {badge}
        </span>
      </div>
    </div>
  );
}

const lifecycleHelp = {
  EOL: {
    label: "EOL",
    title: "Fin de vida comercial",
    detail:
      "Dahua identifica este modelo como descontinuado. Puede continuar operando, pero su disponibilidad, repuestos y evolución de firmware pueden ser limitados.",
    recommendation:
      "Recomendación: verificar firmware y repuestos, evaluar criticidad y programar su modernización.",
  },
  ACTIVE: {
    label: "Activo",
    title: "Producto vigente",
    detail:
      "El modelo figura como producto vigente en la evidencia oficial registrada.",
    recommendation:
      "Recomendación: mantener firmware, configuración y fecha de soporte documentados.",
  },
  "POR VERIFICAR": {
    label: "Por verificar",
    title: "Ciclo de vida no confirmado",
    detail:
      "El modelo fue identificado en DSS, pero aún no cuenta con una ficha oficial conciliada en el catálogo local.",
    recommendation:
      "Recomendación: validar el modelo exacto antes de tomar decisiones de renovación.",
  },
};
function LifecycleBadge({ value }) {
  const info = lifecycleHelp[value] || lifecycleHelp["POR VERIFICAR"];
  const warning = value === "EOL";
  return (
    <span className="group/lifecycle relative inline-flex">
      <Badge
        variant="outline"
        tabIndex={0}
        aria-label={`${info.title}. ${info.recommendation}`}
        className={`cursor-help ${warning ? "border-amber-500/25 bg-amber-500/[.06] text-amber-400" : "border-emerald-500/25 bg-emerald-500/[.06] text-emerald-400"}`}
      >
        {warning && <AlertTriangle size={11} className="mr-1" />}
        {info.label}
      </Badge>
      <span
        role="tooltip"
        className="pointer-events-none absolute right-0 top-full z-30 mt-2 hidden w-72 rounded-xl border border-white/10 bg-[#07101f] p-3 text-left shadow-2xl group-hover/lifecycle:block group-focus-within/lifecycle:block"
      >
        <span
          className={`block text-xs font-black ${warning ? "text-amber-300" : "text-emerald-300"}`}
        >
          {info.title}
        </span>
        <span className="mt-1.5 block text-[11px] font-normal leading-relaxed text-slate-300">
          {info.detail}
        </span>
        <span className="mt-2 block border-t border-white/[.07] pt-2 text-[11px] font-semibold leading-relaxed text-white">
          {info.recommendation}
        </span>
      </span>
    </span>
  );
}

const categoryVisual = {
  NVR: {
    icon: HardDrive,
    color: "text-violet-400",
    surface: "bg-violet-500/10",
  },
  "Cámara IP": {
    icon: Video,
    color: "text-cyan-400",
    surface: "bg-cyan-500/10",
  },
  ANPR: { icon: ScanEye, color: "text-blue-400", surface: "bg-blue-500/10" },
  Alarma: { icon: BellRing, color: "text-rose-400", surface: "bg-rose-500/10" },
  "Grabador HDCVI": {
    icon: Database,
    color: "text-amber-400",
    surface: "bg-amber-500/10",
  },
  MVR: { icon: CarFront, color: "text-sky-500", surface: "bg-sky-500/10" },
  Servidor: { icon: Database, color: "text-indigo-500", surface: "bg-indigo-500/10" },
  "Por clasificar": {
    icon: AlertTriangle,
    color: "text-slate-400",
    surface: "bg-slate-500/10",
  },
};
function TechnologyPanel({ technology }) {
  const [category, setCategory] = useState("Todos");
  if (!technology)
    return (
      <Card className="border-white/[.07] bg-card/40">
        <CardContent className="py-20 text-center text-muted-foreground">
          Cargando catálogo tecnológico…
        </CardContent>
      </Card>
    );
  const categories = [
    "Todos",
    ...technology.categories.map((item) => item.name),
  ];
  const visible = technology.models.filter(
    (model) => category === "Todos" || model.category === category,
  );
  return (
    <Card className="overflow-hidden border-white/[.07] bg-gradient-to-b from-[#101827]/90 to-[#090e18]/90 shadow-xl">
      <CardHeader className="border-b border-white/[.05] pb-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-28 shrink-0 place-items-center rounded-xl border border-red-500/15 bg-white px-3 py-2 shadow-lg shadow-red-950/10">
              <img
                src={`${CCTV_API_BASE}/api/cctv/media/logo.png`}
                alt="Dahua Technology"
                className="max-h-8 max-w-full object-contain"
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-sm font-black uppercase tracking-wide">
                  Ecosistema Dahua
                </CardTitle>
              </div>
              <CardDescription>
                Tecnología instalada · {technology.summary.models} referencias · {technology.summary.devices} equipos inventariados
              </CardDescription>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {categories.map((item) => (
              <button
                key={item}
                onClick={() => setCategory(item)}
                className={`rounded-lg border px-2.5 py-1.5 text-[10px] font-bold transition ${category === item ? "border-blue-500/40 bg-blue-500/15 text-blue-300" : "border-white/[.07] text-slate-400 hover:bg-white/[.04]"}`}
              >
                {item}
                {item !== "Todos" && (
                  <span className="ml-1 text-slate-500">
                    {technology.categories.find((x) => x.name === item)?.value}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-5 pt-5 lg:grid-cols-[minmax(22rem,.62fr)_minmax(0,1.38fr)]">
        <div className="self-start rounded-xl border border-white/[.05] bg-black/10 p-3.5">
          <div className="mb-2 flex items-center justify-between text-[10px]">
            <div>
              <span className="font-bold uppercase tracking-wider text-slate-400">Distribución por tipo</span>
              <p className="mt-1 text-[9px] text-slate-500">Selecciona una barra para filtrar el catálogo</p>
            </div>
            {category !== "Todos" && <button onClick={() => setCategory("Todos")} className="rounded-md border border-cyan-500/20 bg-cyan-500/10 px-2 py-1 font-bold text-cyan-300 hover:bg-cyan-500/15">Limpiar filtro</button>}
          </div>
          <div className="h-[21rem]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={technology.categories}
                layout="vertical"
                accessibilityLayer={false}
                margin={{ top: 8, left: 4, right: 28, bottom: 4 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  horizontal={false}
                  stroke="#253044"
                  opacity={0.4}
                />
                <XAxis type="number" tickLine={false} axisLine={false} />
                <YAxis
                  dataKey="name"
                  type="category"
                  width={105}
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  cursor={{ fill: "transparent" }}
                  contentStyle={{
                    background: "#08101f",
                    border: "1px solid #263449",
                    borderRadius: 10,
                  }}
                />
                <Bar
                  dataKey="value"
                  name="Equipos"
                  barSize={24}
                  radius={[0, 5, 5, 0]}
                  className="cursor-pointer"
                  onClick={(entry) => setCategory(entry.name)}
                >
                  {technology.categories.map((entry) => <Cell key={entry.name} fill={category === "Todos" || category === entry.name ? (category === entry.name ? "#22d3ee" : "#8b5cf6") : "#334155"} className="transition-opacity hover:opacity-80 focus:outline-none" style={{outline:"none"}} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-white">
                {category === "Todos" ? "Todos los modelos" : category}
              </p>
              <p className="text-[10px] text-muted-foreground">
                Verificado = ficha oficial · Clasificado = nomenclatura DSS
              </p>
            </div>
            <Badge variant="secondary">{visible.length} modelo(s)</Badge>
          </div>
          <div className="grid max-h-[34rem] gap-2.5 overflow-y-auto pr-1 xl:grid-cols-2">
            {visible.map((model) => (
              <TechnologyModelCard key={model.model} model={model} />
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
function TechnologyModelCard({ model }) {
  const visual =
    categoryVisual[model.category] || categoryVisual["Por clasificar"];
  const Icon = visual.icon;
  return (
    <div className="group/model grid min-h-[12rem] overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-900 shadow-sm transition duration-300 hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-lg hover:shadow-blue-950/10 sm:grid-cols-[38%_62%]">
      <div className="relative grid min-h-40 place-items-center overflow-hidden border-b border-slate-100 bg-gradient-to-br from-white via-slate-50 to-blue-50/50 px-4 py-3 sm:min-h-full sm:border-b-0 sm:border-r">
          <img
            src={model.imageUrl}
            alt={
              model.imageMode === "EXACT"
                ? `Imagen de ${model.model}`
                : `Imagen referencial de ${model.category}`
            }
            className="h-32 w-full object-contain drop-shadow-md transition duration-300 group-hover/model:scale-105 sm:h-28"
          />
          <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/90 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-slate-600 shadow-sm">
            {model.category}
            {model.hasAi && <BrainCircuit size={13} className="text-violet-600" aria-label="Dispositivo con inteligencia artificial" />}
          </span>
      </div>
      <div className="flex min-w-0 flex-col p-3.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <Icon size={17} className={visual.color} />
                <b className="block truncate text-sm text-slate-950" title={model.model}>
                  {model.model}
                </b>
              </div>
              <p className="mt-1 truncate text-[11px] font-medium text-slate-500">
                {model.family}
              </p>
            </div>
            <span className="shrink-0 rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-black text-white">{model.count}<small className="ml-1 font-medium text-slate-300">uds.</small></span>
          </div>
          <div className="mt-2 flex items-center justify-between border-y border-slate-100 py-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Ciclo de vida</span>
            {model.verified ? <LifecycleBadge value={model.lifecycle} /> : <Badge variant="outline" className="shrink-0 border-slate-300 bg-slate-50 text-[9px] text-slate-600">Por documentar</Badge>}
          </div>
          {(model.technologyMarks || []).length > 0 && <div className="mt-2 flex min-h-9 items-center gap-3 overflow-visible">{model.technologyMarks.map(mark=><img key={mark.key} src={mark.imageUrl} alt={mark.label} title={mark.label} className="h-8 w-20 object-contain" style={{transform:`scale(${mark.key === "ACUPICK" ? 0.82 : mark.key === "WIZSENSE" ? 1.45 : 1.15})`}}/>)}</div>}
          {model.technologies.length > 0 ? <div className="mt-2">
            <p className="mb-1.5 text-[9px] font-black uppercase tracking-wider text-slate-400">Características diferenciales</p>
            <div className="flex flex-wrap gap-1">
              {model.technologies.slice(0, 4).map((item) => (
                <span
                  key={item}
                  className="rounded-md border border-blue-100 bg-blue-50 px-1.5 py-0.5 text-[8px] font-semibold text-blue-700"
                >
                  {item}
                </span>
              ))}
            </div>
          </div> : <p className="mt-3 text-[10px] text-slate-500">Características pendientes de ficha oficial.</p>}
          {model.officialUrl && (
            <a
              href={model.officialUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-auto inline-flex items-center pt-2 text-[9px] font-black text-blue-700 hover:text-blue-900"
            >
              Ficha oficial <ArrowRight size={12} className="ml-1" />
            </a>
          )}
      </div>
    </div>
  );
}

const capabilityIcons = {
  kit: Cctv,
  single: Video,
  k35: Camera,
  analytics: ScanEye,
  ai: BrainCircuit,
  oszford: BellRing,
  unconfirmed: AlertTriangle,
};
const workflowStyle = {
  READY: {
    badge: "border-emerald-500/25 bg-emerald-500/10 text-emerald-300",
    border: "border-emerald-500/25",
    panel: "border-emerald-500/15 bg-emerald-500/[.05]",
    icon: CheckCircle2,
  },
  SYNC_PENDING: {
    badge: "border-blue-500/25 bg-blue-500/10 text-blue-300",
    border: "border-blue-500/25",
    panel: "border-blue-500/15 bg-blue-500/[.05]",
    icon: RefreshCw,
  },
  REVIEW_REQUIRED: {
    badge: "border-amber-500/25 bg-amber-500/10 text-amber-300",
    border: "border-amber-500/25",
    panel: "border-amber-500/15 bg-amber-500/[.05]",
    icon: AlertTriangle,
  },
  COMPLETE_REQUIRED: {
    badge: "border-rose-500/25 bg-rose-500/10 text-rose-300",
    border: "border-rose-500/25",
    panel: "border-rose-500/15 bg-rose-500/[.05]",
    icon: Unplug,
  },
};
function pointVisual(p) {
  const name = String(p.name || "").toUpperCase();
  if (p.isDouble)
    return {
      icon: UsersRound,
      label: "Punto doble",
      color: "text-violet-300",
      surface: "border-violet-500/20 bg-violet-500/10",
    };
  if (p.solutionKind === "SINGLE_CAMERA")
    return {
      icon: Video,
      label: "Punto pequeño",
      color: "text-cyan-300",
      surface: "border-cyan-500/20 bg-cyan-500/10",
    };
  if (p.type === "SHOPPING_CENTER")
    return {
      icon: ShoppingBag,
      label: "Centro comercial",
      color: "text-fuchsia-300",
      surface: "border-fuchsia-500/20 bg-fuchsia-500/10",
    };
  if (p.type === "SPORTSBOOK" || /SPORTBOOK|BETPLAY/.test(name))
    return {
      icon: Trophy,
      label: "Sportsbook",
      color: "text-amber-300",
      surface: "border-amber-500/20 bg-amber-500/10",
    };
  if (p.type === "OFFICE" && /PRINCIPAL|PPAL|EDIFICIO/.test(name))
    return {
      icon: Building2,
      label: "Oficina principal",
      color: "text-blue-300",
      surface: "border-blue-500/20 bg-blue-500/10",
    };
  if (p.type === "OFFICE")
    return {
      icon: Building2,
      label: "Oficina",
      color: "text-blue-300",
      surface: "border-blue-500/20 bg-blue-500/10",
    };
  if (p.type === "PARKING")
    return {
      icon: CarFront,
      label: "Parqueadero",
      color: "text-emerald-300",
      surface: "border-emerald-500/20 bg-emerald-500/10",
    };
  return {
    icon: Store,
    label: "Punto de venta",
    color: "text-slate-300",
    surface: "border-slate-500/20 bg-slate-500/10",
  };
}
function PointCard({ p, onChanged }) {
  const [open, setOpen] = useState(false),
    [editing, setEditing] = useState(false),
    [integralOpen, setIntegralOpen] = useState(false),
    [integralData, setIntegralData] = useState(null),
    [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  const [draft, setDraft] = useState({
    solutionKind: p.solutionKind === "UNCONFIRMED" ? "KIT" : p.solutionKind,
    cameraCount: p.channels || 1,
    notes: p.notes || "",
  });
  const capabilities = (p.tech || []).map((item) =>
    typeof item === "string" ? { key: "unconfirmed", label: item } : item,
  );
  const style = workflowStyle[p.workflowState] || workflowStyle.REVIEW_REQUIRED;
  const StateIcon = style.icon;
  const visual = pointVisual(p);
  const PointIcon = visual.icon;
  const formatDetailDate = (value) => value ? new Date(value).toLocaleString("es-CO", {dateStyle:"medium",timeStyle:"short"}) : "Sin registros";
  useEffect(() => {
    if (!integralOpen || integralData) return;
    fetch(`${CCTV_API_BASE}/api/cctv/locations/${p.id}/detail`)
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("No fue posible cargar la ficha")))
      .then(setIntegralData).catch((reason) => setError(reason.message));
  }, [integralOpen, integralData, p.id]);
  const sync = async () => {
    setSaving(true);
    setError("");
    try {
      const response = await fetch(
        `${CCTV_API_BASE}/api/cctv/locations/${p.id}/sync`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Actor": "skylab-local-user",
          },
        },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "No fue posible sincronizar");
      await onChanged?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };
  const reconcile = async () => {
    setSaving(true);
    setError("");
    try {
      const response = await fetch(
        `${CCTV_API_BASE}/api/cctv/locations/${p.id}/reconcile`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Actor": "skylab-local-user",
          },
          body: JSON.stringify(draft),
        },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "No fue posible guardar");
      setEditing(false);
      await onChanged?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <div
      className={`relative overflow-hidden rounded-xl border bg-gradient-to-br from-card/75 to-card/30 transition hover:-translate-y-0.5 hover:shadow-xl ${style.border}`}
    >
      <button
        className="w-full p-4 text-left hover:bg-white/[.02]"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <div className="flex items-start gap-3">
          <div
            className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl border ${visual.surface} ${visual.color}`}
          >
            <PointIcon size={28} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <span className="font-mono text-[10px] text-muted-foreground">
                  {p.code || "SIN CÓDIGO"}
                </span>
                <h3 className="truncate font-bold text-base" title={p.name}>
                  {p.name}
                </h3>
              </div>
              <Badge
                variant="outline"
                className={`h-fit max-w-[46%] whitespace-normal text-right text-[9px] leading-tight ${style.badge}`}
              >
                <StateIcon size={11} className="mr-1 shrink-0" />
                {p.statusLabel || labels[p.state]}
              </Badge>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
              <span className={`font-bold ${visual.color}`}>
                {visual.label}
              </span>
              <span className="text-slate-600">·</span>
              <span className="flex items-center gap-1 text-muted-foreground">
                <MapPin size={13} />
                {p.zone}
              </span>
              {p.physicalSite&&<><span className="text-slate-600">·</span><span className="flex items-center gap-1 font-semibold text-blue-300"><Boxes size={13}/>{p.physicalSite}</span></>}
            </div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {capabilities.map((item, index) => {
            const Icon = capabilityIcons[item.key] || Cctv;
            return (
              <span
                key={`${item.key}-${index}`}
                className="inline-flex items-center gap-1.5 rounded-md border border-white/[.07] bg-white/[.035] px-2 py-1 text-[10px] font-semibold text-slate-300"
              >
                <Icon
                  size={15}
                  className={
                    item.key === "k35"
                      ? "text-amber-400"
                      : item.key === "oszford"
                        ? "text-rose-400"
                        : item.key === "ai"
                          ? "text-violet-400"
                          : "text-cyan-400"
                  }
                />
                {item.label}
              </span>
            );
          })}
        </div>
        {p.reviewReason && (
          <div
            className={`mt-3 flex gap-2 rounded-lg border p-2.5 text-[11px] leading-relaxed text-slate-300 ${style.panel}`}
          >
            <StateIcon size={14} className="mt-0.5 shrink-0" />
            <span>
              <b className="text-white">Siguiente paso:</b> {p.actionLabel}.{" "}
              <span className="text-slate-400">{p.reviewReason}</span>
            </span>
          </div>
        )}
        <div className="mt-4 grid grid-cols-[1.3fr_.55fr_1fr] gap-2 border-t border-border/40 pt-3 text-xs">
          <div>
            <span className="block text-[9px] uppercase text-muted-foreground">
              Solución
            </span>
            <span className="line-clamp-2">{p.system}</span>
          </div>
          <div>
            <span className="block text-[9px] uppercase text-muted-foreground">
              Cámaras
            </span>
            <b>{p.channelDisplay || p.channels || "—"}</b>
          </div>
          <div>
            <span className="block text-[9px] uppercase text-muted-foreground">
              Fuente
            </span>
            <span className="line-clamp-2">{p.evidence}</span>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-end border-t border-white/[.04] pt-2 text-[10px] font-bold text-blue-400">
          {open ? "Ocultar detalle" : "Ver contexto y acción"}
          <ArrowRight
            size={13}
            className={`ml-1 transition ${open ? "rotate-90" : ""}`}
          />
        </div>
      </button>
      {open && (
        <div className="border-t border-border/40 bg-background/30 px-4 pb-4">
          <div className="grid gap-3 py-4 md:grid-cols-2">
            <Fact label="Último evento" value={p.event} />
            <Fact label="Siguiente acción" value={p.actionLabel || p.action} />
          </div>
          {editing && (
            <div className="mb-3 grid gap-2 rounded-xl border border-white/[.07] bg-black/10 p-3 sm:grid-cols-2">
              <label className="text-[10px] text-muted-foreground">
                Tipo de solución
                <select
                  value={draft.solutionKind}
                  onChange={(e) =>
                    setDraft((current) => ({
                      ...current,
                      solutionKind: e.target.value,
                    }))
                  }
                  className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-xs"
                >
                  <option value="KIT">Kit CCTV</option>
                  <option value="SINGLE_CAMERA">Cámara única MicroSD</option>
                  <option value="K35">Cámara K35</option>
                </select>
              </label>
              <label className="text-[10px] text-muted-foreground">
                Número de cámaras
                <Input
                  type="number"
                  min="1"
                  max="128"
                  value={draft.cameraCount}
                  onChange={(e) =>
                    setDraft((current) => ({
                      ...current,
                      cameraCount: Number(e.target.value),
                    }))
                  }
                  className="mt-1"
                />
              </label>
              <label className="text-[10px] text-muted-foreground sm:col-span-2">
                Observaciones
                <Input
                  value={draft.notes}
                  onChange={(e) =>
                    setDraft((current) => ({
                      ...current,
                      notes: e.target.value,
                    }))
                  }
                  className="mt-1"
                  placeholder="Fuente o aclaración del técnico"
                />
              </label>
              <div className="flex gap-2 sm:col-span-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditing(false)}
                >
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  className="flex-1"
                  disabled={saving}
                  onClick={reconcile}
                >
                  {saving ? "Guardando…" : "Guardar conciliación"}
                </Button>
              </div>
            </div>
          )}
          {error && (
            <p className="mb-3 rounded-lg bg-rose-500/10 p-2 text-xs text-rose-300">
              {error}
            </p>
          )}
          {p.workflowState === "SYNC_PENDING" ? (
            <Button
              size="sm"
              className="w-full"
              disabled={saving}
              onClick={sync}
            >
              <RefreshCw
                size={14}
                className={`mr-2 ${saving ? "animate-spin" : ""}`}
              />
              {saving ? "Sincronizando…" : "Sincronizar con inventario"}
            </Button>
          ) : ["REVIEW_REQUIRED", "COMPLETE_REQUIRED"].includes(
              p.workflowState,
            ) ? (
            <Button
              size="sm"
              className="w-full"
              variant="outline"
              onClick={() => setEditing(true)}
            >
              <Wrench size={14} className="mr-2" />
              {p.actionLabel}
            </Button>
          ) : (
            <Button size="sm" className="w-full" onClick={() => setIntegralOpen(true)}>
              Abrir ficha integral <ArrowRight size={14} className="ml-2" />
            </Button>
          )}
        </div>
      )}
      {integralOpen && createPortal((
        <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/80 p-4 backdrop-blur-sm" onClick={() => setIntegralOpen(false)}>
          <div className="max-h-[88vh] w-full max-w-4xl overflow-auto rounded-2xl border border-cyan-400/20 bg-background p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 border-b border-border/50 pb-4">
              <div><p className="text-[10px] font-bold uppercase tracking-[.2em] text-cyan-400">Ficha integral de seguridad electrónica</p><h2 className="mt-1 text-2xl font-black">{p.name}</h2><p className="text-sm text-muted-foreground">SIIS {p.code || "sin código"} · {p.zone} · {p.physicalSite || "Sitio individual"}</p></div>
              <Button variant="ghost" size="icon" onClick={() => setIntegralOpen(false)} aria-label="Cerrar"><XCircle size={22}/></Button>
            </div>
            {!integralData ? <div className="py-16 text-center text-muted-foreground">Consolidando inventario y eventos…</div> : <>
              <div className="my-5 grid gap-3 sm:grid-cols-3">
                <Fact label="Cobertura" value={p.coverage}/><Fact label="Activos canónicos" value={integralData.summary.assets}/><Fact label="Última señal CCTV" value={formatDetailDate(integralData.summary.lastEvent?.occurredAt || integralData.summary.lastEvent?.receivedAt)}/>
              </div>
              <div className="grid gap-5 lg:grid-cols-[.8fr_1.2fr]">
                <section className="rounded-xl border border-border/60 bg-card/40 p-4"><h3 className="mb-3 flex items-center gap-2 font-bold"><Boxes size={17} className="text-cyan-400"/>Activos instalados</h3>{integralData.assets.length ? <div className="space-y-2">{integralData.assets.map((asset)=><div key={asset.id} className="rounded-lg border border-border/50 p-3"><b>{asset.type}</b><p className="text-xs text-muted-foreground">{asset.model || "Modelo por confirmar"}{asset.ip ? ` · ${asset.ip}` : ""}{asset.fixedAssetCode ? ` · AF ${asset.fixedAssetCode}` : ""}</p></div>)}</div>:<p className="text-sm text-muted-foreground">No hay activos canónicos asociados.</p>}</section>
                <section className="rounded-xl border border-border/60 bg-card/40 p-4">
                  <div className="mb-4 flex items-start justify-between gap-3"><div><h3 className="flex items-center gap-2 font-bold"><Activity size={17} className="text-emerald-400"/>Patrón operativo</h3><p className="mt-1 text-xs text-muted-foreground">Promedios de los últimos {integralData.behavior.periodDays} días; cada día aporta una sola observación por fuente.</p></div><Badge variant="outline">{integralData.summary.observedDays} días</Badge></div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {[
                      ["Llegada observada",integralData.behavior.observedArrival,"CCTV o primer ping · señal más temprana","text-emerald-300"],
                      ["Última actividad",integralData.behavior.observedLastActivity,"Cierre CCTV o último ping","text-blue-300"],
                      ["Apertura CCTV",integralData.behavior.cctvOpening,"Primera apertura visual del día","text-cyan-300"],
                      ["Primer ping SIIS",integralData.behavior.firstPing,"Primera estación en línea","text-violet-300"],
                      ["Cierre CCTV",integralData.behavior.cctvClosing,"Último cierre visual del día","text-cyan-300"],
                      ["Última señal SIIS",integralData.behavior.lastPing,"No equivale por sí sola al cierre","text-violet-300"],
                    ].map(([label,metric,description,color])=><div key={label} className="rounded-xl border border-border/50 bg-background/35 p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p><div className="mt-1 flex items-end justify-between gap-2"><b className={`text-xl ${color}`}>{metric.average || "—"}</b><span className="text-[10px] text-muted-foreground">{metric.sampleDays} días</span></div><p className="mt-1 text-[10px] text-muted-foreground">{description}</p></div>)}
                  </div>
                </section>
              </div>
              {integralData.behavior.daily.length > 0 && <section className="mt-5 rounded-xl border border-border/60 bg-card/40 p-4"><h3 className="font-bold">Resumen diario consolidado</h3><p className="mb-3 text-xs text-muted-foreground">Máximo 10 días recientes, sin listar correos repetidos.</p><div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-xs"><thead className="text-[10px] uppercase text-muted-foreground"><tr className="border-b border-border/60"><th className="py-2">Fecha</th><th>Llegada</th><th>Apertura CCTV</th><th>Primer ping</th><th>Cierre CCTV</th><th>Último ping</th></tr></thead><tbody>{integralData.behavior.daily.map(day=><tr key={day.date} className="border-b border-border/30"><td className="py-2.5 font-semibold">{day.date}</td><td className="font-bold text-emerald-300">{day.observedArrival || "—"}</td><td>{day.cctvOpening || "—"}</td><td className="text-violet-300">{day.firstPing || "—"}</td><td>{day.cctvClosing || "—"}</td><td className="text-violet-300">{day.lastPing || "—"}</td></tr>)}</tbody></table></div></section>}
            </>}
          </div>
        </div>
      ), document.body)}
    </div>
  );
}

function Operations({ points }) {
  const health = [
    {
      name: "Operativos",
      value: snapshot.points.filter((p) => p.state === "online").length,
      color: "#22c55e",
    },
    {
      name: "Revisión",
      value: snapshot.points.filter((p) => p.state === "attention").length,
      color: "#f59e0b",
    },
    {
      name: "Alerta",
      value: snapshot.points.filter((p) => p.state === "alert").length,
      color: "#f43f5e",
    },
  ];
  return (
    <div className="space-y-5">
      <div className="grid sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <Kpi
          icon={ShieldCheck}
          title="Ubicaciones CCTV"
          value={85}
          badge="Catálogo canónico"
        />
        <Kpi
          icon={HardDrive}
          title="Dispositivos DSS"
          value={111}
          badge="Infraestructura centralizada"
          color="text-violet-400"
        />
        <Kpi
          icon={Camera}
          title="Canales"
          value={423}
          badge="Incluye cámaras MicroSD"
          color="text-cyan-400"
        />
        <Kpi
          icon={XCircle}
          title="SIIS offline"
          value={9}
          badge="Estado del primer corte"
          color="text-rose-400"
        />
        <Kpi
          icon={Sparkles}
          title="Modernización"
          value="39%"
          badge="45 de 114"
          color="text-emerald-400"
        />
      </div>
      <div className="grid lg:grid-cols-[.7fr_1.3fr] gap-4">
        <Card className="bg-card/40">
          <CardHeader>
            <CardTitle className="text-base">Salud operativa visible</CardTitle>
            <CardDescription>Muestra cargada en el MVP</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={health}
                  innerRadius={58}
                  outerRadius={86}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {health.map((x) => (
                    <Cell key={x.name} fill={x.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "#0f172a",
                    border: "1px solid #334155",
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="bg-card/40">
          <CardHeader>
            <CardTitle className="text-base">Cobertura por zona</CardTitle>
            <CardDescription>
              Puntos cubiertos frente al universo canónico
            </CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={snapshot.zones}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  opacity={0.2}
                />
                <XAxis dataKey="name" fontSize={10} />
                <YAxis fontSize={10} />
                <Tooltip
                  contentStyle={{
                    background: "#0f172a",
                    border: "1px solid #334155",
                  }}
                />
                <Bar dataKey="total" name="Puntos" fill="#334155" />
                <Bar dataKey="covered" name="Con CCTV" fill="#3b82f6" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
      <div>
        <div className="flex justify-between mb-3">
          <div>
            <h2 className="font-bold">Puntos priorizados</h2>
            <p className="text-xs text-muted-foreground">
              Contexto, evidencia y siguiente acción
            </p>
          </div>
          <Badge variant="secondary">{points.length} visibles</Badge>
        </div>
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {points.map((p) => (
            <PointCard key={p.code} p={p} />
          ))}
        </div>
      </div>
    </div>
  );
}

function Zones() {
  return (
    <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
      {snapshot.zones.map((z) => {
        const pct = Math.round((z.covered / z.total) * 100);
        return (
          <Card key={z.name} className="bg-card/40 hover:border-blue-500/30">
            <CardHeader>
              <div className="flex justify-between">
                <div>
                  <CardTitle>{z.name}</CardTitle>
                  <CardDescription>
                    {z.devices} dispositivos · {z.channels} canales
                  </CardDescription>
                </div>
                <span className="text-2xl font-black text-blue-400">
                  {pct}%
                </span>
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-600 to-cyan-400"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="grid grid-cols-3 gap-2 mt-4">
                <Fact label="Puntos" value={z.total} />
                <Fact label="Cubiertos" value={z.covered} />
                <Fact label="Revisar" value={z.attention} />
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
function RealAlerts({ quality, onOpen }) {
  if (!quality)
    return (
      <div className="py-20 text-center text-muted-foreground">
        Analizando calidad del inventario…
      </div>
    );
  const s = quality.summary;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
        <Kpi
          icon={ShieldCheck}
          title="Calidad canónica"
          value={`${s.qualityPercent}%`}
          badge={`${s.ready} ubicaciones listas`}
          color="text-emerald-400"
        />
        <Kpi
          icon={Unplug}
          title="Información faltante"
          value={s.completeRequired}
          badge="Requieren intervención humana"
          color="text-rose-400"
        />
        <Kpi
          icon={AlertTriangle}
          title="Inconsistencias"
          value={s.reviewRequired}
          badge="Fuentes por conciliar"
          color="text-amber-400"
        />
        <Kpi
          icon={RefreshCw}
          title="Por sincronizar"
          value={s.syncPending}
          badge="Datos disponibles para promover"
          color="text-blue-400"
        />
        <Kpi
          icon={BellRing}
          title="Acciones abiertas"
          value={s.pending}
          badge={`Sobre ${s.total} puntos CCTV`}
          color="text-violet-400"
        />
      </div>
      <Card className="overflow-hidden border-white/[.07] bg-card/40">
        <CardHeader className="border-b border-white/[.06]">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">
                Cola inteligente de calidad
              </CardTitle>
              <CardDescription>
                Prioridad automática: información faltante, inconsistencias y
                sincronización
              </CardDescription>
            </div>
            <Badge variant="secondary">{quality.issues.length} acciones</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-[38rem] divide-y divide-white/[.05] overflow-y-auto">
            {quality.issues.map((issue) => {
              const style = workflowStyle[issue.workflowState];
              const Icon = style.icon;
              return (
                <button
                  key={issue.id}
                  onClick={() => onOpen(issue)}
                  className="grid w-full gap-3 p-4 text-left transition hover:bg-white/[.025] sm:grid-cols-[auto_1fr_auto] sm:items-center"
                >
                  <span
                    className={`grid h-10 w-10 place-items-center rounded-xl border ${style.badge}`}
                  >
                    <Icon size={19} />
                  </span>
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <b className="truncate text-sm">{issue.point}</b>
                      <span className="font-mono text-[9px] text-slate-500">
                        {issue.code || "SIN CÓDIGO"}
                      </span>
                      <Badge
                        variant="outline"
                        className={`text-[9px] ${style.badge}`}
                      >
                        {issue.title}
                      </Badge>
                    </span>
                    <span className="mt-1 block text-[11px] text-muted-foreground">
                      {issue.zone} · {issue.detail}
                    </span>
                  </span>
                  <span className="inline-flex items-center text-[10px] font-bold text-blue-400">
                    {issue.action}
                    <ArrowRight size={13} className="ml-1" />
                  </span>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
function ProjectIdentityCard({ item, onChanged }) {
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState(item.target || ""),
    [results, setResults] = useState([]),
    [selected, setSelected] = useState(null),
    [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(
      () =>
        fetch(
          `${CCTV_API_BASE}/api/cctv/locations?search=${encodeURIComponent(query)}`,
        )
          .then((r) => r.json())
          .then((data) => setResults(data.items || []))
          .catch(() => setError("No fue posible consultar ubicaciones.")),
      250,
    );
    return () => clearTimeout(timer);
  }, [open, query]);
  const link = async () => {
    setSaving(true);
    setError("");
    try {
      const response = await fetch(
        `${CCTV_API_BASE}/api/cctv/project/identity/${item.id}/link`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Actor": "skylab-local-user",
          },
          body: JSON.stringify({ locationId: selected.id }),
        },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "No fue posible vincular");
      await onChanged?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <div
      className={`rounded-xl border bg-white/[.02] transition ${open ? "border-blue-500/25" : "border-white/[.06]"}`}
    >
      <button className="w-full p-3 text-left" onClick={() => setOpen(!open)}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-amber-500/10 text-amber-300">
                <Search size={16} />
              </span>
              <div>
                <b className="text-xs">{item.target}</b>
                <p className="text-[9px] uppercase tracking-wide text-amber-300">
                  Identidad por confirmar
                </p>
              </div>
            </div>
            <p className="mt-2 text-[10px] text-muted-foreground">
              {item.project_stream === "HIGH_VALUE_AI"
                ? "Analítica e IA"
                : "IA y Sportsbook"}
            </p>
            {item.transferScope && (
              <p className="mt-1 text-[10px] text-violet-300">
                Origen/alcance: {item.transferScope}
              </p>
            )}
          </div>
          <ArrowRight
            size={14}
            className={`mt-1 text-blue-400 transition ${open ? "rotate-90" : ""}`}
          />
        </div>
      </button>
      {open && (
        <div className="border-t border-white/[.05] p-3">
          <p className="mb-2 text-[10px] leading-relaxed text-slate-400">
            Busca el nombre oficial en SIIS/Operación de Puntos y confirma solo
            si corresponde al mismo lugar.
          </p>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelected(null);
              }}
              className="pl-9"
              placeholder="Nombre, código SIIS o zona"
            />
          </div>
          <div className="mt-2 max-h-44 space-y-1 overflow-y-auto">
            {results.map((candidate) => (
              <button
                key={candidate.id}
                onClick={() => setSelected(candidate)}
                className={`w-full rounded-lg border p-2 text-left text-[11px] ${selected?.id === candidate.id ? "border-blue-500 bg-blue-500/10" : "border-white/[.06] hover:bg-white/[.03]"}`}
              >
                <b>{candidate.name}</b>
                <p className="text-[9px] text-muted-foreground">
                  {candidate.zone} · SIIS {candidate.code || "sin código"} ·
                  coincidencia {candidate.score}
                </p>
              </button>
            ))}
          </div>
          {error && <p className="mt-2 text-[10px] text-rose-300">{error}</p>}
          <Button
            size="sm"
            className="mt-2 w-full"
            disabled={!selected || saving}
            onClick={link}
          >
            {saving
              ? "Vinculando…"
              : selected
                ? `Vincular con ${selected.name}`
                : "Selecciona una ubicación"}
          </Button>
        </div>
      )}
    </div>
  );
}

function EventInsightModal({ type, data, onClose, formatTime }) {
  const config = {
    events: {
      title: "Actividad normalizada",
      description: "Composición completa de mensajes del día",
    },
    openings: {
      title: "Aperturas y cierres observados",
      description: "Evidencia recibida por ubicación",
    },
    bursts: {
      title: "Ráfagas de movimiento",
      description: "Actividad agrupada en ventanas de ocho minutos",
    },
    identity: {
      title: "Identidades por conciliar",
      description: "Alias que todavía no apuntan al catálogo canónico",
    },
  }[type];
  if (!config) return null;
  return (
    <div
      className="fixed inset-0 z-[70] grid place-items-center bg-black/75 p-4 backdrop-blur-sm"
      onMouseDown={onClose}
    >
      <Card
        className="max-h-[86vh] w-full max-w-3xl overflow-hidden border-white/[.1] bg-slate-950 shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <CardHeader className="border-b border-white/[.07]">
          <div className="flex items-start justify-between">
            <div>
              <CardTitle>{config.title}</CardTitle>
              <CardDescription>{config.description}</CardDescription>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              ×
            </Button>
          </div>
        </CardHeader>
        <CardContent className="max-h-[68vh] overflow-y-auto p-5">
          {type === "events" && (
            <div className="grid gap-3 sm:grid-cols-2">
              {data.categories.map((row) => (
                <div
                  key={`${row.eventType}-${row.severity}`}
                  className="rounded-xl border border-white/[.07] bg-white/[.025] p-4"
                >
                  <div className="flex justify-between">
                    <b className="text-sm text-slate-200">{row.eventType}</b>
                    <span className="text-2xl font-black text-blue-300">
                      {row.total}
                    </span>
                  </div>
                  <p className="mt-2 text-[10px] text-slate-500">
                    {row.linked} vinculados · {row.unlinked} pendientes
                  </p>
                </div>
              ))}
            </div>
          )}
          {type === "openings" && (
            <div className="space-y-2">
              {data.pointOperations.map((point) => (
                <div
                  key={point.key}
                  className="grid grid-cols-[1fr_auto_auto] items-center gap-4 rounded-xl border border-white/[.07] p-3"
                >
                  <div>
                    <b className="text-xs text-slate-200">{point.name}</b>
                    <p className="text-[9px] text-slate-500">
                      {point.zone || "Sin zona"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] text-slate-500">Apertura</p>
                    <b className="text-xs text-emerald-300">
                      {formatTime(point.opening)}
                    </b>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] text-slate-500">Cierre</p>
                    <b className="text-xs text-blue-300">
                      {formatTime(point.closing)}
                    </b>
                  </div>
                </div>
              ))}
            </div>
          )}
          {type === "bursts" && (
            <div className="space-y-2">
              {data.motionBursts.map((burst, index) => (
                <div
                  key={`${burst.from}-${index}`}
                  className={`flex justify-between gap-4 rounded-xl border p-3 ${burst.noisy ? "border-amber-500/20 bg-amber-500/[.04]" : "border-white/[.07]"}`}
                >
                  <div>
                    <b className="text-xs text-slate-200">{burst.location}</b>
                    <p className="text-[9px] text-slate-500">
                      {burst.channel} · {formatTime(burst.from)}–
                      {formatTime(burst.to)}
                    </p>
                  </div>
                  <div className="text-right">
                    <b
                      className={
                        burst.noisy
                          ? "text-xl text-amber-300"
                          : "text-xl text-violet-300"
                      }
                    >
                      {burst.count}
                    </b>
                    <p className="text-[9px] text-slate-500">activaciones</p>
                  </div>
                </div>
              ))}
            </div>
          )}
          {type === "identity" && (
            <div className="space-y-2">
              {data.identityPending.map((item) => (
                <div
                  key={item.name}
                  className="flex items-center justify-between rounded-xl border border-amber-500/15 bg-amber-500/[.03] p-3"
                >
                  <div>
                    <b className="text-xs text-slate-200">{item.name}</b>
                    <p className="text-[9px] text-slate-500">
                      {item.eventTypes.join(" · ")} · muestra {item.sampleUid}
                    </p>
                  </div>
                  <span className="text-xl font-black text-amber-300">
                    {item.total}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function EventEvidenceModal({ event, onClose, formatTime }) {
  if (!event) return null;
  const imageUrl = `${CCTV_API_BASE}/api/cctv/events/${event.id}/snapshot`;
  return (
    <div
      className="fixed inset-0 z-[80] grid place-items-center bg-black/80 p-4 backdrop-blur-md"
      onMouseDown={onClose}
    >
      <Card
        className="max-h-[90vh] w-full max-w-5xl overflow-y-auto border-white/[.1] bg-slate-950 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <CardHeader className="border-b border-white/[.07]">
          <div className="flex items-start justify-between">
            <div>
              <CardTitle>Evidencia instantánea</CardTitle>
              <CardDescription>
                {event.location ||
                  event.payload.storeRaw ||
                  "Ubicación por identificar"}{" "}
                · {formatTime(event.occurredAt || event.receivedAt)}
              </CardDescription>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              ×
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-5 p-5 lg:grid-cols-[1.5fr_.5fr]">
          <div className="grid min-h-80 place-items-center overflow-hidden rounded-2xl border border-white/[.08] bg-black/40">
            <img
              src={imageUrl}
              alt={`Instantánea ${event.location || event.payload.storeRaw || ""}`}
              className="max-h-[65vh] w-full object-contain"
            />
            <div className="hidden p-8 text-center text-xs text-slate-500">
              No fue posible cargar la instantánea.
            </div>
          </div>
          <div className="space-y-3">
            <div className="rounded-xl border border-white/[.07] bg-white/[.025] p-3">
              <p className="text-[9px] font-bold uppercase text-slate-500">
                Evento
              </p>
              <b className="text-sm text-slate-200">{event.eventType}</b>
            </div>
            <div className="rounded-xl border border-white/[.07] bg-white/[.025] p-3">
              <p className="text-[9px] font-bold uppercase text-slate-500">
                Canal
              </p>
              <b className="text-sm text-slate-200">
                {event.payload.channelRaw || "Sin canal informado"}
              </b>
            </div>
            <div className="rounded-xl border border-white/[.07] bg-white/[.025] p-3">
              <p className="text-[9px] font-bold uppercase text-slate-500">
                Identidad
              </p>
              <b
                className={
                  event.location
                    ? "text-sm text-emerald-300"
                    : "text-sm text-amber-300"
                }
              >
                {event.location
                  ? "Vinculada al catálogo"
                  : "Pendiente de conciliación"}
              </b>
            </div>
            <div className="rounded-xl border border-white/[.07] bg-white/[.025] p-3">
              <p className="text-[9px] font-bold uppercase text-slate-500">
                Referencia auditable
              </p>
              <p className="mt-1 break-all text-[10px] text-slate-400">
                {event.sourceEventId}
              </p>
            </div>
            <p className="text-[9px] leading-relaxed text-slate-500">
              La imagen se obtiene bajo demanda mediante IMAP de solo lectura y
              se conserva en caché local restringida.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function RealEvents({ data, date, onDateChange, pointContext, search = "" }) {
  const [insight, setInsight] = useState(null),
    [evidence, setEvidence] = useState(null),
    [scheduleFilter, setScheduleFilter] = useState("ALL");
  if (!data)
    return (
      <div className="py-20 text-center text-muted-foreground">
        Consultando eventos diarios…
      </div>
    );
  const normalizedSearch = String(search || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const matchesSearch = (...values) => !normalizedSearch || values.some(value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes(normalizedSearch));
  const evidenceItems = (() => {
    const passthrough = [], groups = new Map();
    for (const item of data.evidenceItems || []) {
      const type = item.evidenceType || item.eventType;
      if (["OPENING", "CLOSING", "MOTION_BURST"].includes(type)) {
        passthrough.push(item);
        continue;
      }
      const identity = item.locationId || item.location || item.payload?.storeRaw || "UNKNOWN";
      const key = `${identity}|${type}`;
      const list = groups.get(key) || [];
      list.push(item);
      groups.set(key, list);
    }
    for (const group of groups.values()) {
      group.sort((a, b) => new Date(a.occurredAt || a.receivedAt) - new Date(b.occurredAt || b.receivedAt));
      let incident = [];
      const close = () => {
        if (!incident.length) return;
        const representative = incident.find((item) => item.locationId) || incident[0];
        const senders = new Set(incident.map((item) => item.payload?.sender).filter(Boolean));
        passthrough.push({
          ...representative,
          correlationCount: incident.reduce((total, item) => total + (item.correlationCount || 1), 0),
          correlationSourceCount: Math.max(senders.size, ...incident.map((item) => item.correlationSourceCount || 1)),
        });
      };
      for (const item of group) {
        if (!incident.length) { incident = [item]; continue; }
        const previous = incident[incident.length - 1];
        const gap = new Date(item.occurredAt || item.receivedAt) - new Date(previous.occurredAt || previous.receivedAt);
        if (gap <= 120000) incident.push(item);
        else { close(); incident = [item]; }
      }
      close();
    }
    return passthrough
      .filter(item => matchesSearch(item.location, item.zone, item.payload?.storeRaw, item.payload?.channelRaw, item.eventType))
      .sort((a, b) => new Date(b.occurredAt || b.receivedAt) - new Date(a.occurredAt || a.receivedAt));
  })();
  const labels = {
    OPENING: "Apertura",
    CLOSING: "Cierre",
    MOTION: "Movimiento",
    DISCARDED: "Descartado auditable",
    UNKNOWN: "Por clasificar",
    TRIPWIRE: "Cruce de línea",
    ALARMA_LOCAL: "Alarma local",
    DETECCION_HUMANA: "Detección humana",
    CABLE_TRAMPA: "Cable trampa",
  };
  const icons = {
    OPENING: Store,
    CLOSING: ShieldCheck,
    MOTION: Activity,
    DISCARDED: XCircle,
    UNKNOWN: AlertTriangle,
    TRIPWIRE: ScanEye,
    ALARMA_LOCAL: BellRing,
    DETECCION_HUMANA: UsersRound,
    CABLE_TRAMPA: Radio,
  };
  const formatTime = (value) =>
    value
      ? new Intl.DateTimeFormat("es-CO", {
          timeZone: "America/Bogota",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }).format(new Date(value))
      : "Sin hora";
  const formatDateTime = (value) =>
    value
      ? new Intl.DateTimeFormat("es-CO", {
          timeZone: "America/Bogota",
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date(value))
      : "Sin captura";
  const siisChart = [
    { name: "En línea", value: data.siis?.online || 0, color: "#10b981" },
    {
      name: "Fuera de línea",
      value: data.siis?.offline || 0,
      color: "#f59e0b",
    },
    { name: "Sin dato", value: data.siis?.unknown || 0, color: "#334155" },
  ];
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const moveDate = (days) => {
    const value = new Date(`${date}T12:00:00`);
    value.setDate(value.getDate() + days);
    onDateChange(value.toISOString().slice(0, 10));
  };
  const readableDate = new Intl.DateTimeFormat("es-CO", {
    dateStyle: "full",
  }).format(new Date(`${date}T12:00:00`));
  const zoneScheduleMap = new Map(
    (pointContext?.schedules || []).map((schedule) => [
      String(schedule.zone_name || "").toUpperCase(),
      schedule,
    ]),
  );
  const nodesBySiis = new Map();
  for (const point of pointContext?.points || []) {
    const code = String(point.siiss_id || "").trim();
    if (!code) continue;
    const list = nodesBySiis.get(code) || [];
    list.push(point);
    nodesBySiis.set(code, list);
  }
  const isToday = date === today;
  const scheduleRows = (data.operationalCoverage || []).map((signal) => {
    const nodes = nodesBySiis.get(String(signal.siisCode || "")) || [],
      point = nodes.find((node) => node.has_custom_schedule) || nodes[0],
      zoneSchedule = zoneScheduleMap.get(
        String(point?.segment || signal.zone || "").toUpperCase(),
      ),
      zoneShift = zoneSchedule?.shifts?.[0] || {},
      custom = !!point?.has_custom_schedule,
      expectedOpen =
        (custom ? point.custom_open_time : null) ||
        zoneShift.open ||
        point?.custom_open_time ||
        "07:00",
      expectedClose =
        (custom ? point.custom_close_time : null) ||
        zoneShift.close ||
        point?.custom_close_time ||
        "21:00",
      tolerance = Number(zoneSchedule?.tolerance_minutes || 15),
      firstPingAt = signal.firstOnlineObservedAt || signal.firstPing || null,
      lastPingAt = signal.lastPing || null,
      evaluation = evaluateOperationalSchedule({
        expectedOpen,
        expectedClose,
        tolerance,
        firstPingAt,
        cctvOpeningAt: signal.emailOpening || null,
        cctvClosingAt: signal.emailClosing || null,
        lastPingAt,
        isToday,
      });
    return {
      ...signal,
      nodes: nodes.length,
      isDouble: nodes.length > 1 || nodes.some((node) => node.is_double),
      botOnline: nodes.some((node) => node.active),
      latency: point?.latency || null,
      expectedOpen: evaluation.expectedOpen,
      expectedClose: evaluation.expectedClose,
      tolerance: evaluation.tolerance,
      customSchedule: custom,
      observedOpen: signal.emailOpening,
      observedClose: evaluation.lunchCloseAt,
      pingCloseAt: null,
      closeSource: evaluation.lunchCloseSource,
      arrivalAt: evaluation.arrivalAt,
      arrivalSource: evaluation.arrivalSource,
      firstPingAt: evaluation.firstPingAt,
      delay: evaluation.delay,
      status: evaluation.status,
      scheduleAlerts: evaluation.alerts,
      lastActivityAt: evaluation.lastPingAt || evaluation.cctvClosingAt || null,
    };
  });
  const filteredScheduleRows = scheduleRows.filter(
    (row) =>
      matchesSearch(row.name,row.zone,row.siisCode) && (
        scheduleFilter === "ALL" ||
        (scheduleFilter === "LATE" && row.status === "LATE") ||
        (scheduleFilter === "EARLY" && row.status === "EARLY") ||
        (scheduleFilter === "NO_ENTRY" && row.status === "NO_ENTRY") ||
        (scheduleFilter === "NO_PING" && !row.firstPingAt) ||
        (scheduleFilter === "NO_CCTV" && !row.hasCctv)
      ),
  );
  const arrivalsObserved = scheduleRows.filter((row) => row.arrivalAt).length;
  const arrivalsOnTime = scheduleRows.filter((row) => row.status === "ON_TIME").length;
  const arrivalsLate = scheduleRows.filter((row) => row.status === "LATE").length;
  const arrivalsEarly = scheduleRows.filter((row) => row.status === "EARLY").length;
  const noEntry = scheduleRows.filter((row) => row.status === "NO_ENTRY").length;
  const pointsWithoutPing = scheduleRows.filter((row) => !row.firstPingAt).length;
  const activityHourly = (data.hourly || []).map((row) => ({
    ...row,
    firstPings: 0,
  }));
  for (const row of scheduleRows) {
    const pingMinute = observedTimeToMinutes(row.firstPingAt);
    if (pingMinute == null) continue;
    const hour = Math.floor(pingMinute / 60);
    if (activityHourly[hour]) activityHourly[hour].firstPings += 1;
  }
  const firstPingTotal = activityHourly.reduce((total, row) => total + row.firstPings, 0);
  const pingPeak = activityHourly.reduce((peak, row) => row.firstPings > peak.firstPings ? row : peak, activityHourly[0] || { hour: "—", firstPings: 0 });
  const siisKnownTotal = (data.siis?.online || 0) + (data.siis?.offline || 0);
  const siisOnlinePercent = siisKnownTotal ? Math.round((data.siis.online / siisKnownTotal) * 100) : 0;
  const coverageChart = [
    { name: "Con CCTV", value: data.siis?.withCctv || 0, color: "#60a5fa" },
    { name: "Sin CCTV", value: data.siis?.withoutCctv || 0, color: "#1e293b" },
  ];
  const motionPointGroups = (() => {
    const groups = new Map();
    for (const burst of data.motionBursts || []) {
      const key = burst.location || "Por identificar";
      const row = groups.get(key) || { location:key, zone:burst.zone, count:0, channels:new Set(), from:burst.from, to:burst.to };
      row.count += burst.count || 0;
      if (burst.channel) row.channels.add(burst.channel);
      if (new Date(burst.from) < new Date(row.from)) row.from = burst.from;
      if (new Date(burst.to) > new Date(row.to)) row.to = burst.to;
      groups.set(key,row);
    }
    return [...groups.values()].map(row=>({...row,channels:[...row.channels],noisy:row.count>=10})).filter(row=>matchesSearch(row.location,row.zone,...row.channels)).sort((a,b)=>b.count-a.count);
  })();
  const traceItems = (() => {
    const result=[], groups=new Map();
    for (const item of data.items || []) {
      const identity=item.locationId||item.location||item.payload?.storeRaw||"UNKNOWN",key=`${identity}|${item.eventType}`;
      const list=groups.get(key)||[];list.push(item);groups.set(key,list);
    }
    for (const group of groups.values()) {
      group.sort((a,b)=>new Date(a.occurredAt||a.receivedAt)-new Date(b.occurredAt||b.receivedAt));
      let incident=[];
      const close=()=>{if(!incident.length)return;const representative=incident.find(item=>item.locationId)||incident[0],senders=new Set(incident.map(item=>item.payload?.sender).filter(Boolean));result.push({...representative,notificationCount:incident.length,sourceCount:senders.size});};
      for(const item of group){if(!incident.length){incident=[item];continue;}const previous=incident[incident.length-1],gap=new Date(item.occurredAt||item.receivedAt)-new Date(previous.occurredAt||previous.receivedAt);if(gap<=120000)incident.push(item);else{close();incident=[item];}}close();
    }
    return result.filter(item=>matchesSearch(item.location,item.zone,item.payload?.storeRaw,item.payload?.channelRaw,item.eventType)).sort((a,b)=>new Date(b.occurredAt||b.receivedAt)-new Date(a.occurredAt||a.receivedAt));
  })();
  const visiblePointOperations = (data.pointOperations || []).filter(point=>matchesSearch(point.name,point.zone));
  const visibleIdentityPending = (data.identityPending || []).filter(item=>matchesSearch(item.name,...item.eventTypes));
  const summary = [
    {
      label: "Evidencias consolidadas",
      value: evidenceItems.length,
      detail: `${data.summary.total} correos recibidos`,
      icon: Database,
      tone: "text-blue-300 bg-blue-500/10",
      detailType: "events",
    },
    {
      label: "Llegadas observadas",
      value: arrivalsObserved,
      detail: "primera señal CCTV o ping",
      icon: Store,
      tone: "text-emerald-300 bg-emerald-500/10",
      detailType: "openings",
    },
    {
      label: "Llegadas a tiempo",
      value: arrivalsOnTime,
      detail: `${arrivalsLate} tardías según horario`,
      icon: Clock,
      tone: "text-violet-300 bg-violet-500/10",
      detailType: "openings",
    },
    {
      label: "Identidad confiable",
      value: `${data.summary.identityPercent}%`,
      detail: `${data.summary.unlinked} correos por conciliar`,
      icon: ShieldCheck,
      tone: "text-cyan-300 bg-cyan-500/10",
      detailType: "identity",
    },
  ];
  return (
    <div className="flex flex-col gap-5 animate-in fade-in duration-500">
      <div className="relative overflow-hidden rounded-2xl border border-white/[.08] bg-slate-950/70 p-5">
        <div className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full bg-blue-500/[.07] blur-3xl" />
        <div className="relative flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-3">
            <span className="grid h-14 w-14 place-items-center rounded-xl border border-blue-500/15 bg-blue-500/10 text-blue-300">
              <MonitorPlay size={27} />
            </span>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[.18em] text-blue-300">
                Centro operativo diario · Dahua
              </p>
              <h2 className="text-xl font-black text-slate-100">
                Actividad, aperturas y salud de eventos
              </h2>
              <p className="text-[11px] capitalize text-slate-400">
                {readableDate}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9"
              onClick={() => moveDate(-1)}
              title="Día anterior"
            >
              <ArrowLeft size={15} />
            </Button>
            <label className="text-[9px] font-bold uppercase tracking-wide text-slate-500">
              Fecha operativa
              <Input
                type="date"
                value={date}
                max={today}
                onChange={(e) => onDateChange(e.target.value)}
                className="mt-1 w-44 text-sm text-slate-200"
              />
            </label>
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9"
              onClick={() => moveDate(1)}
              disabled={date >= today}
              title="Día siguiente"
            >
              <ArrowRight size={15} />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-9"
              onClick={() => onDateChange(today)}
              disabled={date === today}
            >
              Hoy
            </Button>
          </div>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {summary.map((item) => {
          const Icon = item.icon;
          return (
            <button
              type="button"
              onClick={() => setInsight(item.detailType)}
              key={item.label}
              className="group flex min-h-28 items-center gap-4 rounded-2xl border border-white/[.08] bg-card/45 p-4 text-left transition duration-300 hover:-translate-y-0.5 hover:border-blue-400/25 hover:bg-white/[.035]"
            >
              <span
                className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl transition group-hover:scale-105 ${item.tone}`}
              >
                <Icon size={23} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between">
                  <p className="text-3xl font-black text-slate-100">
                    {item.value}
                  </p>
                  <ArrowRight
                    size={14}
                    className="mt-1 text-slate-600 transition group-hover:translate-x-0.5 group-hover:text-blue-300"
                  />
                </div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  {item.label}
                </p>
                <p className="mt-1 text-[10px] text-slate-400">{item.detail}</p>
                <p className="mt-2 text-[9px] font-bold text-blue-400/70">
                  Ver detalle
                </p>
              </div>
            </button>
          );
        })}
      </div>
      {data.siis && (
        <Card className="relative overflow-hidden border-white/[.08] bg-card/40">
          <div className="pointer-events-none absolute -left-20 -top-24 h-52 w-52 rounded-full bg-emerald-500/[.045] blur-3xl" />
          <CardHeader>
            <div className="relative flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base">
                    Pulso SIIS y cobertura CCTV
                  </CardTitle>
                  <Badge className="border border-emerald-500/15 bg-emerald-500/[.07] text-emerald-300 hover:bg-emerald-500/[.07]">
                    Señal multifuente
                  </Badge>
                </div>
                <CardDescription>
                  Ping actual para puntos con y sin CCTV; no equivale por sí
                  solo a apertura confirmada.
                </CardDescription>
              </div>
              <div className="text-right">
                <p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">
                  Última captura SIIS
                </p>
                <p className="mt-1 text-xs font-bold text-slate-300">
                  {formatDateTime(data.siis.capturedAt)}
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="relative grid items-center gap-5 xl:grid-cols-[230px_1fr_1.1fr]">
              <div className="rounded-2xl border border-white/[.07] bg-gradient-to-b from-white/[.035] to-transparent p-3">
              <div className="relative mx-auto h-48 w-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={siisChart}
                      dataKey="value"
                      innerRadius={61}
                      outerRadius={76}
                      stroke="none"
                      paddingAngle={3}
                      cornerRadius={6}
                      isAnimationActive
                      animationDuration={900}
                    >
                      {siisChart.map((item) => (
                        <Cell key={item.name} fill={item.color} />
                      ))}
                    </Pie>
                    <Pie
                      data={coverageChart}
                      dataKey="value"
                      innerRadius={82}
                      outerRadius={87}
                      stroke="none"
                      paddingAngle={2}
                      cornerRadius={4}
                      animationDuration={1150}
                    >
                      {coverageChart.map((item) => (
                        <Cell key={item.name} fill={item.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{background:'#07101f',border:'1px solid rgba(148,163,184,.16)',borderRadius:10,fontSize:10}}
                      itemStyle={{color:'#e2e8f0'}}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
                  <div>
                    <p className="text-3xl font-black text-emerald-300">
                      {siisOnlinePercent}%
                    </p>
                    <p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">
                      disponibilidad
                    </p>
                    <p className="mt-1 text-[9px] text-slate-600">{data.siis.online}/{siisKnownTotal} en línea</p>
                  </div>
                </div>
              </div>
                <div className="mt-1 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[8px] text-slate-500">
                  {siisChart.map(item=><span key={item.name} className="inline-flex items-center gap-1"><i className="h-1.5 w-1.5 rounded-full" style={{background:item.color}}/>{item.name} {item.value}</span>)}
                  <span className="inline-flex items-center gap-1 text-blue-300/80"><i className="h-1.5 w-1.5 rounded-full bg-blue-400"/>Anillo exterior: cobertura CCTV</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-emerald-500/15 bg-emerald-500/[.045] p-4">
                  <p className="text-2xl font-black text-emerald-300">
                    {data.siis.onlineWithCctv}
                  </p>
                  <p className="mt-1 text-[10px] text-slate-400">
                    En línea con CCTV
                  </p>
                </div>
                <div className="rounded-xl border border-blue-500/15 bg-blue-500/[.045] p-4">
                  <p className="text-2xl font-black text-blue-300">
                    {data.siis.onlineWithoutCctv}
                  </p>
                  <p className="mt-1 text-[10px] text-slate-400">
                    En línea sin CCTV
                  </p>
                </div>
                <div className="rounded-xl border border-white/[.07] bg-white/[.02] p-4">
                  <p className="text-2xl font-black text-slate-200">
                    {data.siis.withCctv}
                  </p>
                  <p className="mt-1 text-[10px] text-slate-400">
                    Catálogo con CCTV
                  </p>
                </div>
                <div className="rounded-xl border border-white/[.07] bg-white/[.02] p-4">
                  <p className="text-2xl font-black text-slate-200">
                    {data.siis.withoutCctv}
                  </p>
                  <p className="mt-1 text-[10px] text-slate-400">
                    Catálogo sin CCTV
                  </p>
                </div>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[.14em] text-slate-500">
                  Lectura de confianza
                </p>
                <div className="mt-3 space-y-2">
                  <div className="flex gap-3 rounded-xl border border-white/[.07] bg-white/[.02] p-3">
                    <Radio size={18} className="shrink-0 text-emerald-300" />
                    <div>
                      <b className="text-xs text-slate-200">Ping SIIS</b>
                      <p className="text-[10px] leading-relaxed text-slate-500">
                        Actividad o conectividad del sistema del punto en el
                        instante capturado.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-3 rounded-xl border border-white/[.07] bg-white/[.02] p-3">
                    <Cctv size={18} className="shrink-0 text-blue-300" />
                    <div>
                      <b className="text-xs text-slate-200">Evento CCTV</b>
                      <p className="text-[10px] leading-relaxed text-slate-500">
                        Evidencia física adicional donde existe sistema de
                        videovigilancia.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-3 rounded-xl border border-white/[.07] bg-white/[.02] p-3">
                    <BrainCircuit
                      size={18}
                      className="shrink-0 text-violet-300"
                    />
                    <div>
                      <b className="text-xs text-slate-200">
                        Confianza combinada
                      </b>
                      <p className="text-[10px] leading-relaxed text-slate-500">
                        Se fortalecerá con transiciones periódicas, horarios y
                        primera/última actividad.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      {scheduleRows.length > 0 && (
        <Card className="overflow-hidden border-white/[.08] bg-card/40">
          <div className="h-px bg-gradient-to-r from-transparent via-emerald-400/30 to-transparent" />
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base">
                    Horario esperado vs. actividad observada
                  </CardTitle>
                  <Badge
                    variant="outline"
                    className="border-violet-500/20 text-violet-300"
                  >
                    Heredado de Operación de Puntos
                  </Badge>
                </div>
                <CardDescription>
                  Horario vigente contrastado con la primera y última señal de
                  CCTV y ping. Presiona una miniatura para abrir la evidencia.
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-1 rounded-lg border border-white/[.07] bg-black/10 p-1">
                {[
                  ["ALL", "Todos"],
                  ["LATE", "Tardíos"],
                  ["EARLY", "Tempranos"],
                  ["NO_ENTRY", "No ingresó"],
                  ["NO_PING", "Sin aperturar"],
                  ["NO_CCTV", "Sin CCTV"],
                ].map(([value, label]) => (
                  <Button
                    key={value}
                    variant={scheduleFilter === value ? "secondary" : "ghost"}
                    size="sm"
                    className="h-7 px-2 text-[10px]"
                    onClick={() => setScheduleFilter(value)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <div className="rounded-xl border border-emerald-500/15 bg-emerald-500/[.04] p-3">
                <p className="text-2xl font-black text-emerald-300">
                  {
                    scheduleRows.filter((row) => row.status === "ON_TIME")
                      .length
                  }
                </p>
                <p className="text-[9px] uppercase text-slate-500">
                  Llegadas a tiempo
                </p>
              </div>
              <div className="rounded-xl border border-amber-500/15 bg-amber-500/[.04] p-3">
                <p className="text-2xl font-black text-amber-300">
                  {scheduleRows.filter((row) => row.status === "LATE").length}
                </p>
                <p className="text-[9px] uppercase text-slate-500">
                  Llegadas tardías
                </p>
              </div>
              <div className="rounded-xl border border-violet-500/15 bg-violet-500/[.04] p-3">
                <p className="text-2xl font-black text-violet-300">
                  {
                    scheduleRows.filter(
                      (row) =>
                        row.status === "NO_ENTRY",
                      ).length
                  }
                </p>
                <p className="text-[9px] uppercase text-slate-500">
                  En línea sin primer ping
                </p>
              </div>
              <div className="rounded-xl border border-blue-500/15 bg-blue-500/[.04] p-3">
                <p className="text-2xl font-black text-blue-300">
                  {scheduleRows.filter((row) => !row.hasCctv).length}
                </p>
                <p className="text-[9px] uppercase text-slate-500">
                  Puntos sin CCTV
                </p>
              </div>
              <button
                type="button"
                onClick={() => setScheduleFilter(scheduleFilter === "NO_PING" ? "ALL" : "NO_PING")}
                className={`rounded-xl border p-3 text-left transition hover:-translate-y-0.5 ${scheduleFilter === "NO_PING" ? "border-rose-400/35 bg-rose-500/[.1]" : "border-rose-500/15 bg-rose-500/[.04] hover:border-rose-400/30"}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-2xl font-black text-rose-300">
                      {pointsWithoutPing}
                    </p>
                    <p className="text-[9px] uppercase text-slate-500">
                      Puntos sin aperturar
                    </p>
                  </div>
                  <Unplug size={18} className="text-rose-300" />
                </div>
                <p className="mt-1 text-[8px] font-bold text-rose-300/75">
                  Sin primer ping · ver lista
                </p>
              </button>
            </div>
            <div className="max-h-[560px] overflow-y-auto pr-1">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {filteredScheduleRows.map((point) => {
                  const status = {
                    ON_TIME: {
                      label: "A tiempo",
                      tone: "text-emerald-300 bg-emerald-500/10 border-emerald-500/20",
                    },
                    LATE: {
                      label: `Tarde ${Math.max(0, point.delay)} min`,
                      tone: "text-amber-300 bg-amber-500/10 border-amber-500/20",
                    },
                    EARLY: {
                      label: `Temprano ${Math.abs(point.delay || 0)} min`,
                      tone: "text-cyan-300 bg-cyan-500/10 border-cyan-500/20",
                    },
                    NO_ENTRY: {
                      label: "No ingresó",
                      tone: "text-rose-300 bg-rose-500/10 border-rose-500/20",
                    },
                  }[point.status];
                  return (
                    <div
                      key={point.locationId}
                      className="group rounded-2xl border border-white/[.08] bg-white/[.02] p-4 transition hover:-translate-y-0.5 hover:border-blue-500/25 hover:bg-white/[.035]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <Store
                              size={16}
                              className="shrink-0 text-blue-300"
                            />
                            <b className="truncate text-sm text-slate-100">
                              {point.name}
                            </b>
                          </div>
                          <p className="mt-1 text-[10px] text-slate-500">
                            {point.zone || "Sin zona"} · SIIS{" "}
                            {point.siisCode || "—"}
                          </p>
                        </div>
                        <Badge
                          variant="outline"
                          className={`shrink-0 text-[9px] ${status.tone}`}
                        >
                          {status.label}
                        </Badge>
                      </div>
                      <div className="mt-3 flex items-center gap-3 border-y border-white/[.06] py-2">
                        <span className="inline-flex items-center gap-1 text-[9px] text-slate-500">
                          SIIS{" "}
                          <i
                            className={`h-2 w-2 rounded-full ${isToday && point.online === true ? "bg-violet-400" : isToday && point.online === false ? "bg-rose-400" : "bg-slate-600"}`}
                          />
                        </span>
                        <span className="inline-flex items-center gap-1 text-[9px] text-slate-500">
                          BOT{" "}
                          <i
                            className={`h-2 w-2 rounded-full ${point.botOnline ? "bg-emerald-400" : "bg-slate-600"}`}
                          />
                        </span>
                        <span className="ml-auto flex gap-1.5">
                          {point.hasCctv && (
                            <span title="CCTV">
                              <Cctv size={15} className="text-blue-300" />
                            </span>
                          )}
                          {point.isDouble && (
                            <span title={`${point.nodes} nodos operativos`}>
                              <UsersRound
                                size={15}
                                className="text-emerald-300"
                              />
                            </span>
                          )}
                          {!point.hasCctv && (
                            <span className="text-[9px] font-bold text-slate-600">
                              SIN CCTV
                            </span>
                          )}
                        </span>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 xl:grid-cols-4">
                        <div>
                          <p className="flex items-center gap-1 text-[9px] text-slate-500">
                            <Clock size={11} />
                            Esperada
                          </p>
                          <b className="text-sm text-slate-200">
                            {point.expectedOpen}
                          </b>
                          <p className="text-[8px] text-slate-600">
                            ±{point.tolerance} min
                          </p>
                          <p className="mt-1 text-[8px] font-bold text-cyan-300/80">
                            Llegada: {point.arrivalAt ? formatTime(point.arrivalAt).slice(0, 5) : "Sin señal"}
                          </p>
                          <p className="text-[8px] text-slate-600">
                            {point.arrivalSource}
                          </p>
                        </div>
                        <div className="rounded-lg bg-black/10 p-2">
                          <p className="text-[9px] text-slate-500">Actividad observada</p>
                          <b className={point.observedOpen ? "text-xs text-emerald-300" : "text-xs text-slate-600"}>
                            {formatTime(point.observedOpen).slice(0, 5)}
                          </b>
                          <span className="px-1 text-slate-700">→</span>
                          <b className={point.observedClose ? "text-xs text-blue-300" : "text-xs text-slate-600"}>
                            {formatTime(point.observedClose).slice(0, 5)}
                          </b>
                          <p className="text-[8px] text-slate-600">
                            {point.closeSource}
                          </p>
                          {point.emailOpeningSource === "VISUAL_EVIDENCE" && point.emailOpeningSignal && point.emailOpeningSignal !== point.observedOpen && (
                            <p className="mt-1 text-[8px] text-amber-300/80">Señal previa {formatTime(point.emailOpeningSignal).slice(0, 5)} sin imagen</p>
                          )}
                        </div>
                        <div className="rounded-lg bg-black/10 p-2">
                          <p className="flex items-center gap-1 text-[9px] text-slate-500"><Radio size={10}/>Ping</p>
                          <b className={point.firstPing ? "text-xs text-violet-300" : "text-xs text-slate-600"}>
                            {formatTime(point.firstPing).slice(0, 5)}
                          </b>
                          <span className="px-1 text-slate-700">→</span>
                          <b className={point.lastPing ? "text-xs text-violet-200" : "text-xs text-slate-600"}>
                            {formatTime(point.lastPing).slice(0, 5)}
                          </b>
                          <p className="text-[8px] text-slate-600">{point.onlinePingSamples || 0}/{point.pingSamples || 0} positivos</p>
                        </div>
                        <div>
                          <p className="text-[9px] text-slate-500">Cierre esperado</p>
                          <b className="text-sm text-blue-300">{point.expectedClose}</b>
                          <p className="text-[8px] text-slate-600">{point.customSchedule ? "personalizado" : "zona/base"}</p>
                        </div>
                      </div>
                      {point.scheduleAlerts?.length > 0 && (
                        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-amber-500/15 pt-3">
                          <AlertTriangle size={12} className="text-amber-300" />
                          {point.scheduleAlerts.map((alert) => (
                            <span key={alert} className="rounded-md border border-amber-500/20 bg-amber-500/[.06] px-1.5 py-1 text-[8px] font-bold text-amber-300">
                              {alert === "OPENING_BEFORE_SCHEDULE" ? "Apertura temprana" : alert === "OPENING_AFTER_SCHEDULE" ? "Apertura tardía" : alert === "CCTV_OPENING_BEFORE_PING" ? "CCTV antes del ping" : "Ping fuera de horario"}
                            </span>
                          ))}
                        </div>
                      )}
                      {(point.openingEvidence || point.closingEvidence) && (
                        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-white/[.06] pt-3">
                          {[['Apertura visual', point.openingEvidence, 'text-emerald-300'], ['Cierre visual', point.closingEvidence, 'text-blue-300']].map(([label, event, tone]) => event ? (
                            <button key={label} type="button" onClick={() => setEvidence(event)} className="flex items-center gap-2 overflow-hidden rounded-lg border border-white/[.07] bg-black/15 p-1.5 text-left transition hover:border-blue-500/30">
                              <img loading="lazy" src={`${CCTV_API_BASE}/api/cctv/events/${event.id}/snapshot`} alt="" className="h-10 w-14 rounded-md object-cover" />
                              <span className="min-w-0"><b className={`block text-[9px] ${tone}`}>{label}</b><span className="block text-[8px] text-slate-500">{formatTime(event.occurredAt || event.receivedAt).slice(0, 5)} · ampliar</span></span>
                            </button>
                          ) : null)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {filteredScheduleRows.length === 0 && (
                <p className="py-12 text-center text-xs text-slate-500">
                  No hay puntos para este filtro.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}
      {data.summary.total === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/[.1] bg-white/[.015] py-16 text-center">
          <Database size={32} className="mx-auto text-slate-600" />
          <h3 className="mt-3 text-sm font-bold text-slate-300">
            Aún no hay eventos persistidos para esta fecha
          </h3>
          <p className="mx-auto mt-1 max-w-lg text-xs text-slate-500">
            Selecciona una fecha anterior o espera el siguiente ciclo de
            procesamiento.
          </p>
        </div>
      ) : (
        <>
          <div className="order-5 grid gap-4 xl:grid-cols-2">
            <div className="contents">
            <Card className="overflow-hidden border-white/[.08] bg-card/40 xl:order-1">
              <div className="h-px bg-gradient-to-r from-transparent via-violet-400/35 to-transparent" />
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">Actividad CCTV por hora</CardTitle>
                    <CardDescription>Aperturas, cierres y movimiento sobre una escala exclusiva de eventos</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={activityHourly} barCategoryGap="20%" barGap={1}>
                      <defs>
                        <linearGradient id="pingRibbon" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#22d3ee" stopOpacity=".34" />
                          <stop offset="58%" stopColor="#0891b2" stopOpacity=".12" />
                          <stop offset="100%" stopColor="#0891b2" stopOpacity="0" />
                        </linearGradient>
                        <filter id="pingGlow" x="-30%" y="-40%" width="160%" height="180%">
                          <feGaussianBlur stdDeviation="3" result="blur" />
                          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
                        </filter>
                        <filter id="barGlow" x="-20%" y="-20%" width="140%" height="150%">
                          <feGaussianBlur stdDeviation="1.4" result="blur" />
                          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
                        </filter>
                        <linearGradient
                          id="motionGradient"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop offset="0%" stopColor="#a78bfa" />
                          <stop
                            offset="100%"
                            stopColor="#6d28d9"
                            stopOpacity=".45"
                          />
                        </linearGradient>
                        <linearGradient
                          id="openingGradient"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop offset="0%" stopColor="#34d399" />
                          <stop
                            offset="100%"
                            stopColor="#059669"
                            stopOpacity=".5"
                          />
                        </linearGradient>
                        <linearGradient
                          id="closingGradient"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop offset="0%" stopColor="#60a5fa" />
                          <stop
                            offset="100%"
                            stopColor="#2563eb"
                            stopOpacity=".5"
                          />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        strokeDasharray="3 5"
                        stroke="rgba(148,163,184,.09)"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="hour"
                        tick={{ fontSize: 9, fill: "#64748b" }}
                        axisLine={false}
                        tickLine={false}
                        interval={2}
                      />
                      <YAxis
                        yAxisId="events"
                        tick={{ fontSize: 9, fill: "#64748b" }}
                        axisLine={false}
                        tickLine={false}
                        allowDecimals={false}
                      />
                      <Tooltip
                        cursor={{ fill: "rgba(59,130,246,.025)" }}
                        contentStyle={{
                          background: "#07101f",
                          border: "1px solid rgba(148,163,184,.18)",
                          borderRadius: 12,
                          fontSize: 11,
                        }}
                      />
                      <Legend
                        iconType="circle"
                        wrapperStyle={{ fontSize: 9, paddingTop: 14, opacity: .85 }}
                      />
                      <Bar
                        yAxisId="events"
                        dataKey="motion"
                        name="Movimiento"
                        stackId="cctv"
                        fill="url(#motionGradient)"
                        maxBarSize={24}
                        style={{ filter: "url(#barGlow)" }}
                        animationDuration={900}
                      />
                      <Bar
                        yAxisId="events"
                        dataKey="openings"
                        name="Aperturas"
                        stackId="cctv"
                        fill="url(#openingGradient)"
                        maxBarSize={24}
                        style={{ filter: "url(#barGlow)" }}
                        animationDuration={1100}
                      />
                      <Bar
                        yAxisId="events"
                        dataKey="closures"
                        name="Cierres"
                        stackId="cctv"
                        fill="url(#closingGradient)"
                        radius={[6, 6, 1, 1]}
                        maxBarSize={24}
                        style={{ filter: "url(#barGlow)" }}
                        animationDuration={1300}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
            <Card className="overflow-hidden border-cyan-500/10 bg-card/40 xl:order-2">
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">Primer ping SIIS</CardTitle>
                    <CardDescription>Distribución horaria de la primera señal observada por punto</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Badge variant="outline" className="border-cyan-500/20 text-cyan-300">{firstPingTotal} puntos</Badge>
                    <Badge variant="outline">Pico {pingPeak.hour}</Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={activityHourly}>
                      <defs>
                        <linearGradient id="pingRibbonSolo" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#22d3ee" stopOpacity=".38"/><stop offset="60%" stopColor="#0891b2" stopOpacity=".12"/><stop offset="100%" stopColor="#0891b2" stopOpacity="0"/></linearGradient>
                        <filter id="pingGlowSolo" x="-30%" y="-40%" width="160%" height="180%"><feGaussianBlur stdDeviation="3" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
                      </defs>
                      <CartesianGrid strokeDasharray="3 5" stroke="rgba(34,211,238,.07)" vertical={false}/>
                      <XAxis dataKey="hour" tick={{fontSize:9,fill:'#64748b'}} axisLine={false} tickLine={false} interval={2}/>
                      <YAxis tick={{fontSize:9,fill:'#0891b2'}} axisLine={false} tickLine={false} allowDecimals={false}/>
                      <Tooltip cursor={{stroke:'rgba(34,211,238,.18)',strokeWidth:1}} contentStyle={{background:'#07101f',border:'1px solid rgba(34,211,238,.18)',borderRadius:12,fontSize:10}}/>
                      <Area type="monotoneX" dataKey="firstPings" name="Primer ping SIIS" stroke="#22d3ee" strokeWidth={2.2} fill="url(#pingRibbonSolo)" style={{filter:'url(#pingGlowSolo)'}} dot={false} activeDot={{r:4,fill:'#07101f',stroke:'#22d3ee',strokeWidth:2}} animationDuration={1400}/>
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
            </div>
            <Card className="border-white/[.08] bg-card/40 xl:order-3 xl:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">
                  Composición normalizada
                </CardTitle>
                <CardDescription>
                  Qué está generando la actividad del día
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                {data.categories.map((row) => {
                  const Icon = icons[row.eventType] || Activity;
                  const pct = data.summary.total
                    ? Math.round((row.total / data.summary.total) * 100)
                    : 0;
                  return (
                    <div
                      key={`${row.eventType}-${row.severity}`}
                      className="rounded-xl border border-white/[.07] bg-white/[.02] p-3"
                    >
                      <div className="flex items-center gap-3">
                        <span className="grid h-9 w-9 place-items-center rounded-lg bg-blue-500/[.07] text-blue-300">
                          <Icon size={18} />
                        </span>
                        <div className="flex-1">
                          <div className="flex justify-between">
                            <b className="text-xs text-slate-200">
                              {labels[row.eventType] || row.eventType}
                            </b>
                            <b className="text-sm text-slate-100">
                              {row.total}
                            </b>
                          </div>
                          <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-800">
                            <div
                              className="h-full rounded-full bg-blue-500"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <p className="mt-1 text-[9px] text-slate-500">
                            {row.linked} vinculados · {row.unlinked} por
                            conciliar
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>
          <div className="order-5 grid gap-4 xl:grid-cols-2">
            <Card className="border-white/[.08] bg-card/40">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">
                      Señales CCTV de jornada
                    </CardTitle>
                    <CardDescription>
                      Primera apertura y último cierre técnico por punto
                    </CardDescription>
                  </div>
                  <Badge variant="outline">
                    {visiblePointOperations.length} puntos
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="max-h-[430px] space-y-2 overflow-y-auto pr-1">
                  {visiblePointOperations.length ? (
                    visiblePointOperations.map((point) => (
                      <div
                        key={point.key}
                        className={`rounded-xl border p-3 ${point.status === "COMPLETE" ? "border-emerald-500/15 bg-emerald-500/[.035]" : "border-amber-500/15 bg-amber-500/[.035]"}`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <span
                              className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${point.status === "COMPLETE" ? "bg-emerald-500/10 text-emerald-300" : "bg-amber-500/10 text-amber-300"}`}
                            >
                              <Store size={20} />
                            </span>
                            <div className="min-w-0">
                              <b className="block truncate text-xs text-slate-200">
                                {point.name}
                              </b>
                              <p className="text-[9px] text-slate-500">
                                {point.zone ||
                                  (!point.linked
                                    ? "Identidad pendiente"
                                    : "Zona por confirmar")}
                              </p>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-4 text-right">
                            <div>
                              <p className="text-[9px] text-slate-500">
                                Apertura
                              </p>
                              <b className="text-xs text-emerald-300">
                                {formatTime(point.opening)}
                              </b>
                            </div>
                            <div>
                              <p className="text-[9px] text-slate-500">
                                Cierre
                              </p>
                              <b className="text-xs text-blue-300">
                                {formatTime(point.closing)}
                              </b>
                            </div>
                          </div>
                          <Badge variant="outline" className={point.status === "COMPLETE" ? "border-emerald-500/20 text-emerald-300" : "border-amber-500/20 text-amber-300"}>
                            {point.status === "COMPLETE" ? "Jornada completa" : point.opening ? "Solo apertura" : "Solo cierre"}
                          </Badge>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="py-12 text-center text-xs text-slate-500">
                      No hay aperturas ni cierres para esta fecha.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
            <Card className="border-white/[.08] bg-card/40">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">
                      Movimiento consolidado
                    </CardTitle>
                    <CardDescription>
                      Detecciones del día agrupadas por punto, sin duplicar cámaras
                    </CardDescription>
                  </div>
                  <Badge
                    variant="outline"
                    className={
                      motionPointGroups.some(row=>row.noisy)
                        ? "border-amber-500/20 text-amber-300"
                        : ""
                    }
                  >
                    {motionPointGroups.filter(row=>row.noisy).length} con ráfaga
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="max-h-[430px] space-y-2 overflow-y-auto pr-1">
                  {motionPointGroups.length ? (
                    motionPointGroups.map((burst) => (
                      <div
                        key={burst.location}
                        className={`flex items-center gap-3 rounded-xl border p-3 ${burst.noisy ? "border-amber-500/20 bg-amber-500/[.04]" : "border-white/[.07] bg-white/[.02]"}`}
                      >
                        <span
                          className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${burst.noisy ? "bg-amber-500/10 text-amber-300" : "bg-violet-500/10 text-violet-300"}`}
                        >
                          <Activity size={20} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex justify-between gap-3">
                            <b className="truncate text-xs text-slate-200">
                              {burst.location}
                            </b>
                            <b
                              className={
                                burst.noisy
                                  ? "text-amber-300"
                                  : "text-slate-300"
                              }
                            >
                              {burst.count}
                            </b>
                          </div>
                          <p className="truncate text-[9px] text-slate-500">
                            {burst.channels.length} {burst.channels.length===1?'canal':'canales'} · {formatTime(burst.from)}–{formatTime(burst.to)}
                          </p>
                        </div>
                        {burst.noisy && (
                          <Badge className="bg-amber-500/10 text-amber-300 hover:bg-amber-500/10">
                            Ráfaga
                          </Badge>
                        )}
                      </div>
                    ))
                  ) : (
                    <p className="py-12 text-center text-xs text-slate-500">
                      No se observaron detecciones de movimiento.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
          <div className="order-5 grid gap-4 xl:grid-cols-[.8fr_1.2fr]">
            <Card className="border-amber-500/15 bg-card/40">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">
                      Identidades por conciliar
                    </CardTitle>
                    <CardDescription>
                      Alias del correo que aún no apuntan al catálogo
                    </CardDescription>
                  </div>
                  <Badge
                    variant="outline"
                    className="border-amber-500/20 text-amber-300"
                  >
                    {visibleIdentityPending.length}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="max-h-80 space-y-2 overflow-y-auto">
                  {visibleIdentityPending.map((item) => (
                    <button
                      type="button"
                      onClick={() => setInsight("identity")}
                      key={item.name}
                      className="w-full rounded-xl border border-white/[.07] bg-white/[.02] p-3 text-left transition hover:border-amber-500/25 hover:bg-amber-500/[.035]"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <b className="block truncate text-xs text-slate-200">
                            {item.name}
                          </b>
                          <p className="mt-1 truncate text-[9px] text-slate-500">
                            {item.eventTypes
                              .map((type) => labels[type] || type)
                              .join(" · ")}
                          </p>
                        </div>
                        <span className="text-right"><b className="block text-xl font-black text-amber-300">{item.total}</b><span className="text-[8px] font-bold text-amber-300/70">Revisar →</span></span>
                      </div>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
            <Card className="border-white/[.08] bg-card/40">
              <CardHeader>
                <CardTitle className="text-base">
                  Trazabilidad reciente
                </CardTitle>
                <CardDescription>
                  Incidentes correlacionados; el UID individual permanece auditable
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                  {traceItems.map((item) => {
                    const Icon = icons[item.eventType] || Activity;
                    return (
                      <div
                        key={item.id}
                        className="flex items-start gap-3 rounded-xl border border-white/[.07] bg-white/[.02] p-3"
                      >
                        <span
                          className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${item.location ? "bg-emerald-500/[.08] text-emerald-300" : "bg-amber-500/[.08] text-amber-300"}`}
                        >
                          <Icon size={19} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <b className="text-xs text-slate-200">
                                {labels[item.eventType] || item.eventType}
                              </b>
                              <p className="mt-0.5 text-[10px] text-slate-400">
                                {item.location ||
                                  item.payload.storeRaw ||
                                  "Ubicación por identificar"}
                                {item.zone ? ` · ${item.zone}` : ""}
                              </p>
                            </div>
                            <span className="text-[10px] font-bold text-slate-500">
                              {formatTime(item.occurredAt || item.receivedAt)}
                            </span>
                          </div>
                          <p className="mt-1 truncate text-[9px] text-slate-600">
                            {item.sourceEventId} ·{" "}
                            {item.payload.channelRaw || "sin canal"}
                          </p>
                          {item.notificationCount > 1 && <p className="mt-1 text-[8px] font-bold text-cyan-300/75">{item.notificationCount} avisos correlacionados{item.sourceCount>1?` · ${item.sourceCount} fuentes`:''}</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
          {(data.evidenceItems || []).length > 0 && (
            <Card className="order-4 border-blue-500/15 bg-card/40">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">
                      Evidencias operativas seleccionadas
                    </CardTitle>
                    <CardDescription>
                      Primera apertura, último cierre y una imagen
                      representativa por incidente; se correlacionan avisos de NVR y DSS.
                    </CardDescription>
                  </div>
                  <Badge
                    variant="outline"
                    className="border-blue-500/20 text-blue-300"
                  >
                    {evidenceItems.length} relevantes
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {evidenceItems.slice(0, 16).map((item) => {
                    const type = item.evidenceType || item.eventType;
                    const config = {
                      OPENING: {
                        label: "Primera apertura",
                        icon: Store,
                        tone: "text-emerald-300",
                        badge: "bg-emerald-500/90",
                      },
                      CLOSING: {
                        label: "Último cierre",
                        icon: ShieldCheck,
                        tone: "text-blue-300",
                        badge: "bg-blue-500/90",
                      },
                      MOTION_BURST: {
                        label: item.burstNoisy
                          ? "Ráfaga de movimiento"
                          : "Detección de movimiento",
                        icon: Activity,
                        tone: item.burstNoisy
                          ? "text-amber-300"
                          : "text-violet-300",
                        badge: item.burstNoisy
                          ? "bg-amber-500/90"
                          : "bg-violet-500/90",
                      },
                      ALARMA_LOCAL: {
                        label: "Alarma local",
                        icon: BellRing,
                        tone: "text-rose-300",
                        badge: "bg-rose-500/90",
                      },
                      DETECCION_HUMANA: {
                        label: "Detección humana",
                        icon: UsersRound,
                        tone: "text-fuchsia-300",
                        badge: "bg-fuchsia-500/90",
                      },
                    }[type] || {
                      label: labels[type] || type,
                      icon: Camera,
                      tone: "text-slate-300",
                      badge: "bg-slate-700/90",
                    };
                    const Icon = config.icon;
                    return (
                      <button
                        type="button"
                        key={item.id}
                        onClick={() => setEvidence(item)}
                        className="group overflow-hidden rounded-xl border border-white/[.08] bg-white/[.02] text-left transition hover:-translate-y-0.5 hover:border-blue-500/30"
                      >
                        <div className="relative h-28 overflow-hidden bg-slate-900">
                          <img
                            loading="lazy"
                            src={`${CCTV_API_BASE}/api/cctv/events/${item.id}/snapshot`}
                            alt=""
                            className="h-full w-full object-cover opacity-80 transition duration-300 group-hover:scale-105 group-hover:opacity-100"
                          />
                          <span
                            className={`absolute left-2 top-2 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[9px] font-bold text-white ${config.badge}`}
                          >
                            <Icon size={12} />
                            {config.label}
                          </span>
                          {item.burstCount && (
                            <span className="absolute bottom-2 right-2 rounded-md bg-black/75 px-2 py-1 text-[9px] font-bold text-white">
                              {item.burstCount} detecciones
                            </span>
                          )}
                          {item.correlationSourceCount > 1 && (
                            <span className="absolute bottom-2 right-2 rounded-md bg-cyan-950/90 px-2 py-1 text-[9px] font-bold text-cyan-100">
                              {item.correlationSourceCount} fuentes
                            </span>
                          )}
                        </div>
                        <div className="p-3">
                          <b className="block truncate text-xs text-slate-200">
                            {item.location ||
                              item.payload.storeRaw ||
                              "Por identificar"}
                          </b>
                          <div className="mt-1 flex items-center justify-between">
                            <span className="text-[9px] text-slate-500">
                              {formatTime(item.occurredAt || item.receivedAt)}
                            </span>
                            <span
                              className={`text-[9px] font-bold ${config.tone}`}
                            >
                              Ampliar
                            </span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
      {insight && (
        <EventInsightModal
          type={insight}
          data={data}
          formatTime={formatTime}
          onClose={() => setInsight(null)}
        />
      )}
      <EventEvidenceModal
        event={evidence}
        formatTime={formatTime}
        onClose={() => setEvidence(null)}
      />
    </div>
  );
}

function MaintenanceIdentityCard({ item, onChanged }) {
  const [open,setOpen]=useState(false),[query,setQuery]=useState(item.location||item.rawName||""),[results,setResults]=useState([]),[selected,setSelected]=useState(null),[saving,setSaving]=useState(false),[error,setError]=useState("");
  useEffect(()=>{if(!open)return;const timer=setTimeout(()=>fetch(`${CCTV_API_BASE}/api/cctv/locations?search=${encodeURIComponent(query)}`).then(r=>r.json()).then(data=>setResults(data.items||[])).catch(()=>setError("No fue posible consultar ubicaciones.")),250);return()=>clearTimeout(timer)},[open,query]);
  const link=async()=>{setSaving(true);setError("");try{const response=await fetch(`${CCTV_API_BASE}/api/cctv/maintenance/${encodeURIComponent(item.id)}/link`,{method:"POST",headers:{"Content-Type":"application/json","X-Actor":"skylab-local-user"},body:JSON.stringify({locationId:selected.id})});const result=await response.json();if(!response.ok)throw new Error(result.error||"No fue posible vincular");await onChanged?.()}catch(e){setError(e.message)}finally{setSaving(false)}};
  return <div className={`mt-3 rounded-lg border ${open?'border-blue-500/25':'border-amber-500/15'}`}><button className="flex w-full items-center justify-between p-2 text-left text-[10px] font-bold text-amber-300" onClick={()=>setOpen(!open)}><span className="flex items-center gap-2"><Search size={13}/> Conciliar con Operación de Puntos</span><ArrowRight size={12} className={open?'rotate-90 transition':'transition'}/></button>{open&&<div className="border-t border-white/[.05] p-2"><Input value={query} onChange={e=>{setQuery(e.target.value);setSelected(null)}} placeholder="Nombre, código SIIS o zona" className="h-8 text-xs"/><div className="mt-2 max-h-36 space-y-1 overflow-y-auto">{results.map(candidate=><button key={candidate.id} onClick={()=>setSelected(candidate)} className={`w-full rounded-md border p-2 text-left text-[10px] ${selected?.id===candidate.id?'border-blue-500 bg-blue-500/10':'border-white/[.06]'}`}><b>{candidate.name}</b><p className="text-[9px] text-slate-500">{candidate.zone} · SIIS {candidate.code||'sin código'}</p></button>)}</div>{error&&<p className="mt-2 text-[9px] text-rose-300">{error}</p>}<Button size="sm" className="mt-2 h-8 w-full text-[10px]" disabled={!selected||saving} onClick={link}>{saving?'Guardando…':selected?`Vincular con ${selected.name}`:'Selecciona una ubicación'}</Button></div>}</div>;
}

function SupportCardModal({item,onClose,labels,tones,typeIcons,stamp}){
  if(!item)return null;const Icon=typeIcons[item.activityType]||Wrench;
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-sm" onMouseDown={event=>event.target===event.currentTarget&&onClose()}><div className="max-h-[92vh] w-full max-w-5xl overflow-hidden rounded-2xl border border-cyan-500/15 bg-[#07101f] shadow-2xl shadow-cyan-950/30"><div className="flex items-center justify-between border-b border-white/[.07] px-5 py-4"><div className="flex items-center gap-3"><span className={`grid h-10 w-10 place-items-center rounded-xl ${tones[item.activityType]}`}><Icon size={20}/></span><div><p className="text-[9px] font-black uppercase tracking-[.16em] text-cyan-300">Detalle de soporte</p><h3 className="text-sm font-black text-slate-100">{labels[item.activityType]}</h3></div></div><button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg border border-white/[.07] text-slate-400 transition hover:bg-white/[.05] hover:text-white" aria-label="Cerrar"><XCircle size={18}/></button></div><div className="grid max-h-[calc(92vh-74px)] overflow-y-auto lg:grid-cols-[1.25fr_.75fr]">{item.image?<div className="flex min-h-72 items-center justify-center bg-black/35 p-4"><img src={item.image.url} alt={item.image.name||item.title} className="max-h-[68vh] w-full rounded-xl object-contain"/></div>:<div className="flex min-h-72 items-center justify-center bg-gradient-to-br from-slate-950 to-slate-900 text-slate-600"><span className={`grid h-20 w-20 place-items-center rounded-2xl border border-white/[.06] ${tones[item.activityType]}`}><Icon size={38}/></span></div>}<div className="space-y-4 p-5"><div><div className="flex flex-wrap items-center gap-2"><Badge variant="outline" className={item.status==='PENDING'?'border-amber-500/20 text-amber-300':'border-emerald-500/20 text-emerald-300'}>{item.status==='PENDING'?'Pendiente':'Ejecutada'}</Badge>{item.attachmentCount>0&&<Badge variant="outline" className="border-cyan-500/20 text-cyan-300"><ImageIcon size={11} className="mr-1"/>{item.attachmentCount} evidencia{item.attachmentCount===1?'':'s'}</Badge>}</div><h4 className="mt-3 text-lg font-black leading-snug text-slate-100">{item.title}</h4>{item.description&&<p className="mt-3 whitespace-pre-wrap text-xs leading-relaxed text-slate-400">{item.description}</p>}</div><div className="grid grid-cols-2 gap-2">{[['Fecha operacional',stamp(item.operationalAt)],['Lista',item.list],['Punto',item.location||'Sin vincular'],['Zona',item.zone||'Por conciliar'],['Responsable',item.members.length?item.members.map(x=>x.name).join(', '):'Sin asignar'],['Fuente de fecha',item.dateSource==='TRELLO_DUE'?'Fecha del evento':'Última actividad']].map(([label,value])=><div key={label} className="rounded-xl border border-white/[.06] bg-white/[.02] p-3"><p className="text-[8px] font-bold uppercase tracking-wide text-slate-600">{label}</p><p className="mt-1 text-[10px] font-semibold text-slate-300">{value}</p></div>)}</div><Button asChild variant="outline" className="w-full"><a href={item.url} target="_blank" rel="noreferrer">Abrir tarjeta original en Trello <ArrowRight size={13} className="ml-2"/></a></Button></div></div></div></div>;
}

function VisitorPeriodPicker({period,date,onDate,availableDays,today}){
  const [calendarOpen,setCalendarOpen]=useState(false),[viewMonth,setViewMonth]=useState(date.slice(0,7));
  const activity=new Map((availableDays||[]).map(row=>[row.date,Number(row.visits||0)])),selectedYear=Number(date.slice(0,4)),monthNames=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const years=[...new Set((availableDays||[]).map(row=>Number(row.date.slice(0,4))).concat([selectedYear]))].sort((a,b)=>b-a),isoWeek=value=>{const d=new Date(`${value}T12:00:00Z`),day=d.getUTCDay()||7;d.setUTCDate(d.getUTCDate()+4-day);const yearStart=new Date(Date.UTC(d.getUTCFullYear(),0,1));return Math.ceil((((d-yearStart)/86400000)+1)/7)},mondayOfWeek=(year,week)=>{const jan4=new Date(Date.UTC(year,0,4)),day=jan4.getUTCDay()||7;jan4.setUTCDate(jan4.getUTCDate()-day+1+(week-1)*7);return jan4.toISOString().slice(0,10)};
  const selectedWeek=isoWeek(date),setYear=year=>onDate(`${year}-${date.slice(5)}`>today?today:`${year}-${date.slice(5)}`),monthStart=new Date(`${viewMonth}-01T12:00:00Z`),daysInMonth=new Date(Date.UTC(monthStart.getUTCFullYear(),monthStart.getUTCMonth()+1,0)).getUTCDate(),leading=(monthStart.getUTCDay()+6)%7,calendar=[...Array(leading).fill(null),...Array.from({length:daysInMonth},(_,index)=>`${viewMonth}-${String(index+1).padStart(2,'0')}`)];
  const shiftMonth=delta=>{const d=new Date(`${viewMonth}-15T12:00:00Z`);d.setUTCMonth(d.getUTCMonth()+delta);setViewMonth(d.toISOString().slice(0,7))},selectClass='h-10 rounded-xl border border-cyan-500/20 bg-[#07101f] px-3 text-[11px] font-bold text-slate-200 outline-none transition focus:border-cyan-400/50';
  if(period==='WEEK')return <div className="flex gap-2"><select aria-label="Año" value={selectedYear} onChange={event=>onDate(mondayOfWeek(Number(event.target.value),selectedWeek))} className={selectClass}>{years.map(year=><option key={year}>{year}</option>)}</select><select aria-label="Semana del año" value={selectedWeek} onChange={event=>onDate(mondayOfWeek(selectedYear,Number(event.target.value)))} className={`${selectClass} min-w-40`}>{Array.from({length:53},(_,index)=>index+1).map(week=><option key={week} value={week}>Semana {week}</option>)}</select></div>;
  if(period==='MONTH')return <div className="flex gap-2"><select aria-label="Mes" value={Number(date.slice(5,7))} onChange={event=>onDate(`${selectedYear}-${String(event.target.value).padStart(2,'0')}-01`)} className={`${selectClass} min-w-32`}>{monthNames.map((name,index)=><option key={name} value={index+1}>{name}</option>)}</select><select aria-label="Año" value={selectedYear} onChange={event=>onDate(`${event.target.value}-${date.slice(5,7)}-01`)} className={selectClass}>{years.map(year=><option key={year}>{year}</option>)}</select></div>;
  if(period==='YEAR')return <select aria-label="Año" value={selectedYear} onChange={event=>setYear(Number(event.target.value))} className={`${selectClass} min-w-28`}>{years.map(year=><option key={year}>{year}</option>)}</select>;
  return <div className="relative"><button type="button" onClick={()=>{setViewMonth(date.slice(0,7));setCalendarOpen(!calendarOpen)}} className="flex h-10 min-w-52 items-center justify-between rounded-xl border border-cyan-500/25 bg-cyan-500/[.055] px-3 text-left text-[11px] font-bold text-cyan-100 shadow-[0_0_18px_rgba(34,211,238,.05)]"><span className="flex items-center gap-2"><CalendarDays size={16} className="text-cyan-300"/>{new Intl.DateTimeFormat('es-CO',{dateStyle:'long',timeZone:'UTC'}).format(new Date(`${date}T12:00:00Z`))}</span><span className={`h-2 w-2 rounded-full ${activity.has(date)?'bg-emerald-400 shadow-[0_0_8px_#34d399]':'bg-slate-700'}`}/></button>{calendarOpen&&<div className="absolute right-0 z-50 mt-2 w-80 rounded-2xl border border-cyan-500/20 bg-[#07101f] p-4 shadow-2xl shadow-black/60"><div className="mb-3 flex items-center justify-between"><button onClick={()=>shiftMonth(-1)} className="rounded-lg border border-white/[.07] px-3 py-1 text-slate-400">‹</button><b className="text-xs capitalize text-slate-100">{new Intl.DateTimeFormat('es-CO',{month:'long',year:'numeric',timeZone:'UTC'}).format(monthStart)}</b><button onClick={()=>shiftMonth(1)} className="rounded-lg border border-white/[.07] px-3 py-1 text-slate-400">›</button></div><div className="grid grid-cols-7 gap-1 text-center">{['L','M','M','J','V','S','D'].map((label,index)=><span key={`${label}-${index}`} className="py-1 text-[8px] font-black text-slate-600">{label}</span>)}{calendar.map((day,index)=>day?<button key={day} disabled={day>today} onClick={()=>{onDate(day);setCalendarOpen(false)}} className={`relative h-9 rounded-lg text-[10px] font-bold transition ${day===date?'bg-cyan-500 text-slate-950':activity.has(day)?'border border-emerald-500/25 bg-emerald-500/[.08] text-emerald-200 hover:bg-emerald-500/15':'text-slate-500 hover:bg-white/[.04]'} disabled:opacity-20`}>{Number(day.slice(-2))}{activity.has(day)&&<i className={`absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full ${day===date?'bg-slate-950':'bg-emerald-400'}`}/>}</button>:<span key={`blank-${index}`}/>)}</div><div className="mt-3 flex items-center gap-2 border-t border-white/[.06] pt-3 text-[9px] text-slate-500"><i className="h-2 w-2 rounded-full bg-emerald-400"/> Los días marcados contienen visitantes</div></div>}</div>;
}

function RealVisitors({search='',initialDate}){
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),[period,setPeriod]=useState('DAY'),[date,setDate]=useState(initialDate||today),[data,setData]=useState(null),[error,setError]=useState('');
  useEffect(()=>{setError('');fetch(`${CCTV_API_BASE}/api/cctv/visitors?period=${period}&date=${date}`,{cache:'no-store'}).then(response=>{if(!response.ok)throw new Error('No fue posible consultar visitantes');return response.json()}).then(setData).catch(error=>setError(error.message));},[period,date]);
  const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(),query=normalize(search),visits=(data?.visits||[]).filter(item=>!query||normalize(`${item.name} ${item.host} ${item.reason} ${item.documentMasked}`).includes(query)),reasonColors=['#22d3ee','#8b5cf6','#10b981','#f59e0b','#f43f5e','#60a5fa'];
  if(!data)return <div className="py-20 text-center text-sm text-slate-500">{error||'Analizando reportes de visitantes…'}</div>;
  const timeline=period==='DAY'?data.hourly.map(row=>({name:row.hour,value:row.visits})):data.days.map(row=>({name:new Intl.DateTimeFormat('es-CO',{day:'2-digit',month:'short',timeZone:'America/Bogota'}).format(new Date(`${row.date}T12:00:00-05:00`)),value:row.visits}));
  const uniqueShare=data.summary.visits?Math.round(data.summary.uniqueVisitors/data.summary.visits*100):0,returningShare=data.summary.uniqueVisitors?Math.round(data.summary.returningVisitors/data.summary.uniqueVisitors*100):0,kpis=[['Visitas',data.summary.visits,'Registros consolidados',UsersRound,'text-cyan-300 bg-cyan-500/10',`${data.summary.reports} reportes fuente`,100],['Visitantes únicos',data.summary.uniqueVisitors,'Personas identificadas',ShieldCheck,'text-blue-300 bg-blue-500/10',`${uniqueShare}% del flujo`,uniqueShare],['Primera visita',data.summary.firstTimeVisitors,'Sin historial anterior',Sparkles,'text-emerald-300 bg-emerald-500/10',`${data.summary.uniqueVisitors?Math.round(data.summary.firstTimeVisitors/data.summary.uniqueVisitors*100):0}% de visitantes`,data.summary.uniqueVisitors?Math.round(data.summary.firstTimeVisitors/data.summary.uniqueVisitors*100):0],['Recurrentes',data.summary.returningVisitors,'Ya habían ingresado',RefreshCw,'text-violet-300 bg-violet-500/10',`${returningShare}% de visitantes`,returningShare],['Sin salida',data.summary.openVisits,'Visitas aún abiertas',Clock,'text-amber-300 bg-amber-500/10',data.summary.openVisits?'Requiere seguimiento':'Jornada conciliada',data.summary.visits?Math.round(data.summary.openVisits/data.summary.visits*100):0]];
  return <div className="space-y-5 animate-in fade-in duration-500">
    <Card className="overflow-visible border-cyan-500/15 bg-card/40"><div className="h-px bg-gradient-to-r from-cyan-400/0 via-cyan-400/50 to-violet-400/0"/><CardHeader><div className="flex flex-wrap items-center justify-between gap-4"><div className="flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-xl border border-cyan-500/20 bg-cyan-500/10 text-cyan-300"><UsersRound size={25}/></span><div><p className="text-[9px] font-bold uppercase tracking-[.18em] text-cyan-300">Control de acceso ZK</p><CardTitle>Reporte inteligente de visitantes</CardTitle><CardDescription>{data.startDate} — {data.endDate} · {data.summary.reports} reportes procesados</CardDescription></div></div><div className="flex flex-wrap items-center gap-2"><VisitorPeriodPicker period={period} date={date} onDate={setDate} availableDays={data.availableDays} today={today}/><div className="flex rounded-xl border border-white/[.08] bg-black/20 p-1">{[['DAY','Día'],['WEEK','Semana'],['MONTH','Mes'],['YEAR','Año']].map(([key,label])=><button key={key} onClick={()=>setPeriod(key)} className={`rounded-lg px-3 py-2 text-[10px] font-bold transition ${period===key?'bg-cyan-500/15 text-cyan-200 shadow-[0_0_12px_rgba(34,211,238,.06)]':'text-slate-500 hover:text-slate-300'}`}>{label}</button>)}</div></div></div></CardHeader></Card>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{kpis.map(([label,value,detail,Icon,tone,footer,progress])=><div key={label} className="flex min-h-32 flex-col justify-between rounded-2xl border border-white/[.08] bg-gradient-to-br from-white/[.035] to-transparent p-4"><div className="flex items-start justify-between"><div><b className="text-3xl font-black text-slate-100">{value}</b><p className="mt-1 text-[9px] font-black uppercase tracking-[.12em] text-slate-400">{label}</p></div><span className={`grid h-11 w-11 place-items-center rounded-xl ${tone}`}><Icon size={21}/></span></div><div><div className="mb-2 h-1 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-current opacity-80" style={{width:`${Math.min(100,progress)}%`}}/></div><div className="flex items-center justify-between gap-2 text-[10px] leading-tight"><span className="font-medium text-slate-500">{detail}</span><b className="shrink-0 text-[11px] text-slate-300">{footer}</b></div></div></div>)}</div>
    <div className="grid gap-4 xl:grid-cols-[1.2fr_.8fr]"><Card className="border-white/[.08] bg-card/40"><CardHeader><CardTitle className="text-base">Flujo de visitantes</CardTitle><CardDescription>{period==='DAY'?'Ingresos por hora':'Volumen diario del periodo'}</CardDescription></CardHeader><CardContent><div className="h-64"><ResponsiveContainer width="100%" height="100%"><BarChart data={timeline}><CartesianGrid strokeDasharray="3 5" stroke="rgba(148,163,184,.08)" vertical={false}/><XAxis dataKey="name" tick={{fontSize:9,fill:'#64748b'}} axisLine={false} tickLine={false}/><YAxis allowDecimals={false} tick={{fontSize:9,fill:'#64748b'}} axisLine={false} tickLine={false}/><Tooltip cursor={{fill:'rgba(34,211,238,.035)'}} contentStyle={{background:'#07101f',border:'1px solid rgba(34,211,238,.16)',borderRadius:12,fontSize:10}}/><Bar dataKey="value" name="Visitantes" fill="#22d3ee" radius={[6,6,1,1]} maxBarSize={28}/></BarChart></ResponsiveContainer></div></CardContent></Card><Card className="border-white/[.08] bg-card/40"><CardHeader><div className="flex items-start justify-between gap-3"><div><CardTitle className="text-base">Razones de visita</CardTitle><CardDescription>Clasificación declarada en el kiosco</CardDescription></div><Badge variant="outline" className="border-cyan-500/15 text-cyan-300">{data.reasons.length} categorías</Badge></div></CardHeader><CardContent><div className="grid items-center gap-4 sm:grid-cols-[.8fr_1.2fr] xl:grid-cols-1 2xl:grid-cols-[.82fr_1.18fr]"><div className="relative h-48"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={data.reasons.slice(0,6)} dataKey="value" nameKey="name" innerRadius={54} outerRadius={76} paddingAngle={3} cornerRadius={5} stroke="none">{data.reasons.slice(0,6).map((row,index)=><Cell key={row.name} fill={reasonColors[index%reasonColors.length]}/>)}</Pie><Tooltip contentStyle={{backgroundColor:'#07101f',color:'#f8fafc',border:'1px solid rgba(34,211,238,.22)',borderRadius:12,fontSize:11,boxShadow:'0 16px 35px rgba(0,0,0,.45)'}} itemStyle={{color:'#f8fafc',fontWeight:700}} labelStyle={{color:'#94a3b8',fontWeight:700,marginBottom:4}} cursor={{fill:'transparent'}} formatter={(value,name)=>[`${new Intl.NumberFormat('es-CO').format(value)} visitas`,name]}/></PieChart></ResponsiveContainer><div className="pointer-events-none absolute inset-0 grid place-items-center"><div className="text-center"><b className="block text-xl font-black text-slate-100">{new Intl.NumberFormat('es-CO').format(data.summary.visits)}</b><span className="text-[8px] font-black uppercase tracking-[.14em] text-slate-500">visitas</span></div></div></div><div className="space-y-2">{data.reasons.slice(0,6).map((row,index)=>{const share=data.summary.visits?Math.round(row.value/data.summary.visits*100):0;return <div key={row.name} className="rounded-lg border border-white/[.055] bg-white/[.018] px-3 py-2"><div className="flex items-start justify-between gap-3"><span className="flex min-w-0 items-start gap-2 text-[10px] font-semibold leading-snug text-slate-300"><i className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{background:reasonColors[index%reasonColors.length],boxShadow:`0 0 8px ${reasonColors[index%reasonColors.length]}55`}}/><span className="break-words">{row.name}</span></span><span className="shrink-0 text-right"><b className="block text-[11px] text-slate-100">{new Intl.NumberFormat('es-CO').format(row.value)}</b><small className="text-[8px] text-slate-500">{share}%</small></span></div><div className="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full" style={{width:`${Math.max(2,share)}%`,background:reasonColors[index%reasonColors.length]}}/></div></div>})}</div></div></CardContent></Card></div>
    <Card className="border-white/[.08] bg-card/40"><CardHeader><div className="flex justify-between"><div><CardTitle className="text-base">Bitácora de visitantes</CardTitle><CardDescription>Documento protegido; se muestra únicamente una referencia enmascarada</CardDescription></div><Badge variant="outline">{visits.length}</Badge></div></CardHeader><CardContent><div className="grid max-h-[600px] gap-2 overflow-y-auto md:grid-cols-2 xl:grid-cols-3">{visits.map(item=><div key={item.id} className="rounded-xl border border-white/[.07] bg-white/[.02] p-3"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><b className="block truncate text-sm font-black capitalize text-slate-100">{String(item.name||'').toLocaleLowerCase('es-CO')}</b><p className="text-[10px] font-medium text-slate-500">{item.documentType||'Documento'} {item.documentMasked||'protegido'}</p></div><Badge variant="outline" className={`text-[10px] ${item.isReturning?'border-violet-500/20 text-violet-300':'border-emerald-500/20 text-emerald-300'}`}>{item.isReturning?`${item.lifetimeVisits} visitas`:'Primera vez'}</Badge></div><div className="mt-3 rounded-lg bg-black/15 p-2"><p className="text-[11px] font-bold leading-snug text-cyan-300">{item.reason}</p><p className="mt-1 text-[10px] font-medium text-slate-400">Anfitrión: <span className="capitalize">{String(item.host||'').toLocaleLowerCase('es-CO')}</span></p></div><div className="mt-2 flex justify-between text-[10px] font-medium text-slate-400"><span>Entrada {item.entryAt?.slice(11,16)||'—'}</span><span>Salida {item.exitAt?.slice(11,16)||'Pendiente'}</span></div></div>)}</div></CardContent></Card>
  </div>;
}

function RealSupport({ support }) {
  const [status,setStatus]=useState('ALL'),[type,setType]=useState('ALL'),[period,setPeriod]=useState('MONTH'),[periodKey,setPeriodKey]=useState('ALL'),[evidenceOnly,setEvidenceOnly]=useState(false),[selectedSupport,setSelectedSupport]=useState(null);
  if(!support)return <div className="py-20 text-center text-muted-foreground">Importando actividades de soporte…</div>;
  if(!support.available)return <div className="rounded-2xl border border-amber-500/20 p-8 text-sm text-amber-200">{support.reason}</div>;
  const labels={INSTALLATION:'Instalación',CCTV:'CCTV y tecnología',ALARM:'Alarmas',NETWORK:'Red y HapLite',ACCESS_CONTROL:'Control de acceso',POWER:'Energía y UPS',GENERAL_SUPPORT:'Soporte general'},tones={INSTALLATION:'text-emerald-300 bg-emerald-500/10',CCTV:'text-blue-300 bg-blue-500/10',ALARM:'text-rose-300 bg-rose-500/10',NETWORK:'text-cyan-300 bg-cyan-500/10',ACCESS_CONTROL:'text-violet-300 bg-violet-500/10',POWER:'text-amber-300 bg-amber-500/10',GENERAL_SUPPORT:'text-slate-300 bg-slate-500/10'};
  const typeIcons={INSTALLATION:Sparkles,CCTV:Cctv,ALARM:BellRing,NETWORK:Radio,ACCESS_CONTROL:ScanEye,POWER:HardDrive,GENERAL_SUPPORT:Wrench};
  const stamp=value=>value?new Intl.DateTimeFormat('es-CO',{dateStyle:'medium',timeZone:'America/Bogota'}).format(new Date(value)):'Sin fecha';
  const dateParts=value=>{const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(value)).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));return parts};
  const bucketFor=item=>{const p=dateParts(item.operationalAt);if(period==='DAY')return`${p.year}-${p.month}-${p.day}`;if(period==='YEAR')return p.year;return`${p.year}-${p.month}`};
  const bucketLabel=key=>{const localDate=key.length===4?`${key}-07-01T12:00:00-05:00`:key.length===7?`${key}-15T12:00:00-05:00`:`${key}T12:00:00-05:00`,date=new Date(localDate);return new Intl.DateTimeFormat('es-CO',period==='DAY'?{day:'2-digit',month:'short',timeZone:'America/Bogota'}:period==='YEAR'?{year:'numeric',timeZone:'America/Bogota'}:{month:'short',year:'2-digit',timeZone:'America/Bogota'}).format(date)};
  const dated=support.items.filter(x=>x.operationalAt&&x.status==='COMPLETED'),bucketMap=new Map();for(const item of dated){const key=bucketFor(item),row=bucketMap.get(key)||{key,name:bucketLabel(key),Ejecutadas:0,Instalaciones:0};row.Ejecutadas++;if(item.activityType==='INSTALLATION')row.Instalaciones++;bucketMap.set(key,row)}const timeline=[...bucketMap.values()].sort((a,b)=>a.key.localeCompare(b.key)).slice(period==='DAY'?-31:undefined),periods=[...bucketMap.keys()].sort().reverse();
  const items=support.items.filter(item=>(status==='ALL'||item.status===status)&&(type==='ALL'||item.activityType===type)&&(!evidenceOnly||item.image)&&(periodKey==='ALL'||(item.operationalAt&&bucketFor(item)===periodKey))).sort((a,b)=>Number(!!b.image)-Number(!!a.image));
  return <div className="space-y-5 animate-in fade-in duration-500"><div className="overflow-hidden rounded-2xl border border-cyan-500/10 bg-[linear-gradient(125deg,#081321_0%,#0b1728_55%,#101329_100%)] p-5"><div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center"><div className="flex items-center gap-3"><span className="grid h-14 w-14 place-items-center rounded-xl border border-cyan-400/15 bg-cyan-400/[.08] text-cyan-300"><Activity size={29}/></span><div><p className="text-[10px] font-black uppercase tracking-[.18em] text-cyan-300">Trello · Soporte 2026</p><h2 className="text-xl font-black">Centro de actividad técnica</h2><p className="text-[11px] text-slate-400">Ejecución, evidencias y tareas pendientes en una sola línea operacional</p></div></div><div className="flex flex-wrap items-center gap-2"><Badge variant="outline" className="border-emerald-500/20 text-emerald-300">Actualizado {stamp(support.syncedAt)}</Badge><Button asChild size="sm" variant="outline"><a href={support.source.url} target="_blank" rel="noreferrer">Abrir tablero <ArrowRight size={13} className="ml-1"/></a></Button></div></div></div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{[["Actividades",support.summary.total,<Database key="database" size={21}/>,'text-blue-300 bg-blue-500/10'],['Ejecutadas',support.summary.completed,<CheckCircle2 key="complete" size={21}/>,'text-emerald-300 bg-emerald-500/10'],['Pendientes',support.summary.pending,<Clock key="pending" size={21}/>,'text-amber-300 bg-amber-500/10'],['Con evidencia',support.summary.withImages||0,<ImageIcon key="image" size={21}/>,'text-cyan-300 bg-cyan-500/10'],['Puntos vinculados',support.summary.linked,<MapPin key="linked" size={21}/>,'text-violet-300 bg-violet-500/10']].map(([label,value,icon,tone])=><div key={label} className="flex items-center gap-3 rounded-2xl border border-white/[.07] bg-white/[.025] p-3"><span className={`grid h-10 w-10 place-items-center rounded-xl ${tone}`}>{icon}</span><div><b className="text-xl font-black">{value}</b><p className="text-[8px] font-bold uppercase tracking-wide text-slate-500">{label}</p></div></div>)}</div>
    <div className="grid gap-4 xl:grid-cols-[1.4fr_.6fr]"><Card className="border-white/[.08] bg-card/40"><CardHeader><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><CardTitle className="flex items-center gap-2 text-base"><TrendingUp size={17} className="text-cyan-300"/> Ritmo de atención</CardTitle><CardDescription>Fecha programada del evento; última actividad solo cuando Trello no tiene fecha</CardDescription></div><div className="flex rounded-lg border border-white/[.08] bg-black/20 p-1">{[['DAY','Día'],['MONTH','Mes'],['YEAR','Año']].map(([key,label])=><button key={key} onClick={()=>{setPeriod(key);setPeriodKey('ALL')}} className={`rounded-md px-3 py-1.5 text-[10px] font-bold ${period===key?'bg-cyan-500/15 text-cyan-200':'text-slate-500'}`}>{label}</button>)}</div></div></CardHeader><CardContent><div className="h-64"><ResponsiveContainer width="100%" height="100%"><BarChart data={timeline} barCategoryGap="25%"><CartesianGrid strokeDasharray="3 5" stroke="rgba(148,163,184,.08)" vertical={false}/><XAxis dataKey="name" tick={{fontSize:9,fill:'#64748b'}} axisLine={false} tickLine={false}/><YAxis allowDecimals={false} tick={{fontSize:9,fill:'#64748b'}} axisLine={false} tickLine={false}/><Tooltip cursor={{fill:'rgba(34,211,238,.045)'}} contentStyle={{background:'#07101f',color:'#e2e8f0',border:'1px solid rgba(34,211,238,.18)',borderRadius:12,fontSize:11}} itemStyle={{color:'#e2e8f0'}} labelStyle={{color:'#94a3b8'}}/><Bar dataKey="Ejecutadas" fill="#22d3ee" radius={[5,5,0,0]}/><Bar dataKey="Instalaciones" fill="#8b5cf6" radius={[5,5,0,0]}/></BarChart></ResponsiveContainer></div></CardContent></Card>
    <Card className="border-white/[.08] bg-card/40"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><CalendarDays size={17} className="text-violet-300"/> Periodos</CardTitle><CardDescription>Filtra tarjetas desde la analítica</CardDescription></CardHeader><CardContent><div className="max-h-64 space-y-2 overflow-y-auto"><button onClick={()=>setPeriodKey('ALL')} className={`flex w-full justify-between rounded-xl border p-3 text-left text-xs ${periodKey==='ALL'?'border-cyan-500/30 bg-cyan-500/[.06]':'border-white/[.06]'}`}><b>Todo el periodo</b><span>{dated.length}</span></button>{periods.map(key=>{const count=bucketMap.get(key)?.Ejecutadas||0;return <button key={key} onClick={()=>setPeriodKey(key)} className={`flex w-full justify-between rounded-xl border p-3 text-left text-xs ${periodKey===key?'border-violet-500/30 bg-violet-500/[.06]':'border-white/[.06] bg-white/[.015]'}`}><span className="capitalize">{bucketLabel(key)}</span><b>{count}</b></button>})}</div></CardContent></Card></div>
    <div className="grid gap-4 xl:grid-cols-[.55fr_1.45fr]"><Card className="border-white/[.08] bg-card/40"><CardHeader><CardTitle className="text-base">Tipos de actividad</CardTitle><CardDescription>Selecciona una categoría operacional</CardDescription></CardHeader><CardContent><div className="space-y-2">{support.types.map(row=>{const Icon=typeIcons[row.name]||Wrench;return <button key={row.name} onClick={()=>setType(type===row.name?'ALL':row.name)} className={`flex w-full items-center justify-between rounded-xl border p-3 text-left ${type===row.name?'border-cyan-500/30 bg-cyan-500/[.07]':'border-white/[.06] bg-white/[.02]'}`}><span className="flex items-center gap-2"><span className={`grid h-8 w-8 place-items-center rounded-lg ${tones[row.name]}`}><Icon size={16}/></span><span className="text-[10px] font-bold text-slate-300">{labels[row.name]}</span></span><b className="text-lg">{row.value}</b></button>})}</div></CardContent></Card><Card className="border-white/[.08] bg-card/40"><CardHeader><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><CardTitle className="text-base">Bitácora visual de soporte</CardTitle><CardDescription>Selecciona una tarjeta para consultar el detalle sin salir de Skylab</CardDescription></div><div className="flex flex-wrap gap-2"><button onClick={()=>setEvidenceOnly(!evidenceOnly)} className={`h-9 rounded-md border px-3 text-[10px] font-bold ${evidenceOnly?'border-cyan-500/30 bg-cyan-500/10 text-cyan-200':'border-white/[.08] text-slate-400'}`}><ImageIcon size={13} className="mr-1.5 inline"/> Solo con evidencia</button><select value={status} onChange={e=>setStatus(e.target.value)} className="h-9 rounded-md border bg-background px-3 text-xs"><option value="ALL">Todos los estados</option><option value="PENDING">Pendientes</option><option value="COMPLETED">Ejecutadas</option></select><Badge variant="outline">{items.length}</Badge></div></div></CardHeader><CardContent><div className="grid max-h-[780px] gap-3 overflow-y-auto pr-1 md:grid-cols-2">{items.map(item=>{const Icon=typeIcons[item.activityType]||Wrench;return <button type="button" key={item.id} onClick={()=>setSelectedSupport(item)} className={`group overflow-hidden rounded-xl border text-left transition hover:-translate-y-0.5 hover:border-cyan-500/25 ${item.status==='PENDING'?'border-amber-500/20 bg-amber-500/[.035]':'border-white/[.07] bg-white/[.02]'}`}>{item.image?<div className="relative h-32 overflow-hidden bg-slate-950"><img src={item.image.url} alt={item.image.name||item.title} loading="lazy" className="h-full w-full object-cover opacity-85 transition duration-300 group-hover:scale-[1.03] group-hover:opacity-100"/><span className="absolute bottom-2 right-2 rounded-md bg-black/70 px-2 py-1 text-[8px] text-slate-200"><ImageIcon size={10} className="mr-1 inline"/> Evidencia</span></div>:<div className={`flex h-20 items-center justify-center border-b border-white/[.05] bg-gradient-to-r from-slate-950/70 to-slate-900/30 ${tones[item.activityType]?.split(' ')[0]||'text-slate-500'}`}><span className="grid h-11 w-11 place-items-center rounded-xl border border-white/[.06] bg-white/[.025]"><Icon size={23}/></span></div>}<div className="p-3"><div className="flex items-start justify-between gap-2"><span className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-[8px] font-black uppercase ${tones[item.activityType]}`}><Icon size={11}/>{labels[item.activityType]}</span><Badge variant="outline" className={item.status==='PENDING'?'shrink-0 border-amber-500/20 text-amber-300':'shrink-0 border-emerald-500/20 text-emerald-300'}>{item.status==='PENDING'?'Pendiente':'Ejecutada'}</Badge></div><b className="mt-2 line-clamp-3 block text-xs leading-relaxed text-slate-200">{item.title}</b>{item.location&&<p className="mt-2 text-[9px] font-bold text-violet-300">{item.location} · {item.zone}</p>}<div className="mt-3 flex items-center justify-between border-t border-white/[.05] pt-2 text-[9px] text-slate-500"><span>{stamp(item.operationalAt)}</span><span>{item.members.length?item.members.map(x=>x.name).join(', '):item.list}</span></div></div></button>})}</div></CardContent></Card></div>
    <SupportCardModal item={selectedSupport} onClose={()=>setSelectedSupport(null)} labels={labels} tones={tones} typeIcons={typeIcons} stamp={stamp}/>
  </div>;
}

function RealMaintenance({ maintenance, onChanged }) {
  const [maintenancePeriod,setMaintenancePeriod]=useState("MONTH"),[selectedMaintenancePeriod,setSelectedMaintenancePeriod]=useState("ALL"),[maintenanceDayMonth,setMaintenanceDayMonth]=useState("2026-08");
  if (!maintenance)
    return <div className="py-20 text-center text-muted-foreground">Leyendo planificación de mantenimiento…</div>;
  if (!maintenance.available)
    return <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[.04] p-8"><AlertTriangle className="text-amber-300"/><h3 className="mt-3 font-bold">Trello no está disponible en caché</h3><p className="mt-1 text-xs text-muted-foreground">{maintenance.reason}</p></div>;
  const summary = maintenance.summary;
  const monthOrder=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'],sortedMonths=[...maintenance.months].sort((a,b)=>monthOrder.indexOf(a.name)-monthOrder.indexOf(b.name));
  const dailyMap=new Map();for(const item of maintenance.items.filter(x=>x.scheduledAt)){const row=dailyMap.get(item.scheduledAt)||{key:item.scheduledAt,name:new Intl.DateTimeFormat('es-CO',{day:'2-digit',month:'short',timeZone:'UTC'}).format(new Date(`${item.scheduledAt}T12:00:00Z`)),Realizados:0,Pendientes:0};row[item.state==='COMPLETED'?'Realizados':'Pendientes']++;dailyMap.set(item.scheduledAt,row)}
  const availableDayMonths=[...new Set([...dailyMap.keys()].map(key=>key.slice(0,7)))].sort(),dayRows=[...dailyMap.values()].filter(row=>row.key.startsWith(maintenanceDayMonth));
  const chart=maintenancePeriod==='DAY'?dayRows.sort((a,b)=>a.key.localeCompare(b.key)):maintenancePeriod==='YEAR'?[{key:'2026',name:'2026',Realizados:summary.completed,Pendientes:summary.pending}]:sortedMonths.map(month=>({key:month.name,name:month.name.slice(0,3),Realizados:month.completed,Pendientes:month.pending}));
  const periodOptions=maintenancePeriod==='DAY'?[...dayRows].sort((a,b)=>b.key.localeCompare(a.key)):maintenancePeriod==='YEAR'?[{key:'2026',name:'2026',Realizados:summary.completed,Pendientes:summary.pending}]:sortedMonths.map(x=>({key:x.name,name:x.name,Realizados:x.completed,Pendientes:x.pending}));
  const visibleItems=maintenance.items.filter(item=>selectedMaintenancePeriod==='ALL'||(maintenancePeriod==='DAY'?item.scheduledAt===selectedMaintenancePeriod:maintenancePeriod==='YEAR'?true:item.month===selectedMaintenancePeriod));
  const formatStamp = value => value ? new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Bogota" }).format(new Date(value)) : "Sin captura";
  return <div className="space-y-5 animate-in fade-in duration-500">
    <div className="overflow-hidden rounded-2xl border border-white/[.08] bg-slate-950/65 p-5"><div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center"><div className="flex items-center gap-3"><span className="grid h-14 w-14 place-items-center rounded-xl border border-emerald-500/15 bg-emerald-500/10 text-emerald-300"><Wrench size={27}/></span><div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-emerald-300">Mantenimiento CCTV · Trello</p><h2 className="text-xl font-black text-slate-100">Plan anual y ejecución técnica</h2><p className="text-[11px] text-slate-400">{maintenance.source.board} · {maintenance.source.list}</p></div></div><div className="flex flex-wrap items-center gap-2"><Badge variant="outline" className="border-emerald-500/20 text-emerald-300">Instantánea canónica · Trello protegido</Badge><span className="text-[9px] text-slate-500">Importado {formatStamp(maintenance.cacheUpdatedAt)}</span>{maintenance.source.boardUrl&&<Button asChild variant="outline" size="sm"><a href={maintenance.source.boardUrl} target="_blank" rel="noreferrer">Abrir Trello <ArrowRight size={13} className="ml-1"/></a></Button>}</div></div></div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[
      ["Actividades 2026", summary.total, <Database key="database" size={21}/>, "text-blue-300 bg-blue-500/10"],
      ["Realizadas", summary.completed, <CheckCircle2 key="complete" size={21}/>, "text-emerald-300 bg-emerald-500/10"],
      ["Pendientes", summary.pending, <Clock key="pending" size={21}/>, "text-amber-300 bg-amber-500/10"],
      ["Identidad SIIS", `${summary.linked}/${summary.total}`, <ShieldCheck key="identity" size={21}/>, "text-violet-300 bg-violet-500/10"],
    ].map(([label,value,icon,tone])=><div key={label} className="flex items-center gap-3 rounded-2xl border border-white/[.08] bg-white/[.025] p-4"><span className={`grid h-11 w-11 place-items-center rounded-xl ${tone}`}>{icon}</span><div><p className="text-2xl font-black text-slate-100">{value}</p><p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">{label}</p></div></div>)}</div>
    <div className="grid gap-4 xl:grid-cols-[1.15fr_.85fr]"><Card className="border-white/[.08] bg-card/40"><CardHeader><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><CardTitle className="text-base">Ejecución del programa</CardTitle><CardDescription>Orden cronológico real de actividades realizadas y pendientes</CardDescription></div><div className="flex flex-wrap items-center gap-2">{maintenancePeriod==='DAY'&&<select value={maintenanceDayMonth} onChange={event=>{setMaintenanceDayMonth(event.target.value);setSelectedMaintenancePeriod('ALL')}} className="h-8 rounded-lg border border-white/[.08] bg-[#07101f] px-3 text-[10px] font-bold text-slate-300">{availableDayMonths.map(key=><option key={key} value={key}>{new Intl.DateTimeFormat('es-CO',{month:'long',year:'numeric',timeZone:'America/Bogota'}).format(new Date(`${key}-15T12:00:00-05:00`))}</option>)}</select>}<div className="flex rounded-lg border border-white/[.08] bg-black/20 p-1">{[['DAY','Día'],['MONTH','Mes'],['YEAR','Año']].map(([key,label])=><button key={key} onClick={()=>{setMaintenancePeriod(key);setSelectedMaintenancePeriod('ALL')}} className={`rounded-md px-3 py-1.5 text-[10px] font-bold ${maintenancePeriod===key?'bg-emerald-500/15 text-emerald-200':'text-slate-500'}`}>{label}</button>)}</div></div></div></CardHeader><CardContent><div className="h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={chart} barCategoryGap="22%"><CartesianGrid strokeDasharray="3 5" stroke="rgba(148,163,184,.09)" vertical={false}/><XAxis dataKey="name" tick={{fontSize:9,fill:'#64748b'}} axisLine={false} tickLine={false}/><YAxis allowDecimals={false} tick={{fontSize:9,fill:'#64748b'}} axisLine={false} tickLine={false}/><Tooltip cursor={{fill:'rgba(16,185,129,.045)'}} contentStyle={{background:'#07101f',color:'#e2e8f0',border:'1px solid rgba(16,185,129,.18)',borderRadius:12,fontSize:11}} itemStyle={{color:'#e2e8f0'}} labelStyle={{color:'#94a3b8'}}/><Legend iconType="circle" wrapperStyle={{fontSize:10}}/><Bar dataKey="Realizados" stackId="total" fill="#10b981"/><Bar dataKey="Pendientes" stackId="total" fill="#f59e0b" radius={[4,4,0,0]}/></BarChart></ResponsiveContainer></div></CardContent></Card><Card className="border-white/[.08] bg-card/40"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><CalendarDays size={17} className="text-emerald-300"/> {maintenancePeriod==='DAY'?'Días del mes':'Periodos del programa'}</CardTitle><CardDescription>Selecciona para inspeccionar sus actividades</CardDescription></CardHeader><CardContent><div className="grid max-h-72 grid-cols-2 gap-2 overflow-y-auto"><button onClick={()=>setSelectedMaintenancePeriod('ALL')} className={`rounded-xl border p-3 text-left ${selectedMaintenancePeriod==='ALL'?'border-blue-500/30 bg-blue-500/[.08]':'border-white/[.07] bg-white/[.02]'}`}><b className="text-xs">{maintenancePeriod==='DAY'?'Todo el mes':'Todo 2026'}</b><p className="text-[9px] text-slate-500">{maintenancePeriod==='DAY'?`${dayRows.reduce((total,row)=>total+row.Realizados+row.Pendientes,0)} actividades`:`${summary.percent}% ejecutado`}</p></button>{periodOptions.map(row=>{const total=row.Realizados+row.Pendientes,percent=total?Math.round(row.Realizados/total*100):0;return <button key={row.key} onClick={()=>setSelectedMaintenancePeriod(row.key)} className={`rounded-xl border p-3 text-left transition hover:border-emerald-500/25 ${selectedMaintenancePeriod===row.key?'border-emerald-500/30 bg-emerald-500/[.07]':'border-white/[.07] bg-white/[.02]'}`}><div className="flex justify-between"><b className="text-xs capitalize text-slate-200">{row.name}</b><b className={row.Pendientes?'text-xs text-amber-300':'text-xs text-emerald-300'}>{percent}%</b></div><div className="mt-2 h-1 overflow-hidden rounded bg-slate-800"><div className="h-full bg-emerald-500" style={{width:`${percent}%`}}/></div><p className="mt-1 text-[8px] text-slate-500">{row.Realizados}/{total} realizadas</p></button>})}</div></CardContent></Card></div>
    <Card className="border-white/[.08] bg-card/40"><CardHeader><div className="flex items-center justify-between"><div><CardTitle className="text-base">Actividades de mantenimiento</CardTitle><CardDescription>Identidad canónica por código SIIS; Trello y Excel permanecen sin modificaciones</CardDescription></div><Badge variant="outline">{visibleItems.length} actividades</Badge></div></CardHeader><CardContent><div className="max-h-[560px] overflow-y-auto"><div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">{visibleItems.map(item=><div key={item.id} className={`rounded-xl border p-3 ${item.state==='COMPLETED'?'border-emerald-500/12 bg-emerald-500/[.025]':'border-amber-500/15 bg-amber-500/[.03]'}`}><div className="flex items-start justify-between gap-2"><div className="min-w-0"><b className="block truncate text-xs text-slate-200">{item.location}</b><p className="mt-1 text-[9px] text-slate-500">{item.zone||'Zona por conciliar'} · SIIS {item.siisCode||'sin código'}</p></div><Badge variant="outline" className={item.state==='COMPLETED'?'border-emerald-500/20 text-emerald-300':'border-amber-500/20 text-amber-300'}>{item.state==='COMPLETED'?'Realizado':'Pendiente'}</Badge></div><div className="mt-3 flex items-center justify-between border-t border-white/[.05] pt-2"><span className="text-[9px] text-slate-500">{item.month} · {item.scheduledAt||'sin fecha exacta'}</span><span className={`text-[9px] font-bold ${item.locationId?'text-violet-300':'text-amber-300'}`}>{item.identityStatus==='LINKED_MANUAL'?'Identidad conciliada':item.locationId?'Identidad confirmada':'Conciliar identidad'}</span></div>{!item.locationId&&<MaintenanceIdentityCard item={item} onChanged={onChanged}/>}</div>)}</div></div></CardContent></Card>
  </div>;
}

function ProjectScopeReconciliation({project,onChanged}){
  const [open,setOpen]=useState(false),[kind,setKind]=useState('ALL'),[decision,setDecision]=useState('PENDING'),[query,setQuery]=useState(''),[savingId,setSavingId]=useState(null),[error,setError]=useState('');
  const s=project.summary,scopeItems=(project.scopeItems||[]).map(item=>({...item,decision:item.explicitDecision===false?'PENDING':(item.decision||'PENDING')})),items=scopeItems.filter(item=>(kind==='ALL'||item.kind===kind)&&(decision==='ALL'||item.decision===decision)&&(!query||`${item.target} ${item.transferScope||''} ${item.sourceCell}`.toLowerCase().includes(query.toLowerCase()))),kindLabels={MODERNIZATION:'Modernización',SINGLE_CAMERA:'Cámara independiente',REUSED_DESTINATION:'Destino reutilizado'},decisionLabels={PENDING:'Pendiente de revisión',INCLUDED:'Confirmada',DUPLICATE:'Duplicada',NOT_APPLICABLE:'No aplica'};
  const save=async(item,nextDecision)=>{setSavingId(item.scopeItemId);setError('');try{const response=await fetch(`${CCTV_API_BASE}/api/cctv/project-scope/${encodeURIComponent(item.scopeItemId)}/decision`,{method:'POST',headers:{'Content-Type':'application/json','X-Actor':'skylab-local-user'},body:JSON.stringify({decision:nextDecision})}),result=await response.json();if(!response.ok)throw new Error(result.error||'No fue posible guardar la decisión');await onChanged?.()}catch(e){setError(e.message)}finally{setSavingId(null)}};
  return <Card className="overflow-hidden border-amber-500/15 bg-card/40"><CardHeader><div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center"><div className="flex items-start gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-amber-500/10 text-amber-300"><ShieldCheck size={22}/></span><div><CardTitle className="text-base">Conciliación documental del alcance</CardTitle><CardDescription>{s.scopePending===0?'Revisión terminada; el detalle auditado queda como alcance oficial':'Confirma cada fila una sola vez; las decisiones permanecen guardadas entre sesiones'}</CardDescription></div></div><div className="flex flex-wrap items-center gap-2"><Badge variant="outline" className={s.scopePending===0?'border-emerald-500/25 text-emerald-300':'border-amber-500/25 text-amber-300'}>{s.scopePending===0?'Alcance confirmado':'Alcance provisional'} {s.adjustedScope}</Badge><Badge variant="outline" className="border-emerald-500/20 text-emerald-300">{s.scopeConfirmed} confirmadas</Badge><Badge variant="outline" className="border-amber-500/20 text-amber-300">{s.scopePending} pendientes</Badge><Button size="sm" variant="outline" onClick={()=>setOpen(!open)}>{open?'Cerrar detalle':s.scopePending===0?'Ver auditoría':'Continuar revisión'} <ArrowRight size={13} className={`ml-1 transition ${open?'rotate-90':''}`}/></Button></div></div></CardHeader>{open&&<CardContent className="border-t border-white/[.06] pt-5"><div className="mb-3 h-1.5 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-emerald-500 transition-all" style={{width:`${s.enumeratedInterventions?Math.round(s.scopeReviewed/s.enumeratedInterventions*100):0}%`}}/></div><p className="mb-4 text-[10px] text-slate-500">Progreso de revisión: {s.scopeReviewed} de {s.enumeratedInterventions}. Confirmar no cambia el total; solo Duplicada o No aplica reducen el alcance provisional.</p><div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[['Enumeradas',s.enumeratedInterventions,'text-blue-300'],['Confirmadas',s.scopeConfirmed,'text-emerald-300'],['Pendientes',s.scopePending,'text-amber-300'],['Excluidas',s.scopeExcluded,'text-rose-300']].map(([label,value,tone])=><div key={label} className="rounded-xl border border-white/[.06] bg-white/[.02] p-3"><p className={`text-2xl font-black ${tone}`}>{value}</p><p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">{label}</p></div>)}</div><div className="mb-4 flex flex-col gap-2 lg:flex-row"><div className="relative flex-1"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"/><Input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar punto, traslado o celda fuente" className="h-9 pl-9 text-xs"/></div><select value={kind} onChange={e=>setKind(e.target.value)} className="h-9 rounded-md border bg-background px-3 text-xs"><option value="ALL">Todas las categorías</option><option value="MODERNIZATION">Modernizaciones</option><option value="SINGLE_CAMERA">Cámaras independientes</option><option value="REUSED_DESTINATION">Destinos reutilizados</option></select><select value={decision} onChange={e=>setDecision(e.target.value)} className="h-9 rounded-md border bg-background px-3 text-xs"><option value="ALL">Todas las decisiones</option><option value="PENDING">Pendientes de revisión</option><option value="INCLUDED">Confirmadas</option><option value="DUPLICATE">Duplicadas</option><option value="NOT_APPLICABLE">No aplican</option></select><Badge variant="outline" className="h-9 px-3">{items.length}</Badge></div>{error&&<p className="mb-3 rounded-lg border border-rose-500/20 bg-rose-500/[.05] p-2 text-[10px] text-rose-300">{error}</p>}<div className="grid max-h-[620px] gap-2 overflow-y-auto pr-1 md:grid-cols-2 xl:grid-cols-3">{items.map(item=><div key={item.scopeItemId} className={`rounded-xl border p-3 ${item.decision==='PENDING'?'border-amber-500/15 bg-amber-500/[.025]':item.decision==='INCLUDED'?'border-emerald-500/15 bg-emerald-500/[.035]':item.decision==='DUPLICATE'?'border-violet-500/20 bg-violet-500/[.035]':'border-rose-500/20 bg-rose-500/[.035]'}`}><div className="flex items-start justify-between gap-2"><div className="min-w-0"><span className="text-[8px] font-black uppercase tracking-wide text-cyan-300">{kindLabels[item.kind]}</span><b className="mt-1 block text-xs leading-snug text-slate-200">{item.target}</b></div><Badge variant="outline" className={`shrink-0 text-[8px] ${item.decision==='PENDING'?'border-amber-500/20 text-amber-300':item.decision==='INCLUDED'?'border-emerald-500/20 text-emerald-300':''}`}>{decisionLabels[item.decision]}</Badge></div>{item.transferScope&&<p className="mt-2 text-[9px] leading-relaxed text-violet-300">{item.transferScope}</p>}<p className="mt-2 text-[8px] text-slate-600">{item.sourceCell}{item.explicitDecision?` · guardada ${item.decidedAt?.slice(0,10)}`:' · aún no revisada'}</p><div className="mt-3 grid grid-cols-3 gap-1 border-t border-white/[.05] pt-2">{[['INCLUDED','Confirmar'],['DUPLICATE','Duplicada'],['NOT_APPLICABLE','No aplica']].map(([value,label])=><button key={value} disabled={savingId===item.scopeItemId} onClick={()=>save(item,value)} className={`rounded-md border px-1 py-1.5 text-[8px] font-bold transition ${item.decision===value?'border-cyan-500/25 bg-cyan-500/10 text-cyan-200':'border-white/[.06] text-slate-500 hover:text-slate-300'}`}>{savingId===item.scopeItemId?'…':label}</button>)}</div></div>)}</div></CardContent>}</Card>;
}

function ProjectTrelloTimeline({project,support}){
  const [period,setPeriod]=useState('ALL'),[scope,setScope]=useState('RELATED'),[selected,setSelected]=useState(null);
  const execution=project?.execution||[],cards=support?.items||[],byLocation=new Map();
  execution.forEach(item=>{if(item.locationId&&!byLocation.has(item.locationId))byLocation.set(item.locationId,item)});
  const related=cards.map(card=>{const projectItem=card.locationId?byLocation.get(card.locationId)||null:null,text=`${card.title||''} ${card.description||''}`.toLowerCase(),positive=/(instal|montaj|implement|cambio.{0,35}(k35|nvr|dvr|c[aá]mara|tecnolog|tegnolog)|reubic.{0,25}c[aá]mara|cctv completo|detecci[oó]n.{0,30}rostro)/i.test(text),maintenanceOnly=/(desmont|mantenimiento|revisi[oó]n|cambio de sensor|tendido.{0,30}alarma)/i.test(text)&&!/(instal.{0,50}cctv|montaj.{0,30}cctv|cctv completo|cambio.{0,35}(k35|nvr|dvr|c[aá]mara|tecnolog|tegnolog))/i.test(text);return {...card,projectItem,projectMilestone:!!projectItem&&positive&&!maintenanceOnly,relationReason:projectItem&&positive&&!maintenanceOnly?'Mismo punto + intervención CCTV del proyecto':projectItem?'Actividad del mismo punto, fuera del alcance':'Sin vínculo con el alcance'}});
  const periods=[...new Set(related.map(item=>(item.operationalAt||'').slice(0,7)).filter(Boolean))].sort().reverse();
  const visible=related.filter(item=>(scope==='ALL'||item.projectMilestone)&&(period==='ALL'||(item.operationalAt||'').startsWith(period))).sort((a,b)=>new Date(b.operationalAt||0)-new Date(a.operationalAt||0));
  const categoryLabels={NEW_INSTALLATION:'Instalación nueva',TECHNOLOGY_CHANGE:'Cambio tecnológico',REUSED_KIT:'Kit reutilizado',REUSED_CAMERA_ALARM:'Cámara + alarma reutilizada'};
  const typeLabels={INSTALLATION:'Instalación',CCTV:'CCTV y tecnología',GENERAL_SUPPORT:'Soporte general',ALARM:'Alarmas',ACCESS_CONTROL:'Control de acceso',NETWORK:'Redes',POWER:'Energía'};
  const tones={INSTALLATION:'bg-emerald-500/10 text-emerald-300',CCTV:'bg-blue-500/10 text-blue-300',GENERAL_SUPPORT:'bg-slate-500/10 text-slate-300',ALARM:'bg-rose-500/10 text-rose-300',ACCESS_CONTROL:'bg-violet-500/10 text-violet-300',NETWORK:'bg-cyan-500/10 text-cyan-300',POWER:'bg-amber-500/10 text-amber-300'};
  const icons={INSTALLATION:Wrench,CCTV:Cctv,GENERAL_SUPPORT:Activity,ALARM:BellRing,ACCESS_CONTROL:ShieldCheck,NETWORK:Radio,POWER:Unplug};
  const stamp=value=>value?new Intl.DateTimeFormat('es-CO',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'America/Bogota'}).format(new Date(value)):'Sin fecha';
  return <Card className="overflow-hidden border-cyan-500/15 bg-card/40"><CardHeader><div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div className="flex items-start gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-cyan-500/10 text-cyan-300"><Clock size={22}/></span><div><CardTitle className="text-base">Línea de tiempo del proyecto</CardTitle><CardDescription>Hitos Trello 2025–2026 que coinciden en punto y corresponden a una instalación o cambio tecnológico CCTV</CardDescription></div></div><div className="flex flex-wrap gap-2"><select value={period} onChange={e=>setPeriod(e.target.value)} className="h-9 rounded-md border bg-background px-3 text-xs"><option value="ALL">Todos los periodos</option>{periods.map(value=><option key={value} value={value}>{new Intl.DateTimeFormat('es-CO',{month:'long',year:'numeric',timeZone:'America/Bogota'}).format(new Date(`${value}-15T12:00:00-05:00`))}</option>)}</select><select value={scope} onChange={e=>setScope(e.target.value)} className="h-9 rounded-md border bg-background px-3 text-xs"><option value="RELATED">Solo hitos del proyecto</option><option value="ALL">Auditar todo Trello</option></select><Badge variant="outline" className="h-9 px-3">{visible.length} hitos</Badge></div></div></CardHeader><CardContent className="border-t border-white/[.06] pt-5"><div className="max-h-[680px] overflow-y-auto pr-2">{visible.length?<div className="relative ml-3 border-l border-cyan-500/20 pl-6">{visible.map(item=>{const Icon=icons[item.activityType]||Activity;return <button key={item.id} onClick={()=>setSelected(item)} className={`group relative mb-3 block w-full rounded-2xl border p-5 text-left transition ${item.projectMilestone?'border-white/[.07] bg-white/[.022] hover:border-cyan-500/25 hover:bg-cyan-500/[.035]':'border-slate-700/40 bg-slate-900/25 opacity-65'}`}><span className={`absolute -left-[39px] top-6 grid h-7 w-7 place-items-center rounded-full border border-slate-800 bg-[#07101f] ${tones[item.activityType]||tones.GENERAL_SUPPORT}`}><Icon size={13}/></span><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><Badge variant="outline" className="border-cyan-500/15 text-[9px] text-cyan-300">{typeLabels[item.activityType]||'Actividad'}</Badge>{item.projectMilestone&&<Badge variant="outline" className="border-violet-500/20 text-[9px] text-violet-300">Fase {item.projectItem.phase} · {categoryLabels[item.projectItem.category]||item.projectItem.category}</Badge>}{!item.projectMilestone&&scope==='ALL'&&<Badge variant="outline" className="border-slate-500/20 text-[9px] text-slate-500">Fuera del alcance</Badge>}<Badge variant="outline" className="border-white/[.07] text-[9px] text-slate-500">{item.board}</Badge></div><b className="mt-3 block text-sm leading-relaxed text-slate-100">{item.title}</b><p className="mt-2 text-[10px] font-medium text-slate-400">{item.location||item.projectItem?.canonicalName||'Punto por vincular'} · {item.zone||item.projectItem?.zone||'Zona por conciliar'}</p><p className={`mt-1.5 text-[9px] ${item.projectMilestone?'text-cyan-400/75':'text-slate-600'}`}>{item.relationReason}</p></div><div className="flex shrink-0 items-center gap-3 sm:min-w-44 sm:justify-end">{item.image&&<img src={item.image.url} alt="" className="h-16 w-20 rounded-xl border border-white/[.08] object-cover"/>}<div className="text-left sm:text-right"><p className="text-[11px] font-bold text-slate-200">{stamp(item.operationalAt)}</p><p className={`mt-1.5 text-[9px] font-bold uppercase ${item.status==='COMPLETED'?'text-emerald-300':'text-amber-300'}`}>{item.status==='COMPLETED'?'Ejecutada':'Pendiente'}</p></div></div></div></button>})}</div>:<div className="rounded-2xl border border-dashed border-white/[.09] p-10 text-center text-xs text-slate-500">No hay actividades para este filtro.</div>}</div></CardContent>{selected&&<SupportCardModal item={selected} onClose={()=>setSelected(null)} labels={typeLabels} tones={tones} typeIcons={icons} stamp={stamp}/>}</Card>;
}

function RealProject({ project, support, onChanged, onRegister }) {
  if (!project)
    return (
      <div className="py-20 text-center text-muted-foreground">
        Conciliando programa de modernización…
      </div>
    );
  const s = project.summary;
  const money = new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(s.investment);
  const phaseList = Array.from({ length: s.phases }, (_, index) => index + 1);
  const categoryConfig = {
    NEW_INSTALLATION: {
      icon: Cctv,
      label: "Instalación nueva",
      tone: "text-emerald-300",
      surface: "bg-emerald-500/10",
      border: "border-emerald-500/20",
    },
    TECHNOLOGY_CHANGE: {
      icon: RefreshCw,
      label: "Cambio tecnológico",
      tone: "text-blue-300",
      surface: "bg-blue-500/10",
      border: "border-blue-500/20",
    },
    REUSED_KIT: {
      icon: Boxes,
      label: "Kit reutilizado",
      tone: "text-violet-300",
      surface: "bg-violet-500/10",
      border: "border-violet-500/20",
    },
    REUSED_CAMERA_ALARM: {
      icon: BellRing,
      label: "Cámara reutilizada + alarma",
      tone: "text-fuchsia-300",
      surface: "bg-fuchsia-500/10",
      border: "border-fuchsia-500/20",
    },
    DISMANTLED: {
      icon: Unplug,
      label: "Histórico · no aplica",
      tone: "text-slate-400",
      surface: "bg-slate-500/10",
      border: "border-slate-500/15",
    },
  };
  const projectMetrics = [
    {
      icon: Database,
      label: "Intervenciones enumeradas",
      value: s.enumeratedInterventions,
      detail: "58 financiadas + 24 reutilizadas",
      tone: "text-blue-300",
      surface: "bg-blue-500/10",
    },
    {
      icon: ScanEye,
      label: "Objetivos con inversión",
      value: s.financedTargets,
      detail: `${s.modernizationTargets} modernizaciones + ${s.singleCameraTargets} cámaras`,
      tone: "text-emerald-300",
      surface: "bg-emerald-500/10",
    },
    {
      icon: Boxes,
      label: "Destinos reutilizados",
      value: s.reuseDestinations,
      detail: "instalaciones físicas adicionales",
      tone: "text-violet-300",
      surface: "bg-violet-500/10",
    },
    {
      icon: ShieldCheck,
      label: "Alcance auditado",
      value: s.adjustedScope,
      detail: `${s.scopeReviewed} de ${s.enumeratedInterventions} intervenciones conciliadas`,
      tone: "text-teal-300",
      surface: "bg-teal-500/10",
    },
    {
      icon: CheckCircle2,
      label: "Avance confirmado",
      value: `${s.officialProgressPercent || 0}%`,
      detail: `${s.completedExecution || 0} de ${s.actionableExecution || 0} acciones realizadas`,
      tone: "text-cyan-300",
      surface: "bg-cyan-500/10",
    },
    {
      icon: Unplug,
      label: "Registros históricos",
      value: s.dismantled,
      detail: "desmontados · no aplican",
      tone: "text-slate-300",
      surface: "bg-slate-500/10",
    },
  ];
  const coverageData = [
    { name: "Con cobertura", value: s.withCoverage, color: "#3b82f6" },
    {
      name: "Por cubrir",
      value: Math.max(0, s.financedTargets - s.withCoverage),
      color: "#1e293b",
    },
  ];
  const progressData = [
    { name: "Ejecución confirmada", value: s.completedExecution || 0 },
    { name: "Pendiente de ejecución", value: Math.max(0, (s.actionableExecution || 0) - (s.completedExecution || 0)) },
  ];
  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-[20px] border border-blue-400/[.14] bg-gradient-to-r from-slate-950 via-[#07101f] to-blue-950/20 p-4 shadow-xl shadow-slate-950/25 sm:p-5">
        <div className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-blue-400/50 to-transparent" />
        <div className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full bg-blue-500/[.07] blur-3xl" />
        <div className="grid gap-4 xl:grid-cols-[1fr_520px] xl:items-center">
          <div>
            <div className="flex items-start gap-4">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-blue-400/20 bg-blue-500/10 text-blue-300">
                <Cctv size={24} />
              </span>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[.24em] text-blue-300">
                  Modernización de infraestructura
                </p>
                <h2 className="mt-1 text-2xl font-black tracking-tight text-white">
                  Proyecto CCTV inteligente
                </h2>
                <p className="mt-1.5 text-[11px] text-slate-400">Programa 2026 · {s.adjustedScope} intervenciones auditadas · {s.phases} fases operativas</p>
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-blue-400/[.12] bg-[#07101f]/80 p-4 backdrop-blur-sm">
            <div className="grid items-center gap-4 sm:grid-cols-[90px_1fr_auto]"><div><p className="text-3xl font-black tracking-tight text-white">{s.officialProgressPercent || 0}%</p><p className="text-[8px] font-bold uppercase tracking-[.14em] text-cyan-300">avance</p></div><div><div className="flex justify-between text-[9px] font-semibold text-slate-400"><span>Ejecución verificada</span><b className="text-slate-200">{s.completedExecution || 0}/{s.actionableExecution || 0}</b></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-500" style={{width:`${s.officialProgressPercent||0}%`}} /></div></div><div className="border-l border-white/[.08] pl-4 text-right"><p className="text-[8px] font-bold uppercase tracking-[.12em] text-slate-600">Inversión</p><p className="mt-1 text-base font-black text-slate-100">{money}</p></div></div>
          </div>
        </div>
      </section>
      {project.audit?.status === "SOURCE_VARIANCE" && (
        <div className="flex flex-col gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/[.045] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-500/10 text-amber-300"><AlertTriangle size={20} /></span>
            <div><b className="text-sm text-amber-100">Alcance pendiente de conciliación documental</b><p className="mt-1 text-[11px] leading-relaxed text-amber-100/65">El detalle enumera {s.enumeratedInterventions} intervenciones y el resumen manual declara {s.sourceDeclaredScope}. Las {s.executionItems} filas de fases se usan para seguimiento y no se duplican en el alcance.</p></div>
          </div>
          <Badge variant="outline" className="shrink-0 border-amber-500/25 text-amber-300">Diferencia {s.scopeVariance > 0 ? "+" : ""}{s.scopeVariance}</Badge>
        </div>
      )}
      {s.scopePending > 0 && <ProjectScopeReconciliation project={project} onChanged={onChanged} />}
      <div className="grid gap-4 lg:grid-cols-[1.2fr_.8fr]">
        <Card className="relative overflow-hidden border-blue-400/[.12] bg-gradient-to-br from-card/60 via-card/40 to-blue-950/20 shadow-xl shadow-slate-950/20">
          <div className="absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-blue-400/40 to-transparent" />
          <CardHeader>
            <CardTitle>Radiografía de ejecución del programa</CardTitle>
            <CardDescription>
              Avance confirmado y señal de cobertura en una lectura integrada.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid items-center gap-7 sm:grid-cols-[240px_1fr]">
              <div className="relative mx-auto h-56 w-56">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <defs>
                      <linearGradient id="projectProgress" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#22d3ee"/><stop offset="100%" stopColor="#3b82f6"/></linearGradient>
                      <linearGradient id="projectCoverage" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#a78bfa"/><stop offset="100%" stopColor="#6366f1"/></linearGradient>
                    </defs>
                    <Pie
                      data={progressData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={79}
                      outerRadius={101}
                      startAngle={90}
                      endAngle={-270}
                      stroke="#07101f"
                      strokeWidth={3}
                      paddingAngle={1}
                      cornerRadius={7}
                      isAnimationActive
                      animationDuration={900}
                    >
                      {progressData.map((entry,index) => (
                        <Cell key={entry.name} fill={index===0?'url(#projectProgress)':'#162033'} />
                      ))}
                    </Pie>
                    <Pie data={coverageData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={58} outerRadius={70} startAngle={90} endAngle={-270} stroke="#07101f" strokeWidth={3} paddingAngle={1} cornerRadius={6} isAnimationActive animationDuration={1100}>{coverageData.map((entry,index)=><Cell key={entry.name} fill={index===0?'url(#projectCoverage)':'#111b2b'} />)}</Pie>
                    <Tooltip contentStyle={{background:'#07101f',border:'1px solid rgba(59,130,246,.22)',borderRadius:12,fontSize:11,color:'#e2e8f0'}} formatter={(value,name)=>[`${value} puntos`,name]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 grid place-items-center">
                  <div className="text-center">
                    <span className="text-4xl font-black tracking-tight text-white">
                      {s.officialProgressPercent || 0}%
                    </span>
                    <p className="mt-1 text-[9px] font-semibold text-slate-500">{s.completedExecution || 0} / {s.actionableExecution || 0}</p>
                  </div>
                </div>
              </div>
              <div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-blue-500/15 bg-blue-500/[.055] p-4 transition hover:border-blue-400/25 hover:bg-blue-500/[.08]">
                    <p className="text-2xl font-black text-blue-300">
                      {s.officialProgressPercent || 0}%
                    </p>
                    <p className="text-[10px] text-slate-400">
                      ejecución oficial
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/[.07] bg-white/[.025] p-4">
                    <p className="text-2xl font-black text-slate-200">
                      {s.coverageSignalPercent}%
                    </p>
                    <p className="text-[10px] text-slate-400">
                      cobertura observada
                    </p>
                  </div>
                </div>
                <div className="mt-4 grid gap-2 text-[9px] text-slate-400"><div className="flex items-center justify-between"><span className="flex items-center gap-2"><i className="h-2 w-2 rounded-full bg-cyan-400"/>Anillo exterior · ejecución</span><b className="text-cyan-300">{s.completedExecution || 0}/{s.actionableExecution || 0}</b></div><div className="flex items-center justify-between"><span className="flex items-center gap-2"><i className="h-2 w-2 rounded-full bg-violet-400"/>Anillo interior · cobertura</span><b className="text-violet-300">{s.withCoverage}/{s.financedTargets}</b></div></div>
                <div className="mt-3 flex gap-2 rounded-xl border border-amber-500/15 bg-amber-500/[.05] p-3 text-[10px] leading-relaxed text-amber-100">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                  <span>
                    <b>Lecturas complementarias.</b> La cobertura indica presencia técnica; el avance solo aumenta con instalación, procedencia y evidencia registradas.
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-white/[.08] bg-card/40">
          <CardHeader>
            <CardTitle className="text-base">Líneas del proyecto</CardTitle>
            <CardDescription>
              Objetivos financiados y destinos reutilizados sin duplicar fases.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {project.streams.map((stream, index) => {
              const separateReuse = stream.key === "REUSED_DESTINATIONS";
              const percent = stream.scope
                ? Math.round((stream.withCoverage / stream.scope) * 100)
                : 0;
              const Icon = separateReuse ? Boxes : index === 0 ? BrainCircuit : Store;
              return (
                <div
                  key={stream.key}
                  className="rounded-2xl border border-white/[.08] bg-white/[.025] p-4"
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${index === 0 ? "bg-blue-500/10 text-blue-300" : "bg-violet-500/10 text-violet-300"}`}
                    >
                      <Icon size={23} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <b className="text-sm text-slate-100">
                            {stream.name}
                          </b>
                          <p className="mt-0.5 text-[10px] text-slate-500">
                            {stream.scope} {separateReuse ? "destinos físicos adicionales" : "objetivos con inversión"}
                          </p>
                        </div>
                        <span className="text-2xl font-black text-slate-100">
                          {separateReuse ? stream.scope : `${percent}%`}
                        </span>
                      </div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
                        <div
                          className={`h-full rounded-full ${index === 0 ? "bg-blue-500" : "bg-violet-500"}`}
                          style={{ width: `${separateReuse ? 100 : percent}%` }}
                        />
                      </div>
                      <div className="mt-4 grid grid-cols-3 gap-2">
                        <div>
                          <p className="text-lg font-black text-slate-200">
                            {separateReuse ? "—" : stream.linked}
                          </p>
                          <p className="text-[9px] text-slate-500">
                            {separateReuse ? "Por conciliar" : "Vinculados"}
                          </p>
                        </div>
                        <div>
                          <p className="text-lg font-black text-slate-200">
                            {separateReuse ? "—" : stream.withCoverage}
                          </p>
                          <p className="text-[9px] text-slate-500">
                            {separateReuse ? "Cobertura pendiente" : "Con cobertura"}
                          </p>
                        </div>
                        <div>
                          <p className="text-lg font-black text-slate-200">
                            {stream.reusePlanned}
                          </p>
                          <p className="text-[9px] text-slate-500">
                            Reutilización
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
      <section>
        <div className="mb-3 flex items-end justify-between gap-4"><div><p className="text-[9px] font-black uppercase tracking-[.22em] text-blue-300">Indicadores ejecutivos</p><h3 className="mt-1 text-lg font-black text-slate-100">Estado verificable del programa</h3></div><p className="hidden text-[10px] text-slate-500 md:block">Datos consolidados de proyecto, inventario y ejecución</p></div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {projectMetrics.map((metric,index) => {
            const Icon = metric.icon;
            return <div key={metric.label} className="group relative min-h-32 overflow-hidden rounded-2xl border border-white/[.075] bg-gradient-to-br from-white/[.035] to-transparent p-5 transition duration-300 hover:-translate-y-0.5 hover:border-blue-400/20"><div className={`absolute inset-y-5 left-0 w-0.5 rounded-full ${index===0?'bg-blue-400':index===1?'bg-emerald-400':index===2?'bg-violet-400':index===3?'bg-teal-400':index===4?'bg-cyan-400':'bg-slate-500'}`} /><div className="flex items-center gap-4"><span className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-white/[.05] ${metric.surface} ${metric.tone}`}><Icon size={26}/></span><div className="min-w-0 flex-1"><div className="flex items-end justify-between gap-3"><p className="max-w-36 text-[10px] font-black uppercase leading-snug tracking-[.12em] text-slate-500">{metric.label}</p><p className="text-3xl font-black tracking-tight text-slate-100">{metric.value}</p></div><p className="mt-3 border-t border-white/[.06] pt-3 text-[11px] font-medium leading-relaxed text-slate-300">{metric.detail}</p></div></div></div>;
          })}
        </div>
      </section>
      <details className="group overflow-hidden rounded-[22px] border border-white/[.08] bg-gradient-to-br from-card/60 to-slate-950/60 shadow-lg shadow-slate-950/20">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 marker:content-none sm:p-6">
          <div className="flex min-w-0 items-center gap-4"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-cyan-400/15 bg-cyan-500/[.08] text-cyan-300"><Clock size={23}/></span><div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[.2em] text-cyan-300">Historial integrado</p><h3 className="mt-1 text-base font-black text-slate-100">Línea de tiempo Proyecto + Trello</h3><p className="mt-1 text-[11px] text-slate-500">Despliega los hitos auditados de instalación y cambio tecnológico</p></div></div>
          <div className="flex shrink-0 items-center gap-3"><Badge variant="outline" className="hidden border-white/[.08] text-slate-400 sm:inline-flex">{support?.summary?.total||0} actividades fuente</Badge><span className="grid h-9 w-9 place-items-center rounded-xl border border-white/[.08] text-slate-400 transition group-open:rotate-90 group-open:border-cyan-500/20 group-open:text-cyan-300"><ArrowRight size={17}/></span></div>
        </summary>
        <div className="border-t border-white/[.06] p-3 sm:p-4"><ProjectTrelloTimeline project={project} support={support} /></div>
      </details>
      <Card className="overflow-hidden border-white/[.08] bg-card/40">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">Ejecución por fases</CardTitle>
              <CardDescription>
                Lectura operativa del plan, separada por compra, tecnología,
                procedencia y presupuesto asociado.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(categoryConfig).map(([key, config]) => {
                const Icon = config.icon;
                return (
                  <span
                    key={key}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[10px] font-bold ${config.border} ${config.surface} ${config.tone}`}
                  >
                    <Icon size={15} />
                    {config.label}
                  </span>
                );
              })}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 xl:grid-cols-2">
            {phaseList.map((phase) => {
              const items = project.execution.filter(
                (item) => item.phase === phase,
              );
              const active = items.filter(
                (item) => item.category !== "DISMANTLED",
              ).length;
              const completed = items.filter((item) => item.completed).length;
              const phaseMeta = project.phases?.find(
                (item) => item.number === phase,
              );
              const phaseMoney = new Intl.NumberFormat("es-CO", {
                style: "currency",
                currency: "COP",
                maximumFractionDigits: 0,
              }).format(phaseMeta?.investment || 0);
              return (
                <div
                  key={phase}
                  className="group relative overflow-hidden rounded-2xl border border-white/[.08] bg-white/[.02] p-4 transition duration-300 hover:-translate-y-0.5 hover:border-blue-400/20"
                >
                  <div className="pointer-events-none absolute -right-12 -top-16 h-36 w-36 rounded-full bg-blue-500/[.045] blur-2xl" />
                  <div className="relative mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="grid h-12 w-12 place-items-center rounded-xl border border-blue-400/20 bg-blue-500/10 text-base font-black text-blue-300 transition duration-300 group-hover:scale-105">
                        {String(phase).padStart(2, "0")}
                      </span>
                      <div>
                        <b className="text-base text-slate-100">Fase {phase}</b>
                        <p className="text-[11px] text-muted-foreground">
                          {completed} de {active} realizadas
                          {items.length !== active
                            ? ` · ${items.length - active} históricas`
                            : ""}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[9px] font-bold uppercase tracking-[.12em] text-slate-500">
                        Presupuesto asociado
                      </p>
                      <p className="text-base font-black text-emerald-300">
                        {phaseMoney}
                      </p>
                      <p className="text-[9px] text-slate-500">
                        {phaseMeta?.pricedItems || 0} puntos con valor fuente
                      </p>
                    </div>
                  </div>
                  <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-slate-800">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-all duration-700"
                      style={{
                        width: `${active ? Math.round((completed / active) * 100) : 0}%`,
                      }}
                    />
                  </div>
                  <div className="relative grid gap-2 sm:grid-cols-2">
                    {items.map((item) => {
                      const config = categoryConfig[item.category] || {
                        icon: Store,
                        label: item.category,
                        tone: "text-slate-300",
                        surface: "bg-slate-500/10",
                        border: "border-slate-500/20",
                      };
                      const Icon = config.icon;
                      const historical = item.category === "DISMANTLED";
                      const canRegister =
                        !historical && item.locationId && !item.completed;
                      return (
                        <div
                          key={item.id}
                          className={`rounded-xl border p-3.5 transition duration-200 ${item.completed ? "border-emerald-500/25 bg-emerald-500/[.045]" : config.border} ${historical ? "bg-white/[.01] opacity-60" : "hover:bg-white/[.04]"}`}
                        >
                          <div className="flex items-start gap-3">
                            <span
                              className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${item.completed ? "bg-emerald-500/10 text-emerald-300" : `${config.surface} ${config.tone}`}`}
                            >
                              <Icon size={22} />
                            </span>
                            <div className="min-w-0 flex-1">
                              <b
                                className={`block text-xs leading-snug ${historical ? "text-slate-400 line-through decoration-slate-600" : "text-slate-200"}`}
                              >
                                {item.target}
                              </b>
                              <p
                                className={`mt-1.5 text-[10px] font-bold uppercase tracking-wide ${item.completed ? "text-emerald-300" : config.tone}`}
                              >
                                {item.completed
                                  ? "Instalación realizada"
                                  : config.label}
                              </p>
                              {item.canonicalName && !historical && (
                                <p className="mt-1 truncate text-[10px] text-muted-foreground">
                                  Punto: {item.canonicalName}
                                </p>
                              )}
                              {canRegister && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="mt-3 h-7 border-emerald-500/20 bg-emerald-500/[.05] px-2 text-[10px] text-emerald-300 hover:bg-emerald-500/10"
                                  onClick={() =>
                                    onRegister?.({
                                      id: item.locationId,
                                      name: item.canonicalName,
                                      zone: item.zone,
                                      siisCode: "—",
                                      locationType: "Punto del proyecto",
                                      projectItemId: item.id,
                                      provenance: item.category.startsWith(
                                        "REUSED",
                                      )
                                        ? "REUSED"
                                        : "NEW",
                                    })
                                  }
                                >
                                  <CheckCircle2 size={13} className="mr-1.5" />
                                  Registrar como realizada
                                </Button>
                              )}
                              {item.completed && (
                                <div className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-emerald-500/10 px-2 py-1 text-[10px] font-bold text-emerald-300">
                                  <CheckCircle2 size={13} />
                                  Confirmada en Skylab
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
      {s.unlinked > 0 ? (
        <Card className="border-amber-500/15 bg-card/40">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">
                  Pendientes de identidad
                </CardTitle>
                <CardDescription>
                  Nombres vigentes que aún no se relacionan de forma segura con
                  el catálogo canónico
                </CardDescription>
              </div>
              <Badge
                variant="outline"
                className="border-amber-500/20 text-amber-300"
              >
                {s.unlinked} pendientes
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="mb-4 rounded-xl border border-blue-500/15 bg-blue-500/[.05] p-3 text-xs text-slate-300">
              <b className="text-blue-300">Acción requerida:</b> abre una
              tarjeta, busca el punto oficial y confirma la relación. Los
              desmontados no se incluyen en esta cola.
            </div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {project.items
                .filter(
                  (item) => !item.linked && item.category !== "DISMANTLED",
                )
                .map((item) => (
                  <ProjectIdentityCard
                    key={item.id}
                    item={item}
                    onChanged={onChanged}
                  />
                ))}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-4 rounded-2xl border border-emerald-500/15 bg-gradient-to-r from-emerald-500/[.07] to-blue-500/[.035] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-xl border border-emerald-400/20 bg-emerald-500/10 text-emerald-300">
              <CheckCircle2 size={22} />
            </span>
            <div>
              <b className="text-sm text-emerald-100">
                Identidad del proyecto conciliada
              </b>
              <p className="mt-0.5 text-[11px] text-slate-400">
                Todos los puntos vigentes están relacionados con el catálogo
                canónico. Los desmontados permanecen únicamente en el histórico.
              </p>
            </div>
          </div>
          <Badge className="w-fit border border-emerald-400/20 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/10">
            {s.linked} de {s.scope} vinculados
          </Badge>
        </div>
      )}
    </div>
  );
}

function InstallationWizard({ onClose, initialLocation = null }) {
  const [candidates, setCandidates] = useState([]),
    [query, setQuery] = useState(""),
    [selected, setSelected] = useState(initialLocation),
    [step, setStep] = useState(initialLocation ? 2 : 1),
    [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  const [form, setForm] = useState({
    solutionType: "STANDALONE_CAMERA",
    provenance: initialLocation?.provenance || "NEW",
    installedAt: new Date().toISOString().slice(0, 10),
    technician: "",
    manufacturer: "Dahua",
    model: "",
    serialNumber: "",
    dssIdentifier: "",
    channelCount: 1,
    notes: "",
  });
  const [assets, setAssets] = useState([]);
  useEffect(() => {
    const timer = setTimeout(
      () =>
        fetch(
          `${CCTV_API_BASE}/api/cctv/candidates?search=${encodeURIComponent(query)}`,
        )
          .then((r) => r.json())
          .then((j) => setCandidates(j.items || []))
          .catch(() =>
            setError(
              "No fue posible conectar con la API CCTV en el puerto 3003.",
            ),
          ),
      250,
    );
    return () => clearTimeout(timer);
  }, [query]);
  const update = (key, value) =>
    setForm((current) => ({ ...current, [key]: value }));
  const toggleAsset = (type, label, afRequired, ipRequired) =>
    setAssets((current) => {
      const repeatable = ["CAMERA", "STANDALONE_CAMERA"].includes(type);
      const existing = current.filter((a) => a.assetType === type);
      if (existing.length && !repeatable)
        return current.filter((a) => a.assetType !== type);
      return [
        ...current,
        {
          clientId: crypto.randomUUID(),
          assetType: type,
          label: repeatable ? `${label} ${existing.length + 1}` : label,
          afRequired,
          ipRequired,
          quantity: 1,
          manufacturer: "Dahua",
          model: "",
          fixedAssetCode: "",
          ipAddress: "",
          serialNumber: "",
          dssIdentifier: "",
          channelCount: type === "NVR" ? 4 : 0,
        },
      ];
    });
  const updateAsset = (clientId, key, value) =>
    setAssets((current) =>
      current.map((a) =>
        a.clientId === clientId ? { ...a, [key]: value } : a,
      ),
    );
  const removeAsset = (clientId) =>
    setAssets((current) => current.filter((a) => a.clientId !== clientId));
  const invalidAssets = assets.some(
    (a) =>
      (a.afRequired && !a.fixedAssetCode) || (a.ipRequired && !a.ipAddress),
  );
  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const response = await fetch(
        `${CCTV_API_BASE}/api/cctv/installations`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Actor": "skylab-local-user",
          },
          body: JSON.stringify({
            locationId: selected.id,
            projectItemId: initialLocation?.projectItemId || null,
            solutionType: form.solutionType,
            provenance: form.provenance,
            installedAt: form.installedAt,
            technician: form.technician,
            notes: form.notes,
            idempotencyKey: crypto.randomUUID(),
            assets,
          }),
        },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "No fue posible guardar");
      setStep(4);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm grid place-items-center p-4">
      <Card className="w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-2xl">
        <CardHeader className="border-b">
          <div className="flex justify-between">
            <div>
              <CardTitle>Agregar instalación CCTV</CardTitle>
              <CardDescription>
                Paso {step} de 4 · alta transaccional y auditable
              </CardDescription>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              ×
            </Button>
          </div>
          <div className="grid grid-cols-4 gap-2 mt-4">
            {[1, 2, 3, 4].map((n) => (
              <div
                key={n}
                className={`h-1.5 rounded-full ${n <= step ? "bg-blue-500" : "bg-muted"}`}
              />
            ))}
          </div>
        </CardHeader>
        <CardContent className="p-6">
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <h3 className="font-bold">Seleccionar ubicación sin CCTV</h3>
                <p className="text-xs text-muted-foreground">
                  Catálogo compartido con Operación de Puntos
                </p>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Nombre, código SIIS o zona"
                />
              </div>
              <div className="max-h-80 overflow-y-auto space-y-2">
                {candidates.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setSelected(item)}
                    className={`w-full p-3 rounded-xl border text-left flex justify-between ${selected?.id === item.id ? "border-blue-500 bg-blue-500/10" : "border-border hover:bg-muted/30"}`}
                  >
                    <div>
                      <b>{item.name}</b>
                      <p className="text-xs text-muted-foreground">
                        {item.zone} · SIIS {item.siisCode}
                      </p>
                    </div>
                    <div className="text-right text-xs">
                      <span>{item.locationType}</span>
                      {item.isDouble === 1 && (
                        <Badge className="ml-2">Doble</Badge>
                      )}
                      <p className="text-muted-foreground">
                        {item.operationalNodes} nodo(s)
                      </p>
                    </div>
                  </button>
                ))}
              </div>
              <Button
                className="w-full"
                disabled={!selected}
                onClick={() => setStep(2)}
              >
                Continuar
              </Button>
            </div>
          )}
          {step === 2 && (
            <div className="space-y-4">
              <h3 className="font-bold">Solución instalada</h3>
              <div className="grid sm:grid-cols-2 gap-3">
                <label className="text-xs">
                  Tipo de solución
                  <select
                    className="w-full h-10 mt-1 rounded-md border bg-background px-3"
                    value={form.solutionType}
                    onChange={(e) => update("solutionType", e.target.value)}
                  >
                    <option value="STANDALONE_CAMERA">
                      Cámara autónoma MicroSD
                    </option>
                    <option value="NVR_KIT">Kit NVR</option>
                    <option value="DVR_KIT">Kit DVR</option>
                    <option value="MVR">MVR vehículo</option>
                    <option value="ANPR">Sistema ANPR</option>
                    <option value="ALARM">Alarma</option>
                    <option value="MIXED">Sistema mixto</option>
                  </select>
                </label>
                <label className="text-xs">
                  Procedencia
                  <select
                    className="w-full h-10 mt-1 rounded-md border bg-background px-3"
                    value={form.provenance}
                    onChange={(e) => update("provenance", e.target.value)}
                  >
                    <option value="NEW">Nuevo</option>
                    <option value="REUSED">Kit reutilizado</option>
                    <option value="MIXED">Mixto</option>
                  </select>
                </label>
                <label className="text-xs">
                  Fecha
                  <Input
                    type="date"
                    className="mt-1"
                    value={form.installedAt}
                    onChange={(e) => update("installedAt", e.target.value)}
                  />
                </label>
                <label className="text-xs">
                  Técnico responsable
                  <Input
                    className="mt-1"
                    value={form.technician}
                    onChange={(e) => update("technician", e.target.value)}
                  />
                </label>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(1)}>
                  Atrás
                </Button>
                <Button className="flex-1" onClick={() => setStep(3)}>
                  Continuar
                </Button>
              </div>
            </div>
          )}
          {step === 3 && (
            <div className="space-y-4">
              <div>
                <h3 className="font-bold">Componentes de la instalación</h3>
                <p className="text-xs text-muted-foreground">
                  Cada cámara agregada crea una tarjeta y un activo
                  independiente.
                </p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {ASSET_CATALOG.map(([type, label, af, ip]) => (
                  <button
                    key={type}
                    onClick={() => toggleAsset(type, label, af, ip)}
                    className={`p-2.5 rounded-lg border text-xs text-left ${assets.some((a) => a.assetType === type) ? "border-blue-500 bg-blue-500/10 text-blue-300" : "border-border hover:bg-muted/30"}`}
                  >
                    <span
                      className={`inline-block w-3 h-3 rounded border mr-2 ${assets.some((a) => a.assetType === type) ? "bg-blue-500 border-blue-500" : ""}`}
                    />
                    {["CAMERA", "STANDALONE_CAMERA"].includes(type) &&
                    assets.some((a) => a.assetType === type)
                      ? "+ Otra "
                      : ""}
                    {label}
                  </button>
                ))}
              </div>
              <div className="space-y-3">
                {assets.map((asset) => {
                  const tracked = [
                    "NVR",
                    "CAMERA",
                    "STANDALONE_CAMERA",
                    "HAPLITE_ROUTER",
                    "UPS",
                  ].includes(asset.assetType);
                  return (
                    <Card key={asset.clientId} className="bg-muted/10">
                      <CardHeader className="py-3">
                        <div className="flex justify-between">
                          <div>
                            <CardTitle className="text-sm">
                              {asset.label}
                            </CardTitle>
                            <CardDescription>
                              {tracked
                                ? "Activo individual con AF y serial"
                                : "Componente sin AF ni serial"}
                            </CardDescription>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeAsset(asset.clientId)}
                          >
                            Quitar
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent className="grid sm:grid-cols-3 gap-2 pb-4">
                        {!tracked && (
                          <label className="text-[10px]">
                            Cantidad
                            <Input
                              type="number"
                              min="1"
                              max="128"
                              value={asset.quantity}
                              onChange={(e) =>
                                updateAsset(
                                  asset.clientId,
                                  "quantity",
                                  e.target.value,
                                )
                              }
                            />
                          </label>
                        )}
                        {tracked && (
                          <>
                            <label className="text-[10px]">
                              Código AF *
                              <Input
                                placeholder="Activo Fijo"
                                value={asset.fixedAssetCode}
                                onChange={(e) =>
                                  updateAsset(
                                    asset.clientId,
                                    "fixedAssetCode",
                                    e.target.value,
                                  )
                                }
                              />
                            </label>
                            <label className="text-[10px]">
                              Serial
                              <Input
                                value={asset.serialNumber}
                                onChange={(e) =>
                                  updateAsset(
                                    asset.clientId,
                                    "serialNumber",
                                    e.target.value,
                                  )
                                }
                              />
                            </label>
                            <label className="text-[10px]">
                              Modelo
                              <Input
                                value={asset.model}
                                onChange={(e) =>
                                  updateAsset(
                                    asset.clientId,
                                    "model",
                                    e.target.value,
                                  )
                                }
                              />
                            </label>
                          </>
                        )}
                        {asset.ipRequired && (
                          <label className="text-[10px]">
                            IP CCTV *
                            <Input
                              placeholder="192.168.x.x"
                              value={asset.ipAddress}
                              onChange={(e) =>
                                updateAsset(
                                  asset.clientId,
                                  "ipAddress",
                                  e.target.value,
                                )
                              }
                            />
                          </label>
                        )}
                        {asset.assetType === "NVR" && (
                          <>
                            <label className="text-[10px]">
                              ID DSS
                              <Input
                                value={asset.dssIdentifier}
                                onChange={(e) =>
                                  updateAsset(
                                    asset.clientId,
                                    "dssIdentifier",
                                    e.target.value,
                                  )
                                }
                              />
                            </label>
                            <label className="text-[10px]">
                              Canales utilizados
                              <Input
                                type="number"
                                min="0"
                                max="128"
                                value={asset.channelCount}
                                onChange={(e) =>
                                  updateAsset(
                                    asset.clientId,
                                    "channelCount",
                                    e.target.value,
                                  )
                                }
                              />
                            </label>
                          </>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
              <label className="text-xs">
                Observaciones
                <Input
                  className="mt-1"
                  value={form.notes}
                  onChange={(e) => update("notes", e.target.value)}
                />
              </label>
              <Card className="bg-muted/20">
                <CardContent className="p-4 text-sm">
                  <b>{selected.name}</b>
                  <p className="text-muted-foreground">
                    {form.solutionType} · {form.provenance} · {assets.length}{" "}
                    activo(s)/componente(s)
                  </p>
                </CardContent>
              </Card>
              {error && <p className="text-sm text-rose-400">{error}</p>}
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(2)}>
                  Atrás
                </Button>
                <Button
                  className="flex-1"
                  disabled={saving || !assets.length || invalidAssets}
                  onClick={save}
                >
                  {saving ? "Guardando…" : "Confirmar instalación"}
                </Button>
              </div>
            </div>
          )}
          {step === 4 && (
            <div className="text-center py-8">
              <CheckCircle2 className="w-16 h-16 text-emerald-400 mx-auto" />
              <h3 className="text-2xl font-black mt-4">
                Instalación registrada
              </h3>
              <p className="text-muted-foreground mt-2">
                Se crearon el activo, sus canales, la cobertura y el registro de
                auditoría.
              </p>
              <Button className="mt-6" onClick={onClose}>
                Finalizar
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SourceHealth({ syncStatus }) {
  if(!syncStatus)return null;
  const config={EMAIL:{icon:Radio,tone:'text-blue-300',surface:'bg-blue-500/10'},SIIS:{icon:Activity,tone:'text-cyan-300',surface:'bg-cyan-500/10'},TRELLO:{icon:Wrench,tone:'text-violet-300',surface:'bg-violet-500/10'}};
  const state={HEALTHY:{label:'Al día',dot:'bg-emerald-400',text:'text-emerald-300'},STALE:{label:'Atrasada',dot:'bg-amber-400',text:'text-amber-300'},ERROR:{label:'Con error',dot:'bg-rose-400',text:'text-rose-300'},NO_DATA:{label:'Sin datos',dot:'bg-slate-500',text:'text-slate-400'}};
  const age=value=>value==null?'sin ejecución':value<2?'hace un momento':value<60?`hace ${value} min`:`hace ${Math.floor(value/60)} h`;
  return <Card className="overflow-hidden border-white/[.07] bg-gradient-to-r from-[#0d1523]/95 to-[#09101b]/95"><CardHeader className="border-b border-white/[.05] pb-3"><div className="flex items-center justify-between gap-3"><div><CardTitle className="text-base font-black uppercase tracking-wide">Salud de las fuentes</CardTitle><CardDescription>Última evidencia de ejecución del ciclo operativo</CardDescription></div><Badge variant="outline" className={syncStatus.overall==='HEALTHY'?'border-emerald-500/20 text-emerald-300':'border-amber-500/20 text-amber-300'}>{syncStatus.overall==='HEALTHY'?'Todo sincronizado':'Requiere atención'}</Badge></div></CardHeader><CardContent className="grid gap-3 pt-4 md:grid-cols-3">{syncStatus.sources.map(source=>{const visual=config[source.key],Icon=visual.icon,status=state[source.status]||state.NO_DATA;return <div key={source.key} className="rounded-xl border border-white/[.07] bg-white/[.025] p-4"><div className="flex items-start justify-between"><span className={`grid h-12 w-12 place-items-center rounded-xl ${visual.surface} ${visual.tone}`}><Icon size={25}/></span><span className={`flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wide ${status.text}`}><i className={`h-1.5 w-1.5 rounded-full ${status.dot}`}/>{status.label}</span></div><div className="mt-3 flex items-end justify-between gap-2"><div><b className="text-base text-slate-100">{source.name}</b><p className="mt-1 text-[11px] font-medium text-slate-400">{age(source.ageMinutes)} · {source.cadenceMinutes?`cada ${source.cadenceMinutes} min`:'fuera de horario'}</p></div><div className="text-right"><b className="text-2xl font-black text-white">{source.detail}</b><p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">{source.detailLabel}</p></div></div><p className="mt-3 border-t border-white/[.05] pt-2 text-[10px] text-slate-300">{source.message}</p></div>})}</CardContent></Card>;
}

function ApiHealthIndicator({ health, checking, onCheck }) {
  const connected = health?.ok === true;
  const degraded = health?.status === 'DEGRADED';
  const tone = connected && !degraded
    ? 'border-emerald-500/20 bg-emerald-500/[.06] text-emerald-300'
    : degraded
      ? 'border-amber-500/20 bg-amber-500/[.06] text-amber-300'
      : 'border-rose-500/20 bg-rose-500/[.06] text-rose-300';
  return <div className={`flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 ${tone}`}>
    <span className={`h-2 w-2 rounded-full ${connected && !degraded ? 'bg-emerald-400' : degraded ? 'bg-amber-400' : 'bg-rose-400'}`} />
    <div className="mr-1">
      <p className="text-[10px] font-black uppercase tracking-wide">API Trello</p>
      <p className="text-[10px] opacity-80">{connected && !degraded ? `Conectada · ${health.database === 'connected' ? 'base conectada' : 'base no confirmada'}` : degraded ? 'Respuesta lenta, servicio disponible' : (health?.error || 'Sin respuesta')}</p>
    </div>
    <Button variant="ghost" size="sm" onClick={onCheck} disabled={checking} className="h-8 px-2 text-[10px]">
      <RefreshCw size={13} className={`mr-1.5 ${checking ? 'animate-spin' : ''}`} />
      {checking ? 'Probando…' : 'Probar conexión'}
    </Button>
  </div>;
}

function OperationsNotificationCenter({items,onRead,onAttend,onReadAll,onNavigate,mode,onModeChange}){
  const [open,setOpen]=useState(false),unread=items.filter(item=>!item.read).length,openItems=items.filter(item=>!item.attended).length;
  const tone={critical:'border-rose-500/20 bg-rose-500/[.04] text-rose-300',warning:'border-amber-500/20 bg-amber-500/[.04] text-amber-300',info:'border-cyan-500/15 bg-cyan-500/[.03] text-cyan-300'};
  return <Card className="overflow-hidden border-white/[.07] bg-gradient-to-r from-[#0d1523]/95 to-[#09101b]/95"><button type="button" onClick={()=>setOpen(!open)} className="flex w-full items-center justify-between gap-4 p-4 text-left"><div className="flex items-center gap-3"><span className="relative grid h-11 w-11 place-items-center rounded-xl bg-amber-500/10 text-amber-300"><BellRing size={22}/>{unread>0&&<i className="absolute -right-1 -top-1 grid min-h-5 min-w-5 place-items-center rounded-full border-2 border-[#0d1523] bg-rose-500 px-1 text-[8px] font-black not-italic text-white">{Math.min(99,unread)}</i>}</span><div><CardTitle className="text-sm font-black uppercase tracking-wide">Actividad en vivo</CardTitle><CardDescription>{openItems} pendientes de atención · {items.length} notificaciones conservadas</CardDescription></div></div><span className={`grid h-9 w-9 place-items-center rounded-lg border border-white/[.07] text-slate-400 transition ${open?'rotate-90 border-cyan-500/20 text-cyan-300':''}`}><ArrowRight size={17}/></span></button>{open&&<div className="border-t border-white/[.06] p-4"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><select value={mode} onChange={e=>onModeChange(e.target.value)} className="h-8 rounded-md border bg-background px-2 text-[10px]"><option value="ALL">Popups: todos los eventos</option><option value="PRIORITY">Popups: solo prioritarios</option><option value="MUTED">Popups silenciados</option></select>{unread>0&&<button onClick={onReadAll} className="text-[10px] font-bold text-cyan-300 hover:text-cyan-200">Marcar todas como leídas</button>}</div><div className="max-h-80 space-y-2 overflow-y-auto pr-1">{items.length?items.map(item=><div key={item.id} className={`rounded-xl border p-3 ${tone[item.severity]||tone.info} ${item.read?'opacity-65':''}`}><div className="flex items-start justify-between gap-3"><button type="button" className="min-w-0 flex-1 text-left" onClick={()=>{onRead(item.id);onNavigate(item.targetTab)}}><span className="flex items-center gap-2"><i className={`h-2 w-2 rounded-full ${item.read?'bg-slate-600':'bg-current'}`}/><b className="truncate text-[11px] text-slate-100">{item.title}</b></span><p className="mt-1 pl-4 text-[10px] text-slate-400">{item.description}</p><p className="mt-1 pl-4 text-[8px] uppercase tracking-wide text-slate-600">{new Intl.DateTimeFormat('es-CO',{timeZone:'America/Bogota',dateStyle:'short',timeStyle:'short'}).format(new Date(item.createdAt))} · {item.source}</p></button><button type="button" disabled={item.attended} onClick={()=>onAttend(item.id)} className={`shrink-0 rounded-md border px-2 py-1 text-[8px] font-black uppercase ${item.attended?'border-emerald-500/15 text-emerald-400':'border-white/[.08] text-slate-400 hover:text-emerald-300'}`}>{item.attended?'Atendida':'Atender'}</button></div></div>):<div className="rounded-xl border border-dashed border-white/[.08] p-8 text-center text-xs text-slate-500">Las nuevas actividades aparecerán aquí.</div>}</div></div>}</Card>;
}

function RealAlarms({data,search='',onChanged}){
  const [filter,setFilter]=useState('ALL');
  const [editing,setEditing]=useState(null),[form,setForm]=useState({}),[saving,setSaving]=useState(false);
  const stamp=value=>value?new Intl.DateTimeFormat('es-CO',{timeZone:'America/Bogota',dateStyle:'medium',timeStyle:'short'}).format(new Date(value)):'Sin fecha';
  const normalizedSearch=String(search||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const matches=(...values)=>!normalizedSearch||values.some(value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(normalizedSearch));
  if(!data)return <div className="rounded-2xl border bg-card p-8 text-center text-muted-foreground">Consultando sistemas de alarma…</div>;
  const labels={OSZFORD_MONITORED:'OSZFORD',DAHUA_DEDICATED:'Dahua dedicado',DAHUA_DEVICE_IO:'Dahua NVR/cámara'};
  const tones={OSZFORD_MONITORED:'border-amber-400/25 bg-amber-500/10 text-amber-300',DAHUA_DEDICATED:'border-cyan-400/25 bg-cyan-500/10 text-cyan-300',DAHUA_DEVICE_IO:'border-violet-400/25 bg-violet-500/10 text-violet-300'};
  const items=(data.items||[]).filter(item=>(filter==='ALL'||item.systemKinds.includes(filter))&&matches(item.name,item.zone,item.code));
  const openEditor=item=>{const p=item.communicationProfile||{},oszford=item.systems.find(system=>system.kind==='OSZFORD_MONITORED')||{};setForm({subscriberAccount:p.subscriber_account||oszford.reference||'',panelModel:p.panel_model||oszford.technology||'',localIp:p.local_ip||oszford.ip||'',reportChannel:p.report_channel||'GPRS/IP',primaryReceiverAddress:p.primary_receiver_address||'',primaryReceiverPort:p.primary_receiver_port||'',primaryReceiverStatus:p.primary_receiver_status||'UNKNOWN',secondaryReceiverAddress:p.secondary_receiver_address||'',secondaryReceiverPort:p.secondary_receiver_port||'',secondaryReceiverStatus:p.secondary_receiver_status||'NOT_CONFIGURED',backupReceiverAddress:p.backup_receiver_address||'',backupReceiverPort:p.backup_receiver_port||'',backupReceiverStatus:p.backup_receiver_status||'NOT_CONFIGURED',failurePolicy:p.failure_policy||'',verifiedAt:p.verified_at?.slice(0,16)||new Date().toISOString().slice(0,16),notes:p.notes||''});setEditing(item);};
  const saveProfile=async()=>{setSaving(true);try{const response=await fetch(`${CCTV_API_BASE}/api/cctv/alarms/${encodeURIComponent(editing.id)}/communication-profile`,{method:'POST',headers:{'Content-Type':'application/json','X-Actor':'skylab-local-user'},body:JSON.stringify(form)});const result=await response.json();if(!response.ok)throw new Error(result.error||'No fue posible guardar');toast.success('Configuración BabyWare actualizada',{description:editing.name});setEditing(null);await onChanged?.();}catch(error){toast.error('No fue posible guardar la ficha',{description:error.message})}finally{setSaving(false)}};
  const maskAddress=value=>{if(!value)return'No documentado';const parts=String(value).split('.');return parts.length===4?`${parts[0]}.${parts[1]}.***.${parts[3]}`:String(value).replace(/^(.{3}).+(.{3})$/,'$1•••$2');};
  const kpis=[
    ['Puntos con alarma',data.summary.points,ShieldCheck,'text-emerald-300 bg-emerald-500/10'],
    ['Monitoreados OSZFORD',data.summary.oszford,Radio,'text-amber-300 bg-amber-500/10'],
    ['Sistemas Dahua dedicados',data.summary.dahuaDedicated,BellRing,'text-cyan-300 bg-cyan-500/10'],
    ['Alarma desde NVR/cámara',data.summary.dahuaIo,HardDrive,'text-violet-300 bg-violet-500/10'],
    ['Identidades por validar',data.summary.unlinked,AlertTriangle,'text-rose-300 bg-rose-500/10'],
  ];
  return <div className="space-y-5">
    <section className="rounded-2xl border border-cyan-400/20 bg-gradient-to-r from-cyan-500/[.07] via-card to-violet-500/[.06] p-5">
      <p className="text-[10px] font-black uppercase tracking-[.22em] text-cyan-300">Protección electrónica integrada</p>
      <div className="mt-2 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between"><div><h2 className="text-2xl font-black">Sistemas de alarma</h2><p className="mt-1 max-w-3xl text-sm text-muted-foreground">Separa monitoreo externo OSZFORD, controladores Dahua dedicados y entradas de alarma conectadas a NVR o cámaras. Un punto puede tener más de una capa.</p></div><Badge variant="outline">Corte {stamp(data.generatedAt)}</Badge></div>
    </section>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{kpis.map(([label,value,Icon,tone])=><div key={label} className="flex min-h-24 items-center gap-4 rounded-2xl border bg-card p-4"><span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${tone}`}><Icon size={24}/></span><div><b className="text-2xl font-black">{value}</b><p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p></div></div>)}</div>
    <div className="flex flex-wrap gap-2">{[['ALL','Todos'],...Object.entries(labels)].map(([key,label])=><Button key={key} size="sm" variant={filter===key?'default':'outline'} onClick={()=>setFilter(key)}>{label}</Button>)}</div>
    <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">{items.map(item=><article key={item.id} className="rounded-2xl border bg-card p-4 transition-colors hover:border-cyan-400/30">
      <div className="flex items-start justify-between gap-3"><div><h3 className="font-black">{item.name}</h3><p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{item.zone} · SIIS {item.code||'sin código'}</p></div>{item.systemKinds.length>1&&<Badge className="bg-fuchsia-500/10 text-fuchsia-300">Protección híbrida</Badge>}</div>
      <div className="mt-4 space-y-2">{item.systems.map((system,index)=><div key={`${system.kind}-${index}`} className="rounded-xl border border-border/70 bg-background/40 p-3"><div className="flex items-center justify-between gap-2"><span className={`rounded-full border px-2 py-1 text-[9px] font-black uppercase ${tones[system.kind]}`}>{labels[system.kind]}</span><span className="text-[9px] font-bold text-muted-foreground">{system.status==='ONLINE_REPORTED'?'Comunicación reportada OK':system.status==='ACTIVE'?'Activo':'Por verificar'}</span></div><b className="mt-2 block text-sm">{system.technology}</b><p className="mt-1 text-[10px] text-muted-foreground">{[system.reference&&`Cuenta/ID ${system.reference}`,system.ip&&`IP ${system.ip}`].filter(Boolean).join(' · ')||'Referencia técnica pendiente'}</p></div>)}</div>
      <div className="mt-3 rounded-xl border bg-background/30 p-3"><div className="flex items-center justify-between"><span className="text-[9px] font-black uppercase tracking-wide text-muted-foreground">Comunicación BabyWare</span><Badge variant="outline" className={item.communicationHealth==='OPERATIONAL'?'text-emerald-400':item.communicationHealth==='DEGRADED'?'text-amber-400':item.communicationHealth==='CRITICAL'?'text-rose-400':'text-muted-foreground'}>{item.communicationHealth==='OPERATIONAL'?'Operativa':item.communicationHealth==='DEGRADED'?'Redundancia degradada':item.communicationHealth==='CRITICAL'?'Crítica':'No documentada'}</Badge></div>{item.communicationProfile?<div className="mt-2 grid grid-cols-2 gap-2 text-[10px]"><span>Abonado <b className="block text-foreground">{item.communicationProfile.subscriber_account||'—'}</b></span><span>Canal <b className="block text-foreground">{item.communicationProfile.report_channel||'—'}</b></span><span>Receptor principal <b className="block text-foreground">{maskAddress(item.communicationProfile.primary_receiver_address)}</b></span><span>Verificado <b className="block text-foreground">{stamp(item.communicationProfile.verified_at)}</b></span></div>:<p className="mt-2 text-[10px] text-muted-foreground">Pendiente de registrar desde BabyWare.</p>}<Button size="sm" variant="outline" className="mt-3 w-full" onClick={()=>openEditor(item)}>Actualizar configuración BabyWare</Button></div>
      <div className="mt-3 flex items-center justify-between border-t pt-3 text-[10px]"><span className="text-muted-foreground">{item.sourceConfidence==='CONFIRMED'?'Fuente técnica confirmada':'Reportado en inventario histórico'}</span><span className={item.lastEvent?'text-emerald-400':'text-muted-foreground'}>{item.lastEvent?`Último evento ${stamp(item.lastEvent.occurredAt)}`:'Sin evento reciente'}</span></div>
    </article>)}</div>
    {!items.length&&<div className="rounded-2xl border bg-card p-8 text-center text-muted-foreground">No hay sistemas de alarma para este filtro.</div>}
    {!!data.unlinked?.length&&<details className="rounded-2xl border border-amber-400/20 bg-amber-500/[.04] p-4"><summary className="cursor-pointer font-bold text-amber-300">{data.unlinked.length} referencias pendientes de vincular</summary><div className="mt-3 grid gap-2 sm:grid-cols-2">{data.unlinked.map((item,index)=><div key={`${item.name}-${index}`} className="rounded-xl border bg-card p-3"><b>{item.name}</b><p className="text-xs text-muted-foreground">{item.reason}</p></div>)}</div></details>}
    {editing&&createPortal(<div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/80 p-4 backdrop-blur-sm" onMouseDown={event=>{if(event.target===event.currentTarget)setEditing(null)}}><div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-3xl border bg-background p-6 shadow-2xl"><div className="flex items-start justify-between"><div><p className="text-[10px] font-black uppercase tracking-[.2em] text-cyan-400">Verificación manual · BabyWare</p><h3 className="mt-1 text-xl font-black">{editing.name}</h3><p className="text-sm text-muted-foreground">No ingreses contraseñas, códigos maestros ni códigos de instalador.</p></div><Button variant="ghost" size="sm" onClick={()=>setEditing(null)}><XCircle size={20}/></Button></div><div className="mt-5 grid gap-4 md:grid-cols-3">{[['subscriberAccount','Abonado'],['panelModel','Modelo del panel'],['localIp','IP local del módulo'],['reportChannel','Canal de reporte'],['failurePolicy','Política ante fallo']].map(([key,label])=><label key={key} className="space-y-1"><span className="text-xs font-bold text-muted-foreground">{label}</span><Input value={form[key]||''} onChange={event=>setForm(current=>({...current,[key]:event.target.value}))}/></label>)}</div><div className="mt-5 grid gap-4 lg:grid-cols-3">{[['primary','Receptor principal'],['secondary','Receptor secundario'],['backup','Receptor de respaldo']].map(([prefix,label])=><section key={prefix} className="rounded-2xl border bg-card p-4"><h4 className="font-black">{label}</h4><label className="mt-3 block space-y-1"><span className="text-xs text-muted-foreground">Dirección</span><Input value={form[`${prefix}ReceiverAddress`]||''} onChange={event=>setForm(current=>({...current,[`${prefix}ReceiverAddress`]:event.target.value}))}/></label><label className="mt-3 block space-y-1"><span className="text-xs text-muted-foreground">Puerto</span><Input type="number" min="1" max="65535" value={form[`${prefix}ReceiverPort`]||''} onChange={event=>setForm(current=>({...current,[`${prefix}ReceiverPort`]:event.target.value}))}/></label><label className="mt-3 block space-y-1"><span className="text-xs text-muted-foreground">Estado observado</span><select className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={form[`${prefix}ReceiverStatus`]||'UNKNOWN'} onChange={event=>setForm(current=>({...current,[`${prefix}ReceiverStatus`]:event.target.value}))}><option value="REGISTERED">Registrado</option><option value="UNREGISTERED">Sin registrar</option><option value="ERROR">Error de registro</option><option value="NOT_CONFIGURED">No configurado</option><option value="UNKNOWN">Por verificar</option></select></label></section>)}</div><div className="mt-5 grid gap-4 md:grid-cols-[240px_1fr]"><label className="space-y-1"><span className="text-xs font-bold text-muted-foreground">Fecha de verificación</span><Input type="datetime-local" value={form.verifiedAt||''} onChange={event=>setForm(current=>({...current,verifiedAt:event.target.value}))}/></label><label className="space-y-1"><span className="text-xs font-bold text-muted-foreground">Observaciones</span><Input value={form.notes||''} onChange={event=>setForm(current=>({...current,notes:event.target.value}))}/></label></div><div className="mt-6 flex justify-end gap-2"><Button variant="outline" onClick={()=>setEditing(null)}>Cancelar</Button><Button disabled={saving} onClick={saveProfile}>{saving?'Guardando…':'Guardar verificación'}</Button></div></div></div>,document.body)}
  </div>;
}

function RealOperations({ overview, syncStatus, dailyEvents, project, maintenance, support, visitors, quality, onNavigate, notifications, notificationMode, onNotificationMode, onNotificationRead, onNotificationAttend, onNotificationsReadAll }) {
  if (!overview)
    return (
      <div className="py-20 text-center text-muted-foreground">
        Cargando datos canónicos…
      </div>
    );
  const t=overview.totals,eventSummary=dailyEvents?.summary||{},projectSummary=project?.summary||{},maintenanceSummary=maintenance?.summary||{},supportSummary=support?.summary||{},visitorSummary=visitors?.summary||{},qualitySummary=quality?.summary||{};
  const domains=[
    {tab:'events',icon:MonitorPlay,label:'Eventos de hoy',value:eventSummary.total||0,detail:`${eventSummary.review||0} requieren revisión · ${dailyEvents?.identityPending?.length||0} identidades pendientes`,tone:'text-cyan-300 bg-cyan-500/10'},
    {tab:'visitors',icon:UsersRound,label:'Visitantes de ayer',value:visitorSummary.visits||0,detail:`${visitorSummary.uniqueVisitors||0} personas · ${visitorSummary.openVisits||0} sin salida`,tone:'text-blue-300 bg-blue-500/10'},
    {tab:'maintenance',icon:Wrench,label:'Mantenimiento',value:maintenanceSummary.pending||0,detail:`${maintenanceSummary.completed||0} de ${maintenanceSummary.total||0} actividades ejecutadas`,tone:'text-emerald-300 bg-emerald-500/10'},
    {tab:'project',icon:Cctv,label:'Proyecto 2026',value:`${projectSummary.officialProgressPercent||0}%`,detail:`${projectSummary.completedExecution||0} de ${projectSummary.actionableExecution||0} acciones verificadas`,tone:'text-violet-300 bg-violet-500/10'},
    {tab:'support',icon:Activity,label:'Soporte Trello',value:supportSummary.pending||0,detail:`${supportSummary.total||0} actividades · ${supportSummary.withImages||0} con evidencia`,tone:'text-amber-300 bg-amber-500/10'},
    {tab:'inventory',icon:ShieldCheck,label:'Calidad de inventario',value:`${qualitySummary.qualityPercent||0}%`,detail:`${qualitySummary.pending||0} acciones de calidad abiertas`,tone:'text-rose-300 bg-rose-500/10'},
  ];
  return (
    <div className="space-y-5">
      <OperationsNotificationCenter items={notifications} mode={notificationMode} onModeChange={onNotificationMode} onRead={onNotificationRead} onAttend={onNotificationAttend} onReadAll={onNotificationsReadAll} onNavigate={onNavigate}/>
      <SourceHealth syncStatus={syncStatus}/>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{domains.map(item=>{const Icon=item.icon;return <button key={item.tab} onClick={()=>onNavigate(item.tab)} className="group flex items-center gap-4 rounded-2xl border border-white/[.07] bg-card/40 p-4 text-left transition hover:-translate-y-0.5 hover:border-cyan-500/25"><span className={`grid h-14 w-14 shrink-0 place-items-center rounded-xl ${item.tone}`}><Icon size={27}/></span><span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><b className="text-[12px] font-black uppercase tracking-[.09em] text-slate-300">{item.label}</b><ArrowRight size={16} className="text-slate-600 transition group-hover:translate-x-0.5 group-hover:text-cyan-300"/></span><strong className="mt-1 block text-3xl font-black text-slate-100">{item.value}</strong><small className="mt-1 block text-[11px] leading-snug text-slate-400">{item.detail}</small></span></button>})}</div>
      <div className="grid gap-4 lg:grid-cols-[.72fr_1.28fr]">
        <Card className="overflow-hidden border-white/[.07] bg-gradient-to-b from-[#101827]/90 to-[#090e18]/90 shadow-xl">
          <CardHeader className="border-b border-white/[.05] pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-black uppercase tracking-wide">
                  Cobertura de la red
                </CardTitle>
                <CardDescription className="mt-1">
                  Estado de las {t.locations} ubicaciones activas
                </CardDescription>
              </div>
              <div className="rounded-lg bg-emerald-500/10 px-3 py-1.5 text-sm font-black text-emerald-400">
                {Math.round((t.covered / t.locations) * 100)}%
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid min-h-72 grid-cols-[1.2fr_.8fr] items-center gap-2 pt-4">
            <div className="relative h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={overview.coverage}
                    innerRadius={72}
                    outerRadius={101}
                    paddingAngle={3}
                    cornerRadius={5}
                    stroke="none"
                    dataKey="value"
                  >
                    {overview.coverage.map((x) => (
                      <Cell key={x.name} fill={x.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "#08101f",
                      border: "1px solid #263449",
                      borderRadius: 10,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 grid place-items-center">
                <div className="text-center">
                  <div className="text-3xl font-black text-white">
                    {Math.round((t.covered / t.locations) * 100)}%
                  </div>
                  <div className="text-[9px] font-bold uppercase tracking-[.18em] text-slate-500">
                    con cobertura
                  </div>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              {overview.coverage.map((item) => (
                <div
                  key={item.name}
                  className="rounded-lg border border-white/[.06] bg-white/[.025] p-2.5"
                >
                  <div className="flex items-center gap-2 text-[10px] text-slate-400">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ background: item.color }}
                    />
                    {item.name}
                  </div>
                  <div className="mt-1 text-xl font-black text-white">
                    {item.value}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card className="overflow-hidden border-white/[.07] bg-gradient-to-b from-[#101827]/90 to-[#090e18]/90 shadow-xl">
          <CardHeader className="border-b border-white/[.05] pb-3">
            <CardTitle className="text-sm font-black uppercase tracking-wide">Lectura ejecutiva del día</CardTitle>
            <CardDescription>Señales relevantes consolidadas desde las demás ventanas</CardDescription>
          </CardHeader>
          <CardContent className="grid min-h-72 gap-3 pt-4 sm:grid-cols-2"><div className="rounded-xl border border-emerald-500/15 bg-emerald-500/[.035] p-4"><p className="text-[9px] font-black uppercase tracking-[.12em] text-emerald-300">Operación observada</p><b className="mt-2 block text-3xl font-black text-slate-100">{eventSummary.openingPoints||0}</b><p className="text-[10px] text-slate-500">puntos con señal de apertura hoy</p></div><div className="rounded-xl border border-cyan-500/15 bg-cyan-500/[.035] p-4"><p className="text-[9px] font-black uppercase tracking-[.12em] text-cyan-300">Identidad confiable</p><b className="mt-2 block text-3xl font-black text-slate-100">{eventSummary.identityPercent||0}%</b><p className="text-[10px] text-slate-500">eventos vinculados al catálogo</p></div><div className="rounded-xl border border-amber-500/15 bg-amber-500/[.035] p-4"><p className="text-[9px] font-black uppercase tracking-[.12em] text-amber-300">Trabajo pendiente</p><b className="mt-2 block text-3xl font-black text-slate-100">{(maintenanceSummary.pending||0)+(supportSummary.pending||0)}</b><p className="text-[10px] text-slate-500">actividades entre mantenimiento y soporte</p></div><div className="rounded-xl border border-violet-500/15 bg-violet-500/[.035] p-4"><p className="text-[9px] font-black uppercase tracking-[.12em] text-violet-300">Modernización</p><b className="mt-2 block text-3xl font-black text-slate-100">{projectSummary.officialProgressPercent||0}%</b><p className="text-[10px] text-slate-500">avance oficial verificado</p></div></CardContent>
        </Card>
      </div>
    </div>
  );
}

function RealInventory({overview,points,technology,quality,onChanged,activeZone,onZoneChange}){
  if(!overview)return <div className="py-20 text-center text-muted-foreground">Cargando inventario canónico…</div>;
  const t=overview.totals;
  return <div className="space-y-5"><div className="grid grid-cols-2 gap-3 lg:grid-cols-5"><Kpi icon={Store} title="Ubicaciones" value={t.locations} badge={`${t.crmPoints} puntos CRM/SIIS`}/><Kpi icon={Cctv} title="Confirmados DSS" value={t.covered} badge={`${Math.round(t.covered/t.locations*100)}% del catálogo · ${t.reported||0} por validar`} color="text-emerald-400"/><Kpi icon={HardDrive} title="Dispositivos DSS" value={t.dssDevices} badge={`${t.models} modelos registrados`} color="text-violet-400"/><Kpi icon={MonitorPlay} title="Canales declarados" value={t.declaredChannels} badge="Cobertura técnica parcial" color="text-cyan-400"/><Kpi icon={Unplug} title="Sin CCTV" value={t.withoutCctv} badge="Universo sin cobertura" color="text-rose-400"/></div>
    <TechnologyPanel technology={technology}/><Card className="border-white/[.07] bg-card/40"><CardHeader className="pb-3"><div className="flex items-center justify-between"><div><CardTitle className="text-base">Cobertura confirmada por zona</CardTitle><CardDescription>Selecciona una zona para consultar inmediatamente sus puntos.</CardDescription></div><Badge variant="outline" className="border-emerald-500/20 text-emerald-300"><ShieldCheck size={13} className="mr-1"/>Inventario conciliado</Badge></div></CardHeader><CardContent><RealZones zones={overview.zones} selected={activeZone} onSelect={onZoneChange}/></CardContent></Card><div><div className="mb-3 flex items-end justify-between"><div><h2 className="text-lg">{activeZone && activeZone!=="Todas"?`Puntos de ${activeZone}`:"Ubicaciones y sistemas instalados"}</h2><p className="text-xs text-muted-foreground">Puntos con evidencia DSS, activos, modelos y tecnologías instaladas</p></div><div className="flex items-center gap-2">{activeZone&&activeZone!=="Todas"&&<button onClick={()=>onZoneChange?.("Todas")} className="rounded-md border border-cyan-500/20 bg-cyan-500/[.06] px-2.5 py-1.5 text-[10px] font-bold text-cyan-300">Ver todas</button>}<Badge variant="secondary">{points.length} ubicaciones</Badge></div></div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{points.map(p=><PointCard key={p.code||p.name} p={p} onChanged={onChanged}/>)}</div></div></div>;
}
function RealZones({ zones = [], selected = "Todas", onSelect }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
      {zones.map((z) => {
        const pct = z.total ? Math.round((z.covered / z.total) * 100) : 0;
        return (
          <button type="button" onClick={()=>onSelect?.(selected===z.name?"Todas":z.name)} key={z.name} className={`group w-full rounded-xl border bg-gradient-to-br from-white/[.035] to-transparent p-3.5 text-left transition focus:outline-none ${selected===z.name?'border-cyan-400/50 bg-cyan-500/[.06] shadow-lg shadow-cyan-950/20':'border-white/[.07] hover:border-cyan-500/25'}`}>
            <div className="flex items-start justify-between gap-2"><div className="flex min-w-0 items-center gap-2.5"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-cyan-500/15 bg-cyan-500/[.07] text-cyan-300"><MapPin size={18}/></span><div className="min-w-0"><b className="block truncate text-[12px] font-black text-slate-100">{z.name}</b><span className="text-[9px] font-medium text-slate-500">{z.devices} dispositivos DSS</span></div></div><strong className="text-2xl font-black text-cyan-300">{pct}%</strong></div>
            <div className="my-3 h-1.5 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-gradient-to-r from-blue-500 via-cyan-400 to-emerald-400" style={{width:`${pct}%`}}/></div>
            <div className="grid grid-cols-3 divide-x divide-white/[.06]"><div className="px-1"><span className="flex items-center gap-1 text-[8px] font-bold uppercase text-slate-500"><Building2 size={11}/>Puntos</span><b className="mt-1 block text-xl font-black text-slate-100">{z.total}</b></div><div className="px-2"><span className="flex items-center gap-1 text-[8px] font-bold uppercase text-slate-500"><Cctv size={11}/>CCTV</span><b className="mt-1 block text-xl font-black text-emerald-300">{z.covered}</b></div><div className="px-2"><span className="flex items-center gap-1 text-[8px] font-bold uppercase text-slate-500"><Unplug size={11}/>Sin CCTV</span><b className="mt-1 block text-xl font-black text-slate-300">{Math.max(0,z.total-z.covered)}</b></div></div>
          </button>
        );
      })}
    </div>
  );
}

function bogotaDateOffset(days=0){
  const base=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),date=new Date(`${base}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate()+days);
  return date.toISOString().slice(0,10);
}
function readNotificationStore(){try{return JSON.parse(window.localStorage.getItem('skylab-security-notifications')||'[]')}catch{return []}}
const DASHBOARD_CACHE_KEY = 'skylab-security-dashboard-cache';
function readDashboardCache(){try{const value=JSON.parse(window.localStorage.getItem(DASHBOARD_CACHE_KEY)||'null');return value?.data||null}catch{return null}}
function writeDashboardCache(data){try{window.localStorage.setItem(DASHBOARD_CACHE_KEY,JSON.stringify({savedAt:new Date().toISOString(),data}))}catch{} }
function normalizeSupportData(data){return {...data,items:(data?.items||[]).map(item=>({...item,image:item.image?{...item.image,url:`${CCTV_API_BASE}/api/cctv/support/${encodeURIComponent(item.id)}/image`}:null}))}}

function Overview() {
  const [initialCache] = useState(readDashboardCache);
  const [tab, setTab] = useState("operations"),
    [search, setSearch] = useState(""),
    [zone, setZone] = useState("Todas"),
    [state, setState] = useState("Todos"),
    [showWizard, setShowWizard] = useState(false),
    [installationTarget, setInstallationTarget] = useState(null),
    [overview, setOverview] = useState(initialCache?.overview || null),
    [technology, setTechnology] = useState(initialCache?.technology || null),
    [quality, setQuality] = useState(initialCache?.quality || null),
    [alarms, setAlarms] = useState(initialCache?.alarms || null),
    [project, setProject] = useState(initialCache?.project || null),
    [maintenance, setMaintenance] = useState(initialCache?.maintenance || null),
    [support, setSupport] = useState(initialCache?.support ? normalizeSupportData(initialCache.support) : null),
    [visitorSummary, setVisitorSummary] = useState(initialCache?.visitorSummary || null),
    [syncStatus, setSyncStatus] = useState(initialCache?.syncStatus || null),
    [apiHealth, setApiHealth] = useState(null),
    [checkingApi, setCheckingApi] = useState(false),
    [dailyEvents, setDailyEvents] = useState(null),
    [eventDate, setEventDate] = useState(
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Bogota",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date()),
    ),
    [inventory, setInventory] = useState(initialCache?.inventory || []),
    [apiError, setApiError] = useState(""),
    [refreshing, setRefreshing] = useState(false),
    [pointContext, setPointContext] = useState({ points: [], schedules: [] }),
    [notifications,setNotifications]=useState(readNotificationStore),
    [notificationMode,setNotificationMode]=useState(()=>window.localStorage.getItem('skylab-security-notification-mode')||'ALL');
  const notificationState = useRef({eventsReady:false,supportReady:false,eventIds:new Set(),supportKeys:new Set()});
  const apiHealthFailures = useRef(0);
  const notificationActor='skylab-local-user',notificationHeaders={'Content-Type':'application/json','X-Actor':notificationActor};
  const checkApiHealth = async () => {
    setCheckingApi(true);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(`${CCTV_API_BASE}/api/cctv/health`, { cache: 'no-store', signal: controller.signal });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      apiHealthFailures.current = 0;
      setApiHealth(data);
    } catch (error) {
      apiHealthFailures.current += 1;
      const message = error.name === 'AbortError' ? 'Respuesta lenta' : error.message;
      setApiHealth((previous) => previous?.ok && apiHealthFailures.current < 3
        ? { ...previous, status: 'DEGRADED', error: message }
        : { ok: false, error: message });
    } finally {
      window.clearTimeout(timeout);
      setCheckingApi(false);
    }
  };
  const addNotification=item=>setNotifications(current=>[item,...current.filter(row=>row.id!==item.id)].slice(0,60));
  const updateNotification=(id,change)=>setNotifications(current=>current.map(item=>item.id===id?{...item,...change}:item));
  useEffect(()=>{window.localStorage.setItem('skylab-security-notifications',JSON.stringify(notifications))},[notifications]);
  useEffect(()=>{window.localStorage.setItem('skylab-security-notification-mode',notificationMode)},[notificationMode]);
  useEffect(()=>{checkApiHealth();const timer=window.setInterval(checkApiHealth,30000);return()=>window.clearInterval(timer)},[]);
  useEffect(()=>{let active=true;const refresh=()=>fetch(`${CCTV_API_BASE}/api/cctv/notifications`,{cache:'no-store',headers:{'X-Actor':notificationActor}}).then(r=>r.json()).then(data=>{if(active){setNotifications(data.items||[]);if(data.preference)setNotificationMode(data.preference)}}).catch(()=>{});refresh();const timer=window.setInterval(refresh,60_000);return()=>{active=false;window.clearInterval(timer)}},[]);
  const changeNotificationMode=mode=>{setNotificationMode(mode);fetch(`${CCTV_API_BASE}/api/cctv/notifications/preferences`,{method:'POST',headers:notificationHeaders,body:JSON.stringify({mode})}).catch(()=>{})};
  const markNotification=(id,change)=>{updateNotification(id,change);fetch(`${CCTV_API_BASE}/api/cctv/notifications/${encodeURIComponent(id)}/state`,{method:'POST',headers:notificationHeaders,body:JSON.stringify(change)}).catch(()=>{})};
  const markAllNotificationsRead=()=>{setNotifications(current=>current.map(item=>({...item,read:true})));fetch(`${CCTV_API_BASE}/api/cctv/notifications/read-all`,{method:'POST',headers:notificationHeaders,body:'{}'}).catch(()=>{})};
  const load = () => {
    setRefreshing(true);
    return Promise.all([
      fetch(`${CCTV_API_BASE}/api/cctv/overview`).then((r) => r.json()),
      fetch(`${CCTV_API_BASE}/api/cctv/inventory`).then((r) => r.json()),
      fetch(`${CCTV_API_BASE}/api/cctv/technology`).then((r) => r.json()),
      fetch(`${CCTV_API_BASE}/api/cctv/quality`).then((r) => r.json()),
      fetch(`${CCTV_API_BASE}/api/cctv/project`, { cache: "no-store" }).then((r) => r.json()),
      fetch(`${CCTV_API_BASE}/api/cctv/maintenance`).then((r) => r.json()),
      fetch(`${CCTV_API_BASE}/api/cctv/sync-status`).then((r) => r.json()),
      fetch(`${CCTV_API_BASE}/api/cctv/support`).then((r) => r.json()),
      fetch(`${CCTV_API_BASE}/api/cctv/visitors?period=DAY&date=${bogotaDateOffset(-1)}`, {cache:'no-store'}).then((r)=>r.json()),
      fetch(`${CCTV_API_BASE}/api/cctv/alarms`, {cache:'no-store'}).then((r)=>r.json()),
    ])
      .then(([o, i, t, q, p, m, s, supportData, visitorsData, alarmsData]) => {
        setApiError("");
        setOverview(o);
        setInventory(i.items || []);
        setTechnology({
          ...t,
          models: (t.models || []).map((model) => ({
            ...model,
            imageUrl: model.imageUrl
              ? `${CCTV_API_BASE}${new URL(model.imageUrl, window.location.origin).pathname}`
              : null,
          })),
        });
        setQuality(q);
        setProject(p);
        setMaintenance(m);
        setSyncStatus(s);
        setVisitorSummary(visitorsData);
        setAlarms(alarmsData);
        setSupport(normalizeSupportData(supportData));
        writeDashboardCache({overview:o,inventory:i.items||[],technology:t,quality:q,project:p,maintenance:m,syncStatus:s,support:supportData,visitorSummary:visitorsData,alarms:alarmsData});
      })
      .catch(() =>
        setApiError("La API CCTV no está disponible en el puerto 3003."),
      )
      .finally(() => setRefreshing(false));
  };
  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    if (tab !== "maintenance") return;
    let active = true;
    const refreshMaintenance = () => fetch(`${CCTV_API_BASE}/api/cctv/maintenance`, {cache:"no-store"})
      .then((response) => response.json()).then((data) => { if (active) setMaintenance(data); })
      .catch(() => {});
    refreshMaintenance();
    const timer = window.setInterval(refreshMaintenance, 60_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [tab]);
  useEffect(() => {
    Promise.all([pointsService.getPoints(), pointsService.getZoneSchedules()])
      .then(([points, schedules]) =>
        setPointContext({ points: points || [], schedules: schedules || [] }),
      )
      .catch(() => setPointContext({ points: [], schedules: [] }));
  }, []);
  useEffect(() => {
    fetch(`${CCTV_API_BASE}/api/cctv/events/daily?date=${eventDate}`, {
      cache: "no-store",
    })
      .then((r) => r.json())
      .then(setDailyEvents)
      .catch(() =>
        setApiError("No fue posible consultar los eventos diarios."),
      );
  }, [eventDate]);
  useEffect(() => {
    let active=true;
    const normalizeSupport=(data)=>({...data,items:(data.items||[]).map(item=>({...item,image:item.image?{...item.image,url:`${CCTV_API_BASE}/api/cctv/support/${encodeURIComponent(item.id)}/image`}:null}))});
    const eventLabel={OPENING:'Apertura detectada',CLOSING:'Cierre detectado',ALARM:'Alarma local',LOCAL_ALARM:'Alarma local',CABLE_TRAP:'Cable trampa',TRIPWIRE:'Cruce de línea'};
    const poll=async()=>{
      const today=bogotaDateOffset(0);
      try{
        const [eventData,supportData]=await Promise.all([
          fetch(`${CCTV_API_BASE}/api/cctv/events/daily?date=${today}`,{cache:'no-store'}).then(r=>r.json()),
          fetch(`${CCTV_API_BASE}/api/cctv/support`,{cache:'no-store'}).then(r=>r.json()),
        ]);
        if(!active)return;
        const events=(eventData.items||[]).filter(item=>item.phase!=='FIN'&&!['MOTION','MOVIMIENTO','DISCARDED'].includes(item.eventType));
        const eventKey=item=>`${item.locationId||item.location||item.payload?.storeRaw||'UNKNOWN'}:${item.eventType}:${Math.floor(new Date(item.occurredAt||item.receivedAt).getTime()/300000)}`;
        if(!notificationState.current.eventsReady){
          events.forEach(item=>notificationState.current.eventIds.add(eventKey(item)));
          notificationState.current.eventsReady=true;
        }else{
          [...new Map(events.filter(item=>!notificationState.current.eventIds.has(eventKey(item))).map(item=>[eventKey(item),item])).values()].sort((a,b)=>new Date(a.receivedAt)-new Date(b.receivedAt)).slice(-4).forEach(item=>{
            notificationState.current.eventIds.add(eventKey(item));
            const identityPending=!item.locationId||item.payload?.identityStatus?.includes('PENDING');
            const important=identityPending||['ALARM','LOCAL_ALARM','CABLE_TRAP','TRIPWIRE'].includes(item.eventType);
            const method=important?'warning':item.eventType==='OPENING'?'success':'info';
            const time=new Intl.DateTimeFormat('es-CO',{timeZone:'America/Bogota',hour:'2-digit',minute:'2-digit'}).format(new Date(item.occurredAt||item.receivedAt));
            const title=identityPending?'Evento por conciliar':eventLabel[item.eventType]||'Nueva actividad CCTV',description=`${item.location||item.payload?.storeRaw||'Punto sin identificar'} · ${time}`,id=`EVENT:${eventKey(item)}`;
            addNotification({id,title,description,severity:important?'warning':'info',source:'Correo CCTV',targetTab:'events',createdAt:item.receivedAt||new Date().toISOString(),read:false,attended:false});
            if(notificationMode==='ALL'||(notificationMode==='PRIORITY'&&important))toast[method](title,{description,duration:important?9000:6000,action:{label:'Ver evento',onClick:()=>setTab('events')}});
          });
        }
        const normalizedSupport=normalizeSupport(supportData),supportItems=normalizedSupport.items||[];
        const supportKey=item=>`${item.id}:${item.status}:${item.updatedAt||item.dateLastActivity||item.operationalAt||''}`;
        if(!notificationState.current.supportReady){
          supportItems.forEach(item=>notificationState.current.supportKeys.add(supportKey(item)));
          notificationState.current.supportReady=true;
        }else{
          supportItems.filter(item=>!notificationState.current.supportKeys.has(supportKey(item))).slice(0,3).forEach(item=>{
            const key=supportKey(item);notificationState.current.supportKeys.add(key);
            const title=item.status==='COMPLETED'?'Actividad técnica completada':'Nueva actividad de soporte',description=item.location?`${item.title} · ${item.location}`:item.title;
            addNotification({id:`SUPPORT:${key}`,title,description,severity:item.status==='COMPLETED'?'info':'warning',source:'Trello',targetTab:'support',createdAt:item.updatedAt||item.dateLastActivity||item.operationalAt||new Date().toISOString(),read:false,attended:item.status==='COMPLETED'});
            if(notificationMode==='ALL'||(notificationMode==='PRIORITY'&&item.status!=='COMPLETED'))toast[item.status==='COMPLETED'?'success':'info'](title,{description,duration:7000,action:{label:'Ver soporte',onClick:()=>setTab('support')}});
          });
        }
        if(eventDate===today)setDailyEvents(eventData);
        setSupport(normalizedSupport);
      }catch{/* La salud de fuentes conserva el diagnóstico visible. */}
    };
    poll();
    const timer=window.setInterval(poll,60_000);
    return()=>{active=false;window.clearInterval(timer)};
  },[eventDate,notificationMode]);
  const points = useMemo(
    () =>
      inventory.filter(
        (p) =>
          `${p.name} ${p.code} ${p.zone}`
            .toLowerCase()
            .includes(search.toLowerCase()) &&
          (zone === "Todas" || p.zone === zone) &&
          (state === "Todos" || p.state === state),
      ),
    [inventory, search, zone, state],
  );
  const zones = overview?.zones || [];
  return (
    <div className="security-electronics-module h-full flex flex-col space-y-5 animate-in fade-in">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <Badge
            variant="outline"
            className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400 mr-2" />
            Datos canónicos conectados
          </Badge>
          <p className="text-sm text-muted-foreground mt-2">
            Infraestructura, cobertura y modelos obtenidos de CRM/SIIS, SQLite y
            DSS.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Snapshot generatedAt={overview?.generatedAt} />
          <ApiHealthIndicator health={apiHealth} checking={checkingApi} onCheck={checkApiHealth} />
          <Button variant="outline" size="sm" onClick={load} disabled={refreshing}>
            <RefreshCw size={14} className={`mr-2 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Actualizando…" : "Actualizar datos"}
          </Button>
        </div>
      </div>
      {(refreshing || initialCache) && <div className="flex items-center gap-2 text-[10px] text-slate-500"><span className={`h-1.5 w-1.5 rounded-full ${refreshing ? "animate-pulse bg-cyan-400" : "bg-emerald-400"}`} />{refreshing ? "Actualizando datos canónicos en segundo plano…" : "Mostrando la última captura mientras se verifica la información actual."}</div>}
      {apiError && (
        <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-sm text-rose-400">
          {apiError}
        </div>
      )}
      <Tabs
        value={tab}
        onValueChange={setTab}
        className="flex-1 flex flex-col min-h-0"
      >
        <div className="flex flex-col xl:flex-row gap-4 justify-between border-b pb-3">
          <TabsList className="bg-card border h-auto flex-wrap justify-start">
            <TabsTrigger value="operations">
              <Activity size={14} className="mr-1" />
              Centro operativo
            </TabsTrigger>
            <TabsTrigger value="inventory">
              <Boxes size={14} className="mr-1" />
              Inventario
            </TabsTrigger>
            <TabsTrigger value="visitors">
              <UsersRound size={14} className="mr-1" />
              Visitantes
            </TabsTrigger>
            <TabsTrigger value="events">
              <MonitorPlay size={14} className="mr-1" />
              Eventos diarios
            </TabsTrigger>
            <TabsTrigger value="alarms">
              <BellRing size={14} className="mr-1" />
              Alarmas
            </TabsTrigger>
            <TabsTrigger value="maintenance">
              <Wrench size={14} className="mr-1" />
              Mantenimiento
            </TabsTrigger>
            <TabsTrigger value="project">
              <Cctv size={15} className="mr-1" />
              Proyecto
            </TabsTrigger>
            <TabsTrigger value="support">
              <Activity size={14} className="mr-1" />
              Soporte
            </TabsTrigger>
          </TabsList>
          <div className="flex flex-wrap gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Punto, visitante, código o zona"
                className="pl-9 w-60"
              />
            </div>
            <select
              value={zone}
              onChange={(e) => setZone(e.target.value)}
              className="h-9 rounded-md border bg-background px-3 text-sm"
            >
              <option>Todas</option>
              {zones.map((z) => (
                <option key={z.name}>{z.name}</option>
              ))}
            </select>
            <select
              value={state}
              onChange={(e) => setState(e.target.value)}
              className="h-9 rounded-md border bg-background px-3 text-sm"
            >
              <option>Todos</option>
              <option value="online">Conciliados</option>
              <option value="attention">Por validar</option>
            </select>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto pt-5 pb-8">
          <TabsContent value="operations" className="mt-0">
            <RealOperations
              overview={overview}
              syncStatus={syncStatus}
              dailyEvents={dailyEvents}
              project={project}
              maintenance={maintenance}
              support={support}
              visitors={visitorSummary}
              quality={quality}
              onNavigate={setTab}
              notifications={notifications}
              notificationMode={notificationMode}
              onNotificationMode={changeNotificationMode}
              onNotificationRead={id=>markNotification(id,{read:true})}
              onNotificationAttend={id=>markNotification(id,{read:true,attended:true})}
              onNotificationsReadAll={markAllNotificationsRead}
            />
          </TabsContent>
          <TabsContent value="inventory" className="mt-0">
            <RealInventory overview={overview} points={points} technology={technology} quality={quality} onChanged={load} activeZone={zone} onZoneChange={setZone}/>
          </TabsContent>
          <TabsContent value="visitors" className="mt-0">
            <RealVisitors search={search} initialDate={bogotaDateOffset(-1)} />
          </TabsContent>
          <TabsContent value="events" className="mt-0">
            <RealEvents
              data={dailyEvents}
              date={eventDate}
              onDateChange={setEventDate}
              pointContext={pointContext}
              search={search}
            />
          </TabsContent>
          <TabsContent value="alarms" className="mt-0">
            <RealAlarms data={alarms} search={search} onChanged={load} />
          </TabsContent>
          <TabsContent value="maintenance" className="mt-0">
            <RealMaintenance maintenance={maintenance} onChanged={load} />
          </TabsContent>
          <TabsContent value="support" className="mt-0">
            <RealSupport support={support} />
          </TabsContent>
          <TabsContent value="project" className="mt-0">
            <RealProject
              project={project}
              support={support}
              onChanged={load}
              onRegister={(location) => {
                setInstallationTarget(location);
                setShowWizard(true);
              }}
            />
          </TabsContent>
        </div>
      </Tabs>
      {showWizard && (
        <InstallationWizard
          initialLocation={installationTarget}
          onClose={() => {
            setShowWizard(false);
            setInstallationTarget(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function Detail({ code }) {
  const p = snapshot.points.find((x) => x.code === code);
  if (!p)
    return (
      <div className="h-full grid place-items-center">
        <Button asChild>
          <Link to="/points/cctv">Volver</Link>
        </Button>
      </div>
    );
  return (
    <div className="h-full overflow-y-auto space-y-6">
      <Button asChild variant="ghost">
        <Link to="/points/cctv">
          <ArrowLeft size={16} className="mr-2" />
          Centro CCTV
        </Link>
      </Button>
      <section className="rounded-2xl border bg-gradient-to-br from-blue-500/10 via-card/60 to-card/30 p-6">
        <div className="flex flex-col lg:flex-row justify-between gap-5">
          <div>
            <div className="flex gap-2">
              <Badge variant="outline" className="font-mono">
                {p.code}
              </Badge>
              <Badge className={tone[p.state]}>{labels[p.state]}</Badge>
            </div>
            <h1 className="text-3xl font-black mt-3">{p.name}</h1>
            <p className="text-muted-foreground flex gap-2 mt-2">
              <MapPin size={15} />
              {p.zone} · {p.type}
            </p>
          </div>
          <Snapshot />
        </div>
      </section>
      <Tabs defaultValue="summary" className="space-y-5">
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="summary">Resumen</TabsTrigger>
          <TabsTrigger value="infra">Infraestructura</TabsTrigger>
          <TabsTrigger value="events">Eventos</TabsTrigger>
          <TabsTrigger value="maintenance">Mantenimiento</TabsTrigger>
          <TabsTrigger value="project">Proyecto</TabsTrigger>
        </TabsList>
        <TabsContent value="summary" className="grid lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Identidad operativa</CardTitle>
            </CardHeader>
            <CardContent className="grid sm:grid-cols-2 gap-3">
              <Fact label="Código SIIS" value={p.code} mono />
              <Fact label="Zona" value={p.zone} />
              <Fact label="Cobertura" value={p.coverage} />
              <Fact label="Evidencia" value={p.evidence} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Siguiente acción</CardTitle>
            </CardHeader>
            <CardContent>
              {p.action}
              <div className="flex flex-wrap gap-2 mt-4">
                {p.tech.map((t) => (
                  <Badge key={t} variant="secondary">
                    {t}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="infra">
          <Card>
            <CardContent className="p-6 grid sm:grid-cols-4 gap-3">
              <Fact label="Grabación" value={p.system} />
              <Fact label="Canales" value={p.channelDisplay || p.channels} />
              <Fact label="Dispositivos" value="1" />
              <Fact label="Gestión" value="DSS V8.5.0" />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="events">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex gap-2">
                <Radio size={17} />
                Trazabilidad
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Fact label="Último evento" value={p.event} />
              <p className="text-xs text-muted-foreground mt-4">
                La API agregará UID, fecha, fuente, clasificación y confianza.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="maintenance">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex gap-2">
                <Wrench size={17} />
                Mantenimiento
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Preparado para última visita, próxima programación, hallazgos,
              repuestos, responsable y evidencia.
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="project">
          <Card>
            <CardContent className="p-6">
              <Fact label="Modernización" value={p.project} />
              <p className="text-xs text-muted-foreground mt-4">
                El kit reutilizado cuenta y conserva su clasificación
                tecnológica.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
class CctvErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error("CCTV render error", error, info);
  }
  render() {
    if (this.state.error)
      return (
        <div className="m-6 rounded-2xl border border-rose-500/30 bg-card p-8">
          <h1 className="text-xl font-black text-rose-400">
            No fue posible renderizar Seguridad Electrónica
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {this.state.error.message}
          </p>
          <Button className="mt-5" onClick={() => window.location.reload()}>
            Reintentar
          </Button>
        </div>
      );
    return this.props.children;
  }
}
export default function CctvModule() {
  const { siisCode } = useParams();
  return (
    <CctvErrorBoundary>
      {siisCode ? <Detail code={siisCode} /> : <Overview />}
    </CctvErrorBoundary>
  );
}
