#!/usr/bin/env node
/**
 * ============================================================================
 * Identificadores usados y nunca declarados
 * ============================================================================
 * `npx tsc --noEmit` no ve los `.jsx`, y una búsqueda de texto tampoco basta:
 * el fallo que rompió `SMCPanelLive` era una variable llamada `r_` y sobrevivió
 * a un grep de `r(`. Este script recorre el AST y pregunta al ámbito, que es la
 * única forma de contestar bien.
 *
 * Uso:
 *   node scripts/verificar-ambitos.js                 # todo el frontend
 *   node scripts/verificar-ambitos.js components/x    # una carpeta
 *
 * Devuelve 1 si encuentra algo, para poder encadenarlo en un script de CI.
 */

const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;

const RAICES_POR_DEFECTO = ['app', 'components', 'lib', 'contexts', 'theme', 'utils', 'styles'];

/**
 * Globales del entorno. No se declaran en ningún archivo, así que sin esta
 * lista todas saldrían como falso positivo y el informe sería inservible.
 */
const GLOBALES = new Set([
  'console', 'window', 'document', 'setTimeout', 'clearTimeout', 'setInterval',
  'clearInterval', 'fetch', 'WebSocket', 'JSON', 'Math', 'Number', 'String',
  'Boolean', 'Object', 'Array', 'Date', 'Promise', 'Error', 'require', 'module',
  'process', 'globalThis', 'Infinity', 'NaN', 'undefined', 'Map', 'Set', 'WeakMap',
  'Symbol', 'RegExp', 'isNaN', 'isFinite', 'parseInt', 'parseFloat', 'React',
  '__DEV__', 'localStorage', 'sessionStorage', 'navigator', 'location', 'alert',
  'encodeURIComponent', 'decodeURIComponent', 'structuredClone', 'queueMicrotask',
  'AbortController', 'Intl', 'URL', 'URLSearchParams', 'FormData', 'Blob',
  'requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'atob', 'btoa',
  'ResizeObserver', 'IntersectionObserver', 'MutationObserver', 'CustomEvent',
  'Event', 'EventTarget', 'Image', 'CanvasRenderingContext2D', 'DOMParser',
]);

function ficheros(p, acc = []) {
  if (!fs.existsSync(p)) return acc;
  const st = fs.statSync(p);
  if (st.isFile()) {
    if (/\.(t|j)sx?$/.test(p) && !p.includes('node_modules')) acc.push(p);
    return acc;
  }
  for (const f of fs.readdirSync(p)) {
    if (f === 'node_modules' || f.startsWith('.')) continue;
    ficheros(path.join(p, f), acc);
  }
  return acc;
}

/**
 * ¿El identificador está dentro de una anotación de tipo?
 *
 * Babel NO registra interfaces ni alias de tipo como bindings de ámbito, así
 * que sin este filtro cada `Bloque<T>` de una firma saldría como «sin
 * declarar». Doscientos falsos positivos hacen que nadie vuelva a mirar el
 * informe, y entonces el script deja de servir para nada.
 *
 * `as const` y `!` son expresiones de valor, no anotaciones: esos sí entran.
 */
function enAnotacionDeTipo(ruta) {
  let n = ruta;
  while (n) {
    const t = n.node.type;
    if (
      t.startsWith('TS') &&
      t !== 'TSNonNullExpression' &&
      t !== 'TSAsExpression' &&
      t !== 'TSSatisfiesExpression'
    ) {
      return true;
    }
    n = n.parentPath;
  }
  return false;
}

const raices = process.argv.slice(2).length ? process.argv.slice(2) : RAICES_POR_DEFECTO;

let fallos = 0;
let revisados = 0;

for (const raiz of raices) {
  for (const f of ficheros(raiz)) {
    revisados += 1;
    const src = fs.readFileSync(f, 'utf8');
    let ast;
    try {
      ast = parser.parse(src, { sourceType: 'module', plugins: ['typescript', 'jsx'] });
    } catch (e) {
      console.log(`NO SE PUDO ANALIZAR  ${f}: ${e.message}`);
      fallos += 1;
      continue;
    }
    traverse(ast, {
      ReferencedIdentifier(p) {
        const nombre = p.node.name;
        if (GLOBALES.has(nombre)) return;
        if (enAnotacionDeTipo(p)) return;
        if (p.scope.hasBinding(nombre, true)) return;
        console.log(`SIN DECLARAR  ${f}:${p.node.loc.start.line}  ${nombre}`);
        fallos += 1;
      },
    });
  }
}

console.log(`\n${revisados} archivos revisados · ${fallos} identificadores sin declarar`);
process.exit(fallos ? 1 : 0);
