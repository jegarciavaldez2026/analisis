/**
 * Cotización frente al S&P 500.
 *
 * Traída de la pantalla de Análisis, pero NO copiada: allí es una tarjeta de
 * lectura pausada (gráfico de 360 px, píldoras grandes) y aquí tiene que
 * convivir con otras doce placas en un terminal. Misma información, misma
 * paleta, otra densidad — que es exactamente la distinción que hace `Terminal`
 * frente al kit `components/ui`.
 *
 * Por qué está en Estrategia: el robot decide comprar un valor concreto, y la
 * alternativa siempre disponible es comprar el índice y no hacer nada. Un
 * +40 % es malo si el índice hizo +45 %. El alfa es la única cifra que
 * contesta a eso, y estaba sólo en la otra pantalla.
 *
 * Las dos series van sobre el MISMO eje en base 100, que es lo que permite
 * compararlas de un vistazo: la separación vertical entre las curvas ES el
 * alfa acumulado, dibujado.
 */

import React, { useMemo, useState } from 'react';
import { LayoutChangeEvent, Text, View } from 'react-native';
import Svg, { Line, Path } from 'react-native-svg';

import { useTheme } from '../../../contexts/ThemeContext';
import { Bloque, Comparativa } from '../../../lib/estrategia/tipos';
import { cifra, porcentaje } from '../../../lib/estrategia/formato';
import { Chip, Cifra, ConDatos, Placa, Rotulo, T } from '../Terminal';

const ALTO = 104;

export default function ComparativaIndice({
  bloque,
  cargando,
}: {
  bloque: Bloque<Comparativa>;
  cargando?: boolean;
}) {
  const [ancho, setAncho] = useState(0);
  const medir = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    setAncho((previo) => (Math.abs(previo - w) > 1 ? w : previo));
  };

  return (
    <Placa
      titulo="Frente al S&P 500"
      procedencia={bloque.procedencia}
      derecha={
        bloque.datos ? (
          <Chip
            texto={`Alfa ${bloque.datos.alfa >= 0 ? '+' : '−'}${Math.abs(bloque.datos.alfa).toFixed(1)} pp`}
            tono={bloque.datos.alfa >= 0 ? 'up' : 'down'}
            icono={bloque.datos.alfa >= 0 ? 'trophy-outline' : 'trending-down-outline'}
          />
        ) : null
      }
    >
      <ConDatos bloque={bloque} cargando={cargando} filasCarga={4}>
        {(c) => <Cuerpo c={c} ancho={ancho} medir={medir} />}
      </ConDatos>
    </Placa>
  );
}

function Cuerpo({
  c,
  ancho,
  medir,
}: {
  c: Comparativa;
  ancho: number;
  medir: (e: LayoutChangeEvent) => void;
}) {
  const { colors, palette, hairline } = useTheme();

  const trazos = useMemo(() => {
    if (!c.serie.length || ancho <= 0) return null;
    const todos = c.serie.flatMap((p) => [p.valor, p.indice]);
    const min = Math.min(...todos);
    const max = Math.max(...todos);
    const rango = max - min || 1;
    const x = (i: number) => (i / Math.max(1, c.serie.length - 1)) * ancho;
    const y = (v: number) => ALTO - ((v - min) / rango) * ALTO;

    const camino = (sel: (p: (typeof c.serie)[number]) => number) =>
      c.serie
        .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(sel(p)).toFixed(1)}`)
        .join(' ');

    return {
      valor: camino((p) => p.valor),
      indice: camino((p) => p.indice),
      // La base 100 es la referencia: por encima se gana, por debajo se pierde.
      yBase: y(100),
      dentroDelRango: 100 >= min && 100 <= max,
    };
  }, [c.serie, ancho]);

  const tonoAlfa = c.alfa >= 0 ? 'up' : 'down';

  return (
    <View style={{ gap: 7 }} onLayout={medir}>
      {/* Las dos series sobre el mismo eje. La distancia entre ellas es el alfa. */}
      {trazos ? (
        <View>
          <Svg width={ancho} height={ALTO}>
            {trazos.dentroDelRango ? (
              <Line
                x1={0}
                x2={ancho}
                y1={trazos.yBase}
                y2={trazos.yBase}
                stroke={colors.ruleStrong}
                strokeWidth={1}
                strokeDasharray="3 3"
              />
            ) : null}
            {/* El índice va en discontinua y tinta apagada: es la referencia,
                no el sujeto. El valor analizado se lleva el acento. */}
            <Path
              d={trazos.indice}
              fill="none"
              stroke={colors.inkMuted}
              strokeWidth={1.2}
              strokeDasharray="4 3"
            />
            <Path d={trazos.valor} fill="none" stroke={palette.accent} strokeWidth={1.8} />
          </Svg>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={{ width: 10, height: 2, backgroundColor: palette.accent }} />
              <Text style={[T.micro, { color: colors.inkMuted }]}>{c.simbolo}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={{ width: 10, height: 2, backgroundColor: colors.inkMuted }} />
              <Text style={[T.micro, { color: colors.inkMuted }]}>S&P 500</Text>
            </View>
            <Text style={[T.micro, { color: colors.inkFaint }]}>
              Base 100 · {c.periodo}
            </Text>
          </View>
        </View>
      ) : null}

      <View style={{ height: hairline, backgroundColor: colors.rule }} />

      {/* Las cuatro cifras que resumen la comparación. */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, rowGap: 6 }}>
        {(
          [
            [c.simbolo, porcentaje(c.retornoValor, 2, true), c.retornoValor >= 0 ? 'up' : 'down'],
            ['S&P 500', porcentaje(c.retornoIndice, 2, true), c.retornoIndice >= 0 ? 'up' : 'down'],
            ['Alfa', `${c.alfa >= 0 ? '+' : '−'}${Math.abs(c.alfa).toFixed(2)} pp`, tonoAlfa],
            // La beta sólo se enseña si el R² la sostiene. Con el índice
            // explicando el 1 % del movimiento, una beta es el cociente de dos
            // volatilidades con el signo del ruido: parece una propiedad del
            // valor y no lo es.
            ['Beta', c.betaFiable ? cifra(c.beta) : null, 'neutral'],
          ] as const
        ).map(([rot, val, tono]) => (
          <View key={rot} style={{ flexBasis: '22%', flexGrow: 1, minWidth: 0, gap: 1 }}>
            <Rotulo>{rot}</Rotulo>
            <Cifra valor={val} tono={tono as any} escala="datoFuerte" />
          </View>
        ))}
      </View>

      {/* La lectura, en una línea. Es lo que convierte cuatro cifras en una
          decisión: batir al índice asumiendo más riesgo que el índice no es
          lo mismo que batirlo asumiendo menos. */}
      <Text style={[T.micro, { color: colors.inkFaint, lineHeight: 14 }]}>
        {c.alfa >= 0
          ? `Bate al índice en ${Math.abs(c.alfa).toFixed(1)} pp`
          : `Se queda ${Math.abs(c.alfa).toFixed(1)} pp por debajo del índice`}
        {/* Tres lecturas distintas, no una escala. La de en medio es la que
            faltaba: «no se mueve CON el mercado» no es lo mismo que «se mueve
            MENOS que el mercado», y una beta negativa por ruido decía lo
            segundo cuando pasaba lo primero. */}
        {!c.betaFiable
          ? `. El índice explica sólo el ${((c.r2 ?? 0) * 100).toFixed(0)} % de su movimiento` +
            `${c.correlacion !== null ? ` (correlación ${c.correlacion.toFixed(2)})` : ''}: ` +
            'va por libre, así que la beta no dice nada útil y no se muestra. ' +
            'El alfa aquí es mérito o suerte del propio valor, no del mercado.'
          : c.beta! > 1.15
            ? `, con beta ${c.beta!.toFixed(2)}: amplifica al mercado, así que parte de la diferencia es riesgo asumido, no acierto.`
            : c.beta! < 0.85
              ? `, con beta ${c.beta!.toFixed(2)}: amortigua al mercado.`
              : `, con beta ${c.beta!.toFixed(2)}: se mueve casi como el mercado.`}
        {c.betaFiable && c.correlacion !== null
          ? ` Correlación ${c.correlacion.toFixed(2)} (R² ${((c.r2 ?? 0) * 100).toFixed(0)} %).`
          : ''}
      </Text>
    </View>
  );
}
