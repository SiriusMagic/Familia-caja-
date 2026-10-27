# ahorro-familiar

Caja de ahorro familiar (prototipo) que funciona 100 % en el navegador. La lógica (usuarios, pagos, préstamos por votación) está en `frontend/src/lib/localApi.js`. Los datos viven en el localStorage de cada dispositivo.

## Comandos

```bash
cd frontend
yarn install
yarn dev            # desarrollo en http://localhost:3000
yarn test           # pruebas de lógica (Vitest)
yarn test:e2e       # flujo completo en navegador (Playwright)
yarn build
```

## Reglas del dueño (aplican a todo cambio)

- **Librerías**: si una dependencia está abandonada, sin mantenimiento, obsoleta o tiene una alternativa claramente más actual o potente, reemplázala sin pedir permiso. Explica el cambio y el motivo en el PR.
- **Quitar lo que no se usa**: archivos y dependencias que ningún código importa se eliminan. Menos código = menos superficie de ataque.
- **Nunca subir secretos**: ni llaves de API, ni contraseñas, ni archivos `.env`. Usa variables de entorno y `.env.example`.
- **Todo por pull request** hacia `main`, con las pruebas en verde antes de fusionar.
- **Probar antes de subir**: ejecuta las pruebas del repo; si cambia la interfaz, pruébala en un navegador.
- **Idioma**: README, PRs y comentarios para el usuario en español, claros y sin jerga.
- **Dependabot**: las actualizaciones menores se fusionan solas si las pruebas pasan; las mayores se revisan a mano.
