import { SystemContentBlock, Message } from "@aws-sdk/client-bedrock-runtime"
import { CacheStrategy } from "./base-strategy"
import { CacheResult } from "./types"
import { logger } from "../../../utils/logging"

/**
 * Strategy for models that only support a single cache point.
 * Compares system prompt size vs total message size to determine optimal placement.
 */
export class SinglePointStrategy extends CacheStrategy {
	public determineOptimalCachePoints(): CacheResult {
		// If prompt caching is disabled or no messages, return without cache points
		if (!this.config.usePromptCache) {
			// logger.debug("Prompt caching disabled, skipping cache points", {
			// 	ctx: "cache-strategy",
			// 	usePromptCache: this.config.usePromptCache,
			// })
			return this.formatWithoutCachePoints()
		}

		const supportsSystemCache = this.config.modelInfo.cachableFields.includes("system")
		const supportsMessageCache = this.config.modelInfo.cachableFields.includes("messages")

		// logger.debug("Cache support evaluation", {
		// 	ctx: "cache-strategy",
		// 	supportsSystemCache,
		// 	supportsMessageCache,
		// 	cachableFields: this.config.modelInfo.cachableFields,
		// })

		// If neither system nor messages support caching, return without cache points
		if (!supportsSystemCache && !supportsMessageCache) {
			// logger.debug("No cache support available, skipping cache points", {
			// 	ctx: "cache-strategy",
			// })
			return this.formatWithoutCachePoints()
		}

		// Calculate total message tokens
		const totalMessageTokens = this.config.messages
			.map((m) => {
				return this.estimateTokenCount(m)
			})
			.reduce((accumulator, currentValue) => accumulator + currentValue, 0)

		// logger.debug("Token calculation", {
		// 	ctx: "cache-strategy",
		// 	totalMessageTokens,
		// 	systemTokenCount: this.systemTokenCount,
		// 	messageCount: this.config.messages.length,
		// })

		// Determine where to place the single cache point
		if (supportsSystemCache && this.config.systemPrompt) {
			// If system caching is supported and we have a system prompt
			if (this.meetsMinTokenThreshold(this.systemTokenCount)) {
				// If system prompt is large enough, always cache it
				// logger.debug("Using system cache point", {
				// 	ctx: "cache-strategy",
				// 	systemTokenCount: this.systemTokenCount,
				// 	minTokensRequired: this.config.modelInfo.minTokensPerCachePoint,
				// })
				return this.formatWithSystemCache()
			}
		}

		if (supportsMessageCache && this.meetsMinTokenThreshold(totalMessageTokens)) {
			// logger.debug("Using message cache point", {
			// 	ctx: "cache-strategy",
			// 	totalMessageTokens,
			// 	minTokensRequired: this.config.modelInfo.minTokensPerCachePoint,
			// })
			return this.formatWithMessageCache()
		}

		// If no conditions are met, return without cache points
		// logger.debug("No suitable cache point found, skipping cache", {
		// 	ctx: "cache-strategy",
		// })
		return this.formatWithoutCachePoints()
	}

	private formatWithoutCachePoints(): CacheResult {
		// logger.debug("Formatting without cache points", {
		// 	ctx: "cache-strategy",
		// 	hasSystemPrompt: Boolean(this.config.systemPrompt),
		// 	messageCount: this.config.messages.length,
		// })

		const systemBlocks: SystemContentBlock[] = this.config.systemPrompt
			? [{ text: this.config.systemPrompt } as unknown as SystemContentBlock]
			: []

		return this.formatResult(systemBlocks, this.messagesToContentBlocks(this.config.messages))
	}

	private formatWithSystemCache(): CacheResult {
		if (!this.config.systemPrompt) {
			// logger.debug("No system prompt available, falling back to no cache", {
			// 	ctx: "cache-strategy",
			// })
			return this.formatWithoutCachePoints()
		}

		// logger.debug("Adding cache point to system prompt", {
		// 	ctx: "cache-strategy",
		// 	systemPromptLength: this.config.systemPrompt.length,
		// 	systemTokenCount: this.systemTokenCount,
		// })

		const systemBlocks: SystemContentBlock[] = [
			{ text: this.config.systemPrompt } as unknown as SystemContentBlock,
			this.createCachePoint() as unknown as SystemContentBlock,
		]

		return this.formatResult(systemBlocks, this.messagesToContentBlocks(this.config.messages))
	}

	private formatWithMessageCache(): CacheResult {
		// logger.debug("Setting up message cache", {
		// 	ctx: "cache-strategy",
		// 	hasSystemPrompt: Boolean(this.config.systemPrompt),
		// 	messageCount: this.config.messages.length,
		// })

		const systemBlocks: SystemContentBlock[] = this.config.systemPrompt
			? [{ text: this.config.systemPrompt } as unknown as SystemContentBlock]
			: []

		// Find the optimal position for the cache point in messages
		const messages = this.messagesToContentBlocks(this.config.messages)
		let tokensSoFar = 0
		let optimalIndex = 0

		// Look for a position where we've accumulated enough tokens
		// but still have a significant portion of the conversation remaining
		for (let i = 0; i < this.config.messages.length; i++) {
			tokensSoFar += this.estimateTokenCount(this.config.messages[i])
			// logger.debug("Message token accumulation", {
			// 	ctx: "cache-strategy",
			// 	messageIndex: i,
			// 	messageRole: this.config.messages[i].role,
			// 	messageTokens: this.estimateTokenCount(this.config.messages[i]),
			// 	tokensSoFar,
			// 	minTokensRequired: this.config.modelInfo.minTokensPerCachePoint,
			// 	meetsThreshold: this.meetsMinTokenThreshold(tokensSoFar),
			// })

			if (this.meetsMinTokenThreshold(tokensSoFar)) {
				optimalIndex = i + 1 // Place cache point after this message
				break
			}
		}

		// logger.debug("Selected optimal cache point position", {
		// 	ctx: "cache-strategy",
		// 	optimalIndex,
		// 	tokensCovered: tokensSoFar,
		// 	totalMessages: this.config.messages.length,
		// })

		// Apply the cache point at the optimal position
		return this.formatResult(
			systemBlocks,
			this.applyCachePoints(messages, [
				{
					index: optimalIndex,
					type: "message",
					tokensCovered: tokensSoFar,
				},
			]),
		)
	}
}
