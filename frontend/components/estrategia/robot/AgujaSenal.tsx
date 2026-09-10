/**
 * Aguja de la señal.
 *
 * Un arco de 240° con las cinco bandas de decisión del backend dibujadas
 * (VENDER < 35, REDUCIR 35–45, MANTENER 45–56, ACUMULAR 56–65, COMPRAR ≥ 65)
 * y la aguja cayendo dentro de una de ellas. El usuario ve la POSICIÓN antes
 * de leer la cifra, que es como se lee un instrumento.
 *
 * Las bandas salen de los mismos cortes que usa `/overton` para decidir. Si el
 * backend los mueve y esto no, el dibujo empieza a mentir — por eso están en
 * una constante con el origen citado, no repartidos por el archivo.
 */

import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, G, Line, Path } from 'react-native-svg';

import { useTheme } from '../../../contexts/ThemeContext';
import { Tone, toneColors } from '../../../theme/tokens';
import { Cifra, Rotulo } from '../Terminal';

/** Fuente de verdad: backend/server.py, decisión de `/overton` sobre score_100. */
export const BANDAS: { desde: number; hasta: number; tono: Tone; etiqueta: string }[] = [
  { desde: 0, hasta: 35, tono: 'down', etiqueta: 'Vender' },
  { desde: 35, hasta: 45, tono: 'down', etiqueta: 'Reducir' },
  { desde: 45, hasta: 56, tono: 'caution', etiqueta: 'Mantener' },
  { desde: 56, hasta: 65, tono: 'up', etiqueta: 'Acumular' },
  { desde: 65, hasta: 100, tono: 'up', etiqueta: 'Comprar' },
];

const ARCO = 240;
const INICIO = 150; // grados; 150° → 390°, con el hueco abajo

function polar(cx: number, cy: number, r: number, grados: number) {
  const rad = (grados * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arco(cx: number, cy: number, r: number, g1: number, g2: number) {
  const a = polar(cx, cy, r, g1);
  const b = polar(cx, cy, r, g2);
  const largo = g2 - g1 > 180 ? 1 : 0;
  return `M${a.x.toFixed(2)},${a.y.toFixed(2)} A${r},${r} 0 ${largo} 1 ${b.x.toFixed(2)},${b.y.toFixed(2)}`;
}

export default function AgujaSenal({
  valor,
  tamano = 108,
}: {
  /** Score 0–100. `null` deja la aguja fuera y la cifra en guion. */
  valor: number | null;
  tamano?: number;
}) {
  const { colors, palette } = useTheme();

  const cx = tamano / 2;
  const cy = tamano / 2;
  const r = tamano / 2 - 10;
  const grosor = 9;

  const hayLectura = valor !== null && Number.isFinite(valor);
  const v = hayLectura ? Math.max(0, Math.min(100, valor as number)) : 0;
  const anguloValor = INICIO + (v / 100) * ARCO;

  const banda = BANDAS.find((b) => v >= b.desde && v < b.hasta) ?? BANDAS[BANDAS.length - 1];
  const { fg } = toneColors(palette, hayLectura ? banda.tono : 'neutral');

  const punta = polar(cx, cy, r - grosor - 3, anguloValor);

  return (
    <View style={{ alignItems: 'center', gap: 2 }}>
      <Svg width={tamano} height={tamano * 0.78}>
        {/* Pista */}
        <Path
          d={arco(cx, cy, r, INICIO, INICIO + ARCO)}
          stroke={colors.surfaceSunken}
          strokeWidth={grosor}
          fill="none"
          strokeLinecap="butt"
        />
        {/* Bandas de decisión */}
        {BANDAS.map((b) => {
          const g1 = INICIO + (b.desde / 100) * ARCO;
          const g2 = INICIO + (b.hasta / 100) * ARCO;
          const { fg: color } = toneColors(palette, b.tono);
          return (
            <Path
              key={b.etiqueta}
              d={arco(cx, cy, r, g1 + 0.8, g2 - 0.8)}
              stroke={color}
              strokeWidth={grosor}
              fill="none"
              opacity={hayLectura && b === banda ? 1 : 0.28}
              strokeLinecap="butt"
            />
          );
        })}
        {/* Marcas cada 10 puntos */}
        {Array.from({ length: 11 }).map((_, i) => {
          const g = INICIO + (i / 10) * ARCO;
          const a = polar(cx, cy, r - grosor / 2 - 2, g);
          const b = polar(cx, cy, r - grosor / 2 - (i % 5 === 0 ? 6 : 4), g);
          return (
            <Line
              key={i}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={colors.inkFaint}
              strokeWidth={i % 5 === 0 ? 1.2 : 0.7}
            />
          );
        })}
        {/* Aguja */}
        {hayLectura ? (
          <G>
            <Line x1={cx} y1={cy} x2={punta.x} y2={punta.y} stroke={fg} strokeWidth={2.2} />
            <Circle cx={cx} cy={cy} r={3.4} fill={fg} />
          </G>
        ) : (
          <Circle cx={cx} cy={cy} r={3.4} fill={colors.noSignal} />
        )}
      </Svg>
      <View style={{ alignItems: 'center', marginTop: -tamano * 0.22 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2 }}>
          <Cifra
            valor={hayLectura ? (valor as number).toFixed(0) : null}
            tono={hayLectura ? banda.tono : 'neutral'}
            escala="cifraGrande"
          />
          <Rotulo>/ 100</Rotulo>
        </View>
      </View>
    </View>
  );
}
