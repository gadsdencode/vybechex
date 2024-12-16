import { useState, useEffect } from "react";
import { useRoute } from "wouter";
import { useMatches } from "../hooks/use-matches";
import { useChat } from "../hooks/use-chat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Loader2, Send, Lightbulb, Calendar } from "lucide-react";
import { useUser } from "../hooks/use-user";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function Chat() {
  const [, params] = useRoute("/chat/:id");
  const matchId = parseInt(params?.id || "0");
  const { user } = useUser();
  const { getMessages, sendMessage } = useMatches();
  const { getSuggestions, craftMessage } = useChat();
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [eventSuggestions, setEventSuggestions] = useState<Array<{
    title: string;
    description: string;
    compatibility: number;
  }>>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadMessages();
    loadSuggestions();
    loadEventSuggestions();
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

  const loadEventSuggestions = async () => {
    try {
      const data = await getEventSuggestions(matchId);
      if (data && data.suggestions) {
        setEventSuggestions(data.suggestions);
      }
    } catch (error) {
      console.error("Failed to load event suggestions:", error);
      setEventSuggestions([]);
    }
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
          <PopoverContent className="w-[400px]">
            <Tabs defaultValue="conversation">
              <TabsList className="w-full mb-4">
                <TabsTrigger value="conversation" className="flex-1">
                  <Lightbulb className="h-4 w-4 mr-2" />
                  Conversation
                </TabsTrigger>
                <TabsTrigger value="events" className="flex-1">
                  <Calendar className="h-4 w-4 mr-2" />
                  Events
                </TabsTrigger>
              </TabsList>

              <TabsContent value="conversation" className="mt-0">
                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
                  {suggestions.map((suggestion, i) => (
                    <Button
                      key={i}
                      variant="ghost"
                      className="w-full justify-start whitespace-normal text-left h-auto py-3 px-4"
                      onClick={async () => {
                        try {
                          const { message } = await craftMessage(matchId, suggestion);
                          setNewMessage(message);
                        } catch (error) {
                          console.error("Failed to craft message:", error);
                          setNewMessage(suggestion); // Fallback to original suggestion
                        }
                      }}
                    >
                      {suggestion}
                    </Button>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="events" className="mt-0">
                <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
                  {eventSuggestions.map((event, i) => (
                    <div key={i} className="space-y-2 p-3 rounded-lg bg-muted/50">
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium">{event.title}</h4>
                        <span className="text-sm text-muted-foreground">
                          {event.compatibility}% compatible
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">{event.description}</p>
                      <Button
                        variant="secondary"
                        className="w-full mt-2"
                        onClick={() => {
                          setNewMessage(`Would you be interested in ${event.title.toLowerCase()}? I think it could be fun!`);
                        }}
                      >
                        Suggest this activity
                      </Button>
                    </div>
                  ))}
                </div>
              </TabsContent>
            </Tabs>
          </PopoverContent>
        </Popover>

        <Button type="submit" size="icon">
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}