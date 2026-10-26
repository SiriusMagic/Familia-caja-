# AhorroFamiliar — Caja de Ahorro Familiar

Aplicación web para administrar una **caja de ahorro familiar**: los miembros aportan dinero, suben comprobantes de pago y piden préstamos que el resto de la familia aprueba por votación.

## Cómo funciona

Hay dos tipos de usuario con un único inicio de sesión:

- **Administrador**: aprueba o rechaza registros nuevos y pagos, cambia roles, restablece contraseñas y ve el resumen de toda la caja (dinero total, préstamos activos, pendientes).
- **Socio**: ve su saldo, su deuda y lo disponible, sube comprobantes de pago y pide préstamos.

## Funciones principales

- **Registro con aprobación**: las cuentas nuevas quedan "pendientes" hasta que el administrador las aprueba.
- **Pagos con comprobante**: el socio sube una foto del comprobante y el administrador lo valida.
- **Préstamos por votación**: cada préstamo indica su motivo (salud, educación, emergencia, negocio, etc.) y se aprueba si la mayoría de los socios activos vota a favor.
- **Seguridad**: contraseñas cifradas con bcrypt, sesiones con JWT y bloqueo de 15 minutos tras 5 intentos fallidos.
- **Idiomas**: español (por defecto) e inglés.

## Tecnología

- **Frontend**: React 19 + Tailwind CSS + shadcn/ui
- **Backend**: FastAPI (Python) con autenticación JWT
- **Base de datos**: MongoDB

## Cómo ejecutarlo

Requisitos: **Node.js 20+**, **Yarn**, **Python 3.11+** y **MongoDB** (local o en la nube).

**Backend (FastAPI):**

```bash
cd backend
pip install -r requirements.txt
# Crea backend/.env con:
#   MONGO_URL=mongodb://localhost:27017
#   DB_NAME=nombre_de_tu_base
#   JWT_SECRET=una_clave_larga_y_secreta
#   ADMIN_EMAIL=admin@ejemplo.com
#   ADMIN_PASSWORD=una_contraseña_segura
uvicorn server:app --reload --port 8001
```

**Frontend (React):**

```bash
cd frontend
yarn install
# Crea frontend/.env con:
#   REACT_APP_BACKEND_URL=http://localhost:8001
yarn start
```

Abre http://localhost:3000 en el navegador. Todas las rutas del backend usan el prefijo `/api`.

Al arrancar, el backend crea automáticamente la cuenta de administrador con `ADMIN_EMAIL` y `ADMIN_PASSWORD`.

## Licencia

Copyright 2026 SiriusMagic

Este proyecto se distribuye bajo la **Licencia Apache 2.0**. Consulta el archivo [`LICENSE`](./LICENSE) para ver el texto completo.

En resumen: cualquiera puede usar, copiar, modificar y distribuir este código, siempre que conserve el aviso de copyright y la licencia. El software se entrega **"tal cual", sin garantías de ningún tipo**, y los autores no se hacen responsables de daños derivados de su uso.

## Seguridad

¿Encontraste una vulnerabilidad? Lee [`SECURITY.md`](./SECURITY.md) y repórtala de forma privada.
