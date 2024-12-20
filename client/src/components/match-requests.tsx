import { Match } from '@/hooks/use-matches';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { formatDistanceToNow } from 'date-fns';
import { AlertCircle, Loader2, User } from 'lucide-react';
import { useState } from 'react';
import { toast } from '@/hooks/use-toast';

interface MatchRequestsProps {
  requests: Match[];
  isResponding: boolean;
  onRespond: (matchId: number, status: 'accepted' | 'rejected') => void;
}

export function MatchRequests({ requests, isResponding, onRespond }: MatchRequestsProps) {
  const [processedRequests, setProcessedRequests] = useState<Record<number, boolean>>({});

  const handleResponse = async (matchId: number, status: 'accepted' | 'rejected') => {
    if (processedRequests[matchId]) {
      return; // Prevent duplicate responses
    }

    try {
      setProcessedRequests(prev => ({ ...prev, [matchId]: true }));
      await onRespond(matchId, status);

      toast({
        title: status === 'accepted' ? 'Match Accepted!' : 'Request Declined',
        description: status === 'accepted' 
          ? 'You can now start chatting with your new match!' 
          : 'The match request has been declined.',
        variant: status === 'accepted' ? 'default' : 'secondary'
      });
    } catch (error) {
      console.error('Failed to respond to match request:', error);
      setProcessedRequests(prev => ({ ...prev, [matchId]: false }));

      toast({
        title: 'Failed to Process Request',
        description: error instanceof Error ? error.message : 'An unexpected error occurred',
        variant: 'destructive'
      });
    }
  };

  if (!Array.isArray(requests)) {
    console.error('Invalid requests prop:', requests);
    return (
      <div className="text-center text-muted-foreground p-8 bg-card rounded-lg border">
        <AlertCircle className="h-12 w-12 mx-auto mb-4 text-destructive" />
        <p className="text-lg font-medium">Error Loading Requests</p>
        <p className="text-sm text-muted-foreground mt-2">
          Please try refreshing the page
        </p>
      </div>
    );
  }

  if (requests.length === 0) {
    return (
      <div className="text-center text-muted-foreground p-8 bg-card rounded-lg border">
        <User className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p className="text-lg font-medium">No pending match requests</p>
        <p className="text-sm text-muted-foreground mt-2">
          When someone wants to connect, their request will appear here
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {requests.map((request) => (
        <Card key={request.id} className="p-4">
          <div className="flex items-start gap-4">
            <Avatar>
              <AvatarImage
                src={request.requester?.avatar}
                alt={request.requester?.name || 'User avatar'}
              />
              <AvatarFallback>
                <User className="h-6 w-6" />
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="font-semibold">{request.requester?.name}</h4>
                  <p className="text-sm text-muted-foreground">
                    @{request.requester?.username}
                  </p>
                </div>
                <div className="text-sm text-muted-foreground">
                  {formatDistanceToNow(new Date(request.createdAt), { addSuffix: true })}
                </div>
              </div>

              <div className="mt-4 flex gap-2">
                <Button
                  variant="default"
                  disabled={isResponding || processedRequests[request.id]}
                  onClick={() => handleResponse(request.id, 'accepted')}
                  className="relative"
                >
                  {(isResponding || processedRequests[request.id]) && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  Accept
                </Button>
                <Button
                  variant="outline"
                  disabled={isResponding || processedRequests[request.id]}
                  onClick={() => handleResponse(request.id, 'rejected')}
                  className="relative"
                >
                  {(isResponding || processedRequests[request.id]) && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  Decline
                </Button>
              </div>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}