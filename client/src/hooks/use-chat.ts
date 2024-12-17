// / client/src/hooks/use-chat.ts

import { useQuery, useMutation } from "@tanstack/react-query";
import { toast } from "./use-toast";

export interface Suggestion {
  text: string;
  confidence: number;
}

export interface SuggestionResponse {
  suggestions: Suggestion[];
}

export interface EventSuggestion {
  title: string;
  description: string;
  date?: string;
  location?: string;
}

export interface EventSuggestionResponse {
  suggestions: EventSuggestion[];
}

export function useChat() {
  const getSuggestions = async (matchId: number): Promise<SuggestionResponse> => {
    try {
      const response = await fetch("/api/suggest", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify({ matchId }),
        credentials: "include",
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: "Failed to get suggestions" }));
        throw new Error(errorData.message || "Failed to get suggestions");
      }

      const data = await response.json();
      if (!data.suggestions || !Array.isArray(data.suggestions)) {
        console.error("Invalid suggestion format:", data);
        throw new Error("Invalid suggestion format received from server");
      }

      return {
        suggestions: data.suggestions.map((suggestion: any) => ({
          text: typeof suggestion === 'string' ? suggestion : suggestion.text,
          confidence: suggestion.confidence || 1
        }))
      };
    } catch (error) {
      console.error("Error getting suggestions:", error);
      throw error;
    }
  };

  const craftMessage = async (matchId: number, suggestion: string): Promise<{ message: string }> => {
    try {
      const response = await fetch("/api/craft-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId, suggestion }),
        credentials: "include",
      });

      const text = await response.text();
      try {
        const data = JSON.parse(text);
        if (!response.ok) {
          throw new Error(data.message || "Failed to craft message");
        }
        return data;
      } catch (e) {
        if (!response.ok) {
          throw new Error("Failed to craft message");
        }
        throw e;
      }
    } catch (error) {
      console.error("Error crafting message:", error);
      throw error;
    }
  };

  const getEventSuggestions = async (matchId: number): Promise<EventSuggestionResponse> => {
    try {
      const response = await fetch("/api/events/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId }),
        credentials: "include",
      });

      const text = await response.text();
      try {
        const data = JSON.parse(text);
        if (!response.ok) {
          throw new Error(data.message || "Failed to get event suggestions");
        }
        return data;
      } catch (e) {
        if (!response.ok) {
          throw new Error("Failed to get event suggestions");
        }
        throw e;
      }
    } catch (error) {
      console.error("Error getting event suggestions:", error);
      throw error;
    }
  };

  const suggestionsMutation = useMutation({
    mutationFn: getSuggestions,
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to get suggestions",
        variant: "destructive",
      });
    },
  });

  const craftMessageMutation = useMutation({
    mutationFn: ({ matchId, suggestion }: { matchId: number; suggestion: string }) =>
      craftMessage(matchId, suggestion),
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to craft message",
        variant: "destructive",
      });
    },
  });

  const eventSuggestionsMutation = useMutation({
    mutationFn: getEventSuggestions,
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to get event suggestions",
        variant: "destructive",
      });
    },
  });

  return {
    getSuggestions: suggestionsMutation.mutateAsync,
    craftMessage: craftMessageMutation.mutateAsync,
    getEventSuggestions: eventSuggestionsMutation.mutateAsync,
    isLoading: 
      suggestionsMutation.isPending || 
      craftMessageMutation.isPending || 
      eventSuggestionsMutation.isPending,
  };
}
