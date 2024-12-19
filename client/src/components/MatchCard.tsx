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

  // Transform personality traits into interests format
  const traits = match.personalityTraits || {};
  const interests: Interest[] = Object.entries(traits).map(([key, score]) => {
    let category: Interest['category'] = 'personality';
    if (key === 'values') category = 'value';
    else if (key === 'sociability') category = 'hobby';
    
    return {
      name: key.charAt(0).toUpperCase() + key.slice(1),
      score,
      category
    };
  });

  const topPersonalityTrait = interests.find(i => i.category === 'personality' && i.name !== 'Values' && i.name !== 'Sociability');
  const topHobby = interests.find(i => i.category === 'hobby');
  const topValue = interests.find(i => i.category === 'value');

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
      
      // Handle different match statuses with appropriate feedback
      switch (response.status) {
        case 'accepted':
          toast({
            title: "Match Connected! 🎉",
            description: "You can now start chatting",
            variant: "default"
          });
          setLocation(`/chat/${response.id}`);
          break;
        
        case 'requested':
          toast({
            title: "Request Sent ✨",
            description: "We'll notify you when they respond",
            variant: "default"
          });
          setLocation('/matches');
          break;
        
        case 'pending':
          toast({
            title: "Request Pending ⏳",
            description: "Your request is still waiting for a response",
            variant: "default"
          });
          setLocation('/matches');
          break;
        
        default:
          console.warn('Unexpected match status:', response.status);
          toast({
            title: "Status Updated",
            description: "Match status has been updated",
            variant: "default"
          });
          setLocation('/matches');
      }
    } catch (error) {
      console.error('Connect error:', error);
      
      // Enhanced error handling with specific messages
      const errorMessage = error instanceof Error ? error.message : "Failed to connect with match";
      
      toast({
        title: "Connection Failed",
        description: errorMessage,
        variant: "destructive",
        duration: 5000
      });

      // Handle specific error cases
      if (error instanceof Error) {
        if (error.message.includes('Authentication required') || 
            error.message.includes('Not authorized')) {
          setLocation('/login');
        } else if (error.message.includes('Match request already exists')) {
          setLocation('/matches');
        }
      }
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
            onClick={() => {
              if (match.status === 'accepted') {
                setLocation(`/chat/${match.id}`);
              } else {
                toast({
                  title: "Cannot Access Chat",
                  description: "This match must be accepted first",
                  variant: "destructive"
                });
                setLocation('/matches');
              }
            }}
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
    <Card className="relative transition-all duration-300 hover:shadow-lg hover:scale-105 overflow-hidden">
      <CardHeader className="flex flex-row items-start gap-4 p-6">
        <Avatar className="h-12 w-12 flex-shrink-0">
          <AvatarImage src={match.avatar || "/default-avatar.png"} alt={match.name || "User"} />
          <AvatarFallback>{(match.name || "?").charAt(0)}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0"> {/* min-w-0 prevents flex child from overflowing */}
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
          <div className="space-y-2 mt-2">
            {topPersonalityTrait && (
              <p className="text-sm text-muted-foreground flex items-center gap-2 truncate">
                <User className="h-3 w-3 flex-shrink-0" />
                <span>Strong in {topPersonalityTrait.name}</span>
              </p>
            )}
            {topHobby && (
              <p className="text-sm text-muted-foreground flex items-center gap-2 truncate">
                <Heart className="h-3 w-3 flex-shrink-0" />
                <span>Enjoys {topHobby.name}</span>
              </p>
            )}
            {topValue && (
              <p className="text-sm text-muted-foreground flex items-center gap-2 truncate">
                <Star className="h-3 w-3 flex-shrink-0" />
                <span>Values {topValue.name}</span>
              </p>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-6 pb-6">
        {isExpanded && (
          <div className="space-y-6 mb-6 p-4 bg-muted/50 rounded-lg">
            <div className="space-y-2">
              <h4 className="font-medium">Why You Match</h4>
              <p className="text-sm text-muted-foreground break-words">{match.matchExplanation}</p>
            </div>
            <div className="space-y-2">
              <h4 className="font-medium">Compatibility Breakdown</h4>
              <div className="grid gap-2">
                <div className="flex justify-between text-sm items-center">
                  <span className="text-muted-foreground">Personality</span>
                  <span className="font-medium">{match.scoreBreakdown?.components.personality || 0}%</span>
                </div>
                <div className="flex justify-between text-sm items-center">
                  <span className="text-muted-foreground">Communication</span>
                  <span className="font-medium">{match.scoreBreakdown?.components.communication || 0}%</span>
                </div>
                <div className="flex justify-between text-sm items-center">
                  <span className="text-muted-foreground">Social</span>
                  <span className="font-medium">{match.scoreBreakdown?.components.social || 0}%</span>
                </div>
                <div className="flex justify-between text-sm items-center">
                  <span className="text-muted-foreground">Activity</span>
                  <span className="font-medium">{match.scoreBreakdown?.components.activity || 0}%</span>
                </div>
              </div>
            </div>
          </div>
        )}
        <div className="flex gap-2">
          {getActionButton()}
        </div>
      </CardContent>
    </Card>
  );
};