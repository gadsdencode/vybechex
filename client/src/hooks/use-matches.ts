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

export interface Match {
  id: number;
  username: string;
  name: string;
  personalityTraits: Record<string, number>;
  compatibilityScore: number;
  interests: Interest[];
  status: MatchStatus;
  avatar: string;
  createdAt: string;
  score: number;
  requester?: {
    id: number;
    username: string;
    name: string;
    avatar: string;
    personalityTraits: Record<string, number>;
    createdAt: string;
  };
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
  getMatch: (id: string) => Promise<MatchProfile>;
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
        console.log('Matches response:', data);

        if (!Array.isArray(data)) {
          console.error('Expected array but got:', typeof data, data);
          if (data?.data && Array.isArray(data.data)) {
            return data.data;
          }
          throw new Error('Invalid response format: expected an array');
        }
        
        return data;
      } catch (error) {
        return handleApiError(error, "Failed to Load Matches");
      }
    }
  });

  const { data: requests = [], isLoading: isLoadingRequests } = useQuery<Match[]>({
    queryKey: ["match-requests"],
    queryFn: async () => {
      try {
        const response = await fetch("/api/matches/requests", {
          credentials: 'include',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          }
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => null);
          if (response.status === 401) {
            console.error("User not authenticated");
            throw new Error("Please log in to view match requests");
          }
          if (response.status === 400) {
            console.error("Invalid user ID format", errorData);
            throw new Error("Invalid user ID format");
          }
          console.error("Failed to fetch match requests", errorData);
          throw new Error(errorData?.message || "Failed to fetch match requests");
        }

        const data = await response.json();
        console.log('Matches response:', data);

        if (!data || typeof data !== 'object') {
          throw new Error('Invalid response format');
        }

        // Handle both direct array response and wrapped response
        const matchesData = Array.isArray(data) ? data : (data.data || []);
        
        if (!Array.isArray(matchesData)) {
          throw new Error('Invalid matches data format');
        }

        // Validate and transform each match
        return matchesData.map(match => ({
          id: match.id,
          username: match.username || '',
          name: match.name || match.username || '',
          personalityTraits: match.personalityTraits || {},
          compatibilityScore: typeof match.compatibilityScore === 'number' ? match.compatibilityScore : (match.score || 0),
          interests: match.interests || [],
          status: match.status || 'requested',
          avatar: match.avatar || '/default-avatar.png',
          score: match.score || 0,
          createdAt: match.createdAt || new Date().toISOString(),
          requester: match.requester ? {
            id: match.requester.id,
            username: match.requester.username || '',
            name: match.requester.name || match.requester.username || '',
            avatar: match.requester.avatar || '/default-avatar.png',
            personalityTraits: match.requester.personalityTraits || {},
            createdAt: match.requester.createdAt || match.createdAt || new Date().toISOString()
          } : undefined
        }));
      } catch (error) {
        console.error('Match request error:', error);
        return handleApiError(error, "Failed to Load Match Requests");
      }
    },
    retry: (failureCount, error) => {
      if (error instanceof Error && error.message.includes("Please log in")) {
        return false;
      }
      return failureCount < 2;
    }
  });

  const { mutate: mutateMatch, isPending: isResponding } = useMutation<
    Match,
    Error,
    { matchId: number; status: 'accepted' | 'rejected' }
  >({
    mutationFn: async ({ matchId, status }) => {
      const response = await fetch(`/api/matches/${matchId}`, {
        method: 'PATCH',
        headers: { 
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        credentials: 'include',
        body: JSON.stringify({ status }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: "Failed to respond to match request" }));
        throw new Error(errorData.message);
      }

      return response.json();
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['matches'] });
      queryClient.invalidateQueries({ queryKey: ['match-requests'] });
      
      toast({
        title: variables.status === 'accepted' 
          ? 'Match request accepted!'
          : 'Match request rejected',
        description: variables.status === 'accepted'
          ? 'You can now start chatting with your new match.'
          : 'The match request has been declined.',
        variant: "default",
        duration: 5000,
      });
    },
    onError: (error) => {
      console.error('Error responding to match:', error);
      toast({
        title: "Failed to respond to match request",
        description: error.message,
        variant: "destructive",
        duration: 5000,
      });
    }
  });

  const respondToMatch = ({ matchId, status }: { matchId: number; status: 'accepted' | 'rejected' }) => {
    mutateMatch({ matchId, status });
  };

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

  const getMatch = async (id: string): Promise<MatchProfile> => {
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

      if (response.status === 401) {
        throw new Error('Please log in to view this profile');
      }

      if (response.status === 404) {
        throw new Error('User not found');
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: "Failed to fetch profile details" }));
        throw new Error(errorData.message);
      }

      return await response.json();
    } catch (error) {
      console.error('Profile fetching error:', error);
      throw error;
    }
  };

  const initiateMatch = async (targetId: string): Promise<Match> => {
    try {
      const response = await fetch(`/api/matches/${targetId}`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: "Failed to create match" }));
        throw new Error(errorData.message);
      }

      const newMatch = await response.json();
      
      // Invalidate queries to refetch updated data
      await queryClient.invalidateQueries({ queryKey: ["matches", parseInt(targetId)] });
      
      return newMatch;
    } catch (error) {
      console.error('Match creation error:', error);
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
    isLoading: isLoading || isLoadingRequests,
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
