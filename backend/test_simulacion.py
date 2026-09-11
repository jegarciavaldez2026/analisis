"""
Pruebas del motor de trading simulado.

Tres familias, y la tercera es la que de verdad caza bugs:

1. **Las 20 que pidió el usuario.** Largo/corto con beneficio y pérdida, stop y
   objetivo por los dos lados, MARKET y LIMIT, cierre manual y automático, P&L,
   balance, equity, win rate, drawdown y deduplicación.

2. **Los invariantes de contabilidad.** Abrir no mueve el balance; cerrar dos
   veces no cuenta dos veces; una orden cancelada no entra en el win rate.

3. **Las CONTRAPRUEBAS.** Una métrica de trading siempre devuelve un número
   plausible: un P&L con el signo cambiado, un drawdown que en realidad es la
   peor operación o un LIMIT relleno al precio equivocado salen los tres con la
   magnitud y el signo correctos, y nada en pantalla los delata. Por eso varias
   pruebas demuestran que el cálculo correcto y el incorrecto dan resultados
   DISTINTOS sobre el mismo dato. Sin eso no se está probando nada.

    cd backend && python -m pytest test_simulacion.py -q
"""

from __future__ import annotations

import math

import pytest

import simulacion as sim


# ==============================================================================
# Utilidades
# ==============================================================================

DIA = 86400
T0 = 1_760_000_000  # un martes cualquiera, en epoch


def cuenta(capital: float = 100_000.0, **kw) -> sim.Estado:
    """Cuenta limpia. Sin costes por defecto: cada prueba enciende lo que mide."""
    base = dict(comision_pct=0.0, deslizamiento_pct=0.0, coste_prestamo_anual_pct=0.0)
    base.update(kw)
    return sim.Estado(capital_inicial=capital, params=sim.Parametros(**base))


def barra(ts: int, o: float, h: float, l: float, c: float) -> sim.Barra:
    return sim.Barra(ts=ts, apertura=o, alto=h, bajo=l, cierre=c)


def intencion(**kw) -> sim.Intencion:
    base = dict(
        simbolo="PBF",
        direccion="long",
        tipo="MARKET",
        cantidad=100,
        precio_referencia=100.0,
        stop_loss=95.0,
        take_profit=110.0,
    )
    base.update(kw)
    return sim.Intencion(**base)


def abrir(estado: sim.Estado, ts: int = T0, precio: float | None = None, **kw):
    """
    Abre una posición de mercado y devuelve (orden, posición, rechazos).

    `precio` fija a la vez el precio de referencia de la intención y el de
    mercado. Separarlos en el atajo de pruebas ya costó cuatro fallos: la
    intención quedaba en 100 mientras el mercado estaba en 10, y el validador
    rechazaba por riesgo excesivo un caso que quería medir otra cosa.
    """
    if precio is not None:
        kw.setdefault("precio_referencia", precio)
    n = len(estado.ordenes) + 1
    m = len(estado.posiciones) + 1
    orden, pos, fallos, _ = sim.enviar(
        estado, intencion(**kw), f"ORD-{n:04d}", f"SIM-{m:04d}", ts, precio,
    )
    return orden, pos, fallos


# ==============================================================================
# 1-4 · LONG y SHORT, con beneficio y con pérdida
# ==============================================================================

def test_long_con_beneficio():
    e = cuenta()
    _, pos, _ = abrir(e)
    assert pos is not None and pos.estado == "OPEN"

    sim.cerrar_a_mano(e, pos.id, 108.0, T0 + DIA)

    # 100 acciones × (108 − 100) = +800
    assert pos.resultado == pytest.approx(800.0)
    assert pos.motivo_cierre == "MANUAL_CLOSE"
    assert sim.balance(e) == pytest.approx(100_800.0)


def test_long_con_perdida():
    e = cuenta()
    _, pos, _ = abrir(e)
    sim.cerrar_a_mano(e, pos.id, 97.0, T0 + DIA)

    assert pos.resultado == pytest.approx(-300.0)
    assert sim.balance(e) == pytest.approx(99_700.0)


def test_short_con_beneficio():
    e = cuenta()
    _, pos, _ = abrir(e, direccion="short", stop_loss=105.0, take_profit=90.0)
    sim.cerrar_a_mano(e, pos.id, 92.0, T0 + DIA)

    # En corto se gana cuando BAJA: 100 × (100 − 92) = +800
    assert pos.resultado == pytest.approx(800.0)
    assert sim.balance(e) == pytest.approx(100_800.0)


def test_short_con_perdida():
    e = cuenta()
    _, pos, _ = abrir(e, direccion="short", stop_loss=105.0, take_profit=90.0)
    sim.cerrar_a_mano(e, pos.id, 103.0, T0 + DIA)

    assert pos.resultado == pytest.approx(-300.0)


def test_el_signo_del_pnl_no_es_simetrico_por_accidente():
    """
    CONTRAPRUEBA del error más fácil de cometer: usar una sola fórmula con un
    signo. Con el mismo movimiento de precio, largo y corto tienen que dar
    resultados OPUESTOS, no iguales.
    """
    subida_largo = sim.pnl_bruto("long", 100.0, 110.0, 10)
    subida_corto = sim.pnl_bruto("short", 100.0, 110.0, 10)
    assert subida_largo == pytest.approx(100.0)
    assert subida_corto == pytest.approx(-100.0)
    assert subida_largo == -subida_corto


# ==============================================================================
# 5-8 · Stop loss y take profit, por los dos lados
# ==============================================================================

def test_stop_loss_long():
    e = cuenta()
    _, pos, _ = abrir(e)  # entrada 100, stop 95
    # La barra perfora el stop sin llegar al objetivo.
    sim.aplicar_barra(e, "PBF", barra(T0 + DIA, 99, 101, 93, 94))

    assert pos.estado == "CLOSED"
    assert pos.motivo_cierre == "STOP_LOSS"
    # Se ejecuta EN el stop, no en el mínimo de la barra.
    assert pos.salida == pytest.approx(95.0)
    assert pos.resultado == pytest.approx(-500.0)


def test_stop_loss_short():
    e = cuenta()
    _, pos, _ = abrir(e, direccion="short", stop_loss=105.0, take_profit=90.0)
    # En corto el stop está ARRIBA: lo perfora un máximo, no un mínimo.
    sim.aplicar_barra(e, "PBF", barra(T0 + DIA, 101, 107, 100, 106))

    assert pos.motivo_cierre == "STOP_LOSS"
    assert pos.salida == pytest.approx(105.0)
    assert pos.resultado == pytest.approx(-500.0)


def test_take_profit_long():
    e = cuenta()
    _, pos, _ = abrir(e)  # objetivo 110
    sim.aplicar_barra(e, "PBF", barra(T0 + DIA, 101, 112, 100, 111))

    assert pos.motivo_cierre == "TAKE_PROFIT"
    assert pos.salida == pytest.approx(110.0)
    assert pos.resultado == pytest.approx(1000.0)


def test_take_profit_short():
    e = cuenta()
    _, pos, _ = abrir(e, direccion="short", stop_loss=105.0, take_profit=90.0)
    # En corto el objetivo está ABAJO.
    sim.aplicar_barra(e, "PBF", barra(T0 + DIA, 99, 100, 88, 89))

    assert pos.motivo_cierre == "TAKE_PROFIT"
    assert pos.salida == pytest.approx(90.0)
    assert pos.resultado == pytest.approx(1000.0)


def test_sl_y_tp_en_la_misma_barra_gana_el_stop():
    """
    CONTRAPRUEBA de la regla que sostiene la honestidad del motor.

    La barra toca el stop Y el objetivo. Con datos de barra no se sabe cuál
    llegó primero, así que se asume el peor. Se demuestra que la suposición
    contraria da un resultado DISTINTO Y MEJOR sobre el mismo dato: si el motor
    no eligiera explícitamente, ésta es exactamente la diferencia que se estaría
    regalando.
    """
    e = cuenta()
    _, pos, _ = abrir(e)  # entrada 100, stop 95, objetivo 110
    eventos = sim.aplicar_barra(e, "PBF", barra(T0 + DIA, 100, 112, 93, 105))

    assert pos.motivo_cierre == "STOP_LOSS"
    assert pos.resultado == pytest.approx(-500.0)
    assert eventos[-1].datos.get("ambos_tocados") is True
    assert "se asume el stop" in eventos[-1].detalle

    # Lo que habría dado el supuesto optimista, sobre exactamente el mismo dato.
    optimista = sim.pnl_bruto("long", 100.0, 110.0, 100)
    assert optimista == pytest.approx(1000.0)
    assert optimista != pos.resultado


def test_stop_no_se_dispara_si_la_barra_no_lo_toca():
    e = cuenta()
    _, pos, _ = abrir(e)
    sim.aplicar_barra(e, "PBF", barra(T0 + DIA, 100, 104, 96, 103))
    assert pos.estado == "OPEN"
    assert pos.ultimo_precio == pytest.approx(103.0)


# ==============================================================================
# 9-11 · MARKET, LIMIT y LIMIT pendiente
# ==============================================================================

def test_orden_market_se_ejecuta_al_instante():
    e = cuenta()
    orden, pos, _ = abrir(e, precio=100.0)

    assert orden.estado == "FILLED"
    assert orden.resuelta_ts == T0
    assert orden.precio_ejecucion == pytest.approx(100.0)
    # El puente entre los dos objetos, en las dos direcciones.
    assert orden.posicion_id == pos.id
    assert pos.orden_apertura_id == orden.id


def test_orden_limit_sigue_pendiente_si_no_llega():
    """Una LIMIT aceptada NO crea posición. Es la mitad de la separación."""
    e = cuenta()
    orden, pos, _ = abrir(e, tipo="LIMIT", precio_limite=94.0, stop_loss=90.0, take_profit=105.0)

    assert orden.estado == "PENDING"
    assert pos is None
    assert e.posiciones == []

    # El precio se queda por encima del límite: sigue pendiente.
    sim.aplicar_barra(e, "PBF", barra(T0 + DIA, 100, 102, 96, 101))
    assert orden.estado == "PENDING"
    assert e.posiciones == []


def test_orden_limit_se_ejecuta_al_tocar_el_precio():
    e = cuenta()
    orden, _, _ = abrir(e, tipo="LIMIT", precio_limite=94.0, stop_loss=90.0, take_profit=105.0)

    sim.aplicar_barra(e, "PBF", barra(T0 + DIA, 99, 100, 93, 97))

    assert orden.estado == "FILLED"
    assert orden.precio_ejecucion == pytest.approx(94.0)
    assert len(e.posiciones) == 1
    pos = e.posiciones[0]
    assert pos.estado == "OPEN"
    assert pos.entrada == pytest.approx(94.0)
    assert pos.orden_apertura_id == orden.id
    assert orden.posicion_id == pos.id


def test_limit_con_hueco_se_rellena_en_la_apertura():
    """
    CONTRAPRUEBA del sesgo optimista más silencioso del motor de órdenes.

    Compra limitada a 94. La barra ABRE en 90 por un hueco a la baja. El relleno
    correcto es 90 —mejor precio, el que habría dado el mercado— y no 94.
    Rellenar siempre al límite regala el hueco favorable, y la operación sale
    exactamente igual de plausible en pantalla.
    """
    e = cuenta()
    orden, _, _ = abrir(e, tipo="LIMIT", precio_limite=94.0, stop_loss=85.0, take_profit=105.0)
    sim.aplicar_barra(e, "PBF", barra(T0 + DIA, 90, 96, 89, 95))

    assert orden.precio_ejecucion == pytest.approx(90.0)
    assert orden.precio_ejecucion != orden.precio_limite

    # Y la diferencia importa: son 4 puntos × 100 acciones = 400 regalados.
    ingenuo = sim.pnl_bruto("long", 94.0, 95.0, 100)
    real = sim.pnl_bruto("long", 90.0, 95.0, 100)
    assert real - ingenuo == pytest.approx(400.0)


def test_limit_de_corto_se_ejecuta_al_subir():
    """El LIMIT del corto es simétrico: se vende arriba, no abajo."""
    e = cuenta()
    orden, _, _ = abrir(
        e, direccion="short", tipo="LIMIT", precio_limite=106.0,
        stop_loss=112.0, take_profit=95.0,
    )
    # Sube pero no llega.
    sim.aplicar_barra(e, "PBF", barra(T0 + DIA, 100, 105, 99, 104))
    assert orden.estado == "PENDING"
    # Ahora sí.
    sim.aplicar_barra(e, "PBF", barra(T0 + 2 * DIA, 104, 108, 103, 107))
    assert orden.estado == "FILLED"
    assert orden.precio_ejecucion == pytest.approx(106.0)


def test_limit_caduca_sin_ejecutarse():
    e = cuenta()
    orden, _, _ = abrir(e, tipo="LIMIT", precio_limite=50.0, stop_loss=45.0, take_profit=60.0)
    orden.caduca_ts = T0 + DIA

    sim.aplicar_barra(e, "PBF", barra(T0 + 2 * DIA, 100, 102, 98, 101))
    assert orden.estado == "EXPIRED"
    assert e.posiciones == []


# ==============================================================================
# 12-13 · Cierre manual y automático
# ==============================================================================

def test_cierre_manual():
    e = cuenta()
    _, pos, _ = abrir(e)
    evento = sim.cerrar_a_mano(e, pos.id, 104.0, T0 + 3600)

    assert pos.motivo_cierre == "MANUAL_CLOSE"
    assert pos.cerrada_ts == T0 + 3600
    assert evento is not None and "MANUAL_CLOSE" in evento.detalle


def test_cierre_automatico_por_estrategia():
    e = cuenta()
    _, pos, _ = abrir(e)
    sim.cerrar_a_mano(e, pos.id, 102.0, T0 + DIA, motivo="STRATEGY_EXIT")
    assert pos.motivo_cierre == "STRATEGY_EXIT"


def test_cerrar_dos_veces_no_duplica_el_pnl():
    """Doble clic en «CERRAR» con la red lenta. El segundo no puede cobrar."""
    e = cuenta()
    _, pos, _ = abrir(e)
    sim.cerrar_a_mano(e, pos.id, 108.0, T0 + DIA)
    balance_uno = sim.balance(e)

    segundo = sim.cerrar_a_mano(e, pos.id, 120.0, T0 + 2 * DIA)
    assert segundo is None
    assert sim.balance(e) == pytest.approx(balance_uno)
    assert pos.salida == pytest.approx(108.0)


def test_motivo_de_cierre_desconocido_no_se_acepta():
    e = cuenta()
    _, pos, _ = abrir(e)
    with pytest.raises(ValueError):
        sim.cerrar_posicion(e, pos, 100.0, "PORQUE_SI", T0 + DIA)


# ==============================================================================
# 14-15 · P&L y P&L %
# ==============================================================================

def test_calculo_pnl_con_costes():
    """El P&L neto incluye comisión de entrada, de salida y deslizamiento."""
    e = cuenta(comision_pct=0.1, deslizamiento_pct=0.1)
    _, pos, _ = abrir(e, precio=100.0)

    # Entrada con deslizamiento en contra: 100 × 1,001 = 100,1
    assert pos.entrada == pytest.approx(100.1)
    assert pos.comision_entrada == pytest.approx(100.1 * 100 * 0.001)

    sim.cerrar_a_mano(e, pos.id, 110.0, T0 + DIA)
    # Salida con deslizamiento en contra: 110 × 0,999 = 109,89
    assert pos.salida == pytest.approx(109.89)
    bruto = (109.89 - 100.1) * 100
    esperado = bruto - pos.comision_entrada - pos.comision_salida
    assert pos.resultado == pytest.approx(esperado)
    # Y el neto es MENOR que el bruto: si no, los costes no se estarían aplicando.
    assert pos.resultado < bruto


def test_calculo_pnl_pct_precio_y_capital_coinciden_sin_apalancamiento():
    e = cuenta()
    _, pos, _ = abrir(e, precio=100.0)
    t = sim.tarjeta(pos, 102.0, e.params, T0)

    # 2 puntos sobre 100 → +2 %
    assert t["pnl_pct_precio"] == pytest.approx(2.0)
    assert t["pnl_pct_capital"] == pytest.approx(2.0)


def test_pnl_pct_precio_y_capital_difieren_con_apalancamiento():
    """
    La ambigüedad del porcentaje, fijada.

    Con 4× de apalancamiento el precio sube un 2 % y TU dinero gana un 8 %. Son
    dos cifras correctas y distintas, y publicar una sola sin decir cuál es el
    mismo fallo que un score sin su escala.
    """
    e = cuenta(apalancamiento=4.0)
    _, pos, _ = abrir(e, precio=100.0, apalancamiento=4.0)
    assert pos.margen == pytest.approx(100 * 100 / 4)

    t = sim.tarjeta(pos, 102.0, e.params, T0)
    assert t["pnl_pct_precio"] == pytest.approx(2.0)
    assert t["pnl_pct_capital"] == pytest.approx(8.0)
    assert t["pnl_pct_precio"] != t["pnl_pct_capital"]


def test_el_coste_de_prestamo_solo_lo_paga_el_corto():
    """
    En un largo no se toma nada prestado. Cobrarlo a los dos lados sería
    inventar un coste que no existe.
    """
    e = cuenta(coste_prestamo_anual_pct=3.65)  # ≈ 0,01 %/día

    _, largo, _ = abrir(e, precio=100.0)
    sim.cerrar_a_mano(e, largo.id, 100.0, T0 + 10 * DIA)
    assert largo.coste_prestamo == pytest.approx(0.0)
    assert largo.resultado == pytest.approx(0.0)

    _, corto, _ = abrir(e, direccion="short", stop_loss=105.0, take_profit=95.0, precio=100.0)
    sim.cerrar_a_mano(e, corto.id, 100.0, T0 + 10 * DIA)
    # 10.000 de nocional × 3,65 %/año × 10/365 días = 10
    assert corto.coste_prestamo == pytest.approx(10.0, rel=1e-6)
    assert corto.resultado == pytest.approx(-10.0, rel=1e-6)


# ==============================================================================
# 16-17 · Balance y equity
# ==============================================================================

def test_abrir_no_cambia_el_balance_pero_si_el_equity():
    """
    El invariante que separa BALANCE de EQUITY. Si esta prueba falla algún día,
    la contabilidad está rota: no es un detalle de presentación.
    """
    e = cuenta()
    assert sim.balance(e) == pytest.approx(100_000.0)

    _, pos, _ = abrir(e, precio=100.0)
    assert sim.balance(e) == pytest.approx(100_000.0)          # NO se mueve
    assert sim.equity(e, {"PBF": 100.0}) == pytest.approx(100_000.0)

    # Sube el precio: el equity sube, el balance sigue quieto.
    assert sim.equity(e, {"PBF": 105.0}) == pytest.approx(100_500.0)
    assert sim.balance(e) == pytest.approx(100_000.0)

    # Y al cerrar, el balance recoge lo realizado y el equity converge.
    sim.cerrar_a_mano(e, pos.id, 105.0, T0 + DIA)
    assert sim.balance(e) == pytest.approx(100_500.0)
    assert sim.equity(e, {}) == pytest.approx(100_500.0)


def test_el_margen_retenido_limita_lo_que_se_puede_abrir():
    e = cuenta(capital := 10_000.0, max_posiciones=10)
    _, pos, _ = abrir(e, simbolo="AAA", cantidad=90, precio=100.0, stop_loss=99.0)
    assert pos is not None
    assert sim.capital_libre(e) == pytest.approx(1_000.0)

    # No cabe otra de 9.000.
    _, pos2, fallos = abrir(e, simbolo="BBB", cantidad=90, precio=100.0, stop_loss=99.0)
    assert pos2 is None
    assert any(f.codigo == "MARGEN" for f in fallos)


def test_equity_suma_varias_posiciones_en_direcciones_opuestas():
    e = cuenta()
    abrir(e, simbolo="AAA", precio=100.0)
    abrir(e, simbolo="BBB", direccion="short", precio=50.0, stop_loss=55.0, take_profit=40.0)

    # AAA sube 2 (+200) y BBB sube 1 (−100 en corto) → +100
    eq = sim.equity(e, {"AAA": 102.0, "BBB": 51.0})
    assert eq == pytest.approx(100_100.0)


# ==============================================================================
# 18-19 · Win rate y drawdown
# ==============================================================================

def _tres_ganadoras_dos_perdedoras() -> sim.Estado:
    e = cuenta()
    for i, (simbolo, salida) in enumerate(
        [("A", 110.0), ("B", 105.0), ("C", 92.0), ("D", 120.0), ("E", 96.0)]
    ):
        _, pos, _ = abrir(e, simbolo=simbolo, ts=T0 + i * DIA, precio=100.0)
        sim.cerrar_a_mano(e, pos.id, salida, T0 + i * DIA + 3600)
    return e


def test_win_rate():
    e = _tres_ganadoras_dos_perdedoras()
    m = sim.metricas(e)

    assert m["operaciones"] == 5
    assert m["ganadoras"] == 3
    assert m["perdedoras"] == 2
    assert m["win_rate"] == pytest.approx(60.0)
    # +1000 +500 +2000 = 3500 ; −800 −400 = 1200
    assert m["profit_factor"] == pytest.approx(round(3500 / 1200, 3))
    assert m["mejor"] == pytest.approx(2000.0)
    assert m["peor"] == pytest.approx(-800.0)
    assert m["expectativa"] == pytest.approx((3500 - 1200) / 5)


def test_orden_cancelada_no_entra_en_el_win_rate():
    """
    La consecuencia directa de separar orden y posición.

    Una orden cancelada nunca creó posición: no es una operación con resultado
    cero. Si entrara en el denominador, el win rate bajaría del 60 % al 50 %
    sin que se hubiera operado nada. Un win rate plausible y falso.
    """
    e = _tres_ganadoras_dos_perdedoras()
    antes = sim.metricas(e)["win_rate"]

    orden, pos, _ = abrir(e, simbolo="Z", tipo="LIMIT", precio_limite=1.0,
                          stop_loss=0.5, take_profit=2.0, ts=T0 + 9 * DIA)
    assert pos is None
    sim.cancelar_orden(e, orden.id, T0 + 10 * DIA)
    assert orden.estado == "CANCELLED"

    m = sim.metricas(e)
    assert m["operaciones"] == 5           # sigue siendo 5, no 6
    assert m["win_rate"] == pytest.approx(antes)
    # El error que se está evitando, para que se vea la diferencia:
    assert 3 / 6 * 100 != pytest.approx(antes)


def test_drawdown_sale_de_la_curva_de_patrimonio():
    e = cuenta()
    # Stop y objetivo muy lejos: aquí se mide la CURVA, no los cierres.
    _, pos, _ = abrir(e, precio=100.0, stop_loss=60.0, take_profit=300.0)
    assert pos is not None

    # El precio sube a 120 (pico) y luego se desploma a 80.
    for i, cierre in enumerate([110.0, 120.0, 100.0, 80.0]):
        sim.aplicar_barra(e, "PBF", barra(T0 + (i + 1) * DIA, cierre, cierre, cierre, cierre))

    m = sim.metricas(e, {"PBF": 80.0})
    # Pico 102.000, valle 98.000 → −3,92 %
    assert m["drawdown_max_pct"] == pytest.approx((98_000 - 102_000) / 102_000 * 100, rel=1e-3)
    assert m["drawdown_max_pct"] < 0


def test_drawdown_no_es_la_peor_operacion():
    """
    CONTRAPRUEBA del error ya cometido una vez en /portfolio.

    Dos pérdidas pequeñas ENCADENADAS hunden la curva más que la peor de las
    dos por separado. Si el drawdown fuera «la peor operación», las dos cifras
    coincidirían; la prueba exige que NO coincidan.
    """
    e = cuenta(capital=10_000.0)
    for i in range(2):
        _, pos, _ = abrir(e, simbolo=f"X{i}", ts=T0 + i * DIA, precio=100.0, cantidad=10)
        sim.aplicar_barra(e, f"X{i}", barra(T0 + i * DIA + 1, 100, 100, 100, 100))
        sim.cerrar_a_mano(e, pos.id, 90.0, T0 + i * DIA + 3600)
        sim.aplicar_barra(e, f"X{i}", barra(T0 + i * DIA + 7200, 90, 90, 90, 90))

    m = sim.metricas(e)
    peor_operacion_pct = abs(m["peor"]) / 10_000.0 * 100      # 1 %
    assert m["peor"] == pytest.approx(-100.0)
    # La caída acumulada es del 2 %, el doble de la peor operación suelta.
    assert abs(m["drawdown_max_pct"]) == pytest.approx(2.0, rel=1e-2)
    assert abs(m["drawdown_max_pct"]) > peor_operacion_pct


def test_sin_operaciones_las_metricas_son_huecos_no_ceros():
    """
    Un win rate de 0 % sin haber operado se lee como «pierde siempre». El hueco
    honesto es `None`, que la interfaz dibuja con guion.
    """
    m = sim.metricas(cuenta())
    assert m["operaciones"] == 0
    assert m["win_rate"] is None
    assert m["expectativa"] is None
    assert m["mejor"] is None and m["peor"] is None
    assert m["balance"] == pytest.approx(100_000.0)


# ==============================================================================
# 20 · Deduplicación y protección contra sobreoperación
# ==============================================================================

def test_no_se_abren_dos_posiciones_en_el_mismo_simbolo_y_direccion():
    e = cuenta()
    _, pos, _ = abrir(e)
    assert pos is not None

    orden, pos2, fallos = abrir(e)
    assert pos2 is None
    assert orden.estado == "REJECTED"
    assert any(f.codigo == "YA_ABIERTA" for f in fallos)
    assert pos.id in orden.motivo


def test_se_puede_abrir_el_lado_contrario_del_mismo_simbolo():
    """Cubrirse no es duplicar. Long y short de PBF son posiciones distintas."""
    e = cuenta()
    abrir(e)
    _, corto, fallos = abrir(e, direccion="short", stop_loss=105.0, take_profit=90.0)
    assert corto is not None
    assert not sim.bloquean(fallos)


def test_max_posiciones_abiertas():
    e = cuenta(max_posiciones=2)
    abrir(e, simbolo="A", precio=10.0, stop_loss=9.0, take_profit=12.0)
    abrir(e, simbolo="B", precio=10.0, stop_loss=9.0, take_profit=12.0)
    orden, pos, fallos = abrir(e, simbolo="C", precio=10.0, stop_loss=9.0, take_profit=12.0)

    assert pos is None
    assert any(f.codigo == "MAX_POSICIONES" for f in fallos)


# ==============================================================================
# Coherencia direccional — el bug de /overton, fijado
# ==============================================================================

def test_short_con_niveles_de_overton_es_rechazado():
    """
    `/overton` es LARGO POR CONSTRUCCIÓN:

        stop_loss = precio − ATR·2,2      target1 = precio + ATR·2,5

    Un SHORT construido con esos niveles nace con el stop DEBAJO de la entrada
    y el objetivo DEBAJO también. Se rechaza con los dos motivos por separado,
    y con las cifras delante para que se pueda auditar.
    """
    precio, atr = 100.0, 2.0
    stop_overton = precio - atr * 2.2      # 95,6
    target_overton = precio + atr * 2.5    # 105,0

    e = cuenta()
    orden, pos, fallos = abrir(
        e, direccion="short", precio=precio,
        stop_loss=stop_overton, take_profit=target_overton,
    )
    codigos = {f.codigo for f in fallos}
    assert "STOP_AL_OTRO_LADO" in codigos
    assert "OBJETIVO_AL_OTRO_LADO" in codigos
    assert pos is None and orden.estado == "REJECTED"
    assert "95" in orden.motivo and "105" in orden.motivo

    # Y los mismos niveles en LARGO son perfectamente válidos.
    orden2, pos2, fallos2 = abrir(
        e, direccion="long", precio=precio,
        stop_loss=stop_overton, take_profit=target_overton,
    )
    assert pos2 is not None
    assert not sim.bloquean(fallos2)


def test_long_con_stop_por_encima_es_rechazado():
    e = cuenta()
    _, pos, fallos = abrir(e, stop_loss=105.0)
    assert pos is None
    assert any(f.codigo == "STOP_AL_OTRO_LADO" for f in fallos)


def test_rb_bajo_avisa_pero_no_bloquea():
    """Una advertencia no es una norma. El R/B pobre se dice, no se prohíbe."""
    e = cuenta()
    _, pos, fallos = abrir(e, stop_loss=90.0, take_profit=102.0)  # R/B = 0,2
    assert pos is not None
    rb = next(f for f in fallos if f.codigo == "RB_BAJO")
    assert rb.bloquea is False
    assert not sim.bloquean(fallos)


def test_riesgo_excesivo_se_rechaza():
    e = cuenta(capital=10_000.0, riesgo_max_pct=2.0)
    # 100 acciones × 5 puntos de stop = 500, o sea el 5 % de 10.000.
    _, pos, fallos = abrir(e, precio=100.0, cantidad=100, stop_loss=95.0)
    assert pos is None
    assert any(f.codigo == "RIESGO_EXCESIVO" for f in fallos)


def test_operar_sin_stop_avisa_pero_deja_pasar():
    e = cuenta()
    _, pos, fallos = abrir(e, stop_loss=None, take_profit=None)
    assert pos is not None
    assert any(f.codigo == "SIN_STOP" and not f.bloquea for f in fallos)


# ==============================================================================
# Tamaño por riesgo
# ==============================================================================

def test_tamano_por_riesgo():
    # 1 % de 100.000 = 1.000 de riesgo; stop a 5 puntos → 200 acciones.
    assert sim.tamano_por_riesgo(100_000, 1.0, 100.0, 95.0) == 200
    # Stop más lejos, menos acciones. Es la relación que hace útil la fórmula.
    assert sim.tamano_por_riesgo(100_000, 1.0, 100.0, 90.0) == 100


def test_tamano_sin_distancia_es_hueco_no_cero():
    """Un cero se lee «no compres». Lo que pasa es que falta el stop."""
    assert sim.tamano_por_riesgo(100_000, 1.0, 100.0, 100.0) is None
    assert sim.tamano_por_riesgo(0, 1.0, 100.0, 95.0) is None


def test_riesgo_beneficio():
    assert sim.riesgo_beneficio(100, 95, 115) == pytest.approx(3.0)
    assert sim.riesgo_beneficio(100, 95, None) is None
    assert sim.riesgo_beneficio(100, 100, 115) is None


# ==============================================================================
# Deslizamiento
# ==============================================================================

def test_el_deslizamiento_siempre_va_en_contra():
    """
    Las cuatro combinaciones. Un deslizamiento que a veces favorece no es
    deslizamiento, es ruido — y abarata la mitad de las operaciones.
    """
    d = 1.0  # 1 %
    assert sim.precio_con_deslizamiento(100, "long", True, d) == pytest.approx(101.0)
    assert sim.precio_con_deslizamiento(100, "long", False, d) == pytest.approx(99.0)
    assert sim.precio_con_deslizamiento(100, "short", True, d) == pytest.approx(99.0)
    assert sim.precio_con_deslizamiento(100, "short", False, d) == pytest.approx(101.0)


def test_el_deslizamiento_hace_perder_una_operacion_plana():
    """Entrar y salir al mismo precio no sale gratis. Si sale, no se aplica."""
    e = cuenta(deslizamiento_pct=0.1, comision_pct=0.1)
    _, pos, _ = abrir(e, precio=100.0)
    sim.cerrar_a_mano(e, pos.id, 100.0, T0 + DIA)
    assert pos.resultado < 0


# ==============================================================================
# Liquidación por margen
# ==============================================================================

def test_liquidacion_con_apalancamiento():
    e = cuenta(apalancamiento=5.0)
    _, pos, _ = abrir(e, precio=100.0, cantidad=100, apalancamiento=5.0, stop_loss=50.0)
    # Margen 2.000 sobre 10.000 de nocional → se liquida 20 puntos abajo.
    assert sim.nivel_liquidacion(pos) == pytest.approx(80.0)

    sim.aplicar_barra(e, "PBF", barra(T0 + DIA, 95, 96, 79, 82))
    assert pos.motivo_cierre == "LIQUIDACION"


def test_sin_apalancamiento_no_hay_liquidacion_practica():
    e = cuenta()
    # Una acción: el stop lejanísimo no dispara el tope de riesgo, que no es
    # lo que mide esta prueba.
    _, pos, _ = abrir(e, precio=100.0, cantidad=1, stop_loss=1.0)
    assert pos is not None
    assert sim.nivel_liquidacion(pos) == pytest.approx(0.0)
    sim.aplicar_barra(e, "PBF", barra(T0 + DIA, 50, 60, 40, 45))
    assert pos.estado == "OPEN"


# ==============================================================================
# Un tick suelto no cierra nada
# ==============================================================================

def test_un_precio_suelto_no_dispara_el_stop():
    """
    Un precio aislado no dice por dónde ha pasado el mercado entre dos
    consultas. Si cerrara posiciones, el resultado dependería de cuándo alguien
    abrió la pestaña — que es la definición de un backtest tramposo en vivo.
    Los cierres se deciden recorriendo BARRAS.
    """
    e = cuenta()
    _, pos, _ = abrir(e)                        # stop 95
    eventos = sim.aplicar_precio(e, "PBF", 80.0, T0 + 60)

    assert eventos == []
    assert pos.estado == "OPEN"
    assert pos.ultimo_precio == pytest.approx(80.0)

    # Y al llegar la barra que cubre ese tramo, sí cierra.
    sim.aplicar_barra(e, "PBF", barra(T0 + DIA, 99, 99, 79, 81))
    assert pos.motivo_cierre == "STOP_LOSS"


# ==============================================================================
# Serialización
# ==============================================================================

def test_reconstruir_desde_dict_da_el_mismo_equity():
    e = cuenta(comision_pct=0.05, deslizamiento_pct=0.05, apalancamiento=2.0)
    _, pos, _ = abrir(e, precio=100.0, apalancamiento=2.0)
    abrir(e, simbolo="BBB", tipo="LIMIT", precio_limite=40.0, stop_loss=35.0, take_profit=55.0)
    sim.aplicar_barra(e, "PBF", barra(T0 + DIA, 101, 103, 99, 102))

    precios = {"PBF": 102.0}
    antes = sim.equity(e, precios)
    metricas_antes = sim.metricas(e, precios)

    copia = sim.de_dict(sim.a_dict(e))

    assert sim.equity(copia, precios) == pytest.approx(antes)
    assert sim.metricas(copia, precios) == metricas_antes
    assert copia.params.apalancamiento == pytest.approx(2.0)
    assert len(copia.pendientes()) == 1
    assert copia.pendientes()[0].tipo == "LIMIT"


def test_la_tarjeta_trae_las_distancias_a_sl_y_tp():
    e = cuenta()
    _, pos, _ = abrir(e, precio=100.0)          # stop 95, objetivo 110
    t = sim.tarjeta(pos, 104.0, e.params, T0 + 1112)

    assert t["distancia_stop"]["absoluta"] == pytest.approx(9.0)
    assert t["distancia_objetivo"]["absoluta"] == pytest.approx(6.0)
    assert t["distancia_stop"]["pct"] == pytest.approx(9 / 104 * 100)
    assert t["valor_posicion"] == pytest.approx(10_400.0)
    assert t["segundos_abierta"] == 1112
    assert t["riesgo_beneficio"] == pytest.approx(2.0)


def test_la_tarjeta_de_una_cerrada_congela_la_duracion():
    e = cuenta()
    _, pos, _ = abrir(e)
    sim.cerrar_a_mano(e, pos.id, 104.0, T0 + 600)
    t = sim.tarjeta(pos, 999.0, e.params, T0 + 100_000)

    assert t["estado"] == "CLOSED"
    assert t["segundos_abierta"] == 600      # no sigue corriendo
    assert t["salida"] == pytest.approx(104.0)


# ==============================================================================
# Cierre masivo
# ==============================================================================

def test_cerrar_todo_al_final_de_la_sesion():
    e = cuenta()
    abrir(e, simbolo="A", precio=100.0)
    abrir(e, simbolo="B", precio=50.0, stop_loss=45.0, take_profit=60.0)

    eventos = sim.cerrar_todo(e, {"A": 101.0, "B": 49.0}, T0 + DIA)
    assert len(eventos) == 2
    assert all(p.motivo_cierre == "END_OF_SESSION" for p in e.cerradas())
    assert e.abiertas() == []
    assert sim.balance(e) == pytest.approx(100_000 + 100 - 100)


# ==============================================================================
# Anacronismo — el bug que cazó la prueba de extremo a extremo
# ==============================================================================

def test_una_barra_anterior_a_la_apertura_no_cierra_la_posicion():
    """
    Lo cazó la primera prueba contra el backend real, no una de escritorio.

    Al abrir una cuenta nueva, el relleno traía seis meses de velas diarias y
    cerraba por TAKE_PROFIT una posición abierta hacía treinta segundos, con el
    precio de hacía cuatro meses. El resultado era perfectamente creíble
    —«+386,29 · TAKE_PROFIT»— y nada en pantalla lo delataba.

    La guardia vive en el MOTOR y no en quien le pasa las barras: el motor no
    puede confiar en que le den la serie correcta; es su propio invariante.
    """
    e = cuenta()
    _, pos, _ = abrir(e, ts=T0, precio=100.0)          # stop 95, objetivo 110

    # Una vela de hace un mes que habría tocado el objetivo Y el stop.
    sim.aplicar_barra(e, "PBF", barra(T0 - 30 * DIA, 100, 130, 80, 120))
    assert pos.estado == "OPEN"
    assert pos.resultado is None

    # Y la de mañana sí la cierra.
    sim.aplicar_barra(e, "PBF", barra(T0 + DIA, 100, 130, 99, 120))
    assert pos.motivo_cierre == "TAKE_PROFIT"


def test_una_barra_vieja_no_reescribe_el_precio_actual():
    """
    Si una vela anterior pisara `ultimo_precio`, la tarjeta enseñaría un P&L de
    otra época sin avisar de nada.
    """
    e = cuenta()
    _, pos, _ = abrir(e, ts=T0, precio=100.0, cantidad=1,
                      stop_loss=10.0, take_profit=900.0)
    assert pos is not None
    sim.aplicar_barra(e, "PBF", barra(T0 + DIA, 103, 104, 102, 103))
    assert pos.ultimo_precio == pytest.approx(103.0)

    sim.aplicar_barra(e, "PBF", barra(T0 - 10 * DIA, 40, 41, 39, 40))
    assert pos.ultimo_precio == pytest.approx(103.0)


def test_un_limit_no_lo_ejecuta_una_barra_anterior_a_su_creacion():
    """La misma trampa por el lado de las órdenes."""
    e = cuenta()
    orden, _, _ = abrir(e, ts=T0, tipo="LIMIT", precio_limite=94.0,
                        precio=100.0, stop_loss=90.0, take_profit=105.0)
    sim.aplicar_barra(e, "PBF", barra(T0 - DIA, 95, 96, 80, 85))
    assert orden.estado == "PENDING"
    assert e.posiciones == []

    sim.aplicar_barra(e, "PBF", barra(T0 + DIA, 95, 96, 90, 93))
    assert orden.estado == "FILLED"
