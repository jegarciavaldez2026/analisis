/**
 * ¿Las claves que piden los estados financieros existen en la respuesta real?
 *
 * Por qué existe este script.
 *
 * En CLAUDE.md hay una trampa de método anotada: «un mapeo mal hecho no da
 * error: da un hueco silencioso». Ha pasado cinco veces —noticias, balance,
 * curva de patrimonio, Ichimoku y ahora los estados financieros— y siempre
 * igual: alguien escribe un nombre de campo plausible en vez del real. `tsc`
 * no lo ve (la respuesta es `any`), el lint tampoco, y la pantalla no se
 * rompe. Sale una fila de guiones, que el lector interpreta como «la empresa
 * no publica ese dato».
 *
 * Los otros dos verificadores del proyecto son estáticos y no pueden cazar
 * esto: la verdad está al otro lado de la red. Éste consulta el endpoint de
 * verdad para varios valores y compara con las claves escritas en el código.
 *
 * Falso positivo posible y esperado: una partida que una empresa concreta no
 * publica —KO no tiene I+D, XOM no tiene fondo de comercio—. Por eso se
 * consultan varios valores y sólo se señala la clave que **no aparece en
 * ninguno**: eso ya no es una empresa que no lo informa, es un nombre mal
 * escrito.
 *
 *   node scripts/verificar-claves-estados.mjs            (app en :8080)
 *   node scripts/verificar-claves-estados.mjs http://otro:8080
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const FUENTE = path.join(aqui, '..', 'components', 'FinancialStatements.jsx');
const BASE = process.argv[2] || 'http://localhost:8080';
const VALORES = ['VZ', 'AAPL', 'KO', 'JNJ', 'MSFT', 'XOM'];

/** Las claves que cada constructor de filas pide, en orden de preferencia. */
function clavesPedidas(src, constructor) {
  const i = src.indexOf(`function ${constructor}(`);
  if (i < 0) throw new Error(`no encuentro ${constructor} en FinancialStatements.jsx`);
  const cuerpo = src.slice(i, src.indexOf('\n}', i));
  const filas = [];
  // `values: v("A", "B")` — la primera es la vigente, las demás respaldos.
  for (const m of cuerpo.matchAll(/label: "([^"]+)"[^\n]*values: v\(([^)]*)\)/g)) {
    const claves = [...m[2].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
    if (claves.length) filas.push({ etiqueta: m[1], claves });
  }
  return filas;
}

const src = fs.readFileSync(FUENTE, 'utf8');
const ESTADOS = [
  ['income', 'buildIncomeRows'],
  ['balance', 'buildBalanceRows'],
  ['cashflow', 'buildCashflowRows'],
];

const vistas = { income: new Set(), balance: new Set(), cashflow: new Set() };
for (const tk of VALORES) {
  let datos;
  try {
    const r = await fetch(`${BASE}/api/financial-statements-full/${tk}`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    datos = await r.json();
  } catch (e) {
    console.error(`\nNo se pudo consultar ${tk}: ${e.message}`);
    console.error(`¿Está la aplicación levantada en ${BASE}?  (iniciar.bat)\n`);
    process.exit(2);
  }
  for (const [tab] of ESTADOS) {
    for (const anual of Object.values(datos[tab] || {})) {
      for (const [k, v] of Object.entries(anual)) if (v != null) vistas[tab].add(k);
    }
  }
}

let rotas = 0;
let respaldos = 0;
for (const [tab, constructor] of ESTADOS) {
  for (const { etiqueta, claves } of clavesPedidas(src, constructor)) {
    const viva = claves.find((k) => vistas[tab].has(k));
    if (!viva) {
      rotas++;
      // Sugerencia: claves reales que comparten alguna palabra con la pedida.
      const palabras = claves[0].split(' ').filter((w) => w.length > 3);
      const cerca = [...vistas[tab]]
        .filter((k) => palabras.some((w) => k.includes(w)))
        .sort()
        .slice(0, 4);
      console.log(`\n  ROTA  [${tab}] «${etiqueta}»`);
      console.log(`        pide: ${claves.map((k) => `"${k}"`).join(', ')}`);
      console.log(`        ninguna aparece en ${VALORES.join(', ')}`);
      if (cerca.length) console.log(`        parecidas que sí existen: ${cerca.join(' · ')}`);
    } else if (viva !== claves[0]) {
      respaldos++;
      console.log(`\n  AVISO [${tab}] «${etiqueta}» se sostiene por el respaldo "${viva}".`);
      console.log(`        La preferida "${claves[0]}" no aparece; conviene reordenar.`);
    }
  }
}

const total = ESTADOS.reduce((n, [, c]) => n + clavesPedidas(src, c).length, 0);
console.log(
  `\n${total} filas revisadas contra ${VALORES.length} valores · ` +
    `${rotas} con todas las claves rotas · ${respaldos} sostenidas por un respaldo`
);
process.exit(rotas ? 1 : 0);
