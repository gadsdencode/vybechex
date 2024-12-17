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
  const queryClient = useQueryClient();
  
  const { data, isLoading } = useQuery<ExtendedUser[]>({
    queryKey: ["matches"],
    queryFn: async () => {
      try {
        const response = await fetch("/api/matches", {
          credentials: 'include'
        });
        
        if (!response.ok) {
          throw new Error("Failed to fetch matches");
        }
        
        return response.json();
      } catch (error) {
        console.error("Error fetching matches:", error);
        toast({
          title: "Failed to Load Matches",
          description: error instanceof Error 
            ? error.message 
            : "Unable to load your matches. Please try again later.",
          variant: "destructive",
        });
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
          },
          credentials: 'include',
          body: JSON.stringify({ score })
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.message || 'Failed to connect');
        }

        const match = await response.json();
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
          title: "Match Accepted! 🎉",
          description: "Great news! You're now connected. Click 'Start Chat' to begin your conversation.",
          variant: "default",
          duration: 5000,
        });
      } else if (data.status === 'requested') {
        toast({
          title: "Request Sent Successfully ✉️",
          description: "Your connection request has been sent. We'll notify you as soon as they respond!",
          variant: "default",
          duration: 4000,
        });
      } else if (data.status === 'pending') {
        toast({
          title: "Request Already Sent",
          description: "You've already sent a connection request to this person. Please wait for their response.",
          variant: "default",
          duration: 3000,
        });
      }
    },
    onError: (error: Error) => {
      const errorMessage = error.message.includes("401") 
        ? "Please log in to connect with matches"
        : error.message.includes("403")
        ? "You don't have permission to connect with this match"
        : error.message.includes("404")
        ? "This match is no longer available"
        : error.message || "Unable to connect with match. Please try again later";

      toast({
        title: "Connection Failed",
        description: errorMessage,
        variant: "destructive",
      });
    }
  });

  const useMatchMessages = (matchId: number) => {
    return useQuery<Message[]>({
      queryKey: ["matches", matchId, "messages"],
      queryFn: async () => {
        const response = await fetch(`/api/matches/${matchId}/messages`, {
          credentials: 'include'
        });
        if (!response.ok) {
          throw new Error("Failed to fetch messages");
        }
        return response.json();
      },
      refetchInterval: 3000,
      refetchIntervalInBackground: true,
      staleTime: 1000,
      gcTime: 1000 * 60 * 5,
      refetchOnWindowFocus: false,
    });
  };

  const useSendMessage = () => {
    return useMutation<Message, Error, { matchId: number; content: string }>({
      mutationFn: async ({ matchId, content }) => {
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
          throw new Error("Failed to send message");
        }
        
        return response.json();
      },
      onSuccess: (newMessage, { matchId }) => {
        queryClient.setQueryData<Message[]>(
          ["matches", matchId, "messages"],
          (old = []) => [...old, newMessage]
        );
      },
      onError: (error: Error) => {
        toast({
          title: "Failed to Send Message",
          description: error.message,
          variant: "destructive",
        });
      }
    });
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

      const response = await fetch(`/api/matches/${id}`, {
        credentials: 'include',
        headers: {
          'Accept': 'application/json'
        }
      });

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

      const data = await response.json();
      
      // Data validation
      if (!data || typeof data !== 'object') {
        throw new Error('Server returned invalid match data format');
      }

      const requiredFields = ['id', 'status', 'personalityTraits'] as const;
      for (const field of requiredFields) {
        if (!(field in data)) {
          throw new Error(`Missing required field: ${field}`);
        }
      }

      if (!data.personalityTraits || typeof data.personalityTraits !== 'object') {
        throw new Error('Invalid personality traits data received');
      }

      // Transform data
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
          .sort((a, b) => b.score - a.score),
        avatar: data.avatar || "/default-avatar.png",
        compatibilityScore: typeof data.compatibilityScore === 'number' 
          ? data.compatibilityScore 
          : 0
      };
    } catch (error) {
      console.error('Error fetching match:', error);
      const errorMessage = error instanceof Error 
        ? error.message 
        : 'An unexpected error occurred while fetching the match';
      
      toast({
        title: "Failed to Fetch Match",
        description: errorMessage,
        variant: "destructive",
      });
      
      throw new Error(errorMessage);
    }
  };

  const sendMessage = async ({ matchId, content }: { matchId: string; content: string }): Promise<Message> => {
    try {
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
    } catch (error) {
      console.error('Error sending message:', error);
      toast({
        title: "Failed to Send Message",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive",
      });
      throw error;
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
        const errorData = await response.json().catch(() => ({ message: 'Failed to fetch messages' }));
        throw new Error(errorData.message || 'Failed to fetch messages');
      }

      return response.json();
    } catch (error) {
      console.error('Error fetching messages:', error);
      toast({
        title: "Failed to Load Messages",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive",
      });
      throw error;
    }
  };

  const matches = data ? data.map((user: ExtendedUser): Match => {
    const interests = Object.keys(user.personalityTraits || {})
      .filter((trait): trait is keyof PersonalityTraits => trait in traitMapping)
      .map((trait) => ({
        name: traitMapping[trait].name,
        score: Math.round((user.personalityTraits[trait] || 0) * 100),
        category: traitMapping[trait].category
      }))
      .sort((a, b) => b.score - a.score);

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
