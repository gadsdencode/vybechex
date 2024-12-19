import { ProfileProgress } from "@/components/ProfileProgress";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useUser } from "@/hooks/use-user";
import { Loader2 } from "lucide-react";

export default function ProfilePage() {
  const { user, isLoading } = useUser();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="max-w-4xl mx-auto space-y-8">
        <Card>
          <CardHeader>
            <CardTitle>Your Profile</CardTitle>
            <CardDescription>
              Complete your profile to unlock achievements and earn rewards
            </CardDescription>
          </CardHeader>
        </Card>

        <ProfileProgress />
      </div>
    </div>
  );
}
