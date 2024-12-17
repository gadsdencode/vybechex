import { useRoute, useLocation } from "wouter";
import { useState, useEffect, useRef } from "react";
import type { Message } from "@db/schema";
import { useMatches } from "../hooks/use-matches";
import { useChat, EventSuggestion } from "../hooks/use-chat";
import type { SuggestionResponse, EventSuggestionResponse, Suggestion } from "../hooks/use-chat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Loader2, Send, Lightbulb, Calendar } from "lucide-react";
import { useUser } from "../hooks/use-user";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { QueryKey } from "@tanstack/react-query";
import type { Match } from "../hooks/use-matches";
import { useToast } from "@/hooks/use-toast";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export default function Chat() {
  const [, params] = useRoute<{ id: string }>("/chat/:id");
  const matchId = params?.id ? parseInt(params.id) : null;
  const { user } = useUser();
  const { getMessages, sendMessage, getMatch } = useMatches();
  const { getSuggestions, craftMessage, getEventSuggestions } = useChat();
  const [newMessage, setNewMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  // Get match details first
  const { data: match, isLoading: isLoadingMatch, error: matchError } = useQuery<Match, Error>({
    queryKey: ['matches', matchId] as QueryKey,
    queryFn: () => {
      if (!matchId) throw new Error('No match ID provided');
      return getMatch(matchId.toString());
    },
    enabled: !!matchId,
    retry: (failureCount, error) => {
      if (error.message.includes('Unauthorized') || error.message.includes('Session expired')) {
        return false;
      }
      return failureCount < 3;
    },
    staleTime: 30000,
    gcTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false
  });

  // Only fetch messages if match exists and is accepted
  const { data: messages = [], isLoading: isLoadingMessages } = useQuery<Message[], Error>({
    queryKey: ['messages', matchId] as QueryKey,
    queryFn: () => getMessages(matchId!.toString()),
    enabled: !!matchId && match?.status === 'accepted',
    refetchInterval: (query) => {
      if (!matchId || match?.status !== 'accepted') return false;
      const data = query.state.data;
      if (!Array.isArray(data)) return 10000;
      
      const latestMessage = data[data.length - 1];
      if (!latestMessage || !latestMessage.createdAt) return 15000;
      
      // Only refetch if the latest message is from the other user
      if (latestMessage.senderId !== user?.id) {
        const messageAge = Date.now() - new Date(latestMessage.createdAt).getTime();
        return messageAge < 30000 ? 5000 : 15000;
      }
      return 15000;
    },
    refetchOnWindowFocus: true,
    placeholderData: (previousData) => previousData,
    staleTime: 5000,
  });

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages?.length && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Handle unauthorized errors
  useEffect(() => {
    if (matchError?.message?.includes('Unauthorized') || matchError?.message?.includes('Session expired')) {
      window.location.href = '/login';
    }
  }, [matchError]);

  const { data: chatSuggestions, isLoading: isLoadingSuggestions } = useQuery<SuggestionResponse>({
    queryKey: ['suggest', matchId] as QueryKey,
    queryFn: () => getSuggestions(matchId!),
    staleTime: 60000,
    retry: (failureCount, error: Error) => {
      if (error.message.includes('Unauthorized') || error.message.includes('Session expired')) {
        return false;
      }
      return failureCount < 3;
    },
    enabled: !!matchId && match?.status === 'accepted',
  });

  const { data: eventSuggestionsData = { suggestions: [] }, isLoading: isLoadingEvents } = useQuery<EventSuggestionResponse>({
    queryKey: ['events/suggest', matchId] as QueryKey,
    queryFn: () => getEventSuggestions(matchId!),
    staleTime: 60000,
    retry: false,
    enabled: !!matchId && match?.status === 'accepted',
  });

  const isLoading = isLoadingMessages || isLoadingSuggestions || isLoadingEvents;
  const eventSuggestions = eventSuggestionsData.suggestions;

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      if (!matchId) throw new Error("No match ID");
      return sendMessage({ matchId: matchId.toString(), content });
    },
    onSuccess: () => {
      setNewMessage("");
      queryClient.invalidateQueries({ queryKey: ['messages', matchId] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error sending message",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    sendMessageMutation.mutate(newMessage.trim());
  };

  if (!matchId) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <p>Please return to your matches</p>
      </div>
    );
  }

  if (isLoadingMatch) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!match) {
    return (
      <div className="flex items-center justify-center h-[80vh] flex-col gap-4">
        <p>Match not found</p>
        <Button onClick={() => setLocation('/matches')}>Return to Matches</Button>
      </div>
    );
  }

  if (match.status === 'pending') {
    return (
      <div className="flex items-center justify-center h-[80vh] flex-col gap-4">
        <p>This match is pending acceptance</p>
        <div className="flex gap-2">
          <Button onClick={async () => {
            try {
              await fetch(`/api/matches/${matchId}`, {
                method: 'PATCH',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ status: 'accepted' }),
                credentials: 'include',
              });
              queryClient.invalidateQueries({ queryKey: ['matches', matchId] });
              toast({
                title: "Match accepted!",
                description: "You can now start chatting.",
              });
            } catch (error) {
              toast({
                title: "Error",
                description: "Failed to accept match",
                variant: "destructive",
              });
            }
          }}>
            Accept Match
          </Button>
          <Button variant="outline" onClick={() => setLocation('/matches')}>
            Return to Matches
          </Button>
        </div>
      </div>
    );
  }

  if (match.status === 'rejected') {
    return (
      <div className="flex items-center justify-center h-[80vh] flex-col gap-4">
        <p>This match has been rejected</p>
        <Button onClick={() => setLocation('/matches')}>Return to Matches</Button>
      </div>
    );
  }

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
    <div className="max-w-2xl bg-gray-500/50 mx-auto border border-white rounded-lg p-10 m-10">
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
              <Button 
                variant="outline" 
                size="icon"
                disabled={isLoadingSuggestions || !chatSuggestions?.suggestions?.length}
              >
                <Lightbulb className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-96">
              <div className="p-2">
                <h4 className="font-medium mb-3">Conversation Starters</h4>
                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
                  {isLoadingSuggestions ? (
                    <div className="flex justify-center py-4">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
                  ) : chatSuggestions?.suggestions?.length ? (
                    chatSuggestions.suggestions.map((suggestion: Suggestion, i: number) => (
                      <Button
                        key={i}
                        variant="ghost"
                        className="w-full justify-start whitespace-normal text-left h-auto py-3 px-4"
                        onClick={async (e) => {
                          e.preventDefault();
                          const popoverTrigger = e.currentTarget.closest('.popover-content')?.previousElementSibling as HTMLElement;
                          popoverTrigger?.click(); // Close the popover
                          try {
                            const { message } = await craftMessage({ 
                              matchId: matchId!, 
                              suggestion: suggestion.text 
                            });
                            setNewMessage(message);
                          } catch (error) {
                            console.error("Failed to craft message:", error);
                            setNewMessage(suggestion.text);
                          }
                        }}
                      >
                        {suggestion.text}
                      </Button>
                    ))
                  ) : (
                    <p className="text-center text-muted-foreground py-4">
                      No suggestions available
                    </p>
                  )}
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
                  {eventSuggestionsData.suggestions.map((event: EventSuggestion, i: number) => (
                    <Button
                      key={i}
                      variant="ghost"
                      className="w-full justify-start whitespace-normal text-left h-auto py-3 px-4"
                      onClick={async (e) => {
                        e.preventDefault();
                        const popoverTrigger = e.currentTarget.closest('.popover-content')?.previousElementSibling as HTMLElement;
                        popoverTrigger?.click(); // Close the popover
                        try {
                          const { message } = await craftMessage({ 
                            matchId: matchId!,
                            suggestion: `Would you like to ${event.title.toLowerCase()}?`
                          });
                          setNewMessage(message);
                        } catch (error) {
                          console.error("Failed to craft message:", error);
                          setNewMessage(`Would you like to ${event.title.toLowerCase()}?`);
                        }
                      }}
                    >
                      {event.title}
                      {event.description && (
                        <span className="block text-sm text-muted-foreground mt-1">
                          {event.description}
                        </span>
                      )}
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