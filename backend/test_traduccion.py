"""
Pruebas de traduccion.py — sin modelo ni Mongo reales.

    cd backend && python -m pytest test_traduccion.py -q
"""
from __future__ import annotations

import asyncio
import re

import traduccion as tr


class _Cursor:
    def __init__(self, docs):
        self._docs = docs

    async def to_list(self, _n):
        return list(self._docs)


class _Coleccion:
    def __init__(self):
        self.docs = {}

    def find(self, filtro):
        ids = filtro["_id"]["$in"]
        return _Cursor([self.docs[i] for i in ids if i in self.docs])

    async def update_one(self, filtro, cambio, upsert=False):
        doc = self.docs.setdefault(filtro["_id"], {"_id": filtro["_id"]})
        doc.update(cambio["$set"])


class _Db(dict):
    def __missing__(self, clave):
        self[clave] = _Coleccion()
        return self[clave]


class _Modelo:
    """Traduce anteponiendo «ES:». Registra cada llamada y su prompt."""

    def __init__(self, respuesta=None):
        self.llamadas = []
        self.respuesta = respuesta

    def create_chat_completion(self, messages, **kw):
        texto = messages[-1]["content"]
        self.llamadas.append((texto, kw))
        # Vale para los dos prompts: «Texto: …» y, en el reintento, el último «Inglés: …».
        original = re.split(r"Texto: |Inglés: ", texto)[-1].split("\n")[0].replace(tr.SIN_RAZONAMIENTO, "")
        contenido = self.respuesta if self.respuesta is not None else f"<think>\n\n</think>\n\n{_falsa(original)}"
        return {"choices": [{"message": {"content": contenido}}]}


def _reiniciar_cola():
    tr._COLA = tr._Cola()


TITULAR = "Apple shares rise after earnings beat estimates"
RESUMEN = "The company reported revenue above guidance for the quarter"


def _falsa(original: str) -> str:
    """
    «Traducción» del modelo falso: texto claramente DISTINTO del original.

    Anteponer «ES: » al original ya no vale: `_limpiar_respuesta` rechaza, con
    razón, una salida casi idéntica a la entrada, que es lo que hacía el modelo
    real cuando no traducía.
    """
    # Sin la palabra «Español:»: `_limpiar_respuesta` se queda con lo que va detrás
    # de esa etiqueta (el modelo real la repite con el prompt de ejemplo).
    return "VERSION ES " + original[::-1]


def test_el_prompt_desactiva_el_razonamiento_de_qwen3():
    m = _Modelo()
    tr._traducir_uno(m, TITULAR)
    prompt, kw = m.llamadas[0]
    assert prompt.endswith("/no_think")
    # max_tokens proporcional: un titular no necesita 320 tokens
    assert kw["max_tokens"] < 320


def test_razonamiento_cortado_no_se_toma_por_traduccion():
    cortado = "<think>\nOkay, the user wants me to translate a financial headline into Spanish. Let me"
    assert tr._limpiar_respuesta(cortado, TITULAR) == TITULAR
    # Contraprueba: con las etiquetas cerradas sí sale la traducción
    completa = "Suben las acciones de Apple tras batir las estimaciones de beneficios"
    assert tr._limpiar_respuesta(f"<think>\n\n</think>\n\n{completa}", TITULAR) == completa


def test_espera_cero_devuelve_al_instante_y_la_siguiente_visita_sale_traducida():
    _reiniciar_cola()
    db, m = _Db(), _Modelo()

    async def escenario():
        primera = await tr.traducir_noticias(db, lambda: m, [{"title": TITULAR}], espera=0)
        assert primera[0]["title"] == TITULAR and primera[0]["traducido"] is False
        await tr._COLA.cola.join()
        segunda = await tr.traducir_noticias(db, lambda: m, [{"title": TITULAR}], espera=0)
        return segunda

    segunda = asyncio.run(escenario())
    assert segunda[0]["title"] == _falsa(TITULAR)
    assert segunda[0]["traducido"] is True
    assert len(m.llamadas) == 1  # la segunda salió de la caché


def test_visitas_repetidas_no_duplican_trabajo():
    _reiniciar_cola()
    db, m = _Db(), _Modelo()

    async def escenario():
        for _ in range(5):
            await tr.traducir_noticias(db, lambda: m, [{"title": TITULAR, "summary": RESUMEN}], espera=0)
        await tr._COLA.cola.join()

    asyncio.run(escenario())
    assert len(m.llamadas) == 2  # un titular y un resumen, no diez


def test_titulares_antes_que_resumenes():
    _reiniciar_cola()
    db, m = _Db(), _Modelo()
    noticias = [{"title": f"{TITULAR} {i}", "summary": f"{RESUMEN} {i}"} for i in range(3)]

    async def escenario():
        await tr.traducir_noticias(db, lambda: m, noticias, campos=("title", "summary"), espera=0)
        await tr._COLA.cola.join()

    asyncio.run(escenario())
    orden = ["title" if TITULAR in p else "summary" for p, _ in m.llamadas]
    assert orden == ["title"] * 3 + ["summary"] * 3


def test_con_espera_devuelve_lo_que_termina_a_tiempo():
    _reiniciar_cola()
    db, m = _Db(), _Modelo()
    salida = asyncio.run(tr.traducir_noticias(db, lambda: m, [{"headline": TITULAR}], campos=("headline",), espera=2))
    assert salida[0]["headline"] == _falsa(TITULAR)


def test_una_traduccion_fallida_no_se_reencola():
    _reiniciar_cola()
    db = _Db()
    m = _Modelo(respuesta="<think>\nOkay, let me think about this")

    async def escenario():
        for _ in range(3):
            await tr.traducir_noticias(db, lambda: m, [{"title": TITULAR}], espera=0)
            await tr._COLA.cola.join()

    asyncio.run(escenario())
    # Dos llamadas: el intento directo y el reintento con ejemplo. Ninguna más
    # en las visitas siguientes.
    assert len(m.llamadas) == 2


def test_si_el_modelo_devuelve_el_original_se_reintenta_con_un_ejemplo():
    traduccion = "Las tecnológicas retroceden por las dudas sobre la IA y la ciberseguridad avanza un paso"

    class _EcoLuegoTraduce(_Modelo):
        def create_chat_completion(self, messages, **kw):
            self.llamadas.append((messages[-1]["content"], kw))
            primera = len(self.llamadas) == 1
            contenido = "Tech pulls back on AI concerns, cybersecurity takes a step up" if primera else traduccion
            return {"choices": [{"message": {"content": contenido}, "finish_reason": "stop"}]}

    m = _EcoLuegoTraduce()
    assert tr._traducir_uno(m, "Tech pulls back on AI concerns, cybersecurity takes a step up") == traduccion
    assert len(m.llamadas) == 2 and "Ejemplo" in m.llamadas[1][0]


def test_si_repite_el_formato_del_ejemplo_se_queda_lo_que_va_tras_espanol():
    """Visto el 14 sep 2026: el titular en inglés, «**Español:**» y la traducción, todo junto."""
    original = "Sector Update: Tech Stocks Fall Late Afternoon"
    bruto = f"{original}  \n**Español:** Actualización del sector: las tecnológicas caen a última hora de la tarde"
    assert tr._limpiar_respuesta(bruto, original) == "Actualización del sector: las tecnológicas caen a última hora de la tarde"


def test_el_modelo_pidiendo_el_texto_no_es_una_traduccion():
    """Visto el 14 sep 2026 con el prompt de ejemplo."""
    original = "Could Dario Amodei's AI safety warnings hurt Anthropic's IPO?"
    assert tr._limpiar_respuesta("¿Podrías proporcionar el texto que deseas traducir?", original) == original


def test_texto_en_espanol_no_toca_el_modelo():
    _reiniciar_cola()
    db, m = _Db(), _Modelo()
    salida = asyncio.run(tr.traducir_noticias(db, lambda: m, [{"title": "Suben las bolsas europeas"}], espera=0))
    assert salida[0]["traducido"] is False
    assert m.llamadas == []


def test_el_eco_del_prompt_no_es_una_traduccion():
    """Visto en producción: «Devuelve ÚNICAMENTE la traducción…» se cacheó como titular."""
    eco = "Devuelve ÚNICAMENTE la traducción, sin comillas, sin explicaciones y sin repetir el original."
    assert tr._limpiar_respuesta(eco, TITULAR) == TITULAR


def test_devolver_el_original_casi_intacto_no_es_traducir():
    original = "Billionaire Bill Ackman Trimmed This Big Tech Position to Back These 2 AI Companies"
    casi = "Billionaire Bill Ackman Trimmed This Big Tech Position To Back These 2 AI Companies."
    assert tr._limpiar_respuesta(casi, original) == original
    # Contraprueba: una traducción de verdad, con los mismos nombres propios, pasa
    real = "El multimillonario Bill Ackman recorta su posición en una gran tecnológica para apostar por 2 empresas de IA"
    assert tr._limpiar_respuesta(real, original) == real


def test_titulares_ingleses_sin_palabras_de_la_lista_antigua_se_traducen():
    """Medido en /news/AMZN el 14 sep 2026: estos tres no se traducían nunca."""
    for titular in (
        "Tech pulls back on AI concerns, cybersecurity takes a step up",
        "Sector Update: Consumer Stocks Mixed Late Afternoon",
        "Could Dario Amodei's AI safety warnings hurt Anthropic's IPO?",
    ):
        assert tr.parece_ingles(titular), titular
    # Contraprueba: lo que ya está en español no gasta modelo
    for titular in ("Suben las bolsas europeas", "El BCE mantiene los tipos de interés sin cambios"):
        assert not tr.parece_ingles(titular), titular


def test_una_traduccion_cortada_no_se_acepta():
    """Había 11 así en caché: «3 Acc», «Los precios del pet», «MIND C.T.I. Ltd (NASDAQ:»."""
    original = "MIND C.T.I. Ltd (NASDAQ:MNDO) Is Up But Financials Look Inconsistent: Which Way Is The Stock Headed?"
    assert tr._limpiar_respuesta("MIND C.T.I. Ltd (NASDAQ:", original) == original
    assert tr._limpiar_respuesta("3 Acc", "3 Forgotten AI Stocks That Should Rebound From Their Corrections") != "3 Acc"
    assert tr._limpiar_respuesta("(Banco Santander (SAN), BBVA (B /no_think", "Banco Santander and BBVA are working on deals") \
        == "Banco Santander and BBVA are working on deals"
    # Contraprueba: una traducción completa pasa
    completa = "3 acciones de IA olvidadas que deberían recuperarse de sus correcciones"
    assert tr._limpiar_respuesta(completa, "3 Forgotten AI Stocks That Should Rebound From Their Corrections") == completa


def test_un_resumen_largo_se_compara_con_el_tramo_enviado():
    """Un resumen de 1.600 caracteres se manda recortado a 400: su traducción no está «cortada»."""
    largo = ("The company reported revenue above guidance for the quarter and raised its outlook. " * 20).strip()
    traduccion = "La compañía presentó ingresos por encima de sus previsiones en el trimestre y elevó su perspectiva. " * 4

    class _Largo(_Modelo):
        def create_chat_completion(self, messages, **kw):
            self.llamadas.append((messages[-1]["content"], kw))
            return {"choices": [{"message": {"content": traduccion}, "finish_reason": "stop"}]}

    assert tr._traducir_uno(_Largo(), largo) == traduccion.strip()

    # Y si se rechaza, sale el texto COMPLETO, no el recorte (que se guardaría como traducción)
    class _Eco(_Modelo):
        def create_chat_completion(self, messages, **kw):
            return {"choices": [{"message": {"content": largo[:400]}, "finish_reason": "stop"}]}

    assert tr._traducir_uno(_Eco(), largo) == largo


def test_parada_por_limite_de_tokens_devuelve_el_original():
    class _Cortado(_Modelo):
        def create_chat_completion(self, messages, **kw):
            self.llamadas.append((messages[-1]["content"], kw))
            return {"choices": [{"message": {"content": "Las acciones de Apple"}, "finish_reason": "length"}]}

    assert tr._traducir_uno(_Cortado(), TITULAR) == TITULAR


def test_una_traduccion_rechazada_no_se_guarda_ni_se_marca():
    _reiniciar_cola()
    db = _Db()
    eco = "Devuelve ÚNICAMENTE la traducción, sin comillas, sin explicaciones y sin repetir el original."
    m = _Modelo(respuesta=f"<think>\n\n</think>\n\n{eco}")

    async def escenario():
        await tr.traducir_noticias(db, lambda: m, [{"title": TITULAR}], espera=0)
        await tr._COLA.cola.join()
        return await tr.traducir_noticias(db, lambda: m, [{"title": TITULAR}], espera=0)

    salida = asyncio.run(escenario())
    assert salida[0]["title"] == TITULAR and salida[0]["traducido"] is False
    assert db["traducciones"].docs == {}
