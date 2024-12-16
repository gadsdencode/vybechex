import { Card, CardHeader, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MessageSquare, UserCircle } from "lucide-react";
import { Link } from "wouter";
import type { User } from "@db/schema";

interface MatchCardProps {
  match: User & { compatibilityScore: number };
}

export function MatchCard({ match }: MatchCardProps) {
  return (
    <Card className="hover:shadow-lg transition-shadow">
      <CardHeader className="space-y-1">
        <div className="flex items-center gap-3">
          <UserCircle className="h-10 w-10 text-muted-foreground" />
          <div>
            <h3 className="text-xl font-semibold">{match.name || match.username}</h3>
            {similarityScore && (
              <p className="text-sm text-muted-foreground">
                {similarityScore}% Match
              </p>
            )}
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        <p className="text-muted-foreground line-clamp-3">
          {match.bio || "No bio yet"}
        </p>
      </CardContent>
      
      <CardFooter>
        <Button className="w-full" asChild>
          <Link href={`/chat/${match.id}`}>
            <MessageSquare className="h-4 w-4 mr-2" />
            Start Chatting
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
