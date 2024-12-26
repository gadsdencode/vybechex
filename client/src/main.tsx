import { StrictMode, ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/theme-provider";
import App from './App';
import { CopilotKit } from "@copilotkit/react-core";
import { CopilotPopup } from "@copilotkit/react-ui";
// import "./index.css";
import "./styles/globals.css"
import "@copilotkit/react-ui/styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="system" storageKey="vibe-ui-theme">
      <CopilotKit runtimeUrl="/api/copilotkit"> 
        <App />
        <CopilotPopup
        instructions={"You are assisting the user as best as you can. Answer in the best way possible given the data you have."}
        labels={{
          title: "Vybe AI",
          initial: "Need any help?",
        }}
      />
        </CopilotKit>
        <Toaster />
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
);
