import { useEffect } from "react";
import { useLocation } from "wouter";
import { useMatches } from "@/hooks/use-matches";
import CreateMatchWizard from "@/components/CreateMatchWizard";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

export default function CreateMatchPage() {
  const [location, setLocation] = useLocation();
  const { getMatch } = useMatches();
  const { toast } = useToast();
  const searchParams = new URLSearchParams(window.location.search);
  const matchId = searchParams.get('id');

  useEffect(() => {
    // If we have a matchId, check if it exists first
    if (matchId) {
      getMatch(matchId)
        .then((existingMatch) => {
          if (existingMatch) {
            // Match exists, redirect to chat
            setLocation(`/chat/${matchId}`);
            toast({
              title: "Match exists",
              description: "You already have a match with this user.",
            });
          }
        })
        .catch((error) => {
          // Only show error if it's not the expected "match not found"
          if (!error.message.includes('Match not found')) {
            toast({
              title: "Error",
              description: error.message,
              variant: "destructive",
            });
          }
        });
    }
  }, [matchId, getMatch, setLocation, toast]);

  if (!matchId) {
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
