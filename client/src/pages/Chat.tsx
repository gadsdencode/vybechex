import { useState } from "react";
import { useRoute } from "wouter";
import { useMatches } from "../hooks/use-matches";
import { useChat } from "../hooks/use-chat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Loader2, Send, Lightbulb, Calendar } from "lucide-react";
import { useUser } from "../hooks/use-user";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export default function Chat() {
  const [, params] = useRoute<{ id: string }>("/chat/:id");
  const matchId = params ? parseInt(params.id) : 0;
  const { user } = useUser();
  const { getMessages, sendMessage } = useMatches();
  const { getSuggestions, craftMessage, getEventSuggestions } = useChat();
  const [newMessage, setNewMessage] = useState("");
  const { data: messages = [], isLoading: isLoadingMessages } = useQuery({
    queryKey: ['/api/messages', matchId],
    queryFn: () => getMessages(matchId),
    refetchInterval: 3000, // Poll every 3 seconds for new messages
  });

  const { data: chatSuggestions = { suggestions: [] }, isLoading: isLoadingSuggestions } = useQuery({
    queryKey: ['/api/suggest', matchId],
    queryFn: () => getSuggestions(matchId),
    staleTime: 30000, // Suggestions valid for 30 seconds
  });

  const { data: eventSuggestionsData = { suggestions: [] }, isLoading: isLoadingEvents } = useQuery({
    queryKey: ['/api/events/suggest', matchId],
    queryFn: () => getEventSuggestions(matchId),
    staleTime: 60000, // Event suggestions valid for 1 minute
  });

  const isLoading = isLoadingMessages || isLoadingSuggestions || isLoadingEvents;
  const suggestions = chatSuggestions.suggestions;
  const eventSuggestions = eventSuggestionsData.suggestions;

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const sendMessageMutation = useMutation({
    mutationFn: sendMessage,
    onSuccess: () => {
      // Invalidate and refetch messages
      queryClient.invalidateQueries({ queryKey: ['/api/messages', matchId] });
      // Invalidate suggestions as conversation context has changed
      queryClient.invalidateQueries({ queryKey: ['/api/suggest', matchId] });
      setNewMessage("");
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to send message",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    sendMessageMutation.mutate({ 
      matchId, 
      content: newMessage.trim() 
    });
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

        <div className="flex gap-2">
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
                  {suggestions.map((suggestion: string, i: number) => (
                    <Button
                      key={i}
                      variant="ghost"
                      className="w-full justify-start whitespace-normal text-left h-auto py-3 px-4"
                      onClick={async () => {
                        try {
                          const { message } = await craftMessage({ 
                            matchId, 
                            suggestion 
                          });
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
              </div>
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="icon">
                <Calendar className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-96">
              <div className="p-2">
                <h4 className="font-medium mb-3">Suggested Activities</h4>
                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
                  {eventSuggestions.map((event: string, i: number) => (
                    <Button
                      key={i}
                      variant="ghost"
                      className="w-full justify-start whitespace-normal text-left h-auto py-3 px-4"
                      onClick={async () => {
                        try {
                          const { message } = await craftMessage({ 
                            matchId,
                            suggestion: `Would you like to ${event.toLowerCase()}?`
                          });
                          setNewMessage(message);
                        } catch (error) {
                          console.error("Failed to craft message:", error);
                          setNewMessage(`Would you like to ${event.toLowerCase()}?`); // Fallback
                        }
                      }}
                    >
                      {event}
                    </Button>
                  ))}
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        <Button type="submit" size="icon">
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}