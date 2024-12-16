import { useState } from "react";
import { useRoute } from "wouter";
import { useState, useEffect, useRef } from "react";
import type { Message } from "@db/schema";
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
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const { data: messages = [], isLoading: isLoadingMessages } = useQuery<Message[], Error>({
    queryKey: ['/api/messages', matchId],
    queryFn: () => getMessages(matchId),
    refetchInterval: (data) => {
      if (!Array.isArray(data) || data.length === 0) return 10000;
      const latestMessage = data[0];
      const isRecent = (new Date().getTime() - new Date(latestMessage.createdAt).getTime()) < 30000;
      return (latestMessage.senderId === user?.id || isRecent) ? 30000 : 10000;
    },
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    staleTime: 10000,
    select: (data) => {
      return [...data].sort((a, b) => {
        const dateA = new Date(b.createdAt || 0).getTime();
        const dateB = new Date(a.createdAt || 0).getTime();
        return dateA - dateB;
      });
    },
    structuralSharing: false,
    retry: (failureCount, error) => {
      // Only retry network-related errors, not auth or validation errors
      if (error instanceof Error && error.message.includes('Failed to fetch')) {
        return failureCount < 3;
      }
      return false;
    },
  });

  const { data: chatSuggestions = { suggestions: [] }, isLoading: isLoadingSuggestions } = useQuery<{ suggestions: string[] }, Error>({
    queryKey: ['/api/suggest', matchId],
    queryFn: () => getSuggestions(matchId),
    staleTime: 30000, // Suggestions valid for 30 seconds
    retry: false,
  });

  const { data: eventSuggestionsData = { suggestions: [] }, isLoading: isLoadingEvents } = useQuery<{ suggestions: string[] }, Error>({
    queryKey: ['/api/events/suggest', matchId],
    queryFn: () => getEventSuggestions(matchId),
    staleTime: 60000, // Event suggestions valid for 1 minute
    retry: false,
  });

  const isLoading = isLoadingMessages || isLoadingSuggestions || isLoadingEvents;
  const suggestions = chatSuggestions.suggestions;
  const eventSuggestions = eventSuggestionsData.suggestions;

  const queryClient = useQueryClient();
  const { toast } = useToast();

  type MutationContext = {
    previousMessages: Message[];
    optimisticMessage: Message;
  };
  
  const sendMessageMutation = useMutation<
    Message,
    Error,
    { matchId: number; content: string },
    MutationContext
  >({
    mutationFn: sendMessage,
    onMutate: async ({ matchId, content }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['/api/messages', matchId] });

      // Snapshot the previous value
      const previousMessages = queryClient.getQueryData<Message[]>(['/api/messages', matchId]) || [];

      // Create optimistic message
      const optimisticMessage: Message = {
        id: Date.now(),
        matchId,
        senderId: user?.id || 0,
        content: content.trim(),
        createdAt: new Date(),
        analyzed: false,
        sentiment: null
      };

      // Optimistically update to the new value
      queryClient.setQueryData<Message[]>(
        ['/api/messages', matchId],
        (old = []) => [optimisticMessage, ...old]
      );

      // Clear input immediately for better UX
      setNewMessage("");

      return { previousMessages, optimisticMessage };
    },
    onSuccess: (newMessage, variables, context) => {
      if (!context) return;

      queryClient.setQueryData<Message[]>(
        ['/api/messages', variables.matchId],
        (old = []) => {
          // Remove optimistic message and add real one
          const messages = old.filter(msg => msg.id !== context.optimisticMessage.id);
          return [newMessage, ...messages];
        }
      );

      // Invalidate suggestions to get fresh ones based on new message
      queryClient.invalidateQueries({ queryKey: ['/api/suggest', variables.matchId] });
    },
    onError: (error: unknown, variables, context) => {
      // Revert optimistic update
      if (context?.previousMessages) {
        queryClient.setQueryData(['/api/messages', matchId], context.previousMessages);
      }
      const errorMessage = error instanceof Error ? error.message : 'Failed to send message';
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    },
    onSettled: () => {
      // Always refetch after error or success to ensure consistency
      queryClient.invalidateQueries({ queryKey: ['/api/messages', matchId] });
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

  


  // Only show full loading state on initial load with no messages
  if (isLoading && (!messages || messages.length === 0)) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Show a subtle loading indicator during background refreshes
  const LoadingIndicator = () => (
    isLoading ? (
      <div className="absolute top-2 right-2">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground opacity-50" />
      </div>
    ) : null
  );

  return (
    <div className="max-w-2xl mx-auto">
      <div className="relative flex flex-col-reverse mb-6 h-[60vh] overflow-y-auto p-4 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent">
        <LoadingIndicator />
        <div ref={messagesEndRef} />
        {messages.map((message) => {
          const isCurrentUser = message.senderId === user?.id;
          return (
            <div
              key={message.id}
              className={`flex ${isCurrentUser ? 'justify-end' : 'justify-start'} w-full mb-4 last:mb-0`}
            >
              <Card
                className={`p-4 max-w-[80%] ${
                  isCurrentUser
                    ? "bg-primary text-primary-foreground shadow-md"
                    : "bg-card shadow"
                }`}
              >
                <div className="whitespace-pre-wrap break-words">
                  {message.content}
                </div>
              </Card>
            </div>
          );
        })}
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