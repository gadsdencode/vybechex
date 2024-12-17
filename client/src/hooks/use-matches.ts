import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { User, Message } from "@db/schema";
import { toast } from "./use-toast";

interface Interest {
  name: string;
  score: number;
  category: 'personality' | 'hobby' | 'value';
}

export interface ExtendedUser {
  id: string;
  username: string;
  name: string;
  personalityTraits: Record<string, number>;
  compatibilityScore: number;
  avatar: string;
  interests: Interest[];
  status: 'pending' | 'accepted' | 'rejected';
}

export type Match = ExtendedUser;

export function useMatches() {
  const queryClient = useQueryClient();
  const { data: rawMatches, isLoading } = useQuery<ExtendedUser[]>({
    queryKey: ["matches"],
    queryFn: async () => {
      try {
        const response = await fetch("/api/matches");
        if (!response.ok) {
          throw new Error("Failed to fetch matches");
        }
        return await response.json();
      } catch (error) {
        console.error("Error fetching matches:", error);
        throw error;
      }
    },
    staleTime: 30000, // Data stays fresh for 30 seconds
    gcTime: 1000 * 60 * 5, // Cache data for 5 minutes
    refetchOnWindowFocus: false // Prevent refetch on window focus
  });

  const connect = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const response = await fetch(`/api/matches/${id}/connect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        credentials: 'include'
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to connect');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['matches'] });
      toast({
        title: "Connection request sent!",
        description: "We'll notify you when they respond.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to connect",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const sendMessage = async ({ matchId, content }: { matchId: string; content: string }): Promise<Message> => {
    const response = await fetch(`/api/matches/${matchId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ content }),
    });

    const text = await response.text();
    try {
      const data = JSON.parse(text);
      if (!response.ok) {
        throw new Error(data.message || 'Failed to send message');
      }
      return data;
    } catch (e) {
      if (!response.ok) {
        throw new Error('Failed to send message');
      }
      throw e;
    }
  };

  const getMessages = async (matchId: string): Promise<Message[]> => {
    try {
      const response = await fetch(`/api/messages/${matchId}`, {
        credentials: 'include',
        headers: {
          'Accept': 'application/json'
        }
      });

      // Handle various HTTP status codes
      if (response.status === 401 || response.status === 403) {
        // Clear any stale data and redirect to login
        queryClient.clear();
        window.location.href = '/login';
        throw new Error('Please log in to continue');
      }

      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        // If we're not getting JSON back, something is wrong
        console.error('Received non-JSON response:', contentType);
        throw new Error('Invalid server response');
      }

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'Failed to fetch messages');
      }

      return data;
    } catch (error) {
      if (error instanceof Error) {
        // Check for session timeout
        if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
          window.location.href = '/login';
          throw new Error('Session expired - Please log in again');
        }
        throw error;
      }
      throw new Error('Failed to fetch messages');
    }
  };

  const getMatch = async (id: string): Promise<Match> => {
    try {
      const response = await fetch(`/api/matches/${id}`, {
        credentials: 'include',
        headers: {
          'Accept': 'application/json'
        }
      });

      if (response.status === 401 || response.status === 403) {
        // Clear any stale data and redirect to login
        queryClient.clear();
        window.location.href = '/login';
        throw new Error('Please log in to continue');
      }

      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        console.error('Received non-JSON response:', contentType);
        throw new Error('Invalid server response');
      }

      const data = await response.json();
      
      if (!response.ok) {
        if (response.status === 404) {
          // If match not found, try to create it
          const newMatch = await connect({ id });
          if (newMatch) {
            // Retry fetching the newly created match
            return getMatch(id);
          }
          throw new Error('Failed to create match');
        }
        throw new Error(data.message || 'Failed to fetch match');
      }

      return data;
    } catch (error) {
      if (error instanceof Error) {
        // Check for network errors that might indicate session timeout
        if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
          window.location.href = '/login';
          throw new Error('Session expired - Please log in again');
        }
        // If it's not a network error and not a 404, rethrow
        if (!error.message.includes('Match not found')) {
          throw error;
        }
      }
      throw new Error('Failed to fetch or create match');
    }
  };

  // Transform raw matches to Match type with interests
  const matches = rawMatches ? rawMatches.map((user: ExtendedUser): Match => {
    const interests = user.personalityTraits ? 
      Object.entries(user.personalityTraits).map(([trait, score]): Interest => {
        const traitMapping: Record<string, { name: string; category: Interest['category'] }> = {
          extraversion: { name: "Social Activities", category: "personality" },
          openness: { name: "Trying New Things", category: "personality" },
          planning: { name: "Organized Activities", category: "personality" },
          communication: { name: "Deep Conversations", category: "personality" },
          values: { name: "Meaningful Connections", category: "value" },
          sociability: { name: "Group Activities", category: "hobby" }
        };

        const mappedTrait = traitMapping[trait] || { name: trait, category: "personality" };
        
        return {
          name: mappedTrait.name,
          score: Math.round(score * 100),
          category: mappedTrait.category
        };
      }).sort((a, b) => b.score - a.score)
      : [];

    return {
      ...user,
      interests,
      avatar: user.avatar || "/default-avatar.png"
    };
  }) : [];

  return {
    matches,
    isLoading,
    connect: connect.mutateAsync,
    sendMessage,
    getMessages,
    getMatch,
  };
}