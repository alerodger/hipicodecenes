# Club Hípico de Cenes · Web oficial

Web del Club Hípico de Cenes (Cenes de la Vega, Granada), con panel de administración para gestionar **eventos**, **caballos**, **fotos** y **mensajes de contacto**.

**Coste: 0 €** (salvo el dominio). Todo funciona con planes gratuitos:

| Pieza | Servicio | Plan gratuito |
|---|---|---|
| Alojamiento web + HTTPS | GitHub Pages (repositorio público) | Gratis |
| Base de datos, login del admin y fotos | Supabase | 500 MB de BD + 1 GB de fotos |
| Email `info@tudominio` reenviado a Gmail | Cloudflare Email Routing | Gratis |
| Dominio | Cloudflare Registrar u otro | **≈ 10–15 €/año** (único gasto) |

> El repositorio es **público** porque GitHub Pages solo es gratis así. No hay ningún secreto en el código: la clave de Supabase que va en `config.js` es pública por diseño, y la seguridad la aplican las reglas de la base de datos.

---

## Estructura

```
public/                  ← lo único que se publica en internet
  index.html             ← web pública
  admin/index.html       ← panel de administración (/admin/)
  aviso-legal.html       ← aviso legal, privacidad y cookies
  404.html
  assets/css/            ← estilos (web y panel)
  assets/js/config.js    ← ⚙️ CONFIGURACIÓN DE SUPABASE (editar)
  assets/js/main.js      ← lógica de la web pública
  assets/js/admin.js     ← lógica del panel
  assets/js/api.js       ← cliente ligero para leer datos
  _headers               ← cabeceras de seguridad (solo si algún día usas Cloudflare Pages)
supabase/schema.sql      ← tablas, seguridad y almacenamiento
.github/workflows/
  deploy-pages.yml       ← publica public/ en GitHub Pages en cada cambio
  keepalive.yml          ← evita que Supabase se pause
```

No hace falta compilar nada: son archivos estáticos (HTML, CSS y JS), y todas las rutas son relativas. La web funciona igual en `usuario.github.io/repositorio/` que en un dominio propio.

---

## 1. GitHub: subir el código y publicar la web

1. Crea el repositorio en <https://github.com/new>:
   - **Repository name:** `hipicodecenes`
   - **Public**
   - **No** marques «Add a README», ni .gitignore, ni licencia: el repositorio tiene que estar vacío.
2. Sube el proyecto desde la carpeta del proyecto:
   ```bash
   git remote add origin git@github.com:TU-USUARIO/hipicodecenes.git
   git push -u origin main
   ```
3. Activa GitHub Pages: en el repositorio, ve a **Settings → Pages → Build and deployment → Source** y elige **GitHub Actions**.
4. Ve a la pestaña **Actions**, abre «Publicar web» y pulsa **Run workflow** (o **Re-run jobs** si ya se ejecutó y falló porque Pages aún no estaba activado).
5. En 1–2 minutos la web estará en **`https://TU-USUARIO.github.io/hipicodecenes/`**.

A partir de ahí, cada `git push` a `main` publica los cambios automáticamente.

Sin Supabase configurado, la web ya se ve completa. Las secciones de caballos, eventos y galería muestran un mensaje de «muy pronto».

## 2. Supabase: base de datos y panel

1. Crea una cuenta gratuita en <https://supabase.com> (puedes entrar con tu cuenta de GitHub) y pulsa **New project**.
   - **Name:** `hipicodecenes`
   - **Database password:** genera una y guárdala en un sitio seguro.
   - **Region:** una de la UE (p. ej. *Frankfurt* o *Paris*). Es lo que se indica en la política de privacidad.
2. Abre **SQL Editor → New query**, pega el contenido completo de `supabase/schema.sql` y pulsa **Run**.
3. **Desactiva el registro público:** *Authentication → Sign In / Providers →* desactiva **Allow new users to sign up**.
4. **Crea el usuario administrador:** *Authentication → Users → Add user → Create new user*. Pon el email y la contraseña y marca **Auto Confirm User**.
5. **Dale permisos de admin.** En el SQL Editor, ejecuta esto con tu email:
   ```sql
   insert into public.admins (user_id)
   select id from auth.users where email = 'tu-email@ejemplo.com'
   on conflict do nothing;
   ```
   Repite los pasos 4 y 5 por cada persona que deba gestionar la web.
6. **Copia las claves:** botón **Connect** (o *Project Settings → API Keys*):
   - **Project URL** → `https://xxxxx.supabase.co`
   - **Publishable key** (`sb_publishable_…`) o, en proyectos antiguos, la **anon public key**.

   ⚠️ **Nunca** uses la clave *secret* / *service_role*.
7. Pega ambos valores en `public/assets/js/config.js` y súbelo:
   ```bash
   git add public/assets/js/config.js
   git commit -m "Configurar Supabase"
   git push
   ```
8. *Authentication → URL Configuration* (se usa para recuperar la contraseña):
   - **Site URL:** la dirección de la web, ahora `https://TU-USUARIO.github.io/hipicodecenes/` y, cuando tengas dominio, `https://hipicodecenes.com/`.
   - **Redirect URLs:** añade la dirección del panel en cada sitio donde esté la web:
     `https://TU-USUARIO.github.io/hipicodecenes/admin/` y `https://hipicodecenes.com/admin/`
9. **Mantener Supabase activo:** en GitHub, ve a *Settings → Secrets and variables → Actions → New repository secret* y crea:
   - `SUPABASE_URL` = la Project URL
   - `SUPABASE_KEY` = la clave pública (la misma de `config.js`)

   Después, en *Actions → Supabase keep-alive → Run workflow*, comprueba que sale en verde.

> **¿Por qué?** Supabase pausa los proyectos gratuitos tras 7 días sin actividad. La tarea hace una consulta mínima los lunes y los jueves, y las visitas a la web también cuentan como actividad. En repositorios públicos, GitHub desactiva las tareas programadas tras 60 días sin cambios en el repositorio; te avisa por email y se reactiva con un clic. Si Supabase llegara a pausarse, se reactiva desde su panel sin perder datos.

## 3. Dominio propio

1. Compra el dominio. Opción recomendada: *Cloudflare → Domain Registration*, porque cobra precio de coste, sin recargos.
2. En la gestión DNS del dominio, crea estos registros:

   | Tipo | Nombre | Valor |
   |---|---|---|
   | A | `@` | `185.199.108.153` |
   | A | `@` | `185.199.109.153` |
   | A | `@` | `185.199.110.153` |
   | A | `@` | `185.199.111.153` |
   | AAAA | `@` | `2606:50c0:8000::153` |
   | AAAA | `@` | `2606:50c0:8001::153` |
   | AAAA | `@` | `2606:50c0:8002::153` |
   | AAAA | `@` | `2606:50c0:8003::153` |
   | CNAME | `www` | `TU-USUARIO.github.io` |

   Si usas Cloudflare, pon estos registros en modo **DNS only** (nube gris).
3. En GitHub: **Settings → Pages → Custom domain** → `hipicodecenes.com` → **Save**. Cuando termine la comprobación, marca **Enforce HTTPS**. El certificado puede tardar hasta un día.
4. Recomendado: verifica el dominio en tu perfil de GitHub (*Settings → Pages → Add a domain*). Así nadie más puede usarlo en GitHub Pages.
5. Añade `https://hipicodecenes.com/admin/` a las *Redirect URLs* de Supabase y cambia allí la *Site URL*.

## 4. Email profesional gratis (opcional)

Si el dominio está en Cloudflare: *tu dominio → Email → Email Routing*. Crea `info@hipicodecenes.com` y haz que reenvíe al Gmail del club. Para responder desde esa dirección en Gmail, configura «Enviar como».

---

## ✏️ Datos que hay que revisar antes de publicar

No había teléfono ni email públicos, así que hay **datos de ejemplo**. Busca y sustituye en `public/index.html`:

| Qué | Valor de ejemplo | Dónde aparece |
|---|---|---|
| Teléfono | `600 000 000` y `+34600000000` | Contacto y datos estructurados (JSON-LD) |
| WhatsApp | `34600000000` (en enlaces `wa.me/…`) | Botón flotante y botón de contacto |
| Email | `info@hipicodecenes.com` | Contacto y JSON-LD |
| Coordenadas | `37.1597, -3.5378` (aproximadas) | JSON-LD |

En `public/aviso-legal.html`, completa los campos resaltados en amarillo: titular, NIF/CIF, teléfono y registro.

**Textos que conviene validar con el club.** Están redactados a partir de la información pública del club (escuela para niños y adultos, pony club, campamentos, rutas, competiciones y tienda ecuestre), pero algunos detalles son genéricos:
- La lista de **instalaciones**: pistas, picadero, boxes, paddocks, guadarnés, etc.
- Las **preguntas frecuentes**: por ejemplo, que se presta el casco o que hay clases particulares.

**Si el dominio no es `hipicodecenes.com`:** reemplázalo en `index.html` (canonical, Open Graph y JSON-LD), `aviso-legal.html`, `robots.txt` y `sitemap.xml`.

---

## 🐴 Guía rápida del panel (para el club)

Entra en **`/admin/`** dentro de la web, por ejemplo `https://hipicodecenes.com/admin/`. También hay un enlace discreto, «Acceso club», en el pie de la web.

- **Eventos:** crea, edita o elimina concursos, clinics, rutas, campamentos… Si desmarcas «Publicado», el evento queda como borrador y no se ve en la web. Los eventos pasan solos a «Anteriores» cuando termina su fecha.
- **Caballos:** ficha de cada caballo con foto, raza, edad, capa, alzada, disciplina, una frase sobre su carácter y su historia. El campo «Orden» decide quién aparece primero. Puedes ocultar un caballo sin borrarlo.
- **Fotos:** arrastra varias fotos a la vez. Se optimizan solas antes de subirse (formato WebP, tamaño reducido), así que puedes subir directamente las del móvil.
  - ⭐ **Estrella** = foto de **portada**: aparece a pantalla completa al abrir la web. Si marcas varias, van rotando.
  - Las fotos de la categoría **Instalaciones** ilustran esa sección.
  - Puedes cambiar el pie de foto y la categoría en cualquier momento.
- **Mensajes:** los que llegan desde el formulario de contacto. El número indica los no leídos. Puedes responder por email con un clic, marcarlos como leídos o eliminarlos.
- **¿Has olvidado la contraseña?** Escribe tu email en el login y pulsa el enlace. Recibirás un correo para cambiarla.

---

## Probar en local

```bash
cd public
python3 -m http.server 8000
# abre http://localhost:8000
```

Para probar la recuperación de contraseña en local, añade también `http://localhost:8000/admin/` a las *Redirect URLs* de Supabase.

---

## Alternativa: Cloudflare Pages

Si algún día quieres el repositorio privado o cabeceras de seguridad completas:
1. *Workers & Pages → Create → Pages → Connect to Git* y elige el repositorio.
2. Configura **Framework preset:** `None`, **Build command:** vacío y **Build output directory:** `public`.

El archivo `public/_headers` se aplica automáticamente.

---

## Detalles técnicos

- **Seguridad:** las políticas RLS de Postgres garantizan que solo los usuarios de la tabla `admins` pueden escribir. El público solo puede leer el contenido publicado y enviar mensajes.
  - El formulario tiene validaciones en la base de datos, un campo trampa contra bots y un límite de 3 mensajes por email cada 10 minutos.
  - Las páginas incluyen una política CSP en `<meta>`, y el panel no puede cargarse dentro de otra web.
- **Rendimiento:** sin frameworks ni librerías en la web pública, y fuentes con `display=swap`.
  - Las imágenes se cargan de forma diferida y la galería usa miniaturas.
  - Las fotos de portada se descargan solo cuando les toca aparecer.
  - El mapa de Google se carga únicamente si el visitante lo pide.
- **SEO:** etiquetas meta y Open Graph, datos estructurados `SportsActivityLocation` y `Event` (los eventos pueden aparecer en Google), `sitemap.xml`, `robots.txt` y URLs compartibles para cada evento y caballo (`#evento-…`, `#caballo-…`).
- **Accesibilidad:** HTML semántico, navegación por teclado, textos alternativos y respeto de `prefers-reduced-motion`.
- **Capacidad del plan gratuito:** cada foto ocupa unos 300 KB más su miniatura, así que en 1 GB caben unas 2.500 fotos. Si algún día hiciera falta más, basta con borrar fotos antiguas desde el panel.
- **Si añades scripts externos** (p. ej. analítica), permite su dominio en las etiquetas `Content-Security-Policy` de `public/index.html` y `public/admin/index.html`.
