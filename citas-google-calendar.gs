/**
 * SINCRONIZACIÓN ENTRE LA HOJA "Citas" Y GOOGLE CALENDAR
 * ------------------------------------------------------
 * Cómo usarlo:
 *   1. Sube el libro a Google Sheets (Archivo → Importar, o arrastra el .xlsx a Drive y ábrelo con Sheets).
 *   2. Extensiones → Apps Script.
 *   3. Borra lo que haya y pega TODO este archivo. Guarda (icono del disquete).
 *   4. Recarga la hoja de cálculo: aparecerá un menú nuevo llamado "📅 Citas".
 *   5. La primera vez que ejecutes una función, Google pedirá autorización. Acéptala.
 *
 * Qué hace:
 *   · enviarACalendar()      → crea en tu Google Calendar las citas de la hoja que aún no estén creadas,
 *                              y actualiza las que hayas cambiado. El color del evento sigue la prioridad.
 *   · importarDesdeCalendar() → trae a la hoja los eventos de tu calendario del año elegido en D4.
 *   · Activadores (reloj, en el menú lateral de Apps Script) → puedes programar enviarACalendar()
 *     cada hora o cada día para que se sincronice solo.
 */

// ---- Configuración: si cambias la estructura de la hoja, ajusta esto ----
var HOJA        = 'Citas';
var FILA_INICIO = 62;    // primera fila de datos
var FILA_FIN    = 211;   // última fila de datos
var COL_FECHA   = 2;     // B
var COL_HORA    = 4;     // D
var COL_MIN     = 6;     // F
var COL_TITULO  = 7;     // G
var COL_QUIEN   = 13;    // M
var COL_LUGAR   = 16;    // P
var COL_PRIOR   = 19;    // S
var COL_ESTADO  = 22;    // V
var COL_EVENTID = 27;    // AA (oculta)
var CELDA_ANIO  = 'D4';
var CALENDARIO  = 'default';  // o el id de otro calendario: 'xxxx@group.calendar.google.com'

var COLORES = {
  '1': CalendarApp.EventColor.RED,
  '2': CalendarApp.EventColor.ORANGE,
  '3': CalendarApp.EventColor.BLUE,
  '4': CalendarApp.EventColor.GREEN
};

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('📅 Citas')
    .addItem('Enviar citas a Google Calendar', 'enviarACalendar')
    .addItem('Importar citas desde Google Calendar', 'importarDesdeCalendar')
    .addToUi();
}

function _cal() {
  return CALENDARIO === 'default'
    ? CalendarApp.getDefaultCalendar()
    : CalendarApp.getCalendarById(CALENDARIO);
}

function _hoja() {
  var h = SpreadsheetApp.getActive().getSheetByName(HOJA);
  if (!h) throw new Error('No encuentro la hoja "' + HOJA + '".');
  return h;
}

/** Convierte fecha + hora de la hoja en un objeto Date real. */
function _fechaHora(fecha, hora) {
  var d = new Date(fecha.getTime());
  var h = 0, m = 0;
  if (hora instanceof Date) { h = hora.getHours(); m = hora.getMinutes(); }
  else if (typeof hora === 'number') { h = Math.floor(hora * 24); m = Math.round((hora * 24 - h) * 60); }
  d.setHours(h, m, 0, 0);
  return d;
}

// =====================================================================
//  HOJA  ->  CALENDAR
// =====================================================================
function enviarACalendar() {
  var hoja = _hoja(), cal = _cal();
  var n = FILA_FIN - FILA_INICIO + 1;
  var datos = hoja.getRange(FILA_INICIO, 1, n, COL_EVENTID).getValues();
  var creados = 0, actualizados = 0, saltados = 0;

  for (var i = 0; i < n; i++) {
    var f = datos[i];
    var fecha  = f[COL_FECHA - 1];
    var titulo = String(f[COL_TITULO - 1] || '').trim();
    var estado = String(f[COL_ESTADO - 1] || '');
    var idEv   = String(f[COL_EVENTID - 1] || '').trim();

    if (!(fecha instanceof Date) || !titulo) { continue; }
    if (estado.indexOf('Cancelada') > -1) {
      if (idEv) {  // se canceló después de crearla: la borramos del calendario
        try { cal.getEventById(idEv).deleteEvent(); } catch (e) {}
        hoja.getRange(FILA_INICIO + i, COL_EVENTID).clearContent();
      }
      saltados++;
      continue;
    }

    var inicio = _fechaHora(fecha, f[COL_HORA - 1]);
    var mins   = Number(f[COL_MIN - 1]) || 60;
    var fin    = new Date(inicio.getTime() + mins * 60000);
    var lugar  = String(f[COL_LUGAR - 1] || '');
    var quien  = String(f[COL_QUIEN - 1] || '');
    var prior  = String(f[COL_PRIOR - 1] || '').charAt(0);
    var desc   = (quien ? 'Con: ' + quien + '\n' : '') +
                 (prior ? 'Prioridad: ' + f[COL_PRIOR - 1] + '\n' : '') +
                 'Creado desde la hoja Citas del libro de Tesorería.';

    var ev = null;
    if (idEv) { try { ev = cal.getEventById(idEv); } catch (e) { ev = null; } }

    if (ev) {
      ev.setTitle(titulo);
      ev.setTime(inicio, fin);
      ev.setLocation(lugar);
      ev.setDescription(desc);
      actualizados++;
    } else {
      ev = cal.createEvent(titulo, inicio, fin, { location: lugar, description: desc });
      hoja.getRange(FILA_INICIO + i, COL_EVENTID).setValue(ev.getId());
      creados++;
    }
    if (COLORES[prior]) { try { ev.setColor(COLORES[prior]); } catch (e) {} }
  }

  SpreadsheetApp.getActive().toast(
    creados + ' creadas · ' + actualizados + ' actualizadas · ' + saltados + ' canceladas',
    'Sincronización con Google Calendar', 8);
}

// =====================================================================
//  CALENDAR  ->  HOJA
// =====================================================================
function importarDesdeCalendar() {
  var hoja = _hoja(), cal = _cal();
  var anio = Number(hoja.getRange(CELDA_ANIO).getValue()) || new Date().getFullYear();
  var eventos = cal.getEvents(new Date(anio, 0, 1), new Date(anio + 1, 0, 1));

  var n = FILA_FIN - FILA_INICIO + 1;
  var datos = hoja.getRange(FILA_INICIO, 1, n, COL_EVENTID).getValues();

  // ids ya presentes, para no duplicar
  var ya = {};
  var primeraLibre = -1;
  for (var i = 0; i < n; i++) {
    var id = String(datos[i][COL_EVENTID - 1] || '').trim();
    if (id) ya[id] = true;
    if (primeraLibre < 0 && !datos[i][COL_FECHA - 1] && !datos[i][COL_TITULO - 1]) primeraLibre = i;
  }
  if (primeraLibre < 0) { SpreadsheetApp.getUi().alert('No quedan filas libres en el registro.'); return; }

  var fila = FILA_INICIO + primeraLibre, añadidos = 0;
  for (var k = 0; k < eventos.length; k++) {
    var ev = eventos[k];
    if (ya[ev.getId()]) continue;
    if (fila > FILA_FIN) break;
    var ini = ev.getStartTime(), fin = ev.getEndTime();
    var soloFecha = new Date(ini.getFullYear(), ini.getMonth(), ini.getDate());
    var mins = Math.round((fin - ini) / 60000);

    hoja.getRange(fila, COL_FECHA).setValue(soloFecha);
    hoja.getRange(fila, COL_HORA).setValue(ini.getHours() / 24 + ini.getMinutes() / 1440);
    hoja.getRange(fila, COL_MIN).setValue(mins);
    hoja.getRange(fila, COL_TITULO).setValue(ev.getTitle());
    hoja.getRange(fila, COL_LUGAR).setValue(ev.getLocation());
    hoja.getRange(fila, COL_PRIOR).setValue('3 · Media');
    hoja.getRange(fila, COL_ESTADO).setValue('2 · Confirmada');
    hoja.getRange(fila, COL_EVENTID).setValue(ev.getId());
    fila++; añadidos++;
  }

  SpreadsheetApp.getActive().toast(
    añadidos + ' citas importadas de ' + anio + '.', 'Importación desde Google Calendar', 8);
}
