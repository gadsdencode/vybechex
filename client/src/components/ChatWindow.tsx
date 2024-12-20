import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, AlertCircle, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

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
  userId: number;
}

export function ChatWindow({ matchId, userId }: ChatWindowProps) {
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

  // Fetch existing messages
  const { data: messages = [], isLoading: isLoadingMessages } = useQuery<Message[]>({
    queryKey: [`/api/matches/${matchId}/messages`],
  });

  // Connect to WebSocket with reconnection logic
  const connectWebSocket = () => {
    if (reconnectAttempts >= maxReconnectAttempts) {
      setConnectionError("Unable to connect to chat server after multiple attempts");
      return;
    }

    const ws = new WebSocket(
      `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws/chat?userId=${userId}&matchId=${matchId}`
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

    ws.onclose = () => {
      setIsConnecting(true);
      // Attempt to reconnect after a delay
      if (reconnectAttempts < maxReconnectAttempts) {
        reconnectTimeoutRef.current = setTimeout(() => {
          setReconnectAttempts(prev => prev + 1);
          connectWebSocket();
        }, 2000 * Math.pow(2, reconnectAttempts)); // Exponential backoff
      }
    };

    setSocket(ws);
  };

  useEffect(() => {
    connectWebSocket();

    return () => {
      if (socket) {
        socket.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [matchId, userId]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSendMessage = () => {
    if (!message.trim() || !socket || socket.readyState !== WebSocket.OPEN) return;

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
    <Card className="flex flex-col h-[600px]">
      {(isConnecting || isLoadingMessages) && (
        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">
              {isConnecting ? "Connecting to chat..." : "Loading messages..."}
            </p>
          </div>
        </div>
      )}

      <ScrollArea ref={scrollRef} className="flex-1 p-4">
        <div className="space-y-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${
                msg.sender.id === userId ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`max-w-[80%] rounded-lg p-3 ${
                  msg.sender.id === userId
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium">
                    {msg.sender.name || msg.sender.username}
                  </span>
                  <span className="text-xs opacity-70">
                    {formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true })}
                  </span>
                </div>
                <p className="text-sm whitespace-pre-wrap break-words">
                  {msg.content}
                </p>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      <div className="p-4 border-t">
        <div className="flex gap-2">
          <Input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Type your message..."
            disabled={!socket || socket.readyState !== WebSocket.OPEN}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
          />
          <Button 
            onClick={handleSendMessage} 
            size="icon"
            disabled={!socket || socket.readyState !== WebSocket.OPEN}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}