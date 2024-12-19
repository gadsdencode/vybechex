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
    queryKey: ['/api/user'],
    queryFn: async () => {
      try {
        const response = await fetch("/api/user", {
          credentials: "include",
          headers: {
            'Accept': 'application/json',
            'Cache-Control': 'no-cache'
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
          // Store user data in localStorage
          setUserId(userData.id);
          setUserData({
            id: userData.id,
            username: userData.username,
            name: userData.name,
            avatar: userData.avatar,
            isGroupCreator: userData.isGroupCreator
          });
          
          // Force a refetch of related queries
          queryClient.invalidateQueries({ queryKey: ['/api/matches'] });
          return userData;
        }
        
        return null;
      } catch (error) {
        console.error("Error in user fetch:", error);
        clearAuthData();
        return null;
      }
    },
    staleTime: 0, // Always fetch fresh data
    gcTime: 1000 * 60 * 5,
    refetchOnWindowFocus: true,
    retry: 1,
  });

  const loginMutation = useMutation({
    mutationFn: async (credentials: AuthCredentials) => {
      try {
        const response = await fetch("/api/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(credentials),
          credentials: "include"
        });

        if (!response.ok) {
          const errorData = await response.text();
          throw new Error(errorData || "Login failed");
        }

        const data = await response.json();
        return { ...data, ok: true };
      } catch (error) {
        console.error("Login error:", error);
        throw error instanceof Error ? error : new Error("Login failed");
      }
    },
    onSuccess: (data) => {
      console.log("Login successful:", data);
      if (data.user) {
        // Update user data in query cache
        queryClient.setQueryData(["/api/user"], data.user);
        
        // Force refetch to ensure we have the latest data
        queryClient.invalidateQueries({ 
          queryKey: ["/api/user"],
          refetchType: "all"
        });
        
        // Store essential user data
        setUserId(data.user.id);
        setUserData({
          id: data.user.id,
          username: data.user.username,
          name: data.user.name || null,
          avatar: data.user.avatar || "/default-avatar.png",
          isGroupCreator: data.user.isGroupCreator || false
        });

        toast({
          title: "Welcome back!",
          description: "You have been successfully logged in.",
        });
      }
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