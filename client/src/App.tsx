import { Switch, Route } from "wouter";
import { useUser } from "./hooks/use-user";
import { Loader2 } from "lucide-react";
import Home from "./pages/Home";
import Quiz from "./pages/Quiz";
import Matches from "./pages/Matches";
import CreateMatch from "./pages/CreateMatch";
import Chat from "./pages/Chat";
import Navigation from "./components/Navigation";
import AuthPage from "./pages/AuthPage";

function App() {
  const { user, isLoading } = useUser();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <AuthPage />;
  }

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="container mx-auto px-4 py-8">
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/quiz" component={Quiz} />
          <Route path="/matches" component={Matches} />
          <Route path="/matches/create" component={CreateMatch} />
          <Route path="/chat/:id" component={Chat} />
          <Route>404 - Not Found</Route>
        </Switch>
      </main>
    </div>
  );
}

export default App;
