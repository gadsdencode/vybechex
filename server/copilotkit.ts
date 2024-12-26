
import { createServer } from 'node:http';
import {
  CopilotRuntime,
  OpenAIAdapter,
  copilotRuntimeNodeHttpEndpoint,
} from '@copilotkit/runtime';

if (!process.env.OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY environment variable is required');
}

const serviceAdapter = new OpenAIAdapter({
  apiKey: process.env.OPENAI_API_KEY
});

const server = createServer((req, res) => {
  const runtime = new CopilotRuntime();
  const handler = copilotRuntimeNodeHttpEndpoint({
    endpoint: '/copilotkit',
    runtime,
    serviceAdapter,
  });

  return handler(req, res);
});

server.listen(4000, '0.0.0.0', () => {
  console.log('CopilotKit server listening at http://0.0.0.0:4000/copilotkit');
});
