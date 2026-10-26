# Política de Seguridad

## Reportar una vulnerabilidad

Si encuentras un problema de seguridad, **no abras un issue público**.

Repórtalo de forma privada desde la pestaña **Security → Report a vulnerability** de este repositorio (GitHub Private Vulnerability Reporting).

Incluye, si puedes:

- Descripción del problema y su impacto.
- Pasos para reproducirlo.
- Versión o commit afectado.

Recibirás respuesta lo antes posible. Por favor, da un plazo razonable para corregirlo antes de publicarlo.

## Buenas prácticas de este proyecto

- Nunca se suben contraseñas, claves de API ni archivos `.env` al repositorio. Usa `.env.example` como plantilla.
- La rama `main` está protegida: los cambios entran solo por pull request.
- Dependabot vigila las dependencias y propone actualizaciones de seguridad.
