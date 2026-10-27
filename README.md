# AhorroFamiliar — Caja de Ahorro Familiar

Aplicación web para administrar una **caja de ahorro familiar**: los miembros aportan dinero, suben comprobantes de pago y piden préstamos que el resto de la familia aprueba por votación.

Tiene dos modos:

| Modo | Dónde viven los datos | Para qué sirve |
|---|---|---|
| **Local** (por defecto) | En el navegador de cada dispositivo | Probar la app sin crear nada. Cada celular tiene su propia caja. |
| **Compartido** (Supabase) | En una base de datos en internet | Uso real: toda la familia ve la misma caja desde su propio celular. |

Para activar el modo compartido sigue [Base compartida con Supabase](#base-compartida-con-supabase).

## Cómo funciona

Hay dos tipos de usuario con un único inicio de sesión. **El primer usuario que se registra queda como administrador**; los siguientes quedan como socios pendientes de aprobación.

- **Administrador**: aprueba o rechaza registros nuevos y pagos, cambia roles, restablece contraseñas y ve el resumen de toda la caja (dinero total, préstamos activos, pendientes).
- **Socio**: ve su saldo, su deuda y lo disponible, sube comprobantes de pago y pide préstamos.

## Funciones principales

- **Registro con aprobación**: las cuentas nuevas quedan "pendientes" hasta que el administrador las aprueba.
- **Pagos con comprobante**: el socio sube una foto del comprobante y el administrador lo valida.
- **Préstamos por votación**: cada préstamo indica su motivo (salud, educación, emergencia, negocio, etc.) y se aprueba si la mayoría de los socios activos vota a favor.
- **Seguridad**: en modo compartido, todas las reglas (quién aprueba, quién vota, quién ve cada comprobante) las aplica la base de datos, no el navegador. En modo local, quien tenga acceso al dispositivo puede ver los datos guardados.
- **Idiomas**: español (por defecto) e inglés.

## Tecnología

- **React 19** + **Vite 8** + **Tailwind CSS 4**
- **Modo local** (`frontend/src/lib/localApi.js`): servidor simulado en el navegador; contraseñas con hash SHA-256 y sal; comprobantes reducidos a 1000 px.
- **Modo compartido** (`frontend/src/lib/supabaseApi.js` + `supabase/schema.sql`): [Supabase](https://supabase.com) (PostgreSQL, inicio de sesión y almacenamiento de archivos). Las pantallas son las mismas en ambos modos.

### ¿Cómo reinicio los datos? (modo local)

Herramientas del navegador (F12) → Application → Local Storage → borra la clave `ahorro-familiar-db-v1`. El siguiente usuario que se registre será el nuevo administrador.

## Cómo usarla

### Opción 1 — En el navegador, sin instalar nada

Ábrela en **https://siriusmagic.github.io/ahorro-familiar/**

Se publica sola en GitHub Pages cada vez que hay un cambio en `main`. La primera vez hay que activarlo en **Settings → Pages → Source: GitHub Actions**.

### Opción 2 — En tu computadora

Requisitos: **Node.js 20 o superior** y **Yarn**.

```bash
cd frontend
yarn install
yarn dev        # abre http://localhost:3000
```

Para generar la versión final: `yarn build` (queda en `frontend/build/`) y `yarn preview` para probarla.

### Opción 3 — Compartirla desde tu computadora con un túnel

Con la app corriendo (`yarn dev`), en otra terminal:

```bash
npx cloudflared tunnel --url http://localhost:3000
```

Te dará un enlace `https://….trycloudflare.com`. Ojo: quien lo abra desde otro dispositivo verá **sus propios datos**, no los de tu computadora.

## Base compartida con Supabase

Supabase tiene un plan gratuito suficiente para una familia. Pasos (unos 10 minutos):

1. **Crea el proyecto**: entra a [supabase.com](https://supabase.com), crea una cuenta y luego **New project**. Guarda la contraseña de la base en un lugar seguro.
2. **Crea las tablas y las reglas**: en el proyecto abre **SQL Editor → New query**, pega todo el contenido de [`supabase/schema.sql`](supabase/schema.sql) y pulsa **Run**. Se puede volver a ejecutar sin perder datos.
3. **Copia los datos de conexión**: en **Project Settings → API** copia la **Project URL** y la llave **anon / public**.
   - ⚠️ **Nunca** copies la llave `service_role` en la app ni en GitHub: esa sí es secreta.
4. **Conecta la app**:
   - **En tu computadora**: copia `frontend/.env.example` como `frontend/.env.local` y pega ahí los dos valores. `.env.local` no se sube a GitHub.
   - **En la página publicada (GitHub Pages)**: en el repo ve a **Settings → Secrets and variables → Actions → Variables** y crea `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`. Después vuelve a publicar (cualquier cambio en `main`, o **Actions → Publicar en GitHub Pages → Run workflow**).
5. **Crea tu cuenta**: el **primer usuario** que se registre queda como administrador.

Notas:
- Por defecto Supabase pide **confirmar el correo** antes de entrar. Puedes dejarlo así (más seguro) o desactivarlo en **Authentication → Sign In / Providers → Email → Confirm email**.
- Si se te olvida la contraseña, el administrador la restablece desde Supabase: **Authentication → Users → (la persona) → Send password recovery**. La app no puede cambiar contraseñas de otros, porque para eso necesitaría la llave secreta.
- Los comprobantes se guardan en una carpeta privada (`comprobantes`): cada socio ve solo los suyos y el administrador ve todos.
- Los datos que ya tengas en modo local no pasan solos a Supabase.

## Pruebas

```bash
cd frontend
yarn test       # 18 pruebas: lógica del modo local y conexión con Supabase
yarn test:e2e   # en Chromium: registrar admin y socio → aprobar → subir comprobante → el admin ve el pago
```

Reglas de seguridad de la base (necesita PostgreSQL y `psql`):

```bash
bash supabase/pruebas/ejecutar.sh   # 40 comprobaciones: nadie se aprueba solo, nadie ve pagos ajenos, votos únicos…
```

El mismo recorrido `yarn test:e2e` también funciona contra Supabase si defines `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.

GitHub las ejecuta en cada cambio. Las actualizaciones menores de Dependabot se fusionan solas cuando las pruebas pasan.

## Licencia

Copyright 2026 SiriusMagic

Este proyecto se distribuye bajo la **Licencia Apache 2.0**. Consulta el archivo [`LICENSE`](./LICENSE) para ver el texto completo.

En resumen: cualquiera puede usar, copiar, modificar y distribuir este código, siempre que conserve el aviso de copyright y la licencia. El software se entrega **"tal cual", sin garantías de ningún tipo**, y los autores no se hacen responsables de daños derivados de su uso.

## Seguridad

¿Encontraste una vulnerabilidad? Lee [`SECURITY.md`](./SECURITY.md) y repórtala de forma privada.
