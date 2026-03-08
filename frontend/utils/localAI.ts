// Enhanced Local AI Engine - Advanced rule-based financial analysis assistant
// Provides sophisticated analysis based on financial metrics and multiple analytical frameworks

interface AnalysisData {
  ticker: string;
  company_name: string;
  recommendation: string;
  favorable_percentage: number;
  current_price: number;
  ratios: Record<string, any>;
  valuation_summary?: any;
  accounting_quality?: any;
}

interface AIResponse {
  message: string;
  confidence: 'high' | 'medium' | 'low';
  sources: string[];
}

// Financial analysis frameworks and thresholds
const FRAMEWORKS = {
  profitability: {
    roic: { excellent: 20, good: 15, acceptable: 10, poor: 5 },
    roe: { excellent: 20, good: 15, acceptable: 10, poor: 5 },
    roa: { excellent: 10, good: 7, acceptable: 5, poor: 2 },
    netMargin: { excellent: 20, good: 15, acceptable: 10, poor: 5 },
    grossMargin: { excellent: 50, good: 40, acceptable: 30, poor: 20 },
    operatingMargin: { excellent: 25, good: 15, acceptable: 10, poor: 5 },
  },
  liquidity: {
    currentRatio: { excellent: 2.5, good: 2.0, acceptable: 1.5, risky: 1.0 },
    quickRatio: { excellent: 1.5, good: 1.2, acceptable: 1.0, risky: 0.7 },
    cashRatio: { excellent: 0.5, good: 0.3, acceptable: 0.2, risky: 0.1 },
  },
  leverage: {
    debtToEquity: { conservative: 0.3, moderate: 0.7, aggressive: 1.5, risky: 2.5 },
    debtToAssets: { conservative: 0.2, moderate: 0.4, aggressive: 0.6, risky: 0.8 },
    interestCoverage: { excellent: 10, good: 5, acceptable: 3, risky: 1.5 },
  },
  valuation: {
    pe: { undervalued: 12, fair: 20, overvalued: 30, expensive: 50 },
    pb: { undervalued: 1, fair: 2, overvalued: 4, expensive: 8 },
    evEbitda: { undervalued: 8, fair: 12, overvalued: 18, expensive: 25 },
    pegRatio: { undervalued: 0.8, fair: 1.2, overvalued: 2, expensive: 3 },
  },
  growth: {
    revenueGrowth: { excellent: 25, good: 15, moderate: 8, slow: 3 },
    earningsGrowth: { excellent: 30, good: 20, moderate: 10, slow: 5 },
  },
  cashFlow: {
    fcfYield: { excellent: 8, good: 5, acceptable: 3, poor: 1 },
    fcfMargin: { excellent: 15, good: 10, acceptable: 5, poor: 2 },
  },
  quality: {
    altmanZ: { safe: 3.0, grey: 1.8, distress: 1.0 },
    piotroskiF: { strong: 7, moderate: 5, weak: 3 },
    beneishM: { manipulation: -2.22 },
  },
};

class EnhancedLocalAI {
  private analysisData: AnalysisData | null = null;
  private conversationHistory: { role: 'user' | 'assistant'; message: string }[] = [];

  setAnalysisData(data: AnalysisData) {
    this.analysisData = data;
    this.conversationHistory = [];
  }

  clearHistory() {
    this.conversationHistory = [];
  }

  // Calculate overall company score (0-100)
  private calculateCompanyScore(): { score: number; breakdown: Record<string, number> } {
    if (!this.analysisData?.ratios) return { score: 0, breakdown: {} };
    
    const ratios = this.analysisData.ratios;
    const breakdown: Record<string, number> = {};
    let totalWeight = 0;
    let weightedScore = 0;
    
    // Profitability (30% weight)
    const profitScore = this.scoreCategory('profitability', ratios);
    breakdown.profitability = profitScore;
    weightedScore += profitScore * 0.30;
    totalWeight += 0.30;
    
    // Financial Health (25% weight)
    const healthScore = this.scoreCategory('health', ratios);
    breakdown.financialHealth = healthScore;
    weightedScore += healthScore * 0.25;
    totalWeight += 0.25;
    
    // Valuation (20% weight)
    const valuationScore = this.scoreCategory('valuation', ratios);
    breakdown.valuation = valuationScore;
    weightedScore += valuationScore * 0.20;
    totalWeight += 0.20;
    
    // Cash Flow (15% weight)
    const cashFlowScore = this.scoreCategory('cashFlow', ratios);
    breakdown.cashFlow = cashFlowScore;
    weightedScore += cashFlowScore * 0.15;
    totalWeight += 0.15;
    
    // Growth (10% weight)
    const growthScore = this.scoreCategory('growth', ratios);
    breakdown.growth = growthScore;
    weightedScore += growthScore * 0.10;
    totalWeight += 0.10;
    
    return { score: Math.round(weightedScore), breakdown };
  }

  private scoreCategory(category: string, ratios: Record<string, any>): number {
    let score = 50; // Base score
    
    switch (category) {
      case 'profitability':
        const roic = this.getValue(ratios, 'roic');
        const roe = this.getValue(ratios, 'roe');
        const netMargin = this.getValue(ratios, 'net_margin');
        const grossMargin = this.getValue(ratios, 'gross_margin');
        
        if (roic > 20) score += 15;
        else if (roic > 15) score += 10;
        else if (roic > 10) score += 5;
        else if (roic < 5) score -= 15;
        
        if (roe > 20) score += 10;
        else if (roe > 15) score += 5;
        else if (roe < 5) score -= 10;
        
        if (netMargin > 15) score += 10;
        else if (netMargin > 10) score += 5;
        else if (netMargin < 0) score -= 20;
        
        if (grossMargin > 50) score += 10;
        else if (grossMargin > 40) score += 5;
        else if (grossMargin < 20) score -= 10;
        break;
        
      case 'health':
        const currentRatio = this.getValue(ratios, 'current_ratio');
        const debtToEquity = this.getValue(ratios, 'debt_to_equity');
        const interestCoverage = this.getValue(ratios, 'interest_coverage');
        
        if (currentRatio > 2) score += 15;
        else if (currentRatio > 1.5) score += 10;
        else if (currentRatio < 1) score -= 20;
        
        if (debtToEquity < 0.5) score += 15;
        else if (debtToEquity < 1) score += 5;
        else if (debtToEquity > 2) score -= 20;
        
        if (interestCoverage > 10) score += 15;
        else if (interestCoverage > 5) score += 10;
        else if (interestCoverage < 2) score -= 15;
        break;
        
      case 'valuation':
        const pe = this.getValue(ratios, 'pe_ratio');
        const pb = this.getValue(ratios, 'pb_ratio');
        const evEbitda = this.getValue(ratios, 'ev_ebitda');
        
        if (pe > 0 && pe < 15) score += 15;
        else if (pe > 0 && pe < 25) score += 5;
        else if (pe > 40) score -= 15;
        
        if (pb > 0 && pb < 2) score += 10;
        else if (pb > 0 && pb < 4) score += 5;
        else if (pb > 8) score -= 10;
        
        if (evEbitda > 0 && evEbitda < 10) score += 10;
        else if (evEbitda > 20) score -= 10;
        break;
        
      case 'cashFlow':
        const fcfYield = this.getValue(ratios, 'fcf_yield');
        const fcfMargin = this.getValue(ratios, 'fcf_margin');
        
        if (fcfYield > 8) score += 20;
        else if (fcfYield > 5) score += 15;
        else if (fcfYield > 3) score += 10;
        else if (fcfYield < 0) score -= 20;
        
        if (fcfMargin > 15) score += 15;
        else if (fcfMargin > 10) score += 10;
        else if (fcfMargin < 0) score -= 15;
        break;
        
      case 'growth':
        const revenueGrowth = this.getValue(ratios, 'revenue_growth');
        const earningsGrowth = this.getValue(ratios, 'earnings_growth');
        
        if (revenueGrowth > 20) score += 20;
        else if (revenueGrowth > 10) score += 10;
        else if (revenueGrowth < 0) score -= 15;
        
        if (earningsGrowth > 25) score += 15;
        else if (earningsGrowth > 10) score += 10;
        else if (earningsGrowth < 0) score -= 10;
        break;
    }
    
    return Math.max(0, Math.min(100, score));
  }

  private getValue(ratios: Record<string, any>, key: string): number {
    return ratios?.[key]?.value ?? ratios?.[key] ?? 0;
  }

  generateInitialAnalysis(): AIResponse {
    if (!this.analysisData) {
      return {
        message: "No hay datos de análisis disponibles. Por favor, realiza un análisis de una acción primero.",
        confidence: 'low',
        sources: []
      };
    }

    const { ticker, company_name, recommendation, favorable_percentage, ratios } = this.analysisData;
    const { score, breakdown } = this.calculateCompanyScore();
    
    let analysis = `📊 **Análisis Completo de ${ticker}**\n`;
    analysis += `*${company_name}*\n\n`;
    
    // Overall Score
    analysis += `**🎯 Puntuación Global: ${score}/100**\n`;
    analysis += this.getScoreInterpretation(score) + '\n\n';
    
    // Score Breakdown
    analysis += `**📈 Desglose por Categoría:**\n`;
    analysis += `• Rentabilidad: ${breakdown.profitability || 0}/100\n`;
    analysis += `• Salud Financiera: ${breakdown.financialHealth || 0}/100\n`;
    analysis += `• Valoración: ${breakdown.valuation || 0}/100\n`;
    analysis += `• Flujo de Caja: ${breakdown.cashFlow || 0}/100\n`;
    analysis += `• Crecimiento: ${breakdown.growth || 0}/100\n\n`;
    
    // Key Strengths
    const strengths = this.identifyStrengths(ratios);
    if (strengths.length > 0) {
      analysis += `**✅ Fortalezas Clave:**\n`;
      strengths.forEach(s => analysis += `• ${s}\n`);
      analysis += '\n';
    }
    
    // Key Risks
    const risks = this.identifyRisks(ratios);
    if (risks.length > 0) {
      analysis += `**⚠️ Riesgos Identificados:**\n`;
      risks.forEach(r => analysis += `• ${r}\n`);
      analysis += '\n';
    }
    
    // Investment Thesis
    analysis += `**💡 Tesis de Inversión:**\n`;
    analysis += this.generateInvestmentThesis(score, breakdown, strengths, risks);
    analysis += '\n\n';
    
    // Final Recommendation
    analysis += `**🎯 Recomendación: ${recommendation}**\n`;
    analysis += `${favorable_percentage.toFixed(1)}% de métricas favorables`;

    return {
      message: analysis,
      confidence: score > 65 ? 'high' : score > 45 ? 'medium' : 'low',
      sources: ['Análisis fundamental', 'Ratios financieros', 'Modelos de valoración', 'Indicadores de calidad']
    };
  }

  private getScoreInterpretation(score: number): string {
    if (score >= 80) return '🌟 Excelente - Empresa de alta calidad con fundamentos sólidos';
    if (score >= 65) return '✅ Bueno - Empresa sólida con algunas áreas de mejora';
    if (score >= 50) return '🟡 Regular - Empresa con aspectos mixtos que requiere análisis adicional';
    if (score >= 35) return '⚠️ Precaución - Varios indicadores débiles identificados';
    return '🔴 Riesgo Alto - Fundamentos preocupantes';
  }

  private identifyStrengths(ratios: Record<string, any>): string[] {
    const strengths: string[] = [];
    
    if (this.getValue(ratios, 'roic') > 20) 
      strengths.push('Retorno sobre capital excelente (ROIC > 20%)');
    if (this.getValue(ratios, 'net_margin') > 15) 
      strengths.push('Márgenes de ganancia superiores al promedio');
    if (this.getValue(ratios, 'current_ratio') > 2) 
      strengths.push('Excelente posición de liquidez');
    if (this.getValue(ratios, 'debt_to_equity') < 0.5) 
      strengths.push('Bajo nivel de endeudamiento');
    if (this.getValue(ratios, 'fcf_yield') > 5) 
      strengths.push('Generación de flujo de caja libre robusta');
    if (this.getValue(ratios, 'interest_coverage') > 10) 
      strengths.push('Capacidad sobresaliente de pago de intereses');
    if (this.getValue(ratios, 'revenue_growth') > 15) 
      strengths.push('Crecimiento de ingresos acelerado');
    if (this.getValue(ratios, 'gross_margin') > 50) 
      strengths.push('Poder de fijación de precios (margen bruto > 50%)');
    
    return strengths.slice(0, 5);
  }

  private identifyRisks(ratios: Record<string, any>): string[] {
    const risks: string[] = [];
    
    if (this.getValue(ratios, 'current_ratio') < 1) 
      risks.push('Riesgo de liquidez - Ratio corriente < 1');
    if (this.getValue(ratios, 'debt_to_equity') > 2) 
      risks.push('Alto apalancamiento financiero');
    if (this.getValue(ratios, 'interest_coverage') < 2) 
      risks.push('Baja cobertura de intereses');
    if (this.getValue(ratios, 'net_margin') < 0) 
      risks.push('Empresa operando con pérdidas');
    if (this.getValue(ratios, 'pe_ratio') > 50) 
      risks.push('Valoración extremadamente alta');
    if (this.getValue(ratios, 'revenue_growth') < 0) 
      risks.push('Ingresos en declive');
    if (this.getValue(ratios, 'fcf_yield') < 0) 
      risks.push('Flujo de caja libre negativo');
    if (this.getValue(ratios, 'roic') < 5) 
      risks.push('Bajo retorno sobre capital - posible destrucción de valor');
    
    return risks.slice(0, 5);
  }

  private generateInvestmentThesis(
    score: number, 
    breakdown: Record<string, number>, 
    strengths: string[], 
    risks: string[]
  ): string {
    let thesis = '';
    
    if (score >= 70) {
      thesis = `Esta empresa presenta fundamentos sólidos con ${strengths.length} fortalezas significativas identificadas. `;
      if (breakdown.profitability > 60) {
        thesis += 'La rentabilidad es un punto destacado. ';
      }
      if (breakdown.cashFlow > 60) {
        thesis += 'La generación de efectivo es consistente. ';
      }
      thesis += 'Podría ser una buena adición a un portafolio diversificado para inversores con horizonte de mediano a largo plazo.';
    } else if (score >= 50) {
      thesis = `La empresa muestra características mixtas. `;
      if (strengths.length > 0) {
        thesis += `Destaca por: ${strengths[0].toLowerCase()}. `;
      }
      if (risks.length > 0) {
        thesis += `Sin embargo, hay que monitorear: ${risks[0].toLowerCase()}. `;
      }
      thesis += 'Recomendable esperar mejores condiciones o más información antes de una posición significativa.';
    } else {
      thesis = `Se identifican ${risks.length} factores de riesgo importantes. `;
      thesis += 'Los fundamentos actuales no justifican una inversión. ';
      thesis += 'Se sugiere buscar alternativas con mejor perfil riesgo/retorno o esperar a que la empresa mejore sus métricas clave.';
    }
    
    return thesis;
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

    // Enhanced pattern matching
    if (this.matchesPattern(lowerQuestion, ['comprar', 'invertir', 'buena inversión', 'vale la pena', 'entrar', 'posición'])) {
      response = this.answerBuyQuestion();
    } else if (this.matchesPattern(lowerQuestion, ['riesgo', 'peligro', 'seguro', 'arriesgado', 'quiebra', 'bancarrota'])) {
      response = this.answerRiskQuestion();
    } else if (this.matchesPattern(lowerQuestion, ['precio', 'valor', 'caro', 'barato', 'valoración', 'sobrevalorad', 'infravalorad'])) {
      response = this.answerValuationQuestion();
    } else if (this.matchesPattern(lowerQuestion, ['deuda', 'apalancamiento', 'endeudamiento', 'solvencia'])) {
      response = this.answerDebtQuestion();
    } else if (this.matchesPattern(lowerQuestion, ['rentab', 'margen', 'ganancia', 'beneficio', 'utilidad', 'profitable'])) {
      response = this.answerProfitabilityQuestion();
    } else if (this.matchesPattern(lowerQuestion, ['dividendo', 'pago', 'yield', 'reparto', 'distribución'])) {
      response = this.answerDividendQuestion();
    } else if (this.matchesPattern(lowerQuestion, ['futuro', 'proyección', 'crecimiento', 'perspectiva', 'outlook', 'potencial'])) {
      response = this.answerGrowthQuestion();
    } else if (this.matchesPattern(lowerQuestion, ['comparar', 'competencia', 'sector', 'industria', 'peer', 'similar'])) {
      response = this.answerComparisonQuestion();
    } else if (this.matchesPattern(lowerQuestion, ['flujo', 'caja', 'efectivo', 'cash', 'fcf'])) {
      response = this.answerCashFlowQuestion();
    } else if (this.matchesPattern(lowerQuestion, ['calidad', 'manipulación', 'contable', 'fraude', 'beneish', 'altman'])) {
      response = this.answerQualityQuestion();
    } else if (this.matchesPattern(lowerQuestion, ['resumen', 'general', 'análisis', 'qué opinas', 'evalúa', 'assessment'])) {
      response = this.generateInitialAnalysis();
    } else if (this.matchesPattern(lowerQuestion, ['fortaleza', 'ventaja', 'punto fuerte', 'destaca', 'positivo'])) {
      response = this.answerStrengthsQuestion();
    } else if (this.matchesPattern(lowerQuestion, ['debilidad', 'problema', 'punto débil', 'mejorar', 'negativo'])) {
      response = this.answerWeaknessesQuestion();
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
    const { score, breakdown } = this.calculateCompanyScore();
    
    let message = `📊 **Análisis de Compra para ${ticker}**\n\n`;
    
    // Overall verdict
    message += `**Puntuación Global: ${score}/100**\n\n`;
    
    if (score >= 70 && recommendation === "COMPRAR") {
      message += `✅ **Sí, ${ticker} parece una buena oportunidad de compra.**\n\n`;
      message += `**Razones principales:**\n`;
      
      if (breakdown.profitability > 60) message += `• Alta rentabilidad (${breakdown.profitability}/100)\n`;
      if (breakdown.financialHealth > 60) message += `• Sólida salud financiera (${breakdown.financialHealth}/100)\n`;
      if (breakdown.cashFlow > 60) message += `• Buena generación de efectivo (${breakdown.cashFlow}/100)\n`;
      if (breakdown.valuation > 55) message += `• Valoración atractiva (${breakdown.valuation}/100)\n`;
      
      message += `\n**Estrategia sugerida:**\n`;
      message += `• Considera entrar gradualmente (DCA)\n`;
      message += `• Mantén un horizonte de 3-5 años mínimo\n`;
      message += `• No inviertas más del 5-10% de tu portafolio en una sola acción\n`;
    } else if (score >= 50 && recommendation === "MANTENER") {
      message += `🟡 **${ticker} requiere cautela.**\n\n`;
      message += `La empresa tiene aspectos positivos pero también áreas de preocupación.\n\n`;
      message += `**Podría considerar comprar si:**\n`;
      message += `• El precio cae 15-20% más\n`;
      message += `• Mejoran los indicadores de ${breakdown.valuation < 50 ? 'valoración' : breakdown.financialHealth < 50 ? 'salud financiera' : 'crecimiento'}\n`;
      message += `• Ya tienes exposición al sector y buscas diversificar\n`;
    } else {
      message += `⚠️ **No recomiendo comprar ${ticker} actualmente.**\n\n`;
      message += `**Factores negativos:**\n`;
      if (breakdown.profitability < 45) message += `• Rentabilidad débil (${breakdown.profitability}/100)\n`;
      if (breakdown.financialHealth < 45) message += `• Problemas de salud financiera (${breakdown.financialHealth}/100)\n`;
      if (breakdown.valuation < 40) message += `• Valoración poco atractiva (${breakdown.valuation}/100)\n`;
      
      message += `\n**Mejor esperar hasta que:**\n`;
      message += `• Mejoren los fundamentales\n`;
      message += `• La valoración sea más atractiva\n`;
      message += `• Haya un catalizador claro de mejora\n`;
    }
    
    return { message, confidence: score > 60 ? 'high' : 'medium', sources: ['Análisis cuantitativo', 'Métricas fundamentales'] };
  }

  private answerRiskQuestion(): AIResponse {
    const { ticker, ratios } = this.analysisData!;
    const { score } = this.calculateCompanyScore();
    
    let message = `🔍 **Análisis de Riesgo Detallado - ${ticker}**\n\n`;
    
    // Risk Score
    const riskLevel = 100 - score;
    message += `**Nivel de Riesgo: ${riskLevel}/100**\n`;
    message += riskLevel > 60 ? '🔴 ALTO\n\n' : riskLevel > 40 ? '🟡 MODERADO\n\n' : '🟢 BAJO\n\n';
    
    // Detailed risks
    message += `**📋 Evaluación por Categoría:**\n\n`;
    
    // Liquidity Risk
    const currentRatio = this.getValue(ratios, 'current_ratio');
    const quickRatio = this.getValue(ratios, 'quick_ratio');
    message += `**1. Riesgo de Liquidez:**\n`;
    if (currentRatio < 1) {
      message += `⚠️ CRÍTICO - No puede cubrir obligaciones a corto plazo\n`;
    } else if (currentRatio < 1.5) {
      message += `🟡 MODERADO - Liquidez ajustada\n`;
    } else {
      message += `✅ BAJO - Buena posición de liquidez\n`;
    }
    message += `   Ratio Corriente: ${currentRatio?.toFixed(2) || 'N/A'}\n\n`;
    
    // Solvency Risk
    const debtToEquity = this.getValue(ratios, 'debt_to_equity');
    const interestCoverage = this.getValue(ratios, 'interest_coverage');
    message += `**2. Riesgo de Solvencia:**\n`;
    if (debtToEquity > 2 || interestCoverage < 2) {
      message += `⚠️ ALTO - Alto apalancamiento o baja cobertura de intereses\n`;
    } else if (debtToEquity > 1 || interestCoverage < 4) {
      message += `🟡 MODERADO - Deuda manejable pero requiere monitoreo\n`;
    } else {
      message += `✅ BAJO - Estructura de capital conservadora\n`;
    }
    message += `   D/E: ${debtToEquity?.toFixed(2) || 'N/A'} | Cobertura: ${interestCoverage?.toFixed(1) || 'N/A'}x\n\n`;
    
    // Operational Risk
    const netMargin = this.getValue(ratios, 'net_margin');
    const operatingMargin = this.getValue(ratios, 'operating_margin');
    message += `**3. Riesgo Operativo:**\n`;
    if (netMargin < 0) {
      message += `🔴 CRÍTICO - Empresa perdiendo dinero\n`;
    } else if (netMargin < 5) {
      message += `🟡 MODERADO - Márgenes delgados, vulnerable a shocks\n`;
    } else {
      message += `✅ BAJO - Márgenes saludables\n`;
    }
    message += `   Margen Neto: ${netMargin?.toFixed(1) || 'N/A'}%\n\n`;
    
    // Valuation Risk
    const pe = this.getValue(ratios, 'pe_ratio');
    message += `**4. Riesgo de Valoración:**\n`;
    if (pe > 50) {
      message += `⚠️ ALTO - Valoración extrema, alta expectativa incorporada\n`;
    } else if (pe > 30) {
      message += `🟡 MODERADO - Prima significativa sobre el mercado\n`;
    } else if (pe > 0) {
      message += `✅ BAJO - Valoración razonable\n`;
    } else {
      message += `⚠️ N/A - P/E negativo (pérdidas)\n`;
    }
    
    return { message, confidence: 'high', sources: ['Análisis de solvencia', 'Indicadores de riesgo'] };
  }

  private answerValuationQuestion(): AIResponse {
    const { ticker, current_price, ratios } = this.analysisData!;
    const valuation = (this.analysisData as any).valuation_summary;
    
    let message = `💰 **Análisis de Valoración - ${ticker}**\n\n`;
    message += `**Precio Actual:** $${current_price?.toFixed(2) || 'N/A'}\n\n`;
    
    // Multiple Analysis
    message += `**📊 Múltiplos de Valoración:**\n\n`;
    
    const pe = this.getValue(ratios, 'pe_ratio');
    const pb = this.getValue(ratios, 'pb_ratio');
    const evEbitda = this.getValue(ratios, 'ev_ebitda');
    const ps = this.getValue(ratios, 'ps_ratio');
    
    // P/E Analysis
    if (pe > 0) {
      message += `**P/E Ratio: ${pe.toFixed(1)}x**\n`;
      if (pe < 15) message += `   ✅ Potencialmente infravalorado (mercado: ~20x)\n`;
      else if (pe < 25) message += `   🟡 Valoración justa\n`;
      else if (pe < 40) message += `   ⚠️ Prima sobre mercado - justifica si hay crecimiento\n`;
      else message += `   🔴 Muy caro - alto riesgo de corrección\n`;
      message += '\n';
    }
    
    // P/B Analysis
    if (pb > 0) {
      message += `**P/B Ratio: ${pb.toFixed(2)}x**\n`;
      if (pb < 1) message += `   ✅ Cotiza bajo valor en libros\n`;
      else if (pb < 3) message += `   🟡 Valoración razonable\n`;
      else message += `   ⚠️ Prima significativa sobre activos\n`;
      message += '\n';
    }
    
    // EV/EBITDA
    if (evEbitda > 0) {
      message += `**EV/EBITDA: ${evEbitda.toFixed(1)}x**\n`;
      if (evEbitda < 8) message += `   ✅ Atractivo para adquisición\n`;
      else if (evEbitda < 15) message += `   🟡 En rango típico\n`;
      else message += `   ⚠️ Valoración elevada\n`;
      message += '\n';
    }
    
    // DCF/Graham if available
    if (valuation?.dcf) {
      const margin = valuation.dcf.margin_of_safety;
      message += `**📈 Modelo DCF:**\n`;
      message += `   Valor Intrínseco Estimado: $${valuation.dcf.intrinsic_value?.toFixed(2) || 'N/A'}\n`;
      message += `   Margen de Seguridad: ${margin?.toFixed(1) || 0}%\n`;
      if (margin > 25) message += `   ✅ Oportunidad de compra con margen\n`;
      else if (margin > 0) message += `   🟡 Cerca del valor justo\n`;
      else message += `   ⚠️ Cotiza sobre valor intrínseco estimado\n`;
      message += '\n';
    }
    
    // Overall verdict
    message += `**🎯 Conclusión de Valoración:**\n`;
    let valuationScore = 50;
    if (pe > 0 && pe < 20) valuationScore += 15;
    if (pb > 0 && pb < 3) valuationScore += 10;
    if (evEbitda > 0 && evEbitda < 12) valuationScore += 10;
    
    if (valuationScore > 70) {
      message += `La acción parece INFRAVALORADA según múltiplos clave.`;
    } else if (valuationScore > 50) {
      message += `La acción está en VALORACIÓN JUSTA.`;
    } else {
      message += `La acción parece SOBREVALORADA actualmente.`;
    }
    
    return { message, confidence: 'medium', sources: ['Múltiplos comparables', 'Análisis DCF'] };
  }

  private answerDebtQuestion(): AIResponse {
    const { ticker, ratios } = this.analysisData!;
    
    let message = `⚖️ **Análisis de Deuda y Apalancamiento - ${ticker}**\n\n`;
    
    const debtToEquity = this.getValue(ratios, 'debt_to_equity');
    const debtToAssets = this.getValue(ratios, 'debt_to_assets');
    const interestCoverage = this.getValue(ratios, 'interest_coverage');
    const longTermDebtToCapital = this.getValue(ratios, 'long_term_debt_capital');
    
    // Overall Assessment
    let debtRating = 'MODERADO';
    if (debtToEquity < 0.5 && interestCoverage > 8) debtRating = 'CONSERVADOR';
    else if (debtToEquity > 1.5 || interestCoverage < 3) debtRating = 'AGRESIVO';
    else if (debtToEquity > 2.5 || interestCoverage < 1.5) debtRating = 'PELIGROSO';
    
    message += `**Perfil de Apalancamiento: ${debtRating}**\n\n`;
    
    // Detailed Metrics
    message += `**📋 Métricas de Deuda:**\n\n`;
    
    message += `**Deuda/Patrimonio:** ${debtToEquity?.toFixed(2) || 'N/A'}\n`;
    if (debtToEquity < 0.3) message += `   ✅ Muy conservador - capacidad de endeudamiento disponible\n`;
    else if (debtToEquity < 0.7) message += `   ✅ Conservador - buena estructura de capital\n`;
    else if (debtToEquity < 1.5) message += `   🟡 Moderado - nivel típico para la industria\n`;
    else message += `   ⚠️ Alto - riesgo financiero elevado\n`;
    message += '\n';
    
    message += `**Cobertura de Intereses:** ${interestCoverage?.toFixed(1) || 'N/A'}x\n`;
    if (interestCoverage > 10) message += `   ✅ Excelente - puede pagar intereses fácilmente\n`;
    else if (interestCoverage > 5) message += `   ✅ Bueno - cobertura cómoda\n`;
    else if (interestCoverage > 3) message += `   🟡 Adecuado - monitorear\n`;
    else if (interestCoverage > 1.5) message += `   ⚠️ Ajustado - vulnerable a subidas de tasas\n`;
    else message += `   🔴 Crítico - riesgo de incumplimiento\n`;
    message += '\n';
    
    // Implications
    message += `**💡 Implicaciones para el Inversor:**\n`;
    if (debtRating === 'CONSERVADOR') {
      message += `• Empresa con bajo riesgo financiero\n`;
      message += `• Capacidad para aprovechar oportunidades de crecimiento\n`;
      message += `• Resistente a subidas de tasas de interés\n`;
    } else if (debtRating === 'MODERADO') {
      message += `• Estructura de capital típica\n`;
      message += `• Monitorear en períodos de altas tasas\n`;
      message += `• Evaluar si la deuda financia crecimiento productivo\n`;
    } else {
      message += `• ⚠️ Alto riesgo en escenarios de estrés\n`;
      message += `• Vulnerable a refinanciamiento costoso\n`;
      message += `• Considerar si el negocio justifica el apalancamiento\n`;
    }
    
    return { message, confidence: 'high', sources: ['Ratios de apalancamiento', 'Estructura de capital'] };
  }

  private answerProfitabilityQuestion(): AIResponse {
    const { ticker, ratios } = this.analysisData!;
    
    let message = `📈 **Análisis de Rentabilidad - ${ticker}**\n\n`;
    
    // Key metrics
    const roic = this.getValue(ratios, 'roic');
    const roe = this.getValue(ratios, 'roe');
    const roa = this.getValue(ratios, 'roa');
    const grossMargin = this.getValue(ratios, 'gross_margin');
    const operatingMargin = this.getValue(ratios, 'operating_margin');
    const netMargin = this.getValue(ratios, 'net_margin');
    
    // ROIC Analysis (most important)
    message += `**🎯 ROIC (Retorno sobre Capital Invertido): ${roic?.toFixed(1) || 'N/A'}%**\n`;
    if (roic > 20) {
      message += `   ✅ EXCELENTE - Ventaja competitiva evidente\n`;
      message += `   La empresa genera retornos muy superiores al costo de capital (~10%)\n`;
    } else if (roic > 15) {
      message += `   ✅ BUENO - Creando valor para accionistas\n`;
    } else if (roic > 10) {
      message += `   🟡 ACEPTABLE - Marginalmente sobre costo de capital\n`;
    } else {
      message += `   ⚠️ BAJO - Posible destrucción de valor\n`;
    }
    message += '\n';
    
    // ROE
    message += `**ROE: ${roe?.toFixed(1) || 'N/A'}%**\n`;
    if (roe > 20) message += `   ✅ Excelente eficiencia del patrimonio\n`;
    else if (roe > 12) message += `   ✅ Bueno\n`;
    else message += `   🟡 Por debajo del promedio\n`;
    message += '\n';
    
    // Margin Analysis
    message += `**📊 Cascada de Márgenes:**\n`;
    message += `• Margen Bruto: ${grossMargin?.toFixed(1) || 'N/A'}% ${grossMargin > 40 ? '✅' : grossMargin > 25 ? '🟡' : '⚠️'}\n`;
    message += `• Margen Operativo: ${operatingMargin?.toFixed(1) || 'N/A'}% ${operatingMargin > 15 ? '✅' : operatingMargin > 8 ? '🟡' : '⚠️'}\n`;
    message += `• Margen Neto: ${netMargin?.toFixed(1) || 'N/A'}% ${netMargin > 10 ? '✅' : netMargin > 5 ? '🟡' : '⚠️'}\n\n`;
    
    // Efficiency interpretation
    const efficiency = ((grossMargin - operatingMargin) / grossMargin) * 100;
    message += `**💡 Interpretación:**\n`;
    if (efficiency < 50 && grossMargin > 30) {
      message += `• Excelente control de gastos operativos\n`;
    }
    if (netMargin > 15) {
      message += `• Márgenes superiores sugieren poder de fijación de precios o eficiencia\n`;
    }
    if (roic > roe) {
      message += `• El apalancamiento no está inflando artificialmente el ROE\n`;
    }
    
    return { message, confidence: 'high', sources: ['Análisis de rentabilidad', 'Márgenes operativos'] };
  }

  private answerDividendQuestion(): AIResponse {
    const { ticker, ratios } = this.analysisData!;
    
    let message = `💵 **Análisis de Dividendos - ${ticker}**\n\n`;
    
    const dividendYield = this.getValue(ratios, 'dividend_yield');
    const payoutRatio = this.getValue(ratios, 'payout_ratio');
    const fcfYield = this.getValue(ratios, 'fcf_yield');
    
    if (dividendYield <= 0) {
      message += `ℹ️ **Esta empresa actualmente NO paga dividendos.**\n\n`;
      message += `**Posibles razones:**\n`;
      message += `• Reinvirtiendo utilidades para crecimiento\n`;
      message += `• Empresa en fase de expansión\n`;
      message += `• Priorizando reducción de deuda o recompra de acciones\n\n`;
      message += `**Para inversores de ingreso:** Considerar alternativas que paguen dividendos.`;
    } else {
      message += `**Rendimiento por Dividendo:** ${dividendYield?.toFixed(2)}%\n`;
      if (dividendYield > 6) message += `   ⚠️ Alto - verificar sostenibilidad\n`;
      else if (dividendYield > 3) message += `   ✅ Atractivo\n`;
      else message += `   🟡 Modesto\n`;
      message += '\n';
      
      if (payoutRatio > 0) {
        message += `**Payout Ratio:** ${payoutRatio?.toFixed(1)}%\n`;
        if (payoutRatio < 40) message += `   ✅ Conservador - espacio para crecer\n`;
        else if (payoutRatio < 60) message += `   ✅ Saludable\n`;
        else if (payoutRatio < 80) message += `   🟡 Alto - monitorear\n`;
        else message += `   ⚠️ Muy alto - podría no ser sostenible\n`;
        message += '\n';
      }
      
      message += `**📊 Evaluación de Sostenibilidad:**\n`;
      const sustainable = fcfYield > dividendYield && payoutRatio < 70;
      if (sustainable) {
        message += `✅ El dividendo parece SOSTENIBLE\n`;
        message += `• FCF cubre ampliamente el dividendo\n`;
        message += `• Payout ratio en rango saludable\n`;
      } else {
        message += `⚠️ PRECAUCIÓN con la sostenibilidad\n`;
        if (fcfYield < dividendYield) message += `• FCF no cubre completamente el dividendo\n`;
        if (payoutRatio > 70) message += `• Payout ratio elevado\n`;
      }
    }
    
    return { message, confidence: 'medium', sources: ['Política de dividendos', 'Análisis de sostenibilidad'] };
  }

  private answerGrowthQuestion(): AIResponse {
    const { ticker, ratios } = this.analysisData!;
    
    let message = `📈 **Análisis de Crecimiento - ${ticker}**\n\n`;
    
    const revenueGrowth = this.getValue(ratios, 'revenue_growth');
    const earningsGrowth = this.getValue(ratios, 'earnings_growth');
    const pegRatio = this.getValue(ratios, 'peg_ratio');
    
    // Revenue Growth
    message += `**Crecimiento de Ingresos:** ${revenueGrowth?.toFixed(1) || 'N/A'}%\n`;
    if (revenueGrowth > 25) message += `   🚀 Hipercrecimiento\n`;
    else if (revenueGrowth > 15) message += `   ✅ Crecimiento acelerado\n`;
    else if (revenueGrowth > 8) message += `   ✅ Crecimiento sólido\n`;
    else if (revenueGrowth > 0) message += `   🟡 Crecimiento lento\n`;
    else message += `   ⚠️ Contracción de ingresos\n`;
    message += '\n';
    
    // Earnings Growth
    message += `**Crecimiento de Ganancias:** ${earningsGrowth?.toFixed(1) || 'N/A'}%\n`;
    if (earningsGrowth > revenueGrowth && earningsGrowth > 0) {
      message += `   ✅ Creciendo más que ingresos (mejora de eficiencia)\n`;
    } else if (earningsGrowth > 0) {
      message += `   🟡 Crecimiento positivo pero verificar márgenes\n`;
    } else {
      message += `   ⚠️ Ganancias en declive\n`;
    }
    message += '\n';
    
    // PEG Ratio
    if (pegRatio > 0) {
      message += `**PEG Ratio:** ${pegRatio?.toFixed(2)}\n`;
      if (pegRatio < 1) message += `   ✅ Crecimiento subvalorado (PEG < 1)\n`;
      else if (pegRatio < 1.5) message += `   ✅ Valoración justa vs crecimiento\n`;
      else if (pegRatio < 2) message += `   🟡 Pagando prima por crecimiento\n`;
      else message += `   ⚠️ Prima excesiva vs crecimiento esperado\n`;
      message += '\n';
    }
    
    // Growth Quality Assessment
    message += `**📊 Calidad del Crecimiento:**\n`;
    if (revenueGrowth > 10 && earningsGrowth > revenueGrowth) {
      message += `• ✅ Crecimiento rentable - expandiendo márgenes\n`;
    }
    if (revenueGrowth > 15 && pegRatio < 1.5) {
      message += `• ✅ Crecimiento a precio razonable (GARP)\n`;
    }
    if (revenueGrowth < 5 && earningsGrowth < 5) {
      message += `• ⚠️ Empresa madura - evaluar como value/dividendo\n`;
    }
    
    message += `\n*Nota: El crecimiento pasado no garantiza resultados futuros.*`;
    
    return { message, confidence: 'medium', sources: ['Datos históricos de crecimiento', 'Análisis de tendencias'] };
  }

  private answerCashFlowQuestion(): AIResponse {
    const { ticker, ratios } = this.analysisData!;
    
    let message = `💵 **Análisis de Flujo de Caja - ${ticker}**\n\n`;
    
    const fcfYield = this.getValue(ratios, 'fcf_yield');
    const fcfMargin = this.getValue(ratios, 'fcf_margin');
    const operatingCashFlow = this.getValue(ratios, 'operating_cash_flow_ratio');
    
    message += `**FCF Yield (Rendimiento de Flujo Libre):** ${fcfYield?.toFixed(2) || 'N/A'}%\n`;
    if (fcfYield > 8) message += `   ✅ Excelente - Fuerte generación de efectivo\n`;
    else if (fcfYield > 5) message += `   ✅ Bueno\n`;
    else if (fcfYield > 2) message += `   🟡 Moderado\n`;
    else if (fcfYield > 0) message += `   ⚠️ Bajo\n`;
    else message += `   🔴 Negativo - Consume efectivo\n`;
    message += '\n';
    
    message += `**Margen FCF:** ${fcfMargin?.toFixed(1) || 'N/A'}%\n`;
    if (fcfMargin > 15) message += `   ✅ Excelente conversión de ingresos a efectivo\n`;
    else if (fcfMargin > 10) message += `   ✅ Bueno\n`;
    else if (fcfMargin > 0) message += `   🟡 Monitorear\n`;
    else message += `   ⚠️ Efectivo negativo\n`;
    message += '\n';
    
    // Cash quality interpretation
    message += `**📊 Calidad del Efectivo:**\n`;
    if (fcfYield > 5 && fcfMargin > 10) {
      message += `✅ Negocio generador de caja - característica de empresas de alta calidad\n`;
      message += `• Puede financiar crecimiento internamente\n`;
      message += `• Capacidad para dividendos y recompras\n`;
      message += `• Menor dependencia de mercados de deuda\n`;
    } else if (fcfYield > 0) {
      message += `🟡 Generación de efectivo positiva pero modesta\n`;
      message += `• Evaluar usos del efectivo generado\n`;
      message += `• Verificar necesidades de capex\n`;
    } else {
      message += `⚠️ La empresa consume más efectivo del que genera\n`;
      message += `• Normal para empresas en hipercrecimiento\n`;
      message += `• Preocupante para empresas maduras\n`;
      message += `• Verificar fuentes de financiamiento\n`;
    }
    
    return { message, confidence: 'high', sources: ['Estado de flujo de efectivo', 'Análisis FCF'] };
  }

  private answerQualityQuestion(): AIResponse {
    const { ticker, ratios } = this.analysisData!;
    
    let message = `🔍 **Análisis de Calidad Contable - ${ticker}**\n\n`;
    
    const altmanZ = this.getValue(ratios, 'altman_z');
    const piotroskiF = this.getValue(ratios, 'piotroski_f');
    
    // Altman Z-Score
    if (altmanZ) {
      message += `**Altman Z-Score:** ${altmanZ?.toFixed(2)}\n`;
      if (altmanZ > 3) message += `   ✅ Zona Segura - Bajo riesgo de bancarrota\n`;
      else if (altmanZ > 1.8) message += `   🟡 Zona Gris - Monitorear\n`;
      else message += `   🔴 Zona de Peligro - Alto riesgo de estrés financiero\n`;
      message += '\n';
    }
    
    // Piotroski F-Score
    if (piotroskiF) {
      message += `**Piotroski F-Score:** ${piotroskiF}/9\n`;
      if (piotroskiF >= 7) message += `   ✅ Fuerte - Fundamentos sólidos\n`;
      else if (piotroskiF >= 5) message += `   🟡 Moderado\n`;
      else message += `   ⚠️ Débil - Múltiples señales negativas\n`;
      message += '\n';
    }
    
    // Quality Summary
    message += `**📋 Evaluación de Calidad:**\n`;
    const qualityScore = (altmanZ > 2.5 ? 1 : 0) + (piotroskiF >= 6 ? 1 : 0);
    
    if (qualityScore === 2) {
      message += `✅ Alta calidad contable y financiera\n`;
      message += `• Estados financieros confiables\n`;
      message += `• Bajo riesgo de sorpresas negativas\n`;
    } else if (qualityScore === 1) {
      message += `🟡 Calidad mixta\n`;
      message += `• Algunos indicadores positivos, otros requieren atención\n`;
    } else {
      message += `⚠️ Banderas rojas de calidad\n`;
      message += `• Mayor escrutinio recomendado\n`;
      message += `• Considerar riesgo de manipulación contable\n`;
    }
    
    return { message, confidence: 'high', sources: ['Altman Z-Score', 'Piotroski F-Score', 'Análisis contable'] };
  }

  private answerStrengthsQuestion(): AIResponse {
    const { ticker, ratios } = this.analysisData!;
    const strengths = this.identifyStrengths(ratios);
    
    let message = `✅ **Fortalezas de ${ticker}**\n\n`;
    
    if (strengths.length === 0) {
      message += `No se identificaron fortalezas destacadas.\n`;
      message += `La empresa tiene métricas en rangos promedio o por debajo.`;
    } else {
      message += `Se identificaron **${strengths.length} fortalezas clave:**\n\n`;
      strengths.forEach((s, i) => {
        message += `${i + 1}. ${s}\n`;
      });
    }
    
    return { message, confidence: 'high', sources: ['Análisis de fortalezas'] };
  }

  private answerWeaknessesQuestion(): AIResponse {
    const { ticker, ratios } = this.analysisData!;
    const risks = this.identifyRisks(ratios);
    
    let message = `⚠️ **Debilidades y Riesgos de ${ticker}**\n\n`;
    
    if (risks.length === 0) {
      message += `✅ No se identificaron debilidades significativas.\n`;
      message += `Los indicadores clave están en rangos saludables.`;
    } else {
      message += `Se identificaron **${risks.length} áreas de preocupación:**\n\n`;
      risks.forEach((r, i) => {
        message += `${i + 1}. ${r}\n`;
      });
      message += `\n**Recomendación:** Monitorear estas métricas en futuros reportes.`;
    }
    
    return { message, confidence: 'high', sources: ['Análisis de riesgos'] };
  }

  private answerComparisonQuestion(): AIResponse {
    const { ticker, company_name, favorable_percentage } = this.analysisData!;
    const { score, breakdown } = this.calculateCompanyScore();
    
    let message = `🏢 **Perfil Comparativo - ${ticker}**\n\n`;
    message += `*${company_name}*\n\n`;
    
    message += `**Puntuación vs. Promedio del Mercado:**\n`;
    message += `• Puntuación Global: ${score}/100 (Promedio ~50)\n`;
    message += `• Métricas Favorables: ${favorable_percentage.toFixed(1)}%\n\n`;
    
    message += `**Por Categoría (vs. típico 50/100):**\n`;
    Object.entries(breakdown).forEach(([key, value]) => {
      const icon = value > 60 ? '✅' : value > 40 ? '🟡' : '⚠️';
      const label = key === 'profitability' ? 'Rentabilidad' :
                    key === 'financialHealth' ? 'Salud Financiera' :
                    key === 'valuation' ? 'Valoración' :
                    key === 'cashFlow' ? 'Flujo de Caja' : 'Crecimiento';
      message += `${icon} ${label}: ${value}/100\n`;
    });
    
    message += `\n*Para comparación detallada con competidores específicos,\nanaliza múltiples empresas del sector.*`;
    
    return { message, confidence: 'medium', sources: ['Análisis comparativo'] };
  }

  private answerGenericQuestion(question: string): AIResponse {
    const { ticker } = this.analysisData!;
    const { score } = this.calculateCompanyScore();
    
    let message = `🤖 **Asistente de Análisis - ${ticker}**\n\n`;
    message += `Puntuación actual: ${score}/100\n\n`;
    message += `**Puedo ayudarte con:**\n\n`;
    message += `📊 **Análisis General:**\n`;
    message += `• "Dame un resumen completo"\n`;
    message += `• "¿Cuáles son las fortalezas?"\n`;
    message += `• "¿Cuáles son los riesgos?"\n\n`;
    message += `💰 **Inversión:**\n`;
    message += `• "¿Debería comprar?"\n`;
    message += `• "¿Está cara o barata?"\n`;
    message += `• "¿Paga dividendos?"\n\n`;
    message += `📈 **Métricas:**\n`;
    message += `• "¿Cómo está su rentabilidad?"\n`;
    message += `• "¿Cómo está su deuda?"\n`;
    message += `• "¿Genera flujo de caja?"\n`;
    message += `• "¿Cuál es su crecimiento?"\n`;
    
    return { message, confidence: 'low', sources: ['Base de conocimiento'] };
  }

  getConversationHistory() {
    return this.conversationHistory;
  }
}

export const localAI = new EnhancedLocalAI();
export default localAI;
