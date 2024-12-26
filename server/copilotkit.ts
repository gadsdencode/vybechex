import { createServer } from 'node:http';
import {
	CopilotRuntime,
	OpenAIAdapter,
	copilotRuntimeNodeHttpEndpoint,
} from '@copilotkit/runtime';



const serviceAdapter = new OpenAIAdapter();

const server = createServer((req, res) => {
	const runtime = new CopilotRuntime();
	const handler = copilotRuntimeNodeHttpEndpoint({
		endpoint: '/copilotkit',
		runtime,
		serviceAdapter,
	});

	return handler(req, res);
});

server.listen(4000, () => {
	console.log('Listening at http://localhost:4000/copilotkit');
});