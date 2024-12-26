import { CopilotRuntime, OpenAIAdapter, copilotRuntimeNodeHttpEndpoint } from '@copilotkit/runtime';
import type { Request, Response, NextFunction } from 'express';

export function setupCopilotKitEndpoint() {
	const serviceAdapter = new OpenAIAdapter({
		openAIApiKey: process.env.OPENAI_API_KEY,
		model: 'gpt-4'
	});
	
	const runtime = new CopilotRuntime({
		serviceAdapter
	});

	const handler = copilotRuntimeNodeHttpEndpoint({
		endpoint: '/copilotkit',
		runtime,
		serviceAdapter,
	});

	return async (req: Request, res: Response, next: NextFunction) => {
		try {
			const webRequest = new Request(new URL(req.url, `http://${req.headers.host}`), {
				method: req.method,
				headers: new Headers(req.headers as any),
				body: req.method !== 'GET' && req.method !== 'HEAD' ? JSON.stringify(req.body) : undefined,
			});
			
			const response = await handler({ request: webRequest });
			if (!response) {
				throw new Error('No response from CopilotKit handler');
			}
			
			const text = await response.text();
			if (!text) {
				res.json({ message: 'No content' });
				return;
			}

			try {
				const data = JSON.parse(text);
				res.json(data);
			} catch (parseError) {
				console.error('Failed to parse response:', text);
				res.status(500).json({ 
					error: 'Invalid response format',
					details: text.substring(0, 100) // Log first 100 chars of response
				});
			}
		} catch (error) {
			console.error('CopilotKit error:', error);
			res.status(500).json({ error: 'Internal server error' });
		}
	};
}