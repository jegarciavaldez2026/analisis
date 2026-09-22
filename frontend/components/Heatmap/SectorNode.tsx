/**
 * Bloque de un sector: marco, rótulo y sus celdas.
 *
 * El rótulo va DENTRO del marco, sobre banda propia, para que sector y
 * empresas se lean como una sola pieza y no como una etiqueta flotando encima
 * de unos colores.
 */

import React from 'react';
import { G, Rect, Text as SvgText } from 'react-native-svg';

import type { Bloque, Periodo, Valor } from './useHeatmapLayout';
import StockNode, { recortar } from './StockNode';

export default function SectorNode({
  bloque,
  oscuro,
  periodo,
  colorMarco,
  colorBanda,
  colorTinta,
  colorSube,
  colorBaja,
  onSelect,
  onResto,
}: {
  bloque: Bloque;
  oscuro: boolean;
  periodo: Periodo;
  colorMarco: string;
  colorBanda: string;
  colorTinta: string;
  colorSube: string;
  colorBaja: string;
  onSelect?: (v: Valor) => void;
  onResto?: (b: Bloque) => void;
}) {
  const { x, y, w, h, cabecera, sector, media, celdas, resto } = bloque;

  const cuerpoTitulo = cabecera >= 26 ? 11.5 : 10;
  const cuerpoMedia = cabecera >= 34 ? 11 : 10;
  // El % de la cabecera se escribe a la derecha; el nombre se recorta contra
  // el hueco que queda, no contra el ancho entero.
  const textoMedia =
    media === null ? null : `${media >= 0 ? '+' : '−'}${Math.abs(media).toFixed(2)}%`;
  const anchoMedia = textoMedia ? textoMedia.length * cuerpoMedia * 0.62 + 10 : 0;
  const titulo = recortar(sector, Math.max(w - 14 - anchoMedia, 0), cuerpoTitulo);

  const dosLineas = cabecera >= 34;

  // El grupo se dibuja sólo si su rectángulo da para un rótulo. Cuando no, la
  // cuenta se enseña en la cabecera, que además se vuelve pulsable: así las
  // empresas agrupadas siguen siendo alcanzables en cualquier tamaño.
  const restoDibujable = Boolean(resto && resto.w >= 26 && resto.h >= 14);
  const ocultas = resto ? resto.valores.length : 0;

  return (
    <G>
      {/* Marco del sector */}
      <Rect
        x={x + 0.5}
        y={y + 0.5}
        width={Math.max(w - 1, 0)}
        height={Math.max(h - 1, 0)}
        fill="none"
        stroke={colorMarco}
        strokeWidth={1.5}
        rx={3}
      />
      {/* Banda del rótulo. Pulsable cuando hay empresas agrupadas. */}
      <G onPress={ocultas > 0 && onResto ? () => onResto(bloque) : undefined}>
        <Rect x={x + 1} y={y + 1} width={Math.max(w - 2, 0)} height={Math.max(cabecera - 1, 0)} fill={colorBanda} />
        {ocultas > 0 && !restoDibujable && (() => {
          const texto = recortar(`+${ocultas}`, Math.max(w - 14, 0), 10);
          if (!texto) return null;
          return (
            <SvgText
              x={x + w - 6}
              y={y + cabecera - 5}
              fill={colorTinta}
              fontSize={10}
              fontWeight="700"
              textAnchor="end"
              opacity={0.75}
            >
              {texto}
            </SvgText>
          );
        })()}
      </G>

      {titulo && (
        <SvgText
          x={x + 7}
          y={y + (dosLineas ? 14 : cabecera / 2 + cuerpoTitulo * 0.36)}
          fill={colorTinta}
          fontSize={cuerpoTitulo}
          fontWeight="700"
        >
          {titulo}
        </SvgText>
      )}
      {textoMedia && (
        <SvgText
          x={dosLineas ? x + 7 : x + w - 7}
          y={dosLineas ? y + 27 : y + cabecera / 2 + cuerpoMedia * 0.36}
          fill={media !== null && media >= 0 ? colorSube : colorBaja}
          fontSize={cuerpoMedia}
          fontWeight="700"
          textAnchor={dosLineas ? 'start' : 'end'}
        >
          {textoMedia}
        </SvgText>
      )}

      {celdas.map((c) => (
        <StockNode key={c.valor.ticker} celda={c} oscuro={oscuro} periodo={periodo} onPress={onSelect} />
      ))}

      {/* Lo que no cabe rotulado. Conserva el área de lo que agrupa: no se
          esconde nada, se reagrupa. */}
      {resto && restoDibujable && (
        <G onPress={onResto ? () => onResto(bloque) : undefined}>
          <Rect x={resto.x} y={resto.y} width={resto.w} height={resto.h} fill={colorBanda} rx={2} />
          <Rect
            x={resto.x + 0.5}
            y={resto.y + 0.5}
            width={Math.max(resto.w - 1, 0)}
            height={Math.max(resto.h - 1, 0)}
            fill="none"
            stroke={colorMarco}
            strokeWidth={1}
            rx={2}
          />
          {(() => {
            const cuerpo = Math.max(9, Math.min(13, Math.round(Math.min(resto.w / 3.6, resto.h / 2.6))));
            const texto = recortar(`+${resto.valores.length} más`, resto.w - 6, cuerpo);
            if (!texto) return null;
            return (
              <SvgText
                x={resto.x + resto.w / 2}
                y={resto.y + resto.h / 2 + cuerpo * 0.36}
                fill={colorTinta}
                fontSize={cuerpo}
                fontWeight="700"
                textAnchor="middle"
                opacity={0.85}
              >
                {texto}
              </SvgText>
            );
          })()}
        </G>
      )}
    </G>
  );
}
