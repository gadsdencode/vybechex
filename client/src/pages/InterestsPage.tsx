import { InterestTagger } from "@/components/InterestTagger";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function InterestsPage() {
  return (
    <div className="container mx-auto py-8">
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Manage Your Interests</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Add and manage your interests to help us find better matches for you. Rate each interest to indicate how important it is to you.
          </p>
        </CardContent>
      </Card>
      
      <InterestTagger />
    </div>
  );
}
