import { useQuery, useMutation, useQueryClient, UseQueryResult, UseMutationResult } from "@tanstack/react-query";
import type { SelectUser as User } from "@db/schema";
import { toast } from "./use-toast";

export interface Interest {
  name: string;
  score: number;
  category: 'personality' | 'hobby' | 'value';
}

export interface PersonalityTraits {
  extraversion: number;
  communication: number;
  openness: number;
  values: number;
  planning: number;
  sociability: number;
}

type MatchStatus = 'requested' | 'pending' | 'accepted' | 'rejected';

export interface ExtendedUser {
  id: number;
  username: string;
  name?: string;
  personalityTraits: PersonalityTraits;
  compatibilityScore: number;
  interests: Interest[];
  status: MatchStatus;
  avatar?: string;
  createdAt: string;
}

export type Match = ExtendedUser;

interface Message {
  id: number;
  matchId: number;
  senderId: number;
  content: string;
  createdAt: string;
}

const traitMapping: Record<keyof PersonalityTraits, { name: string; category: Interest['category'] }> = {
  extraversion: { name: "Social Activities", category: "personality" },
  openness: { name: "Trying New Things", category: "personality" },
  planning: { name: "Organized Activities", category: "personality" },
  communication: { name: "Deep Conversations", category: "personality" },
  values: { name: "Meaningful Connections", category: "value" },
  sociability: { name: "Group Activities", category: "hobby" }
} as const;

interface UseMatchesReturn {
  matches: Match[];
  isLoading: boolean;
  connect: (params: { id: string }) => Promise<Match>;
  getMessages: (matchId: string) => Promise<Message[]>;
  getMatch: (id: string) => Promise<Match>;
  useMatchMessages: (matchId: number) => UseQueryResult<Message[], Error>;
  useSendMessage: () => UseMutationResult<Message, Error, { matchId: number; content: string }>;
}

function handleApiError(error: unknown, title = "Error", defaultMessage = "An unexpected error occurred"): never {
  console.error(title, error);
  let message: string;
  let variant: "default" | "destructive" = "destructive";
  
  if (error instanceof Error) {
    message = error.message;
    // Handle specific error cases
    if (message.includes("not found") || message.includes("deleted")) {
      variant = "default"; // Less aggressive for expected cases
    }
  } else if (typeof error === 'string') {
    message = error;
  } else {
    message = defaultMessage;
  }

  toast({
    title,
    description: message,
    variant,
    duration: 5000,
  });
  
  throw new Error(message);
}

export function useMatches(): UseMatchesReturn {
  const queryClient = useQueryClient();

  const { data: matches = [], isLoading } = useQuery<Match[]>({
    queryKey: ["matches"],
    queryFn: async () => {
      try {
        const response = await fetch("/api/matches", {
          credentials: 'include'
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ message: "Failed to fetch matches" }));
          throw new Error(errorData.message);
        }

        const data = await response.json();
        
        return data.map((match: any): Match => ({
          ...match,
          personalityTraits: match.personalityTraits || {},
          interests: Object.entries(match.personalityTraits || {})
            .filter(([trait, value]) => 
              trait in traitMapping && 
              typeof value === 'number' &&
              value >= 0 && 
              value <= 1
            )
            .map(([trait, value]) => ({
              name: traitMapping[trait as keyof PersonalityTraits].name,
              score: Math.round(value as number * 100),
              category: traitMapping[trait as keyof PersonalityTraits].category
            }))
            .sort((a, b) => b.score - a.score),
          avatar: match.avatar || "/default-avatar.png",
          compatibilityScore: Math.min(100, Math.max(0, match.compatibilityScore || 0))
        }));
      } catch (error) {
        return handleApiError(error, "Failed to Load Matches");
      }
    }
  });

  const connect = async ({ id }: { id: string }): Promise<Match> => {
    try {
      const response = await fetch(`/api/matches/${id}/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to connect');
      }

      const match = await response.json();
      queryClient.invalidateQueries({ queryKey: ['matches'] });

      const toastMessages = {
        accepted: {
          title: "Match Accepted! 🎉",
          description: "Great news! You're now connected. Click 'Start Chat' to begin your conversation.",
        },
        requested: {
          title: "Request Sent Successfully ✉️",
          description: "Your connection request has been sent. We'll notify you as soon as they respond!",
        },
        pending: {
          title: "Request Already Sent",
          description: "You've already sent a connection request to this person. Please wait for their response.",
        }
      };

      const statusMessage = toastMessages[match.status as keyof typeof toastMessages];
      if (statusMessage) {
        toast({
          ...statusMessage,
          variant: "default",
          duration: 5000,
        });
      }

      return match;
    } catch (error) {
      return handleApiError(error, "Connection Failed");
    }
  };

  const getMatch = async (id: string): Promise<Match> => {
    try {
      if (!id?.trim()) {
        throw new Error('Match ID is required');
      }

      const matchId = parseInt(id);
      if (isNaN(matchId) || matchId <= 0) {
        throw new Error('Invalid match ID format. Please provide a valid positive number.');
      }

      const response = await fetch(`/api/matches/${matchId}`, {
        credentials: 'include',
        headers: {
          'Accept': 'application/json',
          'Cache-Control': 'no-cache'
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: "Failed to fetch match details" }));
        throw new Error(errorData.message || "Failed to fetch match details");
      }

      const data = await response.json();
      
      if (!data || typeof data !== 'object') {
        throw new Error('Invalid match data received from server');
      }

      // Transform and validate the match data with default values
      return {
        id: data.id,
        username: data.username || 'Unknown User',
        name: data.name || data.username || 'Unknown User',
        personalityTraits: data.personalityTraits || {},
        compatibilityScore: Math.min(100, Math.max(0, data.compatibilityScore || 0)),
        interests: Object.entries(data.personalityTraits || {})
          .filter(([trait, value]) => 
            trait in traitMapping && 
            typeof value === 'number' &&
            value >= 0 && 
            value <= 1
          )
          .map(([trait, value]) => ({
            name: traitMapping[trait as keyof PersonalityTraits].name,
            score: Math.round(value as number * 100),
            category: traitMapping[trait as keyof PersonalityTraits].category
          }))
          .sort((a, b) => b.score - a.score),
        status: data.status || 'pending',
        avatar: data.avatar || "/default-avatar.png",
        createdAt: data.createdAt || new Date().toISOString()
      };
    } catch (error) {
      console.error('Match fetching error:', error);
      handleApiError(error, "Failed to Fetch Match");
      throw error; // Won't be reached as handleApiError throws
    }
  };

  const getMessages = async (matchId: string): Promise<Message[]> => {
    try {
      const response = await fetch(`/api/matches/${matchId}/messages`, {
        credentials: 'include',
        headers: {
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: "Failed to fetch messages" }));
        throw new Error(errorData.message);
      }

      return response.json();
    } catch (error) {
      return handleApiError(error, "Failed to Load Messages");
    }
  };

  const useMatchMessages = (matchId: number) => {
    return useQuery<Message[], Error>({
      queryKey: ["matches", matchId, "messages"],
      queryFn: () => getMessages(matchId.toString()),
      refetchInterval: 3000,
      refetchIntervalInBackground: true,
      retry: false
    });
  };

  const useSendMessage = () => {
    return useMutation<Message, Error, { matchId: number; content: string }>({
      mutationFn: async ({ matchId, content }) => {
        try {
          const response = await fetch(`/api/matches/${matchId}/messages`, {
            method: "POST",
            headers: { 
              "Content-Type": "application/json",
              "Accept": "application/json"
            },
            credentials: 'include',
            body: JSON.stringify({ content }),
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: "Failed to send message" }));
            throw new Error(errorData.message);
          }

          return response.json();
        } catch (error) {
          return handleApiError(error, "Failed to Send Message");
        }
      },
      onSuccess: (newMessage, { matchId }) => {
        queryClient.setQueryData<Message[]>(
          ["matches", matchId, "messages"],
          (old = []) => [...old, newMessage]
        );
      }
    });
  };

  return {
    matches,
    isLoading,
    connect,
    getMessages,
    getMatch,
    useMatchMessages,
    useSendMessage,
  };
}
