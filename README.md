# Creador de contenido para redes sociales

Aplicación web que genera publicaciones de Instagram con inteligencia artificial respetando la
identidad de una empresa: qué hace, cómo se ve (colores, tipografías, estilo) y su logo. Escribes
una temática (o la pides a la IA) y la plataforma crea los prompts, las imágenes y el texto de la
publicación, listos para descargar y publicar.

- **Frontend:** React 19 + TypeScript + Vite
- **Backend:** Node.js + Express 5 + TypeScript
- **IA:** Google Gemini (texto e imágenes)

---

## Contenido

1. [¿Para qué sirve?](#para-qué-sirve)
2. [Características](#características)
3. [Cómo funciona](#cómo-funciona)
4. [Requisitos técnicos](#requisitos-técnicos)
5. [Instalación paso a paso](#instalación-paso-a-paso)
6. [Archivos de marca](#archivos-de-marca)
7. [Guía de uso](#guía-de-uso)
8. [Variables de entorno](#variables-de-entorno)
9. [Scripts disponibles](#scripts-disponibles)
10. [Arquitectura](#arquitectura)
11. [Cómo se generan los prompts](#cómo-se-generan-los-prompts)
12. [API del servidor](#api-del-servidor)
13. [Modelos y costos](#modelos-y-costos)
14. [Seguridad y privacidad](#seguridad-y-privacidad)
15. [Cómo extender el proyecto](#cómo-extender-el-proyecto)
16. [Calidad del código](#calidad-del-código)
17. [Solución de problemas](#solución-de-problemas)
18. [Hoja de ruta](#hoja-de-ruta)

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
- **Pie de página en cada imagen** con el correo y el sitio web (editables; por defecto
  `info@nubetic.com.co` y `www.nubetic.com.co`).
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

Los archivos quedan guardados en `server/data/brand/` y puedes reemplazarlos cuando quieras desde
**Inicio → Actualizar marca**.

## Guía de uso

1. **Tipo de publicación:** elige _Post en el feed_ (Reel aparece como "Próximamente").
2. **Configuraciones iniciales:**
   - Modelo de texto y modelo de imagen (uno al lado del otro; apilados en móvil), con su precio.
   - **Llamado a la acción:** elige uno de la lista o escribe el tuyo.
   - **Datos de contacto:** correo y sitio web que irán en el pie de cada imagen y en el texto. Puedes
     cambiarlos, restablecerlos o dejarlos vacíos.
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

## Variables de entorno

Se definen en `.env` (raíz del proyecto). Ver [.env.example](.env.example).

| Variable         | Obligatoria | Por defecto | Descripción                                                  |
| ---------------- | :---------: | ----------- | ------------------------------------------------------------ |
| `GEMINI_API_KEY` |     Sí      | —           | API key de Google Gemini. También se puede cargar desde la app. |
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
│       ├── shared/                 # api, setup, models, topic, learning, ui, styles, hooks
│       └── modules/
│           ├── images/             # asistente de imágenes (pasos, galería, estado, API)
│           └── reels/              # esqueleto "Próximamente"
├── server/                         # API (Express)
│   ├── data/                       # (se crea al usar la app, no se versiona) marca y aprendizajes
│   └── src/
│       ├── core/                   # arranque, registro de módulos, manejo de errores
│       ├── shared/
│       │   ├── ai/                 # proveedores (Gemini), modelos, sugerencia de temática
│       │   ├── brandContext/       # guardado de empresa.md, lineamientos.md y logo
│       │   ├── credentials/        # lectura/escritura de .env y validación de keys
│       │   ├── learning/           # learning.md: reglas aprendidas de los comentarios
│       │   ├── config/             # entorno, rutas y catálogo de modelos con precios
│       │   └── http/               # errores, validación, restricción a localhost
│       └── modules/
│           ├── images/             # prompts, generación y ajuste de imágenes
│           └── reels/              # esqueleto
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
| `PUT /api/context` 🔒            | Sube o reemplaza empresa, lineamientos y logo.                  |
| `GET /api/models?kind=text\|image` | Modelos disponibles con precio y recomendado.                 |
| `POST /api/topic-suggestions`    | Sugiere temáticas con IA.                                       |
| `GET /api/learning`              | Lista las reglas aprendidas.                                    |
| `POST /api/learning`             | Mejora un comentario con IA y lo guarda como regla.             |
| `DELETE /api/learning/:index`    | Elimina una regla.                                              |
| `POST /api/images/prompts`       | Crea los prompts, el concepto y el texto de la publicación.     |
| `POST /api/images/revise-prompt` | Reescribe el prompt de una imagen según comentarios.            |
| `POST /api/images/generate`      | Genera una imagen (o la ajusta con comentarios).                |

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
- Lo que generas se envía a Google Gemini para procesarse: no subas información confidencial que no
  quieras compartir con el proveedor.
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
- Llamados a la acción y contacto por defecto: [`types.ts`](client/src/modules/images/types.ts)
  (`CTA_OPTIONS`, `DEFAULT_CONTACT`).

## Calidad del código

```bash
npm run lint       # ESLint + reglas de límites entre módulos
npm run typecheck  # TypeScript estricto en cliente y servidor
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

## Hoja de ruta

- [x] Generación de imagen única y carrusel
- [x] Texto de la publicación con contacto y hashtags
- [x] Ajuste por imagen con comentarios
- [x] Aprendizaje a partir de comentarios
- [ ] Módulo de **reels** (video)
- [ ] Soporte para más proveedores de IA (OpenAI, Anthropic)
- [ ] Autenticación y uso multiusuario
- [ ] Historial de publicaciones generadas

---

Este repositorio aún no declara una licencia.
