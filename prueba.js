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

  // V2: patrones por defecto, grados de la escala y parámetros con rango
  const perc2 = (await pedir(b, 'instrumento:agregar', { tipo: 'percusion' })).instrumento;
  revisar(perc2.parametros.sonido === 'hat' && perc2.patron.filter(Boolean).length === 4, 'la segunda percusión llega como hat con su patrón');
  const arm = (await pedir(b, 'instrumento:agregar', { tipo: 'armonia' })).instrumento;
  revisar(arm.pasos === 16 && arm.subdivision === 'corchea' && arm.patron.join() === '0,,,,5,,,,3,,,,4,,,', 'armonía por defecto: i–VI–iv–v en corcheas');
  const mel = (await pedir(b, 'instrumento:agregar', { tipo: 'melodia' })).instrumento;
  revisar(mel.pasos === 32 && mel.patron.filter((g) => g !== null).length === 19, 'melodía por defecto: 32 semicorcheas');
  const mel2 = (await pedir(b, 'instrumento:editar', { id: mel.id, pasos: 4, patron: [6, 7, 'x', null, 2], parametros: { volumen: 5, glide: -1 } })).instrumento;
  revisar(mel2.patron.join() === '6,,,', 'grados fuera de 0–6 se vuelven silencio');
  revisar(mel2.parametros.volumen === 1 && mel2.parametros.glide === 0, 'parámetros fuera de rango se recortan');
  const mel3 = (await pedir(b, 'instrumento:editar', { id: mel.id, pasos: 8 })).instrumento;
  revisar(mel3.patron.join() === '6,,,,6,,,', 'al subir los pasos el patrón se repite');
  const arm2 = (await pedir(b, 'instrumento:editar', { id: arm.id, parametros: { acorde: 'septima', inversion: 1.6 } })).instrumento;
  revisar(arm2.parametros.acorde === 'septima' && arm2.parametros.inversion === 2, 'acorde séptima e inversión entera');
  revisar(!(await pedir(a, 'instrumento:editar', { id: mel.id, patron: [0] })).ok, 'A no puede editar la melodía de B');
  // V3: resonancia y envíos a efectos
  revisar(arm.parametros.resonancia === 1 && arm.parametros.envioReverb === 0.45, 'armonía trae resonancia y envío de reverb');
  revisar(perc2.parametros.envioDelay === 0.15 && !('resonancia' in perc2.parametros), 'la percusión trae envíos pero no resonancia');
  const mel4 = (await pedir(b, 'instrumento:editar', { id: mel.id, parametros: { resonancia: 50, envioReverb: 0.8, envioDelay: -2 } })).instrumento;
  revisar(mel4.parametros.resonancia === 18 && mel4.parametros.envioReverb === 0.8 && mel4.parametros.envioDelay === 0, 'resonancia y envíos se recortan a su rango');
  for (const i of [perc2, arm, mel]) await pedir(b, 'instrumento:eliminar', { id: i.id });

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
