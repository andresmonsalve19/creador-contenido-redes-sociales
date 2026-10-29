# Creador de contenido para redes sociales

Aplicación web que genera publicaciones de Instagram con inteligencia artificial respetando la
identidad de una empresa: qué hace, cómo se ve (colores, tipografías, estilo) y su logo. Escribes
una temática (o la pides a la IA) y la plataforma crea los prompts, las imágenes y el texto de la
publicación, listos para descargar y publicar. También crea **reels con avatar** (video) usando
HeyGen, con el guion escrito por la IA según la marca.

- **Frontend:** React 19 + TypeScript + Vite
- **Backend:** Node.js + Express 5 + TypeScript
- **IA:** Google Gemini (texto e imágenes) y HeyGen (video con avatar, opcional)

---

## Contenido

1. [¿Para qué sirve?](#para-qué-sirve)
2. [Características](#características)
3. [Cómo funciona](#cómo-funciona)
4. [Requisitos técnicos](#requisitos-técnicos)
5. [Instalación paso a paso](#instalación-paso-a-paso)
6. [Archivos de marca](#archivos-de-marca)
7. [Guía de uso](#guía-de-uso)
8. [Reels con HeyGen](#reels-con-heygen)
   - [Mis contenidos, kit de marca y edición de imágenes](#mis-contenidos-kit-de-marca-y-edición-de-imágenes)
   - [Claude Desktop como director (piloto)](#claude-desktop-como-director-piloto)
9. [Variables de entorno](#variables-de-entorno)
10. [Scripts disponibles](#scripts-disponibles)
11. [Arquitectura](#arquitectura)
12. [Cómo se generan los prompts](#cómo-se-generan-los-prompts)
13. [API del servidor](#api-del-servidor)
14. [Modelos y costos](#modelos-y-costos)
15. [Seguridad y privacidad](#seguridad-y-privacidad)
16. [Cómo extender el proyecto](#cómo-extender-el-proyecto)
17. [Calidad del código](#calidad-del-código)
18. [Solución de problemas](#solución-de-problemas)
19. [Hoja de ruta](#hoja-de-ruta)

---

## ¿Para qué sirve?

Mantener un calendario de contenido en redes sociales cuesta tiempo: pensar la idea, diseñar cada
pieza, escribir el texto y cuidar que todo se vea como la marca. Esta herramienta automatiza ese
proceso:

- Convierte una idea en **una imagen o un carrusel** de hasta 10 imágenes, con la paleta, la
  tipografía y el logo de la empresa.
- Escribe el **texto de la publicación** con emojis, saltos de línea, llamado a la acción, datos de
  contacto y hashtags.
- Aprende de tus correcciones: los comentarios que dejas se guardan como reglas y se aplican a las
  próximas publicaciones.

Está pensada para equipos de marketing, agencias y emprendedores que publican con frecuencia y
quieren consistencia visual sin diseñar cada pieza desde cero.

## Características

- **Configuración inicial guiada:** la primera vez pide la API key y los archivos de marca. La key
  se valida con Google y se guarda en `.env`.
- **Contexto de marca persistente:** información de la empresa (Markdown), lineamientos de diseño
  (Markdown) y logo. Se cargan una vez y se pueden reemplazar cuando quieras.
- **Selección de modelos con precio:** modelo de texto y modelo de imagen, con el precio de cada uno
  y el de mejor relación calidad/precio preseleccionado.
- **Imagen única o carrusel (2 a 10 imágenes):** la primera es el gancho, las intermedias
  desarrollan la idea con más detalle y la última es el llamado a la acción con el correo y el sitio
  web.
- **Cinco proporciones:** 4:5, 1:1, 3:4, 9:16 y 16:9.
- **Llamado a la acción elegible:** lista de 17 opciones ("Más información", "Contáctanos",
  "Solicita tu diagnóstico"…) o una frase propia.
- **Pie de página en cada imagen** con el correo y el sitio web que escribas en el paso 2 (por
  ejemplo `contacto@empresa-ejemplo.com` y `www.empresa-ejemplo.com`). Se recuerdan en el navegador
  para las próximas publicaciones.
- **Sugerencias de temática con IA**, según lo que hace la empresa.
- **Prompts revisables:** puedes editar cada prompt antes de generar.
- **Ajustes por imagen:** en cada tarjeta puedes dejar comentarios y regenerar la imagen con esos
  cambios, o reescribir su prompt y regenerarla.
- **Aprendizaje continuo:** los comentarios se convierten con IA en reglas claras guardadas en
  `learning.md`, que se consulta antes de cada generación.
- **Descarga:** cada imagen por separado o todo el conjunto en un ZIP, más el texto listo para copiar.
- **Responsive:** se usa en móvil, tableta y escritorio (menú de hamburguesa en móvil), con modo
  claro y oscuro automático.

## Cómo funciona

### Flujo de uso

```
Primer ingreso            Cada publicación
──────────────            ────────────────────────────────────────────────────────────
1. API key de Gemini  ──▶  1. Tipo de publicación (post en el feed; reel próximamente)
2. Archivos de marca       2. Configuraciones iniciales: modelos, llamado a la acción, contacto
   (empresa.md,            3. Formato y temática: imagen/carrusel, proporción, temática
   lineamientos.md, logo)  4. Prompts e imágenes: revisar prompts → Generar → ajustar → descargar
```

### Flujo de datos

```
┌───────────────────┐   /api    ┌──────────────────────────┐        ┌──────────────┐
│ Navegador (React) │ ────────▶ │ Servidor Express         │ ─────▶ │ Gemini API   │
│  - formularios    │ ◀──────── │  - valida y arma prompts │ ◀───── │ texto+imagen │
│  - galería        │           │  - llama a la IA         │        └──────────────┘
└───────────────────┘           └───────────┬──────────────┘
                                            │
                          .env  ◀───────────┤  credenciales (la key nunca llega al navegador)
                          server/data/brand/ ◀┘  company.md · design.md · logo · learning.md
```

El navegador **nunca** habla directo con Gemini: todas las llamadas pasan por el servidor, que es
quien conoce la API key.

### Qué pasa al generar

1. El servidor lee la información de la empresa, los lineamientos, el logo y los aprendizajes
   guardados.
2. Pide al **modelo de texto** un prompt completo por imagen (más el texto de la publicación y los
   hashtags) en formato JSON validado.
3. Tú revisas y editas los prompts.
4. Al pulsar **Generar**, el servidor pide cada imagen al **modelo de imagen**, enviando el logo como
   imagen de referencia. En un carrusel, la primera imagen se usa como referencia de estilo para las
   siguientes, de modo que todas se vean como una misma serie.
5. Las imágenes aparecen una a una; puedes ajustarlas, regenerarlas y descargarlas.

## Requisitos técnicos

| Requisito          | Detalle                                                                                  |
| ------------------ | ---------------------------------------------------------------------------------------- |
| **Node.js**        | 20.19 o superior (se probó con 24). Descarga: <https://nodejs.org>                       |
| **npm**            | 10 o superior (incluido con Node). Se usan _npm workspaces_.                             |
| **Git**            | Para clonar el repositorio.                                                              |
| **API key Gemini** | Se obtiene en <https://aistudio.google.com/apikey>. Los modelos de imagen pueden requerir facturación activa en tu proyecto de Google. |
| **Navegador**      | Versión reciente de Chrome, Edge, Firefox o Safari.                                      |
| **Puertos libres** | `5173` (interfaz en desarrollo) y `3001` (API).                                          |
| **Sistema**        | Windows, macOS o Linux.                                                                  |

## Instalación paso a paso

### Opción rápida en Windows: doble clic (sin saber programar)

1. Copia la carpeta del proyecto al equipo **sin** `node_modules`, `server/data` ni `.env` (esos
   tienen datos de la marca y claves: no se comparten).
2. Haz doble clic en **`iniciar.bat`**. La primera vez:
   - descarga Node.js portátil desde nodejs.org (v24 LTS), verifica su firma SHA-256 y lo guarda en
     `herramientas\node` (no instala nada en Windows ni pide permisos de administrador);
   - instala los componentes y prepara la aplicación (unos minutos, necesita internet).
3. Se abre el navegador en `http://127.0.0.1:3001`. Mientras uses la app, deja abierta la ventana
   negra; para cerrar la app, cierra esa ventana.
4. Las siguientes veces arranca directo. Si la app ya estaba abierta, `iniciar.bat` solo la muestra
   en el navegador.
5. Si recibes una versión nueva del proyecto, ejecuta **`actualizar.bat`** (no borra tus datos ni
   tus claves).

Requisitos: Windows 10 u 11 de 64 bits, internet la primera vez y PowerShell (viene con Windows).
Si Windows muestra "Windows protegió su PC" o el archivo vino en un ZIP descargado, haz clic derecho
→ Propiedades → **Desbloquear**. En equipos corporativos, una política de TI puede impedir ejecutar
scripts de PowerShell; en ese caso, pide a TI que lo habilite.

### 1. Clonar el repositorio

```bash
git clone https://github.com/andresmonsalve19/creador-contenido-redes-sociales.git
cd creador-contenido-redes-sociales
```

### 2. Instalar dependencias

Un solo comando instala las del cliente y las del servidor:

```bash
npm install
```

### 3. Obtener la API key de Gemini

1. Entra a <https://aistudio.google.com/apikey> con tu cuenta de Google.
2. Crea una API key y cópiala.

### 4. (Opcional) Crear el archivo `.env`

Puedes saltarte este paso: la aplicación te pedirá la key en su primera pantalla y la guardará por
ti. Si prefieres hacerlo a mano:

```bash
# macOS / Linux / Git Bash
cp .env.example .env

# Windows (PowerShell)
Copy-Item .env.example .env
```

Abre `.env` y pega la key:

```env
GEMINI_API_KEY=tu_api_key_aqui
```

> El archivo `.env` está en `.gitignore`: nunca se sube al repositorio. No pongas credenciales en el
> código.

### 5. Iniciar en modo desarrollo

```bash
npm run dev
```

Esto levanta el servidor (`http://127.0.0.1:3001`) y la interfaz (`http://localhost:5173`) a la vez,
con recarga automática.

### 6. Abrir la aplicación

Entra a **<http://localhost:5173>**. Como es la primera vez, te llevará a la pantalla de
configuración:

1. **Credenciales:** pega tu API key. Se valida con Google; si es correcta se guarda en `.env`.
2. **Marca:** sube los tres archivos (ver [Archivos de marca](#archivos-de-marca)).

Al terminar verás el menú **Inicio** y **Crear contenido**.

### 7. Ejecutar en modo producción (opcional)

```bash
npm run build   # compila servidor y cliente
npm start       # sirve todo en http://127.0.0.1:3001
```

En producción el mismo servidor entrega la interfaz compilada, así que solo necesitas un puerto. Para
que use el modo de producción, define `NODE_ENV=production` antes de `npm start`:

```bash
# macOS / Linux / Git Bash
NODE_ENV=production npm start

# Windows (PowerShell)
$env:NODE_ENV = 'production'; npm start
```

## Archivos de marca

La calidad de las piezas depende de qué tan bien describas la marca. Necesitas tres archivos.

### 1. Información de la empresa (`.md`, hasta 300 KB)

Qué hace la empresa y a quién le habla. Ejemplo de estructura:

```markdown
# Nombre de la empresa

## A qué nos dedicamos
Descripción breve del negocio.

## Servicios
- Servicio 1: qué incluye y para quién
- Servicio 2: …

## Público objetivo
Quiénes son y qué problemas tienen.

## Tono de voz
Cercano, profesional, con ejemplos concretos…

## Diferenciales
…
```

### 2. Lineamientos de diseño (`.md`, hasta 300 KB)

Cómo debe verse todo. Incluye colores **con código HEX**, tipografías y estilo:

```markdown
# Guía de estilo

## Colores
- Primario: #0F2A5F (azul profundo) – fondos y titulares
- Acento: #E8336D – botones y detalles
- Neutro claro: #F5F6F8 – fondos de apoyo

## Tipografía
- Titulares: sans serif geométrica, peso bold
- Texto: sans serif legible, peso regular

## Estilo visual
Fotografía editorial luminosa, ilustraciones planas, mucho espacio en blanco…

## Qué evitar
Degradados saturados, stock genérico…
```

### 3. Logo (PNG, JPG o WebP, hasta 5 MB)

Idealmente con fondo transparente (PNG) y buena resolución. Se envía como imagen de referencia a la
IA en cada generación.

### 4. Lineamientos de video (`.md`, opcional, hasta 300 KB)

Cómo deben ser los reels de la empresa. Se sube como cuarta tarjeta (opcional) en **Carga tu marca**
y se reemplaza desde **Inicio → Actualizar marca**. En esa misma pantalla puedes **descargar la
plantilla** genérica ([`plantillas/lineamientos-video.md`](plantillas/lineamientos-video.md)), con
estas secciones: estilo de los videos, estructura del guion, forma de hablar a cámara, frases y
palabras (obligatorias, preferidas y prohibidas), presentador o avatar, fondos, subtítulos, música,
llamado a la acción y temas que nunca se tratan. Si no lo subes, los reels usan los lineamientos de
diseño.

Los archivos quedan guardados en `server/data/brand/` y puedes reemplazarlos cuando quieras desde
**Inicio → Actualizar marca**.

## Guía de uso

1. **Tipo de publicación:** elige _Post en el feed_ o _Reel_ (ver [Reels con HeyGen](#reels-con-heygen)).
2. **Configuraciones iniciales:**
   - Modelo de texto y modelo de imagen (uno al lado del otro; apilados en móvil), con su precio.
   - **Llamado a la acción:** elige uno de la lista o escribe el tuyo.
   - **Datos de contacto:** correo, sitio web y WhatsApp (con indicativo, p. ej.
     `+57 300 000 0000`). Cada uno tiene la casilla **Incluir en esta publicación**: solo los
     marcados y con valor van en el pie de las imágenes, en el cierre de los reels y en el texto de
     la publicación (`📩`, `🌐`, `💬 WhatsApp`), que el servidor agrega exactos antes de los
     hashtags. Los tres se guardan en el navegador para la próxima vez, aunque estén desmarcados.
3. **Formato y temática:**
   - Imagen única o carrusel (con la cantidad de imágenes).
   - Proporción: 4:5, 1:1, 3:4, 9:16 o 16:9.
   - Temática escrita por ti o con el botón **Sugerir con IA**.
4. **Prompts e imágenes:**
   - Revisa y edita los prompts, y el texto de la publicación. Puedes **Reescribir prompts**.
   - Pulsa **Generar**. Verás el costo estimado antes de hacerlo.
   - En cada imagen: **Descargar**, **Regenerar**, o escribe comentarios y usa **Regenerar con
     comentarios** (edita la imagen actual) o **Reescribir prompt y regenerar**.
   - **Descargar todas** crea un ZIP con el conjunto.
   - Al final, el campo **Comentarios y sugerencias** guarda lo aprendido para futuras
     publicaciones. Puedes ver y eliminar esas reglas desde ahí.

## Reels con HeyGen

El módulo de reels sigue los mismos pasos que el de imágenes. Es **opcional**: sin la key de HeyGen,
las imágenes funcionan igual y Reels muestra "Configura HeyGen para usar este módulo".

### Configuración

1. Crea una API key en <https://app.heygen.com/developers/api> (usa la cuenta corporativa aprobada).
   La API de HeyGen es de prepago: necesitas saldo en la billetera de la cuenta.
2. En **Actualizar marca → Credenciales**, pega la key en "API key de HeyGen (opcional)". Se valida
   con una consulta de solo lectura (`GET /v3/users/me`) y se guarda en `.env`.
3. Comprueba la conexión sin gastar saldo: `npm run probar:heygen` (solo lista avatares).
4. En **Actualizar marca → Video** define la configuración técnica:
   - Avatar por defecto y avatares favoritos (se eligen de la lista de HeyGen, con vista previa).
   - Idioma, voz por defecto (con muestra de audio) y velocidad.
   - Fondo por defecto: el original del avatar, un color de la marca, una imagen subida o una
     imagen generada con IA en cada reel.
   - Subtítulos, formato (9:16, 4:5, 1:1 o 16:9) y duración por defecto.
   - **Reglas de cumplimiento** (opcional): tienen prioridad sobre todo lo demás.
   - **Autorización de imagen:** los avatares que pueden representar a una persona real (digital
     twin o photo avatar) exigen marcar "Cuento con autorización escrita de esta persona para usar
     su imagen y voz", con nombre y fecha. Sin ella, el servidor rechaza ese avatar. HeyGen exige
     además su propio consentimiento para los digital twins.

### Flujo

1. **Tipo de publicación:** Reel.
2. **Configuraciones iniciales:** modelo de texto para el guion, uno o varios avatares, voz,
   llamado a la acción y datos de contacto (precargados con los últimos usados).
3. **Formato y temática:** duración (15, 30, 45 o 60 s), proporción, número de escenas (1 a 5),
   modo de avatar (el mismo en todas o distinto por escena), fondo, subtítulos y temática (escrita
   o con **Sugerir con IA**).
4. **Guion y video:**
   - La IA escribe un guion por escena: gancho en los primeros 3 segundos, desarrollo y cierre con
     el llamado a la acción, más el texto de la publicación con hashtags (el contacto lo agrega el
     servidor). Todo es editable: texto hablado, indicaciones de subtítulo, avatar y voz por escena.
   - Duración estimada por escena (2,5 palabras por segundo, ajustable) y alerta si el guion se
     pasa de la duración elegida.
   - Si algo de la temática, los lineamientos o los aprendizajes contradice las reglas de
     cumplimiento, gana el cumplimiento y la pantalla avisa qué se ignoró.
   - Si el fondo es "generado", se crea con Nano Banana (Gemini), sin texto ni personas.
   - **Aprobación:** duración estimada, saldo de HeyGen y aviso de que el contenido se envía a
     HeyGen y a Google. **Nada se envía a HeyGen sin marcar la confirmación y pulsar "Generar
     video".**
   - **Progreso:** pendiente, procesando, completado o error, en vivo. Puedes salir de la página: el
     servidor sigue el render y lo deja en "Reels anteriores".
   - **Resultado:** reproductor, **Descargar MP4**, **Copiar texto**, **Duplicar** (mismo guion para
     cambiar avatar, voz, fondo o texto) y **Ajustar con comentarios** (reescribe el guion y pide
     una nueva aprobación).

### Estilo del video

En **Formato y temática** eliges el estilo:

- **Edición HeyGen (como en la web)** (por defecto): usa el **Video Agent** de HeyGen
  (`POST /v3/video-agents`), el mismo que arma los videos en la web: tomas distintas, gráficos y
  textos animados, imágenes, música suave y transiciones.
  - Gemini escribe el guion con tus reglas en el formato que pide la guía de HeyGen: cada escena
    con tiempos, **indicación de toma**, **texto en pantalla** (el gancho en grande en la primera)
    y el texto hablado exacto, más un **párrafo de estilo** (paleta HEX, tipografías, movimiento,
    música, reglas de marca). Todo es editable.
  - Puedes elegir un **kit de marca** de HeyGen (colores, fuentes y logo). Sin kit, se adjunta tu
    logo real. La app avisa si eliges el kit de ejemplo de HeyGen.
  - **Crear el kit por API** (Actualizar marca → Video → "Crear kit de marca desde tu sitio web"):
    HeyGen importa el sitio público (`POST /v3/brand-kits`), la app espera a que termine, propone
    los colores exactos de tus lineamientos por rol (principal, secundario, terciario, acento), te
    deja elegir el logo principal entre los importados y guarda con `PATCH /v3/brand-kits/{id}`.
    La API no permite subir un logo ni fuentes propias: eso se completa en la web de HeyGen.
  - Antes de enviar puedes ver **exactamente el prompt** que recibirá HeyGen.
  - Se envía en modo revisión (`mode: "chat"`): HeyGen prepara un **storyboard** y la app lo
    muestra con el mensaje del agente. Puedes **pedir cambios** o **aprobar y generar** (con
    confirmación). El video se renderiza solo después de aprobar.
  - HeyGen no publica el precio del Video Agent por API ni si el storyboard consume créditos:
    revísalo en tu panel después de la primera prueba.
  - **Logo:** en la configuración de video eliges su posición y tamaño (por defecto, arriba a la
    derecha y mediano). El prompt lo exige en **todas** las escenas, igual en cada una, por encima
    de cualquier otra instrucción sobre el logo.
  - **Editar escenas** (video terminado, también desde "Reels anteriores"): la app lee las
    escenas en HeyGen y envía cada cambio **una vez por cada escena marcada** (`edit_plan` de
    "Edit Scenes"). Las demás quedan exactamente igual. Si una escena ya no existe, HeyGen rechaza
    todo el pedido. Genera un video nuevo (consume saldo) que reemplaza al MP4 local; el anterior
    sigue en la cuenta de HeyGen.

- **Simple:** solo el presentador hablando a cámara.
- **Escenas compuestas por la app**:
  - **Imágenes de apoyo:** con 3 o más escenas, las del medio se alternan con imágenes a pantalla
    completa mientras la misma voz sigue narrando (b-roll). Gemini describe cada imagen y Nano
    Banana la genera con la paleta de la marca, sin texto ni logos. Se revisan y regeneran antes de
    aprobar.
  - **Tarjetas de marca:** apertura con el logo (2 s) y cierre con el logo, el llamado a la acción,
    el sitio web y el correo (3 s). Las compone la app con `sharp`: el logo real sin alterar y los
    textos exactos, sobre el color de la marca (el de la configuración de video o el primer HEX de
    los lineamientos). Su tiempo se descuenta del guion hablado.
  - **Tomas variadas** (opcional): si el avatar de stock tiene otros looks en su grupo (otra pose o
    vestuario), cada vez que vuelve a aparecer usa uno distinto.
  - **Gestos:** cada escena del presentador trae gestos sugeridos; se envían como `motion_prompt`
    solo si el avatar los admite (photo avatars con Avatar IV, o avatares de video con Avatar V).

**Gemelo digital (Configuración → Video → "Tu propio avatar"):** sube un video de una persona real
(MP4 o WebM, de 15 s a 10 min y hasta 200 MB; lo ideal son unos 2 min en 1080p). La app lo sube a
HeyGen en tres pasos (subida directa), crea el avatar (`POST /v3/avatars`, `digital_twin`) y guarda
la autorización escrita de la persona. HeyGen clona su voz de la misma grabación. Después, la app
genera el enlace de consentimiento (válido 24 h), que la persona abre para grabar una frase corta
con la cámara. Cuando el entrenamiento y el consentimiento terminan, el avatar aparece en la lista
con su voz clonada como voz original. Los avatares creados se registran en
`server/data/brand/digital-twins.json`.

Solo se usan motores de calidad. Según `supported_api_engines`, la app elige Avatar V si el avatar lo
admite y, si no, Avatar IV, siempre en 1080p. Los avatares que solo admiten Avatar III no aparecen en
la app, y el servidor rechaza crear un video con ellos. En el modo Video Agent la API no permite fijar
el motor: el prompt le pide Avatar V o IV al agente, pero HeyGen no confirma cuál usó.

Orden de prioridad al escribir guiones: 1) reglas de cumplimiento, 2) `lineamientos-video.md`,
3) `empresa.md` y lineamientos de diseño, 4) reglas aprendidas de video o generales, 5) temática.
Todo ese contenido va delimitado en el prompt como datos, nunca como instrucciones.

### Cómo funciona por dentro

- API v3 de HeyGen: un video multiescena (`POST /v3/videos` con `type: "studio"`), estado con
  `GET /v3/videos/{id}`, avatares con `GET /v3/avatars/looks`, voces con `GET /v3/voices`, fondos
  de imagen subidos con `POST /v3/assets` y saldo con `GET /v3/users/me`.
- **Sin webhooks** (la app es local): el servidor consulta el estado cada 5 s, 10 s, 20 s y luego
  cada 30 s, hasta `HEYGEN_POLL_TIMEOUT_MIN` minutos.
- **Descarga inmediata** al completar (las URLs de HeyGen expiran) a
  `server/data/reels/<AAAA-MM>/<fecha>-<titulo>-<id>.mp4`.
- **Historial** en `server/data/reels/history.json` con la especificación completa de cada video
  (guion, avatares, voz, fondo, formato, id del proveedor, estado y archivo). Es lo que permite
  duplicar.
- **Reintentos seguros:** solo se reintentan los errores reintentables (límite de tasa, caídas). La
  creación usa la cabecera `Idempotency-Key`, y un render que ya existe nunca se vuelve a crear.
- **Concurrencia:** máximo 2 renders a la vez; el resto espera en cola. Si el servidor se reinicia,
  retoma los renders en curso.
- Las reglas aprendidas tienen categoría (imagen, video o general) y cada módulo usa solo las suyas
  y las generales.

### Costos

HeyGen cobra la API por segundo de video según el motor y el tipo de avatar, pero **no publica esas
tarifas en su documentación** (solo en el panel de la API, con sesión iniciada). Por eso la app no
estima el costo en dólares: antes de generar muestra la duración estimada y el **saldo** de la
cuenta. Consulta la tarifa vigente en tu panel de HeyGen. Para la primera prueba, usa un avatar de
stock, 15 segundos y una sola escena.

## Mis contenidos, kit de marca y edición de imágenes

- **Mis contenidos** (menú superior): todo queda guardado automáticamente en
  `server/data/library/`, aunque no lo descargues. Cada imagen se guarda en cuanto se genera, y un
  ajuste reemplaza la versión anterior. Tiene tres pestañas:
  - **Imágenes:** imágenes únicas, carruseles y ediciones, con descarga (ZIP en carruseles),
    copiar texto, editar y borrar. **Importar imágenes** suma lo que ya tenías descargado (hasta 20
    a la vez).
  - **Reels de la app:** los reels terminados.
  - **Videos en HeyGen:** los videos de la cuenta, también los hechos en su web. Sus enlaces son
    temporales.
- **Kit de marca** (Configuración, paso 3):
  - **Logo y colores:** se muestran tal como salen de los archivos de marca.
  - **Slogans, frases e indicaciones de identidad:** se envían como regla obligatoria y textual a
    los prompts de imágenes, a los guiones de reels y a las sugerencias de temas.
  - **Logos de asociaciones:** se usan en todas las piezas o solo en el cierre. En las imágenes,
    Gemini los recibe como referencia; en los reels, la app los compone exactos en la tarjeta de
    cierre (estilo dinámico) y los adjunta al agente de HeyGen.
  - **Kit de HeyGen y ubicación del logo.**

  Se guarda en `server/data/brand/identity.json` y los logos en `server/data/brand/partners/`.
- **Editar una imagen tuya** (Crear contenido): subes una imagen, o eliges una de Mis contenidos,
  y escribes qué cambiar. Opcionalmente se aplica la marca (logo, paleta, slogans). Puedes elegir
  el formato y seguir ajustando el último resultado. La IA vuelve a generar la imagen, así que
  puede cambiar detalles pequeños. Con fotos de pacientes: solo con consentimiento, sin datos que
  los identifiquen y nunca para alterar resultados.

## Claude Desktop como director (piloto)

La app incluye un servidor MCP (`server/src/mcp/index.ts`) para que Claude Desktop la use como
herramienta: Claude decide y escribe, y la app ejecuta con Gemini. Habla con la app abierta por
HTTP local (`127.0.0.1:3001`), así las API keys nunca pasan por Claude. Todo lo que crea queda en
Mis contenidos con origen "Creada con Claude".

| Herramienta | Qué hace |
| --- | --- |
| `leer_marca` | Empresa, lineamientos de diseño y video, slogans, identidad, asociaciones y reglas de cumplimiento. |
| `crear_imagen` | Una imagen con la dirección de arte que escribe Claude, con el logo real. |
| `crear_publicacion` | El flujo completo de la app a partir de un tema (hasta 5 imágenes en el piloto). |
| `editar_imagen` | Edita una imagen de la biblioteca; el resultado es una pieza nueva. |
| `ver_biblioteca` / `ver_imagen` | Lista y muestra lo guardado. |
| `leer_archivo_marca` | Contenido exacto de empresa, diseño o video. |
| `actualizar_archivo_marca` | Reemplaza un archivo de marca por una versión mejorada (Claude muestra los cambios y pide confirmación). |
| `actualizar_identidad` | Reemplaza slogans, frases e indicaciones de tono. |
| `ver_versiones_marca` / `ver_version_marca` / `restaurar_version_marca` | Historial: antes de cada cambio se guarda una copia (20 por archivo) y se puede volver a ella. |
| `crear_video` | Reel con el Video Agent de HeyGen: Claude escribe el guion escena por escena y el estilo; la app agrega las reglas de la marca (logo fijo, asociaciones, cumplimiento, zonas seguras, Avatar V/IV, kit de HeyGen). Prepara primero el storyboard. |
| `ver_video` / `responder_agente_video` | Storyboard y mensajes del agente; pedirle cambios o aprobar (solo aprobar genera y cobra). |
| `editar_escenas_video` | Cambios solo en algunas escenas de un reel terminado, o en todas. |
| `listar_videos` / `listar_avatares` / `listar_voces` | Reels, avatares (los propios primero, con su voz original) y voces en español. |
| `ver_looks_avatar` | Otros looks (ropa, pose, fondo) de un avatar, con vista previa. |
| `cambiar_ropa_avatar` / `estado_look` | Ropa nueva para un avatar **propio** (gemelo digital o de foto): HeyGen crea otro look de la misma persona. La autorización de imagen se copia al look nuevo. Los avatares de stock no se pueden vestir distinto: solo se elige otro de sus looks. |

**Historial de la marca:** cualquier cambio a los archivos de marca o a la identidad, desde la app
o desde Claude, guarda antes una copia en `server/data/brand/history/`. Así nada se pierde aunque
Claude o alguien del equipo reemplace un archivo.

**Opción recomendada: extensión de Claude Desktop (`.mcpb`).**
1. Genera el paquete con `npm run mcpb`. Crea `creador-de-contenido.mcpb` en la raíz del
   proyecto: un solo archivo JavaScript, sin `node_modules` ni componentes nativos, que funciona
   en Windows y macOS.
2. En Claude Desktop, ve a **Configuración → Extensiones** y arrastra el archivo, o haz doble clic
   en él. Claude Desktop lo ejecuta con su propio Node, sin el Node portátil.
3. Deja la app abierta con `iniciar.bat`. Si la app usa otra dirección, cámbiala en la
   configuración de la extensión ("Dirección de la app").

En cuentas de empresa, el administrador puede tener que permitir la extensión (lista de
extensiones permitidas). Si antes usaste `conectar-claude.bat`, ejecuta
`quitar-conexion-claude.bat` para que las herramientas no aparezcan dos veces.

Las vistas previas que recibe Claude las reduce la app (`/api/library/:id/:n?preview=768`), así
que el servidor MCP no necesita `sharp`.

**Alternativa: conexión manual en Windows.**
1. Abre `iniciar.bat` una vez, para que se prepare la app.
2. Doble clic en `conectar-claude.bat`. Registra el servidor en la configuración de Claude Desktop
   (`%APPDATA%\Claude\claude_desktop_config.json`, y la de la versión de la Microsoft Store si
   existe), con una copia de seguridad.
3. Cierra Claude Desktop por completo y vuelve a abrirlo.
4. Deja la app abierta con `iniciar.bat` mientras uses Claude.

Claude Desktop pide permiso antes de usar cada herramienta. Generar imágenes consume saldo de
Gemini. Usa la cuenta corporativa de Claude: el administrador puede tener que permitir los
servidores MCP.

## Variables de entorno

Se definen en `.env` (raíz del proyecto). Ver [.env.example](.env.example).

| Variable         | Obligatoria | Por defecto | Descripción                                                  |
| ---------------- | :---------: | ----------- | ------------------------------------------------------------ |
| `GEMINI_API_KEY` |     Sí      | —           | API key de Google Gemini. También se puede cargar desde la app. |
| `HEYGEN_API_KEY` |     No      | —           | API key de HeyGen. Habilita los reels. También se puede cargar desde la app. |
| `HEYGEN_POLL_TIMEOUT_MIN` | No | `30`       | Minutos máximos esperando a que HeyGen termine un video.     |
| `PORT`           |     No      | `3001`      | Puerto del servidor.                                         |
| `HOST`           |     No      | `127.0.0.1` | Dirección en la que escucha el servidor.                     |
| `NODE_ENV`       |     No      | `development` | Usa `production` para servir el cliente compilado.         |

## Scripts disponibles

Se ejecutan desde la raíz del proyecto.

| Comando             | Qué hace                                                      |
| ------------------- | ------------------------------------------------------------- |
| `npm run dev`       | Servidor y cliente en modo desarrollo con recarga automática. |
| `npm run build`     | Compila el servidor (`server/dist`) y el cliente (`client/dist`). |
| `npm start`         | Inicia el servidor compilado.                                 |
| `npm run typecheck` | Verifica los tipos de TypeScript en cliente y servidor.       |
| `npm run lint`      | Ejecuta ESLint (incluye la regla de arquitectura modular).    |
| `npm test`          | Pruebas del servidor con respuestas simuladas de HeyGen (no usan la key ni gastan saldo). |
| `npm run probar:heygen` | Verifica la conexión con HeyGen listando avatares (solo lectura). |
| `iniciar.bat` (Windows) | Prepara todo la primera vez (Node portátil, componentes, compilación) y abre la app. |
| `actualizar.bat` (Windows) | Reinstala componentes y vuelve a compilar tras recibir una versión nueva. |
| `npm run mcpb`      | Empaqueta el servidor MCP como extensión de Claude Desktop (`creador-de-contenido.mcpb`). |
| `quitar-conexion-claude.bat` (Windows) | Quita la conexión manual con Claude Desktop (por ejemplo, al pasar a la extensión). |
| `conectar-claude.bat` (Windows) | Registra la app como servidor MCP en Claude Desktop (con copia de seguridad de su configuración). |
| `npm run format`    | Da formato al código con Prettier.                            |

## Arquitectura

Monorepo con **npm workspaces**: `client` (interfaz) y `server` (API). Ambos se organizan en las
mismas tres capas:

- **`core/`** — arranque: servidor Express o shell de React (rutas, layout, registro de módulos).
- **`shared/`** — lo común a cualquier funcionalidad: proveedores de IA, catálogo de modelos,
  credenciales, contexto de marca, aprendizaje, componentes de interfaz.
- **`modules/<funcionalidad>/`** — cada funcionalidad en su propia carpeta independiente
  (`images` hoy, `reels` mañana).

```
.
├── client/                         # Interfaz (React + Vite)
│   └── src/
│       ├── core/                   # main, App, layout (barra, pie), registro de módulos, Inicio, paso 1
│       ├── shared/                 # api, setup, models, topic, learning, publishing, video, ui…
│       └── modules/
│           ├── images/             # asistente de imágenes (pasos, galería, estado, API)
│           └── reels/              # asistente de reels (pasos, guion, aprobación, historial)
├── server/                         # API (Express)
│   ├── data/                       # (se crea al usar la app, no se versiona) marca, aprendizajes y reels
│   ├── scripts/                    # probarHeygen.ts (npm run probar:heygen)
│   ├── test/                       # pruebas con respuestas simuladas de HeyGen
│   └── src/
│       ├── core/                   # arranque, registro de módulos, manejo de errores
│       ├── shared/
│       │   ├── ai/                 # proveedores (Gemini), modelos, sugerencia de temática
│       │   ├── brandContext/       # empresa.md, lineamientos.md, lineamientos-video.md y logo
│       │   ├── credentials/        # lectura/escritura de .env y validación de keys
│       │   ├── learning/           # learning.md: reglas aprendidas (imagen, video o general)
│       │   ├── publishing/         # contacto y armado del texto de la publicación
│       │   ├── video/              # proveedor de video (HeyGen), configuración y autorizaciones
│       │   ├── config/             # entorno, rutas y catálogo de modelos con precios
│       │   └── http/               # errores, validación, restricción a localhost
│       └── modules/
│           ├── images/             # prompts, generación y ajuste de imágenes
│           └── reels/              # guion, cola de renders, polling, descarga e historial
├── plantillas/                     # plantilla genérica de lineamientos de video
├── .env.example                    # plantilla de variables de entorno
├── eslint.config.js                # reglas de lint y de límites entre módulos
└── skills-lock.json / .agents/     # skills de Claude Code usadas en el desarrollo (opcional)
```

### Reglas de la arquitectura

- Un módulo importa solo de su propia carpeta y de `shared/`. **Nunca** de otro módulo ni de `core/`.
  Una regla de ESLint (`architecture/module-boundaries`) lo verifica en cliente y servidor.
- Si dos módulos necesitan lo mismo, ese código se mueve a `shared/`.
- `core/` es el único lugar donde se registran los módulos.

### Decisiones técnicas

- **Backend propio:** un navegador no puede escribir `.env` ni debe conocer la API key; por eso el
  servidor hace las llamadas a la IA.
- **Validación con Zod** en todas las fronteras: variables de entorno, peticiones y respuestas JSON
  de los modelos.
- **Carga diferida:** cada página y cada módulo se descarga solo cuando se usa (code-splitting);
  JSZip se carga únicamente al descargar el ZIP.
- **TanStack Query** para datos del servidor; `useReducer` para el estado del asistente.
- **CSS Modules** y variables CSS (_design tokens_), con enfoque _mobile-first_ y accesibilidad
  (foco visible, etiquetas, `prefers-reduced-motion`, modo oscuro).

## Cómo se generan los prompts

Todos se construyen en el servidor:

| Qué                                     | Dónde                                                                                          |
| --------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Prompts de imagen y texto de publicación | [`server/src/modules/images/promptBuilder.ts`](server/src/modules/images/promptBuilder.ts)     |
| Ajuste del prompt con comentarios       | [`server/src/modules/images/reviseBuilder.ts`](server/src/modules/images/reviseBuilder.ts)     |
| Prompt final enviado al modelo de imagen | [`server/src/modules/images/imageGenerator.ts`](server/src/modules/images/imageGenerator.ts)   |
| Sugerencias de temática                 | [`server/src/shared/ai/topicPrompt.ts`](server/src/shared/ai/topicPrompt.ts)                   |
| Conversión de comentarios en reglas     | [`server/src/shared/learning/learningPrompt.ts`](server/src/shared/learning/learningPrompt.ts) |
| Armado del texto (contacto + hashtags)  | [`server/src/modules/images/caption.ts`](server/src/modules/images/caption.ts)                 |

Puntos clave:

- El `SYSTEM` de `promptBuilder.ts` contiene las reglas de estilo: cómo describir la escena, usar los
  colores HEX, la tipografía, el logo, el pie de página y cómo redactar el texto.
- Las imágenes de desarrollo llevan más texto e información; la última incluye el llamado a la acción,
  el correo y el sitio web.
- El correo y el sitio web **no los escribe el modelo** en el texto de la publicación: el servidor los
  agrega antes de los hashtags para que siempre sean exactos.
- Los aprendizajes de `learning.md` se incluyen en cada generación de prompts y de temáticas.

## API del servidor

Todas las rutas cuelgan de `/api`. Las marcadas con 🔒 solo aceptan peticiones desde la misma máquina.

| Método y ruta                    | Descripción                                                     |
| -------------------------------- | --------------------------------------------------------------- |
| `GET /api/setup/status`          | Credenciales configuradas y estado de los archivos de marca.    |
| `POST /api/setup/credentials` 🔒 | Valida con el proveedor y guarda la API key en `.env`.          |
| `GET /api/context`               | Datos de los archivos de marca cargados.                        |
| `GET /api/context/logo`          | Imagen del logo.                                                |
| `PUT /api/context` 🔒            | Sube o reemplaza empresa, lineamientos, lineamientos de video y logo. |
| `GET /api/models?kind=text\|image` | Modelos disponibles con precio y recomendado.                 |
| `POST /api/topic-suggestions`    | Sugiere temáticas con IA.                                       |
| `GET /api/learning`              | Lista las reglas aprendidas.                                    |
| `POST /api/learning`             | Mejora un comentario con IA y lo guarda como regla.             |
| `DELETE /api/learning/:index`    | Elimina una regla.                                              |
| `POST /api/images/prompts`       | Crea los prompts, el concepto y el texto de la publicación.     |
| `POST /api/images/revise-prompt` | Reescribe el prompt de una imagen según comentarios.            |
| `POST /api/images/generate`      | Genera una imagen (o la ajusta con comentarios).                |
| `GET /api/video/settings`        | Configuración de video de la marca.                             |
| `PUT /api/video/settings` 🔒     | Guarda la configuración de video (valida las autorizaciones).   |
| `GET /api/video/background`      | Imagen de fondo de la marca.                                    |
| `PUT /api/video/background` 🔒   | Sube la imagen de fondo (PNG o JPG).                            |
| `GET /api/video/template`        | Descarga la plantilla de lineamientos de video.                 |
| `GET /api/video/avatars`         | Avatares de HeyGen (caché de 5 minutos).                        |
| `GET /api/video/voices?language=` | Voces de HeyGen (caché de 5 minutos).                          |
| `GET /api/video/account`         | Saldo de la cuenta de HeyGen.                                   |
| `GET /api/reels/avatars`, `GET /api/reels/voices` | Igual que los de `/api/video`.                  |
| `POST /api/reels/script`         | Escribe el guion por escena y el texto de la publicación.       |
| `POST /api/reels/revise-script`  | Reescribe el guion según comentarios.                           |
| `POST /api/reels/estimate`       | Duración estimada y saldo (sin costo en USD; ver Costos).       |
| `POST /api/reels/background` 🔒  | Genera un fondo con IA para el reel.                            |
| `GET /api/reels/backgrounds/:id` | Imagen de un fondo generado.                                    |
| `POST /api/reels/generate` 🔒    | Crea el video en HeyGen (exige `confirmed: true`). En edición HeyGen, prepara el storyboard. |
| `POST /api/reels/agent/preview`  | Prompt exacto que se enviaría al Video Agent (no envía nada).   |
| `POST /api/reels/jobs/:id/agent-message` 🔒 | Pedir cambios al storyboard o aprobarlo y generar.   |
| `GET /api/library`              | Mis contenidos (imágenes guardadas, más recientes primero).     |
| `POST /api/library/import` 🔒    | Importa imágenes propias (multipart `images`, hasta 20).        |
| `DELETE /api/library/:id` 🔒     | Borra una pieza y sus archivos.                                 |
| `GET /api/context/identity`      | Slogans, frases, identidad, asociaciones y paleta de la marca.  |
| `PUT /api/context/identity` 🔒   | Guarda slogans, frases e indicaciones de identidad.             |
| `POST /api/context/identity/partners` 🔒 | Agrega el logo de una asociación (multipart `logo`). |
| `PUT /api/context/markdown/:kind` 🔒 | Reemplaza un archivo de marca (`company`, `design`, `videoGuidelines`) guardando antes una copia. |
| `GET /api/context/versions`      | Versiones guardadas de los archivos de marca y la identidad.    |
| `POST /api/context/versions/:id/restore` 🔒 | Vuelve a una versión (guarda antes la actual). |
| `POST /api/images/edit`          | Edita una imagen propia con instrucciones y la guarda en la biblioteca. |
| `GET /api/video/avatars/:id/looks` | Otros looks del mismo avatar (compatibles con Avatar IV o V).  |
| `POST /api/video/avatars/:id/looks` 🔒 | Ropa nueva para un avatar propio (look desde una descripción). |
| `GET /api/video/looks/:id`       | Estado de un look nuevo.                                        |
| `GET /api/video/account-videos`  | Videos de la cuenta de HeyGen (también los hechos en su web).   |
| `GET /api/video/twins`           | Gemelos digitales creados desde la app, con su estado en HeyGen. |
| `POST /api/video/twins` 🔒       | Sube el video y crea el gemelo digital (multipart `footage`).   |
| `POST /api/video/twins/:groupId/consent` 🔒 | Enlace de consentimiento para la persona (24 h). |
| `GET /api/reels/jobs/:id/scenes` | Escenas del video terminado del agente (solo lectura).          |
| `POST /api/reels/jobs/:id/scene-edits` 🔒 | Cambios solo en las escenas indicadas (genera un video nuevo). |
| `GET /api/video/brand-kits`      | Kits de marca de la cuenta de HeyGen.                           |
| `GET /api/reels/jobs`            | Historial de videos.                                            |
| `GET /api/reels/jobs/:id`        | Estado de un video.                                             |
| `GET /api/reels/jobs/:id/video`  | El MP4 descargado (`?download=1` para descargarlo).             |
| `POST /api/reels/jobs/:id/duplicate` 🔒 | Devuelve la especificación de un video para volver a generarlo. |
| `DELETE /api/reels/jobs/:id` 🔒  | Borra un video terminado y su archivo.                          |

## Modelos y costos

La lista que ves en el paso 2 sale de los modelos que tu API key tiene disponibles, filtrados por el
catálogo de [`modelCatalog.ts`](server/src/shared/config/modelCatalog.ts), que define el nombre, el
precio y cuál se recomienda. Los modelos que no están en el catálogo no se muestran (así no aparecen
alias repetidos ni sin precio).

| Tipo   | Modelo recomendado                  | Precio de referencia                               |
| ------ | ----------------------------------- | -------------------------------------------------- |
| Texto  | Gemini 3.8 Flash                    | US$ 0,75 entrada / US$ 3,75 salida por 1M tokens   |
| Imagen | Nano Banana 2.1                     | US$ 0,0336 por imagen (1K)                         |

Los precios son los publicados por Google en octubre de 2026 y pueden cambiar (Google anunció
ajustes desde el 1 de enero de 2027). **Verifícalos** en <https://ai.google.dev/gemini-api/docs/pricing>
y actualiza el catálogo si hace falta. Antes de generar, la aplicación muestra el costo estimado de las
imágenes; el costo del texto es muy pequeño en comparación.

## Seguridad y privacidad

- La API key vive solo en `.env` y en la memoria del servidor; nunca se envía al navegador ni al
  repositorio (`.env` está en `.gitignore`).
- El servidor escucha en `127.0.0.1` por defecto, y los endpoints que escriben credenciales o archivos
  solo aceptan peticiones locales.
- Los archivos de marca y los aprendizajes se guardan en `server/data/` (también ignorado por Git).
- Lo que generas se envía a Google Gemini para procesarse, y en los reels, el guion, los avatares,
  la voz y los fondos se envían a HeyGen: no subas información confidencial que no quieras compartir
  con los proveedores.
- `HEYGEN_API_KEY` vive solo en `.env` y en el servidor. Los errores y los registros nunca incluyen
  las keys, las cabeceras ni el contenido de los archivos de marca.
- Generar, duplicar y borrar videos, y guardar la configuración de video, solo se permite desde la
  misma máquina. Los videos, el historial y las autorizaciones se guardan en `server/data/`.
- Esta aplicación **no tiene autenticación de usuarios**: está pensada para uso local o en una red de
  confianza. Si la publicas en internet, añade autenticación y un proxy inverso con HTTPS antes.

## Cómo extender el proyecto

### Agregar un módulo nuevo (por ejemplo `stories`)

1. **Servidor:** crea `server/src/modules/stories/index.ts` que exporte un `ServerModule`
   (`{ id: 'stories', router }`) y regístralo en `server/src/core/moduleRegistry.ts`. Quedará en
   `/api/stories`.
2. **Cliente:** crea `client/src/modules/stories/index.ts` con un `export default` de su página y un
   `meta.ts` con sus pasos. Regístralo en `client/src/core/modules.ts`: aparecerá como opción en el
   paso 1.
3. Reutiliza lo común desde `shared/` (selección de modelos, temática, interfaz, aprendizaje).

### Agregar otro proveedor de IA

1. Implementa la interfaz `AIProvider` ([`providers/types.ts`](server/src/shared/ai/providers/types.ts)).
2. Regístralo en `providers/index.ts`.
3. Declara su credencial en `shared/credentials/definitions.ts` y en `.env.example`.
4. Agrega sus modelos y precios al catálogo.

### Cambiar modelos, precios o llamados a la acción

- Modelos y precios: [`modelCatalog.ts`](server/src/shared/config/modelCatalog.ts).
- Llamados a la acción: [`cta.ts`](client/src/shared/publishing/cta.ts) (`CTA_OPTIONS`).
- Contacto recordado: [`contactStorage.ts`](client/src/shared/publishing/contactStorage.ts).

### Agregar otro proveedor de video

1. Implementa la interfaz `VideoProvider` ([`video/types.ts`](server/src/shared/video/types.ts)),
   como [`heygen/client.ts`](server/src/shared/video/heygen/client.ts).
2. Regístralo en [`video/index.ts`](server/src/shared/video/index.ts) y declara su credencial en
   `shared/credentials/definitions.ts` y en `.env.example`.

## Calidad del código

```bash
npm run lint       # ESLint + reglas de límites entre módulos
npm run typecheck  # TypeScript estricto en cliente, servidor y pruebas
npm test           # pruebas con respuestas simuladas de HeyGen
npm run build      # compilación completa
```

TypeScript está en modo `strict` (con `noUncheckedIndexedAccess`). Prettier define el formato.

## Solución de problemas

| Problema                                  | Qué hacer                                                                                           |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------- |
| "La API key de Gemini no es válida"       | Revisa que copiaste la key completa y que está activa en Google AI Studio.                          |
| No aparecen modelos de imagen             | Tu key puede no tener acceso a esos modelos (revisa facturación) o Google renombró los modelos: actualiza el catálogo. |
| Error 429 (límite de uso)                 | Superaste la cuota de Gemini. Espera un momento o revisa tu plan.                                   |
| `EADDRINUSE` / puerto ocupado             | Cierra el proceso que usa el 3001 o el 5173, o cambia `PORT` en `.env`.                             |
| La app te devuelve siempre a `/setup`     | Falta la key o alguno de los tres archivos de marca. Complétalos en esa pantalla.                   |
| Las imágenes tienen errores en el texto   | Los modelos de imagen fallan con textos largos. Reduce el texto en el prompt, usa el botón de comentarios en la tarjeta o guarda una regla en "Comentarios y sugerencias". |
| `Node.js` incompatible al instalar        | Actualiza a Node 20.19 o superior (`node -v`).                                                      |
| Cambié `.env` a mano y no se refleja      | Reinicia `npm run dev`.                                                                             |
| Reels dice "Configura HeyGen"             | Falta `HEYGEN_API_KEY`. Agrégala en Actualizar marca → Credenciales y prueba con `npm run probar:heygen`. |
| "Saldo insuficiente en HeyGen"            | Recarga la billetera en el panel de la API de HeyGen. El video no se creó.                          |
| HeyGen rechaza el fondo del avatar        | Algunos avatares de video no permiten recortar su fondo. Usa "Fondo original del avatar".           |
| "Falta la autorización de imagen"         | Ese avatar es un digital twin o photo avatar: registra la autorización en Actualizar marca → Video. |
| El video quedó con error "timeout"        | HeyGen tardó más de `HEYGEN_POLL_TIMEOUT_MIN` minutos. Revisa el video en tu cuenta de HeyGen o sube el valor. |
| No se ven las vistas previas de avatares  | Las sirve el CDN de HeyGen: revisa tu conexión o el bloqueo de contenido externo del navegador.     |

## Hoja de ruta

- [x] Generación de imagen única y carrusel
- [x] Texto de la publicación con contacto y hashtags
- [x] Ajuste por imagen con comentarios
- [x] Aprendizaje a partir de comentarios
- [x] Módulo de **reels** con avatar (HeyGen)
- [ ] Soporte para más proveedores de IA (OpenAI, Anthropic)
- [ ] Autenticación y uso multiusuario
- [ ] Historial de publicaciones generadas

---

Este repositorio aún no declara una licencia.
