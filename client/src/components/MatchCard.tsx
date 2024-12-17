import { FC, useState } from 'react';
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MessageCircle, UserPlus, Zap, Loader2, User, Heart, Star } from 'lucide-react';
import { useMatches } from '@/hooks/use-matches';
import { Link } from "wouter";
import { toast } from "@/hooks/use-toast";

interface Interest {
  name: string;
  score: number;
  category: 'personality' | 'hobby' | 'value';
}

interface Match {
  id: string;
  name: string;
  username: string;
  avatar: string;
  compatibilityScore: number;
  interests: Interest[];
  status: 'pending' | 'accepted' | 'rejected';
}

interface MatchCardProps {
  match: Match;
}

export const MatchCard: FC<MatchCardProps> = ({ match }) => {
  const { connect } = useMatches();
  const [isConnecting, setIsConnecting] = useState(false);
  
  // Get the top interests by category
  const topPersonalityTrait = match.interests.find(i => i.category === 'personality');
  const topHobby = match.interests.find(i => i.category === 'hobby');
  const topValue = match.interests.find(i => i.category === 'value');

  const handleConnect = async () => {
    try {
      setIsConnecting(true);
      await connect({ id: match.id });  // Keep id as string
    } catch (error) {
      console.error('Failed to connect:', error);
      // Error toast is handled by the mutation
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <Card className="overflow-hidden transition-all duration-300 hover:shadow-lg hover:scale-105">
      <CardHeader className="flex flex-row items-center gap-4 p-4">
        <Avatar className="h-12 w-12">
          <AvatarImage src={match.avatar} alt={match.name} />
          <AvatarFallback>{match.name.charAt(0)}</AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">{match.name}</h3>
            <Badge variant="secondary" className="flex items-center gap-1">
              <Zap className="h-3 w-3" />
              {match.compatibilityScore}% Match
            </Badge>
          </div>
          <div className="space-y-1 mt-1">
            {topPersonalityTrait && (
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                <User className="h-3 w-3" />
                Strong in {topPersonalityTrait.name}
              </p>
            )}
            {topHobby && (
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                <Heart className="h-3 w-3" />
                Enjoys {topHobby.name}
              </p>
            )}
            {topValue && (
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                <Star className="h-3 w-3" />
                Values {topValue.name}
              </p>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <div className="flex gap-2">
          {match.status === 'accepted' ? (
            <Button asChild className="flex-1">
              <Link href={`/chat/${match.id}`}>
                <MessageCircle className="h-4 w-4 mr-2" />
                Chat
              </Link>
            </Button>
          ) : (
            <Button 
              onClick={handleConnect} 
              disabled={isConnecting || match.status === 'pending'} 
              className="flex-1"
            >
              {isConnecting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <UserPlus className="h-4 w-4 mr-2" />
              )}
              {match.status === 'pending' ? 'Pending' : 'Connect'}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
