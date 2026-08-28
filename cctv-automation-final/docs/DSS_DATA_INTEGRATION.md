# Integración de datos DSS con CCTV Automation

## Fase 1: exportación controlada

La ruta inicial recomendada es exportar el inventario desde DSS Client sin incluir contraseñas de dispositivos.

Ruta documentada por Dahua para DSS Professional:

1. Ingresar al DSS Client con un usuario autorizado.
2. Abrir `Home > Basic Config > Device`.
3. Seleccionar todos los dispositivos o una muestra inicial.
4. Elegir `Export`.
5. No habilitar la exportación de contraseñas.
6. Proteger el archivo exportado y entregarlo al proyecto para estudiar su esquema.

El archivo debe conservarse como fuente de solo lectura. El importador deberá registrar su huella, fecha de exportación y versión DSS.

## Datos que interesa obtener

- Organización, zona y nombre del dispositivo.
- Identificador interno estable de DSS.
- Tipo de dispositivo: NVR, DVR, IPC, MVR, ANPR, alarma u otro.
- Modelo, serial, firmware y estado en línea.
- Dirección IP, puerto y protocolo de incorporación.
- Canales, nombres de canales y estado individual.
- Capacidades inteligentes: SMD, rostro, ANPR, AcuPick y metadatos.
- Tipo y ubicación de almacenamiento, incluyendo microSD.
- Entradas y salidas de alarma.
- Última comunicación y eventos de conexión/desconexión.

## Fase 2: integración API

Dahua publica que DSS Professional dispone de API/SDK para terceros mediante DSS Integration Platform. La API permite consultar organizaciones, dispositivos y canales; suscribirse a estados en línea/fuera de línea; consultar grabaciones; recibir alarmas; y acceder a eventos inteligentes como ANPR y reconocimiento facial.

El acceso formal requiere registro en el portal de desarrolladores de Dahua, aceptación de NDA, descarga de la guía API y obtención de una licencia o clave de desarrollo. Antes de solicitarla se debe confirmar con el integrador/proveedor si el servidor DSS7116S V8.5.0 tiene habilitado el componente y licencia de integración.

## Estrategia recomendada

1. Hacer primero una exportación de dispositivos sin credenciales.
2. Comparar el inventario DSS con `Dispositivos` y `Ubicaciones`.
3. Definir qué identificador DSS es estable antes de agregarlo al maestro.
4. Probar la API en modo lectura con una cuenta de mínimo privilegio.
5. Sincronizar inventario y estado; no controlar cámaras ni modificar DSS en la primera etapa.
6. Incorporar después eventos, salud, almacenamiento y capacidades inteligentes.

## Seguridad

- Nunca exportar ni almacenar contraseñas de dispositivos en Excel.
- No usar cuentas administrativas para el servicio de sincronización.
- Mantener secretos fuera del frontend y del repositorio.
- Limitar el acceso de red del conector a los servicios DSS necesarios.
- Registrar auditoría de cada sincronización y cambio de dato canónico.
