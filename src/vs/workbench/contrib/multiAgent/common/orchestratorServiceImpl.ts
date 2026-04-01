/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IAgentChatBridge } from './agentChatBridge.js';
import { IChatModeService } from '../../chat/common/chatModes.js';
import {
	IOrchestratorService,
	IOrchestratorTask,
	ISubTaskSuggestion,
	ITaskDecomposition,
	TaskStatus,
} from './orchestratorService.js';

const DEFAULT_MAX_CONCURRENT = 5;

export class OrchestratorServiceImpl extends Disposable implements IOrchestratorService {
	declare readonly _serviceBrand: undefined;

	private readonly _tasks = new Map<string, MutableTask>();

	private readonly _onDidChangeTask = this._register(new Emitter<IOrchestratorTask>());
	readonly onDidChangeTask: Event<IOrchestratorTask> = this._onDidChangeTask.event;

	private readonly _onDidCompleteExecution = this._register(new Emitter<{ taskId: string; summary: string }>());
	readonly onDidCompleteExecution: Event<{ taskId: string; summary: string }> = this._onDidCompleteExecution.event;

	constructor(
		@IChatModeService private readonly _chatModeService: IChatModeService,
		@IAgentChatBridge private readonly _chatBridge: IAgentChatBridge,
		@IConfigurationService private readonly _configService: IConfigurationService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
	}

	// --- Task lifecycle ---

	async submitTask(description: string): Promise<IOrchestratorTask> {
		const task = new MutableTask(generateUuid(), description);
		this._tasks.set(task.id, task);
		this._onDidChangeTask.fire(task);
		this._logService.info(`[Orchestrator] Task submitted: ${task.id} — ${description}`);
		return task;
	}

	async decomposeTask(taskId: string): Promise<ITaskDecomposition> {
		const task = this._tasks.get(taskId);
		if (!task) {
			throw new Error(`Task not found: ${taskId}`);
		}

		// Get available roles from chat modes (custom agents)
		const modes = this._chatModeService.getModes();
		const availableRoles = new Set(
			modes.custom.map(m => m.label.get().toLowerCase())
		);
		// Add standard roles if custom agents exist
		if (availableRoles.size === 0) {
			availableRoles.add('planner').add('coder').add('tester').add('reviewer');
		}

		// Try LLM-based decomposition first, fallback to hardcoded pipeline
		try {
			const decomposition = await this._decomposeViaLLM(task.description, availableRoles);
			this._logService.info(`[Orchestrator] LLM decomposed: ${taskId} → ${decomposition.subTasks.length} sub-tasks`);
			return decomposition;
		} catch (e) {
			this._logService.warn(`[Orchestrator] LLM decomposition failed, using default pipeline: ${e}`);
			const decomposition: ITaskDecomposition = {
				originalTask: task.description,
				subTasks: this._createDefaultDecomposition(task.description, availableRoles),
				executionPlan: `Decomposed "${task.description}" into sub-tasks based on available agent roles`,
			};
			return decomposition;
		}
	}

	async delegateSubTasks(taskId: string, decomposition: ITaskDecomposition): Promise<readonly IOrchestratorTask[]> {
		const parentTask = this._tasks.get(taskId);
		if (!parentTask) {
			throw new Error(`Task not found: ${taskId}`);
		}

		const subTasks: MutableTask[] = [];
		const subTaskIds: string[] = [];

		for (const suggestion of decomposition.subTasks) {
			const subTask = new MutableTask(generateUuid(), suggestion.description, taskId);
			subTask.suggestedRole = suggestion.suggestedRole;
			subTask.priority = suggestion.priority;

			// Map dependency indices to actual task IDs
			subTask.dependencies = suggestion.dependencies
				.filter(idx => idx < subTaskIds.length)
				.map(idx => subTaskIds[idx]);

			// Find an agent instance for this role, or spawn one
			const agentId = this._findAgentForRole(suggestion.suggestedRole);
			if (agentId) {
				subTask.assignedAgentId = agentId;
			}

			this._tasks.set(subTask.id, subTask);
			subTasks.push(subTask);
			subTaskIds.push(subTask.id);
			this._onDidChangeTask.fire(subTask);
		}

		parentTask.status = 'in_progress';
		this._onDidChangeTask.fire(parentTask);
		this._logService.info(`[Orchestrator] Delegated ${subTasks.length} sub-tasks for: ${taskId}`);
		return subTasks;
	}

	async executeTask(taskId: string): Promise<void> {
		const parentTask = this._tasks.get(taskId);
		if (!parentTask) {
			throw new Error(`Task not found: ${taskId}`);
		}

		const subTasks = this.getSubTasks(taskId);
		if (subTasks.length === 0) {
			// Single task, execute directly
			parentTask.status = 'completed';
			parentTask.completedAt = Date.now();
			this._onDidChangeTask.fire(parentTask);
			this._onDidCompleteExecution.fire({ taskId, summary: 'No sub-tasks to execute' });
			return;
		}

		// Execute sub-tasks respecting dependencies and concurrency
		await this._executeWithDependencies(subTasks as MutableTask[]);

		// Collect results
		const allSubTasks = this.getSubTasks(taskId);
		const allCompleted = allSubTasks.every(t => t.status === 'completed');
		const anyFailed = allSubTasks.some(t => t.status === 'failed');

		parentTask.status = allCompleted ? 'completed' : anyFailed ? 'failed' : 'completed';
		parentTask.completedAt = Date.now();
		parentTask.result = allSubTasks
			.map(t => `[${t.suggestedRole ?? 'unknown'}] ${t.status}: ${t.result ?? t.error ?? 'no result'}`)
			.join('\n');

		this._onDidChangeTask.fire(parentTask);
		this._onDidCompleteExecution.fire({
			taskId,
			summary: `${allSubTasks.filter(t => t.status === 'completed').length}/${allSubTasks.length} sub-tasks completed`,
		});
	}

	// --- Query ---

	getTask(taskId: string): IOrchestratorTask | undefined {
		return this._tasks.get(taskId);
	}

	getSubTasks(parentTaskId: string): readonly IOrchestratorTask[] {
		return Array.from(this._tasks.values()).filter(t => t.parentId === parentTaskId);
	}

	getActiveExecutions(): readonly IOrchestratorTask[] {
		return Array.from(this._tasks.values()).filter(
			t => !t.parentId && t.status === 'in_progress'
		);
	}

	// --- Control ---

	cancelTask(taskId: string): void {
		const task = this._tasks.get(taskId);
		if (!task) {
			return;
		}

		task.status = 'cancelled';
		// Cancel all sub-tasks too
		for (const subTask of this.getSubTasks(taskId) as MutableTask[]) {
			if (subTask.status === 'pending' || subTask.status === 'in_progress') {
				subTask.status = 'cancelled';
				this._onDidChangeTask.fire(subTask);
			}
		}
		this._onDidChangeTask.fire(task);
	}

	// --- Direct agent communication ---

	async sendToAgent(agentInstanceId: string, message: string): Promise<string> {
		const cts = new CancellationTokenSource();
		try {
			return await this._chatBridge.executeAgentTask(agentInstanceId, message, cts.token);
		} finally {
			cts.dispose();
		}
	}

	// --- Private helpers ---

	/**
	 * Find a chat mode matching the requested role.
	 * Returns the mode ID which can be used as an agent identifier.
	 */
	private _findAgentForRole(role: string): string | undefined {
		const modes = this._chatModeService.getModes();
		// Search custom agents for matching name/role
		const matching = modes.custom.find(m =>
			m.label.get().toLowerCase() === role.toLowerCase()
		);
		if (matching) {
			return matching.id;
		}
		this._logService.warn(`[Orchestrator] No chat mode found for role: ${role}`);
		return undefined;
	}

	private async _executeWithDependencies(tasks: MutableTask[]): Promise<void> {
		const taskMap = new Map(tasks.map(t => [t.id, t]));
		const completed = new Set<string>();
		let iterations = 0;
		const maxIterations = tasks.length * 2; // Safety valve

		while (completed.size < tasks.length && iterations < maxIterations) {
			iterations++;

			// Find ready tasks (all dependencies completed)
			const ready = tasks.filter(t =>
				t.status === 'pending' &&
				t.dependencies.every(depId => completed.has(depId))
			);

			if (ready.length === 0 && completed.size < tasks.length) {
				// Check for stuck tasks (failed dependencies)
				const stuck = tasks.filter(t => t.status === 'pending');
				for (const t of stuck) {
					const failedDep = t.dependencies.find(depId => {
						const dep = taskMap.get(depId);
						return dep && (dep.status === 'failed' || dep.status === 'cancelled');
					});
					if (failedDep) {
						t.status = 'cancelled';
						t.error = `Dependency failed: ${failedDep}`;
						completed.add(t.id);
						this._onDidChangeTask.fire(t);
					}
				}

				// Re-evaluate after cancellations — new tasks may now be ready
				continue;
			}

			// Execute ready tasks in parallel (up to max concurrent)
			const batch = ready.slice(0, DEFAULT_MAX_CONCURRENT);
			await Promise.all(batch.map(task => this._executeSingleTask(task)));

			for (const task of batch) {
				completed.add(task.id);
			}
		}
	}

	private async _executeSingleTask(task: MutableTask): Promise<void> {
		task.status = 'in_progress';
		this._onDidChangeTask.fire(task);

		const cts = new CancellationTokenSource();
		const taskTimeout = this._configService.getValue<number>('multiAgent.taskTimeout') ?? 300_000;
		const timeoutHandle = setTimeout(() => cts.cancel(), taskTimeout);

		try {
			let result: string;

			if (task.assignedAgentId) {
				// Execute via chat bridge — routes through provider rotation
				result = await this._chatBridge.executeAgentTask(
					task.assignedAgentId,
					task.description,
					cts.token,
				);
			} else {
				result = `No agent assigned for: ${task.description}`;
			}

			task.status = 'completed';
			task.completedAt = Date.now();
			task.result = result;
		} catch (e) {
			task.status = 'failed';
			task.error = e instanceof Error ? e.message : String(e);
		} finally {
			clearTimeout(timeoutHandle);
			cts.dispose();
		}

		this._onDidChangeTask.fire(task);
	}

	private static readonly DECOMPOSITION_SYSTEM_PROMPT = [
		'You are a task decomposition engine. Given a user task and available agent roles,',
		'break it down into focused sub-tasks. Output ONLY valid JSON (no markdown, no explanation):',
		'{"subTasks":[{"description":"...","suggestedRole":"...","dependencies":[0,1],"priority":0}],"executionPlan":"Brief summary"}',
		'',
		'Rules:',
		'- Each sub-task assigned to exactly one role from the available list',
		'- dependencies: array of sub-task indices (0-based) that must complete first',
		'- priority: lower number = execute first (0 is highest priority)',
		'- Keep sub-tasks focused, actionable, and specific',
		'- 2-6 sub-tasks for most tasks; more for complex multi-component work',
	].join('\n');

	/**
	 * Decompose a task using an LLM call for intelligent breakdown.
	 */
	private async _decomposeViaLLM(description: string, availableRoles: Set<string>): Promise<ITaskDecomposition> {
		const rolesStr = [...availableRoles].join(', ');
		const userMessage = `Available roles: ${rolesStr}\n\nTask to decompose:\n${description}`;

		const cts = new CancellationTokenSource();
		try {
			const response = await this._chatBridge.executeAgentTask(
				this._getOrCreateOrchestratorInstance(),
				`${OrchestratorServiceImpl.DECOMPOSITION_SYSTEM_PROMPT}\n\n${userMessage}`,
				cts.token,
			);

			// Parse JSON from response (may contain markdown code blocks)
			const jsonStr = this._extractJSON(response);
			const parsed = JSON.parse(jsonStr);

			// Validate structure
			if (!Array.isArray(parsed.subTasks) || parsed.subTasks.length === 0) {
				throw new Error('Invalid decomposition: no subTasks array');
			}

			const validRoles = [...availableRoles];
			const subTasks: ISubTaskSuggestion[] = parsed.subTasks.map((st: any, _idx: number) => ({
				description: String(st.description || ''),
				suggestedRole: validRoles.includes(st.suggestedRole) ? st.suggestedRole : validRoles[0],
				dependencies: Array.isArray(st.dependencies) ? st.dependencies.filter((d: number) => typeof d === 'number') : [],
				priority: typeof st.priority === 'number' ? st.priority : _idx,
			}));

			return {
				originalTask: description,
				subTasks,
				executionPlan: String(parsed.executionPlan || `LLM decomposed into ${subTasks.length} sub-tasks`),
			};
		} finally {
			cts.dispose();
		}
	}

	/** Extract JSON from LLM response, handling markdown code blocks */
	private _extractJSON(text: string): string {
		// Try extracting from ```json ... ``` blocks
		const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
		if (codeBlockMatch) {
			return codeBlockMatch[1].trim();
		}
		// Try finding raw JSON object
		const jsonMatch = text.match(/\{[\s\S]*\}/);
		if (jsonMatch) {
			return jsonMatch[0];
		}
		return text.trim();
	}

	/** Find a chat mode to use for decomposition LLM calls */
	private _getOrCreateOrchestratorInstance(): string {
		// Find planner mode from custom agents
		const plannerMode = this._chatModeService.findModeByName('planner');
		if (plannerMode) {
			return plannerMode.id;
		}

		// Fallback: use first custom agent
		const modes = this._chatModeService.getModes();
		if (modes.custom.length > 0) {
			return modes.custom[0].id;
		}

		// Last resort: use 'agent' built-in mode
		return 'agent';
	}

	/**
	 * Default decomposition fallback.
	 * Creates a plan→code→test pipeline.
	 */
	private _createDefaultDecomposition(description: string, availableRoles: Set<string>): ISubTaskSuggestion[] {
		const subTasks: ISubTaskSuggestion[] = [];

		if (availableRoles.has('planner')) {
			subTasks.push({
				description: `Plan implementation for: ${description}`,
				suggestedRole: 'planner',
				dependencies: [],
				priority: 0,
			});
		}

		if (availableRoles.has('coder')) {
			subTasks.push({
				description: `Implement: ${description}`,
				suggestedRole: 'coder',
				dependencies: subTasks.length > 0 ? [0] : [],
				priority: 1,
			});
		}

		if (availableRoles.has('tester')) {
			subTasks.push({
				description: `Write tests for: ${description}`,
				suggestedRole: 'tester',
				dependencies: subTasks.length > 1 ? [1] : subTasks.length > 0 ? [0] : [],
				priority: 2,
			});
		}

		if (availableRoles.has('reviewer')) {
			subTasks.push({
				description: `Review implementation of: ${description}`,
				suggestedRole: 'reviewer',
				dependencies: subTasks.length > 1 ? [1] : [],
				priority: 2,
			});
		}

		return subTasks;
	}
}

/**
 * Mutable task for internal orchestrator state.
 */
class MutableTask implements IOrchestratorTask {
	status: TaskStatus = 'pending';
	assignedAgentId?: string;
	suggestedRole?: string;
	dependencies: string[] = [];
	result?: string;
	error?: string;
	completedAt?: number;
	priority: number = 0;

	constructor(
		readonly id: string,
		readonly description: string,
		readonly parentId?: string,
		readonly createdAt: number = Date.now(),
	) { }
}
