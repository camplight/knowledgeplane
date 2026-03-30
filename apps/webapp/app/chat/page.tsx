"use client";

import { trpc } from "../../utils/trpc";
import { useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { AppLayout } from "../components/AppLayout";

interface Message {
  role: "user" | "assistant";
  content: string;
  factsUsed?: number;
  facts?: Array<{ id: string; content: string }>;
}

export default function ChatPage() {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { data: userData, isLoading: userLoading } = trpc.auth.me.useQuery();

  const sendMessageMutation = trpc.chat.sendMessage.useMutation({
    onSuccess: (data) => {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.response,
          factsUsed: data.factsUsed,
          facts: data.facts,
        },
      ]);
      setIsLoading(false);
      // Auto-scroll to bottom
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    },
    onError: (error) => {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Error: ${error.message}`,
        },
      ]);
      setIsLoading(false);
    },
  });

  useEffect(() => {
    if (!userLoading && !userData?.user) {
      router.push("/");
    }
  }, [userLoading, userData, router]);

  useEffect(() => {
    // Auto-scroll to bottom when messages change
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      role: "user",
      content: input.trim(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    // Thread management is handled on the backend
    // No need to send conversation history - backend retrieves it from the thread
    try {
      await sendMessageMutation.mutateAsync({
        message: userMessage.content,
      });
    } catch (error) {
      // Error handled in onError
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (userLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-full">
          <span className="loading loading-spinner loading-lg text-primary"></span>
        </div>
      </AppLayout>
    );
  }

  if (!userData?.user) {
    return null;
  }

  return (
    <AppLayout>
      {/* Chat Container */}
      <div className="flex-1 flex flex-col max-w-4xl mx-auto w-full">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto mb-4 space-y-4">
          {messages.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-base-300 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-base-content mb-2">Start a conversation</h3>
              <p className="text-base-content opacity-70">
                Ask questions about your knowledge base, and I'll help you find answers using the stored facts.
              </p>
            </div>
          ) : (
            messages.map((message, idx) => (
              <div key={idx} className={`chat ${message.role === "user" ? "chat-end" : "chat-start"}`}>
                <div className="chat-bubble chat-bubble-primary">
                  <div className="whitespace-pre-wrap wrap-break-word">
                    {typeof message.content === "string"
                      ? message.content
                      : JSON.stringify(message.content)}
                  </div>
                  {message.role === "assistant" && message.factsUsed !== undefined && (
                    <div className="mt-2 pt-2 border-t border-base-300">
                      <p className="text-xs opacity-70">
                        Used {message.factsUsed} fact{message.factsUsed !== 1 ? "s" : ""} from knowledge base
                      </p>
                      {message.facts && message.facts.length > 0 && (
                        <details className="mt-2">
                          <summary className="text-xs opacity-70 cursor-pointer hover:opacity-100">
                            View referenced facts
                          </summary>
                          <div className="mt-2 space-y-2">
                            {message.facts.map((fact, factIdx) => (
                              <div key={factIdx} className="text-xs bg-base-200 text-gray-800 p-2 rounded">
                                <p>
                                  {typeof fact.content === "string"
                                    ? fact.content
                                    : JSON.stringify(fact.content)}
                                </p>
                              </div>
                            ))}
                          </div>
                        </details>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
          {isLoading && (
            <div className="chat chat-start">
              <div className="chat-bubble">
                <span className="loading loading-dots loading-sm"></span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="bg-base-100 rounded-xl shadow-lg border border-base-300 p-4">
          <div className="flex gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Type your message... (Press Enter to send, Shift+Enter for new line)"
              className="textarea textarea-bordered flex-1 resize-none"
              rows={3}
              disabled={isLoading}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              className="btn btn-primary"
            >
              {isLoading ? (
                <span className="loading loading-spinner loading-sm"></span>
              ) : (
                "Send"
              )}
            </button>
          </div>
          <p className="text-xs opacity-70 mt-2">
            The AI has access to your knowledge base via MCP server connection
          </p>
        </div>
      </div>
    </AppLayout>
  );
}

