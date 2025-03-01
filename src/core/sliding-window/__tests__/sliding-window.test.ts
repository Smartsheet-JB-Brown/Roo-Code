// npx jest src/core/sliding-window/__tests__/sliding-window.test.ts

import { Anthropic } from "@anthropic-ai/sdk"

import { ModelInfo } from "../../../shared/api"
import {
	TOKEN_BUFFER_PERCENTAGE,
	estimateTokenCount,
	truncateConversation,
	truncateConversationIfNeeded,
} from "../index"

/**
 * Tests for the truncateConversation function
 */
describe("truncateConversation", () => {
	it("should retain the first message", () => {
		const messages: Anthropic.Messages.MessageParam[] = [
			{ role: "user", content: "First message" },
			{ role: "assistant", content: "Second message" },
			{ role: "user", content: "Third message" },
		]

		const result = truncateConversation(messages, 0.5)

		// With 2 messages after the first, 0.5 fraction means remove 1 message
		// But 1 is odd, so it rounds down to 0 (to make it even)
		expect(result.length).toBe(3) // First message + 2 remaining messages
		expect(result[0]).toEqual(messages[0])
		expect(result[1]).toEqual(messages[1])
		expect(result[2]).toEqual(messages[2])
	})

	it("should remove the specified fraction of messages (rounded to even number)", () => {
		const messages: Anthropic.Messages.MessageParam[] = [
			{ role: "user", content: "First message" },
			{ role: "assistant", content: "Second message" },
			{ role: "user", content: "Third message" },
			{ role: "assistant", content: "Fourth message" },
			{ role: "user", content: "Fifth message" },
		]

		// 4 messages excluding first, 0.5 fraction = 2 messages to remove
		// 2 is already even, so no rounding needed
		const result = truncateConversation(messages, 0.5)

		expect(result.length).toBe(3)
		expect(result[0]).toEqual(messages[0])
		expect(result[1]).toEqual(messages[3])
		expect(result[2]).toEqual(messages[4])
	})

	it("should round to an even number of messages to remove", () => {
		const messages: Anthropic.Messages.MessageParam[] = [
			{ role: "user", content: "First message" },
			{ role: "assistant", content: "Second message" },
			{ role: "user", content: "Third message" },
			{ role: "assistant", content: "Fourth message" },
			{ role: "user", content: "Fifth message" },
			{ role: "assistant", content: "Sixth message" },
			{ role: "user", content: "Seventh message" },
		]

		// 6 messages excluding first, 0.3 fraction = 1.8 messages to remove
		// 1.8 rounds down to 1, then to 0 to make it even
		const result = truncateConversation(messages, 0.3)

		expect(result.length).toBe(7) // No messages removed
		expect(result).toEqual(messages)
	})

	it("should handle edge case with fracToRemove = 0", () => {
		const messages: Anthropic.Messages.MessageParam[] = [
			{ role: "user", content: "First message" },
			{ role: "assistant", content: "Second message" },
			{ role: "user", content: "Third message" },
		]

		const result = truncateConversation(messages, 0)

		expect(result).toEqual(messages)
	})

	it("should handle edge case with fracToRemove = 1", () => {
		const messages: Anthropic.Messages.MessageParam[] = [
			{ role: "user", content: "First message" },
			{ role: "assistant", content: "Second message" },
			{ role: "user", content: "Third message" },
			{ role: "assistant", content: "Fourth message" },
		]

		// 3 messages excluding first, 1.0 fraction = 3 messages to remove
		// But 3 is odd, so it rounds down to 2 to make it even
		const result = truncateConversation(messages, 1)

		expect(result.length).toBe(2)
		expect(result[0]).toEqual(messages[0])
		expect(result[1]).toEqual(messages[3])
	})
})

/**
 * Tests for the getMaxTokens function (private but tested through truncateConversationIfNeeded)
 */
describe("getMaxTokens", () => {
	// We'll test this indirectly through truncateConversationIfNeeded
	const createModelInfo = (contextWindow: number, maxTokens?: number): ModelInfo => ({
		contextWindow,
		supportsPromptCache: true, // Not relevant for getMaxTokens
		maxTokens,
	})

	// Reuse across tests for consistency
	const messages: Anthropic.Messages.MessageParam[] = [
		{ role: "user", content: "First message" },
		{ role: "assistant", content: "Second message" },
		{ role: "user", content: "Third message" },
		{ role: "assistant", content: "Fourth message" },
		{ role: "user", content: "Fifth message" },
	]

	it("should use maxTokens as buffer when specified", () => {
		const modelInfo = createModelInfo(100000, 50000)
		// Max tokens = 100000 - 50000 = 50000

		// Create messages with very small content in the last one to avoid token overflow
		const messagesWithSmallContent = [...messages.slice(0, -1), { ...messages[messages.length - 1], content: "" }]

		// Account for the dynamic buffer which is 10% of context window (10,000 tokens)
		// Below max tokens and buffer - no truncation
		const result1 = truncateConversationIfNeeded({
			messages: messagesWithSmallContent,
			totalTokens: 39999, // Well below threshold + dynamic buffer
			contextWindow: modelInfo.contextWindow,
			maxTokens: modelInfo.maxTokens,
		})
		expect(result1).toEqual(messagesWithSmallContent)

		// Above max tokens - truncate
		const result2 = truncateConversationIfNeeded({
			messages: messagesWithSmallContent,
			totalTokens: 50001, // Above threshold
			contextWindow: modelInfo.contextWindow,
			maxTokens: modelInfo.maxTokens,
		})
		expect(result2).not.toEqual(messagesWithSmallContent)
		expect(result2.length).toBe(3) // Truncated with 0.5 fraction
	})

	it("should use 20% of context window as buffer when maxTokens is undefined", () => {
		const modelInfo = createModelInfo(100000, undefined)
		// Max tokens = 100000 - (100000 * 0.2) = 80000

		// Create messages with very small content in the last one to avoid token overflow
		const messagesWithSmallContent = [...messages.slice(0, -1), { ...messages[messages.length - 1], content: "" }]

		// Account for the dynamic buffer which is 10% of context window (10,000 tokens)
		// Below max tokens and buffer - no truncation
		const result1 = truncateConversationIfNeeded({
			messages: messagesWithSmallContent,
			totalTokens: 69999, // Well below threshold + dynamic buffer
			contextWindow: modelInfo.contextWindow,
			maxTokens: modelInfo.maxTokens,
		})
		expect(result1).toEqual(messagesWithSmallContent)

		// Above max tokens - truncate
		const result2 = truncateConversationIfNeeded({
			messages: messagesWithSmallContent,
			totalTokens: 80001, // Above threshold
			contextWindow: modelInfo.contextWindow,
			maxTokens: modelInfo.maxTokens,
		})
		expect(result2).not.toEqual(messagesWithSmallContent)
		expect(result2.length).toBe(3) // Truncated with 0.5 fraction
	})

	it("should handle small context windows appropriately", () => {
		const modelInfo = createModelInfo(50000, 10000)
		// Max tokens = 50000 - 10000 = 40000

		// Create messages with very small content in the last one to avoid token overflow
		const messagesWithSmallContent = [...messages.slice(0, -1), { ...messages[messages.length - 1], content: "" }]

		// Below max tokens and buffer - no truncation
		const result1 = truncateConversationIfNeeded({
			messages: messagesWithSmallContent,
			totalTokens: 34999, // Well below threshold + buffer
			contextWindow: modelInfo.contextWindow,
			maxTokens: modelInfo.maxTokens,
		})
		expect(result1).toEqual(messagesWithSmallContent)

		// Above max tokens - truncate
		const result2 = truncateConversationIfNeeded({
			messages: messagesWithSmallContent,
			totalTokens: 40001, // Above threshold
			contextWindow: modelInfo.contextWindow,
			maxTokens: modelInfo.maxTokens,
		})
		expect(result2).not.toEqual(messagesWithSmallContent)
		expect(result2.length).toBe(3) // Truncated with 0.5 fraction
	})

	it("should handle large context windows appropriately", () => {
		const modelInfo = createModelInfo(200000, 30000)
		// Max tokens = 200000 - 30000 = 170000

		// Create messages with very small content in the last one to avoid token overflow
		const messagesWithSmallContent = [...messages.slice(0, -1), { ...messages[messages.length - 1], content: "" }]

		// Account for the dynamic buffer which is 10% of context window (20,000 tokens for this test)
		// Below max tokens and buffer - no truncation
		const result1 = truncateConversationIfNeeded({
			messages: messagesWithSmallContent,
			totalTokens: 149999, // Well below threshold + dynamic buffer
			contextWindow: modelInfo.contextWindow,
			maxTokens: modelInfo.maxTokens,
		})
		expect(result1).toEqual(messagesWithSmallContent)

		// Above max tokens - truncate
		const result2 = truncateConversationIfNeeded({
			messages: messagesWithSmallContent,
			totalTokens: 170001, // Above threshold
			contextWindow: modelInfo.contextWindow,
			maxTokens: modelInfo.maxTokens,
		})
		expect(result2).not.toEqual(messagesWithSmallContent)
		expect(result2.length).toBe(3) // Truncated with 0.5 fraction
	})
})

/**
 * Tests for the truncateConversationIfNeeded function
 */
describe("truncateConversationIfNeeded", () => {
	const createModelInfo = (contextWindow: number, supportsPromptCache: boolean, maxTokens?: number): ModelInfo => ({
		contextWindow,
		supportsPromptCache,
		maxTokens,
	})

	const messages: Anthropic.Messages.MessageParam[] = [
		{ role: "user", content: "First message" },
		{ role: "assistant", content: "Second message" },
		{ role: "user", content: "Third message" },
		{ role: "assistant", content: "Fourth message" },
		{ role: "user", content: "Fifth message" },
	]

	it("should not truncate if tokens are below max tokens threshold", () => {
		const modelInfo = createModelInfo(100000, true, 30000)
		const maxTokens = 100000 - 30000 // 70000
		const dynamicBuffer = modelInfo.contextWindow * TOKEN_BUFFER_PERCENTAGE // 10000
		const totalTokens = 70000 - dynamicBuffer - 1 // Just below threshold - buffer

		// Create messages with very small content in the last one to avoid token overflow
		const messagesWithSmallContent = [...messages.slice(0, -1), { ...messages[messages.length - 1], content: "" }]

		const result = truncateConversationIfNeeded({
			messages: messagesWithSmallContent,
			totalTokens,
			contextWindow: modelInfo.contextWindow,
			maxTokens: modelInfo.maxTokens,
		})
		expect(result).toEqual(messagesWithSmallContent) // No truncation occurs
	})

	it("should truncate if tokens are above max tokens threshold", () => {
		const modelInfo = createModelInfo(100000, true, 30000)
		const maxTokens = 100000 - 30000 // 70000
		const totalTokens = 70001 // Above threshold

		// Create messages with very small content in the last one to avoid token overflow
		const messagesWithSmallContent = [...messages.slice(0, -1), { ...messages[messages.length - 1], content: "" }]

		// When truncating, always uses 0.5 fraction
		// With 4 messages after the first, 0.5 fraction means remove 2 messages
		const expectedResult = [messagesWithSmallContent[0], messagesWithSmallContent[3], messagesWithSmallContent[4]]

		const result = truncateConversationIfNeeded({
			messages: messagesWithSmallContent,
			totalTokens,
			contextWindow: modelInfo.contextWindow,
			maxTokens: modelInfo.maxTokens,
		})
		expect(result).toEqual(expectedResult)
	})

	it("should work with non-prompt caching models the same as prompt caching models", () => {
		// The implementation no longer differentiates between prompt caching and non-prompt caching models
		const modelInfo1 = createModelInfo(100000, true, 30000)
		const modelInfo2 = createModelInfo(100000, false, 30000)

		// Create messages with very small content in the last one to avoid token overflow
		const messagesWithSmallContent = [...messages.slice(0, -1), { ...messages[messages.length - 1], content: "" }]

		// Test below threshold
		const belowThreshold = 69999
		expect(
			truncateConversationIfNeeded({
				messages: messagesWithSmallContent,
				totalTokens: belowThreshold,
				contextWindow: modelInfo1.contextWindow,
				maxTokens: modelInfo1.maxTokens,
			}),
		).toEqual(
			truncateConversationIfNeeded({
				messages: messagesWithSmallContent,
				totalTokens: belowThreshold,
				contextWindow: modelInfo2.contextWindow,
				maxTokens: modelInfo2.maxTokens,
			}),
		)

		// Test above threshold
		const aboveThreshold = 70001
		expect(
			truncateConversationIfNeeded({
				messages: messagesWithSmallContent,
				totalTokens: aboveThreshold,
				contextWindow: modelInfo1.contextWindow,
				maxTokens: modelInfo1.maxTokens,
			}),
		).toEqual(
			truncateConversationIfNeeded({
				messages: messagesWithSmallContent,
				totalTokens: aboveThreshold,
				contextWindow: modelInfo2.contextWindow,
				maxTokens: modelInfo2.maxTokens,
			}),
		)
	})

	it("should consider incoming content when deciding to truncate", () => {
		const modelInfo = createModelInfo(100000, true, 30000)
		const maxTokens = 30000
		const availableTokens = modelInfo.contextWindow - maxTokens

		// Test case 1: Small content that won't push us over the threshold
		const smallContent = [{ type: "text" as const, text: "Small content" }]
		const smallContentTokens = estimateTokenCount(smallContent)
		const messagesWithSmallContent: Anthropic.Messages.MessageParam[] = [
			...messages.slice(0, -1),
			{ role: messages[messages.length - 1].role, content: smallContent },
		]

		// Set base tokens so total is well below threshold + buffer even with small content added
		const dynamicBuffer = modelInfo.contextWindow * TOKEN_BUFFER_PERCENTAGE
		const baseTokensForSmall = availableTokens - smallContentTokens - dynamicBuffer - 10
		const resultWithSmall = truncateConversationIfNeeded({
			messages: messagesWithSmallContent,
			totalTokens: baseTokensForSmall,
			contextWindow: modelInfo.contextWindow,
			maxTokens,
		})
		expect(resultWithSmall).toEqual(messagesWithSmallContent) // No truncation

		// Test case 2: Large content that will push us over the threshold
		const largeContent = [
			{
				type: "text" as const,
				text: "A very large incoming message that would consume a significant number of tokens and push us over the threshold",
			},
		]
		const largeContentTokens = estimateTokenCount(largeContent)
		const messagesWithLargeContent: Anthropic.Messages.MessageParam[] = [
			...messages.slice(0, -1),
			{ role: messages[messages.length - 1].role, content: largeContent },
		]

		// Set base tokens so we're just below threshold without content, but over with content
		const baseTokensForLarge = availableTokens - Math.floor(largeContentTokens / 2)
		const resultWithLarge = truncateConversationIfNeeded({
			messages: messagesWithLargeContent,
			totalTokens: baseTokensForLarge,
			contextWindow: modelInfo.contextWindow,
			maxTokens,
		})
		expect(resultWithLarge).not.toEqual(messagesWithLargeContent) // Should truncate

		// Test case 3: Very large content that will definitely exceed threshold
		const veryLargeContent = [{ type: "text" as const, text: "X".repeat(1000) }]
		const veryLargeContentTokens = estimateTokenCount(veryLargeContent)
		const messagesWithVeryLargeContent: Anthropic.Messages.MessageParam[] = [
			...messages.slice(0, -1),
			{ role: messages[messages.length - 1].role, content: veryLargeContent },
		]

		// Set base tokens so we're just below threshold without content
		const baseTokensForVeryLarge = availableTokens - Math.floor(veryLargeContentTokens / 2)
		const resultWithVeryLarge = truncateConversationIfNeeded({
			messages: messagesWithVeryLargeContent,
			totalTokens: baseTokensForVeryLarge,
			contextWindow: modelInfo.contextWindow,
			maxTokens,
		})
		expect(resultWithVeryLarge).not.toEqual(messagesWithVeryLargeContent) // Should truncate
	})

	it("should truncate if tokens are within TOKEN_BUFFER_PERCENTAGE of the threshold", () => {
		const modelInfo = createModelInfo(100000, true, 30000)
		const maxTokens = 100000 - 30000 // 70000
		const dynamicBuffer = modelInfo.contextWindow * TOKEN_BUFFER_PERCENTAGE // 10% of 100000 = 10000
		const totalTokens = 70000 - dynamicBuffer + 1 // Just within the dynamic buffer of threshold (70000)

		// Create messages with very small content in the last one to avoid token overflow
		const messagesWithSmallContent = [...messages.slice(0, -1), { ...messages[messages.length - 1], content: "" }]

		// When truncating, always uses 0.5 fraction
		// With 4 messages after the first, 0.5 fraction means remove 2 messages
		const expectedResult = [messagesWithSmallContent[0], messagesWithSmallContent[3], messagesWithSmallContent[4]]

		const result = truncateConversationIfNeeded({
			messages: messagesWithSmallContent,
			totalTokens,
			contextWindow: modelInfo.contextWindow,
			maxTokens: modelInfo.maxTokens,
		})
		expect(result).toEqual(expectedResult)
	})
})

/**
 * Tests for the estimateTokenCount function
 */
describe("estimateTokenCount", () => {
	it("should return 0 for empty or undefined content", () => {
		expect(estimateTokenCount([])).toBe(0)
		// @ts-ignore - Testing with undefined
		expect(estimateTokenCount(undefined)).toBe(0)
	})

	it("should estimate tokens for text blocks", () => {
		const content: Array<Anthropic.Messages.ContentBlockParam> = [
			{ type: "text", text: "This is a text block with 36 characters" },
		]

		// With tiktoken, the exact token count may differ from character-based estimation
		// Instead of expecting an exact number, we verify it's a reasonable positive number
		const result = estimateTokenCount(content)
		expect(result).toBeGreaterThan(0)

		// We can also verify that longer text results in more tokens
		const longerContent: Array<Anthropic.Messages.ContentBlockParam> = [
			{
				type: "text",
				text: "This is a longer text block with significantly more characters to encode into tokens",
			},
		]
		const longerResult = estimateTokenCount(longerContent)
		expect(longerResult).toBeGreaterThan(result)
	})

	it("should estimate tokens for image blocks based on data size", () => {
		// Small image
		const smallImage: Array<Anthropic.Messages.ContentBlockParam> = [
			{ type: "image", source: { type: "base64", media_type: "image/jpeg", data: "small_dummy_data" } },
		]
		// Larger image with more data
		const largerImage: Array<Anthropic.Messages.ContentBlockParam> = [
			{ type: "image", source: { type: "base64", media_type: "image/png", data: "X".repeat(1000) } },
		]

		// Verify the token count scales with the size of the image data
		const smallImageTokens = estimateTokenCount(smallImage)
		const largerImageTokens = estimateTokenCount(largerImage)

		// Small image should have some tokens
		expect(smallImageTokens).toBeGreaterThan(0)

		// Larger image should have proportionally more tokens
		expect(largerImageTokens).toBeGreaterThan(smallImageTokens)

		// Verify the larger image calculation matches our formula including the 50% fudge factor
		expect(largerImageTokens).toBe(48)
	})

	it("should estimate tokens for mixed content blocks", () => {
		const content: Array<Anthropic.Messages.ContentBlockParam> = [
			{ type: "text", text: "A text block with 30 characters" },
			{ type: "image", source: { type: "base64", media_type: "image/jpeg", data: "dummy_data" } },
			{ type: "text", text: "Another text with 24 chars" },
		]

		// We know image tokens calculation should be consistent
		const imageTokens = Math.ceil(Math.sqrt("dummy_data".length)) * 1.5

		// With tiktoken, we can't predict exact text token counts,
		// but we can verify the total is greater than just the image tokens
		const result = estimateTokenCount(content)
		expect(result).toBeGreaterThan(imageTokens)

		// Also test against a version with only the image to verify text adds tokens
		const imageOnlyContent: Array<Anthropic.Messages.ContentBlockParam> = [
			{ type: "image", source: { type: "base64", media_type: "image/jpeg", data: "dummy_data" } },
		]
		const imageOnlyResult = estimateTokenCount(imageOnlyContent)
		expect(result).toBeGreaterThan(imageOnlyResult)
	})

	it("should handle empty text blocks", () => {
		const content: Array<Anthropic.Messages.ContentBlockParam> = [{ type: "text", text: "" }]
		expect(estimateTokenCount(content)).toBe(0)
	})

	it("should handle plain string messages", () => {
		const content = "This is a plain text message"
		expect(estimateTokenCount([{ type: "text", text: content }])).toBeGreaterThan(0)
	})
})
