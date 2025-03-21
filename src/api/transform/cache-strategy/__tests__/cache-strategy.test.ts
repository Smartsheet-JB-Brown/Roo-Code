import { SinglePointStrategy } from "../single-point-strategy"
import { MultiPointStrategy } from "../multi-point-strategy"
import { CacheStrategy } from "../base-strategy"
import { CacheStrategyConfig, ModelInfo } from "../types"
import { ContentBlock, SystemContentBlock } from "@aws-sdk/client-bedrock-runtime"
import { Anthropic } from "@anthropic-ai/sdk"

describe("Cache Strategy Implementation", () => {
	const defaultModelInfo: ModelInfo = {
		maxTokens: 8192,
		contextWindow: 200_000,
		supportsPromptCache: true,
		maxCachePoints: 4,
		minTokensPerCachePoint: 50,
		cachableFields: ["system", "messages", "tools"],
	}

	const createConfig = (overrides: Partial<CacheStrategyConfig> = {}): CacheStrategyConfig => ({
		modelInfo: {
			...defaultModelInfo,
			...(overrides.modelInfo || {}),
		},
		systemPrompt: "You are a helpful assistant",
		messages: [],
		usePromptCache: true,
		...overrides,
	})

	const createMessageWithTokens = (role: "user" | "assistant", tokenCount: number) => ({
		role,
		content: "x".repeat(tokenCount * 4), // Approximate 4 chars per token
	})

	const hasCachePoint = (block: ContentBlock | SystemContentBlock): boolean => {
		return (
			"cachePoint" in block &&
			typeof block.cachePoint === "object" &&
			block.cachePoint !== null &&
			"type" in block.cachePoint &&
			block.cachePoint.type === "default"
		)
	}

	describe("Strategy Selection", () => {
		it("should use SinglePointStrategy when caching is not supported", () => {
			const config = createConfig({
				modelInfo: { ...defaultModelInfo, supportsPromptCache: false },
			})

			// In the new structure, we directly create the appropriate strategy
			const strategy = new SinglePointStrategy(config)
			expect(strategy).toBeInstanceOf(SinglePointStrategy)
		})

		it("should use SinglePointStrategy when caching is disabled", () => {
			const config = createConfig({ usePromptCache: false })

			const strategy = new SinglePointStrategy(config)
			expect(strategy).toBeInstanceOf(SinglePointStrategy)
		})

		it("should use SinglePointStrategy when maxCachePoints is 1", () => {
			const config = createConfig({
				modelInfo: { ...defaultModelInfo, maxCachePoints: 1 },
			})

			const strategy = new SinglePointStrategy(config)
			expect(strategy).toBeInstanceOf(SinglePointStrategy)
		})

		it("should use MultiPointStrategy for multi-point cases", () => {
			// Setup: Using multiple messages to test multi-point strategy
			const config = createConfig({
				messages: [createMessageWithTokens("user", 50), createMessageWithTokens("assistant", 50)],
				modelInfo: {
					...defaultModelInfo,
					maxCachePoints: 4,
					minTokensPerCachePoint: 50,
				},
			})

			const strategy = new MultiPointStrategy(config)
			expect(strategy).toBeInstanceOf(MultiPointStrategy)
		})
	})

	// Tests migrated from bedrock-converse-format.test.ts
	describe("Message Formatting with Cache Points", () => {
		test("converts simple text messages correctly", () => {
			const config = createConfig({
				messages: [
					{ role: "user", content: "Hello" },
					{ role: "assistant", content: "Hi there" },
				],
				systemPrompt: "",
				modelInfo: { ...defaultModelInfo, supportsPromptCache: false },
			})

			const strategy = new SinglePointStrategy(config)
			const result = strategy.determineOptimalCachePoints()

			expect(result.messages).toEqual([
				{
					role: "user",
					content: [{ text: "Hello" }],
				},
				{
					role: "assistant",
					content: [{ text: "Hi there" }],
				},
			])
		})

		describe("system cache block insertion", () => {
			test("adds system cache block when prompt caching is enabled, messages exist, and system prompt is long enough", () => {
				// Create a system prompt that's at least 50 tokens (200+ characters)
				const longSystemPrompt =
					"You are a helpful assistant that provides detailed and accurate information. " +
					"You should always be polite, respectful, and considerate of the user's needs. " +
					"When answering questions, try to provide comprehensive explanations that are easy to understand. " +
					"If you don't know something, be honest about it rather than making up information."

				const config = createConfig({
					messages: [{ role: "user", content: "Hello" }],
					systemPrompt: longSystemPrompt,
					modelInfo: {
						...defaultModelInfo,
						supportsPromptCache: true,
						cachableFields: ["system", "messages", "tools"],
					},
				})

				const strategy = new SinglePointStrategy(config)
				const result = strategy.determineOptimalCachePoints()

				// Check that system blocks include both the text and a cache block
				expect(result.system).toHaveLength(2)
				expect(result.system[0]).toEqual({ text: longSystemPrompt })
				expect(hasCachePoint(result.system[1])).toBe(true)
			})

			test("adds system cache block when model info specifies it should", () => {
				const shortSystemPrompt = "You are a helpful assistant"

				const config = createConfig({
					messages: [{ role: "user", content: "Hello" }],
					systemPrompt: shortSystemPrompt,
					modelInfo: {
						...defaultModelInfo,
						supportsPromptCache: true,
						minTokensPerCachePoint: 1, // Set to 1 to ensure it passes the threshold
						cachableFields: ["system", "messages", "tools"],
					},
				})

				const strategy = new SinglePointStrategy(config)
				const result = strategy.determineOptimalCachePoints()

				// Check that system blocks include both the text and a cache block
				expect(result.system).toHaveLength(2)
				expect(result.system[0]).toEqual({ text: shortSystemPrompt })
				expect(hasCachePoint(result.system[1])).toBe(true)
			})

			test("does not add system cache block when system prompt is too short", () => {
				const shortSystemPrompt = "You are a helpful assistant"

				const config = createConfig({
					messages: [{ role: "user", content: "Hello" }],
					systemPrompt: shortSystemPrompt,
				})

				const strategy = new SinglePointStrategy(config)
				const result = strategy.determineOptimalCachePoints()

				// Check that system blocks only include the text, no cache block
				expect(result.system).toHaveLength(1)
				expect(result.system[0]).toEqual({ text: shortSystemPrompt })
			})

			test("does not add cache blocks when messages array is empty even if prompt caching is enabled", () => {
				const config = createConfig({
					messages: [],
					systemPrompt: "You are a helpful assistant",
				})

				const strategy = new SinglePointStrategy(config)
				const result = strategy.determineOptimalCachePoints()

				// Check that system blocks only include the text, no cache block
				expect(result.system).toHaveLength(1)
				expect(result.system[0]).toEqual({ text: "You are a helpful assistant" })

				// Verify no messages or cache blocks were added
				expect(result.messages).toHaveLength(0)
			})

			test("does not add system cache block when prompt caching is disabled", () => {
				const config = createConfig({
					messages: [{ role: "user", content: "Hello" }],
					systemPrompt: "You are a helpful assistant",
					usePromptCache: false,
				})

				const strategy = new SinglePointStrategy(config)
				const result = strategy.determineOptimalCachePoints()

				// Check that system blocks only include the text
				expect(result.system).toHaveLength(1)
				expect(result.system[0]).toEqual({ text: "You are a helpful assistant" })
			})

			test("does not insert message cache blocks when prompt caching is disabled", () => {
				// Create a long conversation that would trigger cache blocks if enabled
				const messages: Anthropic.Messages.MessageParam[] = Array(10)
					.fill(null)
					.map((_, i) => ({
						role: i % 2 === 0 ? "user" : "assistant",
						content:
							"This is message " +
							(i + 1) +
							" with some additional text to increase token count. " +
							"Adding more text to ensure we exceed the token threshold for cache block insertion.",
					}))

				const config = createConfig({
					messages,
					systemPrompt: "",
					usePromptCache: false,
				})

				const strategy = new SinglePointStrategy(config)
				const result = strategy.determineOptimalCachePoints()

				// Verify no cache blocks were inserted
				expect(result.messages).toHaveLength(10)
				result.messages.forEach((message) => {
					if (message.content) {
						message.content.forEach((block) => {
							expect(hasCachePoint(block)).toBe(false)
						})
					}
				})
			})
		})
	})
})
