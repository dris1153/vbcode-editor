/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../../../nls.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { ViewPaneContainer } from '../../../browser/parts/views/viewPaneContainer.js';
import { Extensions as ViewExtensions, IViewContainersRegistry, IViewsRegistry, ViewContainerLocation } from '../../../common/views.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { KeybindingsRegistry, KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';

// --- Service registrations ---
import { IMultiAgentProviderService } from '../common/multiAgentProviderService.js';
import { MultiAgentProviderServiceImpl } from '../common/multiAgentProviderServiceImpl.js';
import { IAgentLaneService } from '../common/agentLaneService.js';
import { AgentLaneServiceImpl } from '../common/agentLaneServiceImpl.js';
import { IOrchestratorService } from '../common/orchestratorService.js';
import { OrchestratorServiceImpl } from '../common/orchestratorServiceImpl.js';
import { IProviderRotationService } from '../common/providerRotationService.js';
import { ProviderRotationServiceImpl } from '../common/providerRotationServiceImpl.js';
import { AgentChatBridgeImpl, IAgentChatBridge } from '../common/agentChatBridge.js';
import { DirectProviderClientImpl, IDirectProviderClient } from '../common/directProviderClient.js';

// --- View imports ---
import { ProvidersViewPane } from './providersViewPane.js';
import { AgentLanesViewPane } from './agentLanesViewPane.js';

// --- Register services (lazy instantiation) ---
registerSingleton(IMultiAgentProviderService, MultiAgentProviderServiceImpl, InstantiationType.Delayed);
registerSingleton(IAgentLaneService, AgentLaneServiceImpl, InstantiationType.Delayed);
registerSingleton(IOrchestratorService, OrchestratorServiceImpl, InstantiationType.Delayed);
registerSingleton(IProviderRotationService, ProviderRotationServiceImpl, InstantiationType.Delayed);
registerSingleton(IAgentChatBridge, AgentChatBridgeImpl, InstantiationType.Delayed);
registerSingleton(IDirectProviderClient, DirectProviderClientImpl, InstantiationType.Delayed);

import { IProviderPickerService, ProviderPickerServiceImpl } from './providerPickerService.js';
registerSingleton(IProviderPickerService, ProviderPickerServiceImpl, InstantiationType.Delayed);

// --- Icons ---
const multiAgentViewIcon = registerIcon('multi-agent-view-icon', Codicon.sparkle, localize('multiAgentViewIcon', 'Icon for the Multi-Agent view container'));

// --- View Container ---
const VIEW_CONTAINER_ID = 'workbench.views.multiAgent';

const multiAgentViewContainer = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry)
	.registerViewContainer({
		id: VIEW_CONTAINER_ID,
		title: localize2('multiAgent', "AI Agents"),
		ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [VIEW_CONTAINER_ID, { mergeViewWithContainerWhenSingleView: false }]),
		icon: multiAgentViewIcon,
		order: 8,
		hideIfEmpty: false,
	}, ViewContainerLocation.Sidebar, { doNotRegisterOpenCommand: false });

// --- Views ---
Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).registerViews([
	{
		id: ProvidersViewPane.ID,
		name: localize2('providers', "Providers"),
		ctorDescriptor: new SyncDescriptor(ProvidersViewPane),
		canToggleVisibility: true,
		canMoveView: true,
		order: 1,
		weight: 40,
		collapsed: false,
	},
	{
		id: AgentLanesViewPane.ID,
		name: localize2('agentLanes', "Agent Lanes"),
		ctorDescriptor: new SyncDescriptor(AgentLanesViewPane),
		canToggleVisibility: true,
		canMoveView: true,
		order: 2,
		weight: 60,
		collapsed: false,
	},
], multiAgentViewContainer);

// --- Auto-register spawned agents as chat participants ---
import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { AgentCreationWizard } from './agentCreationWizard.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';

class MultiAgentAutoRegisterContribution extends Disposable {
	static readonly ID = 'workbench.contrib.multiAgentAutoRegister';

	private readonly _registrations = new Map<string, IDisposable>();

	constructor(
		@IAgentLaneService private readonly _agentLaneService: IAgentLaneService,
		@IAgentChatBridge private readonly _chatBridge: IAgentChatBridge,
	) {
		super();

		// Single listener: register new agents, unregister removed ones
		this._register(this._agentLaneService.onDidChangeInstances(() => {
			const activeInstances = this._agentLaneService.getAgentInstances();
			const activeIds = new Set(activeInstances.map(i => i.id));

			// Register new agents
			for (const instance of activeInstances) {
				if (!this._registrations.has(instance.id)) {
					const registration = this._chatBridge.registerAgent(instance.definitionId, instance.id);
					this._registrations.set(instance.id, registration);
				}
			}

			// Unregister removed agents
			for (const [id, registration] of this._registrations) {
				if (!activeIds.has(id)) {
					registration.dispose();
					this._registrations.delete(id);
				}
			}
		}));

		// Auto-spawn built-in agents so they're @mentionable immediately
		for (const def of this._agentLaneService.getBuiltInAgents()) {
			try {
				this._agentLaneService.spawnAgent(def.id);
			} catch {
				// Ignore if max agents reached
			}
		}
	}

	override dispose(): void {
		for (const registration of this._registrations.values()) {
			registration.dispose();
		}
		this._registrations.clear();
		super.dispose();
	}
}
registerWorkbenchContribution2(MultiAgentAutoRegisterContribution.ID, MultiAgentAutoRegisterContribution, WorkbenchPhase.AfterRestored);

// --- Commands ---
const COMMAND_OPEN_PROVIDERS = 'workbench.action.multiAgent.openProviders';
const COMMAND_OPEN_AGENT_LANES = 'workbench.action.multiAgent.openAgentLanes';
const COMMAND_CREATE_AGENT = 'workbench.action.multiAgent.createAgent';

CommandsRegistry.registerCommand(COMMAND_OPEN_PROVIDERS, async (accessor) => {
	const viewsService = accessor.get(IViewsService);
	await viewsService.openView(ProvidersViewPane.ID, true);
});

CommandsRegistry.registerCommand(COMMAND_OPEN_AGENT_LANES, async (accessor) => {
	const viewsService = accessor.get(IViewsService);
	await viewsService.openView(AgentLanesViewPane.ID, true);
});

// COMMAND_CREATE_AGENT is registered via registerAction2 (AddAgentAction) below

// --- Keybindings ---
KeybindingsRegistry.registerKeybindingRule({
	id: COMMAND_OPEN_PROVIDERS,
	weight: KeybindingWeight.WorkbenchContrib,
	primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.F9,
	handler: (accessor) => {
		accessor.get(ICommandService).executeCommand(COMMAND_OPEN_PROVIDERS);
	},
});

KeybindingsRegistry.registerKeybindingRule({
	id: COMMAND_OPEN_AGENT_LANES,
	weight: KeybindingWeight.WorkbenchContrib,
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.F10,
	handler: (accessor) => {
		accessor.get(ICommandService).executeCommand(COMMAND_OPEN_AGENT_LANES);
	},
});

// --- View Title Toolbar Actions ---
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';

const COMMAND_STOP_ALL_AGENTS = 'workbench.action.multiAgent.stopAllAgents';

registerAction2(class AddAgentAction extends Action2 {
	constructor() {
		super({
			id: COMMAND_CREATE_AGENT,
			title: localize2('addAgent', "Add Agent"),
			icon: Codicon.add,
			menu: [{
				id: MenuId.ViewTitle,
				group: 'navigation',
				when: ContextKeyExpr.equals('view', AgentLanesViewPane.ID),
				order: 1,
			}],
		});
	}
	run(accessor: ServicesAccessor) {
		const wizard = new AgentCreationWizard(
			accessor.get(IQuickInputService),
			accessor.get(IAgentLaneService),
			accessor.get(IMultiAgentProviderService),
		);
		return wizard.run();
	}
});

registerAction2(class StopAllAgentsAction extends Action2 {
	constructor() {
		super({
			id: COMMAND_STOP_ALL_AGENTS,
			title: localize2('stopAllAgents', "Stop All Agents"),
			icon: Codicon.debugStop,
			menu: [{
				id: MenuId.ViewTitle,
				group: 'navigation',
				when: ContextKeyExpr.equals('view', AgentLanesViewPane.ID),
				order: 2,
			}],
		});
	}
	run(accessor: ServicesAccessor) {
		const agentLaneService = accessor.get(IAgentLaneService);
		for (const instance of agentLaneService.getAgentInstances()) {
			agentLaneService.terminateAgent(instance.id);
		}
	}
});

// --- Provider Picker (Chat Input) ---
const COMMAND_SELECT_PROVIDER = 'workbench.action.multiAgent.selectProvider';

registerAction2(class SelectProviderAction extends Action2 {
	constructor() {
		super({
			id: COMMAND_SELECT_PROVIDER,
			title: localize2('selectProvider', "Select AI Provider"),
			icon: Codicon.cloudUpload,
			menu: [{
				id: MenuId.ChatInput,
				group: 'navigation',
				order: -1, // Before other items
			}],
		});
	}
	run(accessor: ServicesAccessor) {
		return accessor.get(IProviderPickerService).showPicker();
	}
});

// --- Default Agent Override (route chat through our system when non-Copilot selected) ---
class MultiAgentDefaultOverrideContribution extends Disposable {
	static readonly ID = 'workbench.contrib.multiAgentDefaultOverride';

	private _defaultRegistration: IDisposable | undefined;

	constructor(
		@IProviderPickerService private readonly _pickerService: IProviderPickerService,
		@IAgentLaneService private readonly _agentLaneService: IAgentLaneService,
		@IAgentChatBridge private readonly _chatBridge: IAgentChatBridge,
	) {
		super();

		// When provider changes, toggle orchestrator as default agent
		this._register(this._pickerService.onDidChangeProvider((providerId) => {
			if (providerId !== 'copilot') {
				this._registerOrchestratorAsDefault();
			} else {
				this._unregisterDefault();
			}
		}));
	}

	private _registerOrchestratorAsDefault(): void {
		if (this._defaultRegistration) {
			return; // Already registered
		}

		// Find or spawn orchestrator agent and register with isDefault=true
		const definitions = this._agentLaneService.getAgentDefinitions();
		const plannerDef = definitions.find(d => d.role === 'planner') ?? definitions[0];
		if (!plannerDef) {
			return;
		}

		// Ensure an instance exists
		let instance = this._agentLaneService.getAgentInstances().find(
			i => i.definitionId === plannerDef.id
		);
		if (!instance) {
			instance = this._agentLaneService.spawnAgent(plannerDef.id);
		}

		// Register as default chat agent (overwrites Copilot as default)
		this._defaultRegistration = this._chatBridge.registerAgent(plannerDef.id, instance.id, true);
	}

	private _unregisterDefault(): void {
		this._defaultRegistration?.dispose();
		this._defaultRegistration = undefined;
	}

	override dispose(): void {
		this._unregisterDefault();
		super.dispose();
	}
}
registerWorkbenchContribution2(MultiAgentDefaultOverrideContribution.ID, MultiAgentDefaultOverrideContribution, WorkbenchPhase.AfterRestored);

// --- Configuration ---
Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	id: 'multiAgent',
	title: localize('multiAgent.config', 'Multi-Agent'),
	type: 'object',
	properties: {
		'multiAgent.enabled': {
			type: 'boolean',
			default: true,
			description: localize('multiAgent.enabled', 'Enable multi-agent orchestrator features'),
			scope: ConfigurationScope.APPLICATION,
		},
		'multiAgent.maxConcurrentAgents': {
			type: 'number',
			default: 10,
			minimum: 1,
			maximum: 20,
			description: localize('multiAgent.maxConcurrentAgents', 'Maximum number of concurrent agent instances'),
			scope: ConfigurationScope.APPLICATION,
		},
		'multiAgent.defaultModel': {
			type: 'string',
			default: 'claude-sonnet-4',
			description: localize('multiAgent.defaultModel', 'Default model for new agents'),
			scope: ConfigurationScope.APPLICATION,
		},
		'multiAgent.rotationStrategy': {
			type: 'string',
			enum: ['priority', 'round-robin', 'cost-optimized'],
			default: 'priority',
			description: localize('multiAgent.rotationStrategy', 'Provider account rotation strategy when quota is exceeded'),
			scope: ConfigurationScope.APPLICATION,
		},
		'multiAgent.taskTimeout': {
			type: 'number',
			default: 300000,
			minimum: 30000,
			description: localize('multiAgent.taskTimeout', 'Task timeout in milliseconds (default: 5 minutes)'),
			scope: ConfigurationScope.APPLICATION,
		},
		'multiAgent.orchestrator.enabled': {
			type: 'boolean',
			default: true,
			description: localize('multiAgent.orchestrator.enabled', 'Enable orchestrator for automatic task decomposition and delegation'),
			scope: ConfigurationScope.APPLICATION,
		},
		'multiAgent.quotaRefreshInterval': {
			type: 'number',
			default: 60000,
			minimum: 10000,
			description: localize('multiAgent.quotaRefreshInterval', 'Quota refresh interval in milliseconds (default: 60 seconds)'),
			scope: ConfigurationScope.APPLICATION,
		},
	},
});
