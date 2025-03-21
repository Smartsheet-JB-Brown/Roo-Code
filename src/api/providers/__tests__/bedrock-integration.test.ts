import { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime"
import { AwsBedrockHandler } from "../bedrock"
import { ContentBlock, SystemContentBlock, Message } from "@aws-sdk/client-bedrock-runtime"
import { Anthropic } from "@anthropic-ai/sdk"

// Generate a long text string that exceeds the minTokensPerCachePoint threshold
function generateLongText(wordCount: number): string {
	const words = [
		"lorem",
		"ipsum",
		"dolor",
		"sit",
		"amet",
		"consectetur",
		"adipiscing",
		"elit",
		"sed",
		"do",
		"eiusmod",
		"tempor",
		"incididunt",
		"ut",
		"labore",
		"et",
		"dolore",
		"magna",
		"aliqua",
		"ut",
		"enim",
		"ad",
		"minim",
		"veniam",
		"quis",
		"nostrud",
		"exercitation",
		"ullamco",
		"laboris",
		"nisi",
		"ut",
		"aliquip",
		"ex",
		"ea",
		"commodo",
		"consequat",
		"duis",
		"aute",
		"irure",
		"dolor",
		"in",
		"reprehenderit",
		"in",
		"voluptate",
		"velit",
		"esse",
		"cillum",
		"dolore",
		"eu",
		"fugiat",
		"nulla",
		"pariatur",
		"excepteur",
		"sint",
		"occaecat",
		"cupidatat",
		"non",
		"proident",
		"sunt",
		"in",
		"culpa",
		"qui",
		"officia",
		"deserunt",
		"mollit",
		"anim",
		"id",
		"est",
		"laborum",
	]

	let result = ""
	for (let i = 0; i < wordCount; i++) {
		result += words[i % words.length] + " "
	}
	return result.trim()
}

// Helper function to check if a cache point exists in the system or messages
function hasCachePoint(data: any, location: "system" | "messages", messageIndex?: number): boolean {
	if (location === "system") {
		return data.system.some((block: any) => block.cachePoint !== undefined)
	} else if (location === "messages" && messageIndex !== undefined) {
		if (data.messages[messageIndex] && data.messages[messageIndex].content) {
			return data.messages[messageIndex].content.some((block: any) => block.cachePoint !== undefined)
		}
	}
	return false
}

describe("Bedrock Integration Tests", () => {
	let handler: AwsBedrockHandler

	beforeEach(() => {
		handler = new AwsBedrockHandler({
			apiModelId: "anthropic.claude-3-7-sonnet-20250219-v1:0",
			awsRegion: "us-east-1",
			awsUsePromptCache: true,
		})

		const modelInfo = {
			maxTokens: 8192,
			contextWindow: 200000,
			supportsPromptCache: true,
			cachableFields: ["system", "messages"],
			maxCachePoints: 4,
			minTokensPerCachePoint: 50,
		}

		handler.getModel = jest.fn().mockReturnValue({
			id: "anthropic.claude-3-7-sonnet-20250219-v1:0",
			info: modelInfo,
		})
	})

	describe("API Request and Response Recording", () => {
		it("should record API request and response", async () => {
			const systemPrompt = "You are a helpful assistant"
			const messages: Anthropic.Messages.MessageParam[] = [
				{ role: "user", content: "Hello, how are you?" },
				{ role: "assistant", content: "I'm doing well, thank you for asking!" },
				{ role: "user", content: "Can you help me with a task?" },
			]

			const mockSend = jest.fn().mockImplementation((command) => {
				const mockResponse = {
					stream: {
						[Symbol.asyncIterator]: async function* () {
							yield {
								metadata: {
									usage: {
										inputTokens: 100,
										outputTokens: 50,
										cacheReadInputTokens: 25,
										cacheWriteInputTokens: 75,
									},
								},
							}
						},
					},
				}
				return Promise.resolve(mockResponse)
			})

			handler["client"] = {
				send: mockSend,
				config: { region: "us-east-1" },
			} as unknown as BedrockRuntimeClient

			const stream = handler.createMessage(systemPrompt, messages)
			const chunks = []

			for await (const chunk of stream) {
				chunks.push(chunk)
			}

			// Verify that the API request was made and has correct format
			expect(mockSend).toHaveBeenCalled()
			const lastCall = mockSend.mock.calls[0][0]
			expect(lastCall).toBeDefined()
			expect(lastCall.input).toBeDefined()

			// Verify that usage results with cache tokens are yielded
			expect(chunks.length).toBeGreaterThan(0)
			expect(chunks[0]).toEqual({
				type: "usage",
				inputTokens: 100,
				outputTokens: 50,
				cacheReadTokens: 25,
				cacheWriteTokens: 75,
			})
		})
	})

	describe("System Caching Tests", () => {
		it("should apply system cache point with long system prompt", async () => {
			const longSystemPrompt = generateLongText(100)
			const messages: Anthropic.Messages.MessageParam[] = [
				{ role: "user", content: "Hello, how are you?" },
				{ role: "assistant", content: "I'm doing well, thank you for asking!" },
				{ role: "user", content: "Can you help me with a task?" },
			]

			const mockSend = jest.fn().mockImplementation((command) => {
				// Store the request payload for verification
				const requestData = command.input

				const mockResponse = {
					stream: {
						[Symbol.asyncIterator]: async function* () {
							yield {
								messageStart: {
									role: "assistant",
								},
							}

							yield {
								contentBlockStart: {
									start: {
										text: "I understand you've provided a long system prompt. ",
									},
									contentBlockIndex: 0,
								},
							}

							yield {
								contentBlockDelta: {
									delta: {
										text: "This demonstrates system caching functionality where the system prompt exceeds the minTokensPerCachePoint threshold.",
									},
									contentBlockIndex: 0,
								},
							}

							yield {
								metadata: {
									usage: {
										inputTokens: 500,
										outputTokens: 50,
										cacheReadInputTokens: 400,
										cacheWriteInputTokens: 100,
									},
								},
							}
						},
					},
				}

				// Verify that a cache point was added to the system prompt
				expect(hasCachePoint(requestData, "system")).toBe(true)

				return Promise.resolve(mockResponse)
			})

			handler["client"] = {
				send: mockSend,
				config: { region: "us-east-1" },
			} as unknown as BedrockRuntimeClient

			const stream = handler.createMessage(longSystemPrompt, messages)
			const chunks = []

			for await (const chunk of stream) {
				chunks.push(chunk)
			}

			// Verify that text chunks and usage results with cache tokens are yielded
			expect(chunks.length).toBeGreaterThan(0)

			// First chunk should be text
			expect(chunks[0]).toEqual({
				type: "text",
				text: "I understand you've provided a long system prompt. ",
			})

			// Last chunk should be usage
			const usageChunk = chunks.find((chunk) => chunk.type === "usage")
			expect(usageChunk).toEqual({
				type: "usage",
				inputTokens: 500,
				outputTokens: 50,
				cacheReadTokens: 400,
				cacheWriteTokens: 100,
			})
		})
	})

	describe("Message Caching Tests", () => {
		it("should apply message cache points with long messages", async () => {
			const systemPrompt = "You are a helpful assistant"
			const messages: Anthropic.Messages.MessageParam[] = [
				{ role: "user", content: generateLongText(50) },
				{ role: "assistant", content: generateLongText(50) },
				{ role: "user", content: generateLongText(50) },
				{ role: "assistant", content: generateLongText(50) },
				{ role: "user", content: "Can you summarize what we've discussed?" },
			]

			const mockSend = jest.fn().mockImplementation((command) => {
				// Store the request payload for verification
				const requestData = command.input

				const mockResponse = {
					stream: {
						[Symbol.asyncIterator]: async function* () {
							yield {
								messageStart: {
									role: "assistant",
								},
							}

							yield {
								contentBlockStart: {
									start: {
										text: "I'll summarize our discussion. ",
									},
									contentBlockIndex: 0,
								},
							}

							yield {
								contentBlockDelta: {
									delta: {
										text: "We've been exchanging long messages that demonstrate message caching functionality.",
									},
									contentBlockIndex: 0,
								},
							}

							yield {
								metadata: {
									usage: {
										inputTokens: 850,
										outputTokens: 100,
										cacheReadInputTokens: 600,
										cacheWriteInputTokens: 250,
									},
								},
							}
						},
					},
				}

				// Verify that at least one message has a cache point
				let hasCachePoints = false
				for (let i = 0; i < requestData.messages.length; i++) {
					if (requestData.messages[i].content.some((block: any) => block.cachePoint !== undefined)) {
						hasCachePoints = true
						break
					}
				}
				expect(hasCachePoints).toBe(true)

				return Promise.resolve(mockResponse)
			})

			handler["client"] = {
				send: mockSend,
				config: { region: "us-east-1" },
			} as unknown as BedrockRuntimeClient

			const stream = handler.createMessage(systemPrompt, messages)
			const chunks = []

			for await (const chunk of stream) {
				chunks.push(chunk)
			}

			// Verify that text chunks and usage results with cache tokens are yielded
			expect(chunks.length).toBeGreaterThan(0)

			// First chunk should be text
			expect(chunks[0]).toEqual({
				type: "text",
				text: "I'll summarize our discussion. ",
			})

			// Last chunk should be usage
			const usageChunk = chunks.find((chunk) => chunk.type === "usage")
			expect(usageChunk).toEqual({
				type: "usage",
				inputTokens: 850,
				outputTokens: 100,
				cacheReadTokens: 600,
				cacheWriteTokens: 250,
			})
		})
	})
})
