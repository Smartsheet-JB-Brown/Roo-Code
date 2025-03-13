import { AwsBedrockHandler } from "../bedrock"
import { ApiHandlerOptions } from "../../../shared/api"

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

// Mock the AWS SDK
jest.mock("@aws-sdk/client-bedrock-runtime", () => {
	// Store the last input for inspection
	let lastCommandInput: Record<string, any> | null = null

	const mockSend = jest.fn().mockImplementation(function (command) {
		// Log what we can about the command
		console.log("AWS Bedrock Command Type:", command?.constructor?.name)
		console.log("Last Command Input:", JSON.stringify(lastCommandInput, null, 2))

		// Add a delay to ensure logs are flushed
		return new Promise((resolve) => {
			setTimeout(() => {
				resolve({
					output: new TextEncoder().encode(JSON.stringify({ content: "Test response" })),
				})
			}, 100)
		})
	})

	// Mock ConverseCommand to capture input
	const mockConverseCommand = jest.fn(function (input) {
		console.log("ConverseCommand constructor called with input:", JSON.stringify(input, null, 2))
		lastCommandInput = input
		return {}
	})

	return {
		BedrockRuntimeClient: jest.fn().mockImplementation(() => ({
			send: mockSend,
			config: {
				region: "us-east-1",
			},
		})),
		ConverseCommand: mockConverseCommand,
		ConverseStreamCommand: jest.fn(),
	}
})

describe("AwsBedrockHandler with custom ARN", () => {
	console.log("Starting custom ARN tests")

	const mockOptions: ApiHandlerOptions = {
		apiModelId: "custom-arn",
		awsCustomArn: "arn:aws:bedrock:us-east-1:123456789012:foundation-model/anthropic.claude-3-sonnet-20240229-v1:0",
		awsRegion: "us-east-1",
	}

	beforeEach(() => {
		console.log("Setting up test")
		jest.clearAllMocks()
	})

	it("should use the custom ARN as the model ID", async () => {
		console.log("Test: should use the custom ARN as the model ID")
		const handler = new AwsBedrockHandler(mockOptions)
		const model = handler.getModel()

		console.log("Model ID:", model.id)
		console.log("Model info:", JSON.stringify(model.info, null, 2))

		expect(model.id).toBe(mockOptions.awsCustomArn)
		expect(model.info).toHaveProperty("maxTokens")
		expect(model.info).toHaveProperty("contextWindow")
		expect(model.info).toHaveProperty("supportsPromptCache")
	})

	it("should extract region from ARN and use it for client configuration", () => {
		console.log("Test: should extract region from ARN and use it for client configuration")
		// Test with matching region
		const handler1 = new AwsBedrockHandler(mockOptions)
		console.log("Handler1 client region:", (handler1 as any).client.config.region)
		expect((handler1 as any).client.config.region).toBe("us-east-1")

		// Test with mismatched region
		const mismatchOptions = {
			...mockOptions,
			awsRegion: "us-west-2",
		}
		console.log("Creating handler with mismatched region:", mismatchOptions.awsRegion)
		const handler2 = new AwsBedrockHandler(mismatchOptions)
		console.log("Handler2 client region:", (handler2 as any).client.config.region)
		// Should use the ARN region, not the provided region
		expect((handler2 as any).client.config.region).toBe("us-east-1")
	})

	it("should validate ARN format", async () => {
		console.log("Test: should validate ARN format")
		// Invalid ARN format
		const invalidOptions = {
			...mockOptions,
			awsCustomArn: "invalid-arn-format",
		}
		console.log("Creating handler with invalid ARN:", invalidOptions.awsCustomArn)

		const handler = new AwsBedrockHandler(invalidOptions)

		try {
			console.log("Attempting to complete prompt with invalid ARN")
			await handler.completePrompt("test")
			console.log("ERROR: This should have thrown an error but didn't")
		} catch (error) {
			console.log("Caught expected error:", error instanceof Error ? error.message : String(error))
		}

		// completePrompt should throw an error for invalid ARN
		await expect(handler.completePrompt("test")).rejects.toThrow("Invalid ARN format")
	})

	it("should complete a prompt successfully with valid ARN", async () => {
		console.log("Test: should complete a prompt successfully with valid ARN")
		const handler = new AwsBedrockHandler(mockOptions)
		console.log("Completing prompt with valid ARN")
		const response = await handler.completePrompt("test prompt")
		console.log("Response:", response)

		expect(response).toBe("Test response")
	})
})
