import { CacheStrategyConfig } from "./types"
import { CacheStrategy } from "./base-strategy"
import { SinglePointStrategy } from "./single-point-strategy"
import { MultiPointStrategy } from "./multi-point-strategy"

/**
 * Factory class for creating the appropriate cache strategy based on model capabilities
 */
export class CacheStrategyFactory {
	/**
	 * Calculate total tokens in messages
	 */
	private static calculateTotalMessageTokens(config: CacheStrategyConfig): number {
		return config.messages.reduce((sum, message) => {
			if (Array.isArray(message.content)) {
				return (
					sum +
					message.content.reduce((contentSum, block) => {
						if ("text" in block) {
							return contentSum + Math.ceil(block.text.length / 4)
						}
						return contentSum
					}, 0)
				)
			}
			return sum + Math.ceil(message.content.length / 4)
		}, 0)
	}

	/**
	 * Create a cache strategy instance based on model configuration
	 */
	static createStrategy(config: CacheStrategyConfig): CacheStrategy {
		// If caching is not supported or disabled, use single point strategy
		// as it will handle the no-cache case appropriately
		if (!config.modelInfo.supportsPromptCache || !config.usePromptCache) {
			return new SinglePointStrategy(config)
		}

		// Use single point strategy if model only supports one cache point
		if (config.modelInfo.maxCachePoints <= 1) {
			return new SinglePointStrategy(config)
		}

		// For multi-point support, use multi-point strategy
		return new MultiPointStrategy(config)
	}
}

/**
 * Helper function to convert messages to Bedrock format with optimal cache points
 */
export function convertWithOptimalCaching(config: CacheStrategyConfig) {
	const strategy = CacheStrategyFactory.createStrategy(config)
	return strategy.determineOptimalCachePoints()
}
