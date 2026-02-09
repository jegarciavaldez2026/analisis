# 📊 Guía de Valoración: Benjamin Graham y Análisis DCF

## 🎯 Métodos de Valoración Implementados

La aplicación ahora incluye **dos métodos complementarios** de valoración de acciones:

### 1. Valoración por Benjamin Graham
**El padre del análisis fundamental y value investing**

#### Fórmula Original (1962)
```
Valor Intrínseco = EPS × (8.5 + 2g)
```

Donde:
- **EPS** = Earnings Per Share (beneficio por acción últimos 12 meses)
- **8.5** = P/E ratio base para una empresa sin crecimiento
- **g** = Tasa de crecimiento anual esperada (próximos 7-10 años)

#### Fórmula Revisada (1974)
```
Valor Intrínseco = (EPS × (8.5 + 2g) × 4.4) / Y
```

Donde:
- **4.4** = Tasa de interés promedio de bonos AAA en 1962
- **Y** = Rendimiento actual de bonos corporativos AAA (~5%)

**La app usa la fórmula revisada** que ajusta por el entorno de tasas de interés actual.

---

### 2. Valoración por DCF (Discounted Cash Flow)
**Análisis de flujos de caja futuros descontados**

#### Metodología
1. **Proyección de FCF** (5 años)
   - Growth rate conservador: 5%
   - Basado en Free Cash Flow actual

2. **Valor Terminal**
   - Terminal growth: 2.5% (crecimiento perpetuo)
   - Representa valor después del año 5

3. **Descuento a Valor Presente**
   - Tasa de descuento = WACC
   - Todos los flujos traídos a valor presente

4. **Equity Value**
   - Enterprise Value - Net Debt
   - Dividido entre shares outstanding

---

## 📊 Interpretación de Resultados

### Margen de Seguridad
**Fórmula**: `(Valor Intrínseco - Precio Actual) / Valor Intrínseco × 100`

#### Criterios de Benjamin Graham

| Margen | Interpretación | Acción Recomendada |
|--------|---------------|-------------------|
| **≥ 25%** | Fuerte subvaloración | ✅ **COMPRAR (Fuerte)** |
| **15-25%** | Subvaloración moderada | ✅ **COMPRAR (Moderado)** |
| **0-15%** | Valoración justa | 🟡 **MANTENER** |
| **-15 a 0%** | Leve sobrevaloración | 🟠 **VENDER (Leve)** |
| **< -15%** | Sobrevaloración significativa | ❌ **VENDER (Sobrevalorada)** |

**Nota**: Graham recomendaba un margen mínimo del **20-30%** para inversión conservadora y **50%** para inversión agresiva en acciones comunes.

---

### Precios Objetivo

#### 1. Conservador (75% del VI)
- Precio con **25% de margen de seguridad** incorporado
- Para inversores aversos al riesgo
- Máxima protección ante errores de estimación

#### 2. Moderado (100% del VI)
- Precio de **valor justo** según valoración
- Para inversores balanceados
- Refleja el valor intrínseco calculado

#### 3. Agresivo (120% del VI)
- Precio con **20% de upside** adicional
- Para inversores con mayor tolerancia al riesgo
- Considera potencial de crecimiento superior

---

## 🔍 Ejemplos Reales

### Caso 1: Apple Inc. (AAPL)
```
Precio Actual: $274.62
Valor Intrínseco Graham: $128.61
Margen de Seguridad: -113.5%
Recomendación: VENDER (Sobrevalorada)

Precios Objetivo:
  Conservador: $96.46
  Moderado: $128.61
  Agresivo: $154.33

Interpretación:
- Apple cotiza a MÁS DEL DOBLE de su valor intrínseco Graham
- Altamente sobrevalorada desde perspectiva value investing
- SIN EMBARGO: Genera valor excepcional (ROIC 60.97% vs WACC 6.54%)
- Negocio con ventajas competitivas extraordinarias
```

**Conclusión**: Precio alto justificado por calidad excepcional del negocio, pero no es una "ganga" según Graham.

---

### Caso 2: Coca-Cola (KO)
```
Precio Actual: $77.97
Valor Intrínseco Graham: $49.17
Margen de Seguridad: -58.6%
Recomendación: VENDER (Sobrevalorada)

Precios Objetivo:
  Conservador: $36.87
  Moderado: $49.17
  Agresivo: $59.00

Interpretación:
- KO cotiza ~60% por encima de su valor intrínseco
- Premium por marca y dividendos estables
- No es oportunidad de value investing en precio actual
```

---

## ⚖️ Comparación: Graham vs DCF

### Benjamin Graham
**Ventajas:**
- ✅ Simple y directo
- ✅ Conservador por diseño
- ✅ Probado por décadas
- ✅ Protege contra sobrepagar

**Limitaciones:**
- ⚠️ Puede ser muy conservador para empresas tech
- ⚠️ No captura cambios estructurales del negocio
- ⚠️ Depende de estimación de crecimiento

**Mejor para:**
- Empresas maduras y estables
- Value investing clásico
- Inversores conservadores

---

### DCF (Discounted Cash Flow)
**Ventajas:**
- ✅ Más flexible y adaptable
- ✅ Captura flujos de caja futuros
- ✅ Considera estructura de capital
- ✅ Ajusta por riesgo (WACC)

**Limitaciones:**
- ⚠️ Muy sensible a supuestos
- ⚠️ Requiere proyecciones precisas
- ⚠️ GIGO (Garbage In, Garbage Out)

**Mejor para:**
- Empresas de crecimiento
- Análisis detallado de flujos
- Evaluación de cambios estratégicos

---

## 🎯 Análisis ROIC vs WACC

### ¿Genera Valor la Empresa?

**Regla de Oro**: `ROIC > WACC` → La empresa GENERA valor

#### Interpretación del Spread

| Spread (ROIC - WACC) | Categoría | Significado |
|---------------------|-----------|-------------|
| **> 10%** | Excelente | Ventaja competitiva sostenible |
| **5-10%** | Buena | Negocio saludable |
| **0-5%** | Moderada | Crea valor modestamente |
| **-5 a 0%** | Débil | Apenas cubre costo de capital |
| **< -5%** | Destruye Valor | Problema estructural serio |

### Ejemplo: Apple (AAPL)
```
ROIC: 60.97%
WACC: 6.54%
Spread: 54.43% (EXCELENTE)

Interpretación:
Por cada dólar invertido, Apple genera $0.60 de retorno, 
mientras que su costo de capital es solo $0.065.
Esto indica ventajas competitivas extraordinarias.
```

**Conclusión**: Aunque esté "cara" según Graham, la calidad del negocio puede justificar el premium.

---

## 💡 Estrategia de Inversión Recomendada

### Enfoque Integrado

1. **Filtro Inicial (Graham)**
   - Buscar margen de seguridad > 20%
   - Identifica oportunidades de value

2. **Análisis de Calidad (ROIC vs WACC)**
   - Verificar que genera valor
   - Spread > 5% = negocio de calidad

3. **Validación (DCF)**
   - Confirmar valoración con DCF
   - Asegurar coherencia entre métodos

4. **Decisión Final**
   - Comprar: Graham + ROIC ambos favorables
   - Esperar mejor precio: ROIC bueno pero precio alto
   - Evitar: Destruye valor o sobrevalorada sin justificación

---

## 📚 Principios de Benjamin Graham

### Las 7 Reglas del Inversor Inteligente

1. **Margen de Seguridad**: Nunca pagues más del 70-75% del valor intrínseco
2. **Análisis Fundamental**: Basa decisiones en fundamentos, no en especulación
3. **Sr. Mercado**: El mercado es tu servidor, no tu maestro
4. **Empresas Sólidas**: Busca historial de beneficios y estabilidad
5. **Diversificación**: No pongas todos los huevos en una canasta
6. **Largo Plazo**: Invierte como si fueras dueño del negocio
7. **Disciplina Emocional**: Sé temeroso cuando otros son codiciosos

---

## ⚠️ Advertencias Importantes

### Limitaciones del Modelo

1. **Supuestos Conservadores**
   - Growth rate: 5% (puede ser bajo para tech)
   - AAA yield: 5% (variable según mercado)
   - No considera eventos extraordinarios

2. **Calidad de Datos**
   - Basado en datos históricos de yfinance
   - Puede haber ajustes contables no capturados
   - Earnings pueden ser volátiles

3. **No Es Asesoramiento**
   - Herramienta de análisis, NO recomendación de compra
   - Consulta siempre con profesionales
   - Considera tu situación particular

---

## 🎓 Casos de Uso

### Cuándo Usar Cada Método

#### Benjamin Graham
- ✅ Acciones value (P/E < 15)
- ✅ Empresas maduras (utilities, consumer staples)
- ✅ Inversión defensiva
- ✅ Buscar gangas en el mercado

#### DCF
- ✅ Empresas de crecimiento
- ✅ Análisis de M&A
- ✅ Valoración de startups en IPO
- ✅ Cambios estratégicos significativos

#### ROIC vs WACC
- ✅ Evaluar calidad del management
- ✅ Identificar ventajas competitivas
- ✅ Comparar empresas del mismo sector
- ✅ Validar sostenibilidad del negocio

---

## 📖 Referencias

- **The Intelligent Investor** - Benjamin Graham (1949)
- **Security Analysis** - Graham & Dodd (1934)
- **Investment Valuation** - Aswath Damodaran
- **Valuation** - McKinsey & Company

---

**Última actualización**: Febrero 2026  
**Versión de la app**: 2.0.0  
**Métodos implementados**: Graham + DCF + ROIC/WACC
