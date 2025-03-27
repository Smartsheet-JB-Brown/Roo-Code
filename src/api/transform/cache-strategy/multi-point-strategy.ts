import { SystemContentBlock } from "@aws-sdk/client-bedrock-runtime"
import { CacheStrategy } from "./base-strategy"
import { CacheResult, CachePointPlacement } from "./types"
import { logger } from "../../../utils/logging"

/**
 * Strategy for handling multiple cache points.
 * Creates cache points after messages as soon as uncached tokens exceed minimumTokenCount.
 */
export class MultiPointStrategy extends CacheStrategy {
	/**
	 * Determine optimal cache point placements and return the formatted result
	 */
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

		// Handle system blocks
		let systemBlocks: SystemContentBlock[] = []
		if (this.config.systemPrompt) {
			systemBlocks = [{ text: this.config.systemPrompt } as unknown as SystemContentBlock]
			if (useSystemCache) {
				systemBlocks.push(this.createCachePoint() as unknown as SystemContentBlock)
				remainingCachePoints--
			}
		}

		// If message caching isn't supported, return with just system caching
		if (!supportsMessageCache) {
			return this.formatResult(systemBlocks, this.messagesToContentBlocks(this.config.messages))
		}

		// Determine optimal cache point placements for messages
		const placements = this.determineMessageCachePoints(minTokensPerPoint, remainingCachePoints)
		const messages = this.messagesToContentBlocks(this.config.messages)
		let cacheResult = this.formatResult(systemBlocks, this.applyCachePoints(messages, placements))

		// Store the placements for future use (to maintain consistency across consecutive messages)
		// This needs to be handled by the caller by passing these placements back in the next call
		cacheResult.messageCachePointPlacements = placements

		return cacheResult
	}

	/**
	 * Determine optimal cache point placements for messages
	 *
	 * @param minTokensPerPoint Minimum tokens required per cache point
	 * @param remainingCachePoints Number of cache points available
	 * @returns Array of cache point placements
	 */
	private determineMessageCachePoints(
		minTokensPerPoint: number,
		remainingCachePoints: number,
	): CachePointPlacement[] {
		if (this.config.messages.length <= 1) {
			return []
		}

		// Check if we have previous cache point placements
		const previousPlacements = this.config.previousCachePointPlacements || []

		// If we have previous placements and this is a growing conversation,
		// analyze if we should combine any previous cache points
		if (
			previousPlacements.length > 0 &&
			this.config.messages.length > previousPlacements[previousPlacements.length - 1].index + 1
		) {
			// This is a growing conversation with new messages added
			return this.determineGrowingConversationPlacements(
				minTokensPerPoint,
				remainingCachePoints,
				previousPlacements,
			)
		}

		// For new conversations or when previous placements aren't applicable,
		// use the standard algorithm
		return this.determineNewConversationPlacements(minTokensPerPoint, remainingCachePoints)
	}

	/**
	 * Determine cache point placements for a growing conversation
	 * This method analyzes previous placements and decides whether to keep them,
	 * combine them, or reallocate them based on the new message distribution
	 */
	private determineGrowingConversationPlacements(
		minTokensPerPoint: number,
		remainingCachePoints: number,
		previousPlacements: CachePointPlacement[],
	): CachePointPlacement[] {
		const placements: CachePointPlacement[] = []
		const totalMessages = this.config.messages.length

		// Calculate total tokens in the conversation
		const totalTokens = this.config.messages.reduce((acc, curr) => acc + this.estimateTokenCount(curr), 0)

		// Calculate tokens in new messages (added since last cache point placement)
		const lastPreviousIndex = previousPlacements[previousPlacements.length - 1].index
		const newMessagesTokens = this.config.messages
			.slice(lastPreviousIndex + 1)
			.reduce((acc, curr) => acc + this.estimateTokenCount(curr), 0)

		// If new messages have enough tokens for a cache point, we need to decide
		// whether to keep all previous cache points or combine some
		if (newMessagesTokens >= minTokensPerPoint) {
			// If we have enough cache points for all previous placements plus a new one, keep them all
			if (remainingCachePoints > previousPlacements.length) {
				// Keep all previous placements
				for (const placement of previousPlacements) {
					if (placement.index < totalMessages) {
						placements.push(placement)
					}
				}

				// Add a new placement for the new messages
				const newPlacement = this.findOptimalPlacementForRange(
					lastPreviousIndex + 1,
					totalMessages - 1,
					minTokensPerPoint,
				)

				if (newPlacement) {
					placements.push(newPlacement)
				}
			} else {
				// We need to decide which previous cache points to keep and which to combine
				// Strategy: If two consecutive cache points are close together, combine them

				// First, analyze the token distribution between previous cache points
				const tokensBetweenPlacements: number[] = []
				let startIdx = 0

				for (const placement of previousPlacements) {
					const tokens = this.config.messages
						.slice(startIdx, placement.index + 1)
						.reduce((acc, curr) => acc + this.estimateTokenCount(curr), 0)

					tokensBetweenPlacements.push(tokens)
					startIdx = placement.index + 1
				}

				// Find the two consecutive placements with the smallest token gap
				let smallestGapIndex = 0
				let smallestGap = Number.MAX_VALUE

				for (let i = 0; i < tokensBetweenPlacements.length - 1; i++) {
					const gap = tokensBetweenPlacements[i] + tokensBetweenPlacements[i + 1]
					if (gap < smallestGap) {
						smallestGap = gap
						smallestGapIndex = i
					}
				}

				// Combine the two placements with the smallest gap
				for (let i = 0; i < previousPlacements.length; i++) {
					if (i !== smallestGapIndex && i !== smallestGapIndex + 1) {
						// Keep this placement
						if (previousPlacements[i].index < totalMessages) {
							placements.push(previousPlacements[i])
						}
					} else if (i === smallestGapIndex) {
						// Replace with a combined placement
						const combinedEndIndex = previousPlacements[i + 1].index
						const combinedTokens = tokensBetweenPlacements[i] + tokensBetweenPlacements[i + 1]

						// Find the optimal placement within this combined range
						const startOfRange = i === 0 ? 0 : previousPlacements[i - 1].index + 1
						const combinedPlacement = this.findOptimalPlacementForRange(
							startOfRange,
							combinedEndIndex,
							minTokensPerPoint,
						)

						if (combinedPlacement) {
							placements.push(combinedPlacement)
						}

						// Skip the next placement as we've combined it
						i++
					}
				}

				// If we freed up a cache point, use it for the new messages
				if (placements.length < remainingCachePoints) {
					const newPlacement = this.findOptimalPlacementForRange(
						lastPreviousIndex + 1,
						totalMessages - 1,
						minTokensPerPoint,
					)

					if (newPlacement) {
						placements.push(newPlacement)
					}
				}
			}

			return placements
		} else {
			// New messages don't have enough tokens for a cache point
			// Keep all previous placements that are still valid
			for (const placement of previousPlacements) {
				if (placement.index < totalMessages) {
					placements.push(placement)
				}
			}

			return placements
		}
	}

	/**
	 * Find the optimal placement for a cache point within a specified range of messages
	 */
	private findOptimalPlacementForRange(
		startIndex: number,
		endIndex: number,
		minTokensPerPoint: number,
	): CachePointPlacement | null {
		if (startIndex >= endIndex) {
			return null
		}

		// Calculate total tokens in the range
		const rangeTokens = this.config.messages
			.slice(startIndex, endIndex + 1)
			.reduce((acc, curr) => acc + this.estimateTokenCount(curr), 0)

		if (rangeTokens < minTokensPerPoint) {
			return null
		}

		// Find the midpoint of the range in terms of tokens
		const targetTokens = rangeTokens / 2
		let accumulatedTokens = 0
		let bestIndex = -1
		let bestTokenDiff = Number.MAX_VALUE

		// Find the user message closest to the midpoint
		for (let i = startIndex; i <= endIndex; i++) {
			const message = this.config.messages[i]
			accumulatedTokens += this.estimateTokenCount(message)

			if (message.role === "user") {
				const tokenDiff = Math.abs(accumulatedTokens - targetTokens)
				if (tokenDiff < bestTokenDiff) {
					bestTokenDiff = tokenDiff
					bestIndex = i
				}
			}
		}

		if (bestIndex >= 0) {
			return {
				index: bestIndex,
				type: "message",
				tokensCovered: accumulatedTokens,
			}
		}

		return null
	}

	/**
	 * Determine cache point placements for a new conversation
	 * This is the standard algorithm for placing cache points
	 */
	private determineNewConversationPlacements(
		minTokensPerPoint: number,
		remainingCachePoints: number,
	): CachePointPlacement[] {
		const placements: CachePointPlacement[] = []
		let currentIndex = 0

		while (currentIndex < this.config.messages.length && remainingCachePoints > 0) {
			let remainingTokens = this.config.messages
				.filter((_, index) => index >= currentIndex)
				.map((m) => {
					return this.estimateTokenCount(m)
				})
				.reduce((accumulator, currentValue) => accumulator + currentValue, 0)

			// Stop evaluating further cache points if the remaining messages don't reach the minimum for a cache point
			if (remainingTokens <= minTokensPerPoint) {
				break
			}

			// Add 1 to remainingCachePoints to lower the minumTokenMultiples value,
			// which results in cache points being placed earlier and more frequently.
			// This ensures better utilization of available cache points throughout the conversation.
			// For detailed examples and analysis, see cline_docs/cache-strategy-documentation.md
			let minimTokensForRemainingCachePoints = minTokensPerPoint * (remainingCachePoints + 1)

			// Hybrid approach: Use Math.ceil for first cache point, Math.floor for subsequent placements
			// This ensures a strategic placement of the first cache point while maximizing utilization of remaining points
			let minumTokenMultiples =
				placements.length === 0
					? Math.ceil(remainingTokens / minimTokensForRemainingCachePoints)
					: Math.floor(remainingTokens / minimTokensForRemainingCachePoints)

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

		return placements
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
}
