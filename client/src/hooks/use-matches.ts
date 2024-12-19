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

type MatchStatus = 'none' | 'requested' | 'pending' | 'accepted' | 'rejected';

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
  name?: string;
  personalityTraits: Record<string, number>;
  avatar?: string;
  createdAt: string;
  status: MatchStatus;
  score?: number;
  compatibilityScore?: number;
  matchExplanation?: string;
  scoreBreakdown?: {
    overall: number;
    components: {
      personality: number;
      communication: number;
      social: number;
      activity: number;
    };
    details: {
      personalityBreakdown: Record<string, number>;
    };
  };
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
        const response = await fetch('/api/matches', {
          credentials: 'include',
          headers: {
            'Accept': 'application/json',
            'Authorization': `Bearer ${getAuthToken()}`
          }
        });
        if (!response.ok) {
          throw new Error('Failed to fetch matches');
        }
        console.log('Matches response:', await response.clone().json());
        const data = await response.json();
        // The server returns the matches array directly
        return Array.isArray(data) ? data : [];
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
          console.log('Missing user ID');
          return [];
        }

        const authToken = getAuthToken();
        if (!authToken) {
          console.log('No auth token found');
          return [];
        }

        const response = await fetch('/api/matches/requests', {
          method: 'GET',
          credentials: 'include',
          headers: {
            'Accept': 'application/json',
            'Authorization': `Bearer ${authToken}`
          }
        });

        if (!response.ok) {
          if (response.status === 401) {
            console.log('Unauthorized request');
            return [];
          }

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
      // Input validation with detailed error messages
      if (!matchId) {
        throw new Error('Match ID is required');
      }
      
      if (isNaN(matchId) || matchId <= 0) {
        throw new Error('Invalid match ID: must be a positive number');
      }

      if (!status) {
        throw new Error('Status is required');
      }

      if (!['accepted', 'rejected'].includes(status)) {
        throw new Error('Invalid status: must be either "accepted" or "rejected"');
      }

      let retries = 3;
      let lastError: Error | null = null;

      while (retries > 0) {
        try {
          const response = await fetch(`/api/matches/${matchId}`, {
            method: 'POST',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              'Authorization': `Bearer ${getAuthToken()}`
            },
            body: JSON.stringify({ status })
          });

          let responseData;
          try {
            responseData = await response.json();
          } catch (parseError) {
            console.error('Error parsing response:', parseError);
            throw new Error('Server response was not in the expected format');
          }

          if (!response.ok) {
            const errorMessage = responseData?.message || 'An error occurred while processing the match request';
            
            switch (response.status) {
              case 400:
                throw new Error(`Invalid request: ${errorMessage}`);
              case 401:
                throw new Error('Please log in to respond to match requests');
              case 403:
                throw new Error('You do not have permission to respond to this match request');
              case 404:
                throw new Error('Match request not found');
              case 409:
                throw new Error('This match request has already been processed');
              case 429:
                throw new Error('Too many requests. Please try again later.');
              case 500:
                // Server errors are retryable
                throw new Error('Server error occurred. Retrying...');
              default:
                throw new Error(`${errorMessage} (Status: ${response.status})`);
            }
          }

          return responseData;
        } catch (error) {
          console.error(`Match response error (attempt ${4 - retries}/3):`, error);
          lastError = error instanceof Error ? error : new Error('Unknown error occurred');
          
          // Only retry on network errors or 5xx server errors
          if (error instanceof Error && error.name === 'TypeError' || 
              (error as any).status >= 500) {
            retries--;
            if (retries > 0) {
              await new Promise(resolve => setTimeout(resolve, 1000 * (4 - retries)));
              continue;
            }
          } else {
            // Don't retry on client errors
            throw lastError;
          }
        }
      }

      throw lastError || new Error('Failed to respond to match request after multiple attempts');
    },
    onSuccess: (data, variables) => {
      // Invalidate both match requests and matches queries
      queryClient.invalidateQueries({ queryKey: ['match-requests'] });
      queryClient.invalidateQueries({ queryKey: ['matches'] });

      // Show appropriate success message based on the response
      const successMessages = {
        accepted: {
          title: "Match Accepted! 🎉",
          description: "You can now start chatting with your new match!",
        },
        rejected: {
          title: "Request Declined",
          description: "The match request has been declined.",
        }
      };

      const message = successMessages[variables.status];
      toast({
        title: message.title,
        description: message.description,
        variant: "default",
        duration: 5000
      });

      // Update local cache optimistically
      queryClient.setQueryData(['match-requests'], (oldData: any) => {
        if (!oldData) return oldData;
        return oldData.filter((request: any) => request.id !== variables.matchId);
      });
    },
    onError: (error, variables, context) => {
      console.error('Match response error:', {
        error,
        matchId: variables.matchId,
        status: variables.status
      });

      // Show detailed error message
      toast({
        title: "Unable to Process Match Request",
        description: error instanceof Error 
          ? error.message 
          : "There was a problem processing your response. Please try again.",
        variant: "destructive",
        duration: 7000
      });

      // Revert optimistic update if needed
      if (context) {
        queryClient.setQueryData(['match-requests'], context);
      }
    },
    // Add retry configuration
    retry: (failureCount, error) => {
      // Only retry on network errors or 5xx server errors
      if (error instanceof Error && error.name === 'TypeError' || 
          (error as any).status >= 500) {
        return failureCount < 3;
      }
      return false;
    },
    retryDelay: (attemptIndex) => Math.min(1000 * (attemptIndex + 1), 3000),
  });

  const connect = async ({ id }: { id: string }): Promise<Match> => {
    try {
      // Input validation with detailed error messages
      if (!id) {
        throw new Error('User ID is required');
      }

      // Get current user ID first to ensure we're authenticated
      const currentUserId = getUserId();
      if (!currentUserId) {
        throw new Error('Authentication required');
      }

      // Get auth token and validate it
      const authToken = getAuthToken();
      if (!authToken) {
        // Force refresh auth state
        queryClient.invalidateQueries({ queryKey: ['user'] });
        console.error('No auth token found when attempting to connect');
        throw new Error('Authentication required');
      }
      
      const parsedId = parseInt(id);
      if (isNaN(parsedId) || parsedId <= 0) {
        throw new Error('Invalid user ID: must be a positive number');
      }

      let retries = 3;
      let lastError: Error | null = null;

      while (retries > 0) {
        try {
          // Get current user ID first
          const currentUserId = getUserId();
          if (!currentUserId) {
            throw new Error('Authentication required');
          }

          // Check authentication token
          const authToken = getAuthToken();
          if (!authToken) {
            console.error('No auth token found when attempting to connect');
            throw new Error('Authentication required');
          }

          // Prepare request payload with proper typing
          // Prepare match request payload with all required fields
          const matchData = {
            user_id_1: currentUserId,
            user_id_2: parsedId,
            match_type: 'request' as const,
            status: 'requested' as const,
            score: 0,
            created_at: new Date().toISOString(),
            last_activity_at: new Date().toISOString(),
            verification_code: null,
            verified_at: null
          };

          console.log('Sending match request with data:', matchData);

      const response = await fetch('/api/matches', {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              'Authorization': `Bearer ${authToken}`
            },
            credentials: 'include',
            body: JSON.stringify(matchData)
          });

          let responseData;
          try {
            responseData = await response.json();
          } catch (parseError) {
            console.error('Error parsing response:', parseError);
            throw new Error('Server response was not in the expected format');
          }

          if (!response.ok) {
            // Enhanced error logging
            console.error('Match request failed:', {
              status: response.status,
              statusText: response.statusText,
              data: responseData,
              requestData: matchData,
              timestamp: new Date().toISOString()
            });

            // Check for specific database errors
            if (responseData?.error?.code === '42703') {
              console.error('Database column error:', responseData.error);
              throw new Error('Database configuration error. Please try again later.');
            }

            const errorMessage = responseData?.message || 'An error occurred while processing the match request';
            
            switch (response.status) {
              case 400:
                throw new Error(`Invalid request: ${errorMessage}`);
              case 401:
                queryClient.invalidateQueries({ queryKey: ['user'] });
                throw new Error('Authentication required. Please log in again.');
              case 403:
                throw new Error('You do not have permission to initiate matches');
              case 404:
                throw new Error('User not found');
              case 409:
                throw new Error('A match already exists with this user');
              case 422:
                throw new Error('Please complete your profile before matching');
              case 429:
                throw new Error('Too many requests. Please try again later.');
              case 500:
                console.error('Server error details:', responseData);
                throw new Error('Server configuration error. Please try again later.');
              default:
                throw new Error(`${errorMessage} (Status: ${response.status})`);
            }
          }

          // Success handling with type checking
          if (!responseData.success || !responseData.data?.match) {
            throw new Error('Invalid response format from server');
          }

          const { match } = responseData.data;
          queryClient.invalidateQueries({ queryKey: ['matches'] });

          // Show appropriate toast messages
          const toastMessages = {
            created: {
              title: "Match Request Sent ✨",
              description: "We'll notify you when they respond!",
              variant: "default" as const
            },
            accepted: {
              title: "Match Connected! 🎉",
              description: "You can now start chatting!",
              variant: "default" as const
            },
            pending: {
              title: "Request Pending ⏳",
              description: "Your request is still waiting for a response.",
              variant: "default" as const
            }
          };

          const type = match.status === 'accepted' ? 'accepted' :
                      match.status === 'requested' ? 'created' : 'pending';

          toast(toastMessages[type]);
          return match;
        } catch (error) {
          console.error(`Match initiation error (attempt ${4 - retries}/3):`, error);
          lastError = error instanceof Error ? error : new Error('Unknown error occurred');
          
          // Only retry on network errors or 5xx server errors
          if (error instanceof Error && 
              (error.name === 'TypeError' || error.message.includes('Server error occurred'))) {
            retries--;
            if (retries > 0) {
              await new Promise(resolve => setTimeout(resolve, 1000 * (4 - retries)));
              continue;
            }
          }
          throw lastError;
        }
      }

      throw lastError || new Error('Failed to initiate match after multiple attempts');
    } catch (error) {
      // Enhanced error handling with detailed logging
      console.error('Match initiation error:', {
        error,
        id,
        timestamp: new Date().toISOString()
      });

      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
      
      toast({
        title: "Connection Failed",
        description: errorMessage,
        variant: "destructive",
        duration: 5000
      });

      throw error;
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
      // Input validation with detailed error messages
      if (!targetId) {
        throw new Error('User ID is required');
      }
      
      const parsedId = parseInt(targetId);
      if (isNaN(parsedId) || parsedId <= 0) {
        throw new Error('Invalid user ID: must be a positive number');
      }

      let retries = 3;
      let lastError: Error | null = null;

      while (retries > 0) {
        try {
          const response = await fetch('/api/matches', {
            method: 'POST',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              'Authorization': `Bearer ${getAuthToken()}`
            },
            body: JSON.stringify({
              userId2: parsedId
            })
          });

          let data;
          try {
            data = await response.json();
          } catch (parseError) {
            console.error('Error parsing response:', parseError);
            throw new Error('Server response was not in the expected format');
          }

          if (!response.ok) {
            const errorMessage = data?.message || 'An error occurred while initiating the match';
            
            switch (response.status) {
              case 400:
                throw new Error(`Invalid request: ${errorMessage}`);
              case 401:
                throw new Error('Please log in to initiate matches');
              case 403:
                throw new Error('You do not have permission to initiate matches');
              case 404:
                throw new Error('User not found');
              case 409:
                throw new Error('A match already exists with this user');
              case 422:
                throw new Error('Please complete your profile before matching');
              case 429:
                throw new Error('Too many requests. Please try again later.');
              case 500:
                // Server errors are retryable
                throw new Error('Server error occurred. Retrying...');
              default:
                throw new Error(`${errorMessage} (Status: ${response.status})`);
            }
          }

          // Success handling with type checking
          if (!data.success || !data.data?.match) {
            throw new Error('Invalid response format from server');
          }

          const { type, match } = data.data;
          queryClient.invalidateQueries({ queryKey: ['matches'] });

          // Enhanced status messages with more context
          const toastMessages = {
            created: {
              title: "Match Request Sent ✨",
              description: "We'll notify you when they respond!",
              variant: "default" as const
            },
            updated: {
              title: "Match Accepted! 🎉",
              description: "You can now start chatting!",
              variant: "default" as const
            },
            pending: {
              title: "Request Pending ⏳",
              description: "Your request is still waiting for a response.",
              variant: "default" as const
            },
            existing: {
              title: "Already Connected",
              description: "You're already connected with this user.",
              variant: "default" as const
            }
          };

          const message = toastMessages[type as keyof typeof toastMessages];
          if (message) {
            toast({
              ...message,
              duration: 5000,
            });
          }

          return match;
        } catch (error) {
          console.error(`Match initiation error (attempt ${4 - retries}/3):`, error);
          lastError = error instanceof Error ? error : new Error('Unknown error occurred');
          
          // Only retry on network errors or 5xx server errors
          if (error instanceof Error && error.name === 'TypeError' || 
              (error as any).status >= 500) {
            retries--;
            if (retries > 0) {
              await new Promise(resolve => setTimeout(resolve, 1000 * (4 - retries)));
              continue;
            }
          } else {
            // Don't retry on client errors
            throw lastError;
          }
        }
      }

      throw lastError || new Error('Failed to initiate match after multiple attempts');
    } catch (error) {
      // Enhanced error handling with detailed logging
      console.error('Match initiation error:', {
        error,
        targetId,
        timestamp: new Date().toISOString()
      });

      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
      
      toast({
        title: "Match Request Failed",
        description: errorMessage,
        variant: "destructive",
        duration: 5000
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