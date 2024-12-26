import { useEffect } from "react";
import { useLocation } from "wouter";
import { useMatches } from "@/hooks/use-matches";
import CreateMatchWizard from "@/components/CreateMatchWizard";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

export default function CreateMatchPage() {
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const searchParams = new URLSearchParams(window.location.search);
  const matchId = searchParams.get('id');

  // Use React Query to handle the match existence check
  const { isLoading, error } = useQuery({
    queryKey: ['match', matchId],
    queryFn: async () => {
      if (!matchId) return null;
      
      try {
        const response = await fetch(`/api/matches/${matchId}`, {
          credentials: 'include'
        });
        
        if (response.status === 404) {
          return null;
        }
        
        if (!response.ok) {
          throw new Error('Failed to check match');
        }
        
        const match = await response.json();
        if (match) {
            // Handle different match statuses
            switch (match.status) {
              case 'accepted':
                setLocation(`/chat/${match.id}`);
                toast({
                  title: "Match Active",
                  description: "Redirecting to your chat...",
                });
                break;
              case 'requested':
              case 'pending':
                setLocation('/matches');
                toast({
                  title: "Match Request Pending",
                  description: "You already have a pending request with this user.",
                });
                break;
              default:
                setLocation('/matches');
            }
          }
          return match;
      } catch (err) {
        throw err;
      }
    },
    enabled: !!matchId, // Only run query if matchId exists
    retry: false,
    staleTime: 30000,
    refetchOnWindowFocus: false
  });

  if (error && !error.message?.includes('Match not found')) {
    toast({
      title: "Error",
      description: error.message,
      variant: "destructive",
    });
  }

  // Only show loading spinner if we're checking an existing match
  if (matchId && isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4">
      <CreateMatchWizard
        initialMatchId={matchId}
        onComplete={() => setLocation("/matches")}
        onCancel={() => setLocation("/matches")}
      />
    </div>
  );
}