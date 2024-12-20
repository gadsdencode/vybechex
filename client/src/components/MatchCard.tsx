import { FC, useState } from 'react';
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MessageCircle, UserPlus, Zap, Loader2, User, Heart, Star, ChevronDown, ChevronUp } from 'lucide-react';
import { useMatches } from '@/hooks/use-matches';
import { useLocation } from "wouter";
import { toast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import type { Match } from '@/hooks/use-matches';

interface MatchCardProps {
  match: Match;
}

export const MatchCard: FC<MatchCardProps> = ({ match }) => {
  const { connect } = useMatches();
  const [isConnecting, setIsConnecting] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  // Transform personality traits into interests format
  const traits = match.personalityTraits || {};

  const handleConnect = async () => {
    if (!match.id) {
      toast({
        title: "Connection Failed",
        description: "Invalid match data",
        variant: "destructive"
      });
      return;
    }

    try {
      setIsConnecting(true);
      const response = await connect({ id: match.id.toString() });

      switch (response.status) {
        case 'accepted':
          toast({
            title: "Match Connected!",
            description: "You can now start chatting",
            variant: "default"
          });
          setLocation(`/chat/${response.id}`);
          break;

        case 'requested':
        case 'pending':
          toast({
            title: response.status === 'requested' ? "Request Sent" : "Request Pending",
            description: "We'll notify you when they respond",
            variant: "default"
          });
          break;

        default:
          console.warn('Unexpected match status:', response.status);
          queryClient.invalidateQueries({ queryKey: ['matches'] });
      }
    } catch (error) {
      console.error('Connect error:', error);
      toast({
        title: "Connection Failed",
        description: error instanceof Error ? error.message : "Failed to connect with match",
        variant: "destructive",
        duration: 5000
      });
    } finally {
      setIsConnecting(false);
    }
  };

  const getStatusBadge = () => {
    switch (match.status) {
      case 'none':
        return <Badge variant="secondary">Potential Match</Badge>;
      case 'pending':
        return <Badge variant="secondary">Pending Confirmation</Badge>;
      case 'requested':
        return <Badge variant="secondary">Request Sent</Badge>;
      case 'accepted':
        return <Badge variant="default">Connected</Badge>;
      case 'rejected':
        return <Badge variant="destructive">Not a Match</Badge>;
      default:
        return <Badge variant="secondary">Potential Match</Badge>;
    }
  };

  const getActionButton = () => {
    switch (match.status) {
      case 'none':
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
                Connect
              </>
            )}
          </Button>
        );
      case 'pending':
        return (
          <Button
            className="w-full"
            onClick={handleConnect}
            disabled={isConnecting}
          >
            {isConnecting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Confirming...
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
            <UserPlus className="mr-2 h-4 w-4" />
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
        return (
          <Button
            className="w-full"
            variant="destructive"
            disabled
          >
            <User className="mr-2 h-4 w-4" />
            Not a Match
          </Button>
        );
      default:
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
                Connect
              </>
            )}
          </Button>
        );
    }
  };

  return (
    <Card className="relative transition-all duration-300 hover:shadow-lg hover:scale-105">
      <CardHeader className="flex flex-row items-start gap-4 p-6">
        <Avatar className="h-12 w-12 flex-shrink-0">
          <AvatarImage src={match.avatar || "/default-avatar.png"} alt={match.name || "User"} />
          <AvatarFallback>{(match.name || "?").charAt(0)}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <h3 className="text-lg font-semibold truncate">{match.name || "Anonymous"}</h3>
            <div className="flex items-center gap-2 flex-shrink-0">
              {getStatusBadge()}
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2"
                onClick={() => setIsExpanded(!isExpanded)}
              >
                <Badge variant="secondary" className="flex items-center gap-1 whitespace-nowrap">
                  <Zap className="h-3 w-3 flex-shrink-0" />
                  {Math.round(match.compatibilityScore || match.score || 0)}% Match
                  {isExpanded ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />}
                </Badge>
              </Button>
            </div>
          </div>
          {isExpanded && (
            <div className="mt-4 space-y-2">
              {match.matchExplanation && (
                <p className="text-sm text-muted-foreground">{match.matchExplanation}</p>
              )}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="px-6 pb-6">
        <div className="flex gap-2">
          {getActionButton()}
        </div>
      </CardContent>
    </Card>
  );
};