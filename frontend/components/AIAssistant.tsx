import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface AIAssistantProps {
  analysisData: any;
  onClose: () => void;
  colors: any;
}

export default function AIAssistant({ analysisData, onClose, colors }: AIAssistantProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [sessionId, setSessionId] = useState<string>('');
  const [suggestedQuestions, setSuggestedQuestions] = useState<string[]>([]);
  const [isInitializing, setIsInitializing] = useState(true);
  const scrollViewRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (analysisData) {
      initializeAISession();
    }
    
    // Cleanup session on unmount
    return () => {
      if (sessionId) {
        axios.delete(`${BACKEND_URL}/api/ai-assistant/session/${sessionId}`).catch(() => {});
      }
    };
  }, [analysisData]);

  const initializeAISession = async () => {
    try {
      setIsInitializing(true);
      const newSessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      // Safely prepare stock data for the AI with all analysis details
      let ratiosData = {};
      try {
        if (analysisData.ratios && Array.isArray(analysisData.ratios)) {
          ratiosData = analysisData.ratios.reduce((acc: any, category: any) => {
            if (category && category.metrics && Array.isArray(category.metrics)) {
              category.metrics.forEach((m: any) => {
                if (m && m.name) {
                  acc[m.name] = {
                    value: m.value,
                    display_value: m.display_value || String(m.value),
                    is_favorable: m.passed || false,
                    threshold: m.threshold || '',
                    interpretation: m.interpretation || '',
                  };
                }
              });
            }
            return acc;
          }, {});
        }
      } catch (e) {
        console.log('Error parsing ratios:', e);
        ratiosData = {};
      }

      const stockData = {
        ticker: analysisData.ticker || 'N/A',
        company_name: analysisData.company_name || analysisData.ticker || 'N/A',
        current_price: analysisData.metadata?.current_price || analysisData.current_price || 0,
        recommendation: analysisData.recommendation || 'N/A',
        risk_level: analysisData.risk_level || 'N/A',
        favorable_percentage: analysisData.favorable_percentage || 50,
        total_metrics: analysisData.total_metrics || 0,
        favorable_metrics: analysisData.favorable_metrics || 0,
        unfavorable_metrics: analysisData.unfavorable_metrics || 0,
        ratios: ratiosData,
        // Include summary flags if available
        summary_flags: analysisData.summary_flags || {},
        // Include metadata
        metadata: {
          current_price: analysisData.metadata?.current_price || 0,
          market_cap: analysisData.metadata?.market_cap || 0,
          pe_ratio: analysisData.metadata?.pe_ratio || 0,
          dividend_yield: analysisData.metadata?.dividend_yield || 0,
          fifty_two_week_high: analysisData.metadata?.fifty_two_week_high || 0,
          fifty_two_week_low: analysisData.metadata?.fifty_two_week_low || 0,
          sector: analysisData.metadata?.sector || 'N/A',
          industry: analysisData.metadata?.industry || 'N/A',
        }
      };

      console.log('Initializing AI with stock data:', JSON.stringify(stockData, null, 2));

      const response = await axios.post(`${BACKEND_URL}/api/ai-assistant/init`, {
        session_id: newSessionId,
        ticker: analysisData.ticker || 'UNKNOWN',
        stock_data: stockData,
      });

      setSessionId(response.data.session_id);
      setSuggestedQuestions(response.data.suggested_questions || []);
      
      // Add initial message from AI
      setMessages([{
        id: '1',
        role: 'assistant',
        content: response.data.initial_analysis,
        timestamp: new Date(),
      }]);
      
    } catch (error) {
      console.error('Error initializing AI session:', error);
      // Fallback message if API fails
      setMessages([{
        id: '1',
        role: 'assistant',
        content: `¡Hola! 👋 Soy tu asistente financiero. Estoy listo para ayudarte a analizar ${analysisData?.ticker || 'esta acción'}. \n\n⚠️ Hubo un problema al conectar con el servidor AI. Por favor, intenta de nuevo más tarde o haz tus preguntas y haré mi mejor esfuerzo para ayudarte.`,
        timestamp: new Date(),
      }]);
      setSuggestedQuestions([
        '¿Cuáles son los principales riesgos?',
        '¿Cómo se compara con competidores?',
        '¿Es buen momento para comprar?',
      ]);
    } finally {
      setIsInitializing(false);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || isTyping) return;
    
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };
    
    setMessages(prev => [...prev, userMessage]);
    const userInput = input.trim();
    setInput('');
    setIsTyping(true);
    
    try {
      const response = await axios.post(`${BACKEND_URL}/api/ai-assistant/chat`, {
        session_id: sessionId,
        message: userInput,
      });
      
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response.data.response,
        timestamp: new Date(),
      };
      
      setMessages(prev => [...prev, assistantMessage]);
      
      // Update suggested questions based on context
      if (response.data.suggested_questions?.length > 0) {
        setSuggestedQuestions(response.data.suggested_questions);
      }
      
    } catch (error) {
      console.error('Error sending message:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: '⚠️ Lo siento, hubo un error al procesar tu mensaje. Por favor, intenta de nuevo.',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleQuickQuestion = (question: string) => {
    setInput(question);
    // Wait a brief moment for the input to be set, then send
    setTimeout(() => {
      const userMessage: Message = {
        id: Date.now().toString(),
        role: 'user',
        content: question,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, userMessage]);
      setInput('');
      setIsTyping(true);
      
      // Send to API
      axios.post(`${BACKEND_URL}/api/ai-assistant/chat`, {
        session_id: sessionId,
        message: question,
      }).then(response => {
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: response.data.response,
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, assistantMessage]);
        if (response.data.suggested_questions?.length > 0) {
          setSuggestedQuestions(response.data.suggested_questions);
        }
      }).catch(error => {
        console.error('Error with quick question:', error);
        const errorMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: '⚠️ Lo siento, hubo un error. Por favor, intenta de nuevo.',
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, errorMessage]);
      }).finally(() => {
        setIsTyping(false);
      });
    }, 100);
  };

  const renderMessage = (message: Message) => {
    const isUser = message.role === 'user';
    
    return (
      <View
        key={message.id}
        style={[
          styles.messageContainer,
          isUser ? styles.userMessageContainer : styles.assistantMessageContainer,
        ]}
      >
        {!isUser && (
          <View style={[styles.avatarContainer, { backgroundColor: '#AF52DE20' }]}>
            <Ionicons name="sparkles" size={16} color="#AF52DE" />
          </View>
        )}
        <View
          style={[
            styles.messageBubble,
            isUser 
              ? [styles.userBubble, { backgroundColor: colors.primary }]
              : [styles.assistantBubble, { backgroundColor: colors.card }],
          ]}
        >
          <Text
            style={[
              styles.messageText,
              { color: isUser ? '#FFFFFF' : colors.text },
            ]}
          >
            {message.content}
          </Text>
        </View>
      </View>
    );
  };

  if (isInitializing) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.loadingContainer}>
          <View style={[styles.loadingIcon, { backgroundColor: '#AF52DE20' }]}>
            <Ionicons name="sparkles" size={32} color="#AF52DE" />
          </View>
          <Text style={[styles.loadingTitle, { color: colors.text }]}>Iniciando FinBot...</Text>
          <Text style={[styles.loadingSubtitle, { color: colors.textSecondary }]}>
            Preparando análisis de {analysisData?.ticker || 'la acción'}
          </Text>
          <ActivityIndicator size="large" color="#AF52DE" style={{ marginTop: 20 }} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        {/* Header with large close button */}
        <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <TouchableOpacity 
            onPress={onClose} 
            style={[styles.closeButtonLarge, { backgroundColor: colors.danger + '15' }]}
            activeOpacity={0.7}
          >
            <Ionicons name="close" size={24} color={colors.danger} />
            <Text style={[styles.closeButtonText, { color: colors.danger }]}>Cerrar</Text>
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <View style={[styles.aiIcon, { backgroundColor: '#AF52DE20' }]}>
              <Ionicons name="sparkles" size={20} color="#AF52DE" />
            </View>
            <View>
              <Text style={[styles.headerTitle, { color: colors.text }]}>FinBot AI</Text>
              <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
                Analizando {analysisData?.ticker || 'acción'}
              </Text>
            </View>
          </View>
          <View style={[styles.aiStatusBadge, { backgroundColor: '#34C75920' }]}>
            <View style={styles.aiStatusDot} />
            <Text style={styles.aiStatusText}>GPT-4o</Text>
          </View>
        </View>

        {/* Messages */}
        <ScrollView
          ref={scrollViewRef}
          style={styles.messagesContainer}
          contentContainerStyle={styles.messagesContent}
          onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
        >
          {messages.map(renderMessage)}
          
          {isTyping && (
            <View style={[styles.messageContainer, styles.assistantMessageContainer]}>
              <View style={[styles.avatarContainer, { backgroundColor: '#AF52DE20' }]}>
                <Ionicons name="sparkles" size={16} color="#AF52DE" />
              </View>
              <View style={[styles.messageBubble, styles.assistantBubble, { backgroundColor: colors.card }]}>
                <View style={styles.typingIndicator}>
                  <ActivityIndicator size="small" color="#AF52DE" />
                  <Text style={[styles.typingText, { color: colors.textSecondary }]}>
                    FinBot está pensando...
                  </Text>
                </View>
              </View>
            </View>
          )}
        </ScrollView>

        {/* Suggested Questions */}
        {suggestedQuestions.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={[styles.quickQuestionsContainer, { backgroundColor: colors.card }]}
            contentContainerStyle={styles.quickQuestionsContent}
          >
            {suggestedQuestions.map((question, index) => (
              <TouchableOpacity
                key={index}
                style={[styles.quickQuestionButton, { borderColor: '#AF52DE40', backgroundColor: '#AF52DE10' }]}
                onPress={() => handleQuickQuestion(question)}
                disabled={isTyping}
              >
                <Ionicons name="chatbubble-outline" size={14} color="#AF52DE" style={{ marginRight: 4 }} />
                <Text style={[styles.quickQuestionText, { color: '#AF52DE' }]}>{question}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Input */}
        <View style={[styles.inputContainer, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
          <TextInput
            style={[styles.input, { backgroundColor: colors.inputBackground, color: colors.text }]}
            placeholder="Pregunta lo que quieras sobre esta acción..."
            placeholderTextColor={colors.textSecondary}
            value={input}
            onChangeText={setInput}
            multiline
            maxLength={500}
            editable={!isTyping}
          />
          <TouchableOpacity
            style={[
              styles.sendButton, 
              { backgroundColor: input.trim() && !isTyping ? '#AF52DE' : colors.border }
            ]}
            onPress={sendMessage}
            disabled={!input.trim() || isTyping}
          >
            <Ionicons name="send" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  loadingTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  loadingSubtitle: {
    fontSize: 14,
    textAlign: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    paddingTop: 20,
    borderBottomWidth: 1,
  },
  closeButtonLarge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 4,
    minHeight: 44,
  },
  closeButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  headerCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    justifyContent: 'center',
  },
  aiIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  headerSubtitle: {
    fontSize: 12,
  },
  aiStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  aiStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#34C759',
  },
  aiStatusText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#34C759',
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    padding: 16,
    paddingBottom: 20,
  },
  messageContainer: {
    flexDirection: 'row',
    marginBottom: 16,
    maxWidth: '90%',
  },
  userMessageContainer: {
    alignSelf: 'flex-end',
  },
  assistantMessageContainer: {
    alignSelf: 'flex-start',
  },
  avatarContainer: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    marginTop: 4,
  },
  messageBubble: {
    padding: 12,
    borderRadius: 16,
    maxWidth: '85%',
  },
  userBubble: {
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 14,
    lineHeight: 20,
  },
  typingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  typingText: {
    fontSize: 13,
    fontStyle: 'italic',
  },
  quickQuestionsContainer: {
    maxHeight: 54,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  quickQuestionsContent: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  quickQuestionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    marginRight: 8,
  },
  quickQuestionText: {
    fontSize: 12,
    fontWeight: '500',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    borderTopWidth: 1,
    gap: 10,
  },
  input: {
    flex: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    maxHeight: 100,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
