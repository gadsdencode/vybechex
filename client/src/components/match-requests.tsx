import { Match } from '@/hooks/use-matches';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { formatDistanceToNow } from 'date-fns';
import { AlertCircle, Loader2, User } from 'lucide-react';
import { useState } from 'react';

interface MatchRequestsProps {
  requests: Match[];
  isResponding: boolean;
  onRespond: (matchId: number, status: 'accepted' | 'rejected') => void;
}

export function MatchRequests({ requests, isResponding, onRespond }: MatchRequestsProps) {
  const [retryStates, setRetryStates] = useState<Record<number, { retries: number, lastAttempt: number }>>({});

  const handleResponse = async (matchId: number, status: 'accepted' | 'rejected') => {
    const currentRetry = retryStates[matchId]?.retries || 0;
    const lastAttempt = retryStates[matchId]?.lastAttempt || 0;
    const now = Date.now();

    // If we've tried recently, wait before retrying
    if (now - lastAttempt < 1000) {
      return;
    }

    // Update retry state
    setRetryStates(prev => ({
      ...prev,
      [matchId]: {
        retries: currentRetry + 1,
        lastAttempt: now
      }
    }));

    try {
      await onRespond(matchId, status);
      // Clear retry state on success
      setRetryStates(prev => {
        const newState = { ...prev };
        delete newState[matchId];
        return newState;
      });
    } catch (error) {
      console.error('Failed to respond to match request:', error);
      // Retry state will be updated above for next attempt
    }
  };

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
      {requests.map((request) => {
        const retryInfo = retryStates[request.id];
        const hasRetries = retryInfo && retryInfo.retries > 0;
        const isRetrying = hasRetries && isResponding;

        return (
          <Card key={request.id} className={`p-4 ${isRetrying ? 'border-yellow-500' : ''}`}>
            <div className="flex items-start gap-4">
              <Avatar>
                <AvatarImage
                  src={request.requester?.avatar || undefined}
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
                
                <div className="mt-2 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <span>Compatibility Score:</span>
                    <span className="font-medium text-foreground">
                      {Math.round(request.score || 0)}%
                    </span>
                  </div>
                </div>

                {hasRetries && !isResponding && (
                  <div className="mt-2 flex items-center gap-2 text-yellow-600 text-sm">
                    <AlertCircle className="h-4 w-4" />
                    <span>Response failed, retrying... ({retryInfo.retries}/3)</span>
                  </div>
                )}

                <div className="mt-4 flex gap-2">
                  <Button
                    variant="default"
                    disabled={isResponding}
                    onClick={() => handleResponse(request.id, 'accepted')}
                    className="relative"
                  >
                    {isRetrying && (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    )}
                    Accept
                  </Button>
                  <Button
                    variant="outline"
                    disabled={isResponding}
                    onClick={() => handleResponse(request.id, 'rejected')}
                    className="relative"
                  >
                    {isRetrying && (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    )}
                    Decline
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
