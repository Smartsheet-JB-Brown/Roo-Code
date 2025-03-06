import { AwsBedrockHandler } from "../bedrock"
import { Anthropic } from "@anthropic-ai/sdk"
import { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime"

describe("AWS Bedrock Prompt Caching for Roo Modes", () => {
	// Mock the BedrockRuntimeClient to avoid actual API calls
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

	beforeEach(() => {
		jest.clearAllMocks()
	})

	it("should add cache point after system prompt for all Roo modes", async () => {
		// Create a handler with prompt caching enabled
		const handler = new AwsBedrockHandler({
			apiModelId: "anthropic.claude-3-7-sonnet-20250219-v1:0", // Model that supports prompt caching
			awsAccessKey: "test-access-key",
			awsSecretKey: "test-secret-key",
			awsRegion: "us-east-1",
			awsUsePromptCache: true,
			awsPromptCacheId: "test-cache-id",
		})

		// Replace the client's send method with our mock
		handler["client"] = {
			send: mockSend,
		} as unknown as BedrockRuntimeClient

		// Define system prompts for different Roo modes
		const modeSystemPrompts = [
			"You are Roo, a highly skilled software engineer with extensive knowledge in many programming languages.", // Code mode
			"You are Roo, an experienced technical leader who is inquisitive and an excellent planner", // Architect mode
			"You are Roo, a knowledgeable technical assistant focused on answering questions", // Ask mode
			"You are Roo, an expert software debugger specializing in systematic problem diagnosis", // Debug mode
		]

		// Test each mode's system prompt
		for (const systemPrompt of modeSystemPrompts) {
			// Create a simple conversation with just the system prompt
			const messages: Anthropic.Messages.MessageParam[] = [
				{
					role: "user",
					content: "Hello",
				},
			]

			// Call createMessage with the system prompt
			const stream = handler.createMessage(systemPrompt, messages)

			// Consume the stream to trigger the API call
			for await (const chunk of stream) {
				// Just consume the stream
			}

			// Verify that the send method was called with the correct parameters
			expect(mockSend).toHaveBeenCalledWith(
				expect.objectContaining({
					input: expect.objectContaining({
						// Verify system prompt is included
						system: [{ text: systemPrompt }],
						// Verify messages include a cache point
						messages: expect.arrayContaining([
							expect.objectContaining({
								role: "user",
								content: [{ text: "Hello" }],
							}),
							expect.objectContaining({
								role: "user",
								content: [{ type: "cache_point" }],
							}),
						]),
						// Verify prompt cache configuration is included
						inferenceConfig: expect.objectContaining({
							promptCache: {
								promptCacheId: "test-cache-id",
							},
						}),
					}),
				}),
			)

			// Reset the mock for the next iteration
			mockSend.mockClear()
		}
	})

	it("should not add cache point when prompt caching is disabled", async () => {
		// Create a handler with prompt caching disabled
		const handler = new AwsBedrockHandler({
			apiModelId: "anthropic.claude-3-7-sonnet-20250219-v1:0", // Model that supports prompt caching
			awsAccessKey: "test-access-key",
			awsSecretKey: "test-secret-key",
			awsRegion: "us-east-1",
			awsUsePromptCache: false, // Disabled
		})

		// Replace the client's send method with our mock
		handler["client"] = {
			send: mockSend,
		} as unknown as BedrockRuntimeClient

		const systemPrompt = "You are Roo, a highly skilled software engineer."
		const messages: Anthropic.Messages.MessageParam[] = [
			{
				role: "user",
				content: "Hello",
			},
		]

		// Call createMessage with the system prompt
		const stream = handler.createMessage(systemPrompt, messages)

		// Consume the stream to trigger the API call
		for await (const chunk of stream) {
			// Just consume the stream
		}

		// Verify that the send method was called without a cache point
		expect(mockSend).toHaveBeenCalledWith(
			expect.objectContaining({
				input: expect.objectContaining({
					// Verify system prompt is included
					system: [{ text: systemPrompt }],
					// Verify messages don't include a cache point
					messages: expect.arrayContaining([
						expect.objectContaining({
							role: "user",
							content: [{ text: "Hello" }],
						}),
					]),
				}),
			}),
		)

		// Verify that no cache point was added
		const callArg = mockSend.mock.calls[0][0]
		const messages_arg = callArg.input.messages
		expect(messages_arg.length).toBe(1) // Only the original message, no cache point
		expect(messages_arg[0].content[0].text).toBe("Hello")

		// Verify that no prompt cache configuration was included
		expect(callArg.input.inferenceConfig.promptCache).toBeUndefined()
	})
})
