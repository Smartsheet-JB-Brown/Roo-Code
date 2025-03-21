import { Anthropic } from "@anthropic-ai/sdk"
import { ContentBlock, SystemContentBlock, Message, ConversationRole } from "@aws-sdk/client-bedrock-runtime"
import { CacheStrategyConfig, CacheResult, CachePointPlacement } from "./types"
import { logger } from "../../../utils/logging"

export abstract class CacheStrategy {
	protected config: CacheStrategyConfig
	protected systemTokenCount: number = 0

	constructor(config: CacheStrategyConfig) {
		this.config = config
		this.initializeMessageGroups()
		this.calculateSystemTokens()
	}

	/**
	 * Determine optimal cache point placements and return the formatted result
	 */
	public abstract determineOptimalCachePoints(): CacheResult

	/**
	 * Initialize message groups from the input messages
	 */
	protected initializeMessageGroups(): void {
		if (!this.config.messages.length) return
	}

	/**
	 * Calculate token count for system prompt
	 */
	protected calculateSystemTokens(): void {
		if (this.config.systemPrompt) {
			// Account for repeated text in the system prompt
			const fullText = this.config.systemPrompt
			this.systemTokenCount = Math.ceil(fullText.length / 4)
			// logger.debug("System token count", {
			// 	ctx: "cache-strategy",
			// 	systemTokenCount: this.systemTokenCount,
			// })
		}
	}

	/**
	 * Create a cache point content block
	 */
	protected createCachePoint(): ContentBlock {
		return { cachePoint: { type: "default" } } as unknown as ContentBlock
	}

	/**
	 * Convert messages to content blocks
	 */
	protected messagesToContentBlocks(messages: Anthropic.Messages.MessageParam[]): Message[] {
		// logger.debug("Converting Messages to Content Blocks", {
		// 	ctx: "cache-strategy",
		// 	messageCount: messages.length,
		// })

		return messages.map((message, index) => {
			// logger.debug(`Processing message`, {
			// 	ctx: "cache-strategy",
			// 	messageIndex: index + 1,
			// 	role: message.role,
			// })

			const role: ConversationRole = message.role === "assistant" ? "assistant" : "user"

			// logger.debug("Content type analysis", {
			// 	ctx: "cache-strategy",
			// 	contentType: Array.isArray(message.content) ? "array" : "string",
			// })

			const content: ContentBlock[] = Array.isArray(message.content)
				? message.content.map((block, blockIndex) => {
						// logger.debug(`Processing content block`, {
						// 	ctx: "cache-strategy",
						// 	blockIndex: blockIndex + 1,
						// 	block,
						// })
						if (typeof block === "string") {
							// logger.debug("Converting string block to ContentBlock", { ctx: "cache-strategy" })
							return { text: block } as unknown as ContentBlock
						}
						if ("text" in block) {
							// logger.debug("Converting text block to ContentBlock", { ctx: "cache-strategy" })
							return { text: block.text } as unknown as ContentBlock
						}
						// Handle other content types if needed
						// logger.debug("Unsupported content type, using placeholder", { ctx: "cache-strategy" })
						return { text: "[Unsupported Content]" } as unknown as ContentBlock
					})
				: [{ text: message.content } as unknown as ContentBlock]

			const result = {
				role,
				content,
			}
			// logger.debug("Converted message", {
			// 	ctx: "cache-strategy",
			// 	result,
			// })
			return result
		})
	}

	/**
	 * Check if a token count meets the minimum threshold for caching
	 */
	protected meetsMinTokenThreshold(tokenCount: number): boolean {
		const minTokens = this.config.modelInfo.minTokensPerCachePoint
		if (!minTokens) {
			return false
		}
		return tokenCount >= minTokens
	}

	/**
	 * Estimate token count for a message
	 * This is a simple estimation - in a real implementation you'd want to use
	 * a more accurate token counting method
	 */
	protected estimateTokenCount(message: Anthropic.Messages.MessageParam): number {
		if (Array.isArray(message.content)) {
			return message.content.reduce((sum, content) => {
				if ("text" in content) {
					return sum + Math.ceil(content.text.length / 4)
				}
				return sum
			}, 0)
		}
		return Math.ceil(message.content.length / 4)
	}

	/**
	 * Apply cache points to content blocks based on placements
	 */
	protected applyCachePoints(messages: Message[], placements: CachePointPlacement[]): Message[] {
		const result: Message[] = []

		for (let i = 0; i < messages.length; i++) {
			const placement = placements.find((p) => p.index === i)

			if (placement) {
				messages[i].content?.push(this.createCachePoint())
			}
			result.push(messages[i])
		}

		return result
	}

	/**
	 * Format the final result with cache points applied
	 */
	protected formatResult(systemBlocks: SystemContentBlock[] = [], messages: Message[]): CacheResult {
		// logger.debug("Formatting Final Result", {
		// 	ctx: "cache-strategy",
		// 	systemBlocksCount: systemBlocks.length,
		// 	systemBlocks: systemBlocks.length > 0 ? systemBlocks : undefined,
		// })

		// logger.debug("Message structure overview", {
		// 	ctx: "cache-strategy",
		// 	messageCount: messages.length,
		// })

		// messages.forEach((msg, index) => {
		// 	logger.debug(`Message details`, {
		// 		ctx: "cache-strategy",
		// 		messageIndex: index + 1,
		// 		role: msg.role,
		// 		content: msg.content,
		// 		hasCachePoint: "cachePoint" in msg ? msg.cachePoint : undefined,
		// 	})
		// })

		const result = {
			system: systemBlocks,
			messages,
		}
		// logger.debug("Final formatted result", {
		// 	ctx: "cache-strategy",
		// 	result,
		// })
		return result
	}
}
