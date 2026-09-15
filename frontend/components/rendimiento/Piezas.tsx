/**
 * Piezas de la ficha «Rendimiento»: formatos, filas de dato, tablas de
 * comparación y la barra de rango. Todo con los tokens del tema.
 */
import React from 'react';
import { Text, View } from 'react-native';

import { useTheme } from '../../contexts/ThemeContext';
import { Rule } from '../ui';
import type { Num } from '../../lib/rendimiento/api';
import { GUION, fNum } from '../../lib/rendimiento/formato';

/** Tono de una cifra con signo: verde si sube, rojo si baja, tinta si no hay dato. */
export function useTonoSigno() {
  const { colors } = useTheme();
  return (v: Num | undefined) => (v == null ? colors.noSignal : v > 0 ? colors.up : v < 0 ? colors.down : colors.ink);
}

/** Etiqueta a la izquierda, valor a la derecha. */
export function FilaDato({ etiqueta, valor, tono, nota }: { etiqueta: string; valor: string; tono?: string; nota?: string }) {
  const { colors, type, numeric, space } = useTheme();
  return (
    <View style={{ paddingVertical: space.xs, gap: 2 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.md }}>
        <Text style={[type.caption, { color: colors.inkMuted, flex: 1 }]}>{etiqueta}</Text>
        <Text
          style={[type.labelStrong, numeric, { color: tono ?? (valor === GUION ? colors.noSignal : colors.ink), textAlign: 'right', flexShrink: 1 }]}
          selectable
        >
          {valor}
        </Text>
      </View>
      {nota ? <Text style={[type.caption, { color: colors.inkFaint, fontSize: 11 }]}>{nota}</Text> : null}
    </View>
  );
}

export interface FilaTabla {
  etiqueta: string;
  /** Clave estable cuando la etiqueta se repite («Último ejercicio» en Ventas, BPA y EBITDA). */
  clave?: string;
  valores: string[];
  /** Color por celda; `undefined` = tinta normal. */
  tonos?: (string | undefined)[];
  /** Fila de sección («Ventas», «BPA»…): sin valores, en versalita. */
  seccion?: boolean;
}

/** Tabla de comparación: una columna de etiqueta y N columnas numéricas del mismo ancho. */
export function Tabla({ columnas, filas, anchoColumna = 78 }: { columnas: string[]; filas: FilaTabla[]; anchoColumna?: number }) {
  const { colors, type, numeric, space } = useTheme();
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', paddingBottom: space.xs }}>
        <View style={{ flex: 1 }} />
        {columnas.map((c, i) => (
          <Text
            key={c}
            style={[type.legend, { width: anchoColumna, textAlign: 'right', color: i === 0 ? colors.ink : colors.inkFaint, letterSpacing: 0.4 }]}
            numberOfLines={2}
          >
            {c}
          </Text>
        ))}
      </View>
      <Rule />
      {filas.map((f) =>
        f.seccion ? (
          <Text key={f.clave ?? f.etiqueta} style={[type.legend, { color: colors.inkFaint, marginTop: space.md, marginBottom: 2 }]}>
            {f.etiqueta}
          </Text>
        ) : (
          <View key={f.clave ?? f.etiqueta} style={{ flexDirection: 'row', alignItems: 'center', minHeight: 30 }}>
            <Text style={[type.caption, { color: colors.inkMuted, flex: 1 }]} numberOfLines={2}>
              {f.etiqueta}
            </Text>
            {f.valores.map((v, j) => (
              <Text
                key={columnas[j]}
                style={[
                  j === 0 ? type.labelStrong : type.caption,
                  numeric,
                  {
                    width: anchoColumna,
                    textAlign: 'right',
                    color: v === GUION ? colors.noSignal : f.tonos?.[j] ?? (j === 0 ? colors.ink : colors.inkMuted),
                  },
                ]}
              >
                {v}
              </Text>
            ))}
          </View>
        ),
      )}
    </View>
  );
}

/** Rango con la posición del valor actual. Sin extremos, lo dice en vez de dibujar una barra vacía. */
export function BarraRango({
  titulo,
  min,
  max,
  actual,
  formato = (v: number) => fNum(v),
}: {
  titulo: string;
  min: Num;
  max: Num;
  actual: Num;
  formato?: (v: number) => string;
}) {
  const { colors, type, numeric, space, radius } = useTheme();
  const valido = min != null && max != null && max > min;
  const posicion = valido && actual != null ? Math.min(100, Math.max(0, ((actual - min!) / (max! - min!)) * 100)) : null;
  return (
    <View style={{ gap: space.xs, minWidth: 150 }}>
      <Text style={[type.legend, { color: colors.inkFaint }]}>{titulo}</Text>
      {valido ? (
        <>
          <View style={{ height: 6, borderRadius: radius.xs, backgroundColor: colors.surfaceSunken, justifyContent: 'center' }}>
            {posicion != null ? (
              <View
                style={{
                  position: 'absolute',
                  left: `${posicion}%`,
                  marginLeft: -5,
                  width: 10,
                  height: 10,
                  borderRadius: 5,
                  backgroundColor: colors.accent,
                  borderWidth: 2,
                  borderColor: colors.surface,
                }}
                accessibilityLabel={`${titulo}: ${formato(actual!)} entre ${formato(min!)} y ${formato(max!)}`}
              />
            ) : null}
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={[type.caption, numeric, { color: colors.inkMuted }]}>{formato(min!)}</Text>
            <Text style={[type.caption, numeric, { color: colors.inkMuted }]}>{formato(max!)}</Text>
          </View>
          {/* Fuera del rango el punto se queda pegado al borde: sin esta línea parecería estar EN el extremo. */}
          {actual != null && (actual > max! || actual < min!) ? (
            <Text style={[type.caption, numeric, { color: colors.caution }]}>
              Actual {formato(actual)}: {actual > max! ? 'por encima' : 'por debajo'} del rango
            </Text>
          ) : null}
        </>
      ) : (
        <Text style={[type.caption, { color: colors.noSignal }]}>Sin datos</Text>
      )}
    </View>
  );
}
