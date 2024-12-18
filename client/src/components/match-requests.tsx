import { Match } from '@/hooks/use-matches';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { formatDistanceToNow } from 'date-fns';
import { User } from 'lucide-react';

interface MatchRequestsProps {
  requests: Match[];
  isResponding: boolean;
  onRespond: (matchId: number, status: 'accepted' | 'rejected') => void;
}

export function MatchRequests({ requests, isResponding, onRespond }: MatchRequestsProps) {
  if (requests.length === 0) {
    return (
      <div className="text-center text-muted-foreground p-4">
        No pending match requests
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

              <div className="mt-4 flex gap-2">
                <Button
                  variant="default"
                  disabled={isResponding}
                  onClick={() => onRespond(request.id, 'accepted')}
                >
                  Accept
                </Button>
                <Button
                  variant="outline"
                  disabled={isResponding}
                  onClick={() => onRespond(request.id, 'rejected')}
                >
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
