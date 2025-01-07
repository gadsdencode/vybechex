import React, { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, AlertCircle, Loader2, Moon, Sun } from 'lucide-react';
import { formatDistanceToNow } from "date-fns";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useUser } from "@/hooks/use-user";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "next-themes";
import { MessageBubble } from "./MessageBubble";
import { ConnectionStatus } from "./ConnectionStatus";
import { TypingIndicator } from "./TypingIndicator";
import styles from "./ChatWindow.module.css";

interface Message {
  id: number;
  content: string;
  createdAt: string;
  sender: {
    id: number;
    username: string;
    name: string;
    avatar: string;
  };
}

interface ChatWindowProps {
  matchId: number;
}

export function ChatWindow({ matchId }: ChatWindowProps) {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [isTyping, setIsTyping] = useState(false);
  const [message, setMessage] = useState("");
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [isConnecting, setIsConnecting] = useState(true);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const maxReconnectAttempts = 5;
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const { user } = useUser();
  const sessionIdRef = useRef<string>(crypto.randomUUID());

  const toggleTheme = () => {
    setTheme(prevTheme => prevTheme === 'light' ? 'dark' : 'light');
  };

  // Fetch existing messages
  const { data: messages = [], isLoading: isLoadingMessages } = useQuery<Message[]>({
    queryKey: [`/api/matches/${matchId}/messages`],
    enabled: !!user, // Only fetch when user is authenticated
  });

  // Connect to WebSocket with reconnection logic
  const connectWebSocket = () => {
    if (!user || reconnectAttempts >= maxReconnectAttempts) {
      setConnectionError(
        !user 
          ? "Authentication required" 
          : "Unable to connect to chat server after multiple attempts"
      );
      return;
    }

    const ws = new WebSocket(
      `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws/chat?userId=${user.id}&matchId=${matchId}&sessionId=${sessionIdRef.current}`
    );

    ws.onopen = () => {
      setIsConnecting(false);
      setConnectionError(null);
      setReconnectAttempts(0);
      console.log('Connected to chat server');
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'message') {
        queryClient.invalidateQueries({ queryKey: [`/api/matches/${matchId}/messages`] });
      } else if (data.type === 'error') {
        toast({
          title: "Error",
          description: data.message,
          variant: "destructive",
        });
      } else if (data.type === 'connected') {
        toast({
          title: "Connected",
          description: data.message,
        });
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setConnectionError("Connection error occurred");
    };

    ws.onclose = (event) => {
      setIsConnecting(true);
      // Attempt to reconnect after a delay with exponential backoff
      if (reconnectAttempts < maxReconnectAttempts && event.code !== 1000) {
        reconnectTimeoutRef.current = setTimeout(() => {
          setReconnectAttempts(prev => prev + 1);
          connectWebSocket();
        }, 2000 * Math.pow(2, reconnectAttempts));
      }
    };

    setSocket(ws);
  };

  useEffect(() => {
    if (user) {
      connectWebSocket();
    }

    return () => {
      if (socket) {
        socket.close(1000, "Component unmounting");
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [matchId, user]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSendMessage = () => {
    if (!message.trim() || !socket || socket.readyState !== WebSocket.OPEN || !user) {
      return;
    }

    try {
      socket.send(JSON.stringify({
        type: 'message',
        matchId,
        content: message.trim(),
      }));
      setMessage("");
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to send message",
        variant: "destructive",
      });
    }
  };

  if (!user) {
    return (
      <Card className="p-4">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Authentication Required</AlertTitle>
          <AlertDescription>
            Please log in to access the chat.
          </AlertDescription>
        </Alert>
      </Card>
    );
  }

  if (connectionError) {
    return (
      <Card className="p-4">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Connection Error</AlertTitle>
          <AlertDescription>
            {connectionError}
          </AlertDescription>
        </Alert>
      </Card>
    );
  }

  return (
    <Card className={`${styles.chatWindow} ${styles[theme]}`}>
      <div className={styles.header}>
        <h2 className={styles.title}>Chat</h2>
        <ConnectionStatus isConnected={!isConnecting && !connectionError} />
        <Button onClick={toggleTheme} variant="ghost" size="icon" className={styles.themeToggle}>
          {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
        </Button>
      </div>

      <AnimatePresence>
        {(isConnecting || isLoadingMessages) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={styles.loadingOverlay}
          >
            <Loader2 className={styles.loadingSpinner} />
            <p className={styles.loadingText}>
              {isConnecting ? "Connecting to chat..." : "Loading messages..."}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      <ScrollArea className={styles.messageArea}>
        <motion.div layout className={styles.messageList}>
          {messages.map((msg, index) => (
            <MessageBubble 
              key={msg.id} 
              message={msg} 
              currentUserId={user.id}
              isLastMessage={index === messages.length - 1}
            />
          ))}
        </motion.div>
        {isTyping && <TypingIndicator />}
      </ScrollArea>

      <div className={styles.inputArea}>
        <Input
          value={message}
          onChange={(e) => {
            setMessage(e.target.value);
            // Simulate typing indicator
            setIsTyping(true);
            setTimeout(() => setIsTyping(false), 1000);
          }}
          placeholder="Type your message..."
          disabled={!socket || socket.readyState !== WebSocket.OPEN}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSendMessage();
            }
          }}
          className={styles.messageInput}
        />
        <Button 
          onClick={handleSendMessage} 
          disabled={!socket || socket.readyState !== WebSocket.OPEN}
          className={styles.sendButton}
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </Card>
  );
}