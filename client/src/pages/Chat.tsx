import { useState, useEffect } from "react";
import { useRoute } from "wouter";
import { useMatches } from "../hooks/use-matches";
import { useChat } from "../hooks/use-chat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Loader2, Send, Lightbulb } from "lucide-react";
import { useUser } from "../hooks/use-user";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export default function Chat() {
  const [, params] = useRoute("/chat/:id");
  const matchId = parseInt(params?.id || "0");
  const { user } = useUser();
  const { getMessages, sendMessage } = useMatches();
  const { getSuggestions } = useChat();
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadMessages();
    loadSuggestions();
  }, [matchId]);

  const loadMessages = async () => {
    try {
      const msgs = await getMessages(matchId);
      setMessages(msgs);
    } finally {
      setIsLoading(false);
    }
  };

  const loadSuggestions = async () => {
    const { suggestions } = await getSuggestions(matchId);
    setSuggestions(suggestions);
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    try {
      const msg = await sendMessage({ matchId, content: newMessage });
      setMessages(prev => [msg, ...prev]);
      setNewMessage("");
      loadSuggestions();
    } catch (error) {
      console.error("Failed to send message:", error);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex flex-col-reverse gap-4 mb-6 h-[60vh] overflow-y-auto p-4">
        {messages.map((message) => (
          <Card
            key={message.id}
            className={`p-4 max-w-[80%] ${
              message.senderId === user?.id
                ? "ml-auto bg-primary text-primary-foreground"
                : "mr-auto"
            }`}
          >
            {message.content}
          </Card>
        ))}
      </div>

      <form onSubmit={handleSend} className="flex gap-4">
        <Input
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Type a message..."
          className="flex-1"
        />
        
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="icon">
              <Lightbulb className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-96">
            <div className="p-2">
              <h4 className="font-medium mb-3">Conversation Starters</h4>
              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
                {suggestions.map((suggestion, i) => (
                  <Button
                    key={i}
                    variant="ghost"
                    className="w-full justify-start whitespace-normal text-left h-auto py-3 px-4"
                    onClick={() => setNewMessage(suggestion)}
                  >
                    {suggestion}
                  </Button>
                ))}
              </div>
            </div>
          </PopoverContent>
        </Popover>

        <Button type="submit" size="icon">
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}
