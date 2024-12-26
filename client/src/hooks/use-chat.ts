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
  reasoning?: string;
  date?: string;
  location?: string;
}

export interface EventSuggestionResponse {
  success: boolean;
  suggestions: EventSuggestion[];
}

// API endpoints configuration
const API_ENDPOINTS = {
  suggestions: "/api/matches/suggestions",
  craftMessage: "/api/matches/messages/craft",
  eventSuggestions: "/api/matches/suggestions/events"
} as const;

// Detect if we're getting a Vite dev server response
function isViteDevServerResponse(text: string): boolean {
  return text.includes('data-vite-theme') || 
         text.includes('vite/client') || 
         text.includes('/@vite/client');
}

// Utility function for API calls
async function makeApiCall<T>(
  endpoint: string,
  data: any,
  errorMessage: string
): Promise<T> {
  // Add retry logic for network issues
  const maxRetries = 2;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "X-Requested-With": "XMLHttpRequest"
        },
        body: JSON.stringify(data),
        credentials: "include",
      });

      // Check if the response is a redirect
      if (response.redirected) {
        window.location.href = response.url;
        throw new Error("Session expired. Please log in again.");
      }

      const contentType = response.headers.get("content-type");
      
      // Special handling for 404 and 401
      if (response.status === 404) {
        console.error(`API endpoint not found: ${endpoint}`);
        throw new Error("API endpoint not found. Please check the server configuration.");
      }
      if (response.status === 401) {
        window.location.href = '/login';
        throw new Error("Session expired. Please log in again.");
      }

      // Handle non-JSON responses
      if (!contentType?.includes("application/json")) {
        const responseDetails = {
          contentType,
          status: response.status,
          statusText: response.statusText,
          url: response.url,
          attempt: attempt + 1,
          maxRetries
        };
        console.error("Invalid content type received:", responseDetails);

        const text = await response.text();
        console.debug("Response text preview:", text.substring(0, 200) + "...");

        if (text.includes("<!DOCTYPE html>")) {
          // Check if this is a Vite dev server response
          if (isViteDevServerResponse(text)) {
            console.error("Received Vite dev server response. API route may not be properly configured:", {
              endpoint,
              ...responseDetails
            });
            throw new Error("API route not configured. Check server implementation.");
          }

          if (text.toLowerCase().includes("unauthorized")) {
            window.location.href = '/login';
            throw new Error("Unauthorized. Please log in again.");
          }

          // If it's the last retry, throw a more specific error
          if (attempt === maxRetries) {
            throw new Error(`Server configuration error: API endpoint ${endpoint} not properly set up`);
          }
          // Otherwise, retry
          throw new Error("Received HTML instead of JSON");
        }

        throw new Error(`Server returned invalid content type: ${contentType}`);
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({
          message: `Server error: ${response.status} ${response.statusText}`
        }));
        throw new Error(errorData.message || errorMessage);
      }

      const jsonData = await response.json();
      
      // Validate basic response structure
      if (!jsonData || typeof jsonData !== 'object') {
        throw new Error("Invalid JSON response structure");
      }

      return jsonData as T;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Only retry on network errors or HTML responses
      const errorMessage = lastError.message;
      const shouldRetry = errorMessage.includes("HTML") || 
                         errorMessage.includes("fetch") ||
                         errorMessage.includes("API route not configured");
      
      if (!shouldRetry) {
        throw lastError;
      }
      
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000;
        console.warn(`Retrying API call to ${endpoint} in ${delay}ms (attempt ${attempt + 1}/${maxRetries + 1})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw lastError;
    }
  }

  // This should never be reached due to the throw in the loop
  throw lastError || new Error("Unknown error occurred");
}

interface CraftMessageParams {
  matchId: number;
  suggestion: string;
  eventDetails?: {
    title: string;
    description: string;
    reasoning?: string;
  };
}

export function useChat() {
  const getSuggestions = async (matchId: number): Promise<SuggestionResponse> => {
    try {
      const data = await makeApiCall<any>(
        API_ENDPOINTS.suggestions,
        { matchId },
        "Failed to get suggestions"
      );

      // Validate response structure
      if (!data?.success) {
        console.warn("Unexpected response structure:", data);
        return { suggestions: [] };
      }

      const suggestions = Array.isArray(data.suggestions) ? data.suggestions : [];
      
      return {
        suggestions: suggestions.map((suggestion: any) => ({
          text: typeof suggestion === 'string' ? suggestion : suggestion.text || '',
          confidence: suggestion.confidence || 1
        }))
      };
    } catch (error) {
      if (error instanceof Error && 
          !error.message.includes("Invalid response format") &&
          !error.message.includes("API endpoint not found")) {
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive",
        });
      }
      return { suggestions: [] };
    }
  };

  const craftMessage = async ({ matchId, suggestion, eventDetails }: CraftMessageParams): Promise<{ message: string }> => {
    try {
      const data = await makeApiCall<any>(
        API_ENDPOINTS.craftMessage,
        { matchId, suggestion, eventDetails },
        "Failed to craft message"
      );

      if (!data?.success || typeof data.message !== 'string') {
        console.warn("Invalid message format:", data);
        return { message: suggestion };
      }

      return { message: data.message };
    } catch (error) {
      console.error("Error crafting message:", error);
      // Return original suggestion as fallback
      return { message: suggestion };
    }
  };

  const getEventSuggestions = async (matchId: number): Promise<EventSuggestionResponse> => {
    try {
      console.log('Fetching event suggestions for match:', matchId);
      const data = await makeApiCall<any>(
        API_ENDPOINTS.eventSuggestions,
        { matchId },
        "Failed to get event suggestions"
      );

      console.log('Raw event suggestions response:', data);

      if (!data?.success) {
        console.warn("Unexpected response structure:", data);
        return { success: false, suggestions: [] };
      }

      const suggestions = Array.isArray(data.suggestions) ? data.suggestions : [];
      console.log('Processed event suggestions:', suggestions);
      
      return {
        success: true,
        suggestions: suggestions.map((event: any) => ({
          title: event.title || '',
          description: event.description || '',
          reasoning: event.reasoning || '',
          date: event.date || undefined,
          location: event.location || undefined
        }))
      };
    } catch (error) {
      console.error("Error fetching event suggestions:", error);
      if (error instanceof Error && 
          !error.message.includes("Invalid response format") &&
          !error.message.includes("API endpoint not found")) {
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive",
        });
      }
      return { success: false, suggestions: [] };
    }
  };

  const suggestionsMutation = useMutation({
    mutationFn: getSuggestions,
    onError: (error: Error) => {
      // Error already handled in the function
      console.error("Suggestions mutation error:", error);
    },
  });

  const craftMessageMutation = useMutation({
    mutationFn: async (params: CraftMessageParams) => {
      return craftMessage(params);
    },
    onError: (error: Error) => {
      console.error("Craft message mutation error:", error);
    },
  });

  const eventSuggestionsMutation = useMutation({
    mutationFn: getEventSuggestions,
    onError: (error: Error) => {
      // Error already handled in the function
      console.error("Event suggestions mutation error:", error);
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
