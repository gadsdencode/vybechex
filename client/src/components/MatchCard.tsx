import { FC, useState } from 'react';
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MessageCircle, UserPlus, Zap, Loader2, User, Heart, Star, ChevronDown, ChevronUp } from 'lucide-react';
import { useMatches } from '@/hooks/use-matches';
import { Link, useLocation } from "wouter";
import { toast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import type { ExtendedUser, Interest, Match } from '@/hooks/use-matches';

interface MatchCardProps {
  match: Match;
}

export const MatchCard: FC<MatchCardProps> = ({ match }) => {
  const { connect } = useMatches();
  const [isConnecting, setIsConnecting] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [, setLocation] = useLocation();

  // Get the top interests by category
  const interests = match.personalityTraits || [];
  const topPersonalityTrait = interests.find((i: Interest) => i.category === 'personality');
  const topHobby = interests.find((i: Interest) => i.category === 'hobby');
  const topValue = interests.find((i: Interest) => i.category === 'value');

  const handleConnect = async () => {
    try {
      setIsConnecting(true);
      const response = await connect({ id: match.id.toString() });
      if (response.status === 'accepted') {
        setLocation(`/chat/${match.id}`);
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to connect with match",
        variant: "destructive",
      });
    } finally {
      setIsConnecting(false);
    }
  };

  const getStatusBadge = () => {
    switch (match.status) {
      case 'requested':
        return <Badge variant="secondary">Request Sent</Badge>;
      case 'requested':
        return <Badge variant="destructive">Pending</Badge>;
      case 'accepted':
        return <Badge variant="default">Connected</Badge>;
      case 'rejected':
        return <Badge variant="destructive">Not a Match</Badge>;
      default:
        return null;
    }
  };

  const getActionButton = () => {
    switch (match.status) {
      case 'requested':
        return (
          <Button
            className="w-full"
            onClick={handleConnect}
            disabled={isConnecting}
          >
            {isConnecting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Connecting...
              </>
            ) : (
              <>
                <UserPlus className="mr-2 h-4 w-4" />
                Confirm Match
              </>
            )}
          </Button>
        );
      case 'requested':
        return (
          <Button 
            className="w-full" 
            variant="secondary"
            disabled
          >
            Request Sent
          </Button>
        );
      case 'accepted':
        return (
          <Button
            className="w-full"
            variant="default"
            onClick={() => setLocation(`/chat/${match.id}`)}
          >
            <MessageCircle className="mr-2 h-4 w-4" />
            Start Chat
          </Button>
        );
      case 'rejected':
      default:
        return null;
    }
  };

  return (
    <Card className="relative transition-all duration-300 hover:shadow-lg hover:scale-105">
      <CardHeader className="flex flex-row items-center gap-4 p-4">
        <Avatar className="h-12 w-12">
          <AvatarImage src={match.avatar || "/default-avatar.png"} alt={match.name || "User"} />
          <AvatarFallback>{(match.name || "?").charAt(0)}</AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">{match.name || "Anonymous"}</h3>
            <div className="flex items-center gap-2">
              {getStatusBadge()}
              <Button
                variant="ghost"
                size="sm"
                className="p-0 h-8"
                onClick={() => setIsExpanded(!isExpanded)}
              >
                <Badge variant="secondary" className="flex items-center gap-1">
                  <Zap className="h-3 w-3" />
                  {Math.round(match.compatibilityScore || match.score || 0)}% Match
                  {isExpanded ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />}
                </Badge>
              </Button>
            </div>
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
        {isExpanded && (
            <div className="space-y-4 mt-4 p-4 bg-muted/50 rounded-lg">
              <div className="space-y-2">
                <h4 className="font-medium">Why You Match</h4>
                <p className="text-sm text-muted-foreground">{match.matchExplanation}</p>
              </div>
              <div className="space-y-2">
                <h4 className="font-medium">Compatibility Breakdown</h4>
                <div className="space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Personality</span>
                  <span>{match.scoreBreakdown?.components.personality || 0}%</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Communication</span>
                  <span>{match.scoreBreakdown?.components.communication || 0}%</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Social</span>
                  <span>{match.scoreBreakdown?.components.social || 0}%</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Activity</span>
                  <span>{match.scoreBreakdown?.components.activity || 0}%</span>
                </div>
              </div>
              </div>
            </div>
          )}
          <div className="flex gap-2 mt-4">
            {getActionButton()}
          </div>
        </CardContent>
      </Card>
  );
};