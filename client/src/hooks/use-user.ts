import { setUserData, setUserId, setAuthToken, clearAuthData } from '@/utils/auth';
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SelectUser } from "@db/schema";
import { useToast } from "@/hooks/use-toast";

interface AuthCredentials {
  username: string;
  password: string;
}

interface AuthResponse {
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
  authToken?: string;
  avatar?: string;
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
    } catch (e) {
      console.error("Failed to parse response:", responseData);
      throw new Error(responseData || "Invalid server response");
    }

    if (!response.ok) {
      const errorMessage = parsedData?.message || parsedData?.error || "Authentication failed";
      console.error(`Auth request failed (${response.status}):`, errorMessage);
      throw new Error(errorMessage);
    }

    // Validate the response structure
    if (!parsedData.user || !parsedData.message) {
      throw new Error("Invalid response format from server");
    }

    return parsedData;
  } catch (error) {
    console.error("Login error:", error);
    throw error instanceof Error ? error : new Error("Authentication failed");
  }
}

export function useUser() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: user, isLoading } = useQuery<SelectUser | null>({
    queryKey: ["/api/user"],
    queryFn: async () => {
      try {
        const response = await fetch("/api/user", {
          credentials: "include",
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
        
        // Store user data in localStorage
        if (userData) {
          setUserId(userData.id);
          setUserData({
            id: userData.id,
            username: userData.username,
            name: userData.name,
            avatar: userData.avatar,
            isGroupCreator: userData.isGroupCreator
          });
        }
        
        return userData;
      } catch (error) {
        console.error("Error in user fetch:", error);
        return null;
      }
    },
    staleTime: 30000,
    gcTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const loginMutation = useMutation({
    mutationFn: async (credentials: AuthCredentials) => {
      const response = await handleAuthRequest("/api/login", credentials);
      // Store auth token if it's in the response
      const token = response.token || response.authToken;
      if (token) {
        setAuthToken(token);
      }
      return { ...response, ok: true };
    },
    onSuccess: (data) => {
      console.log("Login successful:", data);
      // Store user data in localStorage
      if (data.user) {
        setUserId(data.user.id);
        setUserData({
          id: data.user.id,
          username: data.user.username,
          name: data.user.name || null,
          avatar: data.user.avatar || "/default-avatar.png",
          isGroupCreator: data.user.isGroupCreator || false
        });
      }
      queryClient.setQueryData(["/api/user"], data.user);
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
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

      const data = await response.json();
      console.log("Logout response:", data);
      return data;
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