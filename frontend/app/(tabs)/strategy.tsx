/**
 * Ruta «Estrategia».
 *
 * Expo Router convierte en ruta todo archivo bajo `app/`, así que este fichero
 * es sólo la puerta: mide el ancho disponible y monta el dashboard. Toda la
 * maquetación y los paneles viven en `components/estrategia/`, fuera de `app/`,
 * para no crear rutas fantasma — ya se limpiaron tres por ese motivo.
 */

import React from 'react';
import { View } from 'react-native';

import { useTheme } from '../../contexts/ThemeContext';
import { useSimbolo } from '../../contexts/SimboloContext';
import { DashboardAutoAncho } from '../../components/estrategia/DashboardEstrategia';

export default function PantallaEstrategia() {
  const { colors } = useTheme();
  // El símbolo es el de la aplicación, no el de esta pantalla: lo que elija
  // aquí el robot es lo que verá Overton, y al revés.
  const { simbolo, setSimbolo, listo } = useSimbolo();

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      {/* `listo` evita montar el dashboard con el símbolo por defecto y
          recargarlo entero un instante después con el guardado: sería una
          descarga completa tirada a la basura, y de las caras. */}
      {listo ? (
        <DashboardAutoAncho simboloInicial={simbolo} onSimbolo={setSimbolo} />
      ) : null}
    </View>
  );
}
