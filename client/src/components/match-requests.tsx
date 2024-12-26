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
  onRespond: ({ matchId, status }: { matchId: number; status: 'accepted' | 'rejected' }) => void;
}

export function MatchRequests({ requests, isResponding, onRespond }: MatchRequestsProps) {
  const [processedRequests, setProcessedRequests] = useState<Record<number, boolean>>({});
  const [processingId, setProcessingId] = useState<number | null>(null);

  const handleResponse = async (matchId: number, status: 'accepted' | 'rejected') => {
    if (processedRequests[matchId] || processingId !== null) {
      return; // Prevent duplicate responses or concurrent processing
    }

    try {
      setProcessingId(matchId);
      setProcessedRequests(prev => ({ ...prev, [matchId]: true }));
      
      await onRespond({ matchId, status });

      // Keep the processed state
      setProcessedRequests(prev => ({ ...prev, [matchId]: true }));
      
      toast({
        title: status === 'accepted' ? 'Match Accepted!' : 'Request Declined',
        description: status === 'accepted' 
          ? 'You can now start chatting with your new match!' 
          : 'The match request has been declined.',
        variant: status === 'accepted' ? 'default' : 'destructive'
      });
    } catch (error) {
      console.error('Failed to respond to match request:', error);
      // Reset the processed state only on error
      setProcessedRequests(prev => ({ ...prev, [matchId]: false }));

      // Show more specific error messages
      let errorMessage = 'An unexpected error occurred';
      if (error instanceof Error) {
        if (error.message.includes('Session expired')) {
          errorMessage = 'Your session has expired. Please log in again.';
        } else if (error.message.includes('no longer available')) {
          errorMessage = 'This match request is no longer available.';
        } else {
          errorMessage = error.message;
        }
      }

      toast({
        title: 'Failed to Process Request',
        description: errorMessage,
        variant: 'destructive'
      });
    } finally {
      setProcessingId(null);
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
      {requests.map((request) => {
        const isProcessing = processingId === request.id;
        const isDisabled = isResponding || processedRequests[request.id] || processingId !== null;

        return (
          <Card key={request.id} className="p-4">
            <div className="flex items-start gap-4">
              <Avatar>
                <AvatarImage
                  src={request.avatar}
                  alt={request.name || 'User avatar'}
                />
                <AvatarFallback>
                  <User className="h-6 w-6" />
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-semibold">{request.name}</h4>
                    <p className="text-sm text-muted-foreground">
                      @{request.username}
                    </p>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {formatDistanceToNow(new Date(request.createdAt), { addSuffix: true })}
                  </div>
                </div>

                <div className="mt-4 flex gap-2">
                  <Button
                    variant="default"
                    disabled={isDisabled}
                    onClick={() => handleResponse(request.id, 'accepted')}
                    className="relative"
                  >
                    {isProcessing && (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    )}
                    Accept
                  </Button>
                  <Button
                    variant="outline"
                    disabled={isDisabled}
                    onClick={() => handleResponse(request.id, 'rejected')}
                    className="relative"
                  >
                    {isProcessing && (
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