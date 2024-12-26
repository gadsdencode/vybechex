import { useQuery, useMutation, useQueryClient, type UseQueryResult, type UseMutationResult } from "@tanstack/react-query";
import type { SelectUser } from "@db/schema";
import { useToast } from "@/hooks/use-toast";
import { getUserId } from '@/utils/auth';

export interface TraitInteraction {
  traits: (keyof PersonalityTraits)[];
  effect: number;
}

export interface Interest {
  name: string;
  score: number;
  category: 'personality' | 'hobby' | 'value';
  traitInteractions?: TraitInteraction[];
  avoidanceTraits?: {
    [K in keyof PersonalityTraits]?: number;
  };
}

export interface PersonalityTraits {
  extraversion: number;
  communication: number;
  openness: number;
  values: number;
  planning: number;
  sociability: number;
  agreeableness: number;
  conscientiousness: number;
  neuroticism: number;
  self_consciousness: number;
  introversion: number;
}

export type MatchStatus = 'none' | 'requested' | 'pending' | 'accepted' | 'rejected' | 'potential';

export interface Match {
  id: number;
  status: MatchStatus;
  createdAt: string;
  lastActivityAt: string;
  username?: string;
  name?: string;
  avatar?: string;
  personalityTraits?: Record<string, number>;
  interests?: Interest[];
  user: {
    id: number;
    personalityTraits: Record<string, number>;
    interests: Interest[];
  };
  score?: number;
  compatibilityScore?: number;
  matchExplanation?: string;
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

interface MatchesResponse {
  success: boolean;
  matches: {
    accepted: Match[];
    pending: Match[];
    requested: Match[];
    rejected: Match[];
  };
  totalMatches: number;
  acceptedMatches: number;
  potentialMatches: number;
}

interface MatchActionResponse {
  success: boolean;
  message?: string;
  match?: Match;
}

interface UseMatchesReturn {
  matches: Match[];
  requests: Match[];
  isLoading: boolean;
  isResponding: boolean;
  connect: (targetUserId: number) => Promise<Match>;
  respondToMatch: ({ matchId, status }: { matchId: number; status: 'accepted' | 'rejected' }) => void;
  getMatch: (id: string | number) => Promise<Match>;
  initiateMatch: (targetId: number) => Promise<Match>;
  useMatchMessages: (matchId: number) => UseQueryResult<Message[], Error>;
  useSendMessage: () => UseMutationResult<Message, Error, { matchId: number; content: string }, { previousMessages: Message[] }>;
}

export function useMatches(): UseMatchesReturn {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const userId = getUserId();

  const { data: matchData = { matches: [], requests: [] }, isLoading: isLoadingMatches } = useQuery<
    { matches: Match[]; requests: Match[] },
    Error
  >({
    queryKey: ['matches', userId],
    queryFn: async () => {
      try {
        if (!userId) {
          console.log('No user ID found, skipping matches fetch');
          return { matches: [], requests: [] };
        }

        console.log('Fetching matches for user:', userId);
        const response = await fetch('/api/matches', {
          credentials: 'include',
          headers: {
            'Accept': 'application/json',
            'Cache-Control': 'no-cache',
            'X-User-ID': userId.toString()
          }
        });

        if (!response.ok) {
          if (response.status === 401) {
            console.log('User not authenticated, invalidating user query');
            queryClient.invalidateQueries({ queryKey: ['user'] });
            window.location.href = '/login';
            return { matches: [], requests: [] };
          }
          const errorText = await response.text();
          throw new Error(`Failed to fetch matches: ${errorText}`);
        }

        const data = await response.json();
        console.log('Raw matches data:', data);

        if (!data.success) {
          throw new Error('Failed to fetch matches');
        }

        // Normalize match data
        const normalizeMatch = (match: any): Match => ({
          id: match.id,
          status: match.status,
          createdAt: match.createdAt,
          lastActivityAt: match.lastActivityAt || match.createdAt,
          username: match.user?.username || match.username || '',
          name: match.user?.name || match.name || '',
          avatar: match.user?.avatar || match.avatar || '',
          personalityTraits: match.user?.personalityTraits || match.personalityTraits || {},
          interests: match.user?.interests || match.interests || [],
          user: {
            id: match.user?.id || match.userId || 0,
            personalityTraits: match.user?.personalityTraits || match.personalityTraits || {},
            interests: match.user?.interests || match.interests || []
          },
          score: match.score || 0,
          compatibilityScore: match.compatibilityScore || 0,
          matchExplanation: match.matchExplanation || ''
        });

        // Handle the grouped matches format
        const allMatches = [
          ...(data.matches?.accepted || []),
          ...(data.matches?.potential || [])
        ].map(match => normalizeMatch({
          ...match,
          status: match.status || (data.matches?.accepted?.includes(match) ? 'accepted' : 'potential')
        }));

        // Handle requests (pending and requested matches)
        const allRequests = [
          ...(data.matches?.pending || []),
          ...(data.matches?.requested || [])
        ].map(match => normalizeMatch({
          ...match,
          status: match.status || (data.matches?.pending?.includes(match) ? 'pending' : 'requested')
        }));

        console.log('Processed matches:', allMatches);
        console.log('Processed requests:', allRequests);
        console.log('API response data:', data);

        return { 
          matches: allMatches, 
          requests: allRequests 
        };
      } catch (error) {
        console.error('Error fetching matches:', error);
        toast({
          title: 'Error fetching matches',
          description: error instanceof Error ? error.message : 'An unexpected error occurred',
          variant: 'destructive'
        });
        throw error;
      }
    },
    enabled: !!userId,
    staleTime: 1000 * 30,
    retry: (failureCount, error) => {
      if (error instanceof Error && (
        error.message.includes('401') || 
        error.message.includes('Session expired')
      )) {
        window.location.href = '/login';
        return false;
      }
      return failureCount < 3;
    },
  });

  const { mutate: respondToMatch, isPending: isResponding } = useMutation<
    MatchActionResponse,
    Error,
    { matchId: number; status: 'accepted' | 'rejected' }
  >({
    mutationFn: async ({ matchId, status }) => {
      if (!matchId) throw new Error('Match ID is required');
      if (isNaN(matchId) || matchId <= 0) throw new Error('Invalid match ID');
      if (!userId) throw new Error('User must be logged in');

      // First verify the match still exists and is valid
      const verifyResponse = await fetch(`/api/matches/${matchId}`, {
        credentials: 'include',
        headers: {
          'Accept': 'application/json',
          'Cache-Control': 'no-cache',
          'X-User-ID': userId.toString()
        }
      });

      if (!verifyResponse.ok) {
        if (verifyResponse.status === 404) {
          throw new Error('Match request no longer available');
        }
        throw new Error('Failed to verify match request');
      }

      // Then process the response
      const response = await fetch(`/api/matches/${matchId}`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Cache-Control': 'no-cache',
          'X-User-ID': userId.toString()
        },
        body: JSON.stringify({ status, userId })
      });

      if (response.status === 401) {
        queryClient.invalidateQueries({ queryKey: ['user'] });
        window.location.href = '/login';
        throw new Error('Session expired. Please log in again.');
      }

      if (response.status === 404) {
        queryClient.invalidateQueries({ queryKey: ['matches'] });
        throw new Error('Match request no longer available');
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to respond to match request');
      }

      const data = await response.json() as MatchActionResponse;
      if (!data.success) {
        throw new Error(data.message || 'Failed to process match request');
      }

      return data;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['matches'] });

      const messages = {
        accepted: {
          title: "Match Accepted!",
          description: "You can now start chatting with your new match!"
        },
        rejected: {
          title: "Request Declined",
          description: "The match request has been declined."
        }
      } as const;

      const message = messages[variables.status];

      toast({
        title: message.title,
        description: message.description
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const connect = async (targetUserId: number): Promise<Match> => {
    if (!targetUserId) throw new Error('Target user ID is required');
    if (isNaN(targetUserId) || targetUserId <= 0) throw new Error('Invalid target user ID');
    if (!userId) throw new Error('User must be logged in');

    try {
      console.log('Creating match with target user:', targetUserId);
      
      const response = await fetch('/api/matches', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Cache-Control': 'no-cache',
          'X-User-ID': userId.toString()
        },
        body: JSON.stringify({ targetUserId })
      });

      if (response.status === 401) {
        console.error('Authentication error creating match');
        throw new Error('Please log in to create a match');
      }

      if (response.status === 404) {
        console.error('Target user not found');
        throw new Error('Selected user is no longer available');
      }

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        console.error('Error response from server:', error);
        throw new Error(error.message || 'Failed to create match');
      }

      const data = await response.json();
      console.log('Match creation response:', data);

      if (!data.success) {
        throw new Error(data.message || 'Failed to create match');
      }

      if (!data.match) {
        throw new Error('No match data received from server');
      }

      // Transform the response to match the Match interface
      const match: Match = {
        id: data.match.id,
        status: data.match.status,
        createdAt: data.match.createdAt,
        lastActivityAt: data.match.lastActivityAt || data.match.createdAt,
        username: data.match.user?.username || '',
        name: data.match.user?.name || '',
        avatar: data.match.user?.avatar || '',
        personalityTraits: data.match.user?.personalityTraits || {},
        interests: data.match.user?.interests || [],
        user: {
          id: data.match.user?.id || 0,
          personalityTraits: data.match.user?.personalityTraits || {},
          interests: data.match.user?.interests || []
        }
      };

      // Invalidate matches query to refetch the updated list
      await queryClient.invalidateQueries({ queryKey: ['matches'] });

      return match;
    } catch (error) {
      console.error('Error in connect function:', error);
      throw error;
    }
  };

  const getMatch = async (id: string | number): Promise<Match> => {
    try {
      if (!id) throw new Error('Match ID is required');
      if (!userId) throw new Error('User must be logged in');

      const matchId = typeof id === 'string' ? parseInt(id) : id;
      if (isNaN(matchId) || matchId <= 0) {
        throw new Error('Invalid match ID format');
      }

      const response = await fetch(`/api/matches/${matchId}`, {
        credentials: 'include',
        headers: {
          'Accept': 'application/json',
          'Cache-Control': 'no-cache',
          'X-User-ID': userId.toString()
        }
      });

      if (response.status === 401) {
        queryClient.invalidateQueries({ queryKey: ['user'] });
        window.location.href = '/login';
        throw new Error('Session expired. Please log in again.');
      }

      if (response.status === 404) {
        throw new Error('Match not found');
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to fetch match profile');
      }

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.message || 'Failed to fetch match');
      }

      // Transform the response to match the Match interface
      const match = data.data;
      return {
        id: match.id,
        status: match.status,
        createdAt: match.createdAt,
        lastActivityAt: match.lastActivityAt || match.createdAt,
        user: {
          id: match.userId1 === userId ? match.userId2 : match.userId1,
          personalityTraits: match.personalityTraits || {},
          interests: match.interests || []
        }
      };
    } catch (error) {
      console.error('Error fetching match:', error);
      throw error;
    }
  };

  const useMatchMessages = (matchId: number) => {
    return useQuery<Message[], Error>({
      queryKey: ["matches", matchId, "messages"],
      queryFn: async () => {
        if (!userId) throw new Error('User must be logged in');
        if (!matchId) throw new Error('Match ID is required');

        const response = await fetch(`/api/matches/${matchId}/messages`, {
          credentials: 'include',
          headers: {
            'Accept': 'application/json',
            'Cache-Control': 'no-cache',
            'X-User-ID': userId.toString()
          }
        });

        if (response.status === 401) {
          queryClient.invalidateQueries({ queryKey: ['user'] });
          window.location.href = '/login';
          throw new Error('Session expired. Please log in again.');
        }

        if (response.status === 404) {
          throw new Error('Match not found');
        }

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ message: "Failed to fetch messages" }));
          throw new Error(errorData.message);
        }

        const data = await response.json();
        console.log('Fetched messages response:', data);

        if (!data.success) {
          throw new Error(data.message || 'Failed to fetch messages');
        }

        // Messages are under the 'messages' key in the response
        if (!Array.isArray(data.messages)) {
          console.error('Invalid messages format:', data);
          return [];
        }

        // Transform messages to ensure consistent format
        const messages = data.messages.map((msg: any) => ({
          id: msg.id,
          matchId: msg.matchId,
          senderId: msg.senderId,
          content: msg.content,
          createdAt: new Date(msg.createdAt),
          analyzed: msg.analyzed || null,
          sentiment: msg.sentiment || null
        }));

        console.log('Transformed messages:', messages);
        return messages;
      },
      enabled: !!matchId && !!userId,
      refetchInterval: 3000,
      refetchIntervalInBackground: true,
      staleTime: 0, // Consider all data immediately stale
      gcTime: 1000 * 60 * 5, // Keep cache for 5 minutes
      retry: (failureCount, error) => {
        if (error.message.includes('Session expired') || 
            error.message.includes('Match not found')) {
          return false;
        }
        return failureCount < 3;
      }
    });
  };

  const useSendMessage = () => {
    type MutationContext = {
      previousMessages: Message[];
    };

    return useMutation<Message, Error, { matchId: number; content: string }, MutationContext>({
      mutationFn: async ({ matchId, content }) => {
        if (!userId) throw new Error('User must be logged in');
        if (!matchId) throw new Error('Match ID is required');
        if (!content.trim()) throw new Error('Message content is required');

        const response = await fetch(`/api/matches/${matchId}/messages`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "X-User-ID": userId.toString()
          },
          credentials: 'include',
          body: JSON.stringify({ content: content.trim() }),
        });

        if (response.status === 401) {
          queryClient.invalidateQueries({ queryKey: ['user'] });
          window.location.href = '/login';
          throw new Error('Session expired. Please log in again.');
        }

        if (response.status === 404) {
          throw new Error('Match not found');
        }

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ message: "Failed to send message" }));
          throw new Error(errorData.message || "Failed to send message");
        }

        const data = await response.json();
        console.log('Message response:', data);

        if (!data.success) {
          throw new Error(data.message || 'Failed to send message');
        }

        // The message can be under either 'message' or 'data' key
        const messageData = data.message || data.data;
        
        // Ensure the response has the required message fields
        if (!messageData?.id || !messageData?.content) {
          console.error('Invalid message response:', data);
          throw new Error('Invalid message format received from server');
        }

        // Transform the message data to match the Message interface
        const message: Message = {
          id: messageData.id,
          matchId: messageData.matchId || matchId,
          senderId: messageData.senderId || userId,
          content: messageData.content,
          createdAt: new Date(messageData.createdAt),
          analyzed: messageData.analyzed || null,
          sentiment: messageData.sentiment || null
        };

        console.log('Transformed sent message:', message);
        return message;
      },
      onMutate: async ({ matchId, content }): Promise<MutationContext> => {
        // Cancel any outgoing refetches
        await queryClient.cancelQueries({ queryKey: ["matches", matchId, "messages"] });

        // Snapshot the previous value
        const previousMessages = queryClient.getQueryData<Message[]>(["matches", matchId, "messages"]) || [];
        console.log('Previous messages before mutation:', previousMessages);

        // Create optimistic message
        const optimisticMessage: Message = {
          id: -Date.now(), // temporary negative ID to distinguish from real messages
          matchId,
          senderId: userId!,
          content,
          createdAt: new Date(),
          analyzed: null,
          sentiment: null
        };

        // Optimistically update the cache
        const updatedMessages = [...previousMessages, optimisticMessage];
        console.log('Optimistically updated messages:', updatedMessages);
        
        queryClient.setQueryData<Message[]>(
          ["matches", matchId, "messages"],
          updatedMessages
        );

        return { previousMessages };
      },
      onError: (err, { matchId }, context) => {
        console.error('Error sending message:', err);
        // Revert to previous messages on error
        if (context) {
          console.log('Reverting to previous messages:', context.previousMessages);
          queryClient.setQueryData(["matches", matchId, "messages"], context.previousMessages);
        }
        toast({
          title: "Error sending message",
          description: err.message || "Failed to send message",
          variant: "destructive"
        });
      },
      onSuccess: (newMessage, { matchId }) => {
        // Update cache with the confirmed message
        queryClient.setQueryData<Message[]>(
          ["matches", matchId, "messages"],
          old => {
            const messages = old || [];
            console.log('Updating cache with new message:', { old: messages, new: newMessage });
            // Remove any optimistic updates for this message
            const filteredMessages = messages.filter(msg => 
              msg.id > 0 // Keep only real messages (positive IDs)
            );
            return [...filteredMessages, newMessage];
          }
        );
      },
      onSettled: (_, __, { matchId }) => {
        // Always refetch after settling to ensure consistency
        queryClient.invalidateQueries({
          queryKey: ["matches", matchId, "messages"],
          exact: true,
          refetchType: 'all'
        });
      }
    });
  };

  const initiateMatch = async (targetId: number): Promise<Match> => {
    try {
      return await connect(targetId);
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