# ⚡ PARKOUR NEÓN

Juego de plataformas neón en el navegador con cuentas, progreso y sistema de baneos en **Firebase**.

🎮 Jugar: https://holapapuscomoestan0-dot.github.io/7-0zos/

## Controles
| Acción | Teclado | Móvil |
|---|---|---|
| Moverse | A / D o ← / → | — |
| Saltar (doble salto) | Espacio, W o ↑ | Tocar mitad derecha |
| Disparar | J, K o X | Tocar mitad izquierda |

## Archivos
- `index.html` — pantallas, estilos, estrellas, música y pestañas.
- `game.js` — Firebase (registro, login, baneos en tiempo real) y el juego.
- `firebase-config.js` — **aquí pegas la configuración de tu proyecto**.
- `firestore.rules` — reglas de seguridad de Firestore.

## Configurar Firebase
1. Crea un proyecto en https://console.firebase.google.com
2. Agrega una **app web** (`</>`) y copia `firebaseConfig` en `firebase-config.js`.
3. **Authentication → Sign-in method → Correo/contraseña → Habilitar.**
4. **Firestore Database → Crear base de datos (modo producción)** y pega el contenido de `firestore.rules` en la pestaña *Reglas*.
5. **Authentication → Configuración → Dominios autorizados:** agrega `holapapuscomoestan0-dot.github.io`.

## Hacerte admin
1. Regístrate en el juego.
2. Copia tu UID en **Authentication → Users**.
3. En Firestore crea la colección `admins` con un documento cuyo ID sea tu UID (campo `role: "admin"`).

## Banear
- **Consola de Firebase:** `users` → documento del jugador → `banned: true` y `banReason: "motivo"`. Se aplica al instante.
- **Consola del navegador (con sesión de admin):** `banUser('nombre', 'motivo')` / `unbanUser('nombre')`.

## Probar en local
No abras el archivo con doble clic (`file://`). Usa un servidor:
```bash
npx serve .
# o
python3 -m http.server 8000
```
