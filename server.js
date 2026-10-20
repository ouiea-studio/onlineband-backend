// Servidor de OnlineBandApp: guarda en memoria el estado de la sala global
// y lo sincroniza entre los navegadores con Socket.IO. No transmite audio.

const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');
const sala = require('./sala');

const PORT = process.env.PORT || 3000;

// Orígenes que pueden conectarse: el frontend en local (Vite) y el publicado (FRONTEND_URL).
const ORIGENES = ['http://localhost:5173', 'http://127.0.0.1:5173', process.env.FRONTEND_URL]
  .filter(Boolean)
  .map((url) => url.replace(/\/$/, ''));
const opcionesCors = { origin: ORIGENES };

const app = express();
app.use(cors(opcionesCors));

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    tripulantes: sala.estado.tripulantes.length,
    instrumentos: sala.estado.instrumentos.length,
  });
});

const server = http.createServer(app);
const io = new Server(server, { cors: opcionesCors });

// Responde al cliente si mandó callback (ack).
function responder(ack, datos) {
  if (typeof ack === 'function') ack(datos);
}

io.on('connection', (socket) => {
  // Envuelve cada evento: exige haberse unido y atrapa errores de validación.
  function manejar(evento, fn) {
    socket.on(evento, (datos, ack) => {
      if (typeof datos === 'function') { ack = datos; datos = {}; }
      if (!sala.buscarTripulante(socket.id)) {
        return responder(ack, { ok: false, error: 'Primero debes unirte' });
      }
      try {
        responder(ack, { ok: true, ...fn(datos || {}) });
      } catch (err) {
        responder(ack, { ok: false, error: err.message });
      }
    });
  }

  socket.on('unirse', (datos, ack) => {
    if (typeof datos === 'function') ack = datos;
    let tripulante = sala.buscarTripulante(socket.id);
    if (!tripulante) {
      tripulante = sala.agregarTripulante(socket.id);
      socket.broadcast.emit('tripulante:unido', tripulante);
    }
    responder(ack, { ok: true, tu: tripulante, estado: sala.estado });
  });

  manejar('instrumento:agregar', (datos) => {
    const instrumento = sala.agregarInstrumento(socket.id, datos);
    io.emit('instrumento:agregado', instrumento);
    return { instrumento };
  });

  manejar('instrumento:editar', (datos) => {
    const instrumento = sala.editarInstrumento(socket.id, datos.id, datos);
    io.emit('instrumento:editado', instrumento);
    return { instrumento };
  });

  // Mover se envía muy seguido: se reenvía solo a los demás.
  manejar('instrumento:mover', (datos) => {
    const instrumento = sala.moverInstrumento(socket.id, datos.id, datos.x, datos.z);
    socket.broadcast.emit('instrumento:movido', { id: instrumento.id, x: instrumento.x, z: instrumento.z });
    return { x: instrumento.x, z: instrumento.z };
  });

  manejar('instrumento:eliminar', (datos) => {
    sala.eliminarInstrumento(socket.id, datos.id);
    io.emit('instrumento:eliminado', { id: datos.id });
    return {};
  });

  manejar('tempo:cambiar', (datos) => {
    const tempo = sala.cambiarTempo(datos.tempo);
    io.emit('tempo:cambiado', { tempo, por: socket.id });
    return { tempo };
  });

  manejar('escala:cambiar', (datos) => {
    const escala = sala.cambiarEscala(datos);
    io.emit('escala:cambiada', { escala, por: socket.id });
    return { escala };
  });

  socket.on('disconnect', () => {
    const salida = sala.quitarTripulante(socket.id);
    if (salida) io.emit('tripulante:salio', salida);
  });
});

server.listen(PORT, () => {
  console.log(`OnlineBandApp backend escuchando en el puerto ${PORT}`);
  console.log(`Orígenes permitidos: ${ORIGENES.join(', ')}`);
});
