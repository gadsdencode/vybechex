import { setUserData, setUserId, clearAuthData } from '@/utils/auth';
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SelectUser } from "@db/schema";
import { useToast } from "@/hooks/use-toast";

interface AuthCredentials {
  username: string;
  password: string;
}

interface AuthResponse {
  success: boolean;
  message: string;
  user: {
    id: number;
    username: string;
    name?: string;
    quizCompleted?: boolean;
    isGroupCreator?: boolean;
    avatar?: string;
  };
}

async function handleAuthRequest(
  url: string,
  credentials: AuthCredentials
): Promise<AuthResponse> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(credentials),
      credentials: "include",
    });

    let parsedData;
    const responseData = await response.text();

    try {
      parsedData = JSON.parse(responseData);
      console.log('Auth response:', parsedData);
    } catch (e) {
      console.error('Failed to parse response:', responseData);
      throw new Error(responseData || "Invalid server response");
    }

    if (!response.ok) {
      const errorMessage = parsedData?.message || parsedData?.error || "Authentication failed";
      console.error(`Auth request failed (${response.status}):`, errorMessage);
      throw new Error(errorMessage);
    }

    if (!parsedData.success || !parsedData.user) {
      throw new Error("Invalid response format from server");
    }

    return parsedData;
  } catch (error) {
    console.error("Auth request error:", error);
    throw error instanceof Error ? error : new Error("Authentication failed");
  }
}

export function useUser() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: user, isLoading } = useQuery<SelectUser | null>({
    queryKey: ['/api/user'],
    queryFn: async () => {
      try {
        console.log('Fetching user data...');
        const response = await fetch("/api/user", {
          credentials: "include",
          headers: {
            'Accept': 'application/json',
            'Cache-Control': 'no-cache'
          }
        });

        if (response.status === 401) {
          console.log("User not authenticated");
          // Don't clear auth data here, just return null
          return null;
        }

        if (!response.ok) {
          console.error("Failed to fetch user:", response.status, response.statusText);
          const errorText = await response.text();
          throw new Error(`Failed to fetch user: ${errorText}`);
        }

        const userData = await response.json();
        console.log("User data fetched:", userData);

        if (userData?.user) {
          const user = userData.user;
          setUserId(user.id);
          setUserData({
            id: user.id,
            username: user.username,
            name: user.name || user.username,
            avatar: user.avatar,
            isGroupCreator: user.isGroupCreator || false,
            quizCompleted: user.quizCompleted || false
          });
          return user;
        }

        return null;
      } catch (error) {
        console.error("Error in user fetch:", error);
        // Don't clear auth data on network errors
        return null;
      }
    },
    staleTime: 1000 * 60,
    gcTime: 1000 * 60 * 5,
    refetchOnWindowFocus: true,
    retry: (failureCount, error) => {
      // Retry up to 3 times, but not for 401 errors
      if (error instanceof Error && error.message.includes('401')) {
        return false;
      }
      return failureCount < 3;
    },
  });

  const loginMutation = useMutation({
    mutationFn: async (credentials: AuthCredentials) => {
      try {
        const response = await handleAuthRequest("/api/login", credentials);
        console.log("Login successful:", response);

        if (response.success) {
          const { user } = response;

          setUserId(user.id);
          setUserData({
            id: user.id,
            username: user.username,
            name: user.name || user.username,
            avatar: user.avatar,
            isGroupCreator: user.isGroupCreator || false
          });

          // Invalidate and refetch relevant queries
          queryClient.invalidateQueries({ queryKey: ['/api/user'] });
          queryClient.invalidateQueries({ queryKey: ['/api/matches'] });

          return { ok: true, user };
        }

        throw new Error(response.message || "Login failed");
      } catch (error) {
        console.error("Login error:", error);
        clearAuthData();
        throw error;
      }
    },
    onSuccess: (data) => {
      console.log("Login successful:", data);
      toast({
        title: "Welcome back!",
        description: "You have been successfully logged in.",
      });
    },
    onError: (error: Error) => {
      console.error("Login error:", error);
      clearAuthData();
      toast({
        title: "Login failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (credentials: AuthCredentials) => {
      const response = await handleAuthRequest("/api/register", credentials);
      return { ...response, ok: true };
    },
    onSuccess: (data) => {
      console.log("Registration successful:", data);
      queryClient.setQueryData(["/api/user"], data.user);
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      toast({
        title: "Registration successful",
        description: "Your account has been created.",
      });
    },
    onError: (error: Error) => {
      console.error("Registration error:", error);
      toast({
        title: "Registration failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/logout", {
        method: "POST",
        credentials: "include",
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Logout failed:", response.status, errorText);
        throw new Error(errorText || "Logout failed");
      }

      clearAuthData();
      return response.json();
    },
    onSuccess: () => {
      queryClient.setQueryData(["/api/user"], null);
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      toast({
        title: "Logged out",
        description: "You have been successfully logged out.",
      });
    },
    onError: (error: Error) => {
      console.error("Logout error:", error);
      toast({
        title: "Logout failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return {
    user,
    isLoading,
    login: loginMutation.mutateAsync,
    register: registerMutation.mutateAsync,
    logout: logoutMutation.mutateAsync,
  };
}