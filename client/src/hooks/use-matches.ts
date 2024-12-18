import { useQuery, useMutation, useQueryClient, UseQueryResult, UseMutationResult } from "@tanstack/react-query";
import type { SelectUser as User } from "@db/schema";
import { toast } from "./use-toast";
import { getAuthToken, getUserId } from '@/utils/auth';

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

export interface Match {
  id: number;
  requester?: {
    id: number;
    username: string;
    name: string;
    avatar: string;
    personalityTraits: Record<string, number>;
    createdAt: string;
  };
  status: 'requested' | 'accepted' | 'rejected';
  createdAt: string;
  score?: number;
  compatibilityScore?: number;
}

interface Message {
  id: number;
  matchId: number;
  senderId: number;
  content: string;
  createdAt: string;
}

interface MatchProfile extends ExtendedUser {
  matchStatus: 'none' | 'pending' | 'accepted' | 'rejected';
  canInitiateMatch: boolean;
  matchId?: number;
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
  requests: Match[];
  isLoading: boolean;
  isResponding: boolean;
  connect: (params: { id: string }) => Promise<Match>;
  getMessages: (matchId: string) => Promise<Message[]>;
  getMatch: (id: string | number) => Promise<MatchProfile>;
  initiateMatch: (targetId: string) => Promise<Match>;
  useMatchMessages: (matchId: number) => UseQueryResult<Message[], Error>;
  useSendMessage: () => UseMutationResult<Message, Error, { matchId: number; content: string }>;
  respondToMatch: ({ matchId, status }: { matchId: number; status: 'accepted' | 'rejected' }) => void;
}

const handleApiError = (error: unknown, prefix: string = "API Error"): never => {
  if (error instanceof Error) {
    console.error(`${prefix}:`, error);
    throw new Error(`${prefix} ${error.message}`);
  }
  console.error(`${prefix}:`, error);
  throw new Error(`${prefix} Unknown error occurred`);
};

export function useMatches(): UseMatchesReturn {
  const queryClient = useQueryClient();

  const { data: matches = [], isLoading: isLoadingMatches } = useQuery({
    queryKey: ['matches'],
    queryFn: async () => {
      try {
        const response = await fetch('/api/matches');
        if (!response.ok) {
          throw new Error('Failed to fetch matches');
        }
        const data = await response.json();
        return data.matches || [];
      } catch (error) {
        console.error('Match fetch error:', error);
        throw error;
      }
    }
  });

  const { data: requests = [], isLoading: isLoadingRequests } = useQuery({
    queryKey: ['match-requests'],
    queryFn: async () => {
      try {
        const userId = getUserId();
        if (!userId) {
          console.log('User ID not found');
          return [];
        }

        const response = await fetch('/api/matches/requests', {
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${getAuthToken()}`
          }
        });

        if (response.status === 401) {
          console.log('Unauthorized request');
          return [];
        }

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ 
            message: `Request failed with status ${response.status}` 
          }));
          console.error('Match request error:', errorData);
          toast({
            title: "Error fetching match requests",
            description: errorData.message || "Failed to fetch match requests",
            variant: "destructive"
          });
          return [];
        }

        const data = await response.json();
        return data.requests || [];
      } catch (error) {
        console.error('Match request error:', error);
        toast({
          title: "Error fetching match requests",
          description: error instanceof Error ? error.message : "An unexpected error occurred",
          variant: "destructive"
        });
        return [];
      }
    },
    retry: 1,
    retryDelay: 1000,
    staleTime: 30000 // Cache for 30 seconds
  });
  
  const { mutate: respondToMatch, isPending: isResponding } = useMutation({
    mutationFn: async ({ matchId, status }: { matchId: number; status: 'accepted' | 'rejected' }) => {
      try {
        const response = await fetch(`/api/matches/${matchId}/respond`, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${getAuthToken()}`
          },
          body: JSON.stringify({ status })
        });

        if (response.status === 401) {
          throw new Error('Unauthorized access');
        }

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.message || 'Failed to respond to match request');
        }

        const data = await response.json();
        return data;
      } catch (error) {
        console.error('Match response error:', error);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['match-requests'] });
      toast({
        title: "Success",
        description: "Match request response sent successfully",
        variant: "default"
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to respond to match request",
        variant: "destructive"
      });
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
          title: "Match Accepted! ",
          description: "Great news! You're now connected. Click 'Start Chat' to begin your conversation.",
        },
        requested: {
          title: "Request Sent Successfully ",
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

  const getMatch = async (id: string | number): Promise<MatchProfile> => {
    try {
      if (!id) {
        throw new Error('Match ID is required');
      }

      const matchId = typeof id === 'string' ? parseInt(id) : id;
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
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to fetch match profile');
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error fetching match:', error);
      throw error;
    }
  };

  const initiateMatch = async (targetId: string): Promise<Match> => {
    try {
      const response = await fetch(`/api/matches/${targetId}`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getAuthToken()}`
        }
      });

      if (response.status === 401) {
        throw new Error('Please log in to initiate a match');
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to initiate match');
      }

      const match = await response.json();
      return match;
    } catch (error) {
      console.error('Match initiation error:', error);
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
    requests,
    isLoading: isLoadingMatches || isLoadingRequests,
    isResponding,
    connect,
    getMessages,
    getMatch,
    initiateMatch,
    useMatchMessages,
    useSendMessage,
    respondToMatch
  };
}
