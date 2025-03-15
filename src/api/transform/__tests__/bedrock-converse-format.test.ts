// npx jest src/api/transform/__tests__/bedrock-converse-format.test.ts

import { convertToBedrockConverseMessages } from "../bedrock-converse-format"
import { Anthropic } from "@anthropic-ai/sdk"
import { ContentBlock, ToolResultContentBlock } from "@aws-sdk/client-bedrock-runtime"

describe("convertToBedrockConverseMessages", () => {
	test("converts simple text messages correctly", () => {
		const messages: Anthropic.Messages.MessageParam[] = [
			{ role: "user", content: "Hello" },
			{ role: "assistant", content: "Hi there" },
		]

		const result = convertToBedrockConverseMessages(messages).messages

		expect(result).toEqual([
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

	test("converts messages with images correctly", () => {
		const messages: Anthropic.Messages.MessageParam[] = [
			{
				role: "user",
				content: [
					{
						type: "text",
						text: "Look at this image:",
					},
					{
						type: "image",
						source: {
							type: "base64",
							data: "SGVsbG8=", // "Hello" in base64
							media_type: "image/jpeg" as const,
						},
					},
				],
			},
		]

		const result = convertToBedrockConverseMessages(messages).messages

		if (!result[0] || !result[0].content) {
			fail("Expected result to have content")
			return
		}

		expect(result[0].role).toBe("user")
		expect(result[0].content).toHaveLength(2)
		expect(result[0].content[0]).toEqual({ text: "Look at this image:" })

		const imageBlock = result[0].content[1] as ContentBlock
		if ("image" in imageBlock && imageBlock.image && imageBlock.image.source) {
			expect(imageBlock.image.format).toBe("jpeg")
			expect(imageBlock.image.source).toBeDefined()
			expect(imageBlock.image.source.bytes).toBeDefined()
		} else {
			fail("Expected image block not found")
		}
	})

	test("converts tool use messages correctly", () => {
		const messages: Anthropic.Messages.MessageParam[] = [
			{
				role: "assistant",
				content: [
					{
						type: "tool_use",
						id: "test-id",
						name: "read_file",
						input: {
							path: "test.txt",
						},
					},
				],
			},
		]

		const result = convertToBedrockConverseMessages(messages).messages

		if (!result[0] || !result[0].content) {
			fail("Expected result to have content")
			return
		}

		expect(result[0].role).toBe("assistant")
		const toolBlock = result[0].content[0] as ContentBlock
		if ("toolUse" in toolBlock && toolBlock.toolUse) {
			expect(toolBlock.toolUse).toEqual({
				toolUseId: "test-id",
				name: "read_file",
				input: "<read_file>\n<path>\ntest.txt\n</path>\n</read_file>",
			})
		} else {
			fail("Expected tool use block not found")
		}
	})

	test("converts tool result messages correctly", () => {
		const messages: Anthropic.Messages.MessageParam[] = [
			{
				role: "assistant",
				content: [
					{
						type: "tool_result",
						tool_use_id: "test-id",
						content: [{ type: "text", text: "File contents here" }],
					},
				],
			},
		]

		const result = convertToBedrockConverseMessages(messages).messages

		if (!result[0] || !result[0].content) {
			fail("Expected result to have content")
			return
		}

		expect(result[0].role).toBe("assistant")
		const resultBlock = result[0].content[0] as ContentBlock
		if ("toolResult" in resultBlock && resultBlock.toolResult) {
			const expectedContent: ToolResultContentBlock[] = [{ text: "File contents here" }]
			expect(resultBlock.toolResult).toEqual({
				toolUseId: "test-id",
				content: expectedContent,
				status: "success",
			})
		} else {
			fail("Expected tool result block not found")
		}
	})

	test("handles text content correctly", () => {
		const messages: Anthropic.Messages.MessageParam[] = [
			{
				role: "user",
				content: [
					{
						type: "text",
						text: "Hello world",
					},
				],
			},
		]

		const result = convertToBedrockConverseMessages(messages).messages

		if (!result[0] || !result[0].content) {
			fail("Expected result to have content")
			return
		}

		expect(result[0].role).toBe("user")
		expect(result[0].content).toHaveLength(1)
		const textBlock = result[0].content[0] as ContentBlock
		expect(textBlock).toEqual({ text: "Hello world" })
	})

	describe("cache block insertion", () => {
		test("adds system cache block when prompt caching is enabled, messages exist, and system prompt is long enough", () => {
			const messages: Anthropic.Messages.MessageParam[] = [{ role: "user", content: "Hello" }]
			// Create a system prompt that's at least 50 tokens (200+ characters)
			const systemPrompt =
				"You are a helpful assistant that provides detailed and accurate information. " +
				"You should always be polite, respectful, and considerate of the user's needs. " +
				"When answering questions, try to provide comprehensive explanations that are easy to understand. " +
				"If you don't know something, be honest about it rather than making up information."

			const result = convertToBedrockConverseMessages(messages, systemPrompt, true)

			// Check that system blocks include both the text and a cache block
			expect(result.system).toHaveLength(2)
			expect(result.system[0]).toEqual({ text: systemPrompt })
			expect(result.system[1]).toHaveProperty("cachePoint")
			expect(result.system[1].cachePoint).toEqual({ type: "default" })
		})

		test("adds system cache block when model info specifies it should", () => {
			const messages: Anthropic.Messages.MessageParam[] = [{ role: "user", content: "Hello" }]
			// Create a short system prompt that wouldn't normally get a cache block
			const systemPrompt = "You are a helpful assistant"

			// Create model info with cachableFields including system and low minTokensPerCachePoint
			const modelInfo = {
				maxTokens: 8192,
				contextWindow: 200_000,
				supportsPromptCache: true,
				minTokensPerCachePoint: 1, // Set to 1 to ensure it passes the threshold
				maxCachePoints: 4,
				cachableFields: ["system", "messages", "tools"],
			}

			const result = convertToBedrockConverseMessages(messages, systemPrompt, true, modelInfo)

			// Check that system blocks include both the text and a cache block
			expect(result.system).toHaveLength(2)
			expect(result.system[0]).toEqual({ text: systemPrompt })
			expect(result.system[1]).toHaveProperty("cachePoint")
			expect(result.system[1].cachePoint).toEqual({ type: "default" })
		})

		test("does not add system cache block when system prompt is too short", () => {
			const messages: Anthropic.Messages.MessageParam[] = [{ role: "user", content: "Hello" }]
			const shortSystemPrompt = "You are a helpful assistant"

			const result = convertToBedrockConverseMessages(messages, shortSystemPrompt, true)

			// Check that system blocks only include the text, no cache block
			expect(result.system).toHaveLength(1)
			expect(result.system[0]).toEqual({ text: "You are a helpful assistant" })
		})

		test("does not add cache blocks when messages array is empty even if prompt caching is enabled", () => {
			const messages: Anthropic.Messages.MessageParam[] = []
			const systemPrompt = "You are a helpful assistant"

			const result = convertToBedrockConverseMessages(messages, systemPrompt, true)

			// Check that system blocks only include the text, no cache block
			expect(result.system).toHaveLength(1)
			expect(result.system[0]).toEqual({ text: "You are a helpful assistant" })

			// Verify no messages or cache blocks were added
			expect(result.messages).toHaveLength(0)
		})

		test("does not add system cache block when prompt caching is disabled", () => {
			const messages: Anthropic.Messages.MessageParam[] = [{ role: "user", content: "Hello" }]
			const systemPrompt = "You are a helpful assistant"

			const result = convertToBedrockConverseMessages(messages, systemPrompt, false)

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

			const result = convertToBedrockConverseMessages(messages, undefined, false)

			// Verify no cache blocks were inserted
			expect(result.messages).toHaveLength(10)
			result.messages.forEach((message) => {
				if (message.content) {
					message.content.forEach((block) => {
						expect(block).not.toHaveProperty("cachePoint")
					})
				}
			})
		})

		test("inserts message cache blocks when prompt caching is enabled and token threshold is exceeded", () => {
			// Create a long conversation that should trigger cache blocks
			const messages: Anthropic.Messages.MessageParam[] = Array(10)
				.fill(null)
				.map((_, i) => ({
					role: i % 2 === 0 ? "user" : "assistant",
					content:
						"This is message " +
						(i + 1) +
						" with a lot of text to increase token count. " +
						"Adding more text to ensure we exceed the token threshold for cache block insertion. " +
						"Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt " +
						"ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation " +
						"ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in " +
						"reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.",
				}))

			const result = convertToBedrockConverseMessages(messages, undefined, true)

			// Count the number of cache blocks inserted
			let cacheBlockCount = 0
			result.messages.forEach((message) => {
				if (message.content) {
					message.content.forEach((block) => {
						if ("cachePoint" in block) {
							cacheBlockCount++
						}
					})
				}
			})

			// We should have some cache blocks inserted (up to the max of 4)
			expect(cacheBlockCount).toBeGreaterThan(0)
			expect(cacheBlockCount).toBeLessThanOrEqual(4)

			// The total message count should be greater than the original 10 due to cache blocks
			expect(result.messages.length).toBeGreaterThan(10)
		})

		test("respects the maximum number of cache blocks", () => {
			// Create an extremely long conversation that would trigger many cache blocks
			const messages: Anthropic.Messages.MessageParam[] = Array(50)
				.fill(null)
				.map((_, i) => ({
					role: i % 2 === 0 ? "user" : "assistant",
					content:
						"This is message " +
						(i + 1) +
						" with a lot of text to increase token count. " +
						"Adding more text to ensure we exceed the token threshold for cache block insertion multiple times.",
				}))

			const result = convertToBedrockConverseMessages(messages, undefined, true)

			// Count the number of cache blocks inserted
			let cacheBlockCount = 0
			result.messages.forEach((message) => {
				if (message.content) {
					message.content.forEach((block) => {
						if ("cachePoint" in block) {
							cacheBlockCount++
						}
					})
				}
			})

			// We should have exactly 4 cache blocks (the maximum)
			expect(cacheBlockCount).toBeLessThanOrEqual(4)
		})

		test("inserts cache block after the first message when appropriate", () => {
			// Create a conversation where the first message is very large
			const messages: Anthropic.Messages.MessageParam[] = [
				{
					role: "user",
					content:
						"This is a very large first message that exceeds the token threshold. " +
						"Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt " +
						"ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation " +
						"ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in " +
						"reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. " +
						"Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt " +
						"mollit anim id est laborum. ".repeat(10),
				},
				{
					role: "assistant",
					content: "This is the second message.",
				},
			]

			const result = convertToBedrockConverseMessages(messages, undefined, true)

			// The first message should not have a cache block within its content
			expect(result.messages[0].role).toBe("user")
			expect(result.messages[0].content && result.messages[0].content[0]).not.toHaveProperty("cachePoint")

			// There should be a cache block after the first message
			let foundCacheBlock = false
			for (let i = 1; i < result.messages.length; i++) {
				const content = result.messages[i].content
				if (content && content.length === 1 && content[0] && "cachePoint" in content[0]) {
					foundCacheBlock = true
					break
				}
			}

			expect(foundCacheBlock).toBe(true)
		})

		test("does not insert cache blocks when total content is too small", () => {
			// Create a conversation with very small messages
			const messages: Anthropic.Messages.MessageParam[] = [
				{ role: "user", content: "Hello" },
				{ role: "assistant", content: "Hi there" },
				{ role: "user", content: "How are you?" },
				{ role: "assistant", content: "I'm doing well, thanks!" },
			]

			const result = convertToBedrockConverseMessages(messages, undefined, true)

			// Count the number of cache blocks inserted
			let cacheBlockCount = 0
			result.messages.forEach((message) => {
				if (message.content) {
					message.content.forEach((block) => {
						if ("cachePoint" in block) {
							cacheBlockCount++
						}
					})
				}
			})

			// We should have no cache blocks since the total content is small
			expect(cacheBlockCount).toBe(0)

			// The message count should be the same as the original
			expect(result.messages.length).toBe(4)
		})

		test("inserts cache blocks for small content when model info specifies low threshold", () => {
			// Create a conversation with very small messages
			const messages: Anthropic.Messages.MessageParam[] = [
				{ role: "user", content: "Hello" },
				{ role: "assistant", content: "Hi there" },
				{ role: "user", content: "How are you?" },
				{ role: "assistant", content: "I'm doing well, thanks!" },
			]

			// Create model info with low minTokensPerCachePoint
			const modelInfo = {
				maxTokens: 8192,
				contextWindow: 200_000,
				supportsPromptCache: true,
				minTokensPerCachePoint: 1, // Set to 1 to ensure it passes the threshold
				maxCachePoints: 4,
				cachableFields: ["system", "messages", "tools"],
			}

			const result = convertToBedrockConverseMessages(messages, undefined, true, modelInfo)

			// Count the number of cache blocks inserted
			let cacheBlockCount = 0
			result.messages.forEach((message) => {
				if (message.content) {
					message.content.forEach((block) => {
						if ("cachePoint" in block) {
							cacheBlockCount++
						}
					})
				}
			})

			// We should have at least one cache block since the threshold is very low
			expect(cacheBlockCount).toBeGreaterThan(0)

			// The message count should be greater than the original due to cache blocks
			expect(result.messages.length).toBeGreaterThan(4)
		})
	})
})
