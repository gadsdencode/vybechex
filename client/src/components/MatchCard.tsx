import { FC, useState } from 'react';
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MessageCircle, UserPlus, Zap, Loader2, User, Heart, Star, ChevronDown, ChevronUp, Users } from 'lucide-react';
import { useMatches } from '@/hooks/use-matches';
import { useLocation } from "wouter";
import { toast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import type { Match } from '@/hooks/use-matches';
import { Link } from 'react-router-dom'

interface MatchCardProps {
  match: Match;
  isPotential?: boolean;
  compatibilityScore?: number;
  matchExplanation?: string;
  onAccept?: () => void;
  onReject?: () => void;
  onConnect?: () => void;
  isResponding?: boolean;
}

export const MatchCard: FC<MatchCardProps> = ({
  match,
  isPotential,
  compatibilityScore,
  matchExplanation,
  onAccept,
  onReject,
  onConnect,
  isResponding
}) => {
  const { connect } = useMatches();
  const [isConnecting, setIsConnecting] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  // Type guard to check if object is a full Match type
  const isFullMatch = (match: Match | { id: number; username: string; name: string; avatar?: string }): match is Match => {
    return 'personalityTraits' in match && 'user' in match;
  };

  // Get the correct user data based on match type
  const userData = isFullMatch(match) ? match : match;
  const displayName = userData?.name || userData?.username || 'Anonymous User';
  const avatarUrl = userData?.avatar || '/default-avatar.png';

  // Access personality traits from the match data with type guard
  const personalityTraits: Record<string, number> = isFullMatch(match) && match.personalityTraits ? match.personalityTraits : {};

  const handleConnect = async () => {
    if (!userData?.id) {
      toast({
        title: "Connection Failed",
        description: "Invalid match data",
        variant: "destructive"
      });
      return;
    }

    try {
      setIsConnecting(true);
      await connect(userData.id);
      
      toast({
        title: "Connection Request Sent!",
        description: `We'll notify you when ${displayName} responds.`
      });

      // Refresh matches data
      queryClient.invalidateQueries({ queryKey: ['matches'] });
    } catch (error) {
      toast({
        title: "Connection Failed",
        description: error instanceof Error ? error.message : "Failed to send connection request",
        variant: "destructive"
      });
    } finally {
      setIsConnecting(false);
    }
  };

  const handleChat = async () => {
    if (!match.id || typeof match.id !== 'number') {
      toast({
        title: "Error",
        description: "Invalid match ID",
        variant: "destructive"
      });
      return;
    }

    if (match.status !== 'accepted') {
      toast({
        title: "Cannot Access Chat",
        description: "This match is not yet accepted",
        variant: "destructive"
      });
      return;
    }

    try {
      // Verify match exists and is accessible before navigation
      const response = await fetch(`/api/matches/${match.id}`, {
        credentials: 'include',
        headers: {
          'Accept': 'application/json',
          'Cache-Control': 'no-cache'
        }
      });

      if (!response.ok) {
        throw new Error(response.status === 404 
          ? 'Match not found' 
          : 'Failed to verify match access'
        );
      }

      const data = await response.json();
      if (!data.success || data.data?.status !== 'accepted') {
        throw new Error('Match is not accessible');
      }

      // Only navigate if match is verified
      setLocation(`/chat/${match.id}`);
    } catch (error) {
      console.error('Chat navigation error:', error);
      toast({
        title: "Cannot Access Chat",
        description: error instanceof Error ? error.message : "Failed to access chat",
        variant: "destructive"
      });
    }
  };

  return (
    <Card className="relative overflow-hidden transition-all duration-200">
      <CardHeader className="flex flex-row items-center gap-4 pb-2">
        <Avatar className="h-12 w-12">
          <AvatarImage src={avatarUrl} alt={displayName} />
          <AvatarFallback><User /></AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold">{displayName}</h3>
            {match.status === 'accepted' && (
              <Badge variant="default" className="bg-green-500">
                <Heart className="h-3 w-3 mr-1" />
                Connected
              </Badge>
            )}
            {match.status === 'potential' && match.compatibilityScore && (
              <Badge variant="secondary" className="bg-blue-500">
                <Star className="h-3 w-3 mr-1" />
                {Math.round(match.compatibilityScore * 100)}% Match
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {match.status === 'potential' && match.matchExplanation && (
          <p className="text-sm text-muted-foreground mb-4">{match.matchExplanation}</p>
        )}
        
        <div className="flex flex-wrap gap-2 mb-4">
          {Object.entries(personalityTraits).map(([trait, value]) => (
            <Badge key={trait} variant="outline" className="capitalize">
              {trait}: {Math.round(value * 100)}%
            </Badge>
          ))}
        </div>

        <div className="flex gap-2 mt-4">
          {match.status === 'accepted' ? (
            <Button
              className="flex-1"
              onClick={handleChat}
              size="sm"
              disabled={!match.id || typeof match.id !== 'number'}
            >
              <MessageCircle className="h-4 w-4 mr-2" />
              Chat
            </Button>
          ) : (
            <Button
              className="flex-1"
              onClick={handleConnect}
              disabled={isConnecting}
              size="sm"
            >
              {isConnecting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <UserPlus className="h-4 w-4 mr-2" />
              )}
              Connect
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};