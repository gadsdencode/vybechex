import { useRoute, useLocation } from "wouter";
import { useState, useEffect, useRef } from "react";
import type { Message, User } from "@db/schema";
import { useMatches, type Match, type MatchStatus } from "../hooks/use-matches";
import { useChat, EventSuggestion } from "../hooks/use-chat";
import type { SuggestionResponse, EventSuggestionResponse, Suggestion } from "../hooks/use-chat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Loader2, Send, Lightbulb, Calendar } from "lucide-react";
import { useUser } from "../hooks/use-user";
import { useQuery, useMutation, useQueryClient, Query } from "@tanstack/react-query";
import type { QueryKey } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export default function Chat() {
  const [, params] = useRoute<{ id: string }>("/chat/:id");
  const matchId = params?.id ? parseInt(params.id) : null;
  const { user } = useUser();
  const { useMatchMessages, getMatch, useSendMessage } = useMatches();
  const { getSuggestions, craftMessage, getEventSuggestions } = useChat();
  const { mutate: sendMessage } = useSendMessage();
  const [newMessage, setNewMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  // All useQuery hooks at the top level
  const { data: match, isLoading: isLoadingMatch } = useQuery({
    queryKey: ['match', matchId] as const,
    queryFn: () => getMatch(matchId as number),
    enabled: !!matchId && !!user?.id
  });

  // Fetch messages
  const { data: messages = [], isLoading: isLoadingMessages } = useMatchMessages(matchId!);

  // Chat suggestions query
  const { data: chatSuggestions, isLoading: isLoadingSuggestions } = useQuery<SuggestionResponse>({
    queryKey: ['suggest', matchId] as QueryKey,
    queryFn: () => getSuggestions(matchId!),
    enabled: !!matchId && match?.status === 'accepted',
    staleTime: 60000,
    gcTime: 1000 * 60 * 5,
    retry: (failureCount, error: Error) => {
      if (error.message.includes('Unauthorized') || error.message.includes('Session expired')) {
        return false;
      }
      return failureCount < 3;
    },
    refetchOnWindowFocus: false,
  });

  // Event suggestions query
  const { data: eventSuggestionsData = { suggestions: [] }, isLoading: isLoadingEvents } = useQuery<EventSuggestionResponse>({
    queryKey: ['events/suggest', matchId] as QueryKey,
    queryFn: () => getEventSuggestions(matchId!),
    staleTime: 60000,
    retry: false,
    enabled: !!matchId && match?.status === 'accepted',
  });

  const eventSuggestions = eventSuggestionsData.suggestions;

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages?.length && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Handle errors
  useEffect(() => {
    if (match instanceof Error) {
      console.error('Match error:', match);
      toast({
        title: "Error",
        description: match.message,
        variant: "destructive"
      });

      // Redirect back to matches after a short delay
      const timer = setTimeout(() => {
        setLocation('/matches');
      }, 2000);

      return () => clearTimeout(timer);
    }
  }, [match, setLocation]);

  const isLoading = isLoadingMatch || isLoadingMessages;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!match) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
        <p>Match not found</p>
        <Button onClick={() => setLocation('/matches')}>Return to Matches</Button>
      </div>
    );
  }

  // Handle different match statuses
  if (!match.status) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
        <p>Match data is incomplete</p>
        <Button onClick={() => setLocation('/matches')}>Return to Matches</Button>
      </div>
    );
  }

  switch (match.status) {
    case 'accepted':
      break; // Continue to chat UI
    case 'requested':
      return (
        <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
          <p>This match request is pending acceptance</p>
          <Button onClick={() => setLocation('/matches')}>Return to Matches</Button>
        </div>
      );
    case 'pending':
      return (
        <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
          <p>This match request is being processed</p>
          <Button onClick={() => setLocation('/matches')}>Return to Matches</Button>
        </div>
      );
    case 'rejected':
      return (
        <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
          <p>This match request was declined</p>
          <Button onClick={() => setLocation('/matches')}>Return to Matches</Button>
        </div>
      );
    case 'potential':
      return (
        <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
          <p>This is a potential match. Send a match request first!</p>
          <Button onClick={() => setLocation('/matches')}>Return to Matches</Button>
        </div>
      );
    case 'none':
      return (
        <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
          <p>No match exists between you and this user</p>
          <Button onClick={() => setLocation('/matches')}>Return to Matches</Button>
        </div>
      );
    default:
      return (
        <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
          <p>Invalid match status: {match.status}</p>
          <Button onClick={() => setLocation('/matches')}>Return to Matches</Button>
        </div>
      );
  }

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    try {
      console.log('Sending message:', { matchId, content: newMessage.trim() });
      
      // Optimistically update UI
      const optimisticMessage = {
        id: Date.now(), // temporary ID
        matchId: matchId!,
        senderId: user?.id!,
        content: newMessage.trim(),
        createdAt: new Date(),
        analyzed: null,
        sentiment: null
      };

      // Add to messages immediately
      queryClient.setQueryData<Message[]>(
        ['matches', matchId, 'messages'],
        (old = []) => [...old, optimisticMessage]
      );

      // Clear input immediately for better UX
      setNewMessage("");

      // Actually send the message
      await sendMessage({ matchId: matchId!, content: newMessage.trim() });

      // Scroll to bottom after sending
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    } catch (error: any) {
      console.error('Error sending message:', error);
      
      // Revert optimistic update on error
      queryClient.invalidateQueries({ 
        queryKey: ['matches', matchId, 'messages']
      });

      toast({
        title: "Error sending message",
        description: error.message || 'Failed to send message',
        variant: "destructive",
      });
    }
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

  // Debug messages
  console.log('Current messages:', messages);

  return (
    <div className="max-w-2xl bg-gray-500/50 mx-auto border border-white rounded-lg p-10 m-10">
      <div className="relative flex flex-col-reverse mb-6 h-[60vh] overflow-y-auto p-4 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent">
        <LoadingIndicator key="loading-indicator" />
        <div key="messages-end-ref" ref={messagesEndRef} />
        {Array.isArray(messages) && messages.map((message) => {
          if (!message?.id || !message?.content) {
            console.warn('Invalid message format:', message);
            return null;
          }

          const isCurrentUser = message.senderId === (user as { id: number })?.id;
          const messageKey = `message-${message.id}-${message.senderId}`;
          
          return (
            <div
              key={messageKey}
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
                  {message.content || ''}
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
            <PopoverContent className="w-96 h-96">
              <div className="p-2">
                <h4 className="font-medium mb-3">Suggested Activities</h4>
                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
                  {isLoadingEvents ? (
                    <div className="flex justify-center py-4">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
                  ) : eventSuggestionsData.suggestions?.length ? (
                    eventSuggestionsData.suggestions.map((event: EventSuggestion, i: number) => (
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
                              suggestion: event.title,
                              eventDetails: {
                                title: event.title,
                                description: event.description,
                                reasoning: event.reasoning
                              }
                            });
                            setNewMessage(message);
                          } catch (error) {
                            console.error("Failed to craft message:", error);
                            setNewMessage(event.title);
                          }
                        }}
                      >
                        <div className="flex flex-col gap-1">
                          <span className="font-medium">{event.title}</span>
                          {event.description && (
                            <span className="text-sm text-muted-foreground">
                              {event.description}
                            </span>
                          )}
                          {event.reasoning && (
                            <span className="text-xs text-muted-foreground mt-1 italic">
                              {event.reasoning}
                            </span>
                          )}
                        </div>
                      </Button>
                    ))
                  ) : (
                    <p className="text-center text-muted-foreground py-4">
                      No event suggestions available
                    </p>
                  )}
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