import {
	BedrockRuntimeClient,
	ConverseStreamCommand,
	ConverseCommand,
	BedrockRuntimeClientConfig,
} from "@aws-sdk/client-bedrock-runtime"
import { fromIni } from "@aws-sdk/credential-providers"
import { Anthropic } from "@anthropic-ai/sdk"
import { SingleCompletionHandler } from "../"
import {
	ApiHandlerOptions,
	BedrockModelId,
	ModelInfo as SharedModelInfo,
	bedrockDefaultModelId,
	bedrockModels,
	bedrockDefaultPromptRouterModelId,
} from "../../shared/api"
import { ApiStream } from "../transform/stream"
import { BaseProvider } from "./base-provider"
import { logger } from "../../utils/logging"
import { Message, SystemContentBlock } from "@aws-sdk/client-bedrock-runtime"
// New cache-related imports
import { SinglePointStrategy } from "../transform/cache-strategy/single-point-strategy"
import { MultiPointStrategy } from "../transform/cache-strategy/multi-point-strategy"
import { ModelInfo as CacheModelInfo } from "../transform/cache-strategy/types"

// Define interface for Bedrock inference config
interface BedrockInferenceConfig {
	maxTokens: number
	temperature: number
	topP: number
	// New cache-related field
	usePromptCache?: boolean
}

/**
 * Validates an AWS Bedrock ARN format and optionally checks if the region in the ARN matches the provided region
 * @param arn The ARN string to validate
 * @param region Optional region to check against the ARN's region
 * @returns An object with validation results: { isValid, arnRegion, errorMessage }
 */
function validateBedrockArn(arn: string, region?: string) {
	// Validate ARN format
	const arnRegex =
		/^arn:aws:bedrock:([^:]+):(\d+):(foundation-model|provisioned-model|default-prompt-router|prompt-router)\/(.+)$/
	const match = arn.match(arnRegex)

	if (!match) {
		return {
			isValid: false,
			arnRegion: undefined,
			errorMessage:
				"Invalid ARN format. ARN should follow the pattern: arn:aws:bedrock:region:account-id:resource-type/resource-name",
		}
	}

	// Extract region from ARN
	const arnRegion = match[1]

	// Check if region in ARN matches provided region (if specified)
	if (region && arnRegion !== region) {
		return {
			isValid: true,
			arnRegion,
			errorMessage: `Warning: The region in your ARN (${arnRegion}) does not match your selected region (${region}). This may cause access issues. The provider will use the region from the ARN.`,
		}
	}

	// ARN is valid and region matches (or no region was provided to check against)
	return {
		isValid: true,
		arnRegion,
		errorMessage: undefined,
	}
}

const BEDROCK_DEFAULT_TEMPERATURE = 0.3

// Define types for stream events based on AWS SDK
export interface StreamEvent {
	messageStart?: {
		role?: string
	}
	messageStop?: {
		stopReason?: "end_turn" | "tool_use" | "max_tokens" | "stop_sequence"
		additionalModelResponseFields?: Record<string, unknown>
	}
	contentBlockStart?: {
		start?: {
			text?: string
		}
		contentBlockIndex?: number
	}
	contentBlockDelta?: {
		delta?: {
			text?: string
		}
		contentBlockIndex?: number
	}
	metadata?: {
		usage?: {
			inputTokens: number
			outputTokens: number
			totalTokens?: number // Made optional since we don't use it
			// New cache-related fields
			cacheReadInputTokens?: number
			cacheWriteInputTokens?: number
			cacheReadInputTokenCount?: number
			cacheWriteInputTokenCount?: number
		}
		metrics?: {
			latencyMs: number
		}
	}
	// New trace field for prompt router
	trace?: {
		promptRouter?: {
			invokedModelId?: string
			usage?: {
				inputTokens: number
				outputTokens: number
				totalTokens?: number // Made optional since we don't use it
				cacheReadTokens?: number
				cacheWriteTokens?: number
			}
		}
	}
}

export class AwsBedrockHandler extends BaseProvider implements SingleCompletionHandler {
	protected options: ApiHandlerOptions
	private client: BedrockRuntimeClient
	// Using logger instead of outputChannel

	private costModelConfig: { id: BedrockModelId | string; info: SharedModelInfo } = {
		id: "",
		info: { maxTokens: 0, contextWindow: 0, supportsPromptCache: false, supportsImages: false },
	}

	constructor(options: ApiHandlerOptions) {
		super()
		this.options = options

		// Extract region from custom ARN if provided
		let region = this.options.awsRegion

		// If using custom ARN, extract region from the ARN
		if (this.options.awsCustomArn) {
			const validation = validateBedrockArn(this.options.awsCustomArn, region)

			if (validation.isValid && validation.arnRegion) {
				// If there's a region mismatch warning, log it and use the ARN region
				if (validation.errorMessage) {
					logger.info(
						`Region mismatch: Selected region is ${region}, but ARN region is ${validation.arnRegion}. Using ARN region.`,
						{
							ctx: "bedrock",
							selectedRegion: region,
							arnRegion: validation.arnRegion,
						},
					)
					region = validation.arnRegion
				}
			}
		}

		const clientConfig: BedrockRuntimeClientConfig = {
			region: region,
		}

		if (this.options.awsUseProfile && this.options.awsProfile) {
			// Use profile-based credentials if enabled and profile is set
			clientConfig.credentials = fromIni({
				profile: this.options.awsProfile,
			})
		} else if (this.options.awsAccessKey && this.options.awsSecretKey) {
			// Use direct credentials if provided
			clientConfig.credentials = {
				accessKeyId: this.options.awsAccessKey,
				secretAccessKey: this.options.awsSecretKey,
				...(this.options.awsSessionToken ? { sessionToken: this.options.awsSessionToken } : {}),
			}
		}

		this.client = new BedrockRuntimeClient(clientConfig)
	}

	override async *createMessage(systemPrompt: string, messages: Anthropic.Messages.MessageParam[]): ApiStream {
		let modelConfig = this.getModel()
		// Handle cross-region inference
		let modelId: string

		// For custom ARNs, use the ARN directly without modification
		if (this.options.awsCustomArn) {
			modelId = modelConfig.id

			// Validate ARN format and check region match
			const clientRegion = this.client.config.region as string
			const validation = validateBedrockArn(modelId, clientRegion)

			if (!validation.isValid) {
				logger.error("Invalid ARN format", {
					ctx: "bedrock",
					modelId,
					errorMessage: validation.errorMessage,
				})
				yield {
					type: "text",
					text: `Error: ${validation.errorMessage}`,
				}
				yield { type: "usage", inputTokens: 0, outputTokens: 0 }
				throw new Error("Invalid ARN format")
			}

			// Extract region from ARN
			const arnRegion = validation.arnRegion!

			// Log warning if there's a region mismatch
			if (validation.errorMessage) {
				logger.warn(validation.errorMessage, {
					ctx: "bedrock",
					arnRegion,
					clientRegion,
				})
			}
		} else if (this.options.awsUseCrossRegionInference) {
			let regionPrefix = (this.options.awsRegion || "").slice(0, 3)
			switch (regionPrefix) {
				case "us-":
					modelId = `us.${modelConfig.id}`
					break
				case "eu-":
					modelId = `eu.${modelConfig.id}`
					break
				default:
					modelId = modelConfig.id
					break
			}
		} else {
			modelId = modelConfig.id
		}

		const usePromptCache = Boolean(this.options.awsUsePromptCache && this.supportsAwsPromptCache(modelConfig))

		// Generate a conversation ID based on the first few messages to maintain cache consistency
		// This is a simple approach - in a real application, you might want to use a more robust ID system
		const conversationId =
			messages.length > 0
				? `conv_${messages[0].role}_${
						typeof messages[0].content === "string"
							? messages[0].content.substring(0, 20)
							: "complex_content"
					}`
				: "default_conversation"

		// Convert messages to Bedrock format, passing the model info and conversation ID
		const formatted = this.convertToBedrockConverseMessages(
			messages,
			systemPrompt,
			usePromptCache,
			modelConfig.info,
			conversationId,
		)

		// Construct the payload
		const inferenceConfig: BedrockInferenceConfig = {
			maxTokens: modelConfig.info.maxTokens || 4096,
			temperature: this.options.modelTemperature ?? BEDROCK_DEFAULT_TEMPERATURE,
			topP: 0.1,
		}

		const payload = {
			modelId,
			messages: formatted.messages,
			system: formatted.system,
			inferenceConfig,
		}

		// Create AbortController with 10 minute timeout
		const controller = new AbortController()
		let timeoutId: NodeJS.Timeout | undefined

		try {
			timeoutId = setTimeout(
				() => {
					controller.abort()
				},
				10 * 60 * 1000,
			)

			// Log the payload for debugging custom ARN issues
			if (this.options.awsCustomArn) {
				logger.debug("Using custom ARN for Bedrock request", {
					ctx: "bedrock",
					customArn: this.options.awsCustomArn,
					clientRegion: this.client.config.region,
					payload: JSON.stringify(payload, null, 2),
				})
			}

			const command = new ConverseStreamCommand(payload)
			const response = await this.client.send(command, {
				abortSignal: controller.signal,
			})

			if (!response.stream) {
				clearTimeout(timeoutId)
				throw new Error("No stream available in the response")
			}

			for await (const chunk of response.stream) {
				// Parse the chunk as JSON if it's a string (for tests)
				let streamEvent: StreamEvent
				try {
					streamEvent = typeof chunk === "string" ? JSON.parse(chunk) : (chunk as unknown as StreamEvent)
				} catch (e) {
					logger.error("Failed to parse stream event", {
						ctx: "bedrock",
						error: e instanceof Error ? e : String(e),
						chunk: typeof chunk === "string" ? chunk : "binary data",
					})
					continue
				}

				// Handle metadata events first
				if (streamEvent.metadata?.usage) {
					// Define a type for usage to avoid TypeScript errors
					type UsageType = {
						inputTokens?: number
						outputTokens?: number
						cacheReadInputTokens?: number
						cacheWriteInputTokens?: number
						cacheReadInputTokenCount?: number
						cacheWriteInputTokenCount?: number
					}

					const usage = (streamEvent.metadata?.usage || {}) as UsageType

					// Check both field naming conventions for cache tokens
					const cacheReadTokens = usage.cacheReadInputTokens || usage.cacheReadInputTokenCount || 0
					const cacheWriteTokens = usage.cacheWriteInputTokens || usage.cacheWriteInputTokenCount || 0

					yield {
						type: "usage",
						inputTokens: usage.inputTokens || 0,
						outputTokens: usage.outputTokens || 0,
						cacheReadTokens: cacheReadTokens,
						cacheWriteTokens: cacheWriteTokens,
					}
					continue
				}

				if (streamEvent?.trace?.promptRouter?.invokedModelId) {
					try {
						const invokedModelId = streamEvent.trace.promptRouter.invokedModelId

						const modelMatch = invokedModelId.match(/\/([^\/]+)(?::|$)/)
						if (modelMatch && modelMatch[1]) {
							let modelName = modelMatch[1]
							let region = modelName.slice(0, 3)

							if (region === "us." || region === "eu.") {
								modelName = modelName.slice(3)
							}

							const previousConfig = this.costModelConfig
							this.costModelConfig = this.getModelByName(modelName)
						}

						// Handle metadata events for the promptRouter.
						if (streamEvent?.trace?.promptRouter?.usage) {
							const routerUsage = streamEvent.trace.promptRouter.usage

							yield {
								type: "usage",
								inputTokens: routerUsage.inputTokens || 0,
								outputTokens: routerUsage.outputTokens || 0,
							}
						}
					} catch (error) {
						logger.error("Error handling Bedrock invokedModelId", {
							ctx: "bedrock",
							error: error instanceof Error ? error : String(error),
						})
					} finally {
						continue
					}
				}

				// Handle message start
				if (streamEvent.messageStart) {
					continue
				}

				// Handle content blocks
				if (streamEvent.contentBlockStart?.start?.text) {
					yield {
						type: "text",
						text: streamEvent.contentBlockStart.start.text,
					}
					continue
				}

				// Handle content deltas
				if (streamEvent.contentBlockDelta?.delta?.text) {
					yield {
						type: "text",
						text: streamEvent.contentBlockDelta.delta.text,
					}
					continue
				}
				// Handle message stop
				if (streamEvent.messageStop) {
					continue
				}
			}
			// Clear timeout after stream completes
			clearTimeout(timeoutId)
		} catch (error: unknown) {
			// Clear timeout on error
			clearTimeout(timeoutId)
			logger.error("Bedrock Runtime API Error", {
				ctx: "bedrock",
				error: error instanceof Error ? error : String(error),
			})

			// Check if this is an abort error
			if (error instanceof Error && error.name === "AbortError") {
				logger.info("Request was aborted", {
					ctx: "bedrock",
					errorMessage: error.message,
				})
				yield {
					type: "text",
					text: `Request was aborted: The operation timed out or was manually cancelled. Please try again or check your network connection.`,
				}
			}
			// Enhanced error handling for custom ARN issues
			if (this.options.awsCustomArn) {
				logger.error("Error occurred with custom ARN", {
					ctx: "bedrock",
					customArn: this.options.awsCustomArn,
				})

				// Check for common ARN-related errors
				if (error instanceof Error) {
					const errorMessage = error.message.toLowerCase()

					// Access denied errors
					if (
						errorMessage.includes("access") &&
						(errorMessage.includes("model") || errorMessage.includes("denied"))
					) {
						logger.error("Permissions issue with custom ARN", {
							ctx: "bedrock",
							customArn: this.options.awsCustomArn,
							errorType: "access_denied",
							clientRegion: this.client.config.region,
						})
						yield {
							type: "text",
							text: `Error: You don't have access to the model with the specified ARN. Please verify:

1. The ARN is correct and points to a valid model
2. Your AWS credentials have permission to access this model (check IAM policies)
3. The region in the ARN (${this.client.config.region}) matches the region where the model is deployed
4. If using a provisioned model, ensure it's active and not in a failed state
5. If using a custom model, ensure your account has been granted access to it`,
						}
					}
					// Model not found errors
					else if (errorMessage.includes("not found") || errorMessage.includes("does not exist")) {
						logger.error("Invalid ARN or non-existent model", {
							ctx: "bedrock",
							customArn: this.options.awsCustomArn,
							errorType: "not_found",
						})
						yield {
							type: "text",
							text: `Error: The specified ARN does not exist or is invalid. Please check:

1. The ARN format is correct (arn:aws:bedrock:region:account-id:resource-type/resource-name)
2. The model exists in the specified region
3. The account ID in the ARN is correct
4. The resource type is one of: foundation-model, provisioned-model, or default-prompt-router`,
						}
					}
					// Throttling errors
					else if (
						errorMessage.includes("throttl") ||
						errorMessage.includes("rate") ||
						errorMessage.includes("limit")
					) {
						logger.error("Throttling or rate limit issue with Bedrock", {
							ctx: "bedrock",
							customArn: this.options.awsCustomArn,
							errorType: "throttling",
						})
						yield {
							type: "text",
							text: `Error: Request was throttled or rate limited. Please try:

1. Reducing the frequency of requests
2. If using a provisioned model, check its throughput settings
3. Contact AWS support to request a quota increase if needed`,
						}
					}
					// Other errors
					else {
						logger.error("Unspecified error with custom ARN", {
							ctx: "bedrock",
							customArn: this.options.awsCustomArn,
							errorStack: error.stack,
							errorMessage: error.message,
						})
						yield {
							type: "text",
							text: `Error with custom ARN: ${error.message}

Please check:
1. Your AWS credentials are valid and have the necessary permissions
2. The ARN format is correct
3. The region in the ARN matches the region where you're making the request`,
						}
					}
				} else {
					yield {
						type: "text",
						text: `Unknown error occurred with custom ARN. Please check your AWS credentials and ARN format.`,
					}
				}
			} else {
				// Standard error handling for non-ARN cases
				if (error instanceof Error) {
					logger.error("Standard Bedrock error", {
						ctx: "bedrock",
						errorStack: error.stack,
						errorMessage: error.message,
					})
					yield {
						type: "text",
						text: `Error: ${error.message}`,
					}
				} else {
					logger.error("Unknown Bedrock error", {
						ctx: "bedrock",
						error: String(error),
					})
					yield {
						type: "text",
						text: "An unknown error occurred",
					}
				}
			}

			// Always yield usage info
			yield {
				type: "usage",
				inputTokens: 0,
				outputTokens: 0,
			}

			// Re-throw the error
			if (error instanceof Error) {
				throw error
			} else {
				throw new Error("An unknown error occurred")
			}
		}
	}

	private supportsAwsPromptCache(modelConfig: {
		id: BedrockModelId | string
		info: SharedModelInfo
	}): boolean | undefined {
		return modelConfig?.info?.cachableFields && modelConfig?.info?.cachableFields?.length > 0
		//	return modelConfig.info.supportsPromptCache
	}

	//Prompt Router responses come back in a different sequence and the model used is in the response and must be fetched by name
	getModelByName(modelName: string): { id: BedrockModelId | string; info: SharedModelInfo } {
		// Try to find the model in bedrockModels
		if (modelName in bedrockModels) {
			const id = modelName as BedrockModelId

			//Do a deep copy of the model info so that later in the code the model id and maxTokens can be set.
			// The bedrockModels array is a constant and updating the model ID from the returned invokedModelID value
			// in a prompt router response isn't possible on the constant.
			let model = JSON.parse(JSON.stringify(bedrockModels[id]))

			// If modelMaxTokens is explicitly set in options, override the default
			if (this.options.modelMaxTokens && this.options.modelMaxTokens > 0) {
				const originalMaxTokens = model.maxTokens
				model.maxTokens = this.options.modelMaxTokens
			}

			return { id, info: model }
		}

		return { id: bedrockDefaultModelId, info: bedrockModels[bedrockDefaultModelId] }
	}

	override getModel(): { id: BedrockModelId | string; info: SharedModelInfo } {
		if (this.costModelConfig.id.trim().length > 0) {
			return this.costModelConfig
		}

		// If custom ARN is provided, use it
		if (this.options.awsCustomArn) {
			// Extract the model name from the ARN
			const arnMatch = this.options.awsCustomArn.match(
				/^arn:aws:bedrock:([^:]+):(\d+):(inference-profile|foundation-model|provisioned-model)\/(.+)$/,
			)

			let modelName = arnMatch ? arnMatch[4] : ""

			if (modelName) {
				let region = modelName.slice(0, 3)

				if (region === "us." || region === "eu.") {
					modelName = modelName.slice(3)
				}

				let modelData = this.getModelByName(modelName)
				modelData.id = this.options.awsCustomArn

				if (modelData) {
					return modelData
				}
			}

			// An ARN was used, but no model info match found, use default values based on common patterns
			let model = this.getModelByName(bedrockDefaultPromptRouterModelId)

			// For custom ARNs, always return the specific values expected by tests
			return {
				id: this.options.awsCustomArn,
				info: model.info,
			}
		}

		if (this.options.apiModelId) {
			// Special case for custom ARN option
			if (this.options.apiModelId === "custom-arn") {
				return this.getModelByName(bedrockDefaultModelId)
			}

			// For production, validate against known models
			return this.getModelByName(this.options.apiModelId)
		}

		return this.getModelByName(bedrockDefaultModelId)
	}

	async completePrompt(prompt: string): Promise<string> {
		try {
			const modelConfig = this.getModel()

			// Handle cross-region inference
			let modelId: string

			// For custom ARNs, use the ARN directly without modification
			if (this.options.awsCustomArn) {
				modelId = modelConfig.id

				// Validate ARN format and check region match
				const clientRegion = this.client.config.region as string
				const validation = validateBedrockArn(modelId, clientRegion)

				if (!validation.isValid) {
					logger.error("Invalid ARN format in completePrompt", {
						ctx: "bedrock",
						modelId,
						errorMessage: validation.errorMessage,
					})
					throw new Error(
						validation.errorMessage ||
							"Invalid ARN format. ARN should follow the pattern: arn:aws:bedrock:region:account-id:resource-type/resource-name",
					)
				}

				// Extract region from ARN
				const arnRegion = validation.arnRegion!

				// Log warning if there's a region mismatch
				if (validation.errorMessage) {
					logger.warn(validation.errorMessage, {
						ctx: "bedrock",
						arnRegion,
						clientRegion,
					})
				}
			} else if (this.options.awsUseCrossRegionInference) {
				let regionPrefix = (this.options.awsRegion || "").slice(0, 3)
				switch (regionPrefix) {
					case "us-":
						modelId = `us.${modelConfig.id}`
						break
					case "eu-":
						modelId = `eu.${modelConfig.id}`
						break
					default:
						modelId = modelConfig.id
						break
				}
			} else {
				modelId = modelConfig.id
			}

			const inferenceConfig: BedrockInferenceConfig = {
				maxTokens: modelConfig.info.maxTokens || 4096,
				temperature: this.options.modelTemperature ?? BEDROCK_DEFAULT_TEMPERATURE,
				topP: 0.1,
			}

			const usePromptCache = Boolean(this.options.awsUsePromptCache && this.supportsAwsPromptCache(modelConfig))

			// For completePrompt, use a unique conversation ID based on the prompt
			const conversationId = `prompt_${prompt.substring(0, 20)}`

			const payload = {
				modelId,
				messages: this.convertToBedrockConverseMessages(
					[
						{
							role: "user",
							content: prompt,
						},
					],
					undefined,
					usePromptCache,
					modelConfig.info,
					conversationId,
				).messages,
				inferenceConfig,
			}

			const command = new ConverseCommand(payload)
			const response = await this.client.send(command)

			if (response.output && response.output instanceof Uint8Array) {
				try {
					const outputStr = new TextDecoder().decode(response.output)
					const output = JSON.parse(outputStr)
					if (output.content) {
						return output.content
					}
				} catch (parseError) {
					logger.error("Failed to parse Bedrock response", {
						ctx: "bedrock",
						error: parseError instanceof Error ? parseError : String(parseError),
					})
				}
			}
			return ""
		} catch (error) {
			// Check if this is an abort error
			if (error instanceof Error && error.name === "AbortError") {
				logger.info("Request was aborted in completePrompt", {
					ctx: "bedrock",
					errorMessage: error.message,
				})
				throw new Error(
					`Request was aborted: The operation timed out or was manually cancelled. Please try again or check your network connection.`,
				)
			}

			// Enhanced error handling for custom ARN issues
			if (this.options.awsCustomArn) {
				logger.error("Error occurred with custom ARN in completePrompt", {
					ctx: "bedrock",
					customArn: this.options.awsCustomArn,
					error: error instanceof Error ? error : String(error),
				})

				if (error instanceof Error) {
					const errorMessage = error.message.toLowerCase()

					// Access denied errors
					if (
						errorMessage.includes("access") &&
						(errorMessage.includes("model") || errorMessage.includes("denied"))
					) {
						throw new Error(
							`Bedrock custom ARN error: You don't have access to the model with the specified ARN. Please verify:
1. The ARN is correct and points to a valid model
2. Your AWS credentials have permission to access this model (check IAM policies)
3. The region in the ARN matches the region where the model is deployed
4. If using a provisioned model, ensure it's active and not in a failed state`,
						)
					}
					// Model not found errors
					else if (errorMessage.includes("not found") || errorMessage.includes("does not exist")) {
						throw new Error(
							`Bedrock custom ARN error: The specified ARN does not exist or is invalid. Please check:
1. The ARN format is correct (arn:aws:bedrock:region:account-id:resource-type/resource-name)
2. The model exists in the specified region
3. The account ID in the ARN is correct
4. The resource type is one of: foundation-model, provisioned-model, or default-prompt-router`,
						)
					}
					// Throttling errors
					else if (
						errorMessage.includes("throttl") ||
						errorMessage.includes("rate") ||
						errorMessage.includes("limit")
					) {
						throw new Error(
							`Bedrock custom ARN error: Request was throttled or rate limited. Please try:
1. Reducing the frequency of requests
2. If using a provisioned model, check its throughput settings
3. Contact AWS support to request a quota increase if needed`,
						)
					} else {
						throw new Error(`Bedrock custom ARN error: ${error.message}`)
					}
				}
			}

			// Standard error handling
			if (error instanceof Error) {
				throw new Error(`Bedrock completion error: ${error.message}`)
			}
			throw error
		}
	}

	/**
	 * Removes any existing cachePoint nodes from content blocks
	 */
	private removeCachePoints(content: any): any {
		if (Array.isArray(content)) {
			return content.map((block) => {
				const { cachePoint, ...rest } = block
				return rest
			})
		}
		return content
	}

	// Store previous cache point placements for maintaining consistency across consecutive messages
	private previousCachePointPlacements: { [conversationId: string]: any[] } = {}

	/**
	 * Convert Anthropic messages to Bedrock Converse format
	 */
	private convertToBedrockConverseMessages(
		anthropicMessages: Anthropic.Messages.MessageParam[] | { role: string; content: string }[],
		systemMessage?: string,
		usePromptCache: boolean = false,
		modelInfo?: any,
		conversationId?: string, // Optional conversation ID to track cache points across messages
	): { system: SystemContentBlock[]; messages: Message[] } {
		// Convert model info to expected format
		const cacheModelInfo: CacheModelInfo = {
			maxTokens: modelInfo?.maxTokens || 8192,
			contextWindow: modelInfo?.contextWindow || 200_000,
			supportsPromptCache: modelInfo?.supportsPromptCache || false,
			maxCachePoints: modelInfo?.maxCachePoints || 0,
			minTokensPerCachePoint: modelInfo?.minTokensPerCachePoint || 50,
			cachableFields: modelInfo?.cachableFields || [],
		}

		// Clean messages by removing any existing cache points
		const cleanedMessages = anthropicMessages.map((msg) => {
			if (typeof msg.content === "string") {
				return msg
			}
			const cleaned = {
				...msg,
				content: this.removeCachePoints(msg.content),
			}
			return cleaned
		})

		// Get previous cache point placements for this conversation if available
		const previousPlacements =
			conversationId && this.previousCachePointPlacements[conversationId]
				? this.previousCachePointPlacements[conversationId]
				: undefined

		// Create config for cache strategy
		const config = {
			modelInfo: cacheModelInfo,
			systemPrompt: systemMessage,
			messages: cleanedMessages as Anthropic.Messages.MessageParam[],
			usePromptCache,
			previousCachePointPlacements: previousPlacements,
		}

		// Inline the logic from convertWithOptimalCaching and CacheStrategyFactory.createStrategy
		let strategy

		// If caching is not supported or disabled, use single point strategy
		if (!config.modelInfo.supportsPromptCache || !config.usePromptCache) {
			strategy = new SinglePointStrategy(config)
		}
		// Use single point strategy if model only supports one cache point
		else if (config.modelInfo.maxCachePoints <= 1) {
			strategy = new SinglePointStrategy(config)
		}
		// For multi-point support, use multi-point strategy
		else {
			strategy = new MultiPointStrategy(config)
		}

		// Determine optimal cache points
		const result = strategy.determineOptimalCachePoints()

		// Store cache point placements for future use if conversation ID is provided
		if (conversationId && result.messageCachePointPlacements) {
			this.previousCachePointPlacements[conversationId] = result.messageCachePointPlacements
		}

		return result
	}
}
