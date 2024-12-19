import { Switch, Route, useLocation } from "wouter";
import { useUser } from "./hooks/use-user";
import { Loader2, AlertCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import Home from "./pages/Home";
import Quiz from "./pages/Quiz";
import Matches from "./pages/Matches";
import CreateMatch from "./pages/CreateMatch";
import Chat from "./pages/Chat";
import { InterestsPage } from "./pages/InterestsPage";
import Navigation from "./components/Navigation";
import AuthPage from "./pages/AuthPage";
import Profile from "./pages/Profile";

function App() {
  const { user, isLoading } = useUser();
  const [location] = useLocation();

  // Show loading spinner while checking authentication
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Redirect to auth page if not logged in
  if (!user && location !== '/login' && location !== '/register') {
    return <AuthPage />;
  }

  // Main app layout for authenticated users
  return (
    <div className="min-h-screen bg-background">
      {user && <Navigation />}
      <main className="container mx-auto px-4 py-8">
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/quiz" component={Quiz} />
          <Route path="/matches" component={Matches} />
          <Route path="/matches/create" component={CreateMatch} />
          <Route path="/chat/:id" component={Chat} />
          <Route path="/interests" component={InterestsPage} />
          <Route path="/profile" component={Profile} />
          <Route path="/matches/create/:id">
            {(params) => {
              if (user) {
                window.location.href = `/chat/${params.id}`;
              }
              return null;
            }}
          </Route>
          <Route>
            <div className="flex items-center justify-center min-h-[60vh]">
              <Card className="w-full max-w-md">
                <CardContent className="pt-6">
                  <div className="flex mb-4 gap-2">
                    <AlertCircle className="h-8 w-8 text-red-500" />
                    <h1 className="text-2xl font-bold text-gray-900">404 Page Not Found</h1>
                  </div>
                  <p className="mt-4 text-sm text-gray-600">
                    The page you're looking for doesn't exist.
                  </p>
                </CardContent>
              </Card>
            </div>
          </Route>
        </Switch>
      </main>
    </div>
  );
}

export default App;
