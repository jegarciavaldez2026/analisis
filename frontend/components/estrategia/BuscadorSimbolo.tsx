/**
 * ============================================================================
 * Buscador de símbolo con autocompletado
 * ============================================================================
 * La misma técnica de la pantalla de Análisis —mismo endpoint `/search`, misma
 * amortiguación de 250 ms, mismo desplegable— traída a la densidad del
 * terminal. Se puede escribir el ticker («F») o el nombre de la empresa
 * («ford motor») y elegir de la lista.
 *
 * Cuatro trampas que hay que respetar si se toca esto:
 *
 * 1. **`keyboardShouldPersistTaps="always"`.** Sin él, el toque en una
 *    sugerencia cierra el teclado y el desplegable ANTES de que llegue el
 *    `onPress`, y la lista parece que no responde.
 *
 * 2. **El `onBlur` no puede enviar mientras se está eligiendo.** La cabecera
 *    envía al perder el foco, y pulsar una sugerencia dispara el blur PRIMERO:
 *    sin la bandera `eligiendo`, se enviaba el texto a medio escribir
 *    («for») y la selección llegaba después, contra un símbolo ya cambiado.
 *
 * 3. **El desplegable va en absoluto, y el contenedor necesita `zIndex`.** En
 *    la pantalla de Análisis esto ya costó un bug: el hermano posterior se
 *    pintaba encima de la primera sugerencia.
 *
 * 4. **NO se fuerza mayúsculas al escribir.** Análisis usa
 *    `autoCapitalize="characters"` y por eso allí un nombre de empresa se ve
 *    como «FORD MOTOR COMPANY». Aquí no: se escribe en su caja natural y sólo
 *    se pone en mayúsculas lo que se ENVÍA como ticker.
 *
 * Y una mejora sobre el original: con Intro, si lo escrito no es exactamente
 * un ticker de la lista, se toma la PRIMERA sugerencia. Escribir «ford» y
 * pulsar Intro busca F, en vez de mandar «FORD» y fallar. Eso es lo que hace
 * que se pueda buscar por nombre sin tocar el ratón.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../../contexts/ThemeContext';
import { SugerenciaSimbolo } from '../../lib/estrategia/tipos';
import { buscarSimbolos } from '../../lib/estrategia/api';
import { Rotulo, T } from './Terminal';

/** Icono por tipo de instrumento. El mismo criterio que en Análisis. */
function iconoDe(tipo: string): keyof typeof Ionicons.glyphMap {
  switch (tipo.toUpperCase()) {
    case 'ETF':
      return 'layers-outline';
    case 'INDEX':
      return 'stats-chart-outline';
    case 'MUTUALFUND':
      return 'briefcase-outline';
    default:
      return 'business-outline';
  }
}

export default function BuscadorSimbolo({
  simbolo,
  onElegir,
  deshabilitado,
}: {
  simbolo: string;
  onElegir: (ticker: string) => void;
  deshabilitado?: boolean;
}) {
  const { colors, radius, hairline, numeric, elevation } = useTheme();

  const [borrador, setBorrador] = useState(simbolo);
  const [sugerencias, setSugerencias] = useState<SugerenciaSimbolo[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [resaltada, setResaltada] = useState(0);

  const entrada = useRef<TextInput>(null);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Ver trampa 2: bloquea el envío por `onBlur` mientras se elige. */
  const eligiendo = useRef(false);
  /** Descarta respuestas de búsquedas viejas que lleguen tarde. */
  const peticion = useRef(0);

  // El símbolo puede cambiar desde fuera (otra pantalla comparte el contexto).
  useEffect(() => {
    setBorrador(simbolo);
  }, [simbolo]);

  useEffect(
    () => () => {
      if (temporizador.current) clearTimeout(temporizador.current);
    },
    [],
  );

  const cerrar = useCallback(() => {
    setAbierto(false);
    setSugerencias([]);
    setResaltada(0);
  }, []);

  const buscar = useCallback(async (consulta: string) => {
    const id = (peticion.current += 1);
    setBuscando(true);
    const encontradas = await buscarSimbolos(consulta);
    if (id !== peticion.current) return;
    setBuscando(false);
    setSugerencias(encontradas);
    setResaltada(0);
    setAbierto(encontradas.length > 0);
  }, []);

  const alEscribir = useCallback(
    (texto: string) => {
      setBorrador(texto);
      if (temporizador.current) clearTimeout(temporizador.current);
      if (!texto.trim()) {
        peticion.current += 1; // invalida lo que esté en vuelo
        setBuscando(false);
        cerrar();
        return;
      }
      // 250 ms: el mismo de Análisis. Buscar en cada tecla dispara una
      // petición por letra contra Yahoo y las respuestas llegan desordenadas.
      temporizador.current = setTimeout(() => buscar(texto), 250);
    },
    [buscar, cerrar],
  );

  const elegir = useCallback(
    (item: SugerenciaSimbolo) => {
      eligiendo.current = false;
      setBorrador(item.ticker);
      cerrar();
      entrada.current?.blur();
      if (item.ticker !== simbolo) onElegir(item.ticker);
    },
    [cerrar, onElegir, simbolo],
  );

  /**
   * Envío con Intro.
   *
   * Si lo escrito no coincide exactamente con un ticker de la lista, se toma
   * la primera sugerencia: es lo que permite escribir «ford» y que busque F.
   */
  const enviar = useCallback(() => {
    const limpio = borrador.trim();
    if (!limpio) return;
    const enMayusculas = limpio.toUpperCase();
    const exacto = sugerencias.some((s) => s.ticker === enMayusculas);
    const elegida =
      !exacto && sugerencias.length > 0 ? sugerencias[resaltada] ?? sugerencias[0] : null;
    const destino = elegida ? elegida.ticker : enMayusculas;
    setBorrador(destino);
    cerrar();
    if (destino !== simbolo) onElegir(destino);
  }, [borrador, sugerencias, resaltada, cerrar, onElegir, simbolo]);

  /** Teclado: bajar, subir, cerrar. En un terminal se usa sin ratón. */
  const alPulsarTecla = useCallback(
    (e: any) => {
      const tecla = e?.nativeEvent?.key;
      if (!abierto || sugerencias.length === 0) return;
      if (tecla === 'ArrowDown') {
        e.preventDefault?.();
        setResaltada((i) => (i + 1) % sugerencias.length);
      } else if (tecla === 'ArrowUp') {
        e.preventDefault?.();
        setResaltada((i) => (i - 1 + sugerencias.length) % sugerencias.length);
      } else if (tecla === 'Escape') {
        cerrar();
      }
    },
    [abierto, sugerencias.length, cerrar],
  );

  return (
    // `zIndex` aquí y en el desplegable: ver trampa 3.
    <View style={{ position: 'relative', zIndex: 300, minWidth: 150 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          paddingHorizontal: 8,
          minHeight: 28,
          borderRadius: radius.xs,
          borderWidth: hairline,
          borderColor: abierto ? colors.accent : colors.rule,
          backgroundColor: colors.surfaceSunken,
        }}
      >
        <Ionicons name="search" size={12} color={colors.inkFaint} />
        <TextInput
          ref={entrada}
          value={borrador}
          onChangeText={alEscribir}
          onSubmitEditing={enviar}
          onKeyPress={alPulsarTecla}
          onFocus={() => {
            if (sugerencias.length > 0) setAbierto(true);
          }}
          onBlur={() => {
            // Trampa 2: si el blur viene de pulsar una sugerencia, no se envía
            // nada — de eso ya se encarga `elegir`.
            if (eligiendo.current) return;
            cerrar();
            const limpio = borrador.trim().toUpperCase();
            if (limpio && limpio !== simbolo) onElegir(limpio);
          }}
          autoCorrect={false}
          // Trampa 4: sin `autoCapitalize`, para poder leer «Ford Motor».
          editable={!deshabilitado}
          placeholder="Ticker o empresa"
          placeholderTextColor={colors.inkFaint}
          accessibilityLabel="Buscar símbolo o empresa"
          style={[
            T.datoFuerte,
            numeric,
            {
              color: colors.ink,
              minWidth: 110,
              paddingVertical: 4,
              ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : null),
            } as any,
          ]}
        />
        {buscando ? (
          <Rotulo>···</Rotulo>
        ) : borrador.length > 0 ? (
          <Pressable
            onPress={() => {
              setBorrador('');
              peticion.current += 1;
              cerrar();
              entrada.current?.focus();
            }}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Borrar búsqueda"
            style={Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : undefined}
          >
            <Ionicons name="close-circle" size={13} color={colors.inkFaint} />
          </Pressable>
        ) : null}
      </View>

      {abierto && sugerencias.length > 0 ? (
        <View
          style={[
            {
              position: 'absolute',
              top: 32,
              left: 0,
              minWidth: 280,
              zIndex: 300,
              backgroundColor: colors.surfaceRaised ?? colors.surface,
              borderWidth: hairline,
              borderColor: colors.ruleStrong ?? colors.rule,
              borderRadius: radius.xs,
              overflow: 'hidden',
            },
            elevation ? elevation(3) : null,
          ]}
        >
          <FlatList
            data={sugerencias}
            keyExtractor={(item) => item.ticker}
            // Trampa 1.
            keyboardShouldPersistTaps="always"
            style={{ maxHeight: 260 }}
            renderItem={({ item, index }) => {
              const activa = index === resaltada;
              return (
                <Pressable
                  // El blur llega antes que el press: se marca aquí.
                  onPressIn={() => {
                    eligiendo.current = true;
                  }}
                  onPress={() => elegir(item)}
                  onHoverIn={() => setResaltada(index)}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.ticker}, ${item.nombre}, ${item.mercado}`}
                  style={({ pressed, hovered }: any) => [
                    {
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                      minHeight: 30,
                      paddingHorizontal: 7,
                      paddingVertical: 3,
                      backgroundColor:
                        pressed || hovered || activa ? colors.accentWash : 'transparent',
                      borderBottomWidth: index < sugerencias.length - 1 ? hairline : 0,
                      borderBottomColor: colors.rule,
                    },
                    Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null,
                  ]}
                >
                  <Ionicons name={iconoDe(item.tipo)} size={12} color={colors.inkFaint} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 5 }}>
                      <Text style={[T.datoFuerte, numeric, { color: colors.ink }]}>
                        {item.ticker}
                      </Text>
                      <Text style={[T.micro, { color: colors.inkFaint }]} numberOfLines={1}>
                        {item.mercado}
                      </Text>
                    </View>
                    <Text style={[T.micro, { color: colors.inkMuted }]} numberOfLines={1}>
                      {item.nombre}
                    </Text>
                  </View>
                </Pressable>
              );
            }}
          />
        </View>
      ) : null}
    </View>
  );
}
