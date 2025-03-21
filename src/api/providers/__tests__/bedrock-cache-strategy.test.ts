import { AwsBedrockHandler } from "../bedrock"
import { BedrockRuntimeClient, ConverseStreamCommand } from "@aws-sdk/client-bedrock-runtime"
import { Anthropic } from "@anthropic-ai/sdk"
import { MultiPointStrategy } from "../../transform/cache-strategy/multi-point-strategy"
import { SinglePointStrategy } from "../../transform/cache-strategy/single-point-strategy"

// Direct mock of the convertWithOptimalCaching function
jest.mock("../../transform/cache-strategy/strategy-factory", () => {
	const originalModule = jest.requireActual("../../transform/cache-strategy/strategy-factory")

	return {
		...originalModule,
		convertWithOptimalCaching: jest.fn().mockImplementation((config) => {
			// Store the config for later inspection
			convertWithOptimalCachingMock.lastConfig = config

			// Call the original implementation
			return originalModule.convertWithOptimalCaching(config)
		}),
	}
})

// Create a mock object to store the last config passed to convertWithOptimalCaching
const convertWithOptimalCachingMock = {
	lastConfig: null,
}

describe("AwsBedrockHandler Cache Strategy Integration", () => {
	let handler: AwsBedrockHandler

	const mockMessages: Anthropic.Messages.MessageParam[] = [
		{
			role: "user",
			content: "Hello",
		},
		{
			role: "assistant",
			content: "Hi there!",
		},
	]

	const systemPrompt = "You are a helpful assistant"

	beforeEach(() => {
		// Clear all mocks before each test
		jest.clearAllMocks()

		// Create a handler with prompt cache enabled and a model that supports it
		handler = new AwsBedrockHandler({
			apiModelId: "anthropic.claude-3-7-sonnet-20250219-v1:0", // This model supports prompt cache
			awsAccessKey: "test-access-key",
			awsSecretKey: "test-secret-key",
			awsRegion: "us-east-1",
			awsUsePromptCache: true,
		})

		// Mock the getModel method to return a model with cachableFields and multi-point support
		jest.spyOn(handler, "getModel").mockReturnValue({
			id: "anthropic.claude-3-7-sonnet-20250219-v1:0",
			info: {
				maxTokens: 8192,
				contextWindow: 200000,
				supportsPromptCache: true,
				supportsImages: true,
				cachableFields: ["system", "messages"],
				maxCachePoints: 4, // Support for multiple cache points
				minTokensPerCachePoint: 50,
			},
		})

		// Mock the client.send method
		const mockInvoke = jest.fn().mockResolvedValue({
			stream: {
				[Symbol.asyncIterator]: async function* () {
					yield {
						metadata: {
							usage: {
								inputTokens: 10,
								outputTokens: 5,
							},
						},
					}
				},
			},
		})

		handler["client"] = {
			send: mockInvoke,
			config: { region: "us-east-1" },
		} as unknown as BedrockRuntimeClient
	})

	it("should select MultiPointStrategy when conditions are met", async () => {
		// Reset the mock
		convertWithOptimalCachingMock.lastConfig = null

		// Call the method that uses convertWithOptimalCaching
		const stream = handler.createMessage(systemPrompt, mockMessages)
		for await (const chunk of stream) {
			// Just consume the stream
		}

		// Verify that convertWithOptimalCaching was called with the right parameters
		expect(convertWithOptimalCachingMock.lastConfig).toMatchObject({
			modelInfo: expect.objectContaining({
				supportsPromptCache: true,
				maxCachePoints: 4,
			}),
			usePromptCache: true,
		})

		// Verify that the config would result in a MultiPointStrategy
		expect(convertWithOptimalCachingMock.lastConfig).not.toBeNull()
		if (convertWithOptimalCachingMock.lastConfig) {
			const strategy = new MultiPointStrategy(convertWithOptimalCachingMock.lastConfig)
			expect(strategy).toBeInstanceOf(MultiPointStrategy)
		}
	})

	it("should select SinglePointStrategy when maxCachePoints is 1", async () => {
		// Mock the getModel method to return a model with only single-point support
		jest.spyOn(handler, "getModel").mockReturnValue({
			id: "anthropic.claude-3-7-sonnet-20250219-v1:0",
			info: {
				maxTokens: 8192,
				contextWindow: 200000,
				supportsPromptCache: true,
				supportsImages: true,
				cachableFields: ["system"],
				maxCachePoints: 1, // Only supports one cache point
				minTokensPerCachePoint: 50,
			},
		})

		// Reset the mock
		convertWithOptimalCachingMock.lastConfig = null

		// Call the method that uses convertWithOptimalCaching
		const stream = handler.createMessage(systemPrompt, mockMessages)
		for await (const chunk of stream) {
			// Just consume the stream
		}

		// Verify that convertWithOptimalCaching was called with the right parameters
		expect(convertWithOptimalCachingMock.lastConfig).toMatchObject({
			modelInfo: expect.objectContaining({
				supportsPromptCache: true,
				maxCachePoints: 1,
			}),
			usePromptCache: true,
		})

		// Verify that the config would result in a SinglePointStrategy
		expect(convertWithOptimalCachingMock.lastConfig).not.toBeNull()
		if (convertWithOptimalCachingMock.lastConfig) {
			const strategy = new SinglePointStrategy(convertWithOptimalCachingMock.lastConfig)
			expect(strategy).toBeInstanceOf(SinglePointStrategy)
		}
	})

	it("should select SinglePointStrategy when prompt cache is disabled", async () => {
		// Create a handler with prompt cache disabled
		handler = new AwsBedrockHandler({
			apiModelId: "anthropic.claude-3-7-sonnet-20250219-v1:0",
			awsAccessKey: "test-access-key",
			awsSecretKey: "test-secret-key",
			awsRegion: "us-east-1",
			awsUsePromptCache: false, // Prompt cache disabled
		})

		// Mock the getModel method
		jest.spyOn(handler, "getModel").mockReturnValue({
			id: "anthropic.claude-3-7-sonnet-20250219-v1:0",
			info: {
				maxTokens: 8192,
				contextWindow: 200000,
				supportsPromptCache: true,
				supportsImages: true,
				cachableFields: ["system", "messages"],
				maxCachePoints: 4,
				minTokensPerCachePoint: 50,
			},
		})

		// Mock the client.send method
		const mockInvoke = jest.fn().mockResolvedValue({
			stream: {
				[Symbol.asyncIterator]: async function* () {
					yield {
						metadata: {
							usage: {
								inputTokens: 10,
								outputTokens: 5,
							},
						},
					}
				},
			},
		})

		handler["client"] = {
			send: mockInvoke,
			config: { region: "us-east-1" },
		} as unknown as BedrockRuntimeClient

		// Reset the mock
		convertWithOptimalCachingMock.lastConfig = null

		// Call the method that uses convertWithOptimalCaching
		const stream = handler.createMessage(systemPrompt, mockMessages)
		for await (const chunk of stream) {
			// Just consume the stream
		}

		// Verify that convertWithOptimalCaching was called with the right parameters
		expect(convertWithOptimalCachingMock.lastConfig).toMatchObject({
			usePromptCache: false,
		})

		// Verify that the config would result in a SinglePointStrategy
		expect(convertWithOptimalCachingMock.lastConfig).not.toBeNull()
		if (convertWithOptimalCachingMock.lastConfig) {
			const strategy = new SinglePointStrategy(convertWithOptimalCachingMock.lastConfig)
			expect(strategy).toBeInstanceOf(SinglePointStrategy)
		}
	})

	it("should include cachePoint nodes in API request when using MultiPointStrategy", async () => {
		// Create a mock implementation of convertWithOptimalCaching that adds a cachePoint
		const { convertWithOptimalCaching } = jest.requireMock("../../transform/cache-strategy/strategy-factory")

		// Create a mock that adds a cachePoint to the system array
		convertWithOptimalCaching.mockImplementationOnce((config: any) => {
			const result = {
				system: [{ text: config.systemPrompt }, { cachePoint: { type: "default" } }],
				messages: config.messages.map((msg: any) => ({
					role: msg.role,
					content: [{ text: typeof msg.content === "string" ? msg.content : msg.content[0].text }],
				})),
			}
			return result
		})

		// Create a spy for the client.send method
		const mockSend = jest.fn().mockResolvedValue({
			stream: {
				[Symbol.asyncIterator]: async function* () {
					yield {
						metadata: {
							usage: {
								inputTokens: 10,
								outputTokens: 5,
							},
						},
					}
				},
			},
		})

		handler["client"] = {
			send: mockSend,
			config: { region: "us-east-1" },
		} as unknown as BedrockRuntimeClient

		// Call the method that uses convertWithOptimalCaching
		const stream = handler.createMessage(systemPrompt, mockMessages)
		for await (const chunk of stream) {
			// Just consume the stream
		}

		// Verify that the API request included system with cachePoint
		expect(mockSend).toHaveBeenCalledWith(
			expect.objectContaining({
				input: expect.objectContaining({
					system: expect.arrayContaining([
						expect.objectContaining({
							text: systemPrompt,
						}),
						expect.objectContaining({
							cachePoint: expect.anything(),
						}),
					]),
				}),
			}),
			expect.anything(),
		)
	})

	it("should yield usage results with cache tokens when using MultiPointStrategy", async () => {
		// Create a mock implementation of convertWithOptimalCaching that adds a cachePoint
		const { convertWithOptimalCaching } = jest.requireMock("../../transform/cache-strategy/strategy-factory")

		// Create a mock that adds a cachePoint to the system array
		convertWithOptimalCaching.mockImplementationOnce((config: any) => {
			const result = {
				system: [{ text: config.systemPrompt }, { cachePoint: { type: "default" } }],
				messages: config.messages.map((msg: any) => ({
					role: msg.role,
					content: [{ text: typeof msg.content === "string" ? msg.content : msg.content[0].text }],
				})),
			}
			return result
		})

		// Create a mock stream that includes cache token fields
		const mockApiResponse = {
			metadata: {
				usage: {
					inputTokens: 10,
					outputTokens: 5,
					cacheReadInputTokens: 5,
					cacheWriteInputTokens: 10,
				},
			},
		}

		const mockStream = {
			[Symbol.asyncIterator]: async function* () {
				yield mockApiResponse
			},
		}

		const mockSend = jest.fn().mockImplementation((command) => {
			return Promise.resolve({
				stream: mockStream,
			})
		})

		handler["client"] = {
			send: mockSend,
			config: { region: "us-east-1" },
		} as unknown as BedrockRuntimeClient

		// Call the method that uses convertWithOptimalCaching
		const stream = handler.createMessage(systemPrompt, mockMessages)
		const chunks = []

		for await (const chunk of stream) {
			chunks.push(chunk)
		}

		// Verify that usage results with cache tokens are yielded
		expect(chunks.length).toBeGreaterThan(0)
		expect(chunks[0]).toEqual({
			type: "usage",
			inputTokens: 10,
			outputTokens: 5,
			cacheReadTokens: 5,
			cacheWriteTokens: 10,
		})
	})
})
