import { useMatches } from "../hooks/use-matches";
import { Loader2 } from "lucide-react";
import { MatchCard } from "../components/MatchCard";

export default function Matches() {
  const { matches, isLoading } = useMatches();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">Your Matches</h1>

      {matches && matches.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {matches.map((match) => (
            <MatchCard key={match.id} match={match} />
          ))}
        </div>
      ) : (
        <div className="text-center text-muted-foreground">
          <p>No matches found yet. Complete your personality quiz to find compatible friends!</p>
        </div>
      )}
    </div>
  );
}
