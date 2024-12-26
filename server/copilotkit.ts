// server/copilotkit.ts
// Purpose: Provide an isolated Copilot Runtime endpoint

import { CopilotRuntime, OpenAIAdapter, copilotRuntimeNodeHttpEndpoint } from '@copilotkit/runtime';
import type { Request, Response, NextFunction } from 'express';

export function setupCopilotKitEndpoint() {
	// Create the service adapter and runtime once
	const serviceAdapter = new OpenAIAdapter();
	const runtime = new CopilotRuntime();

	// Create the copilotkit handler
	const handler = copilotRuntimeNodeHttpEndpoint({
		endpoint: '/copilotkit',
		runtime,
		serviceAdapter,
	});

	// Return an Express-style middleware function
	return (req: Request, res: Response, next: NextFunction) => {
		const webRequest = new Request(new URL(req.url, `http://${req.headers.host}`), {
			method: req.method,
			headers: new Headers(req.headers as any),
			body: req.method !== 'GET' && req.method !== 'HEAD' ? JSON.stringify(req.body) : undefined,
		});
		return handler({ request: webRequest });
	};
}
