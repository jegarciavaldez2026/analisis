/**
 * Celda de una empresa dentro de su sector.
 *
 * Cuánto se rotula depende del sitio que hay, en escalones. Nunca se encoge la
 * letra por debajo de lo legible para que quepa un dato más: primero se quita
 * el dato.
 *
 *   grande   → TICKER / variación / nombre
 *   mediana  → TICKER / variación
 *   pequeña  → TICKER
 *
 * SVG no recorta el texto solo: un `<Text>` que no cabe se sale del rectángulo
 * y se lee encima de la celda vecina. Por eso cada rótulo se mide antes y se
 * recorta con puntos suspensivos si hace falta.
 */

import React from 'react';
import { G, Rect, Text as SvgText } from 'react-native-svg';

import { variacion, type Celda, type Periodo } from './useHeatmapLayout';
import { colorVariacion, tintaSobre } from './colorScale';

/** Ancho medio de un carácter en proporción al cuerpo. Medido sobre la
 *  tipografía del sistema; sobra un poco a propósito, para no pasarse. */
const ANCHO_CARACTER = 0.62;

export function recortar(texto: string, anchoDisponible: number, cuerpo: number): string | null {
  if (!texto) return null;
  const maximo = Math.floor(anchoDisponible / (cuerpo * ANCHO_CARACTER));
  if (maximo <= 0) return null;
  if (texto.length <= maximo) return texto;
  if (maximo <= 2) return null; // «A…» no informa de nada: mejor no ponerlo
  return texto.slice(0, maximo - 1) + '…';
}

export default function StockNode({
  celda,
  oscuro,
  periodo,
  onPress,
}: {
  celda: Celda;
  oscuro: boolean;
  periodo: Periodo;
  onPress?: (v: Celda['valor']) => void;
}) {
  const { x, y, w, h, valor } = celda;
  const pct = variacion(valor, periodo);
  const sinDato = pct === null;
  const fondo = colorVariacion(pct, oscuro);
  const tinta = tintaSobre(fondo);

  const util = w - 8;
  const cuerpo = Math.max(9, Math.min(17, Math.round(Math.min(w / 4.6, h / 3.2))));
  const cuerpoPct = Math.max(9, cuerpo - 3);
  const cuerpoNombre = Math.max(9, Math.min(11, cuerpo - 5));

  const ticker = recortar(valor.ticker, util, cuerpo);
  const textoPct = sinDato ? 's/d' : `${(pct as number) >= 0 ? '+' : '−'}${Math.abs(pct as number).toFixed(2)}%`;

  // Se decide de abajo arriba: primero cuánto alto pide cada línea, y se
  // quedan las que caben enteras.
  const altoTicker = cuerpo * 1.15;
  const altoPct = cuerpoPct * 1.35;
  const altoNombre = cuerpoNombre * 1.4;

  const cabePct = h >= altoTicker + altoPct + 6 && w >= 42;
  const cabeNombre =
    Boolean(valor.company_name) && cabePct && h >= altoTicker + altoPct + altoNombre + 8 && w >= 78;

  const pctRecortado = cabePct ? recortar(textoPct, util, cuerpoPct) : null;
  const nombreRecortado = cabeNombre ? recortar(valor.company_name as string, util, cuerpoNombre) : null;

  const bloque =
    altoTicker + (pctRecortado ? altoPct : 0) + (nombreRecortado ? altoNombre : 0);
  let cursor = y + h / 2 - bloque / 2 + cuerpo * 0.92;
  const cx = x + w / 2;

  return (
    <G onPress={onPress ? () => onPress(valor) : undefined}>
      <Rect x={x} y={y} width={w} height={h} fill={fondo} rx={2} />
      {ticker && (
        <SvgText
          x={cx}
          y={cursor}
          fill={tinta}
          fontSize={cuerpo}
          fontWeight="700"
          textAnchor="middle"
        >
          {ticker}
        </SvgText>
      )}
      {pctRecortado &&
        ((cursor += altoPct),
        (
          <SvgText
            x={cx}
            y={cursor}
            fill={tinta}
            fontSize={cuerpoPct}
            fontWeight="600"
            textAnchor="middle"
            opacity={sinDato ? 0.75 : 1}
          >
            {pctRecortado}
          </SvgText>
        ))}
      {nombreRecortado &&
        ((cursor += altoNombre),
        (
          <SvgText x={cx} y={cursor} fill={tinta} fontSize={cuerpoNombre} textAnchor="middle" opacity={0.82}>
            {nombreRecortado}
          </SvgText>
        ))}
    </G>
  );
}
