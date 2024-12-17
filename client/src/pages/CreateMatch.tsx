import CreateMatchWizard from "@/components/CreateMatchWizard";
import { useLocation } from "wouter";

export default function CreateMatchPage() {
  const [_, setLocation] = useLocation();

  return (
    <div className="container mx-auto p-4">
      <CreateMatchWizard
        onComplete={() => setLocation("/matches")}
        onCancel={() => setLocation("/matches")}
      />
    </div>
  );
}
