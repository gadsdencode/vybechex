// //src/hooks/use-matches.ts

import { useQuery, useMutation, useQueryClient, UseQueryResult, UseMutationResult } from "@tanstack/react-query";
import type { User, Message } from "@db/schema";
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
  [key: string]: number; // Allow string indexing
}

type PersonalityTrait = keyof PersonalityTraits;

const traitMapping: Record<PersonalityTrait, { name: string; category: Interest['category'] }> = {
  extraversion: { name: "Social Activities", category: "personality" },
  openness: { name: "Trying New Things", category: "personality" },
  planning: { name: "Organized Activities", category: "personality" },
  communication: { name: "Deep Conversations", category: "personality" },
  values: { name: "Meaningful Connections", category: "value" },
  sociability: { name: "Group Activities", category: "hobby" }
} as const;

export interface ExtendedUser extends Omit<User, 'personalityTraits'> {
  personalityTraits: PersonalityTraits;
  compatibilityScore: number;
  interests: Interest[];
  status: 'requested' | 'pending' | 'accepted' | 'rejected';
  avatar?: string;
}

export type Match = ExtendedUser;

interface UseMatchesReturn {
  matches: Match[];
  isLoading: boolean;
  connect: (params: { id: string; score?: number }) => Promise<Match>;
  sendMessage: (params: { matchId: string; content: string }) => Promise<Message>;
  getMessages: (matchId: string) => Promise<Message[]>;
  getMatch: (id: string) => Promise<Match>;
  useMatchMessages: (matchId: number) => UseQueryResult<Message[], Error>;
  useSendMessage: () => UseMutationResult<Message, Error, { matchId: number; content: string }>;
}

export function useMatches(): UseMatchesReturn {
  const checkAuth = async () => {
    const response = await fetch("/api/user", {
      credentials: "include"
    });
    if (!response.ok) {
      throw new Error("Authentication required");
    }
  };
  
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery<ExtendedUser[]>({
    queryKey: ["matches"],
    queryFn: async () => {
      try {
        await checkAuth();
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

  const { mutateAsync: connect } = useMutation({
    mutationFn: async ({ id, score }: { id: string; score?: number }) => {
      try {
        const response = await fetch(`/api/matches/${id}/connect`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          credentials: 'include',
          body: JSON.stringify({ score })
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.message || 'Failed to connect');
        }

        const match = await response.json();
        
        // Immediately invalidate the matches query to get the latest status
        queryClient.invalidateQueries({ queryKey: ['matches'] });
        
        return match;
      } catch (error) {
        console.error('Error in connect mutation:', error);
        throw error;
      }
    },
    onSuccess: (data) => {
      if (data.status === 'accepted') {
        toast({
          title: "Match Accepted!",
          description: "You can now start chatting with this match.",
        });
      } else if (data.status === 'requested') {
        toast({
          title: "Connection Request Sent",
          description: "We'll notify you when they respond.",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to connect",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const useMatchMessages = (matchId: number) => {
    const queryClient = useQueryClient();
    
    return useQuery<Message[]>({
      queryKey: ["matches", matchId, "messages"],
      queryFn: async () => {
        const response = await fetch(`/api/matches/${matchId}/messages`);
        if (!response.ok) {
          throw new Error("Failed to fetch messages");
        }
        return response.json();
      },
      refetchInterval: 3000, // Poll every 3 seconds
      refetchIntervalInBackground: true,
      staleTime: 1000, // Consider data fresh for 1 second
      gcTime: 1000 * 60 * 5, // Cache data for 5 minutes
      refetchOnWindowFocus: false, // Don't refetch when window regains focus
    });
  };

  const useSendMessage = () => {
    const queryClient = useQueryClient();
    
    return useMutation<Message, Error, { matchId: number; content: string }>({
      mutationFn: async ({ matchId, content }) => {
        const response = await fetch(`/api/matches/${matchId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        });
        if (!response.ok) {
          throw new Error("Failed to send message");
        }
        return response.json();
      },
      onSuccess: (newMessage, { matchId }) => {
        // Optimistically update the messages cache
        queryClient.setQueryData<Message[]>(
          ["matches", matchId, "messages"],
          (old = []) => [...old, newMessage]
        );
      },
    });
  };

  const sendMessage = async ({ matchId, content }: { matchId: string; content: string }): Promise<Message> => {
    const response = await fetch(`/api/matches/${matchId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ content }),
      credentials: 'include'
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Failed to send message' }));
      throw new Error(errorData.message || 'Failed to send message');
    }

    return response.json();
  };

  const getMessages = async (matchId: string): Promise<Message[]> => {
    try {
      await checkAuth();
      const response = await fetch(`/api/matches/${matchId}/messages`, {
        credentials: 'include',
        headers: {
          'Accept': 'application/json'
        }
      });

      if (response.status === 401) {
        throw new Error("Authentication required");
      }
      if (response.status === 404) {
        throw new Error("Match not found");
      }
      if (!response.ok) {
        throw new Error("Failed to fetch messages");
      }

      return response.json();
    } catch (error) {
      console.error('Error fetching messages:', error);
      throw error;
    }
  };

  const getMatch = async (id: string): Promise<Match> => {
    try {
      // Input validation
      if (!id || id.trim() === '') {
        throw new Error('Match ID is required');
      }

      // Validate ID format
      const matchId = parseInt(id);
      if (isNaN(matchId) || matchId.toString() !== id) {
        throw new Error('Invalid match ID format. Must be a valid number.');
      }

      // Attempt to fetch the match
      const response = await fetch(`/api/matches/${id}`, {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      });

      // Handle various HTTP error responses with detailed messages
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ 
          message: 'Server returned an error without details' 
        }));
        
        switch (response.status) {
          case 401:
            throw new Error(errorData.message || 'Authentication required. Please login to view this match.');
          case 403:
            throw new Error(errorData.message || 'You do not have permission to view this match.');
          case 404:
            throw new Error(errorData.message || 'Match not found. It may have been deleted or you may not have access.');
          case 400:
            throw new Error(errorData.message || 'Invalid match request. Please check the match ID.');
          default:
            throw new Error(errorData.message || `Failed to fetch match: ${response.statusText}`);
        }
      }

      // Parse and validate response data
      const data = await response.json();
      
      // Comprehensive data validation
      if (!data || typeof data !== 'object') {
        throw new Error('Server returned invalid match data format');
      }

      // Validate required fields with specific error messages
      const requiredFields = ['id', 'status', 'personalityTraits'] as const;
      for (const field of requiredFields) {
        if (!(field in data)) {
          throw new Error(`Missing required field: ${field}`);
        }
      }

      if (!data.personalityTraits || typeof data.personalityTraits !== 'object') {
        throw new Error('Invalid personality traits data received');
      }

      // Transform the data into the expected format with proper typing
      return {
        ...data,
        interests: Object.keys(data.personalityTraits)
          .filter((trait): trait is keyof PersonalityTraits => 
            trait in traitMapping && 
            typeof data.personalityTraits[trait] === 'number'
          )
          .map(trait => ({
            name: traitMapping[trait].name,
            score: Math.round((data.personalityTraits[trait] || 0) * 100),
            category: traitMapping[trait].category
          }))
          .sort((a, b) => b.score - a.score), // Sort by score descending
        avatar: data.avatar || "/default-avatar.png",
        compatibilityScore: typeof data.compatibilityScore === 'number' 
          ? data.compatibilityScore 
          : 0
      };
    } catch (error) {
      console.error('Error fetching match:', error);
      // Ensure error is always an Error instance with a descriptive message
      const errorMessage = error instanceof Error 
        ? error.message 
        : 'An unexpected error occurred while fetching the match';
      throw new Error(errorMessage);
    }
  };

  // Transform raw matches to Match type with interests
  const matches = data ? data.map((user: ExtendedUser): Match => {
    const interests = Object.keys(user.personalityTraits || {})
      .filter((trait: string): trait is string => {
        return trait in traitMapping;
      })
      .map((trait) => {
        const mappedTrait = traitMapping[trait];
        return {
          name: mappedTrait.name,
          score: Math.round((user.personalityTraits[trait] || 0) * 100),
          category: mappedTrait.category
        };
      }).sort((a, b) => b.score - a.score);

    return {
      ...user,
      interests,
      avatar: user.avatar || "/default-avatar.png"
    };
  }) : [];

  return {
    matches,
    isLoading,
    connect,
    sendMessage,
    getMessages,
    getMatch,
    useMatchMessages,
    useSendMessage,
  };
}