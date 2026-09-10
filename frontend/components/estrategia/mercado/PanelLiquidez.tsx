/**
 * Liquidez y ejecución — el panel que ocupa el sitio del libro de nivel II.
 *
 * No es un libro encogido ni un hueco disfrazado. Es otra pregunta, y a
 * propósito: el libro contesta «cuánto papel hay ahora mismo a este precio»,
 * que con datos diarios no se puede contestar y con un robot que decide cada
 * 45 minutos tampoco serviría —la foto habría caducado varias veces—. Lo que
 * sí se puede medir, y además es lo que acota la posición, es:
 *
 *   1. Cuánto cuesta cruzar la horquilla  → Corwin-Schultz sobre altos/bajos.
 *   2. Cuánto mueve el precio mi tamaño   → ratio de Amihud.
 *   3. Qué tamaño puedo llevar sin ser yo el mercado → 1 % del volumen medio.
 *
 * Las tres llevan su método escrito al lado. Una cifra de liquidez sin decir
 * de dónde sale se lee como si viniera del libro, y no viene.
 */

import React from 'react';
import { Text, View } from 'react-native';

import { useTheme } from '../../../contexts/ThemeContext';
import { Bloque, Liquidez } from '../../../lib/estrategia/tipos';
import { cifra, dinero, entero, porcentaje } from '../../../lib/estrategia/formato';
import { Chip, Cifra, ConDatos, Fila, Placa, Rotulo, T } from '../Terminal';

/** Semáforo de liquidez. El color acompaña a la palabra, nunca la sustituye. */
const CLASES = {
  alta: { texto: 'LIQUIDEZ ALTA', tono: 'up' as const },
  media: { texto: 'LIQUIDEZ MEDIA', tono: 'caution' as const },
  baja: { texto: 'LIQUIDEZ BAJA', tono: 'down' as const },
};

export default function PanelLiquidez({
  bloque,
  cargando,
}: {
  bloque: Bloque<Liquidez>;
  cargando?: boolean;
}) {
  const { colors } = useTheme();

  return (
    <Placa
      titulo="Liquidez y ejecución"
      procedencia={bloque.procedencia}
      derecha={
        bloque.datos ? <Chip texto={CLASES[bloque.datos.clasificacion].texto} tono={CLASES[bloque.datos.clasificacion].tono} /> : null
      }
    >
      <ConDatos bloque={bloque} cargando={cargando} filasCarga={5}>
        {(l) => (
          <View style={{ gap: 6 }}>
            {/* Lectura de cabecera: lo que cuesta entrar y salir. */}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1, gap: 1 }}>
                <Rotulo>Horquilla · cota máx.</Rotulo>
                <Cifra
                  valor={l.spreadEstimadoPct === null ? null : `≤ ${l.spreadEstimadoPct.toFixed(3)} %`}
                  tono={
                    l.spreadEstimadoPct === null
                      ? 'neutral'
                      : l.spreadEstimadoPct > 0.5
                        ? 'caution'
                        : 'up'
                  }
                  escala="medida"
                />
                {/* Cuando la estimación no pasa el contraste con el volumen se
                    dibuja el hueco Y se dice por qué. Enseñar «1,45 %» en una
                    acción de 184 M$ diarios sería peor que no enseñar nada:
                    parece una medida y es el ATR disfrazado. */}
                <Text style={[T.micro, { color: colors.inkFaint }]} numberOfLines={3}>
                  {l.spreadEstimadoPct === null
                    ? l.spreadMotivo ?? 'No estimable'
                    : 'Techo del coste de cruzar'}
                </Text>
              </View>
              <View style={{ flex: 1, gap: 1 }}>
                <Rotulo>Impacto por millón</Rotulo>
                <Cifra
                  valor={l.amihudPctPorMillon === null ? null : `${l.amihudPctPorMillon.toFixed(3)} %`}
                  escala="medida"
                />
                <Text style={[T.micro, { color: colors.inkFaint }]} numberOfLines={2}>
                  Movimiento por cada 1 M$ negociado
                </Text>
              </View>
            </View>

            <View style={{ gap: 0 }}>
              <Fila
                etiqueta="Volumen medio (20 sesiones)"
                valor={l.advAcciones === null ? null : entero(l.advAcciones)}
              />
              <Fila
                etiqueta="Volumen medio en dólares"
                valor={l.advDolares === null ? null : dinero(l.advDolares)}
              />
              <Fila
                etiqueta="Volumen de la última sesión"
                valor={l.volumenRelativo === null ? null : `${cifra(l.volumenRelativo)}×`}
                senal={
                  l.volumenRelativo === null
                    ? undefined
                    : l.volumenRelativo > 1.5
                      ? 'ACTIVIDAD ALTA'
                      : l.volumenRelativo < 0.6
                        ? 'ACTIVIDAD BAJA'
                        : 'NORMAL'
                }
                tono={
                  l.volumenRelativo === null
                    ? 'neutral'
                    : l.volumenRelativo > 1.5
                      ? 'accent'
                      : l.volumenRelativo < 0.6
                        ? 'caution'
                        : 'neutral'
                }
              />
              <Fila
                etiqueta="Rango diario medio"
                valor={l.rangoDiarioPct === null ? null : porcentaje(l.rangoDiarioPct, 2)}
              />
              <Fila
                etiqueta="Tamaño máx. (1 % del volumen)"
                valor={l.maxAcciones1pct === null ? null : `${entero(l.maxAcciones1pct)} acc.`}
                senal={l.maxDolares1pct === null ? undefined : dinero(l.maxDolares1pct) ?? undefined}
                tono="accent"
                ultima
              />
            </View>

            {/* El método, junto a la cifra. Es la diferencia entre una medida y
                un número que parece salir del libro. */}
            <Text style={[T.micro, { color: colors.inkFaint, lineHeight: 14 }]}>
              {l.nota} Horquilla por {l.spreadMetodo || 'Corwin-Schultz'} — es una COTA SUPERIOR:
              cuando la volatilidad domina, el método no la separa del todo de la horquilla y la
              sobreestima. Impacto por el ratio de Amihud. Ambas se estiman sobre{' '}
              {l.ventanaSesiones ?? 20} sesiones diarias; no son lecturas del libro de órdenes.
            </Text>
          </View>
        )}
      </ConDatos>
    </Placa>
  );
}
