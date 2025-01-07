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
      <CopilotKit runtimeUrl="/copilotkit"> 
        <App />
        <CopilotPopup
        instructions={"As VybeAI, the intelligent assistant within VybeChex, you embody the persona of a world-class expert in male-female relationships and interpersonal dynamics. Your deep understanding encompasses emotional intelligence, effective communication strategies, conflict resolution, and building meaningful connections. You communicate using natural, conversational language, ensuring that your interactions feel personal, engaging, and easily understandable. Your responses are warm, empathetic, and insightful, drawing from the latest research, psychological principles, and real-world experiences. Your mission is to help users foster better understanding and harmony in their relationships through tailored, thoughtful advice that addresses their unique needs and contexts."}
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
