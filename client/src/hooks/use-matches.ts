import { useQuery, useMutation, useQueryClient, type UseQueryResult, type UseMutationResult } from "@tanstack/react-query";
import type { SelectUser } from "@db/schema";
import { useToast } from "@/hooks/use-toast";
import { getUserId } from '@/utils/auth';

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

export type MatchStatus = 'none' | 'requested' | 'pending' | 'accepted' | 'rejected';

export interface Match {
  id: number;
  username: string;
  name?: string;
  personalityTraits: Record<string, number>;
  avatar?: string;
  createdAt: string;
  status: MatchStatus;
  score?: number;
  compatibilityScore?: number;
  matchExplanation?: string;
  requester?: {
    id: number;
    username: string;
    name: string;
    avatar?: string;
  };
}

interface Message {
  id: number;
  matchId: number;
  senderId: number;
  content: string;
  createdAt: Date;
  analyzed: boolean | null;
  sentiment: {
    score: number;
    magnitude: number;
    labels: string[];
  } | null;
}

interface UseMatchesReturn {
  matches: Match[];
  requests: Match[];
  isLoading: boolean;
  isResponding: boolean;
  connect: (params: { id: string }) => Promise<Match>;
  respondToMatch: ({ matchId, status }: { matchId: number; status: 'accepted' | 'rejected' }) => void;
  getMatch: (id: string | number) => Promise<Match>;
  initiateMatch: (targetId: string) => Promise<Match>;
  useMatchMessages: (matchId: number) => UseQueryResult<Message[], Error>;
  useSendMessage: () => UseMutationResult<Message, Error, { matchId: number; content: string }>;
}

export function useMatches(): UseMatchesReturn {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: matchData = { matches: [], requests: [] }, isLoading: isLoadingMatches } = useQuery({
    queryKey: ['matches'],
    queryFn: async () => {
      try {
        const response = await fetch('/api/matches', {
          credentials: 'include',
          headers: {
            'Accept': 'application/json'
          }
        });

        if (!response.ok) {
          if (response.status === 401) {
            queryClient.invalidateQueries({ queryKey: ['user'] });
            return { matches: [], requests: [] };
          }
          throw new Error('Failed to fetch matches');
        }

        const data = await response.json();

        // Separate matches and requests based on status
        const matches = data.data.filter((m: Match) => m.status === 'accepted') || [];
        const requests = data.data.filter((m: Match) =>
          m.status === 'requested' || m.status === 'pending'
        ) || [];

        return { matches, requests };
      } catch (error) {
        console.error('Error fetching matches:', error);
        throw error;
      }
    },
    retry: 1,
    retryDelay: 1000
  });

  const { mutate: respondToMatch, isPending: isResponding } = useMutation({
    mutationFn: async ({ matchId, status }: { matchId: number; status: 'accepted' | 'rejected' }) => {
      if (!matchId) throw new Error('Match ID is required');
      if (isNaN(matchId) || matchId <= 0) throw new Error('Invalid match ID');

      const response = await fetch(`/api/matches/${matchId}`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ status })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to respond to match request');
      }

      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['matches'] });

      const messages = {
        accepted: {
          title: "Match Accepted! 🎉",
          description: "You can now start chatting with your new match!"
        },
        rejected: {
          title: "Request Declined",
          description: "The match request has been declined."
        }
      };

      const message = messages[variables.status];
      toast({
        title: message.title,
        description: message.description,
        duration: 5000
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to Process Request",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive",
        duration: 5000
      });
    }
  });

  const connect = async ({ id }: { id: string }): Promise<Match> => {
    try {
      if (!id) throw new Error('User ID is required');

      const parsedId = parseInt(id);
      if (isNaN(parsedId) || parsedId <= 0) {
        throw new Error('Invalid user ID: must be a positive number');
      }

      const response = await fetch('/api/matches', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ targetUserId: parsedId })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to initiate match');
      }

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.message || 'Failed to process match request');
      }

      const { match } = data.data;
      queryClient.invalidateQueries({ queryKey: ['matches'] });

      return match;
    } catch (error) {
      console.error('Match connection error:', error);
      throw error;
    }
  };

  const getMatch = async (id: string | number): Promise<Match> => {
    try {
      if (!id) throw new Error('Match ID is required');

      const matchId = typeof id === 'string' ? parseInt(id) : id;
      if (isNaN(matchId) || matchId <= 0) {
        throw new Error('Invalid match ID format');
      }

      const response = await fetch(`/api/matches/${matchId}`, {
        credentials: 'include',
        headers: {
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to fetch match profile');
      }

      return response.json();
    } catch (error) {
      console.error('Error fetching match:', error);
      throw error;
    }
  };

  const useMatchMessages = (matchId: number) => {
    return useQuery<Message[], Error>({
      queryKey: ["matches", matchId, "messages"],
      queryFn: async () => {
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
      },
      refetchInterval: 3000,
      refetchIntervalInBackground: true,
      retry: false
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
          const errorData = await response.json().catch(() => ({ message: "Failed to send message" }));
          throw new Error(errorData.message);
        }

        return response.json();
      },
      onSuccess: (newMessage, { matchId }) => {
        queryClient.setQueryData<Message[]>(
          ["matches", matchId, "messages"],
          (old = []) => [...old, newMessage]
        );
      }
    });
  };

  const initiateMatch = async (targetId: string): Promise<Match> => {
    try {
      return await connect({ id: targetId });
    } catch (error) {
      console.error('Match initiation error:', {
        error,
        targetId,
        timestamp: new Date().toISOString()
      });

      toast({
        title: "Match Request Failed",
        description: error instanceof Error ? error.message : 'An unexpected error occurred',
        variant: "destructive",
        duration: 5000
      });

      throw error;
    }
  };

  return {
    matches: matchData.matches,
    requests: matchData.requests,
    isLoading: isLoadingMatches,
    isResponding,
    connect,
    respondToMatch,
    getMatch,
    initiateMatch,
    useMatchMessages,
    useSendMessage
  };
}