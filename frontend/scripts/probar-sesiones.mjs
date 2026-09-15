/**
 * Pruebas de lib/estrategia/sesiones.ts
 *
 *   cd frontend && node --experimental-strip-types scripts/probar-sesiones.mjs
 *
 * Node 24 quita los tipos del .ts sin compilar nada.
 */
import assert from 'node:assert/strict';
import { calcularSesiones, horaLocal, SESIONES } from '../lib/estrategia/sesiones.ts';

let fallos = 0;
function prueba(nombre, fn) {
  try {
    fn();
    console.log(`  ok  ${nombre}`);
  } catch (e) {
    fallos += 1;
    console.log(`  MAL ${nombre}\n      ${e.message.split('\n').join('\n      ')}`);
  }
}

const MIN = 60000;
/** Serie de `n` velas desde una marca UTC, con precio y volumen a elegir. */
function serie(desdeIso, pasoMin, n, precio = () => 100, volumen = () => 1000) {
  const t0 = Date.parse(desdeIso);
  return Array.from({ length: n }, (_, i) => {
    const c = precio(i);
    return { t: t0 + i * pasoMin * MIN, o: c, h: c + 1, l: c - 1, c, v: volumen(i) };
  });
}
const hora = (ms, zona) => {
  const { minuto } = horaLocal(ms, zona);
  return `${String(Math.floor(minuto / 60)).padStart(2, '0')}:${String(minuto % 60).padStart(2, '0')}`;
};
const deClave = (tramos, clave) => tramos.filter((t) => t.clave === clave);

prueba('Londres empieza a las 08:30 LOCALES en invierno y en verano (horario de verano por zona IANA)', () => {
  // 16 mar 2026: Reino Unido en GMT. 13 jul 2026: en BST (UTC+1).
  for (const [dia, utcEsperada] of [['2026-03-16', '08:30'], ['2026-07-13', '07:30']]) {
    const velas = serie(`${dia}T00:00:00Z`, 15, 96);
    const lon = deClave(calcularSesiones(velas), 'londres');
    assert.equal(lon.length, 1);
    const inicioUtc = new Date(velas[lon[0].i0].t).toISOString().slice(11, 16);
    assert.equal(inicioUtc, utcEsperada, `${dia}: empezó a las ${inicioUtc} UTC`);
    assert.equal(hora(velas[lon[0].i0].t, 'Europe/London'), '08:30');
  }
});

prueba('Semana en que EE. UU. ya cambió de hora y el Reino Unido no: cada sesión en su hora', () => {
  // 16 mar 2026: Nueva York en EDT (UTC-4), Londres aún en GMT.
  const velas = serie('2026-03-16T00:00:00Z', 15, 96);
  const ny = deClave(calcularSesiones(velas), 'nuevayork');
  assert.equal(new Date(velas[ny[0].i0].t).toISOString().slice(11, 16), '13:30');
  assert.equal(new Date(velas[ny[0].i1].t).toISOString().slice(11, 16), '19:45');
});

prueba('Acción de EE. UU. (sólo 09:30–16:00 NY): Londres queda en su solape y lo declara', () => {
  // 11 sep 2026, 15m, 26 velas de 09:30 a 15:45 EDT = 13:30 a 19:45 UTC.
  const velas = serie('2026-09-11T13:30:00Z', 15, 26);
  const tramos = calcularSesiones(velas);
  const [lon] = deClave(tramos, 'londres');
  const [ny] = deClave(tramos, 'nuevayork');
  assert.equal(hora(velas[lon.i0].t, 'America/New_York'), '09:30');
  assert.equal(hora(velas[lon.i1].t, 'America/New_York'), '11:15');
  assert.equal(lon.barras, 8);
  assert.equal(lon.esperadas, 32);
  assert.equal(ny.barras, 26);
  assert.equal(ny.esperadas, 26);
});

prueba('Caja, apertura y cierre = máximo, mínimo, primera apertura y último cierre (lógica del Pine)', () => {
  const velas = serie('2026-09-11T13:30:00Z', 15, 26, (i) => 100 + Math.sin(i) * 5 + i * 0.1);
  const [ny] = deClave(calcularSesiones(velas), 'nuevayork');
  const propias = velas.slice(ny.i0, ny.i1 + 1);
  assert.equal(ny.maximo, Math.max(...propias.map((v) => v.h)));
  assert.equal(ny.minimo, Math.min(...propias.map((v) => v.l)));
  assert.equal(ny.apertura, propias[0].o);
  assert.equal(ny.cierre, propias[propias.length - 1].c);
});

prueba('VWAP a mano: precio típico ponderado por volumen, acumulado desde la apertura', () => {
  const velas = serie('2026-09-11T13:30:00Z', 15, 3, (i) => [10, 20, 40][i], (i) => [1, 3, 0][i]);
  const [ny] = deClave(calcularSesiones(velas), 'nuevayork');
  // h,l = c±1 → precio típico = c. Vela 1: 10. Vela 2: (10·1+20·3)/4 = 17,5. Vela 3 sin volumen: sigue 17,5.
  assert.deepEqual(ny.vwap, [10, 17.5, 17.5]);
  // Contraprueba: la media simple de cierres del Pine daría 23,33. Si coincidieran no se habría cambiado nada.
  assert.notEqual(ny.vwap[2], (10 + 20 + 40) / 3);
});

prueba('Sin mirar al futuro: truncar la serie no cambia el VWAP de las velas comunes', () => {
  const velas = serie('2026-09-11T13:30:00Z', 15, 26, (i) => 100 + i, (i) => 500 + ((i * 37) % 11) * 100);
  const [largo] = deClave(calcularSesiones(velas), 'nuevayork');
  const [corto] = deClave(calcularSesiones(velas.slice(0, 12)), 'nuevayork');
  assert.deepEqual(corto.vwap, largo.vwap.slice(0, 12));
});

prueba('POC: cae en la fila donde se concentra el volumen', () => {
  const velas = serie('2026-09-11T13:30:00Z', 15, 26, (i) => (i === 10 ? 130 : 100 + (i % 5)), (i) => (i === 10 ? 1e6 : 100));
  const [ny] = deClave(calcularSesiones(velas), 'nuevayork');
  assert.ok(Math.abs(ny.poc - 130) <= (ny.maximo - ny.minimo) / 24, `POC ${ny.poc}`);
});

prueba('Sin volumen (divisas en Yahoo): VWAP y POC vacíos, nunca un cero', () => {
  const velas = serie('2026-09-11T13:30:00Z', 15, 26, (i) => 1.1 + i / 1000, () => 0);
  const [ny] = deClave(calcularSesiones(velas), 'nuevayork');
  assert.ok(ny.vwap.every((v) => v === null));
  assert.equal(ny.poc, null);
});

prueba('El corte de día es el LOCAL de la sesión, no el UTC (el Pine partiría esta caja en dos)', () => {
  // 18:00–23:59 en Nueva York = 22:00–03:59 UTC: cruza la medianoche UTC.
  const tarde = [{ clave: 'x', nombre: 'X', corto: 'X', inicio: 18 * 60, fin: 24 * 60 - 1, zona: 'America/New_York' }];
  const velas = serie('2026-09-11T22:00:00Z', 30, 12);
  const tramos = calcularSesiones(velas, tarde);
  assert.equal(tramos.length, 1);
  assert.equal(tramos[0].barras, 12);
});

prueba('Días consecutivos dan tramos distintos', () => {
  const velas = [
    ...serie('2026-09-10T13:30:00Z', 15, 26),
    ...serie('2026-09-11T13:30:00Z', 15, 26),
  ];
  assert.equal(deClave(calcularSesiones(velas), 'nuevayork').length, 2);
});

prueba('En curso sólo si la última vela está dentro y la sesión no ha terminado', () => {
  const abierta = serie('2026-09-11T13:30:00Z', 15, 10); // última a las 11:45 NY
  assert.equal(deClave(calcularSesiones(abierta), 'nuevayork')[0].enCurso, true);
  const terminada = serie('2026-09-11T13:30:00Z', 15, 26); // última a las 15:45, cierra a las 16:00
  assert.equal(deClave(calcularSesiones(terminada), 'nuevayork')[0].enCurso, false);
});

prueba('Los horarios por defecto son los del script', () => {
  assert.deepEqual(
    SESIONES.map((s) => [s.clave, s.inicio, s.fin, s.zona]),
    [
      ['londres', 510, 990, 'Europe/London'],
      ['nuevayork', 570, 960, 'America/New_York'],
    ],
  );
});

console.log(fallos ? `\n${fallos} prueba(s) fallida(s)` : '\nTodas las pruebas pasan');
process.exit(fallos ? 1 : 0);
