# the 2nd closet · caja

Inventario y caja del emprendimiento de ropa second-hand **the 2nd closet** (Buenos Aires, Zona Norte).

Es una single-page app en **React 18 + Babel standalone**, cargados por CDN — **sin build step**. El navegador transpila el JSX al vuelo. Esto es intencional (no es un descuido): mantiene el proyecto simple de editar y desplegar. No se migró a un bundler (Vite/webpack) para no agregar una capa de complejidad que este proyecto, en su tamaño actual, no necesita.

## Estructura

```
public/
  index.html   → shell HTML: carga React/ReactDOM/Babel por CDN + app.js
  styles.css   → todo el CSS (paleta, tipografías, layout)
  app.js       → toda la lógica (componentes, modelo de datos, sync, stats)
  logo.png     → logo del gato (antes iba embebido en base64 dentro del HTML)
scripts/
  check-syntax.js → valida que app.js parsee sin errores antes de deployar
vercel.json    → le dice a Vercel que sirva desde public/
package.json   → scripts (dev, check, deploy)
```

Antes esto era un único `index.html` de ~163KB con todo adentro (CSS, JS y el logo en base64 embebido, que por sí solo pesaba ~90.000 caracteres). Se separó en 3 archivos por mantenibilidad, pero **sigue sin build step**: `app.js` se carga con `<script type="text/babel" src="app.js">` y se transpila en el navegador, igual que antes.

## Levantar el proyecto en local

Como `app.js` se carga vía `fetch`/XHR (para que Babel lo transpile), **no alcanza con abrir `public/index.html` haciendo doble clic** — los navegadores bloquean esa carga sobre `file://`. Hace falta un servidor estático simple:

```bash
npm install
npm run dev
```

Esto levanta `public/` en `http://localhost:3000` (usa `npx serve` por debajo). Abrí esa URL en el navegador.

## Reconfigurar jsonbin.io (sync entre dispositivos)

La sincronización no vive en el código ni en variables de entorno — cada usuario la configura a mano desde la app, y queda guardada en `localStorage` de su navegador (`the2ndcloset_sync`).

1. Anda a [jsonbin.io](https://jsonbin.io) y creá una cuenta gratuita.
2. Creá un **Bin** nuevo (podés arrancar con `{}` como contenido).
3. Sacá el **Bin ID** (de la URL del bin) y tu **X-Access-Key** (Master Key o una Access Key, desde tu panel de jsonbin).
4. En la app, tocá el botón de sincronización (⇅, junto al perfil) y cargá esos dos datos.
5. Repetí el paso 4 en el otro dispositivo, con el **mismo Bin ID y Access Key**, para que ambos lean/escriban el mismo bin.

Si algún día hay que migrar de bin, hay que reconfigurar esto en los dos dispositivos — si no, van a quedar escribiendo en bins distintos sin darse cuenta.

## Reconfigurar Cloudinary (fotos)

También vía modal en la app, guardado en `localStorage` (`the2ndcloset_cloudinary`).

1. Creá una cuenta gratuita en [cloudinary.com](https://cloudinary.com) (no pide tarjeta).
2. Anotá tu **Cloud name** (aparece en el dashboard).
3. Creá un **Upload preset** en modo **unsigned** (Settings → Upload → Upload presets → Add upload preset → Signing Mode: Unsigned). Esto es lo que permite subir fotos desde el navegador sin exponer ninguna clave secreta.
4. En la app, andá a Cargar prenda → ⚙ (al lado de "Foto") y cargá el Cloud name + el nombre del upload preset.

## Perfil de usuario

No es un login. Es simplemente un nombre (`Thiago` / `Giane` / otro) que se guarda en `localStorage` (`the2ndcloset_profile`) para saber quién cargó cada movimiento. No hay contraseña ni backend de autenticación — cualquiera que abra la app en ese navegador puede elegir cualquier nombre.

## Modelo de datos — no tocar sin entender el historial

Todo vive en `localStorage` bajo `the2ndcloset_ledger` como caché local, y se sincroniza con jsonbin cuando hay conexión configurada. El esquema actual es `version: 2`: un objeto `{ version, items, gastos, meta }`.

`normalizeData()` (en `app.js`) migra automáticamente formatos viejos (un array plano de `{type, concepto, monto, ...}`) al esquema actual. **No cambiar las claves de `localStorage` ni la forma de `items`/`gastos`/`meta` sin entender qué rompe** — hay datos reales cargados en producción en los dos dispositivos que usan la app, y `normalizeData` es lo único que evita perderlos si cambia el formato.

## Chequeo antes de deployar

`app.js` se transpila con Babel *en el navegador del usuario final* — un error de sintaxis ahí no se detecta en ningún build, se descubre recién cuando la pantalla queda en blanco en producción. Por eso:

```bash
npm run check
```

Corre `app.js` a través del mismo parser de Babel (vía `@babel/standalone`, la versión npm del mismo paquete que se carga por CDN) y falla con el mensaje de error y la línea exacta si hay algo mal. `npm run deploy` lo corre automáticamente antes de deployar.

## Deploy a Vercel

### Manual (recomendado para uso normal)

```bash
npm run deploy
```

Corre el chequeo de sintaxis y, si pasa, ejecuta `vercel --prod`. La primera vez te va a pedir vincular el proyecto (elegí la organización/cuenta y, si ya existe un proyecto de Vercel de despliegues anteriores, vinculate a ese para no perder el dominio de producción actual).

### Por CI (opcional)

Hay un workflow en `.github/workflows/deploy.yml` que corre `npm run check` y despliega a producción en cada push a `main`. Para activarlo:

1. Subí este repo a GitHub.
2. Corré `vercel link` una vez en local para vincular el proyecto — esto genera `.vercel/project.json` con el `orgId` y `projectId`.
3. En GitHub, andá a Settings → Secrets and variables → Actions y cargá:
   - `VERCEL_TOKEN` (generalo en vercel.com/account/tokens)
   - `VERCEL_ORG_ID` (de `.vercel/project.json`)
   - `VERCEL_PROJECT_ID` (de `.vercel/project.json`)

Sin estos tres secrets configurados, el workflow va a fallar — no es obligatorio activarlo, `npm run deploy` a mano cumple lo mismo sin necesidad de GitHub.

## Qué NO tocar sin preguntar

- El modelo de datos (`items`, `gastos`, `meta`) y las claves de `localStorage` (`the2ndcloset_ledger`, `the2ndcloset_sync`, `the2ndcloset_cloudinary`, `the2ndcloset_profile`, `the2ndcloset_margin`).
- La estética (paleta de colores, tipografías Baloo 2 / Space Mono, el logo) — es la identidad de marca real tomada del Instagram del negocio.
