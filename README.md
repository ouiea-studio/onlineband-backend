# OnlineBand · backend

Servidor de **OnlineBandApp**, una app web de creación musical colectiva en tiempo real: una sala global donde cada persona (tripulante) agrega instrumentos, representados como gemas 3D en un universo compartido.

Este servidor guarda en memoria el estado de la sala (tempo, escala, tripulantes e instrumentos) y lo sincroniza entre los navegadores con Socket.IO. No transmite audio: cada navegador genera el sonido a partir del estado compartido. La obra es efímera; no hay base de datos.

El frontend está en [onlineband-frontend](https://github.com/ouiea-studio/onlineband-frontend).

## Correrlo en local

Necesitas Node.js 20 o más reciente.

```bash
npm install
npm start
```

El servidor queda en http://localhost:3000. Para comprobar que está vivo: http://localhost:3000/api/health

Con el servidor encendido, `npm test` conecta dos tripulantes de prueba y revisa las reglas de la sala.

## Variables de entorno

| Variable | Para qué sirve | Por defecto |
| --- | --- | --- |
| `PORT` | Puerto en el que escucha. Render lo define solo. | `3000` |
| `FRONTEND_URL` | URL del frontend publicado, para permitirlo en CORS (por ejemplo `https://onlineband.onrender.com`). `http://localhost:5173` siempre está permitido. | sin valor |

Hay un ejemplo en `.env.example`.

## Archivos

- `server.js`: Express y Socket.IO; recibe los eventos y avisa a todos los conectados.
- `sala.js`: el estado de la sala y sus reglas (solo el dueño edita, mueve o elimina sus instrumentos; tempo y escala son de todos).
- `prueba.js`: prueba automática con dos tripulantes.

## Eventos de Socket.IO

`unirse`, `instrumento:agregar`, `instrumento:editar`, `instrumento:mover`, `instrumento:eliminar`, `tempo:cambiar` y `escala:cambiar`. Al desconectarse un tripulante, sus instrumentos se eliminan.
