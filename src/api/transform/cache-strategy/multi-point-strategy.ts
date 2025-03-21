import { SystemContentBlock } from "@aws-sdk/client-bedrock-runtime"
import { CacheStrategy } from "./base-strategy"
import { CacheResult, CachePointPlacement } from "./types"
import { logger } from "../../../utils/logging"

/**
 * Strategy for handling multiple cache points.
 * Creates cache points after messages as soon as uncached tokens exceed minimumTokenCount.
 */
export class MultiPointStrategy extends CacheStrategy {
	// Using logger instead of outputChannel

	public determineOptimalCachePoints(): CacheResult {
		// If prompt caching is disabled or no messages, return without cache points
		if (!this.config.usePromptCache || this.config.messages.length === 0) {
			return this.formatWithoutCachePoints()
		}

		const supportsSystemCache = this.config.modelInfo.cachableFields.includes("system")
		const supportsMessageCache = this.config.modelInfo.cachableFields.includes("messages")
		const minTokensPerPoint = this.config.modelInfo.minTokensPerCachePoint
		let remainingCachePoints: number = this.config.modelInfo.maxCachePoints

		// First, determine if we'll use a system cache point
		const useSystemCache =
			supportsSystemCache && this.config.systemPrompt && this.meetsMinTokenThreshold(this.systemTokenCount)

		// logger.debug("System cache evaluation", {
		// 	ctx: "cache-strategy",
		// 	supportsSystemCache,
		// 	hasSystemPrompt: Boolean(this.config.systemPrompt),
		// 	systemTokenCount: this.systemTokenCount,
		// 	meetsMinTokenThreshold: this.meetsMinTokenThreshold(this.systemTokenCount),
		// 	willUseSystemCache: useSystemCache,
		// })

		// Handle system blocks
		let systemBlocks: SystemContentBlock[] = []
		if (this.config.systemPrompt) {
			systemBlocks = [{ text: this.config.systemPrompt } as unknown as SystemContentBlock]
			if (useSystemCache) {
				// logger.debug("Adding system cache point", { ctx: "cache-strategy" })
				systemBlocks.push(this.createCachePoint() as unknown as SystemContentBlock)
				remainingCachePoints--
			}
		}

		// If message caching isn't supported, return with just system caching
		if (!supportsMessageCache) {
			return this.formatResult(systemBlocks, this.messagesToContentBlocks(this.config.messages))
		}

		//TODO: first remove any cachePoints?

		// Determine optimal cache point placements for messages
		// logger.debug("Config messages", {
		// 	ctx: "cache-strategy",
		// 	messages: JSON.stringify(this.config.messages),
		// })
		const placements = this.determineMessageCachePoints(minTokensPerPoint, remainingCachePoints)
		const messages = this.messagesToContentBlocks(this.config.messages)
		// logger.debug("Cache point placements", {
		// 	ctx: "cache-strategy",
		// 	placements: JSON.stringify(placements),
		// })
		let cacheResult = this.formatResult(systemBlocks, this.applyCachePoints(messages, placements))
		// logger.debug("Cache result", {
		// 	ctx: "cache-strategy",
		// 	cacheResult: JSON.stringify(cacheResult),
		// })

		return cacheResult
	}

	private determineMessageCachePoints(
		minTokensPerPoint: number,
		remainingCachePoints: number,
	): CachePointPlacement[] {
		if (this.config.messages.length <= 1) {
			return []
		}

		const placements: CachePointPlacement[] = []
		let currentIndex = 0

		while (currentIndex < this.config.messages.length && remainingCachePoints > 0) {
			// console.log(`\n--- Processing iteration ${currentIndex + 1} ---`)
			let remainingTokens = this.config.messages
				.filter((_, index) => index >= currentIndex)
				.map((m) => {
					return this.estimateTokenCount(m)
				})
				.reduce((accumulator, currentValue) => accumulator + currentValue, 0)

			//stop evaluating futher cache points if the remaining messages don't reach the mininumum for a cache point
			if (remainingTokens <= minTokensPerPoint) {
				// console.log(`Remaining tokens (${remainingTokens}) less than minimum required (${minTokensPerPoint}), stopping evaluation`)
				break
			}

			let minimTokensForRemainingCachePoints = minTokensPerPoint * remainingCachePoints
			let minumTokenMultiples = Math.ceil(remainingTokens / minimTokensForRemainingCachePoints)
			if (remainingCachePoints === 1)
				minumTokenMultiples = Math.floor(remainingTokens / minimTokensForRemainingCachePoints)

			let nextPlacement = this.config.messages
				.filter((_, index) => index >= currentIndex)
				.map((m) => {
					return { tokens: this.estimateTokenCount(m), role: m.role }
				})
				.reduce(
					(acc, curr, idx) => {
						// If we've already found a valid placement, return it
						if (acc.found) return acc

						// Add current message tokens to running total
						acc.totalTokens += curr.tokens

						// Check if we've exceeded threshold AND it's a user message
						if (acc.totalTokens >= minTokensPerPoint && curr.role === "user") {
							acc.thresholdCount++

							// If we've found enough user messages exceeding the threshold
							if (acc.thresholdCount === minumTokenMultiples) {
								return {
									...acc,
									found: true,
									index: currentIndex + idx,
								}
							}
						}

						return acc
					},
					{ found: false, totalTokens: 0, thresholdCount: 0, index: -1 },
				)

			// If we found a valid placement, add it and update state
			if (nextPlacement.found && nextPlacement.index >= 0) {
				placements.push({
					index: nextPlacement.index,
					type: "message",
					tokensCovered: nextPlacement.totalTokens,
				})
				currentIndex = nextPlacement.index + 1
				remainingCachePoints--
			} else {
				// No valid placement found in remaining messages
				break
			}
		}
		// logger.debug("********************************* Cache placements", {
		// 	ctx: "cache-strategy",
		// 	cacheResult: JSON.stringify(placements),
		// })

		return placements
	}

	private formatWithoutCachePoints(): CacheResult {
		const systemBlocks: SystemContentBlock[] = this.config.systemPrompt
			? [{ text: this.config.systemPrompt } as unknown as SystemContentBlock]
			: []

		return this.formatResult(systemBlocks, this.messagesToContentBlocks(this.config.messages))
	}
}
