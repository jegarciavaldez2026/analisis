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

import React, { useCallback, useState } from 'react';
import { Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { useEstrategia } from '../../lib/estrategia/useEstrategia';
import { WS_HABILITADO } from '../../lib/estrategia/useWebSocket';

import Rejilla, { Col, Ruptura, rupturaDe } from './Rejilla';
import BarraKPI from './BarraKPI';
import BarraEstado from './BarraEstado';
import { BotonTerminal, Chip, D, Placa, Rotulo, T } from './Terminal';
import PanelActivo from './mercado/PanelActivo';
import PanelLiquidez from './mercado/PanelLiquidez';
import PerfilVolumen from './mercado/PerfilVolumen';
import ComparativaIndice from './mercado/ComparativaIndice';
import ClustersVolumen from './mercado/ClustersVolumen';
import GraficoMercado, { Rango } from './mercado/GraficoMercado';
import VolumeDelta from './mercado/VolumeDelta';
import SesgoMultiMarco from './analisis/SesgoMultiMarco';
import FaseMercado from './analisis/FaseMercado';
import SenalRobot from './robot/SenalRobot';
import ControlesRobot from './robot/ControlesRobot';
import PlanPosicion from './robot/PlanPosicion';
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
  const { colors, radius, hairline, numeric } = useTheme();
  const [borrador, setBorrador] = useState(simbolo);

  const enviar = useCallback(() => {
    const limpio = borrador.trim().toUpperCase();
    if (limpio && limpio !== simbolo) onSimbolo(limpio);
  }, [borrador, simbolo, onSimbolo]);

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 8,
        rowGap: 6,
        paddingBottom: 2,
      }}
    >
      <View style={{ gap: 1 }}>
        <Text style={[T.titular, { color: colors.ink }]}>Estrategia</Text>
        <Rotulo>Terminal de decisión · solo lectura</Rotulo>
      </View>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          paddingHorizontal: 8,
          minHeight: 28,
          borderRadius: radius.xs,
          borderWidth: hairline,
          borderColor: colors.rule,
          backgroundColor: colors.surfaceSunken,
        }}
      >
        <Ionicons name="search" size={12} color={colors.inkFaint} />
        <TextInput
          value={borrador}
          onChangeText={setBorrador}
          onSubmitEditing={enviar}
          onBlur={enviar}
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder="Símbolo"
          placeholderTextColor={colors.inkFaint}
          accessibilityLabel="Símbolo a analizar"
          style={[
            T.datoFuerte,
            numeric,
            { color: colors.ink, width: 74, paddingVertical: 4 },
            Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : null,
          ]}
        />
      </View>

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

  // Bandas 2 y 3. En tableta van a dos columnas (6/6/12), no a una: apilar
  // trece placas a ancho completo es lo que hacía que la pantalla se leyera
  // como una lista dispersa en vez de como un terminal.
  const vanoTres = { movil: 12, tableta: 6, escritorio: 3, ancho: 3 };
  const vanoCinco = { movil: 12, tableta: 6, escritorio: 5, ancho: 5 };
  const vanoCuatro = { movil: 12, tableta: 12, escritorio: 4, ancho: 4 };
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
      {/* Debajo de Ichimoku: las dos contestan a «en qué régimen estamos»,
          una por la nube y otra por el ciclo, y se leen seguidas. */}
      <FaseMercado bloque={estado.wyckoff} cargando={cargando} />
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

        {/* ---------- Banda inferior: tres columnas continuas ----------
            Antes esto eran DOS bandas, y cada banda es un corte de fila duro:
            la columna más corta dejaba el hueco en blanco hasta que arrancaba
            la siguiente, y con seis paneles de alturas muy distintas el hueco
            era enorme. Fusionadas en tres columnas que fluyen, cada una se
            apila a su propio ritmo y el blanco desaparece.

            El reparto no es arbitrario: a la izquierda lo que se mira de reojo
            (delta y movimientos), en el centro lo que necesita ancho (curvas y
            tablas de cifras) y a la derecha el contexto que se lee en vertical
            (noticias, eventos, calendario, alertas). */}
        <Rejilla ruptura={ruptura} hueco={D.hueco}>
          <Col vano={vanoTres}>
            <View style={{ gap: D.hueco }}>
              <VolumeDelta bloque={estado.volumeDelta} cargando={cargando} />
              <Transacciones bloque={estado.ordenes} cargando={cargando} />
            </View>
          </Col>
          <Col vano={vanoCinco}>
            <View style={{ gap: D.hueco }}>
              <RendimientoRobot
                curva={estado.curva}
                resumen={estado.resumen}
                cargando={cargando}
              />
              <EstadisticasRendimiento
                bloque={estado.resumen}
                operaciones={estado.operaciones}
                cargando={cargando}
              />
              <PanelBacktest
                bloque={estado.backtest}
                onEjecutar={ejecutarBacktest}
                ejecutando={ejecutandoBacktest}
                simbolo={simbolo}
              />
            </View>
          </Col>
          <Col vano={vanoCuatro}>
            <View style={{ gap: D.hueco }}>
              <PanelAlertas bloque={estado.alertas} cargando={cargando} />
              <PanelNoticias bloque={estado.noticias} cargando={cargando} />
              <EventosDelValor bloque={estado.eventos} cargando={cargando} />
              <EconomicCalendar />
            </View>
          </Col>
        </Rejilla>

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
