#!/usr/bin/env node
import { program } from "commander"
import { taskManager } from "./task-manager"
import * as fs from "fs/promises"
import * as path from "path"
import { execSync } from "child_process"

program.name("prepare").description("CLI to manage prepare for commit tasks")

program
	.command("create <taskId>")
	.description("Create a new task")
	.requiredOption("-d, --description <description>", "Task description")
	.action(async (taskId: string, options: { description: string }) => {
		try {
			const initialCommit = execSync("git rev-parse HEAD").toString().trim()
			await taskManager.createTask(taskId, options.description, initialCommit)
			console.log(`Created task: ${taskId}`)
		} catch (error) {
			console.error("Failed to create task:", error)
			process.exit(1)
		}
	})

program
	.command("switch <taskId>")
	.description("Switch to a different task")
	.action(async (taskId: string) => {
		try {
			await taskManager.switchTask(taskId)
			const task = taskManager.getCurrentTask()
			console.log(`Switched to task: ${taskId}`)
			console.log("Current checkpoint:", task?.active_checkpoint)
			if (task?.pending_decisions.length) {
				console.log("\nPending decisions:")
				task.pending_decisions.forEach((decision, i) => {
					console.log(`${i + 1}. ${decision}`)
				})
			}
		} catch (error) {
			console.error("Failed to switch task:", error)
			process.exit(1)
		}
	})

program
	.command("list")
	.description("List all tasks")
	.action(async () => {
		try {
			const tasks = await taskManager.listTasks()
			console.log("Available tasks:")
			for (const taskId of tasks) {
				const content = await fs.readFile(path.join(".roo", "prepare_logs", `${taskId}.json`), "utf-8")
				const task = JSON.parse(content)
				console.log(`- ${taskId}: ${task.description} (${task.status})`)
			}
		} catch (error) {
			console.error("Failed to list tasks:", error)
			process.exit(1)
		}
	})

program
	.command("status")
	.description("Show current task status")
	.action(() => {
		const task = taskManager.getCurrentTask()
		if (!task) {
			console.log("No active task")
			return
		}

		console.log(`Current task: ${task.task_id}`)
		console.log(`Description: ${task.description}`)
		console.log(`Status: ${task.status}`)
		console.log(`Active checkpoint: ${task.active_checkpoint}`)

		if (task.pending_decisions.length) {
			console.log("\nPending decisions:")
			task.pending_decisions.forEach((decision, i) => {
				console.log(`${i + 1}. ${decision}`)
			})
		}

		console.log("\nTest results:")
		console.log(
			`- Unit tests: ${task.test_results.unit_tests.passing} passing, ${task.test_results.unit_tests.failing} failing`,
		)
		console.log(`- Linting: ${task.test_results.linting}`)
		console.log(`- Manual testing: ${task.test_results.manual_testing}`)

		console.log("\nRollback info:")
		console.log(`Full rollback: ${task.rollback_info.full_rollback}`)
		console.log("Partial rollbacks:")
		Object.entries(task.rollback_info.partial_rollbacks).forEach(([name, command]) => {
			console.log(`- ${name}: ${command}`)
		})
	})

program
	.command("checkpoint")
	.description("Create a new checkpoint")
	.requiredOption("-d, --description <description>", "Checkpoint description")
	.requiredOption("-c, --component <component>", "Component being modified")
	.requiredOption("--changes <changes...>", "List of changes")
	.requiredOption("--risks <risks...>", "List of risks")
	.requiredOption("--feedback <feedback...>", "Expected user feedback")
	.action(async (options) => {
		try {
			const commitHash = execSync("git rev-parse HEAD").toString().trim()
			const task = taskManager.getCurrentTask()
			if (!task) throw new Error("No active task")

			const checkpoint = {
				id: `${task.task_id}_${task.checkpoints.length + 1}`,
				commit_hash: commitHash,
				description: options.description,
				component: options.component,
				changes: options.changes,
				risks: options.risks,
				expected_feedback: options.feedback,
				timestamp: new Date().toISOString(),
			}

			await taskManager.addCheckpoint(checkpoint)
			console.log(`Created checkpoint: ${checkpoint.id}`)
		} catch (error) {
			console.error("Failed to create checkpoint:", error)
			process.exit(1)
		}
	})

program
	.command("decide <index>")
	.description("Resolve a pending decision")
	.action(async (index: string) => {
		try {
			const idx = parseInt(index, 10) - 1
			await taskManager.resolvePendingDecision(idx)
			console.log("Decision resolved")
		} catch (error) {
			console.error("Failed to resolve decision:", error)
			process.exit(1)
		}
	})

program.parse()
