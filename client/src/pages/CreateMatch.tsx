import CreateMatchWizard from "@/components/CreateMatchWizard";
import { useLocation } from "wouter";

export default function CreateMatchPage() {
  const [location, setLocation] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  const matchId = searchParams.get('id');

  return (
    <div className="container mx-auto p-4">
      <CreateMatchWizard
        initialMatchId={matchId}
        onComplete={() => setLocation("/matches")}
        onCancel={() => setLocation("/matches")}
      />
    </div>
  );
}
