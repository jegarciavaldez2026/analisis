// Local AI Engine - Rule-based financial analysis assistant
// This provides intelligent responses based on financial metrics without requiring an external API

interface AnalysisData {
  ticker: string;
  company_name: string;
  recommendation: string;
  favorable_percentage: number;
  current_price: number;
  ratios: Record<string, any>;
  valuation?: any;
  accounting_quality?: any;
}

interface AIResponse {
  message: string;
  confidence: 'high' | 'medium' | 'low';
  sources: string[];
}

class LocalAIEngine {
  private analysisData: AnalysisData | null = null;
  private conversationHistory: { role: 'user' | 'assistant'; message: string }[] = [];

  setAnalysisData(data: AnalysisData) {
    this.analysisData = data;
    this.conversationHistory = [];
  }

  clearHistory() {
    this.conversationHistory = [];
  }

  generateInitialAnalysis(): AIResponse {
    if (!this.analysisData) {
      return {
        message: "No hay datos de análisis disponibles. Por favor, realiza un análisis de una acción primero.",
        confidence: 'low',
        sources: []
      };
    }

    const { ticker, company_name, recommendation, favorable_percentage, ratios, valuation } = this.analysisData;
    
    let analysis = `📊 **Análisis de ${ticker} - ${company_name}**\n\n`;
    
    // Overall Assessment
    analysis += `**Recomendación General: ${recommendation}**\n`;
    analysis += `${favorable_percentage.toFixed(1)}% de las métricas son favorables.\n\n`;
    
    // Profitability Analysis
    analysis += this.analyzeProfitability(ratios);
    
    // Liquidity Analysis
    analysis += this.analyzeLiquidity(ratios);
    
    // Leverage Analysis
    analysis += this.analyzeLeverage(ratios);
    
    // Valuation Analysis
    if (valuation) {
      analysis += this.analyzeValuation(valuation);
    }
    
    // Final Verdict
    analysis += this.generateVerdict();

    return {
      message: analysis,
      confidence: favorable_percentage > 60 ? 'high' : favorable_percentage > 40 ? 'medium' : 'low',
      sources: ['Datos de yfinance', 'Análisis de ratios financieros', 'Modelos de valoración']
    };
  }

  private analyzeProfitability(ratios: Record<string, any>): string {
    let text = "**📈 Rentabilidad:**\n";
    
    const roic = ratios?.roic?.value;
    const roe = ratios?.roe?.value;
    const netMargin = ratios?.net_margin?.value;
    const grossMargin = ratios?.gross_margin?.value;
    
    if (roic !== undefined) {
      if (roic > 20) {
        text += `• ROIC excelente (${roic.toFixed(1)}%) - La empresa genera retornos muy superiores al costo de capital\n`;
      } else if (roic > 10) {
        text += `• ROIC bueno (${roic.toFixed(1)}%) - Genera valor para los accionistas\n`;
      } else {
        text += `• ROIC bajo (${roic.toFixed(1)}%) - Posible destrucción de valor\n`;
      }
    }
    
    if (roe !== undefined) {
      if (roe > 15) {
        text += `• ROE fuerte (${roe.toFixed(1)}%) - Buena eficiencia del capital propio\n`;
      } else if (roe > 8) {
        text += `• ROE moderado (${roe.toFixed(1)}%)\n`;
      } else {
        text += `• ROE débil (${roe.toFixed(1)}%) - Revisar eficiencia\n`;
      }
    }
    
    if (netMargin !== undefined) {
      if (netMargin > 15) {
        text += `• Margen neto alto (${netMargin.toFixed(1)}%) - Excelente control de costos\n`;
      } else if (netMargin > 5) {
        text += `• Margen neto aceptable (${netMargin.toFixed(1)}%)\n`;
      } else {
        text += `• Margen neto bajo (${netMargin.toFixed(1)}%) - Presión en rentabilidad\n`;
      }
    }
    
    return text + "\n";
  }

  private analyzeLiquidity(ratios: Record<string, any>): string {
    let text = "**💧 Liquidez:**\n";
    
    const currentRatio = ratios?.current_ratio?.value;
    const quickRatio = ratios?.quick_ratio?.value;
    
    if (currentRatio !== undefined) {
      if (currentRatio > 2) {
        text += `• Ratio corriente alto (${currentRatio.toFixed(2)}) - Muy buena capacidad de pago a corto plazo\n`;
      } else if (currentRatio > 1) {
        text += `• Ratio corriente adecuado (${currentRatio.toFixed(2)})\n`;
      } else {
        text += `• ⚠️ Ratio corriente bajo (${currentRatio.toFixed(2)}) - Posible riesgo de liquidez\n`;
      }
    }
    
    if (quickRatio !== undefined) {
      if (quickRatio > 1) {
        text += `• Quick ratio saludable (${quickRatio.toFixed(2)})\n`;
      } else {
        text += `• Quick ratio ajustado (${quickRatio.toFixed(2)}) - Depende del inventario\n`;
      }
    }
    
    return text + "\n";
  }

  private analyzeLeverage(ratios: Record<string, any>): string {
    let text = "**⚖️ Apalancamiento:**\n";
    
    const debtToEquity = ratios?.debt_to_equity?.value;
    const interestCoverage = ratios?.interest_coverage?.value;
    
    if (debtToEquity !== undefined) {
      if (debtToEquity < 0.5) {
        text += `• Deuda/Patrimonio conservador (${debtToEquity.toFixed(2)}) - Bajo riesgo financiero\n`;
      } else if (debtToEquity < 1.5) {
        text += `• Deuda/Patrimonio moderado (${debtToEquity.toFixed(2)})\n`;
      } else {
        text += `• ⚠️ Deuda/Patrimonio alto (${debtToEquity.toFixed(2)}) - Alto apalancamiento\n`;
      }
    }
    
    if (interestCoverage !== undefined) {
      if (interestCoverage > 5) {
        text += `• Cobertura de intereses fuerte (${interestCoverage.toFixed(1)}x)\n`;
      } else if (interestCoverage > 2) {
        text += `• Cobertura de intereses adecuada (${interestCoverage.toFixed(1)}x)\n`;
      } else {
        text += `• ⚠️ Cobertura de intereses baja (${interestCoverage.toFixed(1)}x) - Riesgo de deuda\n`;
      }
    }
    
    return text + "\n";
  }

  private analyzeValuation(valuation: any): string {
    let text = "**💰 Valoración:**\n";
    
    if (valuation.dcf) {
      const marginOfSafety = valuation.dcf.margin_of_safety;
      if (marginOfSafety > 30) {
        text += `• DCF: Margen de seguridad del ${marginOfSafety.toFixed(1)}% - Potencialmente subvalorada\n`;
      } else if (marginOfSafety > 0) {
        text += `• DCF: Margen de seguridad del ${marginOfSafety.toFixed(1)}%\n`;
      } else {
        text += `• DCF: Sin margen de seguridad (${marginOfSafety.toFixed(1)}%) - Posiblemente sobrevalorada\n`;
      }
    }
    
    if (valuation.graham) {
      const grahamMargin = valuation.graham.margin_of_safety;
      if (grahamMargin > 0) {
        text += `• Graham: Margen de seguridad del ${grahamMargin.toFixed(1)}%\n`;
      } else {
        text += `• Graham: Cotiza por encima del valor intrínseco\n`;
      }
    }
    
    return text + "\n";
  }

  private generateVerdict(): string {
    if (!this.analysisData) return "";
    
    const { recommendation, favorable_percentage } = this.analysisData;
    
    let verdict = "**🎯 Conclusión:**\n";
    
    if (recommendation === "COMPRAR") {
      verdict += "La acción muestra fundamentos sólidos. ";
      if (favorable_percentage > 70) {
        verdict += "La mayoría de indicadores son positivos, lo que sugiere una buena oportunidad de inversión. ";
      }
      verdict += "Considera tu horizonte de inversión y tolerancia al riesgo antes de invertir.";
    } else if (recommendation === "MANTENER") {
      verdict += "La acción tiene aspectos mixtos. ";
      verdict += "Podría ser momento de esperar mejores condiciones o más información antes de tomar una decisión.";
    } else {
      verdict += "Los fundamentos muestran señales de precaución. ";
      verdict += "Considera revisar otras alternativas o esperar a que mejoren los indicadores.";
    }
    
    return verdict;
  }

  processQuestion(question: string): AIResponse {
    if (!this.analysisData) {
      return {
        message: "No hay datos de análisis cargados. Por favor, realiza un análisis primero.",
        confidence: 'low',
        sources: []
      };
    }

    const lowerQuestion = question.toLowerCase();
    this.conversationHistory.push({ role: 'user', message: question });
    
    let response: AIResponse;

    // Pattern matching for common questions
    if (this.matchesPattern(lowerQuestion, ['comprar', 'invertir', 'buena inversión', 'vale la pena'])) {
      response = this.answerBuyQuestion();
    } else if (this.matchesPattern(lowerQuestion, ['riesgo', 'peligro', 'seguro', 'arriesgado'])) {
      response = this.answerRiskQuestion();
    } else if (this.matchesPattern(lowerQuestion, ['precio', 'valor', 'caro', 'barato', 'valoración'])) {
      response = this.answerValuationQuestion();
    } else if (this.matchesPattern(lowerQuestion, ['deuda', 'apalancamiento', 'endeudamiento'])) {
      response = this.answerDebtQuestion();
    } else if (this.matchesPattern(lowerQuestion, ['rentab', 'margen', 'ganancia', 'beneficio'])) {
      response = this.answerProfitabilityQuestion();
    } else if (this.matchesPattern(lowerQuestion, ['dividendo', 'pago', 'yield'])) {
      response = this.answerDividendQuestion();
    } else if (this.matchesPattern(lowerQuestion, ['futuro', 'proyección', 'crecimiento', 'perspectiva'])) {
      response = this.answerGrowthQuestion();
    } else if (this.matchesPattern(lowerQuestion, ['comparar', 'competencia', 'sector', 'industria'])) {
      response = this.answerComparisonQuestion();
    } else if (this.matchesPattern(lowerQuestion, ['resumen', 'general', 'análisis', 'qué opinas'])) {
      response = this.generateInitialAnalysis();
    } else {
      response = this.answerGenericQuestion(question);
    }

    this.conversationHistory.push({ role: 'assistant', message: response.message });
    return response;
  }

  private matchesPattern(text: string, patterns: string[]): boolean {
    return patterns.some(pattern => text.includes(pattern));
  }

  private answerBuyQuestion(): AIResponse {
    const { ticker, recommendation, favorable_percentage, ratios } = this.analysisData!;
    
    let message = "";
    
    if (recommendation === "COMPRAR") {
      message = `✅ **Sí, ${ticker} parece una buena oportunidad de compra.**\n\n`;
      message += `Con ${favorable_percentage.toFixed(1)}% de métricas favorables, los fundamentos son sólidos.\n\n`;
      message += "**Puntos a favor:**\n";
      
      if (ratios?.roic?.is_favorable) message += "• Excelente retorno sobre capital invertido\n";
      if (ratios?.roe?.is_favorable) message += "• Buen retorno sobre patrimonio\n";
      if (ratios?.net_margin?.is_favorable) message += "• Márgenes de ganancia saludables\n";
      if (ratios?.fcf_yield?.is_favorable) message += "• Genera flujo de caja libre\n";
      
      message += "\n⚠️ Recuerda: ninguna inversión está garantizada. Diversifica tu portafolio.";
    } else if (recommendation === "MANTENER") {
      message = `🟡 **${ticker} es una inversión de riesgo moderado.**\n\n`;
      message += `Con ${favorable_percentage.toFixed(1)}% de métricas favorables, hay aspectos mixtos.\n\n`;
      message += "Podría esperar a que mejoren algunos indicadores antes de invertir.";
    } else {
      message = `⚠️ **No recomendaría comprar ${ticker} en este momento.**\n\n`;
      message += `Solo ${favorable_percentage.toFixed(1)}% de métricas son favorables.\n\n`;
      message += "**Áreas de preocupación:**\n";
      
      if (!ratios?.roic?.is_favorable) message += "• Retorno sobre capital bajo\n";
      if (!ratios?.current_ratio?.is_favorable) message += "• Problemas de liquidez\n";
      if (!ratios?.debt_to_equity?.is_favorable) message += "• Alto endeudamiento\n";
      
      message += "\nConsidera otras alternativas de inversión.";
    }
    
    return { message, confidence: 'medium', sources: ['Análisis de ratios', 'Recomendación del sistema'] };
  }

  private answerRiskQuestion(): AIResponse {
    const { ticker, ratios } = this.analysisData!;
    
    let riskLevel = 'moderado';
    let message = `📊 **Análisis de riesgo para ${ticker}:**\n\n`;
    
    const debtToEquity = ratios?.debt_to_equity?.value;
    const currentRatio = ratios?.current_ratio?.value;
    const interestCoverage = ratios?.interest_coverage?.value;
    
    let riskFactors = 0;
    
    if (debtToEquity > 1.5) {
      message += "⚠️ **Alto apalancamiento** - La deuda es elevada respecto al patrimonio\n";
      riskFactors++;
    } else if (debtToEquity !== undefined) {
      message += "✅ **Deuda controlada** - Nivel de endeudamiento aceptable\n";
    }
    
    if (currentRatio < 1) {
      message += "⚠️ **Riesgo de liquidez** - Puede tener problemas para pagar obligaciones a corto plazo\n";
      riskFactors++;
    } else if (currentRatio !== undefined) {
      message += "✅ **Liquidez adecuada** - Puede cubrir sus obligaciones a corto plazo\n";
    }
    
    if (interestCoverage !== undefined && interestCoverage < 2) {
      message += "⚠️ **Presión por intereses** - Los gastos financieros son significativos\n";
      riskFactors++;
    }
    
    message += "\n**Nivel de riesgo general:** ";
    if (riskFactors >= 2) {
      message += "🔴 Alto";
      riskLevel = 'alto';
    } else if (riskFactors === 1) {
      message += "🟡 Moderado";
    } else {
      message += "🟢 Bajo";
      riskLevel = 'bajo';
    }
    
    return { message, confidence: riskLevel === 'bajo' ? 'high' : 'medium', sources: ['Ratios de solvencia', 'Análisis de liquidez'] };
  }

  private answerValuationQuestion(): AIResponse {
    const { ticker, current_price, ratios } = this.analysisData!;
    const valuation = (this.analysisData as any).valuation_summary;
    
    let message = `💰 **Valoración de ${ticker}:**\n\n`;
    message += `**Precio actual:** $${current_price?.toFixed(2) || 'N/A'}\n\n`;
    
    const pe = ratios?.pe_ratio?.value;
    const pb = ratios?.pb_ratio?.value;
    const evEbitda = ratios?.ev_ebitda?.value;
    
    if (pe !== undefined) {
      message += `• P/E: ${pe.toFixed(1)}x - `;
      if (pe < 15) message += "Relativamente barato\n";
      else if (pe < 25) message += "Valoración justa\n";
      else message += "Premium alto\n";
    }
    
    if (pb !== undefined) {
      message += `• P/B: ${pb.toFixed(1)}x - `;
      if (pb < 1) message += "Cotiza bajo valor en libros\n";
      else if (pb < 3) message += "Valoración razonable\n";
      else message += "Prima significativa sobre activos\n";
    }
    
    if (valuation?.dcf?.margin_of_safety) {
      const margin = valuation.dcf.margin_of_safety;
      message += `\n**DCF:** Margen de seguridad ${margin.toFixed(1)}%\n`;
      if (margin > 20) message += "→ Potencialmente subvalorada";
      else if (margin < -20) message += "→ Posiblemente sobrevalorada";
      else message += "→ Cerca de su valor justo";
    }
    
    return { message, confidence: 'medium', sources: ['Múltiplos de valoración', 'Modelo DCF'] };
  }

  private answerDebtQuestion(): AIResponse {
    const { ticker, ratios } = this.analysisData!;
    
    let message = `⚖️ **Análisis de deuda de ${ticker}:**\n\n`;
    
    const debtToEquity = ratios?.debt_to_equity?.value;
    const debtToAssets = ratios?.debt_to_assets?.value;
    const interestCoverage = ratios?.interest_coverage?.value;
    
    if (debtToEquity !== undefined) {
      message += `**Deuda/Patrimonio:** ${debtToEquity.toFixed(2)}\n`;
      if (debtToEquity < 0.5) message += "→ Muy conservador, bajo riesgo financiero\n\n";
      else if (debtToEquity < 1) message += "→ Nivel saludable de deuda\n\n";
      else if (debtToEquity < 2) message += "→ Apalancamiento moderado\n\n";
      else message += "→ ⚠️ Alto apalancamiento, mayor riesgo\n\n";
    }
    
    if (interestCoverage !== undefined) {
      message += `**Cobertura de intereses:** ${interestCoverage.toFixed(1)}x\n`;
      if (interestCoverage > 5) message += "→ Puede pagar fácilmente sus intereses\n";
      else if (interestCoverage > 2) message += "→ Cobertura adecuada\n";
      else message += "→ ⚠️ Podría tener problemas con los pagos de intereses\n";
    }
    
    return { message, confidence: 'high', sources: ['Ratios de apalancamiento'] };
  }

  private answerProfitabilityQuestion(): AIResponse {
    const { ticker, ratios } = this.analysisData!;
    
    let message = `📈 **Rentabilidad de ${ticker}:**\n\n`;
    
    const metrics = [
      { key: 'roic', name: 'ROIC', threshold: 15 },
      { key: 'roe', name: 'ROE', threshold: 12 },
      { key: 'roa', name: 'ROA', threshold: 5 },
      { key: 'gross_margin', name: 'Margen Bruto', threshold: 30 },
      { key: 'operating_margin', name: 'Margen Operativo', threshold: 10 },
      { key: 'net_margin', name: 'Margen Neto', threshold: 8 },
    ];
    
    metrics.forEach(({ key, name, threshold }) => {
      const value = ratios?.[key]?.value;
      if (value !== undefined) {
        const status = value > threshold ? '✅' : '⚠️';
        message += `${status} **${name}:** ${value.toFixed(1)}% (umbral: ${threshold}%)\n`;
      }
    });
    
    return { message, confidence: 'high', sources: ['Ratios de rentabilidad'] };
  }

  private answerDividendQuestion(): AIResponse {
    const { ticker, ratios } = this.analysisData!;
    
    let message = `💵 **Información de dividendos de ${ticker}:**\n\n`;
    
    const dividendYield = ratios?.dividend_yield?.value;
    const payoutRatio = ratios?.payout_ratio?.value;
    
    if (dividendYield !== undefined) {
      message += `**Dividend Yield:** ${dividendYield.toFixed(2)}%\n`;
      if (dividendYield > 4) message += "→ Alto rendimiento por dividendos\n\n";
      else if (dividendYield > 2) message += "→ Rendimiento moderado\n\n";
      else if (dividendYield > 0) message += "→ Dividendo modesto\n\n";
      else message += "→ No paga dividendos actualmente\n\n";
    }
    
    if (payoutRatio !== undefined) {
      message += `**Payout Ratio:** ${payoutRatio.toFixed(1)}%\n`;
      if (payoutRatio < 40) message += "→ Dividendo sostenible, espacio para crecer";
      else if (payoutRatio < 70) message += "→ Ratio saludable";
      else message += "→ ⚠️ Alto payout, podría no ser sostenible";
    }
    
    if (dividendYield === undefined && payoutRatio === undefined) {
      message += "No hay información de dividendos disponible para esta acción.";
    }
    
    return { message, confidence: 'medium', sources: ['Datos de dividendos'] };
  }

  private answerGrowthQuestion(): AIResponse {
    const { ticker, ratios } = this.analysisData!;
    
    let message = `📊 **Perspectivas de crecimiento de ${ticker}:**\n\n`;
    
    const revenueGrowth = ratios?.revenue_growth?.value;
    const earningsGrowth = ratios?.earnings_growth?.value;
    const pegRatio = ratios?.peg_ratio?.value;
    
    if (revenueGrowth !== undefined) {
      message += `**Crecimiento de ingresos:** ${revenueGrowth.toFixed(1)}%\n`;
      if (revenueGrowth > 15) message += "→ Crecimiento fuerte\n\n";
      else if (revenueGrowth > 5) message += "→ Crecimiento moderado\n\n";
      else if (revenueGrowth > 0) message += "→ Crecimiento lento\n\n";
      else message += "→ ⚠️ Ingresos decrecientes\n\n";
    }
    
    if (earningsGrowth !== undefined) {
      message += `**Crecimiento de ganancias:** ${earningsGrowth.toFixed(1)}%\n\n`;
    }
    
    if (pegRatio !== undefined) {
      message += `**PEG Ratio:** ${pegRatio.toFixed(2)}\n`;
      if (pegRatio < 1) message += "→ Crecimiento infravalorado";
      else if (pegRatio < 2) message += "→ Valoración justa vs crecimiento";
      else message += "→ Prima por crecimiento esperado";
    }
    
    message += "\n\n*Nota: Las proyecciones se basan en datos históricos y no garantizan resultados futuros.*";
    
    return { message, confidence: 'low', sources: ['Datos históricos de crecimiento'] };
  }

  private answerComparisonQuestion(): AIResponse {
    const { ticker, company_name, ratios, favorable_percentage } = this.analysisData!;
    
    let message = `🏢 **${ticker} en contexto:**\n\n`;
    message += `**Empresa:** ${company_name}\n`;
    message += `**Score general:** ${favorable_percentage.toFixed(1)}% de métricas favorables\n\n`;
    
    message += "**Fortalezas relativas:**\n";
    
    const strongMetrics = Object.entries(ratios || {})
      .filter(([_, data]: [string, any]) => data?.is_favorable)
      .slice(0, 5);
    
    strongMetrics.forEach(([key, data]: [string, any]) => {
      message += `✅ ${key.replace(/_/g, ' ')}: ${typeof data.value === 'number' ? data.value.toFixed(2) : data.value}\n`;
    });
    
    message += "\n**Áreas de mejora:**\n";
    
    const weakMetrics = Object.entries(ratios || {})
      .filter(([_, data]: [string, any]) => !data?.is_favorable)
      .slice(0, 3);
    
    weakMetrics.forEach(([key, data]: [string, any]) => {
      message += `⚠️ ${key.replace(/_/g, ' ')}: ${typeof data.value === 'number' ? data.value.toFixed(2) : data.value}\n`;
    });
    
    message += "\n*Para una comparación completa con competidores, analiza varias empresas del sector.*";
    
    return { message, confidence: 'medium', sources: ['Análisis comparativo interno'] };
  }

  private answerGenericQuestion(question: string): AIResponse {
    const { ticker, recommendation, favorable_percentage } = this.analysisData!;
    
    let message = `🤖 **Sobre ${ticker}:**\n\n`;
    message += `Basándome en el análisis de ${ticker}, puedo decirte que:\n\n`;
    message += `• La recomendación actual es: **${recommendation}**\n`;
    message += `• ${favorable_percentage.toFixed(1)}% de las métricas analizadas son favorables\n\n`;
    message += `**Preguntas que puedo responder:**\n`;
    message += `• ¿Debería comprar esta acción?\n`;
    message += `• ¿Cuál es el nivel de riesgo?\n`;
    message += `• ¿Está cara o barata la acción?\n`;
    message += `• ¿Cómo está su deuda?\n`;
    message += `• ¿Qué tal su rentabilidad?\n`;
    message += `• ¿Paga dividendos?\n`;
    message += `• ¿Cuáles son sus perspectivas de crecimiento?\n`;
    
    return { message, confidence: 'low', sources: ['Base de conocimiento general'] };
  }

  getConversationHistory() {
    return this.conversationHistory;
  }
}

export const localAI = new LocalAIEngine();
export default localAI;
