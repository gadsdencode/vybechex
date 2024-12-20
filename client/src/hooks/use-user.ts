import { setUserData, setUserId, setAuthToken, clearAuthData, getAuthToken } from '@/utils/auth';
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
  token?: string;
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

    // Store auth token immediately if present
    if (parsedData.token) {
      setAuthToken(parsedData.token);
      console.log('Auth token stored successfully');
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
        const authToken = getAuthToken();
        const response = await fetch("/api/user", {
          credentials: "include",
          headers: {
            'Accept': 'application/json',
            'Cache-Control': 'no-cache',
            ...(authToken && { 'Authorization': `Bearer ${authToken}` })
          }
        });

        if (response.status === 401) {
          console.log("User not authenticated");
          clearAuthData();
          return null;
        }

        if (!response.ok) {
          console.error("Failed to fetch user:", response.status, response.statusText);
          const errorText = await response.text();
          throw new Error(`Failed to fetch user: ${errorText}`);
        }

        const userData = await response.json();
        console.log("User data fetched:", userData);

        if (userData) {
          setUserId(userData.id);
          setUserData({
            id: userData.id,
            username: userData.username,
            name: userData.name || userData.username,
            avatar: userData.avatar || "/default-avatar.png",
            isGroupCreator: userData.isGroupCreator || false
          });
          return userData;
        }

        clearAuthData();
        return null;
      } catch (error) {
        console.error("Error in user fetch:", error);
        clearAuthData();
        return null;
      }
    },
    staleTime: 1000 * 60,
    gcTime: 1000 * 60 * 5,
    refetchOnWindowFocus: true,
    retry: false,
  });

  const loginMutation = useMutation({
    mutationFn: async (credentials: AuthCredentials) => {
      try {
        const response = await handleAuthRequest("/api/login", credentials);
        console.log("Login successful:", response);

        if (response.success) {
          const { user, token } = response;

          // Ensure token is set if provided
          if (token) {
            setAuthToken(token);
            console.log('Auth token stored successfully');
          }

          // Update user data
          setUserId(user.id);
          setUserData({
            id: user.id,
            username: user.username,
            name: user.name || user.username,
            avatar: user.avatar || "/default-avatar.png",
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
        throw error instanceof Error ? error : new Error("Login failed");
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
      if (response.token) {
        setAuthToken(response.token);
      }
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