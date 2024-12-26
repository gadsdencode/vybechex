
import {
  CopilotRuntime,
  OpenAIAdapter,
  copilotRuntimeNodeHttpEndpoint,
} from '@copilotkit/runtime';

if (!process.env.OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY environment variable is required');
}

export function setupCopilotKit(app: any) {
  const runtime = new CopilotRuntime();
  const serviceAdapter = new OpenAIAdapter();
  const handler = copilotRuntimeNodeHttpEndpoint({
    endpoint: '/copilotkit',
    runtime,
    serviceAdapter,
  });

  app.all('/copilotkit*', (req: any, res: any) => {
    return handler(req, res);
  });
}
