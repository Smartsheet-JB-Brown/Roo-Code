import { SystemContentBlock, Message } from "@aws-sdk/client-bedrock-runtime"
import { CacheStrategy } from "./base-strategy"
import { CacheResult } from "./types"
import { logger } from "../../../utils/logging"

/**
 * Strategy for models that only support a single cache point.
 * Compares system prompt size vs total message size to determine optimal placement.
 */
export class SinglePointStrategy extends CacheStrategy {
	/**
	 * Determine optimal cache point placements and return the formatted result
	 */
	public determineOptimalCachePoints(): CacheResult {
		// If prompt caching is disabled or no messages, return without cache points
		if (!this.config.usePromptCache) {
			return this.formatWithoutCachePoints()
		}

		const supportsSystemCache = this.config.modelInfo.cachableFields.includes("system")
		const supportsMessageCache = this.config.modelInfo.cachableFields.includes("messages")

		// If neither system nor messages support caching, return without cache points
		if (!supportsSystemCache && !supportsMessageCache) {
			return this.formatWithoutCachePoints()
		}

		// Calculate total message tokens
		const totalMessageTokens = this.config.messages
			.map((m) => {
				return this.estimateTokenCount(m)
			})
			.reduce((accumulator, currentValue) => accumulator + currentValue, 0)

		// Determine where to place the single cache point
		if (supportsSystemCache && this.config.systemPrompt) {
			// If system caching is supported and we have a system prompt
			if (this.meetsMinTokenThreshold(this.systemTokenCount)) {
				// If system prompt is large enough, always cache it
				return this.formatWithSystemCache()
			}
		}

		if (supportsMessageCache && this.meetsMinTokenThreshold(totalMessageTokens)) {
			return this.formatWithMessageCache()
		}

		// If no conditions are met, return without cache points
		return this.formatWithoutCachePoints()
	}

	/**
	 * Format result without cache points
	 *
	 * @returns Cache result without cache points
	 */
	private formatWithoutCachePoints(): CacheResult {
		const systemBlocks: SystemContentBlock[] = this.config.systemPrompt
			? [{ text: this.config.systemPrompt } as unknown as SystemContentBlock]
			: []

		return this.formatResult(systemBlocks, this.messagesToContentBlocks(this.config.messages))
	}

	/**
	 * Format result with system cache point
	 *
	 * @returns Cache result with system cache point
	 */
	private formatWithSystemCache(): CacheResult {
		if (!this.config.systemPrompt) {
			return this.formatWithoutCachePoints()
		}

		const systemBlocks: SystemContentBlock[] = [
			{ text: this.config.systemPrompt } as unknown as SystemContentBlock,
			this.createCachePoint() as unknown as SystemContentBlock,
		]

		return this.formatResult(systemBlocks, this.messagesToContentBlocks(this.config.messages))
	}

	/**
	 * Format result with message cache point
	 *
	 * @returns Cache result with message cache point
	 */
	private formatWithMessageCache(): CacheResult {
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

			if (this.meetsMinTokenThreshold(tokensSoFar)) {
				optimalIndex = i + 1 // Place cache point after this message
				break
			}
		}

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
