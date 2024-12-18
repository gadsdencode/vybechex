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
  score: number;
  createdAt: string;
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
          credentials: 'include',
          headers: {
            'Accept': 'application/json',
            'Cache-Control': 'no-cache'
          }
        });

        if (response.status === 401) {
          throw new Error("Please log in to view matches");
        }

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ message: "Failed to fetch matches" }));
          throw new Error(errorData.message || "Failed to fetch matches");
        }

        const data = await response.json();
        console.log('Matches response:', data);

        // Handle both array response and wrapped response formats
        const matchesData = Array.isArray(data) ? data : (data.data || []);
        
        if (!Array.isArray(matchesData)) {
          console.error('Invalid response format:', typeof matchesData, matchesData);
          throw new Error('Invalid matches data format');
        }

        // Validate and transform each match object
        return matchesData.map(match => ({
          id: Number(match.id),
          username: match.username || '',
          name: match.name || match.username || '',
          personalityTraits: match.personalityTraits || {},
          compatibilityScore: typeof match.compatibilityScore === 'number' ? match.compatibilityScore : (match.score || 0),
          interests: match.interests || [],
          status: match.status || 'pending',
          avatar: match.avatar || '/default-avatar.png',
          score: match.score || 0,
          createdAt: match.createdAt || new Date().toISOString()
        }));
      } catch (error) {
        console.error('Match fetching error:', error);
        throw error;
      }
    },
    retry: (failureCount, error) => {
      if (error instanceof Error && error.message.includes("Please log in")) {
        return false;
      }
      return failureCount < 2;
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
          console.error("Failed to fetch match requests", errorData);
          throw new Error(errorData?.message || "Failed to fetch match requests");
        }

        const data = await response.json();
        console.log('Match requests response:', data);

        // Handle both direct array response and wrapped response
        const matchesData = Array.isArray(data) ? data : (data.data || []);
        
        if (!Array.isArray(matchesData)) {
          console.error('Invalid response format:', typeof matchesData, matchesData);
          throw new Error('Invalid match requests data format');
        }

        // Validate and transform each match with strict type checking
        const validMatches = matchesData
          .map(match => {
            try {
              if (!match || typeof match !== 'object') {
                console.error('Invalid match object:', match);
                return null;
              }

              const id = Number(match.id);
              if (isNaN(id)) {
                console.error('Invalid match ID:', match.id);
                return null;
              }

              const transformedMatch: Match = {
                id: Number(match.id),
                username: String(match.username || ''),
                name: String(match.name || match.username || ''),
                personalityTraits: match.personalityTraits && typeof match.personalityTraits === 'object' 
                  ? match.personalityTraits 
                  : {},
                compatibilityScore: Number(match.compatibilityScore || match.score || 0),
                interests: Array.isArray(match.interests) ? match.interests : [],
                status: match.status && ['requested', 'pending', 'accepted', 'rejected'].includes(match.status) 
                  ? match.status as MatchStatus 
                  : 'pending',
                avatar: String(match.avatar || '/default-avatar.png'),
                score: Number(match.score || 0),
                createdAt: match.createdAt ? new Date(match.createdAt).toISOString() : new Date().toISOString()
              };

              if (match.requester) {
                transformedMatch.requester = {
                  id: Number(match.requester.id),
                  username: String(match.requester.username || ''),
                  name: String(match.requester.name || match.requester.username || ''),
                  avatar: String(match.requester.avatar || '/default-avatar.png'),
                  personalityTraits: typeof match.requester.personalityTraits === 'object' ? match.requester.personalityTraits : {},
                  createdAt: match.requester.createdAt ? String(match.requester.createdAt) : new Date().toISOString()
                };
              }

              return transformedMatch;
            } catch (err) {
              console.error('Error transforming match:', match, err);
              return null;
            }
          })
          .filter((match): match is Match => match !== null);

        console.log('Transformed matches:', validMatches);
        return validMatches;
      } catch (error) {
        console.error('Match request error:', error);
        throw error;
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
      // Validate ID before making request
      const parsedId = parseInt(id, 10);
      if (isNaN(parsedId) || parsedId <= 0) {
        throw new Error('Invalid user ID. Please provide a valid positive number.');
      }

      const response = await fetch(`/api/matches/${parsedId}`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        credentials: 'include'
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to connect' }));
        throw new Error(errorData.message || 'Failed to establish connection');
      }

      const data = await response.json();
      
      // Validate response data
      if (!data || typeof data !== 'object') {
        throw new Error('Invalid response format from server');
      }

      // Transform and validate match data
      const match: Match = {
        id: Number(data.id),
        username: String(data.username || ''),
        name: String(data.name || data.username || ''),
        personalityTraits: typeof data.personalityTraits === 'object' ? data.personalityTraits : {},
        compatibilityScore: Number(data.compatibilityScore || data.score || 0),
        interests: Array.isArray(data.interests) ? data.interests : [],
        status: data.status && ['requested', 'pending', 'accepted', 'rejected'].includes(data.status) 
          ? data.status as MatchStatus 
          : 'pending',
        avatar: String(data.avatar || '/default-avatar.png'),
        score: Number(data.score || 0),
        createdAt: data.createdAt ? new Date(data.createdAt).toISOString() : new Date().toISOString()
      };

      // Invalidate queries to refresh data
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