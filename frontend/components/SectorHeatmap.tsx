/**
 * Mapa de calor por sector.
 *
 * Cada valor analizado es un rectángulo: el **área** ordena por tamaño de la
 * empresa —en escala comprimida, ver `EXPONENTE_AREA`— y el **color** dice
 * cuánto se ha movido hoy. Los sectores se agrupan en bloques, dimensionados
 * por la suma de sus valores.
 *
 * Son dos tarjetas: el mosaico en una y la escala de color con la hora de los
 * precios en otra. Juntas, la última fila de celdas y la leyenda se leían como
 * si la leyenda formara parte del mapa.
 *
 * El reparto usa el algoritmo *squarified*: en vez de partir siempre en la
 * misma dirección —que produce tiras larguísimas e ilegibles cuando un valor
 * es mucho mayor que otro— acumula rectángulos en filas mientras la relación
 * de aspecto mejore, y corta cuando empeora. Es lo que hace que un mapa de
 * mercado se lea; con cortes ingenuos, no.
 *
 * Universo: los valores de TU historial, no el mercado entero. La app no tiene
 * un censo de mercado y fabricarlo sería inventar datos.
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  LayoutChangeEvent,
  Platform,
  Pressable,
  Share,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../contexts/ThemeContext';
import { heatCell, inkOn, mix, Palette } from '../theme/tokens';
import { Legend, Panel, Rule } from './ui';

export interface HeatmapItem {
  ticker: string;
  company_name?: string;
  sector?: string;
  market_cap?: number;
  price_change_percent?: number;
  current_price?: number;
}

interface Rect { x: number; y: number; w: number; h: number }

/** Extremo de la escala de color, en puntos porcentuales. */
const EXTREMO = 3;
/**
 * Huecos del mosaico. No son bordes dibujados sobre las celdas: es el papel
 * del panel asomando entre ellas. Por eso hay dos medidas y no una — el
 * espacio que separa dos sectores tiene que leerse claramente mayor que el que
 * separa dos valores del mismo sector, o el ojo agrupa mal y un bloque parece
 * continuar dentro del siguiente.
 */
const HUECO = 2;
const HUECO_SECTOR = 6;
/**
 * Borde del bloque de sector. Es el nivel 1 de la jerarquía: sin él, el rótulo
 * del sector flotaba sobre un fondo del mismo color que el panel y no se leía
 * como la cabecera de un contenedor, sino como una etiqueta suelta encima de
 * unas celdas. Con borde, cabecera y celdas son una sola pieza.
 */
const BORDE_SECTOR = 2;
/** Por debajo de esto el ticker no cabe y la celda pasa al montón de «…». */
const MIN_ANCHO = 34;
const MIN_ALTO = 24;
/** A partir de aquí sobra sitio para rotular también el nombre de la empresa.
 *  Bajados de 116×78: con la tipografía más pequeña el nombre cabe en celdas
 *  bastante menores, y así aparece en muchas más. */
const NOMBRE_ANCHO = 94;
const NOMBRE_ALTO = 62;
/**
 * Área mínima de un bloque de sector, en px². Un sector necesita sitio para su
 * rótulo y para al menos una fila de celdas legibles; por debajo de eso no es
 * un bloque, es una viruta con el nombre recortado.
 *
 * Sin este suelo, los sectores de la cola quedaban en 58 × 56 px: 20 de rótulo
 * y 30 para las celdas, o sea todo amontonado en la esquina. Con él, el peor
 * bloque pasa a 165 × 73 y el sector mayor sólo cede un 4 % de su área.
 */
const AREA_MIN_SECTOR = 12000;
/** Alto mínimo de una fila de sectores y ancho mínimo de un bloque dentro. */
const ALTO_MIN_FILA = 110;
const ANCHO_MIN_SECTOR = 116;
/** Etiqueta de los valores que llegan sin sector. No es un sector: es un hueco. */
const SIN_SECTOR = 'Sin sector';

/**
 * Fondo de las celdas que no codifican una variación: las que llegan sin
 * precio y las que no se han movido.
 *
 * `heatCell` devuelve para esos casos el gris hundido del tema, y ahí estaba el
 * problema que se veía como «espacios en blanco»: contra el papel del panel ese
 * gris da 1,12:1 de contraste, o sea que es el mismo color. Una empresa sin
 * precio se dibujaba, ocupaba su sitio, y era invisible. Como la mayoría del
 * historial llega sin cotización en vivo, sectores enteros parecían vacíos con
 * una sola celda de color dentro.
 *
 * Este gris da 1,48:1: sigue siendo neutro —no dice ni sube ni baja— pero se ve
 * que hay una celda.
 */
const neutroVisible = (palette: Palette) => mix(palette.surfaceSunken, palette.ink, 0.14);

/* ── Reparto squarified ─────────────────────────────────────────────────────
 * Devuelve un rectángulo por peso, dentro del rectángulo dado.
 * Referencia: Bruls, Huizing y van Wijk (2000).
 * ------------------------------------------------------------------------ */
function squarify(pesos: number[], marco: Rect): Rect[] {
  const total = pesos.reduce((a, b) => a + b, 0);
  if (total <= 0 || !pesos.length) return pesos.map(() => ({ ...marco, w: 0, h: 0 }));

  const area = marco.w * marco.h;
  const escalados = pesos.map((p) => (p / total) * area);
  const salida: Rect[] = new Array(pesos.length);

  let libre: Rect = { ...marco };
  let i = 0;

  /** Peor relación de aspecto de una fila; menor es mejor (1 = cuadrado). */
  const peorAspecto = (fila: number[], lado: number) => {
    const suma = fila.reduce((a, b) => a + b, 0);
    if (suma <= 0 || lado <= 0) return Infinity;
    const max = Math.max(...fila);
    const min = Math.min(...fila);
    const l2 = lado * lado;
    const s2 = suma * suma;
    return Math.max((l2 * max) / s2, s2 / (l2 * min));
  };

  while (i < escalados.length) {
    const horizontal = libre.w >= libre.h;
    const lado = horizontal ? libre.h : libre.w;
    const fila: number[] = [];
    let j = i;

    // Se añaden piezas mientras la fila mejore; en cuanto empeora, se corta.
    while (j < escalados.length) {
      const candidata = [...fila, escalados[j]];
      if (fila.length && peorAspecto(candidata, lado) > peorAspecto(fila, lado)) break;
      fila.push(escalados[j]);
      j++;
    }

    const sumaFila = fila.reduce((a, b) => a + b, 0);
    const grosor = lado > 0 ? sumaFila / lado : 0;
    let desplazamiento = 0;

    fila.forEach((valor, k) => {
      const largo = sumaFila > 0 ? (valor / sumaFila) * lado : 0;
      salida[i + k] = horizontal
        ? { x: libre.x, y: libre.y + desplazamiento, w: grosor, h: largo }
        : { x: libre.x + desplazamiento, y: libre.y, w: largo, h: grosor };
      desplazamiento += largo;
    });

    if (horizontal) {
      libre = { x: libre.x + grosor, y: libre.y, w: Math.max(libre.w - grosor, 0), h: libre.h };
    } else {
      libre = { x: libre.x, y: libre.y + grosor, w: libre.w, h: Math.max(libre.h - grosor, 0) };
    }
    i += fila.length;
  }

  return salida;
}

/**
 * Reparto en filas que RESPETA EL ORDEN de entrada.
 *
 * El reparto *squarified* de arriba reordena por tamaño; es lo que le permite
 * dar bloques casi cuadrados, y por eso lo usan las celdas dentro de cada
 * sector. Pero los sectores van en orden alfabético, y alimentar squarify con
 * ese orden lo rompe: medido con este mismo universo daba una tira de 1.640 ×
 * 19 px —35:1— y dos sectores sin sitio para una sola celda.
 *
 * Así que los sectores se reparten en filas de lectura, izquierda a derecha y
 * arriba abajo, con dos suelos: una fila no se cierra hasta reunir el área que
 * le da el alto mínimo, y dentro de la fila ningún sector baja del ancho
 * mínimo. Comparado con squarify sobre el mismo universo, el peor alto útil
 * sube de 58 a 79 px y se ven más empresas, a cambio de filas más alargadas.
 */
function enFilas(pesos: number[], marco: Rect, altoMin: number, anchoMin: number): Rect[] {
  const total = pesos.reduce((a, b) => a + b, 0);
  if (total <= 0 || !pesos.length) return pesos.map(() => ({ ...marco, w: 0, h: 0 }));

  const area = marco.w * marco.h;
  const escalados = pesos.map((p) => (p / total) * area);
  const n = escalados.length;
  const filas = Math.max(1, Math.min(n, Math.floor(marco.h / altoMin)));
  const objetivo = area / filas;
  const areaMinFila = altoMin * marco.w;

  // Se cierra la fila cuando reúne área suficiente. Sin el suelo de área
  // quedaban filas de 8 px: en orden alfabético los sectores grandes caen
  // donde caen, y una fila de dos pequeños no levanta ni el rótulo.
  const grupos: number[][] = [];
  let grupo: number[] = [];
  let acumulado = 0;
  for (let k = 0; k < n; k++) {
    grupo.push(k);
    acumulado += escalados[k];
    if (acumulado >= Math.max(objetivo * 0.75, areaMinFila) && k < n - 1) {
      grupos.push(grupo);
      grupo = [];
      acumulado = 0;
    }
  }
  if (grupo.length) {
    // El resto, si no da para una fila propia, se suma a la anterior.
    if (acumulado < areaMinFila && grupos.length) grupos[grupos.length - 1].push(...grupo);
    else grupos.push(grupo);
  }

  /** Sube los anchos que no llegan al mínimo y descuenta a los que sobran. */
  const conSueloAncho = (anchos: number[], totalAncho: number, minimo: number) => {
    let a = [...anchos];
    for (let pasada = 0; pasada < 6; pasada++) {
      const bajos = a.map((w, i) => (w < minimo - 0.01 ? i : -1)).filter((i) => i >= 0);
      if (!bajos.length) break;
      const resto = totalAncho - bajos.length * minimo;
      const sumaAltos = a.reduce((s, w, i) => (bajos.includes(i) ? s : s + w), 0);
      if (resto <= 0 || sumaAltos <= 0) {
        a = a.map(() => totalAncho / a.length);
        break;
      }
      a = a.map((w, i) => (bajos.includes(i) ? minimo : (w * resto) / sumaAltos));
    }
    return a;
  };

  const salida: Rect[] = new Array(n);
  let y = marco.y;
  for (const g of grupos) {
    const suma = g.reduce((a, k) => a + escalados[k], 0);
    const alto = suma / marco.w;
    const anchos = conSueloAncho(
      g.map((k) => escalados[k] / alto),
      marco.w,
      Math.min(anchoMin, marco.w / g.length),
    );
    let x = marco.x;
    g.forEach((k, idx) => {
      salida[k] = { x, y, w: anchos[idx], h: alto };
      x += anchos[idx];
    });
    y += alto;
  }
  return salida;
}

/**
 * Sube al mínimo legible los pesos que no llegan, y reparte el ajuste entre
 * todos al recalcular el total. Se repite porque cada subida cambia el total y
 * por tanto el umbral; converge en dos o tres pasadas.
 *
 * Esto se aplica sólo al reparto entre SECTORES. Dentro de un sector no hace
 * falta: ahí las celdas que no llegan al mínimo ya se agrupan en la celda «+N»,
 * que es un mecanismo mejor porque no deforma nada. Entre sectores no cabe esa
 * salida —un sector no se puede plegar dentro de otro sin mentir sobre a qué
 * pertenece cada empresa—, así que se le garantiza un tamaño mínimo.
 */
function pesosConSuelo(pesos: number[], area: number): number[] {
  let ajustados = [...pesos];
  for (let pasada = 0; pasada < 6; pasada++) {
    const total = ajustados.reduce((a, b) => a + b, 0);
    if (total <= 0) return ajustados;
    const minimo = (AREA_MIN_SECTOR / area) * total;
    let cambio = false;
    ajustados = ajustados.map((w) => {
      if (w >= minimo) return w;
      cambio = true;
      return minimo;
    });
    if (!cambio) break;
  }
  return ajustados;
}

/** Capitalización cruda. Es el dato, sin tocar: se usa para ponderar la media
 *  del sector, que es una cifra financiera y no puede salir de una escala
 *  deformada para que el dibujo quede bonito. */
const capitalizacion = (v: HeatmapItem) => Math.max(v.market_cap ?? 0, 0);

/**
 * Compresión de la escala de área. Aquí está la diferencia entre un mapa que
 * se lee y uno que no.
 *
 * Un historial real mezcla una empresa de 4,4 billones con otras de 5.000
 * millones, y con unas cuantas que llegan sin capitalización y caen al mínimo.
 * Eso es un recorrido de 44.000:1. Repartir el área en proporción directa a
 * ese número no es un mapa: la mayor se queda con el 99,5 % de su sector y
 * todas las demás salen por debajo del píxel. Medido sobre un universo como el
 * del historial, en proporción directa quedaban 9 valores visibles de 55 y
 * seis sectores aplastados a un bloque de 1 px de alto, apilados en una
 * esquina. Con el exponente de abajo salen los 55 y ningún sector aplastado.
 *
 * El exponente 0,35 conserva lo que el mapa tiene que decir —el orden y quién
 * pesa más: la mayor sigue siendo unas 40 veces la menor— y sacrifica la
 * proporcionalidad exacta, que en este recorrido de magnitudes no se podía
 * representar de todas formas. Por eso el rótulo del panel dice «escala
 * comprimida» y no «área = capitalización» a secas: el área ordena, no mide.
 *
 * Sin capitalización se aplica un mínimo, para que el valor siga apareciendo
 * —pequeño— en vez de desaparecer del mapa.
 */
const EXPONENTE_AREA = 0.35;
const peso = (v: HeatmapItem) => Math.max(v.market_cap ?? 0, 1e8) ** EXPONENTE_AREA;

/**
 * Reparte un sector dejando fuera lo que no se puede rotular.
 *
 * Una celda de 12 px no cabe un ticker, así que antes salía en blanco: una
 * mancha de color sin nombre que no se puede leer ni tocar con el dedo. Se
 * agrupan todas esas en una sola celda «…», que sí es legible y sí se puede
 * abrir. La celda de resto entra en el reparto con la suma de sus pesos, así
 * que sigue ocupando el área que le corresponde: no se esconde nada, se
 * reagrupa.
 */
function repartirSector(valores: HeatmapItem[], marco: Rect) {
  const reparto = (visibles: number) => {
    const resto = valores.slice(visibles);
    const pesos = valores.slice(0, visibles).map(peso);
    // La celda de resto entra en el reparto con la suma de los pesos que
    // agrupa, asi que conserva el area de lo que representa.
    if (resto.length) pesos.push(resto.reduce((a, v) => a + peso(v), 0));
    return { visibles: valores.slice(0, visibles), resto, rects: squarify(pesos, marco) };
  };

  // Al retirar una celda las que quedan crecen, asi que hay que volver a
  // medir. Se baja de una en una hasta que todas las rotuladas caben: pararse
  // antes dejaba celdas de 20 px con un ticker recortado dentro, que es
  // justo lo que este mecanismo existe para evitar.
  let visibles = valores.length;
  while (visibles > 1) {
    const r = reparto(visibles);
    const caben = r.rects
      .slice(0, visibles)
      .every((c) => c.w >= MIN_ANCHO && c.h >= MIN_ALTO);
    if (caben) return r;
    visibles -= 1;
  }
  return reparto(1);
}

/** Celda de un valor dentro de su sector. */
function Celda({
  item, rect, palette, onPress,
}: {
  item: HeatmapItem;
  rect: Rect;
  palette: Palette;
  onPress?: (t: HeatmapItem) => void;
}) {
  const { numeric } = useTheme();
  // Sin dato no es lo mismo que 0,00 %: una es «no lo sé» y la otra «no se ha
  // movido». Escribir 0,00 % donde no hay precio es inventarse una lectura.
  const sinDato = !Number.isFinite(item.price_change_percent as number);
  const pct = sinDato ? 0 : (item.price_change_percent as number);
  const calor = heatCell(pct, palette, EXTREMO);
  const fondo = calor === palette.surfaceSunken ? neutroVisible(palette) : calor;
  const tinta = inkOn(fondo, palette);

  // El cuerpo escala con el rectángulo: el peso visual del texto refuerza el
  // del área en vez de competir con ella. El techo baja de 19 a 16 y el suelo
  // de 10 a 9: con letra algo menor entran el nombre y la variación en celdas
  // donde antes sólo cabía el ticker, que es de lo que se trata. Por debajo de
  // 9 px no se baja: ahí ya no se lee y la celda no informaría de nada.
  const cuerpo = Math.max(9, Math.min(16, Math.round(Math.min(rect.w / 4.8, rect.h / 3.4))));

  // Qué se rotula depende del sitio que hay, en escalones: cuanto menos
  // espacio, menos datos.
  //   grande   → ticker + variación + nombre
  //   mediana  → ticker + variación
  //   pequeña  → ticker
  const cabePct = rect.h >= 30 && rect.w >= 40;
  const cabeNombre =
    Boolean(item.company_name) && rect.w >= NOMBRE_ANCHO && rect.h >= NOMBRE_ALTO;
  const cuerpoPct = Math.max(9, cuerpo - 4);
  const cuerpoNombre = Math.max(9, Math.min(11, cuerpo - 5));

  return (
    <Pressable
      onPress={() => onPress?.(item)}
      accessibilityRole="button"
      accessibilityLabel={`${item.ticker}, ${item.company_name ?? ''}: ${
        sinDato
          ? 'sin datos de cotización'
          : `${pct >= 0 ? 'sube' : 'baja'} ${Math.abs(pct).toFixed(2)} por ciento`
      }`}
      style={({ pressed }) => [
        {
          position: 'absolute',
          left: rect.x,
          top: rect.y,
          width: Math.max(rect.w - HUECO, 0),
          height: Math.max(rect.h - HUECO, 0),
          backgroundColor: fondo,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 4,
          // Sin esto, en web un rótulo que no cabe se desborda por encima de
          // la celda vecina y se leen dos tickers superpuestos. Recortado se
          // entiende que falta texto; superpuesto, no.
          overflow: 'hidden',
          opacity: pressed ? 0.82 : 1,
        },
        Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null,
      ]}
    >
      <Text
        style={[numeric, { color: tinta, fontSize: cuerpo, fontWeight: '700', letterSpacing: 0 }]}
        numberOfLines={1}
      >
        {item.ticker}
      </Text>
      {cabePct && (
        <Text
          style={[numeric, { color: tinta, fontSize: cuerpoPct, letterSpacing: 0 }]}
          numberOfLines={1}
        >
          {sinDato ? 'sin dato' : `${pct >= 0 ? '+' : '−'}${Math.abs(pct).toFixed(2)}%`}
        </Text>
      )}
      {cabeNombre && (
        // Va debajo del dato, no encima: el orden de lectura del mosaico es
        // ticker → variación, y el nombre es la aclaración de quién es ese
        // ticker, no un titular.
        <Text
          style={{
            color: tinta,
            opacity: 0.78,
            fontSize: cuerpoNombre,
            marginTop: 2,
            textAlign: 'center',
          }}
          numberOfLines={1}
        >
          {item.company_name}
        </Text>
      )}
    </Pressable>
  );
}

/** Escala de color al pie. Sin ella, el verde y el rojo son decoración. */
function EscalaColor() {
  const { colors, palette, space, type, numeric, radius } = useTheme();
  const tramos = [-3, -2, -1, 0, 1, 2, 3];

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, flexShrink: 1 }}>
      <Legend>Variación del día</Legend>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        {tramos.map((v, i) => {
          const fondo = heatCell(v, palette, EXTREMO);
          return (
            <React.Fragment key={v}>
              {i > 0 && (
                <Text style={[type.legend, { color: colors.inkFaint }]} accessibilityElementsHidden>
                  ·
                </Text>
              )}
              <View
                style={{
                  paddingHorizontal: 7,
                  paddingVertical: 3,
                  borderRadius: radius.xs,
                  backgroundColor: fondo,
                }}
              >
                <Text
                  style={[
                    type.legend,
                    numeric,
                    { color: inkOn(fondo, palette), letterSpacing: 0, fontWeight: '700' },
                  ]}
                >
                  {v > 0 ? '+' : ''}{v}%
                </Text>
              </View>
            </React.Fragment>
          );
        })}
      </View>
    </View>
  );
}

export default function SectorHeatmap({
  items,
  onSelect,
  height = 420,
  actualizado,
  onRecargar,
  recargando = false,
}: {
  items: HeatmapItem[];
  onSelect?: (item: HeatmapItem) => void;
  height?: number;
  /** Momento en que se trajeron estos precios. */
  actualizado?: Date | null;
  onRecargar?: () => void;
  recargando?: boolean;
}) {
  const { colors, palette, space, type, hairline, numeric, radius } = useTheme();
  /** Ancho real del marco. Es lo único que se mide. */
  const [ancho, setAncho] = useState(0);

  /**
   * Alto del marco. UNA sola expresión, que sirve a la vez de estilo del
   * contenedor y de lienzo del reparto. Que sea la misma no es un detalle: es
   * lo que garantiza que las celdas se repartan exactamente sobre el hueco que
   * van a ocupar.
   *
   * Antes esto medía el alto con `onLayout` y repartía sobre lo medido. Parecía
   * más seguro y era justo lo contrario: la medida llega un render tarde, así
   * que en el paso intermedio el contenedor ya tenía el alto nuevo mientras el
   * reparto seguía calculado sobre el viejo. Resultado: sectores dibujados
   * sobre un lienzo más pequeño que su bloque, con el resto del bloque en
   * blanco. Los huecos vacíos del mapa salían de ahí.
   *
   * Mientras no hay medida de ancho vale la prop tal cual: es lo que ve el
   * servidor al pre-renderizar y tiene que coincidir con el primer render del
   * navegador, o la hidratación falla. En cuanto hay ancho real se exige además
   * una proporción cercana a 2:1, porque en un marco aplastado —1.580 × 360 en
   * un monitor ancho— el reparto corta los sectores en columnas estrechas y las
   * celdas bajan del mínimo rotulable.
   */
  //
  // Además del ancho manda la ventana: un mapa de 760 px en una pantalla de
  // 900 se come la pantalla entera y todo lo demás de la página queda por
  // debajo del pliegue. Se le deja como mucho el 62 % del alto visible. Este
  // dato sólo se usa cuando ya hay ancho medido —o sea, después de montar—,
  // así que no puede desajustar la hidratación.
  const { height: altoVentana } = useWindowDimensions();
  const alto = ancho > 0
    ? Math.round(Math.min(760, Math.max(height, Math.min(ancho * 0.52, altoVentana * 0.62))))
    : height;
  /** Sector cuyo montón de «…» está desplegado. */
  const [restoAbierto, setRestoAbierto] = useState<string | null>(null);

  const sectores = useMemo(() => {
    const porSector = new Map<string, HeatmapItem[]>();
    for (const it of items) {
      const s = it.sector && it.sector !== 'N/A' ? it.sector : SIN_SECTOR;
      porSector.set(s, [...(porSector.get(s) ?? []), it]);
    }
    return [...porSector.entries()]
      .map(([sector, valores]) => {
        const total = valores.reduce((acc, v) => acc + peso(v), 0);
        // Media ponderada por capitalización, no aritmética: el bloque se ve
        // dominado por sus valores grandes, así que el número que lo resume
        // tiene que estar ponderado igual. Con media simple, un sector rojo
        // podía anunciarse en verde porque tres empresas diminutas subían.
        //
        // Pondera con la capitalización cruda, no con el peso comprimido del
        // dibujo: esto es una cifra financiera. Si ninguna empresa del sector
        // trae capitalización, no hay con qué ponderar y se cae a la media
        // simple, que es lo único que el dato permite afirmar.
        const capital = valores.reduce((acc, v) => acc + capitalizacion(v), 0);
        const media = capital > 0
          ? valores.reduce((acc, v) => acc + (v.price_change_percent ?? 0) * capitalizacion(v), 0) / capital
          : valores.reduce((acc, v) => acc + (v.price_change_percent ?? 0), 0) / (valores.length || 1);
        return {
          sector,
          media,
          valores: [...valores].sort((a, b) => peso(b) - peso(a)),
          peso: total,
        };
      })
      // Los sectores van en orden alfabético: el mapa se usa para buscar un
      // sector concreto, y con el orden por tamaño cambiaba de sitio cada día
      // según cómo se movieran las capitalizaciones. Dentro de cada sector las
      // empresas sí siguen ordenadas de mayor a menor, que es lo que el
      // reparto squarified necesita para dar celdas cuadradas.
      //
      // «Sin sector» va al final aunque la S le tocara antes: no es un sector,
      // es la ausencia de dato, y mezclarlo en la lista lo hace pasar por uno.
      .sort((a, b) => {
        if (a.sector === SIN_SECTOR) return 1;
        if (b.sector === SIN_SECTOR) return -1;
        return a.sector.localeCompare(b.sector, 'es');
      });
  }, [items]);

  /** Marco de cada sector y, dentro, el reparto de sus celdas. El calculo
   *  entero vive aqui: el reparto es iterativo y no debe rehacerse en cada
   *  pintado, y ademas el pie necesita el mismo resultado que el mosaico.
   *  Antes se recalculaba abajo con el marco del mapa completo en vez del del
   *  sector, asi que la lista de «...» no coincidia con las celdas ocultas. */
  const bloques = useMemo(() => {
    if (ancho <= 0 || alto <= 0 || !sectores.length) return [];
    const marcos = enFilas(
      pesosConSuelo(sectores.map((s) => s.peso), ancho * alto),
      { x: 0, y: 0, w: ancho, h: alto },
      ALTO_MIN_FILA,
      ANCHO_MIN_SECTOR,
    );
    return sectores.map((s, i) => {
      const marco = marcos[i];
      // La cabecera se encoge en los bloques bajos: un rotulo alto sobre un
      // bloque de 80 px se come la mitad del sector. Las tres alturas son las
      // justas para el rótulo con su media (36), sólo el rótulo con la media
      // apretada (28) y sólo el nombre del sector (18). Antes eran 46/32/20 y
      // esa banda de más, multiplicada por doce sectores, era superficie que
      // el mapa perdía sin usarla para nada.
      const cabecera = marco.h >= 150 ? 36 : marco.h >= 84 ? 28 : 18;
      // El borde consume ancho por los dos lados: las celdas se reparten sobre
      // la caja interior, no sobre la exterior, o la última se sale.
      const interior = 2 * BORDE_SECTOR;
      const reparto = repartirSector(s.valores, {
        x: 0,
        y: cabecera,
        w: Math.max(marco.w - HUECO_SECTOR - interior, 0),
        h: Math.max(marco.h - cabecera - HUECO_SECTOR - interior, 0),
      });
      return { ...s, marco, cabecera, ...reparto };
    });
  }, [sectores, ancho, alto]);

  /**
   * Comparte el mapa como texto: sectores y su media ponderada. No una imagen
   * —capturar el mosaico y mandarlo sin la escala de color al lado produce un
   * cuadro de colores que el que lo recibe no puede interpretar— sino los
   * números que el mapa codifica, que sí se leen en cualquier sitio.
   */
  const compartir = useCallback(async () => {
    const cuando = actualizado
      ? actualizado.toLocaleString('es-ES', {
          day: 'numeric', month: 'short', year: 'numeric',
          hour: '2-digit', minute: '2-digit',
        })
      : null;

    const mensaje = [
      'Mapa de calor por sector',
      cuando ? `Precios de ${cuando}` : null,
      '',
      ...sectores.map(
        (s) =>
          `${s.sector}: ${s.media >= 0 ? '+' : '−'}${Math.abs(s.media).toFixed(2)} %` +
          ` (${s.valores.length} ${s.valores.length === 1 ? 'valor' : 'valores'})`,
      ),
    ]
      .filter((l) => l !== null)
      .join('\n');

    try {
      if (Platform.OS === 'web') {
        const nav: any = typeof navigator !== 'undefined' ? navigator : null;
        if (nav?.share) await nav.share({ title: 'Mapa de calor por sector', text: mensaje });
        else if (nav?.clipboard?.writeText) await nav.clipboard.writeText(mensaje);
        return;
      }
      await Share.share({ message: mensaje });
    } catch {
      // Compartir cancelado, o el sistema no ofrece destino. No es un fallo
      // que merezca interrumpir al usuario con un aviso.
    }
  }, [sectores, actualizado]);

  if (!items.length) return null;

  const bloqueAbierto = restoAbierto
    ? bloques.find((b) => b.sector === restoAbierto)
    : undefined;
  const ocultos = bloqueAbierto?.resto ?? [];

  return (
    <View style={{ gap: space.sm }}>
      <Panel
        title="Mapa de calor por sector"
        legend="Tamaño ≈ peso de la empresa (escala comprimida para legibilidad) · color = variación del día"
        padded={false}
        action={
          <Pressable
            onPress={compartir}
            accessibilityRole="button"
            accessibilityLabel="Compartir el mapa de calor"
            style={({ pressed }) => [
              {
                width: 34,
                height: 34,
                borderRadius: radius.xs,
                borderWidth: hairline,
                borderColor: colors.rule,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: pressed ? colors.accentWash : 'transparent',
              },
              Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null,
            ]}
          >
            <Ionicons name="share-outline" size={16} color={colors.inkMuted} />
          </Pressable>
        }
      >
        {/* El papel del panel es lo que separa las celdas: los huecos del
            mosaico dejan ver este fondo, no hay bordes dibujados encima. */}
        <View
          onLayout={(e: LayoutChangeEvent) => {
            const { width } = e.nativeEvent.layout;
            setAncho((a) => (Math.abs(a - width) < 1 ? a : width));
          }}
          style={{
            height: alto,
            backgroundColor: colors.surface,
            // Recorta lo que se salga. Es la red de seguridad: sin esto,
            // cualquier celda que caiga fuera del marco se dibuja encima de lo
            // que venga debajo —el pie, la lista— y se leen dos cosas
            // superpuestas.
            overflow: 'hidden',
          }}
        >
          {bloques.map(({ sector, media, marco, cabecera, visibles, resto, rects }) => {
            const rectResto = resto.length ? rects[visibles.length] : null;

            return (
              <View
                key={sector}
                style={{
                  position: 'absolute',
                  left: marco.x,
                  top: marco.y,
                  width: Math.max(marco.w - HUECO_SECTOR, 0),
                  height: Math.max(marco.h - HUECO_SECTOR, 0),
                  backgroundColor: colors.surface,
                  borderWidth: BORDE_SECTOR,
                  borderColor: colors.rule,
                }}
              >
                {/* Rótulo del sector: nombre y su media ponderada, alineados al
                    margen izquierdo como cualquier otro encabezado de la app.
                    La línea de abajo sólo aparece cuando la cabecera tiene alto
                    suficiente; en los bloques bajos quedaría pegada a las celdas
                    y se leería como el borde de la primera, no como el cierre
                    del rótulo. */}
                <View
                  style={{
                    height: cabecera,
                    paddingHorizontal: 7,
                    justifyContent: 'center',
                    // La cabecera va sobre el gris del cromo, no sobre el papel
                    // del panel: así se ve que pertenece al bloque y no al
                    // fondo, que era lo que la hacía parecer flotante.
                    backgroundColor: colors.chrome,
                    borderBottomWidth: hairline,
                    borderBottomColor: colors.rule,
                  }}
                >
                  {/* La tipografía se ajusta al alto de la cabecera. Con el
                      tamaño fijo de 13 px y su interlineado de 18, un rótulo
                      en una cabecera de 18 px se salía por arriba y el nombre
                      del sector aparecía cortado. */}
                  {/* Más pequeño que el `labelStrong` del sistema a propósito:
                      «Communication Services» a 13 px no entra en una columna
                      estrecha y salía cortado. A 11,5 sí, y el rótulo sigue
                      leyéndose porque va en negrita sobre banda gris. */}
                  <Text
                    style={[
                      type.labelStrong,
                      cabecera < 28
                        ? { fontSize: 10, lineHeight: 12 }
                        : { fontSize: 11.5, lineHeight: 14 },
                      { color: colors.ink, letterSpacing: 0 },
                    ]}
                    numberOfLines={1}
                  >
                    {sector}
                  </Text>
                  {cabecera >= 28 && (
                    <Text
                      style={[
                        type.label,
                        cabecera < 36 ? { fontSize: 10, lineHeight: 12 } : { fontSize: 11, lineHeight: 13 },
                        {
                          color: media >= 0 ? colors.up : colors.down,
                          fontWeight: '700',
                          letterSpacing: 0,
                        },
                        numeric,
                      ]}
                    >
                      {media >= 0 ? '+' : '−'}{Math.abs(media).toFixed(2)}%
                    </Text>
                  )}
                </View>

                {visibles.map((v, i) => (
                  <Celda key={v.ticker} item={v} rect={rects[i]} palette={palette} onPress={onSelect} />
                ))}

                {/* Montón de lo que no cabe rotulado. Neutro a propósito: no
                    representa una variación, representa «hay más aquí». */}
                {rectResto && (
                  <Pressable
                    onPress={() => setRestoAbierto((s) => (s === sector ? null : sector))}
                    accessibilityRole="button"
                    accessibilityLabel={`${resto.length} valores más en ${sector}`}
                    style={({ pressed }) => [
                      {
                        position: 'absolute',
                        left: rectResto.x,
                        top: rectResto.y,
                        width: Math.max(rectResto.w - HUECO, 0),
                        height: Math.max(rectResto.h - HUECO, 0),
                        backgroundColor: restoAbierto === sector ? colors.accentWash : neutroVisible(palette),
                        borderWidth: hairline,
                        borderColor: colors.rule,
                        alignItems: 'center',
                        justifyContent: 'center',
                        overflow: 'hidden',
                        opacity: pressed ? 0.82 : 1,
                      },
                      Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null,
                    ]}
                  >
                    {/* Antes aquí sólo había «…» sobre el fondo hundido, que
                        contra el papel del panel se lee como un agujero del
                        pintado, no como una celda. Con el número dice lo que
                        es: cuántos valores hay debajo, y que se puede abrir. */}
                    <Text
                      style={[type.caption, numeric, { color: colors.inkMuted, fontWeight: '700', letterSpacing: 0 }]}
                      numberOfLines={1}
                    >
                      +{resto.length}
                    </Text>
                    {rectResto.h >= 44 && rectResto.w >= 56 && (
                      <Text style={[type.legend, { color: colors.inkFaint, letterSpacing: 0 }]} numberOfLines={1}>
                        valores
                      </Text>
                    )}
                  </Pressable>
                )}
              </View>
            );
          })}
        </View>

        {/* Los valores que no cabían, en texto: la única forma de que un ticker
            diminuto siga siendo alcanzable. */}
        {bloqueAbierto && ocultos.length > 0 && (
          <>
            <Rule />
            <View style={{ padding: space.md, gap: space.sm }}>
              <Legend>{`${bloqueAbierto.sector} · ${ocultos.length} valores más`}</Legend>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {ocultos.map((v) => {
                  const pct = v.price_change_percent ?? 0;
                  const fondo = heatCell(pct, palette, EXTREMO);
                  return (
                    <Pressable
                      key={v.ticker}
                      onPress={() => onSelect?.(v)}
                      accessibilityRole="button"
                      accessibilityLabel={`${v.ticker}: ${pct >= 0 ? 'sube' : 'baja'} ${Math.abs(pct).toFixed(2)} por ciento`}
                      style={({ pressed }) => [
                        {
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 6,
                          paddingHorizontal: 8,
                          paddingVertical: 4,
                          borderRadius: radius.xs,
                          backgroundColor: fondo,
                          opacity: pressed ? 0.82 : 1,
                        },
                        Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null,
                      ]}
                    >
                      <Text
                        style={[type.caption, numeric, { color: inkOn(fondo, palette), fontWeight: '700', letterSpacing: 0 }]}
                      >
                        {v.ticker}
                      </Text>
                      <Text style={[type.legend, numeric, { color: inkOn(fondo, palette), letterSpacing: 0 }]}>
                        {pct >= 0 ? '+' : '−'}{Math.abs(pct).toFixed(2)}%
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </>
        )}

      </Panel>

      {/* La escala y la hora, en su propia tarjeta. Estaban al pie del mismo
          panel que el mosaico y se leían pegadas a la última fila de celdas,
          como si fueran parte del mapa. Separadas, cada tarjeta dice una cosa:
          arriba el mapa, aquí cómo se lee y de cuándo son los precios. */}
      <Panel padded={false}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: space.md,
            paddingHorizontal: space.md,
            paddingVertical: space.sm,
            flexWrap: 'wrap',
          }}
        >
          <EscalaColor />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            {actualizado && (
              // Un punto y la hora, como el indicador de estado de una
              // terminal. No dice «LIVE» porque no lo es: estos precios se
              // piden al recargar, no llegan solos. Anunciar directo lo que es
              // una foto sería mentir sobre el dato.
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: recargando ? colors.caution : colors.up,
                  }}
                />
                <Text style={[type.legend, numeric, { color: colors.inkMuted, letterSpacing: 0 }]}>
                  {recargando ? 'Actualizando…' : `Precios de las ${actualizado.toLocaleString('es-ES', {
                    hour: '2-digit', minute: '2-digit',
                  })} · ${actualizado.toLocaleString('es-ES', {
                    day: 'numeric', month: 'short',
                  })}`}
                </Text>
              </View>
            )}
            {onRecargar && (
              <Pressable
                onPress={onRecargar}
                disabled={recargando}
                accessibilityRole="button"
                accessibilityLabel="Actualizar precios del mapa"
                accessibilityState={{ disabled: recargando, busy: recargando }}
                style={({ pressed }) => [
                  {
                    width: 32,
                    height: 32,
                    borderRadius: radius.xs,
                    borderWidth: hairline,
                    borderColor: colors.rule,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: pressed ? colors.accentWash : 'transparent',
                    opacity: recargando ? 0.5 : 1,
                  },
                  Platform.OS === 'web' ? ({ cursor: recargando ? 'default' : 'pointer' } as any) : null,
                ]}
              >
                <Ionicons name="refresh" size={15} color={colors.inkMuted} />
              </Pressable>
            )}
          </View>
        </View>
      </Panel>
    </View>
  );
}
