import { useMatches } from "../hooks/use-matches";
import { Card, CardHeader, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MessageSquare, Loader2 } from "lucide-react";
import { Link } from "wouter";

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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {matches?.map((match) => (
          <Card key={match.id}>
            <CardHeader>
              <h3 className="text-xl font-semibold">{match.name || match.username}</h3>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                {match.bio || "No bio yet"}
              </p>
            </CardContent>
            <CardFooter>
              <Button asChild>
                <Link href={`/chat/${match.id}`}>
                  <MessageSquare className="h-4 w-4 mr-2" />
                  Chat
                </Link>
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  );
}
