"""
================================================================================
Motor de backtest por eventos
================================================================================
Un backtest con look-ahead es PEOR que no tener backtest: no se equivoca, se
equivoca dando confianza. Por eso este módulo se organiza alrededor de las tres
formas en que se cuela el futuro, y cierra las tres explícitamente.

1. **Indicadores no causales.** SMA, EMA y RSI en la barra i sólo usan datos
   hasta i, así que precalcularlos sobre la serie entera es correcto. Lo que NO
   vale es normalizar por el máximo de todo el periodo, usar un z-score con la
   media global o elegir umbrales mirando el resultado. Aquí no se hace nada de
   eso, y `_es_causal()` lo comprueba de verdad sobre la serie.

2. **Ejecución en la misma barra que la señal.** Si la señal se calcula con el
   cierre de la barra i, no se puede comprar a ese cierre: cuando lo conoces, la
   sesión ha terminado. Se ejecuta en la APERTURA de la barra i+1.

3. **Stop y objetivo tocados en la misma barra.** Con datos diarios no se sabe
   cuál llegó primero. Se asume el stop, que es el supuesto pesimista. Suponer
   el objetivo infla los resultados exactamente donde más duele.

Todo lo demás —comisión, deslizamiento, riesgo por operación— es un parámetro
visible, no una constante escondida.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd

SESIONES_ANO = 252


# ==============================================================================
# Indicadores causales
# ==============================================================================

def sma(valores: pd.Series, periodo: int) -> pd.Series:
    return valores.rolling(periodo, min_periods=periodo).mean()


def ema(valores: pd.Series, periodo: int) -> pd.Series:
    return valores.ewm(span=periodo, adjust=False, min_periods=periodo).mean()


def rsi_wilder(valores: pd.Series, periodo: int = 14) -> pd.Series:
    delta = valores.diff()
    ganancia = delta.clip(lower=0.0)
    perdida = -delta.clip(upper=0.0)
    med_g = ganancia.ewm(alpha=1 / periodo, adjust=False, min_periods=periodo).mean()
    med_p = perdida.ewm(alpha=1 / periodo, adjust=False, min_periods=periodo).mean()
    rs = med_g / med_p.replace(0.0, np.nan)
    salida = 100 - (100 / (1 + rs))
    return salida.fillna(100.0).where(med_p.notna(), np.nan)


def atr(df: pd.DataFrame, periodo: int = 14) -> pd.Series:
    alto_bajo = df["High"] - df["Low"]
    alto_cierre = (df["High"] - df["Close"].shift()).abs()
    bajo_cierre = (df["Low"] - df["Close"].shift()).abs()
    tr = pd.concat([alto_bajo, alto_cierre, bajo_cierre], axis=1).max(axis=1)
    return tr.ewm(alpha=1 / periodo, adjust=False, min_periods=periodo).mean()


def _es_causal(fn, serie: pd.Series, corte: int) -> bool:
    """
    Comprueba que un indicador no mira al futuro.

    El método es directo: se calcula sobre la serie completa y sobre la serie
    truncada en `corte`. Si el valor en `corte` cambia, es que el cálculo usaba
    datos posteriores. Esto no es una comprobación decorativa — es la que
    justifica poder precalcular los indicadores fuera del bucle.
    """
    completo = fn(serie)
    truncado = fn(serie.iloc[: corte + 1])
    a = completo.iloc[corte]
    b = truncado.iloc[corte]
    if pd.isna(a) and pd.isna(b):
        return True
    return bool(np.isclose(a, b, rtol=1e-9, atol=1e-9))


# ==============================================================================
# Estrategia
# ==============================================================================

@dataclass
class Parametros:
    """
    Todo lo que cambia el resultado, en un sitio y con su valor a la vista.

    Los valores por defecto son deliberadamente conservadores. Una comisión de
    cero y un deslizamiento de cero convierten cualquier estrategia mediocre en
    una buena, y es el ajuste más fácil de olvidar.
    """
    capital_inicial: float = 100_000.0
    # Comisión por operación, en porcentaje del importe.
    comision_pct: float = 0.05
    # Deslizamiento: la diferencia entre el precio que ves y el que consigues.
    deslizamiento_pct: float = 0.05
    # Riesgo por operación, en porcentaje del capital. Fija el tamaño.
    riesgo_pct: float = 1.0
    # Stop en múltiplos de ATR. También fija el tamaño de la posición.
    stop_atr: float = 2.0
    # Objetivo en múltiplos de ATR. 3 sobre 2 da un R/B de 1,5.
    objetivo_atr: float = 3.0
    # Filtros de entrada.
    sma_rapida: int = 20
    sma_lenta: int = 50
    rsi_periodo: int = 14
    rsi_maximo: float = 70.0
    # Máximo de barras en posición. Sin esto, una posición muerta ocupa
    # capital indefinidamente y el backtest no lo refleja.
    max_barras: int = 60


@dataclass
class Operacion:
    entrada_fecha: str
    entrada_precio: float
    salida_fecha: str
    salida_precio: float
    acciones: float
    resultado: float
    resultado_pct: float
    motivo: str
    barras: int


@dataclass
class Resultado:
    ticker: str
    desde: str
    hasta: str
    parametros: Dict[str, Any]
    curva: List[Dict[str, Any]] = field(default_factory=list)
    operaciones: List[Operacion] = field(default_factory=list)
    metricas: Dict[str, Any] = field(default_factory=dict)
    avisos: List[str] = field(default_factory=list)


def _senal_entrada(i: int, cierre, rapida, lenta, rsi) -> bool:
    """
    Regla de entrada, evaluada con la información disponible AL CIERRE de la
    barra `i`. Ni un dato más.

    Es deliberadamente simple —tendencia por cruce de medias, momento sin
    sobrecompra— porque el objetivo de esta primera versión es que el MOTOR sea
    correcto, no que la estrategia sea buena. Una regla compleja sobre un motor
    con look-ahead no vale nada; una regla simple sobre un motor honesto se
    puede mejorar después.
    """
    if i < 1:
        return False
    r_ahora, r_antes = rapida[i], rapida[i - 1]
    l_ahora, l_antes = lenta[i], lenta[i - 1]
    if any(pd.isna(v) for v in (r_ahora, r_antes, l_ahora, l_antes, rsi[i])):
        return False
    # Cruce al alza en esta barra, y sin sobrecompra.
    cruce = r_antes <= l_antes and r_ahora > l_ahora
    return bool(cruce and rsi[i] < 70.0 and cierre[i] > l_ahora)


# ==============================================================================
# Motor
# ==============================================================================

def ejecutar(df: pd.DataFrame, ticker: str, p: Optional[Parametros] = None) -> Resultado:
    """
    Recorre las barras una a una, en orden, sin poder ver el futuro.

    `df` necesita columnas Open/High/Low/Close/Volume e índice de fechas
    ascendente.
    """
    p = p or Parametros()
    avisos: List[str] = []

    df = df.dropna(subset=["Open", "High", "Low", "Close"]).copy()
    if len(df) < max(p.sma_lenta, p.rsi_periodo) + 30:
        raise ValueError(
            f"Histórico insuficiente: {len(df)} barras. Hacen falta al menos "
            f"{max(p.sma_lenta, p.rsi_periodo) + 30} para que los indicadores "
            f"terminen de calentar y quede recorrido que medir."
        )

    cierre = df["Close"]

    # Comprobación de causalidad, no comentario de causalidad.
    corte = len(cierre) // 2
    for nombre, fn in (
        ("SMA", lambda s: sma(s, p.sma_rapida)),
        ("EMA", lambda s: ema(s, p.sma_rapida)),
        ("RSI", lambda s: rsi_wilder(s, p.rsi_periodo)),
    ):
        if not _es_causal(fn, cierre, corte):
            raise AssertionError(
                f"{nombre} no es causal: su valor en la barra {corte} cambia según "
                f"lo que venga después. El backtest sería inválido."
            )

    rapida = sma(cierre, p.sma_rapida).to_numpy()
    lenta = sma(cierre, p.sma_lenta).to_numpy()
    rsi = rsi_wilder(cierre, p.rsi_periodo).to_numpy()
    atr_serie = atr(df, 14).to_numpy()

    apertura = df["Open"].to_numpy()
    alto = df["High"].to_numpy()
    bajo = df["Low"].to_numpy()
    cierre_np = cierre.to_numpy()
    fechas = [str(d)[:10] for d in df.index]

    efectivo = p.capital_inicial
    acciones = 0.0
    entrada_precio = 0.0
    entrada_indice = -1
    stop = 0.0
    objetivo = 0.0
    pendiente_entrada = False

    operaciones: List[Operacion] = []
    curva: List[Dict[str, Any]] = []
    pico = p.capital_inicial

    comision = p.comision_pct / 100.0
    desliz = p.deslizamiento_pct / 100.0

    def cerrar(indice: int, precio: float, motivo: str):
        nonlocal efectivo, acciones, entrada_precio, entrada_indice, stop, objetivo
        precio_real = precio * (1 - desliz)
        importe = precio_real * acciones
        coste = importe * comision
        efectivo += importe - coste
        bruto = (precio_real - entrada_precio) * acciones - coste
        operaciones.append(
            Operacion(
                entrada_fecha=fechas[entrada_indice],
                entrada_precio=round(entrada_precio, 4),
                salida_fecha=fechas[indice],
                salida_precio=round(precio_real, 4),
                acciones=round(acciones, 4),
                resultado=round(bruto, 2),
                resultado_pct=round(
                    (precio_real - entrada_precio) / entrada_precio * 100, 3
                )
                if entrada_precio
                else 0.0,
                motivo=motivo,
                barras=indice - entrada_indice,
            )
        )
        acciones = 0.0
        entrada_precio = 0.0
        entrada_indice = -1
        stop = 0.0
        objetivo = 0.0

    for i in range(len(df)):
        # ── 1. Ejecutar en la apertura lo que se decidió al cierre anterior ──
        if pendiente_entrada and acciones == 0.0:
            precio = apertura[i] * (1 + desliz)
            atr_previo = atr_serie[i - 1] if i > 0 else np.nan
            if not pd.isna(atr_previo) and atr_previo > 0 and precio > 0:
                distancia = p.stop_atr * atr_previo
                riesgo_dinero = efectivo * (p.riesgo_pct / 100.0)
                cantidad = math.floor(riesgo_dinero / distancia)
                importe = cantidad * precio
                coste = importe * comision
                if cantidad > 0 and importe + coste <= efectivo:
                    efectivo -= importe + coste
                    acciones = float(cantidad)
                    entrada_precio = precio
                    entrada_indice = i
                    stop = precio - distancia
                    objetivo = precio + p.objetivo_atr * atr_previo
            pendiente_entrada = False

        # ── 2. Gestionar la posición abierta con el rango de ESTA barra ──
        if acciones > 0:
            toca_stop = bajo[i] <= stop
            toca_objetivo = alto[i] >= objetivo
            if toca_stop and toca_objetivo:
                # No se sabe cuál llegó primero con datos diarios. Se asume el
                # peor. Suponer el objetivo aquí es la forma más silenciosa de
                # inflar un backtest.
                cerrar(i, stop, "stop (ambos tocados en la barra)")
            elif toca_stop:
                cerrar(i, stop, "stop")
            elif toca_objetivo:
                cerrar(i, objetivo, "objetivo")
            elif i - entrada_indice >= p.max_barras:
                cerrar(i, cierre_np[i], "tiempo")

        # ── 3. Decidir con el cierre de esta barra, ejecutar en la siguiente ──
        if acciones == 0.0 and not pendiente_entrada:
            if _senal_entrada(i, cierre_np, rapida, lenta, rsi):
                pendiente_entrada = True

        # ── 4. Anotar patrimonio ──
        patrimonio = efectivo + acciones * cierre_np[i]
        pico = max(pico, patrimonio)
        curva.append(
            {
                "date": fechas[i],
                "equity": round(patrimonio, 2),
                "drawdown_pct": round((patrimonio - pico) / pico * 100, 3) if pico > 0 else 0.0,
                "en_posicion": acciones > 0,
            }
        )

    # Posición abierta al final: se marca, no se cierra a un precio inventado.
    if acciones > 0:
        avisos.append(
            f"El periodo termina con una posición abierta de {acciones:.0f} acciones. "
            f"No se liquida a un precio futuro: su resultado queda fuera de las métricas "
            f"de operaciones cerradas y sólo aparece en la curva de patrimonio."
        )

    metricas = _metricas(curva, operaciones, p.capital_inicial)
    if metricas["operaciones"] < 30:
        avisos.append(
            f"Sólo {metricas['operaciones']} operaciones cerradas. Con esta muestra el "
            f"win rate y el profit factor son ruido: harían falta unas 100 para que "
            f"significaran algo."
        )

    return Resultado(
        ticker=ticker,
        desde=fechas[0],
        hasta=fechas[-1],
        parametros=p.__dict__.copy(),
        curva=curva,
        operaciones=operaciones,
        metricas=metricas,
        avisos=avisos,
    )


def _metricas(curva, operaciones: List[Operacion], capital_inicial: float) -> Dict[str, Any]:
    """Todas las métricas salen de la curva y de las operaciones. Nada suelto."""
    if not curva:
        return {"operaciones": 0}

    patrimonio = np.array([c["equity"] for c in curva], dtype=float)
    final = float(patrimonio[-1])

    retornos = np.diff(patrimonio) / patrimonio[:-1]
    retornos = retornos[np.isfinite(retornos)]

    anos = max(len(patrimonio) / SESIONES_ANO, 1e-9)
    retorno_total = (final / capital_inicial - 1) * 100
    cagr = ((final / capital_inicial) ** (1 / anos) - 1) * 100 if final > 0 else -100.0

    vol = float(retornos.std(ddof=1)) if len(retornos) > 1 else 0.0
    media = float(retornos.mean()) if len(retornos) else 0.0
    sharpe = (media / vol * math.sqrt(SESIONES_ANO)) if vol > 0 else None

    negativos = retornos[retornos < 0]
    vol_baja = float(negativos.std(ddof=1)) if len(negativos) > 1 else 0.0
    sortino = (media / vol_baja * math.sqrt(SESIONES_ANO)) if vol_baja > 0 else None

    max_dd = float(min(c["drawdown_pct"] for c in curva))

    resultados = [o.resultado for o in operaciones]
    ganancias = [r for r in resultados if r > 0]
    perdidas = [r for r in resultados if r < 0]
    bruto_g = sum(ganancias)
    bruto_p = abs(sum(perdidas))

    return {
        "capital_inicial": round(capital_inicial, 2),
        "capital_final": round(final, 2),
        "retorno_total": round(retorno_total, 2),
        "cagr": round(cagr, 2),
        "max_drawdown": round(max_dd, 2),
        # `None` y no 0: sin volatilidad no hay Sharpe, y un 0 se lee como
        # «rendimiento ajustado nulo», que es una afirmación distinta.
        "sharpe": round(sharpe, 2) if sharpe is not None else None,
        "sortino": round(sortino, 2) if sortino is not None else None,
        "operaciones": len(operaciones),
        "ganadoras": len(ganancias),
        "perdedoras": len(perdidas),
        "win_rate": round(len(ganancias) / len(resultados) * 100, 2) if resultados else None,
        "profit_factor": round(bruto_g / bruto_p, 2) if bruto_p > 0 else None,
        "expectativa": round(sum(resultados) / len(resultados), 2) if resultados else None,
        "mejor": round(max(resultados), 2) if resultados else None,
        "peor": round(min(resultados), 2) if resultados else None,
        "barras": len(patrimonio),
    }
