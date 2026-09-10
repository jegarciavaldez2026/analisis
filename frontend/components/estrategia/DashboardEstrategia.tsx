/**
 * ============================================================================
 * Dashboard de Estrategia
 * ============================================================================
 * El terminal completo. Tres bandas de rejilla sobre 12 columnas:
 *
 *   ┌───────────────────────────────────────────────────────────────────┐
 *   │ CABECERA (símbolo, recarga, modo)                                 │
 *   ├───────────────────────────────────────────────────────────────────┤
 *   │ KPI ×10                                                           │
 *   ├──────────┬────────────────────────────────┬───────────────────────┤
 *   │ ACTIVO   │                                │ SEÑAL DEL ROBOT       │
 *   │ LIBRO    │  GRÁFICO + TÉCNICO/ICHI/VOL    │ CONTROLES             │
 *   │          │                                │ PLAN DE POSICIÓN      │
 *   ├──────────┼────────────────────────────────┼───────────────────────┤
 *   │ V. DELTA │ RENDIMIENTO                    │ CALENDARIO · NOTICIAS │
 *   ├──────────┼────────────────────────────────┼───────────────────────┤
 *   │ ÓRDENES  │ ESTADÍSTICAS                   │ BACKTEST · ALERTAS    │
 *   ├───────────────────────────────────────────────────────────────────┤
 *   │ BARRA DE ESTADO                                                   │
 *   └───────────────────────────────────────────────────────────────────┘
 *
 * En tableta las tres columnas se ordenan por importancia de lectura —gráfico,
 * robot, mercado, análisis— en vez de encogerse; en móvil hay una sola
 * columna. Encoger tres columnas de terminal a 375 px no da un terminal
 * pequeño, da doce paneles ilegibles.
 */

import React, { useState } from 'react';
import { Platform, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { useEstrategia } from '../../lib/estrategia/useEstrategia';
import { WS_HABILITADO } from '../../lib/estrategia/useWebSocket';

import Rejilla, { Col, Ruptura, rupturaDe } from './Rejilla';
import BarraKPI from './BarraKPI';
import BuscadorSimbolo from './BuscadorSimbolo';
import BarraEstado from './BarraEstado';
import { BotonTerminal, Chip, D, Placa, Rotulo, T } from './Terminal';
import PanelActivo from './mercado/PanelActivo';
import PanelLiquidez from './mercado/PanelLiquidez';
import PerfilVolumen from './mercado/PerfilVolumen';
import PanelFibonacci from './mercado/PanelFibonacci';
import PanelPivotes from './mercado/PanelPivotes';
import ComparativaIndice from './mercado/ComparativaIndice';
import ClustersVolumen from './mercado/ClustersVolumen';
import GraficoMercado, { Rango } from './mercado/GraficoMercado';
import VolumeDelta from './mercado/VolumeDelta';
import SesgoMultiMarco from './analisis/SesgoMultiMarco';
import FaseMercado from './analisis/FaseMercado';
import SenalRobot from './robot/SenalRobot';
import ControlesRobot from './robot/ControlesRobot';
import PlanPosicion from './robot/PlanPosicion';
import PanelNQE from './robot/PanelNQE';
import { PanelIchimoku, PanelVolatilidad } from './analisis/PanelesAnalisis';
import PanelTecnicoAmpliado from './analisis/PanelTecnicoAmpliado';
import {
  EstadisticasRendimiento,
  PanelBacktest,
  RendimientoRobot,
} from './cartera/PanelesCartera';
import {
  EventosDelValor,
  PanelAlertas,
  PanelNoticias,
  Transacciones,
} from './info/PanelesInfo';
// El calendario macro ya existía y tiene su propia fuente (Econdb con
// respaldo estimado, y rotula cuál de los dos está enseñando). Reutilizarlo
// es mejor que mantener un segundo calendario con otros datos.
import EconomicCalendar from '../market/EconomicCalendar';

/* ==========================================================================
 * Cabecera — buscador de símbolo y controles de la vista
 * ======================================================================== */

/** `mm:ss` para la cuenta atrás. Sin ceros raros ni negativos. */
function relojCorto(segundos: number): string {
  const s = Math.max(0, Math.floor(segundos));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function Cabecera({
  simbolo,
  onSimbolo,
  onRecargar,
  cargando,
  consenso,
  refrescando,
  autoRefresco,
  onAutoRefresco,
  segundosParaRefresco,
  falloRefresco,
}: {
  simbolo: string;
  onSimbolo: (s: string) => void;
  onRecargar: () => void;
  cargando: boolean;
  consenso: string | null;
  refrescando: boolean;
  autoRefresco: boolean;
  onAutoRefresco: (v: boolean) => void;
  segundosParaRefresco: number;
  falloRefresco: string | null;
}) {
  const { colors } = useTheme();

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 8,
        rowGap: 6,
        paddingBottom: 2,
        // El desplegable de sugerencias se dibuja en absoluto y tiene que
        // caer SOBRE la franja de KPIs, que es su hermana posterior. Sin este
        // `zIndex` en la cabecera entera, el `zIndex` interno del buscador no
        // sirve de nada: compite dentro de su propio nivel de apilado.
        zIndex: 300,
      }}
    >
      <View style={{ gap: 1 }}>
        <Text style={[T.titular, { color: colors.ink }]}>Estrategia</Text>
        <Rotulo>Terminal de decisión · solo lectura</Rotulo>
      </View>

      {/* Antes esto era un campo de texto pelado que sólo aceptaba el ticker
          exacto: escribir «ford» mandaba FORD y el backend devolvía 404.
          Ahora es el mismo autocompletado de la pantalla de Análisis —mismo
          endpoint `/search`, misma amortiguación— así que se puede buscar por
          nombre de empresa. Ver `BuscadorSimbolo` para las trampas. */}
      <BuscadorSimbolo simbolo={simbolo} onElegir={onSimbolo} deshabilitado={cargando} />

      <BotonTerminal
        texto={cargando ? 'Cargando' : refrescando ? 'Actualizando' : 'Recargar'}
        icono="refresh"
        onPress={onRecargar}
        deshabilitado={cargando || refrescando}
      />

      {/* Interruptor de la recarga automática con su cuenta atrás.
          Es un botón, no un distintivo: el reloj corriendo da el movimiento y
          pulsarlo lo para. Un contador que no se puede detener es una molestia,
          no una función. */}
      <BotonTerminal
        texto={
          !autoRefresco
            ? 'Auto: apagado'
            : refrescando
              ? 'Actualizando…'
              : `Auto ${relojCorto(segundosParaRefresco)}`
        }
        icono={autoRefresco ? 'sync' : 'pause'}
        tono={autoRefresco ? 'accent' : 'neutral'}
        onPress={() => onAutoRefresco(!autoRefresco)}
        style={Platform.OS === 'web' ? ({ minWidth: 118 } as any) : undefined}
      />

      {/* Un refresco fallido NO borra la pantalla: se avisa y se sigue
          enseñando la lectura anterior, que es de hace minutos, no de otro día. */}
      {falloRefresco ? (
        <Chip texto="Último refresco falló · sigue la lectura anterior" tono="caution" icono="alert-circle-outline" />
      ) : null}

      {consenso ? <Chip texto={`Consenso MTF: ${consenso}`} tono="accent" /> : null}
      <Chip texto="Paper · sin ejecución" tono="caution" icono="shield-outline" />
      {!WS_HABILITADO ? <Chip texto="Sin flujo en vivo" icono="cloud-offline-outline" /> : null}
    </View>
  );
}

/* ==========================================================================
 * Aviso de alcance — se dice una vez, arriba, y no se repite en cada panel
 * ======================================================================== */

function AvisoAlcance() {
  const { colors, palette, radius, hairline } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: 8,
        padding: 8,
        borderRadius: radius.xs,
        borderWidth: hairline,
        borderColor: palette.caution,
        backgroundColor: palette.cautionWash,
      }}
      accessibilityRole="alert"
    >
      <Ionicons name="information-circle" size={14} color={palette.caution} style={{ marginTop: 1 }} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[T.datoFuerte, { color: palette.caution }]}>
          Análisis y backtest — sin ejecución
        </Text>
        <Text style={[T.dato, { color: colors.inkMuted, lineHeight: 16 }]}>
          Señal, score, confluencia multi-marco, riesgo, tamaño y backtest sin look-ahead, todo
          sobre datos reales. Lo que NO hay es ejecución: ni bróker conectado, ni paper trading,
          ni órdenes. Sin libro de nivel II —yfinance no lo sirve— el robot no cronometra la
          entrada al segundo; en su lugar mide liquidez (horquilla estimada por Corwin-Schultz,
          impacto por Amihud y volumen medio) y con eso acota el tamaño de la posición.
        </Text>
      </View>
    </View>
  );
}

/* ==========================================================================
 * Dashboard
 * ======================================================================== */

export default function DashboardEstrategia({
  ancho,
  simboloInicial = 'PBF',
  onSimbolo,
}: {
  /** Ancho útil del contenedor. Lo mide la pantalla, no la ventana. */
  ancho: number;
  simboloInicial?: string;
  /** Propaga el símbolo al resto de la aplicación (Overton lo sigue). */
  onSimbolo?: (s: string) => void;
}) {
  const { colors, space } = useTheme();
  const { token } = useAuth();

  const {
    estado,
    mtf,
    marco,
    setMarco,
    rango,
    setRango,
    simbolo,
    setSimbolo,
    recargar,
    cargando,
    telemetria,
    controles,
    setControles,
    proximaDecisionS,
    ejecutarBacktest,
    ejecutandoBacktest,
    refrescando,
    autoRefresco,
    setAutoRefresco,
    segundosParaRefresco,
    falloRefresco,
  } = useEstrategia(simboloInicial, token);

  const ruptura: Ruptura = rupturaDe(ancho);
  const compacto = ruptura === 'movil' || ruptura === 'tableta';
  /**
   * Columnas de la franja de KPIs.
   *
   * `escritorio` bajó de 10 a 5 y no es una preferencia: a 1000-1400 px de
   * ancho útil, diez celdas dejan ~84 px de contenido por celda, y ahí un
   * importe de siete cifras no cabe. Antes envolvía a varias líneas y
   * descuadraba la franja entera; ahora se recortaría, que se lee peor que
   * partir en dos filas de cinco. Diez en una línea sólo se sostienen a
   * partir de 1400 px.
   */
  const columnasKPI = ruptura === 'ancho' ? 10 : ruptura === 'escritorio' ? 5 : ruptura === 'tableta' ? 5 : 2;

  /* --- Vanos por banda. Escritorio: 2 / 6 / 4, igual que la maqueta. --- */
  const vanoIzquierda = { movil: 12, tableta: 12, escritorio: 3, ancho: 2 };
  const vanoCentro = { movil: 12, tableta: 12, escritorio: 5, ancho: 6 };
  const vanoDerecha = { movil: 12, tableta: 12, escritorio: 4, ancho: 4 };

  // Reparto de TABLETA: ahí las tres columnas no caben y el robot y el activo
  // van a la par debajo del gráfico. Apilar las placas a ancho completo es lo
  // que hacía que la pantalla se leyera como una lista dispersa en vez de
  // como un terminal.
  //
  // Aquí había también `vanoTres`, `vanoCinco` y `vanoCuatro`, de cuando la
  // banda inferior tenía tres columnas con delta, cartera y contexto. Todo eso
  // está ya repartido por las columnas y la banda se quedó con una sola placa,
  // así que se quitaron en vez de dejarlos como resto arqueológico.
  const vanoMitad = { movil: 12, tableta: 6, escritorio: 6, ancho: 6 };

  /**
   * Columna izquierda: el detalle del activo.
   *
   * Análisis técnico y volatilidad viven aquí, debajo de «Activo
   * seleccionado», porque las tres placas contestan a la misma pregunta —qué
   * está haciendo ESTE valor— y se leen seguidas. Antes colgaban del gráfico,
   * que es donde se mira el precio, no donde se leen las lecturas.
   */
  const bloqueMercado = (
    <View style={{ gap: D.hueco }}>
      <PanelActivo bloque={estado.mercado} cargando={cargando} />
      {/* Justo debajo del activo: la alternativa a comprar ESTE valor es
          comprar el índice y no hacer nada, así que las dos lecturas van
          seguidas. Un +40 % con el índice en +45 % es una mala elección. */}
      <ComparativaIndice bloque={estado.comparativa} cargando={cargando} />
      <PanelTecnicoAmpliado bloque={estado.tecnicoAmpliado} cargando={cargando} />
      <PanelVolatilidad bloque={estado.volatilidad} cargando={cargando} />
      {/* Antes aquí iba el libro de nivel II, que con esta fuente no puede
          tener datos nunca. En su lugar va lo que sí se mide y además es lo
          que decide el tamaño de la posición: horquilla estimada, impacto por
          dólar y volumen medio. Ver `PanelLiquidez`. */}
      <PanelLiquidez bloque={estado.liquidez} cargando={cargando} />
      {/* Volume delta cierra la columna, pegado a liquidez: las dos miden
          PRESIÓN —una por reparto compra/venta, otra por lo que cuesta
          moverse— y se leen seguidas. En estos ~230 px la tarjeta va en su
          versión de tres columnas; ver la cabecera de `VolumeDelta`. */}
      <VolumeDelta bloque={estado.volumeDelta} cargando={cargando} />
    </View>
  );

  const bloqueCentro = (
    <View style={{ gap: D.hueco }}>
      <GraficoMercado
        bloque={estado.serie}
        cargando={cargando}
        marco={marco}
        onMarco={setMarco}
        rango={rango as Rango}
        onRango={setRango}
        simbolo={simbolo}
        compacto={compacto}
      />
      {/* El perfil va pegado al gráfico y no en otra banda: POC, VAH y VAL son
          alturas de precio, y se leen contra las velas que tienen justo
          encima. Separarlos obligaría a recordar el número en vez de mirarlo. */}
      <PerfilVolumen bloque={estado.serie} cargando={cargando} />
      <PanelIchimoku bloque={estado.ichimoku} cargando={cargando} />
      {/* NQE va DEBAJO DE ICHIMOKU porque es donde el usuario lo busca, y esa
          razón manda sobre cualquier argumento de maqueta. Sigue en la columna
          ancha —con 400 px cada vela mide 2 px y el cuerpo desaparece— y trae
          su propio marco, porque el indicador está pensado para 1H-4H y no
          para el marco del gráfico principal.

          Historial, para no volver a moverlo: primero estuvo al final de la
          columna del robot (no se encontraba, 1.402 px de scroll), luego entre
          la confluencia y los mandos, y después pegado al gráfico principal.
          Tres mudanzas que nadie pidió. Se queda aquí. */}
      <PanelNQE simbolo={simbolo} compacto={compacto} />
      {/* Y el ciclo de Wyckoff cierra: la nube, la señal y el ciclo contestan
          los tres a «en qué régimen estamos», y se leen seguidos. */}
      <FaseMercado bloque={estado.wyckoff} cargando={cargando} />
      {/* Rendimiento, estadísticas, transacciones y backtest cierran la
          columna central. Estaban en la banda inferior; aquí heredan el ancho
          del gráfico, que es el que necesitan: son curvas y tablas de cifras,
          y en una columna estrecha se recortan. */}
      <RendimientoRobot curva={estado.curva} resumen={estado.resumen} cargando={cargando} />
      <EstadisticasRendimiento
        bloque={estado.resumen}
        operaciones={estado.operaciones}
        cargando={cargando}
      />
      <Transacciones bloque={estado.ordenes} cargando={cargando} />
      <PanelBacktest
        bloque={estado.backtest}
        onEjecutar={ejecutarBacktest}
        ejecutando={ejecutandoBacktest}
        simbolo={simbolo}
      />
    </View>
  );

  const bloqueRobot = (
    <View style={{ gap: D.hueco }}>
      <SenalRobot
        bloque={estado.senal}
        cargando={cargando}
        proximaDecisionS={proximaDecisionS}
        robotActivo={controles.estado === 'activo'}
      />
      {/* La confluencia va junto a la señal, que es lo que matiza: leer
          «COMPRAR» sin ver que el marco semanal va en contra es media
          lectura. */}
      <SesgoMultiMarco mtf={mtf} />
      <ControlesRobot controles={controles} onCambio={setControles} />
      <PlanPosicion
        bloque={estado.posicion}
        cargando={cargando}
        controles={controles}
        cartera={estado.resumen}
        liquidez={estado.liquidez}
      />
      {/* Tarjeta propia, debajo del plan: la rejilla del footprint con lo que
          sí se puede medir. Sigue al marco del gráfico, así que en 5m se
          convierte en una rejilla intradía de verdad. */}
      <ClustersVolumen bloque={estado.serie} cargando={cargando} marco={marco} />
      {/* Fibonacci va debajo de los clusters y cierra la columna: las dos
          contestan «a qué precios importa esto» —una por volumen negociado, la
          otra por estructura del impulso— y se leen seguidas. Trae sus propios
          marcos (5m a 1S) porque un retroceso se mira en el marco de la
          operación, no en el del gráfico principal. */}
      <PanelFibonacci simbolo={simbolo} />
      {/* Pivotes debajo de Fibonacci y cierra la columna: las tres últimas
          placas contestan «a qué precios importa esto» —volumen negociado,
          estructura del impulso y niveles del periodo anterior— y se leen
          seguidas. Trae sus propios marcos porque un pivote se mira en el de
          la operación, no en el del gráfico principal. */}
      <PanelPivotes simbolo={simbolo} />
      {/* Alertas y noticias cierran la columna del robot. Están aquí y no en
          la banda inferior porque son MODIFICADORES DE LA DECISIÓN, no
          contexto de lectura pausada: una alerta de volatilidad o un titular
          con impacto cambian el tamaño de la posición que se decide arriba, y
          leerlos a tres pantallas de distancia de la señal es leerlos tarde.
          Ninguno de los dos genera compras ni ventas por sí solo — eso ya está
          decidido en el producto. */}
      <PanelAlertas bloque={estado.alertas} cargando={cargando} />
      <PanelNoticias bloque={estado.noticias} cargando={cargando} />
      {/* El calendario cierra la columna, debajo de las noticias: las dos son
          modificadores de confianza y ninguna ordena una operación. Va en su
          variante COMPACTA —una fila por evento— porque con la métrica del
          producto siete eventos se comían media pantalla en estos ~455 px. */}
      <EconomicCalendar compacto />
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <ScrollView
        contentContainerStyle={{ padding: D.hueco, gap: D.hueco, paddingBottom: space.xxl }}
        showsVerticalScrollIndicator={Platform.OS === 'web'}
      >
        <Cabecera
          simbolo={simbolo}
          onSimbolo={(s) => {
            setSimbolo(s);
            // Se avisa fuera para que el símbolo activo sea el mismo en toda
            // la aplicación. Sin esto, Overton seguiría en otro valor.
            onSimbolo?.(s);
          }}
          onRecargar={recargar}
          cargando={cargando}
          consenso={mtf?.consenso && mtf.consenso !== 'sin_datos' ? mtf.consenso : null}
          refrescando={refrescando}
          autoRefresco={autoRefresco}
          onAutoRefresco={setAutoRefresco}
          segundosParaRefresco={segundosParaRefresco}
          falloRefresco={falloRefresco}
        />

        <AvisoAlcance />

        <BarraKPI bloque={estado.resumen} cargando={cargando} columnas={columnasKPI} />

        {/* ---------- Banda 1: mercado · gráfico · robot ---------- */}
        {ruptura === 'movil' ? (
          // Una columna. Manda el orden de lectura, no la maqueta: primero el
          // gráfico, luego la decisión, luego el detalle del activo.
          <View style={{ gap: D.hueco }}>
            {bloqueCentro}
            {bloqueRobot}
            {bloqueMercado}
          </View>
        ) : ruptura === 'tableta' ? (
          // Dos columnas: el gráfico ocupa la banda entera porque necesita
          // ancho para que las velas se distingan, y debajo van a la par la
          // decisión y el detalle del activo.
          <View style={{ gap: D.hueco }}>
            {bloqueCentro}
            <Rejilla ruptura={ruptura} hueco={D.hueco}>
              <Col vano={vanoMitad}>{bloqueRobot}</Col>
              <Col vano={vanoMitad}>{bloqueMercado}</Col>
            </Rejilla>
          </View>
        ) : (
          <Rejilla ruptura={ruptura} hueco={D.hueco}>
            <Col vano={vanoIzquierda}>{bloqueMercado}</Col>
            <Col vano={vanoCentro}>{bloqueCentro}</Col>
            <Col vano={vanoDerecha}>{bloqueRobot}</Col>
          </Rejilla>
        )}

        {/* ---------- Cierre: los eventos del valor ----------
            Lo último que queda en la banda. Va a ancho completo y sin rejilla:
            con una sola placa, una rejilla de dos o tres columnas deja el
            resto en blanco hasta el final de la página.

            Se queda abajo a propósito. Son las fechas del VALOR —resultados,
            dividendos—, y a diferencia de las alertas y las noticias no
            modifican la decisión de hoy: acotan cuándo NO conviene tener la
            posición abierta, que es una lectura de calendario, no de pantalla. */}
        <EventosDelValor bloque={estado.eventos} cargando={cargando} />

        {/* Error global: si /overton no responde, se dice una vez y con salida */}
        {estado.estado === 'error' && estado.error ? (
          <Placa titulo="El análisis no se pudo cargar">
            <View style={{ gap: 6 }}>
              <Text style={[T.dato, { color: colors.inkMuted }]}>{estado.error}</Text>
              <BotonTerminal texto="Reintentar" icono="refresh" onPress={recargar} />
            </View>
          </Placa>
        ) : null}
      </ScrollView>

      <BarraEstado telemetria={telemetria} />
    </View>
  );
}

/** Punto de entrada sin props: mide su propio ancho. */
export function DashboardAutoAncho({
  simboloInicial,
  onSimbolo,
}: {
  simboloInicial?: string;
  onSimbolo?: (s: string) => void;
}) {
  const [ancho, setAncho] = useState(0);
  return (
    <View
      style={{ flex: 1 }}
      onLayout={(e) => {
        const w = e.nativeEvent.layout.width;
        setAncho((previo) => (Math.abs(previo - w) > 1 ? w : previo));
      }}
    >
      {ancho > 0 ? (
        <DashboardEstrategia ancho={ancho} simboloInicial={simboloInicial} onSimbolo={onSimbolo} />
      ) : null}
    </View>
  );
}
