/**
 * Rejilla de 12 columnas.
 *
 * El encargo pedía CSS Grid explícitamente. **En React Native no existe**: el
 * motor de maquetación es Yoga y `display` sólo acepta `flex` y `none`; pasar
 * `display: 'grid'` no falla ruidosamente, simplemente no hace nada, y en
 * nativo no hay ni siquiera un navegador que lo interprete.
 *
 * Así que la rejilla se implementa de verdad, con la misma semántica de 12
 * columnas y huecos que se esperaría de CSS Grid, sobre las primitivas que sí
 * existen. Lo que se conserva es lo que importa: un contenedor declara el
 * reparto, cada hijo declara cuántas columnas ocupa y en qué punto de ruptura,
 * y el hueco es uniforme y se descuenta del ancho — sin márgenes negativos.
 *
 * Lo que NO se hace: repartir a ojo con `flex: 1` en cada sitio. Eso es
 * exactamente el «layout basado exclusivamente en flexbox» que el encargo
 * rechaza, y con razón: no permite decir «esta columna vale 5 de 12».
 */

import React, { Children, ReactNode, isValidElement, useCallback, useState } from 'react';
import { LayoutChangeEvent, StyleProp, View, ViewStyle } from 'react-native';

export const COLUMNAS = 12;

/** Puntos de ruptura. Escritorio primero, que es la escena de uso real. */
export type Ruptura = 'movil' | 'tableta' | 'escritorio' | 'ancho';

/**
 * Los cortes se miden sobre el ANCHO ÚTIL, no sobre la ventana.
 *
 * Esto se hizo mal la primera vez: con los umbrales puestos a ojo sobre el
 * tamaño de pantalla, una ventana de 1366 px menos los 244 de la barra lateral
 * deja 1106 px de contenido y caía en «tableta», que apila todo en una
 * columna. Trece placas a ancho completo, una debajo de otra.
 *
 * Referencias reales (ventana − barra lateral 244 − aire 16):
 *   1920 → 1660   1600 → 1340   1440 → 1180   1366 → 1106   1280 → 1020
 */
export function rupturaDe(ancho: number): Ruptura {
  if (ancho >= 1400) return 'ancho';
  if (ancho >= 1000) return 'escritorio';
  if (ancho >= 680) return 'tableta';
  return 'movil';
}

export interface Vano {
  movil?: number;
  tableta?: number;
  escritorio?: number;
  ancho?: number;
}

/** Columnas que ocupa un hijo en la ruptura actual, heredando hacia abajo. */
export function vanoEn(vano: Vano, r: Ruptura): number {
  const cadena: Ruptura[] =
    r === 'ancho'
      ? ['ancho', 'escritorio', 'tableta', 'movil']
      : r === 'escritorio'
        ? ['escritorio', 'tableta', 'movil']
        : r === 'tableta'
          ? ['tableta', 'movil']
          : ['movil'];
  for (const clave of cadena) {
    const v = vano[clave];
    if (typeof v === 'number') return Math.max(1, Math.min(COLUMNAS, v));
  }
  return COLUMNAS;
}

interface PropsCol {
  vano: Vano;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** Marcador de columna. No pinta nada: lo consume `Rejilla`. */
export function Col({ children, style }: PropsCol) {
  return <View style={[{ minWidth: 0 }, style]}>{children}</View>;
}

export default function Rejilla({
  children,
  ruptura,
  hueco = 8,
  style,
}: {
  children: ReactNode;
  ruptura: Ruptura;
  hueco?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const hijos = Children.toArray(children).filter(isValidElement) as React.ReactElement<PropsCol>[];
  const [ancho, setAncho] = useState(0);

  const medir = useCallback((e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    setAncho((previo) => (Math.abs(previo - w) > 0.5 ? w : previo));
  }, []);

  /**
   * Ancho exacto de una celda de `n` columnas.
   *
   *   ancho(n) = n·(W − 11·hueco)/12 + (n−1)·hueco
   *
   * Es la fórmula de una rejilla real. El atajo de `flexBasis: n/12·100 %` NO
   * vale: doce celdas al 8,33 % más once huecos suman más del 100 % y la
   * última salta de fila. Ese es el fallo clásico de «grid» hecho a ojo.
   */
  const anchoDe = (n: number) => {
    if (ancho <= 0) return undefined;
    const columna = (ancho - hueco * (COLUMNAS - 1)) / COLUMNAS;
    return Math.max(0, columna * n + hueco * (n - 1));
  };

  return (
    <View
      onLayout={medir}
      style={[
        {
          flexDirection: 'row',
          flexWrap: 'wrap',
          // `gap` está en Yoga desde RN 0.71 y en react-native-web: es el
          // hueco de la rejilla, sin márgenes negativos ni celdas huérfanas.
          gap: hueco,
          alignItems: 'flex-start',
          minWidth: 0,
        },
        style,
      ]}
    >
      {hijos.map((hijo, i) => {
        const vano = vanoEn(hijo.props.vano ?? {}, ruptura);
        const w = anchoDe(vano);
        return (
          <View
            key={hijo.key ?? i}
            style={{
              // Antes de la primera medición se ocupa la fila entera: es el
              // estado seguro, porque no descuadra nada mientras se calcula.
              width: w ?? '100%',
              minWidth: 0,
            }}
          >
            {hijo}
          </View>
        );
      })}
    </View>
  );
}
