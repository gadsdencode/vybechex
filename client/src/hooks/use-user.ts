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
  };
}

async function handleAuthRequest(
  url: string,
  credentials: AuthCredentials
): Promise<AuthResponse> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(credentials),
    credentials: "include",
  });

  const responseData = await response.text();
  let parsedData;
  try {
    parsedData = JSON.parse(responseData);
  } catch (e) {
    console.error("Failed to parse response:", responseData);
    throw new Error(responseData || "An unexpected error occurred");
  }

  if (!response.ok) {
    const errorMessage = parsedData?.message || parsedData?.error || "An error occurred";
    console.error(`Auth request failed (${response.status}):`, errorMessage);
    throw new Error(errorMessage);
  }

  return parsedData;
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
          return null;
        }

        if (!response.ok) {
          console.error("Failed to fetch user:", response.status, response.statusText);
          const errorText = await response.text();
          throw new Error(`Failed to fetch user: ${errorText}`);
        }

        const userData = await response.json();
        console.log("User data fetched:", userData);
        return userData;
      } catch (error) {
        console.error("Error in user fetch:", error);
        return null;
      }
    },
    staleTime: 30000, // Data stays fresh for 30 seconds
    gcTime: 1000 * 60 * 5, // Cache data for 5 minutes
    refetchOnWindowFocus: false, // Prevent refetch on window focus
    retry: false, // Don't retry on failure
  });

  const loginMutation = useMutation({
    mutationFn: (credentials: AuthCredentials) =>
      handleAuthRequest("/api/login", credentials),
    onSuccess: (data) => {
      console.log("Login successful:", data);
      queryClient.setQueryData(["/api/user"], data.user);
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      toast({
        title: "Welcome back!",
        description: "You have been successfully logged in.",
      });
    },
    onError: (error: Error) => {
      console.error("Login error:", error);
      toast({
        title: "Login failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const registerMutation = useMutation({
    mutationFn: (credentials: AuthCredentials) =>
      handleAuthRequest("/api/register", credentials),
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