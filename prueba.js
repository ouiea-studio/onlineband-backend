// Prueba rápida: conecta dos tripulantes al servidor y revisa las reglas de la sala.
// Uso: con el servidor encendido, `npm test` (o URL=http://... npm test).

const { io } = require('socket.io-client');

const URL = process.env.URL || 'http://localhost:3000';
let fallos = 0;

function revisar(condicion, descripcion) {
  console.log(`${condicion ? 'OK   ' : 'FALLA'} ${descripcion}`);
  if (!condicion) fallos += 1;
}

function conectar() {
  return new Promise((resolve) => {
    const s = io(URL, { transports: ['websocket'] });
    s.on('connect', () => resolve(s));
  });
}

const pedir = (s, evento, datos) => new Promise((resolve) => s.emit(evento, datos, resolve));
const esperar = (s, evento) => new Promise((resolve) => s.once(evento, resolve));

(async () => {
  const salud = await (await fetch(URL + '/api/health')).json();
  revisar(salud.ok === true, '/api/health responde ok');

  const a = await conectar();
  const b = await conectar();

  const sinUnirse = await pedir(a, 'tempo:cambiar', { tempo: 100 });
  revisar(!sinUnirse.ok, 'no se puede actuar sin unirse');

  const ua = await pedir(a, 'unirse', {});
  const ub = await pedir(b, 'unirse', {});
  revisar(/^TRIPULANTE \d{2}$/.test(ua.tu.indicativo), `indicativo: ${ua.tu.indicativo}`);
  revisar(ua.tu.color !== ub.tu.color, `colores distintos: ${ua.tu.color} / ${ub.tu.color}`);

  const avisoB = esperar(b, 'instrumento:agregado');
  const nuevo = await pedir(a, 'instrumento:agregar', { tipo: 'percusion', x: 3, z: -2, pasos: 8 });
  const inst = nuevo.instrumento;
  revisar(nuevo.ok && inst.patron.length === 8, 'A agrega percusión de 8 pasos');
  revisar((await avisoB).id === inst.id, 'B recibe el instrumento nuevo');

  revisar(!(await pedir(a, 'instrumento:agregar', { tipo: 'bajo' })).ok, 'rechaza tipo inválido');
  revisar(!(await pedir(a, 'instrumento:editar', { id: inst.id, pasos: 40 })).ok, 'rechaza 40 pasos');

  const editado = await pedir(a, 'instrumento:editar', {
    id: inst.id, pasos: 4, patron: [1, 0, 1, 0, 1, 1], parametros: { sonido: 'snare', decay: 0.5, inventado: 1 },
  });
  revisar(editado.ok && editado.instrumento.patron.join() === 'true,false,true,false', 'A edita pasos y patrón');
  revisar(editado.instrumento.parametros.sonido === 'snare' && !('inventado' in editado.instrumento.parametros),
    'parámetros: acepta los conocidos e ignora los inventados');

  revisar(!(await pedir(b, 'instrumento:editar', { id: inst.id, pasos: 2 })).ok, 'B no puede editar el de A');
  revisar(!(await pedir(b, 'instrumento:mover', { id: inst.id, x: 0, z: 0 })).ok, 'B no puede mover el de A');
  revisar(!(await pedir(b, 'instrumento:eliminar', { id: inst.id })).ok, 'B no puede eliminar el de A');

  const movidoB = esperar(b, 'instrumento:movido');
  const movido = await pedir(a, 'instrumento:mover', { id: inst.id, x: 30, z: 0 });
  revisar(movido.ok && movido.x === 12, 'mover fuera del radio queda en 12');
  revisar((await movidoB).x === 12, 'B recibe la nueva posición');

  const tempoA = esperar(a, 'tempo:cambiado');
  revisar((await pedir(b, 'tempo:cambiar', { tempo: 128 })).ok, 'B cambia el tempo');
  revisar((await tempoA).tempo === 128, 'A recibe el tempo nuevo');
  revisar(!(await pedir(b, 'tempo:cambiar', { tempo: 999 })).ok, 'rechaza tempo 999');

  const escala = await pedir(b, 'escala:cambiar', { tonica: 'D', modo: 'dorico' });
  revisar(escala.ok && escala.escala.tonica === 'D', 'B cambia la escala a D dórico');

  const inst2 = (await pedir(a, 'instrumento:agregar', { tipo: 'melodia' })).instrumento;
  const borradoA = await pedir(a, 'instrumento:eliminar', { id: inst2.id });
  revisar(borradoA.ok, 'A elimina su propio instrumento');

  const salida = esperar(b, 'tripulante:salio');
  a.disconnect();
  const s = await salida;
  revisar(s.instrumentosEliminados.includes(inst.id), 'al desconectarse A, sus instrumentos se eliminan');

  const final = await (await fetch(URL + '/api/health')).json();
  revisar(final.instrumentos === 0 && final.tripulantes === 1, 'estado final: 1 tripulante, 0 instrumentos');

  b.disconnect();
  console.log(fallos ? `\n${fallos} prueba(s) fallaron` : '\nTodo bien');
  process.exit(fallos ? 1 : 0);
})();
