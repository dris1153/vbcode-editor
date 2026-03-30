/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/multiAgent.css';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { IViewPaneOptions, ViewPane } from '../../../browser/parts/views/viewPane.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { IChatMode, IChatModeService } from '../../chat/common/chatModes.js';
import { ChatModeKind } from '../../chat/common/constants.js';
import * as dom from '../../../../base/browser/dom.js';

/**
 * Agent Lanes view — reads from VS Code's IChatModeService to display
 * all chat modes/custom agents in a unified view synchronized with the Chat picker.
 */
export class AgentLanesViewPane extends ViewPane {

	static readonly ID = 'workbench.views.multiAgent.agentLanes';

	private _bodyContainer: HTMLElement | undefined;
	private readonly _bodyDisposables = this._register(new DisposableStore());

	constructor(
		options: IViewPaneOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@IHoverService hoverService: IHoverService,
		@IChatModeService private readonly _chatModeService: IChatModeService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);
		this._bodyContainer = container;
		container.classList.add('multi-agent-lanes-view');
		this._renderContent();

		// Re-render when chat modes change (agent created/deleted/updated)
		this._bodyDisposables.add(this._chatModeService.onDidChangeChatModes(() => this._renderContent()));
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
		if (this._bodyContainer) {
			this._bodyContainer.style.height = `${height}px`;
		}
	}

	private _renderContent(): void {
		if (!this._bodyContainer) {
			return;
		}
		dom.clearNode(this._bodyContainer);

		const wrapper = dom.append(this._bodyContainer, dom.$('.agent-lanes-content'));
		const modes = this._chatModeService.getModes();

		// Built-in modes section
		this._renderBuiltinModes(wrapper, modes.builtin);

		// Custom agents section
		this._renderCustomAgents(wrapper, modes.custom);
	}

	private _renderBuiltinModes(container: HTMLElement, modes: readonly IChatMode[]): void {
		const section = dom.append(container, dom.$('.tracking-board'));
		const header = dom.append(section, dom.$('.tracking-board-header'));
		header.textContent = `Built-in Modes (${modes.length})`;

		const list = dom.append(section, dom.$('.available-agents-list'));
		for (const mode of modes) {
			const item = dom.append(list, dom.$('.available-agent-item'));
			const label = mode.label.get();
			const kind = mode.kind;
			item.textContent = label;
			item.title = mode.description.get() ?? '';

			// Highlight Agent mode
			if (kind === ChatModeKind.Agent) {
				item.classList.add('agent-card-running');
			}
		}
	}

	private _renderCustomAgents(container: HTMLElement, agents: readonly IChatMode[]): void {
		const section = dom.append(container, dom.$('.tracking-board'));
		const header = dom.append(section, dom.$('.tracking-board-header'));
		header.textContent = `Custom Agents (${agents.length})`;

		if (agents.length === 0) {
			const empty = dom.append(section, dom.$('.tracking-board-empty'));
			empty.textContent = 'No custom agents. Use "Configure Custom Agents..." in Chat to create one.';
			return;
		}

		const grid = dom.append(section, dom.$('.agent-cards-grid'));
		for (const agent of agents) {
			this._renderAgentCard(grid, agent);
		}
	}

	private _renderAgentCard(container: HTMLElement, mode: IChatMode): void {
		const card = dom.append(container, dom.$('.agent-card'));
		card.classList.add('agent-card-idle');

		// Header
		const cardHeader = dom.append(card, dom.$('.agent-card-header'));

		const icon = mode.icon.get();
		if (icon) {
			const iconEl = dom.append(cardHeader, dom.$('.agent-state-icon'));
			iconEl.classList.add(`codicon-${icon.id}`);
		}

		const nameEl = dom.append(cardHeader, dom.$('.agent-card-name'));
		nameEl.textContent = mode.label.get();

		const kindEl = dom.append(cardHeader, dom.$('.agent-card-role'));
		kindEl.textContent = mode.isBuiltin ? mode.kind : 'custom agent';

		// Description
		const desc = mode.description.get();
		if (desc) {
			const descEl = dom.append(card, dom.$('.agent-card-model'));
			descEl.textContent = desc;
		}

		// Model info
		const model = mode.model?.get();
		if (model) {
			const modelEl = dom.append(card, dom.$('.agent-card-provider'));
			const modelStr = Array.isArray(model) ? model.join(', ') : String(model);
			modelEl.textContent = `Model: ${modelStr}`;
		}

		// Source info (file path)
		const uri = mode.uri?.get();
		if (uri) {
			const sourceEl = dom.append(card, dom.$('.agent-card-tokens'));
			sourceEl.textContent = uri.fsPath.split(/[/\\]/).pop() ?? '';
			sourceEl.title = uri.fsPath;
		}
	}
}
