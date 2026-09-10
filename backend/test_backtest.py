"""
Pruebas del motor de backtest.

La más importante es la de look-ahead. Un backtest se valida así o no se
valida: mirando los números uno no distingue un motor honesto de uno que hace
trampa, porque el que hace trampa da números *mejores*.

    python3 test_backtest.py
"""

import sys

import numpy as np
import pandas as pd

import backtest as bt


ok = 0
mal = 0


def comprobar(nombre, condicion, detalle=""):
    global ok, mal
    if condicion:
        ok += 1
    else:
        mal += 1
        print(f"FALLO  {nombre}" + (f"\n       {detalle}" if detalle else ""))


def serie_sintetica(n=600, semilla=7):
    """Paseo aleatorio con deriva. Determinista para que la prueba lo sea."""
    rng = np.random.default_rng(semilla)
    retornos = rng.normal(0.0004, 0.015, n)
    cierre = 100 * np.exp(np.cumsum(retornos))
    apertura = cierre * (1 + rng.normal(0, 0.002, n))
    alto = np.maximum(apertura, cierre) * (1 + np.abs(rng.normal(0, 0.005, n)))
    bajo = np.minimum(apertura, cierre) * (1 - np.abs(rng.normal(0, 0.005, n)))
    fechas = pd.bdate_range("2022-01-03", periods=n)
    return pd.DataFrame(
        {
            "Open": apertura,
            "High": alto,
            "Low": bajo,
            "Close": cierre,
            "Volume": rng.integers(1e5, 1e6, n).astype(float),
        },
        index=fechas,
    )


df = serie_sintetica()

# ==============================================================================
# 1. Causalidad de los indicadores
# ==============================================================================
corte = 400
for nombre, fn in (
    ("SMA-20", lambda s: bt.sma(s, 20)),
    ("SMA-50", lambda s: bt.sma(s, 50)),
    ("EMA-20", lambda s: bt.ema(s, 20)),
    ("RSI-14", lambda s: bt.rsi_wilder(s, 14)),
):
    comprobar(
        f"causal: {nombre}",
        bt._es_causal(fn, df["Close"], corte),
        "el valor en la barra de corte cambia según los datos posteriores",
    )

# Contraprueba: un indicador que SÍ mira al futuro debe ser detectado. Sin
# esto, la comprobación de causalidad podría estar aprobándolo todo y nadie se
# enteraría — un detector que nunca dice que no, no es un detector.
#
# `shift(-1)` es el caso inequívoco: el valor de la barra i es el cierre de la
# barra i+1. Se descarta normalizar por el máximo global, que parecía buen
# ejemplo pero no lo es: si el máximo de la serie cae ANTES del corte, la
# versión truncada y la completa coinciden y el caso deja de ser concluyente.
def con_futuro(s):
    return s.shift(-1)


comprobar(
    "el detector caza un indicador no causal",
    not bt._es_causal(con_futuro, df["Close"], corte),
    "un indicador que devuelve el cierre de la barra siguiente no se detectó",
)

# ==============================================================================
# 2. El motor no usa el futuro: truncar la serie no cambia el pasado
# ==============================================================================
resultado_completo = bt.ejecutar(df, "TEST")
resultado_truncado = bt.ejecutar(df.iloc[: corte + 1], "TEST")

curva_c = {c["date"]: c["equity"] for c in resultado_completo.curva}
curva_t = {c["date"]: c["equity"] for c in resultado_truncado.curva}
comunes = [d for d in curva_t if d in curva_c]

iguales = all(abs(curva_c[d] - curva_t[d]) < 1e-6 for d in comunes)
primer_desvio = next((d for d in comunes if abs(curva_c[d] - curva_t[d]) >= 1e-6), None)
comprobar(
    "sin look-ahead: la curva del tramo común es idéntica",
    iguales,
    f"diverge en {primer_desvio}: {curva_c.get(primer_desvio)} vs {curva_t.get(primer_desvio)}"
    if primer_desvio
    else "",
)

ops_c = [
    (o.entrada_fecha, o.salida_fecha)
    for o in resultado_completo.operaciones
    if o.salida_fecha <= resultado_truncado.hasta
]
ops_t = [(o.entrada_fecha, o.salida_fecha) for o in resultado_truncado.operaciones]
comprobar(
    "sin look-ahead: las operaciones del tramo común coinciden",
    ops_c == ops_t,
    f"{len(ops_c)} vs {len(ops_t)}",
)

# ==============================================================================
# 3. La ejecución nunca ocurre en la barra de la señal
# ==============================================================================
# La entrada se decide al cierre de i y se ejecuta en la apertura de i+1, así
# que ninguna entrada puede tener el precio del cierre que la disparó.
fechas = [str(d)[:10] for d in df.index]
aperturas = dict(zip(fechas, df["Open"].to_numpy()))
entradas_en_apertura = all(
    o.entrada_precio >= aperturas[o.entrada_fecha] * (1 - 1e-9)
    for o in resultado_completo.operaciones
)
comprobar(
    "la entrada se ejecuta en la apertura, con deslizamiento en contra",
    entradas_en_apertura,
    "alguna entrada se ejecutó por debajo de la apertura de su barra",
)

# ==============================================================================
# 4. Contabilidad: la curva cuadra con las operaciones
# ==============================================================================
p = bt.Parametros()
suma_ops = sum(o.resultado for o in resultado_completo.operaciones)
final = resultado_completo.metricas["capital_final"]
hay_abierta = bool(resultado_completo.avisos and "posición abierta" in resultado_completo.avisos[0])
if not hay_abierta:
    comprobar(
        "capital final = inicial + suma de operaciones",
        abs((p.capital_inicial + suma_ops) - final) < 1.0,
        f"{p.capital_inicial + suma_ops:.2f} vs {final:.2f}",
    )
else:
    comprobar("capital final coherente (hay posición abierta, se omite)", True)

# ==============================================================================
# 5. Las métricas describen la curva
# ==============================================================================
m = resultado_completo.metricas
comprobar("drawdown máximo es negativo o cero", m["max_drawdown"] <= 0)
comprobar(
    # La métrica se publica redondeada a dos decimales, así que la tolerancia
    # es la del redondeo, no la de la máquina.
    "drawdown máximo coincide con el mínimo de la curva",
    abs(m["max_drawdown"] - min(c["drawdown_pct"] for c in resultado_completo.curva)) <= 0.005,
)
comprobar("ganadoras + perdedoras <= operaciones", m["ganadoras"] + m["perdedoras"] <= m["operaciones"])
if m["operaciones"]:
    comprobar(
        "win rate cuadra con las ganadoras",
        abs(m["win_rate"] - m["ganadoras"] / m["operaciones"] * 100) < 1e-6,
    )
    comprobar(
        "expectativa cuadra con la suma de resultados",
        abs(m["expectativa"] - suma_ops / m["operaciones"]) < 0.02,
        f"{m['expectativa']} vs {suma_ops / m['operaciones']:.2f}",
    )

# ==============================================================================
# 6. Los costes empeoran el resultado. Siempre.
# ==============================================================================
sin_costes = bt.ejecutar(df, "TEST", bt.Parametros(comision_pct=0.0, deslizamiento_pct=0.0))
con_costes = bt.ejecutar(df, "TEST", bt.Parametros(comision_pct=0.2, deslizamiento_pct=0.2))
comprobar(
    "más comisión y deslizamiento => menos retorno",
    con_costes.metricas["retorno_total"] <= sin_costes.metricas["retorno_total"] + 1e-9,
    f"con costes {con_costes.metricas['retorno_total']} vs sin costes "
    f"{sin_costes.metricas['retorno_total']}",
)

# ==============================================================================
# 7. Cuando stop y objetivo caen en la misma barra, gana el stop
# ==============================================================================
n = 120
base = np.linspace(100, 130, n)
manual = pd.DataFrame(
    {
        "Open": base,
        "High": base * 1.30,   # toca cualquier objetivo
        "Low": base * 0.70,    # y cualquier stop
        "Close": base,
        "Volume": np.full(n, 1e6),
    },
    index=pd.bdate_range("2023-01-02", periods=n),
)
r_manual = bt.ejecutar(manual, "AMBOS")
motivos = {o.motivo for o in r_manual.operaciones}
comprobar(
    "con stop y objetivo en la misma barra se asume el stop",
    all("stop" in mo for mo in motivos) if motivos else True,
    f"motivos observados: {motivos}",
)

# ==============================================================================
# 8. Histórico insuficiente falla en voz alta
# ==============================================================================
try:
    bt.ejecutar(df.iloc[:40], "CORTO")
    comprobar("histórico insuficiente lanza error", False, "no lanzó nada")
except ValueError:
    comprobar("histórico insuficiente lanza error", True)

# ==============================================================================
print(f"\n{ok} pruebas pasadas · {mal} fallidas")
sys.exit(1 if mal else 0)
