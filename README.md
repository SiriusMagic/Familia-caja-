# AhorroFamiliar — Caja de Ahorro Familiar

Aplicación web para administrar una **caja de ahorro familiar**: los miembros aportan dinero, suben comprobantes de pago y piden préstamos que el resto de la familia aprueba por votación.

> ✅ **Funciona 100 % en el navegador**, sin servidor ni base de datos.
>
> ⚠️ **Los datos se guardan en el navegador del dispositivo donde se usa** (localStorage). Para que toda la familia vea la misma caja, todos deben usar **la misma computadora y el mismo navegador**, cada uno con su cuenta. Si cada persona entra desde su propio celular, cada celular tendrá datos separados.

## Cómo funciona

Hay dos tipos de usuario con un único inicio de sesión. **El primer usuario que se registra queda como administrador**; los siguientes quedan como socios pendientes de aprobación.

- **Administrador**: aprueba o rechaza registros nuevos y pagos, cambia roles, restablece contraseñas y ve el resumen de toda la caja (dinero total, préstamos activos, pendientes).
- **Socio**: ve su saldo, su deuda y lo disponible, sube comprobantes de pago y pide préstamos.

## Funciones principales

- **Registro con aprobación**: las cuentas nuevas quedan "pendientes" hasta que el administrador las aprueba.
- **Pagos con comprobante**: el socio sube una foto del comprobante y el administrador lo valida.
- **Préstamos por votación**: cada préstamo indica su motivo (salud, educación, emergencia, negocio, etc.) y se aprueba si la mayoría de los socios activos vota a favor.
- **Seguridad**: contraseñas con hash, bloqueo de 15 minutos tras 5 intentos fallidos. Al ser una app solo de navegador, quien tenga acceso al dispositivo puede ver los datos guardados.
- **Idiomas**: español (por defecto) e inglés.

## Tecnología

- **React 19** + **Vite 8** + **Tailwind CSS 4**
- **Servidor simulado en el navegador** (`frontend/src/lib/localApi.js`): mismas rutas `/api/...` y misma lógica que el antiguo backend FastAPI + MongoDB
- Contraseñas guardadas con hash SHA-256 y sal (nunca en texto plano)
- Las fotos de comprobantes se reducen (máx. 1000 px, JPEG) para que quepan en el navegador

### ¿Cómo reinicio los datos?

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

## Pruebas

```bash
cd frontend
yarn test       # 10 pruebas: registro, aprobación, roles, bloqueo por intentos, pagos y votación de préstamos
yarn test:e2e   # en Chromium: registrar admin y socio → aprobar → subir comprobante → el admin ve el pago
```

GitHub las ejecuta en cada cambio. Las actualizaciones menores de Dependabot se fusionan solas cuando las pruebas pasan.

## Licencia

Copyright 2026 SiriusMagic

Este proyecto se distribuye bajo la **Licencia Apache 2.0**. Consulta el archivo [`LICENSE`](./LICENSE) para ver el texto completo.

En resumen: cualquiera puede usar, copiar, modificar y distribuir este código, siempre que conserve el aviso de copyright y la licencia. El software se entrega **"tal cual", sin garantías de ningún tipo**, y los autores no se hacen responsables de daños derivados de su uso.

## Seguridad

¿Encontraste una vulnerabilidad? Lee [`SECURITY.md`](./SECURITY.md) y repórtala de forma privada.
