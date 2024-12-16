import { useMatches } from "../hooks/use-matches";
import { useUser } from "../hooks/use-user";
import { Loader2 } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { MatchCard } from "../components/MatchCard";
import { NetworkGraph } from "../components/NetworkGraph";

export default function Matches() {
  const { user } = useUser();
  const { matches, isLoading } = useMatches();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user?.quizCompleted) {
    return (
      <div className="max-w-4xl mx-auto text-center">
        <h1 className="text-3xl font-bold mb-4">Complete Your Profile</h1>
        <p className="text-muted-foreground mb-8">
          Take our personality quiz to find compatible friends!
        </p>
        <Button asChild>
          <Link href="/quiz">Take the Quiz</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">Your Matches</h1>

      {matches && matches.length > 0 ? (
        <>
          <div className="mb-8">
            <h2 className="text-xl font-semibold mb-4">Connection Network</h2>
            <NetworkGraph />
          </div>
          
          <h2 className="text-xl font-semibold mb-4">Match Cards</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {matches.map((match) => (
              <MatchCard key={match.id} match={match} />
            ))}
          </div>
        </>
      ) : (
        <div className="text-center text-muted-foreground">
          <p>No matches found yet. Complete your personality quiz to find compatible friends!</p>
        </div>
      )}
    </div>
  );
}
