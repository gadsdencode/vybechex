import { useMatches } from '../hooks/use-matches';
import { MatchRequests } from '../components/match-requests';
import { Spinner } from '../components/ui/spinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';

export function MatchesPage() {
  const { 
    matches, 
    requests, 
    isLoading, 
    isResponding, 
    respondToMatch 
  } = useMatches();

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-[200px]">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-2xl font-bold mb-6">Your Matches</h1>
      
      <Tabs defaultValue="matches">
        <TabsList>
          <TabsTrigger value="matches">
            Matches
            {matches.length > 0 && (
              <span className="ml-2 bg-primary/10 text-primary rounded-full px-2 py-0.5 text-xs">
                {matches.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="requests">
            Requests
            {requests.length > 0 && (
              <span className="ml-2 bg-primary/10 text-primary rounded-full px-2 py-0.5 text-xs">
                {requests.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="matches" className="mt-6">
          {matches.length === 0 ? (
            <div className="text-center text-muted-foreground p-4">
              No matches yet. Start connecting with people!
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {matches.map((match) => (
                <div key={match.id} className="border rounded-lg p-4">
                  {/* TODO: Add match card component */}
                  Match card here
                </div>
              ))}
            </div>
          )}
        </TabsContent>
        
        <TabsContent value="requests" className="mt-6">
          <MatchRequests
            requests={requests}
            isResponding={isResponding}
            onRespond={(matchId, status) => respondToMatch({ matchId, status })}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
