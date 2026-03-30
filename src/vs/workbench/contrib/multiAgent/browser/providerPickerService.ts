/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IQuickInputService, IQuickPickItem } from '../../../../platform/quickinput/common/quickInput.js';
import { localize } from '../../../../nls.js';
import { IMultiAgentProviderService } from '../common/multiAgentProviderService.js';

export const IProviderPickerService = createDecorator<IProviderPickerService>('IProviderPickerService');

/**
 * Manages the selected AI provider for chat. When a non-Copilot provider is
 * selected, chat requests route through our multi-agent system.
 */
export interface IProviderPickerService {
	readonly _serviceBrand: undefined;

	/** Currently selected provider ID. 'copilot' = default Copilot flow. */
	readonly selectedProviderId: string;

	/** Whether a non-Copilot provider is active */
	readonly isMultiAgentActive: boolean;

	/** Show provider picker QuickPick */
	showPicker(): Promise<void>;

	/** Set provider programmatically */
	selectProvider(providerId: string): void;

	readonly onDidChangeProvider: Event<string>;
}

const COPILOT_PROVIDER_ID = 'copilot';

export class ProviderPickerServiceImpl extends Disposable implements IProviderPickerService {
	declare readonly _serviceBrand: undefined;

	private _selectedProviderId: string = COPILOT_PROVIDER_ID;

	private readonly _onDidChangeProvider = this._register(new Emitter<string>());
	readonly onDidChangeProvider: Event<string> = this._onDidChangeProvider.event;

	get selectedProviderId(): string {
		return this._selectedProviderId;
	}

	get isMultiAgentActive(): boolean {
		return this._selectedProviderId !== COPILOT_PROVIDER_ID;
	}

	constructor(
		@IQuickInputService private readonly _quickInputService: IQuickInputService,
		@IMultiAgentProviderService private readonly _providerService: IMultiAgentProviderService,
	) {
		super();
	}

	async showPicker(): Promise<void> {
		const providers = this._providerService.getProviders();

		const items: IQuickPickItem[] = [
			{
				label: 'Copilot',
				description: this._selectedProviderId === COPILOT_PROVIDER_ID ? localize('active', "(active)") : '',
				detail: localize('copilot.detail', "GitHub Copilot — default AI provider"),
			},
			{ label: '', kind: -1 } as any, // separator
			...providers.map(p => {
				const accounts = this._providerService.getAccounts(p.id);
				return {
					label: p.name,
					description: this._selectedProviderId === p.id ? localize('active', "(active)") : '',
					detail: `${accounts.length} account(s) — ${p.supportedModels.length} models`,
				};
			}),
		];

		const picked = await this._quickInputService.pick(items, {
			title: localize('providerPicker.title', "Select AI Provider"),
			placeHolder: localize('providerPicker.placeholder', "Choose which AI provider to use for chat"),
		});

		if (!picked) {
			return;
		}

		if (picked.label === 'Copilot') {
			this.selectProvider(COPILOT_PROVIDER_ID);
		} else {
			const provider = providers.find(p => p.name === picked.label);
			if (provider) {
				this.selectProvider(provider.id);
			}
		}
	}

	selectProvider(providerId: string): void {
		if (this._selectedProviderId === providerId) {
			return;
		}
		this._selectedProviderId = providerId;
		this._onDidChangeProvider.fire(providerId);
	}
}
