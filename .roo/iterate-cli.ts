#!/usr/bin/env node
import { program } from "commander"
import { taskManager } from "./task-manager"
import { execSync } from "child_process"

program.name("iterate").description("CLI to manage task iterations")

program
	.command("create <taskId>")
	.description("Create a new iteration")
	.requiredOption("-d, --description <description>", "Task description")
	.action(async (taskId: string, options: { description: string }) => {
		try {
			await taskManager.createIteration(taskId, options.description)
			console.log(`Created iteration: ${taskId}`)
		} catch (error) {
			console.error("Failed to create iteration:", error)
			process.exit(1)
		}
	})

program
	.command("list")
	.description("List all iterations")
	.action(async () => {
		try {
			const iterations = await taskManager.listIterations()
			console.log("Available iterations:")
			for (const taskId of iterations) {
				const task = await taskManager.getIteration(taskId)
				if (task) {
					console.log(`- ${taskId}: ${task.description} (${task.current_state.status})`)
				}
			}
		} catch (error) {
			console.error("Failed to list iterations:", error)
			process.exit(1)
		}
	})

program
	.command("status <taskId>")
	.description("Show iteration status")
	.action(async (taskId: string) => {
		try {
			const task = await taskManager.getIteration(taskId)
			if (!task) {
				console.log("No such iteration")
				return
			}

			console.log(`Iteration: ${task.task_id}`)
			console.log(`Description: ${task.description}`)
			console.log(`Status: ${task.current_state.status}`)

			if (task.checkpoints.length > 0) {
				console.log("\nCheckpoints:")
				task.checkpoints.forEach((checkpoint, i) => {
					console.log(`${i + 1}. ${checkpoint.description}`)
					console.log(`   Changes: ${checkpoint.changes.join(", ")}`)
					console.log(`   Timestamp: ${checkpoint.timestamp}`)
				})
			}

			if (task.test_results) {
				console.log("\nTest results:")
				console.log(
					`- Unit tests: ${task.test_results.unit_tests.passing} passing, ${task.test_results.unit_tests.failing} failing`,
				)
				console.log(`- Linting: ${task.test_results.linting}`)
				console.log(`- Manual testing: ${task.test_results.manual_testing}`)
			}

			if (task.current_state.final_commit) {
				console.log("\nCommit info:")
				console.log(`- Hash: ${task.current_state.final_commit.hash}`)
				console.log(`- Message: ${task.current_state.final_commit.message}`)
				console.log("- Changes:")
				task.current_state.final_commit.changes.forEach((change) => {
					console.log(`  * ${change}`)
				})
			}
		} catch (error) {
			console.error("Failed to get iteration status:", error)
			process.exit(1)
		}
	})

program
	.command("checkpoint <taskId>")
	.description("Create a new checkpoint")
	.requiredOption("-d, --description <description>", "Checkpoint description")
	.requiredOption("-c, --component <component>", "Component being modified")
	.requiredOption("--changes <changes...>", "List of changes")
	.requiredOption("--risks <risks...>", "List of risks")
	.requiredOption("--feedback <feedback...>", "Expected user feedback")
	.action(async (taskId: string, options) => {
		try {
			const checkpoint = {
				id: `checkpoint_${Date.now()}`,
				description: options.description,
				component: options.component,
				changes: options.changes,
				risks: options.risks,
				expected_feedback: options.feedback,
				timestamp: new Date().toISOString(),
			}

			await taskManager.addCheckpoint(taskId, checkpoint)
			console.log(`Created checkpoint: ${checkpoint.id}`)
		} catch (error) {
			console.error("Failed to create checkpoint:", error)
			process.exit(1)
		}
	})

program
	.command("complete <taskId>")
	.description("Complete an iteration with commit info")
	.requiredOption("--message <message>", "Commit message")
	.requiredOption("--changes <changes...>", "List of changes")
	.action(async (taskId: string, options) => {
		try {
			const hash = execSync("git rev-parse HEAD").toString().trim()
			await taskManager.completeIteration(taskId, {
				hash,
				message: options.message,
				changes: options.changes,
			})
			console.log(`Completed iteration: ${taskId}`)
		} catch (error) {
			console.error("Failed to complete iteration:", error)
			process.exit(1)
		}
	})

program.parse()
