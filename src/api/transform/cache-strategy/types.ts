import { Anthropic } from "@anthropic-ai/sdk"
import { ContentBlock, SystemContentBlock, ConversationRole, Message } from "@aws-sdk/client-bedrock-runtime"

export interface ModelInfo {
	maxTokens: number
	contextWindow: number
	supportsPromptCache: boolean
	maxCachePoints: number
	minTokensPerCachePoint: number
	cachableFields: Array<"system" | "messages" | "tools">
}

export interface CachePoint {
	type: "default"
}

export interface CacheResult {
	system: SystemContentBlock[] // Changed from optional to required
	messages: Message[]
}

// Represents the position and metadata for a cache point
export interface CachePointPlacement {
	index: number // Where to insert the cache point
	type: "system" | "message"
	tokensCovered: number // Number of tokens this cache point covers
}

// Configuration for the caching strategy
export interface CacheStrategyConfig {
	modelInfo: ModelInfo
	systemPrompt?: string
	messages: Anthropic.Messages.MessageParam[]
	usePromptCache: boolean
}
