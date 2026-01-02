// client/src/App.tsx
// Main application component with code splitting for performance

import { Suspense, lazy } from "react";
import { Switch, Route, useLocation } from "wouter";
import { useUser } from "./hooks/use-user";
import { Loader2, AlertCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import Navigation from "./components/Navigation";
import AuthPage from "./pages/AuthPage";

// Lazy load pages to reduce initial bundle size
// Critical pages (Home) load immediately, others are code-split
const Home = lazy(() => import("./pages/Home"));
const Quiz = lazy(() => import("./pages/Quiz"));
const Matches = lazy(() => import("./pages/Matches"));
const CreateMatch = lazy(() => import("./pages/CreateMatch"));
const Chat = lazy(() => import("./pages/Chat"));
const Profile = lazy(() => import("./pages/Profile"));
const InterestsPage = lazy(() => 
  import("./pages/InterestsPage").then(m => ({ default: m.InterestsPage }))
);

// Loading fallback component
function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}

function App() {
  const { user, isLoading } = useUser();
  const [location, setLocation] = useLocation();

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
        <Suspense fallback={<PageLoader />}>
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
                  setLocation(`/chat/${params.id}`);
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
        </Suspense>
      </main>
    </div>
  );
}

export default App;
