# 📊 Análisis Financiero - Stock Analysis App

Una aplicación móvil completa para analizar acciones que cotizan en bolsa mediante ratios financieros fundamentales. La app extrae datos financieros en tiempo real y proporciona recomendaciones de inversión (COMPRAR/MANTENER/VENDER) basadas en más de 25 métricas clave.

## 🎯 Características Principales

- **Análisis Exhaustivo**: Calcula más de 25 ratios financieros organizados en 6 categorías
- **Recomendaciones Inteligentes**: Algoritmo que evalúa métricas y proporciona recomendación clara
- **Datos en Tiempo Real**: Integración con Yahoo Finance (yfinance) sin necesidad de API key
- **Interfaz Nativa**: UI móvil optimizada con navegación por tabs
- **Historial Completo**: Guarda todos los análisis realizados en MongoDB
- **Sin Costo**: Uso gratuito sin limitaciones de API

## 📱 Capturas de Pantalla

### Pantalla Principal
- Input para ticker o código ISIN
- Botón de análisis con loading state
- Chips con ejemplos populares

### Pantalla de Resultados
- Tarjeta de recomendación destacada (COMPRAR/MANTENER/VENDER)
- Porcentaje de métricas favorables
- Nivel de riesgo (Bajo/Moderado/Alto)
- Indicadores clave visuales
- Ratios organizados por categorías expandibles

### Historial
- Lista de todos los análisis previos
- Pull-to-refresh
- Visualización rápida de recomendaciones

## 📊 Categorías de Análisis

### 1. 📈 Rentabilidad
- ROE (Return on Equity)
- ROA (Return on Assets)
- ROIC (Return on Invested Capital)
- Margen Bruto
- Margen Neto
- Margen Operativo

### 2. 💧 Liquidez
- Ratio Corriente (Current Ratio)
- Ratio Rápido (Quick Ratio)
- Ratio de Efectivo (Cash Ratio)

### 3. ⚖️ Apalancamiento
- Deuda/Capital (Debt-to-Equity)
- Ratio de Deuda (Debt Ratio)
- Deuda Neta (Net Debt)

### 4. 💰 Valoración
- P/E Ratio
- EV/EBIT
- Earning Yield (EBIT/EV)
- P/S Ratio

### 5. 💵 Flujo de Caja
- Flujo de Caja Libre (FCF)
- Margen FCF
- Operating Cash Flow / Ventas
- Capex / Ventas

### 6. 🏥 Salud Financiera
- Altman Z-Score (predicción de quiebra)
- Piotroski F-Score (solidez financiera)

## 🎯 Lógica de Recomendación

```
Métricas Favorables >= 60%  → COMPRAR (Riesgo Bajo)
Métricas Favorables 40-60%  → MANTENER (Riesgo Moderado)
Métricas Favorables < 40%   → VENDER (Riesgo Alto)
```

## 🛠️ Stack Tecnológico

### Backend
- **FastAPI**: Framework web moderno y rápido
- **Python 3.11**: Lenguaje principal
- **yfinance**: Extracción de datos financieros de Yahoo Finance
- **MongoDB**: Base de datos NoSQL para almacenar análisis
- **Motor**: Driver async de MongoDB
- **Pandas & NumPy**: Procesamiento de datos financieros

### Frontend
- **Expo**: Framework para desarrollo móvil multiplataforma
- **React Native**: Componentes nativos
- **Expo Router**: Sistema de navegación file-based
- **TypeScript**: Tipado estático
- **Axios**: Cliente HTTP
- **FlashList**: Listas optimizadas de alto rendimiento
- **Expo Vector Icons**: Iconografía

### Base de Datos
- **MongoDB**: Almacenamiento de análisis y historial

## 📦 Estructura del Proyecto

```
app/
├── backend/
│   ├── server.py           # API FastAPI con toda la lógica
│   ├── requirements.txt    # Dependencias Python
│   └── .env               # Variables de entorno
├── frontend/
│   ├── app/
│   │   ├── _layout.tsx    # Layout principal
│   │   ├── index.tsx      # Redirect a tabs
│   │   ├── (tabs)/        # Navegación por tabs
│   │   │   ├── _layout.tsx
│   │   │   ├── search.tsx
│   │   │   ├── history.tsx
│   │   │   └── info.tsx
│   │   └── screens/
│   │       └── ResultsScreen.tsx
│   ├── package.json       # Dependencias Node
│   └── .env              # Variables de entorno
└── README.md
```

## 🚀 API Endpoints

### POST /api/analyze
Analiza una acción por su ticker o código ISIN.

**Request:**
```json
{
  "ticker": "AAPL"
}
```

**Response:**
```json
{
  "id": "uuid",
  "ticker": "AAPL",
  "company_name": "Apple Inc.",
  "recommendation": "MANTENER",
  "favorable_percentage": 50.0,
  "risk_level": "Moderado",
  "total_metrics": 22,
  "favorable_metrics": 11,
  "unfavorable_metrics": 11,
  "ratios": [...],
  "metadata": {...},
  "summary_flags": {...}
}
```

### GET /api/history
Obtiene el historial de análisis (últimos 50).

### GET /api/analysis/{id}
Obtiene un análisis específico por ID.

## 🎨 Diseño UI/UX

### Principios de Diseño
- **Mobile-First**: Optimizado para uso en dispositivos móviles
- **Thumb-Friendly**: Todos los controles accesibles con el pulgar
- **Visual Hierarchy**: Información importante destacada
- **Loading States**: Feedback visual durante operaciones asíncronas
- **Error Handling**: Mensajes claros y accionables

### Paleta de Colores
- **Primario**: #007AFF (iOS Blue)
- **Éxito/Comprar**: #34C759 (Green)
- **Advertencia/Mantener**: #FF9500 (Orange)
- **Error/Vender**: #FF3B30 (Red)
- **Fondo**: #F5F5F7 (Light Gray)
- **Texto**: #1D1D1F (Almost Black)

## 📈 Casos de Uso

### Análisis Rápido
1. Abre la app
2. Ingresa un ticker (ej: AAPL, MSFT, GOOGL)
3. Presiona "Analizar"
4. Recibe recomendación instantánea

### Análisis Detallado
1. Revisa el porcentaje de métricas favorables
2. Expande cada categoría de ratios
3. Lee la interpretación de cada métrica
4. Compara con umbrales establecidos
5. Toma decisión informada

### Seguimiento
1. Ve al tab "Historial"
2. Revisa análisis previos
3. Compara evolución de diferentes acciones
4. Pull-to-refresh para actualizar

## ⚠️ Advertencias Importantes

Esta aplicación proporciona análisis automatizado basado en ratios financieros históricos y NO constituye asesoramiento financiero profesional. Los usuarios deben:

- Realizar su propia investigación adicional
- Consultar con asesores financieros profesionales
- Considerar su tolerancia al riesgo personal
- No basar decisiones únicamente en esta herramienta
- Entender que rendimientos pasados no garantizan resultados futuros

## 🔄 Datos y Actualización

- **Fuente**: Yahoo Finance a través de yfinance
- **Frecuencia**: Datos en tiempo real al momento del análisis
- **Cobertura**: Acciones que cotizan en bolsas principales (NYSE, NASDAQ, etc.)
- **Limitaciones**: Depende de la disponibilidad de datos en Yahoo Finance

## 🧪 Testing

El backend ha sido probado exhaustivamente:
- ✅ 91.7% de éxito en pruebas (11/12 tests)
- ✅ Análisis de múltiples tickers (AAPL, MSFT, GOOGL, TSLA, AMZN)
- ✅ Cálculo correcto de ratios financieros
- ✅ Lógica de recomendación validada
- ✅ Persistencia en MongoDB funcionando
- ✅ Manejo de errores implementado

## 🎓 Interpretación de Métricas

### Ejemplo: Apple Inc. (AAPL)
```
Recomendación: MANTENER
Métricas Favorables: 50%
Riesgo: Moderado

Fortalezas:
✅ ROE: 151.91% (Excelente)
✅ Márgenes sólidos
✅ Flujo de caja positivo
✅ Altman Z-Score: 10.20 (Muy seguro)

Debilidades:
❌ Alta deuda vs capital
❌ Valoración elevada (P/E: 34.19)
❌ Liquidez ajustada
```

## 📚 Recursos Adicionales

- [Yahoo Finance](https://finance.yahoo.com/)
- [Documentación yfinance](https://github.com/ranaroussi/yfinance)
- [Expo Documentation](https://docs.expo.dev/)
- [FastAPI Documentation](https://fastapi.tiangolo.com/)

## 📄 Licencia

Este proyecto es de código abierto y está disponible bajo la licencia MIT.

## 👥 Contribuciones

Las contribuciones son bienvenidas. Por favor:
1. Fork el repositorio
2. Crea una branch para tu feature
3. Commit tus cambios
4. Push a la branch
5. Abre un Pull Request

## 📞 Soporte

Para reportar bugs o solicitar features, por favor abre un issue en el repositorio.

---

**Versión**: 1.0.0  
**Última actualización**: Enero 2026  
**Powered by**: Yahoo Finance (yfinance)
