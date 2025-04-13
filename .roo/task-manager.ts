import * as fs from "fs/promises"
import * as path from "path"

interface TaskCheckpoint {
	id: string
	commit_hash: string
	description: string
	component: string
	changes: string[]
	risks: string[]
	expected_feedback: string[]
	timestamp: string
}

interface TaskContext {
	task_id: string
	active_checkpoint: string
	status: "in_progress" | "completed" | "failed"
	created_at: string
	last_accessed: string
	description: string
	initial_commit: string
	checkpoints: TaskCheckpoint[]
	test_results: {
		unit_tests: {
			passing: number
			failing: number
			pending: number
		}
		linting: string
		manual_testing: string
	}
	pending_decisions: string[]
	rollback_info: {
		full_rollback: string
		partial_rollbacks: Record<string, string>
	}
}

class TaskManager {
	private currentTaskId: string | null = null
	private currentContext: TaskContext | null = null
	private readonly logsDir = path.join(".roo", "prepare_logs")

	constructor() {
		this.ensureLogsDirectory()
	}

	private async ensureLogsDirectory() {
		try {
			await fs.mkdir(this.logsDir, { recursive: true })
		} catch (error) {
			console.error("Failed to create logs directory:", error)
		}
	}

	async switchTask(taskId: string): Promise<void> {
		if (this.currentTaskId) {
			await this.saveCurrentTask()
		}
		await this.loadTask(taskId)
	}

	private async saveCurrentTask(): Promise<void> {
		if (!this.currentTaskId || !this.currentContext) return

		this.currentContext.last_accessed = new Date().toISOString()
		const logPath = this.getLogPath(this.currentTaskId)

		await fs.writeFile(logPath, JSON.stringify(this.currentContext, null, 2), "utf-8")
	}

	private async loadTask(taskId: string): Promise<void> {
		const logPath = this.getLogPath(taskId)

		try {
			const content = await fs.readFile(logPath, "utf-8")
			this.currentContext = JSON.parse(content)
			this.currentTaskId = taskId
		} catch (error) {
			console.error(`Failed to load task ${taskId}:`, error)
			throw error
		}
	}

	async createTask(taskId: string, description: string, initialCommit: string): Promise<void> {
		const newTask: TaskContext = {
			task_id: taskId,
			active_checkpoint: "",
			status: "in_progress",
			created_at: new Date().toISOString(),
			last_accessed: new Date().toISOString(),
			description,
			initial_commit: initialCommit,
			checkpoints: [],
			test_results: {
				unit_tests: { passing: 0, failing: 0, pending: 0 },
				linting: "",
				manual_testing: "",
			},
			pending_decisions: [],
			rollback_info: {
				full_rollback: `git reset --hard ${initialCommit}`,
				partial_rollbacks: {},
			},
		}

		const logPath = this.getLogPath(taskId)
		await fs.writeFile(logPath, JSON.stringify(newTask, null, 2), "utf-8")

		this.currentTaskId = taskId
		this.currentContext = newTask
	}

	async addCheckpoint(checkpoint: TaskCheckpoint): Promise<void> {
		if (!this.currentContext) throw new Error("No active task")

		this.currentContext.checkpoints.push(checkpoint)
		this.currentContext.active_checkpoint = checkpoint.id
		this.currentContext.rollback_info.partial_rollbacks[checkpoint.description.toLowerCase().replace(/\s+/g, "_")] =
			`git checkout ${checkpoint.commit_hash}`

		await this.saveCurrentTask()
	}

	async updateTestResults(results: TaskContext["test_results"]): Promise<void> {
		if (!this.currentContext) throw new Error("No active task")

		this.currentContext.test_results = results
		await this.saveCurrentTask()
	}

	async addPendingDecision(decision: string): Promise<void> {
		if (!this.currentContext) throw new Error("No active task")

		this.currentContext.pending_decisions.push(decision)
		await this.saveCurrentTask()
	}

	async resolvePendingDecision(index: number): Promise<void> {
		if (!this.currentContext) throw new Error("No active task")

		this.currentContext.pending_decisions.splice(index, 1)
		await this.saveCurrentTask()
	}

	getCurrentTask(): TaskContext | null {
		return this.currentContext
	}

	private getLogPath(taskId: string): string {
		return path.join(this.logsDir, `${taskId}.json`)
	}

	async listTasks(): Promise<string[]> {
		const files = await fs.readdir(this.logsDir)
		return files.filter((file) => file.endsWith(".json")).map((file) => file.replace(".json", ""))
	}
}

export const taskManager = new TaskManager()
