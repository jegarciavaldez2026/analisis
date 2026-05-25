import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../contexts/ThemeContext";
import { useChat } from "../contexts/ChatContext";
import axios from "axios";

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

export default function AIChatWidget() {
  const { colors } = useTheme();
  const { isChatOpen, closeChat } = useChat();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (isChatOpen && !sessionId) {
      initSession();
    }
  }, [isChatOpen]);

  useEffect(() => {
    if (scrollViewRef.current) {
      scrollViewRef.current.scrollToEnd({ animated: true });
    }
  }, [messages]);

  const initSession = async () => {
    try {
      const newSessionId = "chat_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
      setSessionId(newSessionId);
      setMessages([
        {
          id: "welcome",
          role: "assistant",
          content: "\u00a1Hola! Soy FinBot, tu asistente de an\u00e1lisis financiero. \u00bfEn qu\u00e9 puedo ayudarte?",
          timestamp: new Date(),
        },
      ]);
    } catch (error) {
      console.error("Error init session:", error);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || !sessionId || loading) return;

    const userMessage: Message = {
      id: "user_" + Date.now(),
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      const { data } = await axios.post(BACKEND_URL + "/api/ai-assistant/chat", {
        session_id: sessionId,
        message: userMessage.content,
      });

      const assistantMessage: Message = {
        id: "assistant_" + Date.now(),
        role: "assistant",
        content: data.response,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error: any) {
      const errorMessage: Message = {
        id: "error_" + Date.now(),
        role: "assistant",
        content: "Lo siento, hubo un error al procesar tu mensaje. Intenta de nuevo.",
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
      console.error("Chat error:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    closeChat();
  };

  const handleReset = async () => {
    if (sessionId) {
      try {
        await axios.delete(BACKEND_URL + "/api/ai-assistant/session/" + sessionId);
      } catch (error) {
        console.error("Error ending session:", error);
      }
    }
    setSessionId(null);
    setMessages([]);
    setInput("");
    setTimeout(() => initSession(), 100);
  };

  return (
    <Modal
      visible={isChatOpen}
      animationType="slide"
      transparent
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        style={[styles.container, { backgroundColor: colors.background + "CC" }]}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={[styles.chatWindow, { backgroundColor: colors.background }]}>
          <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
            <View style={styles.headerLeft}>
              <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
                <Ionicons name="sparkles" size={20} color="#FFFFFF" />
              </View>
              <View>
                <Text style={[styles.headerTitle, { color: colors.text }]}>FinBot AI</Text>
                <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>Asistente financiero</Text>
              </View>
            </View>
            <View style={styles.headerActions}>
              <TouchableOpacity onPress={handleReset} style={styles.headerBtn}>
                <Ionicons name="refresh" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={handleClose} style={styles.headerBtn}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView
            ref={scrollViewRef}
            style={styles.messagesContainer}
            contentContainerStyle={styles.messagesContent}
            keyboardShouldPersistTaps="handled"
          >
            {messages.map((msg) => (
              <View
                key={msg.id}
                style={[
                  styles.messageRow,
                  msg.role === "user" ? styles.userMessageRow : styles.assistantMessageRow,
                ]}
              >
                {msg.role === "assistant" && (
                  <View style={[styles.msgAvatar, { backgroundColor: colors.primary }]}>
                    <Ionicons name="sparkles" size={12} color="#FFFFFF" />
                  </View>
                )}
                <View
                  style={[
                    styles.messageBubble,
                    msg.role === "user"
                      ? [styles.userBubble, { backgroundColor: colors.primary }]
                      : [styles.assistantBubble, { backgroundColor: colors.card }],
                  ]}
                >
                  <Text
                    style={[
                      styles.messageText,
                      msg.role === "user"
                        ? { color: "#FFFFFF" }
                        : { color: colors.text },
                    ]}
                  >
                    {msg.content}
                  </Text>
                </View>
              </View>
            ))}
            {loading && (
              <View style={[styles.messageRow, styles.assistantMessageRow]}>
                <View style={[styles.msgAvatar, { backgroundColor: colors.primary }]}>
                  <Ionicons name="sparkles" size={12} color="#FFFFFF" />
                </View>
                <View style={[styles.messageBubble, styles.assistantBubble, { backgroundColor: colors.card }]}>
                  <ActivityIndicator size="small" color={colors.primary} />
                </View>
              </View>
            )}
          </ScrollView>

          <View style={[styles.inputContainer, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
            <TextInput
              style={[styles.input, { color: colors.text, backgroundColor: colors.inputBackground }]}
              placeholder="Escribe tu pregunta..."
              placeholderTextColor={colors.textSecondary}
              value={input}
              onChangeText={setInput}
              onSubmitEditing={sendMessage}
              multiline
              maxLength={500}
            />
            <TouchableOpacity
              style={[
                styles.sendButton,
                { backgroundColor: input.trim() ? colors.primary : colors.border },
              ]}
              onPress={sendMessage}
              disabled={!input.trim() || loading}
            >
              <Ionicons
                name="send"
                size={18}
                color={input.trim() ? "#FFFFFF" : colors.textSecondary}
              />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "flex-end",
  },
  chatWindow: {
    flex: 1,
    maxHeight: "90%",
    borderRadius: 16,
    overflow: "hidden",
    margin: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  headerSubtitle: {
    fontSize: 12,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  headerBtn: {
    padding: 8,
    borderRadius: 8,
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    padding: 16,
    gap: 12,
  },
  messageRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },
  userMessageRow: {
    justifyContent: "flex-end",
  },
  assistantMessageRow: {
    justifyContent: "flex-start",
  },
  msgAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  messageBubble: {
    maxWidth: "80%",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
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
  inputContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    gap: 8,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontSize: 14,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
});
