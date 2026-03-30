/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IRequestService } from '../../../../platform/request/common/request.js';
import { ISecretStorageService } from '../../../../platform/secrets/common/secrets.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ChatMessageRole, IChatMessage } from '../../chat/common/languageModels.js';
import { ApiFormat, IMultiAgentProviderService, IProviderAccount } from './multiAgentProviderService.js';
import { ApiFormatTranslator, IProviderStreamChunk } from './apiFormatTranslator.js';

export const IDirectProviderClient = createDecorator<IDirectProviderClient>('IDirectProviderClient');

export interface IDirectProviderClient {
	readonly _serviceBrand: undefined;

	/**
	 * Send an LLM request directly to a provider API via HTTP.
	 * Handles format translation, SSE streaming, and quota extraction.
	 */
	sendRequest(
		account: IProviderAccount,
		messages: IChatMessage[],
		modelId: string,
		token: CancellationToken,
		onChunk?: (text: string) => void,
	): Promise<string>;
}

const SECRET_KEY_PREFIX = 'multiAgent.credential.';

export class DirectProviderClientImpl extends Disposable implements IDirectProviderClient {
	declare readonly _serviceBrand: undefined;

	private readonly _translator = new ApiFormatTranslator();

	constructor(
		@IRequestService private readonly _requestService: IRequestService,
		@ISecretStorageService private readonly _secretStorageService: ISecretStorageService,
		@IMultiAgentProviderService private readonly _providerService: IMultiAgentProviderService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
	}

	async sendRequest(
		account: IProviderAccount,
		messages: IChatMessage[],
		modelId: string,
		token: CancellationToken,
		onChunk?: (text: string) => void,
	): Promise<string> {
		const provider = this._providerService.getProvider(account.providerId);
		if (!provider) {
			throw new Error(`Provider not found: ${account.providerId}`);
		}

		// Get API key from secure storage
		const apiKey = await this._secretStorageService.get(`${SECRET_KEY_PREFIX}${account.id}`);
		if (!apiKey) {
			throw new Error(`No API key found for account: ${account.label}`);
		}

		const format = provider.apiFormat;

		// Build provider-specific request via translator
		const providerRequest = this._translator.toProviderRequest(
			messages, modelId, apiKey, format, provider.baseUrl,
		);

		this._logService.info(`[DirectClient] Sending request: provider=${provider.name}, model=${modelId}, format=${format}`);

		// Execute HTTP request
		const response = await this._requestService.request({
			type: 'POST',
			url: providerRequest.url,
			headers: providerRequest.headers,
			data: providerRequest.body,
			callSite: 'multiAgent.directProviderClient',
		}, token);

		// Check for error status
		if (response.res.statusCode && response.res.statusCode >= 400) {
			if (response.res.statusCode === 429) {
				throw new Error('429: Rate limit exceeded');
			}
			throw new Error(`HTTP ${response.res.statusCode} from ${provider.name}`);
		}

		// Extract quota from response headers (safely handle string[] values)
		const safeHeaders: Record<string, string> = {};
		for (const [key, value] of Object.entries(response.res.headers)) {
			safeHeaders[key] = Array.isArray(value) ? value[0] : String(value ?? '');
		}
		const quotaInfo = this._translator.extractQuota(safeHeaders, format);
		if (Object.keys(quotaInfo).length > 0) {
			this._providerService.updateAccountQuota(account.id, quotaInfo);
		}

		// Parse SSE stream with cancellation support
		const responseText = await this._parseSSEStream(response.stream, format, token, onChunk);

		// Usage reporting is handled by AgentChatBridge (avoid double-reporting)
		return responseText;
	}

	/**
	 * Parse an SSE stream from a VSBufferReadableStream.
	 * SSE format: lines starting with "data: " followed by JSON.
	 */
	private async _parseSSEStream(
		stream: import('../../../../base/common/buffer.js').VSBufferReadableStream,
		format: ApiFormat,
		token: CancellationToken,
		onChunk?: (text: string) => void,
	): Promise<string> {
		return new Promise<string>((resolve, reject) => {
			let responseText = '';
			let buffer = '';
			let resolved = false;

			const finish = (text: string) => {
				if (!resolved) { resolved = true; resolve(text); }
			};
			const fail = (err: Error) => {
				if (!resolved) { resolved = true; reject(err); }
			};

			// Cancel support
			const onCancel = token.onCancellationRequested(() => {
				fail(new Error('Request cancelled'));
				onCancel.dispose();
			});

			stream.on('data', (chunk) => {
				if (resolved) { return; }
				buffer += chunk.toString();

				const lines = buffer.split('\n');
				buffer = lines.pop() ?? '';

				for (const line of lines) {
					const trimmed = line.trim();
					if (!trimmed || trimmed.startsWith(':')) { continue; }

					if (trimmed.startsWith('data: ')) {
						const parsed: IProviderStreamChunk = this._translator.parseStreamChunk(trimmed.slice(6), format);
						if (parsed.text) {
							responseText += parsed.text;
							onChunk?.(parsed.text);
						}
						if (parsed.done) {
							onCancel.dispose();
							finish(responseText);
							return;
						}
					}
				}
			});

			stream.on('error', (err) => { onCancel.dispose(); fail(err instanceof Error ? err : new Error(String(err))); });
			stream.on('end', () => { onCancel.dispose(); finish(responseText); });
		});
	}

	private _messageLength(message: IChatMessage): number {
		if (!message.content) {
			return 0;
		}
		return message.content.reduce((sum, part) => {
			if (part.type === 'text') {
				return sum + (part as { type: 'text'; value: string }).value.length;
			}
			return sum;
		}, 0);
	}
}
