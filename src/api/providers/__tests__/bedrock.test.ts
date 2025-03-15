// Mock AWS SDK credential providers
jest.mock("@aws-sdk/credential-providers", () => ({
	fromIni: jest.fn().mockReturnValue({
		accessKeyId: "profile-access-key",
		secretAccessKey: "profile-secret-key",
	}),
}))

// Mock BedrockRuntimeClient
jest.mock("@aws-sdk/client-bedrock-runtime", () => {
	return {
		BedrockRuntimeClient: jest.fn().mockImplementation((config) => {
			return {
				config,
				send: jest.fn().mockResolvedValue({
					output: new TextEncoder().encode(JSON.stringify({ content: "test" })),
				}),
			}
		}),
		ConverseStreamCommand: jest.fn(),
		ConverseCommand: jest.fn(),
	}
})

// Mock the bedrockModels object
jest.mock("../../../shared/api", () => {
	const originalModule = jest.requireActual("../../../shared/api")
	return {
		...originalModule,
		bedrockModels: {
			...originalModule.bedrockModels,
			"anthropic.claude-3-7-sonnet-20250219-v1:0": {
				maxTokens: 8192,
				contextWindow: 200_000,
				supportsImages: true,
				supportsComputerUse: true,
				supportsPromptCache: true,
				inputPrice: 3.0,
				outputPrice: 15.0,
				cacheWritesPrice: 3.75,
				cacheReadsPrice: 0.3,
				minTokensPerCachePoint: 50,
				maxCachePoints: 4,
				cachableFields: ["system", "messages", "tools"],
			},
			"amazon.titan-text-express-v1:0": {
				maxTokens: 4096,
				contextWindow: 8_000,
				supportsImages: false,
				supportsComputerUse: false,
				supportsPromptCache: false,
				inputPrice: 0.2,
				outputPrice: 0.6,
			},
		},
	}
})

// Mock the logger to write to console
jest.mock("../../../utils/logging", () => {
	const { CompactLogger } = require("../../../utils/logging/CompactLogger")
	const { CompactTransport } = require("../../../utils/logging/CompactTransport")

	// Create a transport that writes to console
	const consoleTransport = new CompactTransport({
		level: "debug",
		fileOutput: { enabled: false },
	})

	return {
		logger: new CompactLogger(consoleTransport),
	}
})

import { AwsBedrockHandler } from "../bedrock"
import { MessageContent } from "../../../shared/api"
import { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime"
import { Anthropic } from "@anthropic-ai/sdk"
import { fromIni } from "@aws-sdk/credential-providers"
import { logger } from "../../../utils/logging"

describe("AwsBedrockHandler", () => {
	let handler: AwsBedrockHandler

	beforeEach(() => {
		// Reset the fromIni mock before each test
		;(fromIni as jest.Mock).mockClear()

		handler = new AwsBedrockHandler({
			apiModelId: "anthropic.claude-3-5-sonnet-20241022-v2:0",
			awsAccessKey: "test-access-key",
			awsSecretKey: "test-secret-key",
			awsRegion: "us-east-1",
		})
	})

	describe("constructor", () => {
		it("should initialize with provided config", () => {
			expect(handler["options"].awsAccessKey).toBe("test-access-key")
			expect(handler["options"].awsSecretKey).toBe("test-secret-key")
			expect(handler["options"].awsRegion).toBe("us-east-1")
			expect(handler["options"].apiModelId).toBe("anthropic.claude-3-5-sonnet-20241022-v2:0")
		})

		it("should initialize with missing AWS credentials", () => {
			const handlerWithoutCreds = new AwsBedrockHandler({
				apiModelId: "anthropic.claude-3-5-sonnet-20241022-v2:0",
				awsRegion: "us-east-1",
			})
			expect(handlerWithoutCreds).toBeInstanceOf(AwsBedrockHandler)
		})

		it("should initialize with AWS profile credentials", () => {
			const handlerWithProfile = new AwsBedrockHandler({
				apiModelId: "anthropic.claude-3-5-sonnet-20241022-v2:0",
				awsRegion: "us-east-1",
				awsUseProfile: true,
				awsProfile: "test-profile",
			})
			expect(handlerWithProfile).toBeInstanceOf(AwsBedrockHandler)
			expect(handlerWithProfile["options"].awsUseProfile).toBe(true)
			expect(handlerWithProfile["options"].awsProfile).toBe("test-profile")
		})

		it("should initialize with AWS profile enabled but no profile set", () => {
			const handlerWithoutProfile = new AwsBedrockHandler({
				apiModelId: "anthropic.claude-3-5-sonnet-20241022-v2:0",
				awsRegion: "us-east-1",
				awsUseProfile: true,
			})
			expect(handlerWithoutProfile).toBeInstanceOf(AwsBedrockHandler)
			expect(handlerWithoutProfile["options"].awsUseProfile).toBe(true)
			expect(handlerWithoutProfile["options"].awsProfile).toBeUndefined()
		})
	})

	describe("AWS SDK client configuration", () => {
		it("should create a client when profile credentials are provided", async () => {
			// Create a handler with profile credentials
			const handlerWithProfile = new AwsBedrockHandler({
				apiModelId: "anthropic.claude-3-5-sonnet-20241022-v2:0",
				awsRegion: "us-east-1",
				awsUseProfile: true,
				awsProfile: "test-profile",
			})

			// Verify the client was created
			expect(handlerWithProfile["client"]).toBeDefined()

			// Mock a simple API call to verify credentials are used
			const mockResponse = {
				output: new TextEncoder().encode(JSON.stringify({ content: "test" })),
			}
			const mockSend = jest.fn().mockResolvedValue(mockResponse)
			handlerWithProfile["client"] = {
				send: mockSend,
			} as unknown as BedrockRuntimeClient

			// Make a simple API call to ensure everything works
			const result = await handlerWithProfile.completePrompt("test")
			expect(mockSend).toHaveBeenCalled()
			expect(result).toBe("test")
		})
	})

	describe("createMessage", () => {
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

		it("should include system prompt cache when enabled and supported", async () => {
			// Create handler with prompt cache enabled
			const handlerWithCache = new AwsBedrockHandler({
				apiModelId: "anthropic.claude-3-7-sonnet-20250219-v1:0", // This model supports prompt cache
				awsAccessKey: "test-access-key",
				awsSecretKey: "test-secret-key",
				awsRegion: "us-east-1",
				awsUsePromptCache: true,
			})

			// Create a mock for the convertToBedrockConverseMessages function
			const originalConvert =
				require("../../../api/transform/bedrock-converse-format").convertToBedrockConverseMessages
			const mockConvert = jest.fn().mockImplementation((messages, systemPrompt, usePromptCache, modelInfo) => {
				// Call the original function to get the result
				const result = originalConvert(messages, systemPrompt, usePromptCache, modelInfo)

				// Add a cache point to the system array for testing
				if (usePromptCache && systemPrompt && result.system) {
					result.system.push({
						cachePoint: {
							type: "default",
						},
					})
				}

				return result
			})

			// Replace the original function with our mock
			require("../../../api/transform/bedrock-converse-format").convertToBedrockConverseMessages = mockConvert

			// Create a mock for the client.send method
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

			handlerWithCache["client"] = {
				send: mockInvoke,
				config: { region: "us-east-1" },
			} as unknown as BedrockRuntimeClient

			// Call the method
			const stream = handlerWithCache.createMessage(systemPrompt, mockMessages)
			for await (const chunk of stream) {
				// Just consume the stream
			}

			// Verify the mock was called with the right parameters
			expect(mockConvert).toHaveBeenCalledWith(
				mockMessages,
				systemPrompt,
				true,
				expect.objectContaining({
					supportsPromptCache: true,
				}),
			)

			// Restore the original function
			require("../../../api/transform/bedrock-converse-format").convertToBedrockConverseMessages = originalConvert
		})

		it("should not include system prompt cache when model doesn't support it", async () => {
			// Create handler with prompt cache enabled but use a model that doesn't support it
			const handlerWithCache = new AwsBedrockHandler({
				apiModelId: "amazon.titan-text-express-v1:0", // This model doesn't support prompt cache
				awsAccessKey: "test-access-key",
				awsSecretKey: "test-secret-key",
				awsRegion: "us-east-1",
				awsUsePromptCache: true,
			})

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

			handlerWithCache["client"] = {
				send: mockInvoke,
				config: { region: "us-east-1" },
			} as unknown as BedrockRuntimeClient

			const stream = handlerWithCache.createMessage(systemPrompt, mockMessages)
			for await (const chunk of stream) {
				// Just consume the stream
			}

			// Verify cachePoint was NOT included in the messages
			expect(mockInvoke).toHaveBeenCalledWith(
				expect.objectContaining({
					input: expect.objectContaining({
						system: expect.not.arrayContaining([
							expect.objectContaining({
								cachePoint: expect.anything(),
							}),
						]),
					}),
				}),
			)
		})

		it("should handle text messages correctly", async () => {
			const mockResponse = {
				messages: [
					{
						role: "assistant",
						content: [{ type: "text", text: "Hello! How can I help you?" }],
					},
				],
				usage: {
					input_tokens: 10,
					output_tokens: 5,
				},
			}

			// Mock AWS SDK invoke
			const mockStream = {
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
			}

			const mockInvoke = jest.fn().mockResolvedValue({
				stream: mockStream,
			})

			handler["client"] = {
				send: mockInvoke,
			} as unknown as BedrockRuntimeClient

			const stream = handler.createMessage(systemPrompt, mockMessages)
			const chunks = []

			for await (const chunk of stream) {
				chunks.push(chunk)
			}

			expect(chunks.length).toBeGreaterThan(0)
			expect(chunks[0]).toEqual({
				type: "usage",
				inputTokens: 10,
				outputTokens: 5,
				cacheReadTokens: 0,
				cacheWriteTokens: 0,
			})

			expect(mockInvoke).toHaveBeenCalledWith(
				expect.objectContaining({
					input: expect.objectContaining({
						modelId: "anthropic.claude-3-5-sonnet-20241022-v2:0",
					}),
				}),
			)
		})

		it("should handle cacheReadInputTokens and cacheWriteInputTokens fields", async () => {
			// Create handler with prompt cache enabled
			const handlerWithCache = new AwsBedrockHandler({
				apiModelId: "anthropic.claude-3-7-sonnet-20250219-v1:0", // This model supports prompt cache
				awsAccessKey: "test-access-key",
				awsSecretKey: "test-secret-key",
				awsRegion: "us-east-1",
				awsUsePromptCache: true,
			})

			// Mock AWS SDK invoke with cache token fields
			const mockStream = {
				[Symbol.asyncIterator]: async function* () {
					yield {
						metadata: {
							usage: {
								inputTokens: 10,
								outputTokens: 5,
								cacheReadInputTokens: 5,
								cacheWriteInputTokens: 10,
							},
						},
					}
				},
			}

			const mockInvoke = jest.fn().mockResolvedValue({
				stream: mockStream,
			})

			handlerWithCache["client"] = {
				send: mockInvoke,
				config: { region: "us-east-1" },
			} as unknown as BedrockRuntimeClient

			const stream = handlerWithCache.createMessage(systemPrompt, mockMessages)
			const chunks = []

			for await (const chunk of stream) {
				chunks.push(chunk)
			}

			expect(chunks.length).toBeGreaterThan(0)
			expect(chunks[0]).toEqual({
				type: "usage",
				inputTokens: 10,
				outputTokens: 5,
				cacheReadTokens: 5,
				cacheWriteTokens: 10,
			})
		})

		it("should handle cacheReadInputTokenCount and cacheWriteInputTokenCount fields", async () => {
			// Create handler with prompt cache enabled
			const handlerWithCache = new AwsBedrockHandler({
				apiModelId: "anthropic.claude-3-7-sonnet-20250219-v1:0", // This model supports prompt cache
				awsAccessKey: "test-access-key",
				awsSecretKey: "test-secret-key",
				awsRegion: "us-east-1",
				awsUsePromptCache: true,
			})

			// Mock AWS SDK invoke with alternative cache token field names
			const mockStream = {
				[Symbol.asyncIterator]: async function* () {
					yield {
						metadata: {
							usage: {
								inputTokens: 10,
								outputTokens: 5,
								cacheReadInputTokenCount: 5,
								cacheWriteInputTokenCount: 10,
							},
						},
					}
				},
			}

			const mockInvoke = jest.fn().mockResolvedValue({
				stream: mockStream,
			})

			handlerWithCache["client"] = {
				send: mockInvoke,
				config: { region: "us-east-1" },
			} as unknown as BedrockRuntimeClient

			const stream = handlerWithCache.createMessage(systemPrompt, mockMessages)
			const chunks = []

			for await (const chunk of stream) {
				chunks.push(chunk)
			}

			expect(chunks.length).toBeGreaterThan(0)
			expect(chunks[0]).toEqual({
				type: "usage",
				inputTokens: 10,
				outputTokens: 5,
				cacheReadTokens: 5,
				cacheWriteTokens: 10,
			})
		})

		it("should handle API errors", async () => {
			// Mock AWS SDK invoke with error
			const mockInvoke = jest.fn().mockRejectedValue(new Error("AWS Bedrock error"))

			handler["client"] = {
				send: mockInvoke,
			} as unknown as BedrockRuntimeClient

			const stream = handler.createMessage(systemPrompt, mockMessages)

			await expect(async () => {
				for await (const chunk of stream) {
					// Should throw before yielding any chunks
				}
			}).rejects.toThrow("AWS Bedrock error")
		})
	})

	describe("completePrompt", () => {
		it("should complete prompt successfully", async () => {
			const mockResponse = {
				output: new TextEncoder().encode(
					JSON.stringify({
						content: "Test response",
					}),
				),
			}

			const mockSend = jest.fn().mockResolvedValue(mockResponse)
			handler["client"] = {
				send: mockSend,
			} as unknown as BedrockRuntimeClient

			const result = await handler.completePrompt("Test prompt")
			expect(result).toBe("Test response")
			expect(mockSend).toHaveBeenCalledWith(
				expect.objectContaining({
					input: expect.objectContaining({
						modelId: "anthropic.claude-3-5-sonnet-20241022-v2:0",
						messages: expect.arrayContaining([
							expect.objectContaining({
								role: "user",
								content: [{ text: "Test prompt" }],
							}),
						]),
						inferenceConfig: expect.objectContaining({
							maxTokens: 5000,
							temperature: 0.3,
							topP: 0.1,
						}),
					}),
				}),
			)
		})

		it("should not include system prompt cache in completePrompt when enabled and supported", async () => {
			// Create handler with prompt cache enabled
			const handlerWithCache = new AwsBedrockHandler({
				apiModelId: "anthropic.claude-3-7-sonnet-20250219-v1:0", // This model supports prompt cache
				awsAccessKey: "test-access-key",
				awsSecretKey: "test-secret-key",
				awsRegion: "us-east-1",
				awsUsePromptCache: true,
			})

			const mockResponse = {
				output: new TextEncoder().encode(
					JSON.stringify({
						content: "Test response with cache",
					}),
				),
			}

			const mockSend = jest.fn().mockResolvedValue(mockResponse)
			handlerWithCache["client"] = {
				send: mockSend,
				config: { region: "us-east-1" },
			} as unknown as BedrockRuntimeClient

			const result = await handlerWithCache.completePrompt("Test prompt")
			expect(result).toBe("Test response with cache")

			// Verify cachePoint was included in the messages
			expect(mockSend).toHaveBeenCalledWith(
				expect.objectContaining({
					input: expect.not.objectContaining({
						system: expect.anything(),
					}),
				}),
			)
		})

		it("should not include system prompt cache in completePrompt when model doesn't support it", async () => {
			// Create handler with prompt cache enabled but use a model that doesn't support it
			const handlerWithCache = new AwsBedrockHandler({
				apiModelId: "amazon.titan-text-express-v1:0", // This model doesn't support prompt cache
				awsAccessKey: "test-access-key",
				awsSecretKey: "test-secret-key",
				awsRegion: "us-east-1",
				awsUsePromptCache: true,
			})

			const mockResponse = {
				output: new TextEncoder().encode(
					JSON.stringify({
						content: "Test response without cache",
					}),
				),
			}

			const mockSend = jest.fn().mockResolvedValue(mockResponse)
			handlerWithCache["client"] = {
				send: mockSend,
				config: { region: "us-east-1" },
			} as unknown as BedrockRuntimeClient

			const result = await handlerWithCache.completePrompt("Test prompt")
			expect(result).toBe("Test response without cache")

			// Verify cachePoint was included in the messages
			expect(mockSend).toHaveBeenCalledWith(
				expect.objectContaining({
					input: expect.not.objectContaining({
						system: expect.anything(),
					}),
				}),
			)
		})

		it("should handle API errors", async () => {
			const mockError = new Error("AWS Bedrock error")
			const mockSend = jest.fn().mockRejectedValue(mockError)
			handler["client"] = {
				send: mockSend,
			} as unknown as BedrockRuntimeClient

			await expect(handler.completePrompt("Test prompt")).rejects.toThrow(
				"Bedrock completion error: AWS Bedrock error",
			)
		})

		it("should handle invalid response format", async () => {
			const mockResponse = {
				output: new TextEncoder().encode("invalid json"),
			}

			const mockSend = jest.fn().mockResolvedValue(mockResponse)
			handler["client"] = {
				send: mockSend,
			} as unknown as BedrockRuntimeClient

			const result = await handler.completePrompt("Test prompt")
			expect(result).toBe("")
		})

		it("should handle empty response", async () => {
			const mockResponse = {
				output: new TextEncoder().encode(JSON.stringify({})),
			}

			const mockSend = jest.fn().mockResolvedValue(mockResponse)
			handler["client"] = {
				send: mockSend,
			} as unknown as BedrockRuntimeClient

			const result = await handler.completePrompt("Test prompt")
			expect(result).toBe("")
		})

		it("should handle cross-region inference", async () => {
			handler = new AwsBedrockHandler({
				apiModelId: "anthropic.claude-3-5-sonnet-20241022-v2:0",
				awsAccessKey: "test-access-key",
				awsSecretKey: "test-secret-key",
				awsRegion: "us-east-1",
				awsUseCrossRegionInference: true,
			})

			const mockResponse = {
				output: new TextEncoder().encode(
					JSON.stringify({
						content: "Test response",
					}),
				),
			}

			const mockSend = jest.fn().mockResolvedValue(mockResponse)
			handler["client"] = {
				send: mockSend,
			} as unknown as BedrockRuntimeClient

			const result = await handler.completePrompt("Test prompt")
			expect(result).toBe("Test response")
			expect(mockSend).toHaveBeenCalledWith(
				expect.objectContaining({
					input: expect.objectContaining({
						modelId: "us.anthropic.claude-3-5-sonnet-20241022-v2:0",
					}),
				}),
			)
		})
	})

	describe("getModel", () => {
		it("should return correct model info in test environment", () => {
			const modelInfo = handler.getModel()
			expect(modelInfo.id).toBe("anthropic.claude-3-5-sonnet-20241022-v2:0")
			expect(modelInfo.info).toBeDefined()
			expect(modelInfo.info.maxTokens).toBe(5000) // Test environment value
			expect(modelInfo.info.contextWindow).toBe(128_000) // Test environment value
		})

		it("should return test model info for invalid model in test environment", () => {
			const invalidHandler = new AwsBedrockHandler({
				apiModelId: "invalid-model",
				awsAccessKey: "test-access-key",
				awsSecretKey: "test-secret-key",
				awsRegion: "us-east-1",
			})
			const modelInfo = invalidHandler.getModel()
			expect(modelInfo.id).toBe("invalid-model") // In test env, returns whatever is passed
			expect(modelInfo.info.maxTokens).toBe(5000)
			expect(modelInfo.info.contextWindow).toBe(128_000)
		})

		it("should use custom ARN when provided", () => {
			const customArnHandler = new AwsBedrockHandler({
				apiModelId: "anthropic.claude-3-5-sonnet-20241022-v2:0",
				awsAccessKey: "test-access-key",
				awsSecretKey: "test-secret-key",
				awsRegion: "us-east-1",
				awsCustomArn: "arn:aws:bedrock:us-east-1::foundation-model/custom-model",
			})
			const modelInfo = customArnHandler.getModel()
			expect(modelInfo.id).toBe("arn:aws:bedrock:us-east-1::foundation-model/custom-model")
			expect(modelInfo.info.maxTokens).toBe(4096)
			expect(modelInfo.info.contextWindow).toBe(128_000)
			expect(modelInfo.info.supportsPromptCache).toBe(false)
		})

		it("should use default model when custom-arn is selected but no ARN is provided", () => {
			const customArnHandler = new AwsBedrockHandler({
				apiModelId: "custom-arn",
				awsAccessKey: "test-access-key",
				awsSecretKey: "test-secret-key",
				awsRegion: "us-east-1",
				// No awsCustomArn provided
			})
			const modelInfo = customArnHandler.getModel()
			// Should fall back to default model
			expect(modelInfo.id).not.toBe("custom-arn")
			expect(modelInfo.info).toBeDefined()
		})
	})

	describe("logging", () => {
		it("should write logs to console", () => {
			// Spy on console.log
			const consoleSpy = jest.spyOn(process.stdout, "write")

			// Create a handler with a custom ARN to trigger logging
			const customArnHandler = new AwsBedrockHandler({
				apiModelId: "anthropic.claude-3-5-sonnet-20241022-v2:0",
				awsAccessKey: "test-access-key",
				awsSecretKey: "test-secret-key",
				awsRegion: "us-east-1",
				awsCustomArn: "arn:aws:bedrock:us-east-1::foundation-model/custom-model",
			})

			// Trigger a log message
			logger.info("Test log message", { ctx: "bedrock-test" })

			// Verify the log was written to console
			expect(consoleSpy).toHaveBeenCalled()

			// Clean up
			consoleSpy.mockRestore()
		})
	})
})
