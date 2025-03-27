# Cache Strategy Class Relationship and Sequence Diagrams

This document provides class relationship diagrams and sequence diagrams for the cache strategy implementation in the Roo-Code project.

## Class Relationship Diagram

```mermaid
classDiagram
    class CacheStrategy {
        <<abstract>>
        #config: CacheStrategyConfig
        #systemTokenCount: number
        +determineOptimalCachePoints(): CacheResult
        #initializeMessageGroups(): void
        #calculateSystemTokens(): void
        #createCachePoint(): ContentBlock
        #messagesToContentBlocks(messages): Message[]
        #meetsMinTokenThreshold(tokenCount): boolean
        #estimateTokenCount(message): number
        #applyCachePoints(messages, placements): Message[]
        #formatResult(systemBlocks, messages): CacheResult
    }

    class SinglePointStrategy {
        +determineOptimalCachePoints(): CacheResult
        -formatWithoutCachePoints(): CacheResult
        -formatWithSystemCache(): CacheResult
        -formatWithMessageCache(): CacheResult
    }

    class MultiPointStrategy {
        -previousCachePointPlacements: CachePointPlacement[]
        +determineOptimalCachePoints(): CacheResult
        -determineMessageCachePoints(minTokensPerPoint, remainingCachePoints): CachePointPlacement[]
        -formatWithoutCachePoints(): CacheResult
        -preservePreviousCachePoints(): CachePointPlacement[]
    }

    class AwsBedrockHandler {
        -client: BedrockRuntimeClient
        -costModelConfig: object
        -previousCachePointPlacements: Map<string, CachePointPlacement[]>
        +createMessage(systemPrompt, messages): ApiStream
        +completePrompt(prompt): Promise<string>
        -supportsAwsPromptCache(modelConfig): boolean
        -getModelByName(modelName): object
        +getModel(): object
        -removeCachePoints(content): any
        -convertToBedrockConverseMessages(anthropicMessages, systemMessage, usePromptCache, modelInfo, conversationId): object
    }

    class CacheStrategyConfig {
        +modelInfo: ModelInfo
        +systemPrompt?: string
        +messages: MessageParam[]
        +usePromptCache: boolean
        +previousCachePointPlacements?: CachePointPlacement[]
    }

    class ModelInfo {
        +maxTokens: number
        +contextWindow: number
        +supportsPromptCache: boolean
        +maxCachePoints: number
        +minTokensPerCachePoint: number
        +cachableFields: Array<string>
    }

    class CacheResult {
        +system: SystemContentBlock[]
        +messages: Message[]
        +messageCachePointPlacements?: CachePointPlacement[]
    }

    class CachePointPlacement {
        +index: number
        +type: string
        +tokensCovered: number
    }

    CacheStrategy <|-- SinglePointStrategy : extends
    CacheStrategy <|-- MultiPointStrategy : extends
    CacheStrategy o-- CacheStrategyConfig : uses
    CacheStrategyConfig o-- ModelInfo : contains
    CacheStrategy ..> CacheResult : produces
    CacheStrategy ..> CachePointPlacement : creates
    AwsBedrockHandler ..> SinglePointStrategy : creates
    AwsBedrockHandler ..> MultiPointStrategy : creates
    AwsBedrockHandler ..> CachePointPlacement : tracks
    MultiPointStrategy ..> CachePointPlacement : preserves
```

## Sequence Diagram: Single-Point Strategy

This diagram illustrates the process flow when using the SinglePointStrategy for cache point placement.

```mermaid
sequenceDiagram
    participant Client as Client Code
    participant Bedrock as AwsBedrockHandler
    participant Strategy as SinglePointStrategy
    participant AWS as AWS Bedrock Service

    Client->>Bedrock: createMessage(systemPrompt, messages)
    Note over Bedrock: Check if prompt caching is enabled
    Bedrock->>Bedrock: getModel() to get model info
    Bedrock->>Bedrock: Check if model supports prompt cache

    Bedrock->>Strategy: new SinglePointStrategy(config)
    Note over Strategy: config contains modelInfo, systemPrompt, messages, usePromptCache

    Bedrock->>Strategy: determineOptimalCachePoints()

    alt usePromptCache is false
        Strategy->>Strategy: formatWithoutCachePoints()
    else supportsSystemCache and systemPrompt exists
        Strategy->>Strategy: meetsMinTokenThreshold(systemTokenCount)
        alt systemTokenCount >= minTokensPerCachePoint
            Strategy->>Strategy: formatWithSystemCache()
            Note over Strategy: Add cache point after system prompt
        end
    else supportsMessageCache
        Strategy->>Strategy: Calculate total message tokens
        Strategy->>Strategy: meetsMinTokenThreshold(totalMessageTokens)
        alt totalMessageTokens >= minTokensPerCachePoint
            Strategy->>Strategy: formatWithMessageCache()
            Note over Strategy: Find optimal position for cache point
            Strategy->>Strategy: applyCachePoints(messages, [placement])
        end
    end

    Strategy-->>Bedrock: Return CacheResult with system blocks and messages

    Bedrock->>AWS: Send request with cache points
    AWS-->>Bedrock: Stream response
    Bedrock-->>Client: Yield response chunks
```

## Sequence Diagram: Multi-Point Strategy with Cache Point Preservation

This diagram illustrates the process flow when using the MultiPointStrategy with multiple cache points in messages, including the preservation of previous cache points.

```mermaid
sequenceDiagram
    participant Client as Client Code
    participant Bedrock as AwsBedrockHandler
    participant Strategy as MultiPointStrategy
    participant AWS as AWS Bedrock Service

    Client->>Bedrock: createMessage(systemPrompt, messages)
    Note over Bedrock: Generate conversationId to track cache points
    Bedrock->>Bedrock: getModel() to get model info
    Bedrock->>Bedrock: Check if model supports prompt cache and has maxCachePoints > 1

    Bedrock->>Strategy: new MultiPointStrategy(config)
    Note over Strategy: config contains modelInfo, systemPrompt, messages, usePromptCache, previousCachePointPlacements

    Bedrock->>Strategy: determineOptimalCachePoints()

    alt usePromptCache is false or no messages
        Strategy->>Strategy: formatWithoutCachePoints()
    else
        Strategy->>Strategy: Check if system cache is supported
        alt supportsSystemCache and systemPrompt exists
            Strategy->>Strategy: meetsMinTokenThreshold(systemTokenCount)
            alt systemTokenCount >= minTokensPerCachePoint
                Strategy->>Strategy: Add cache point after system prompt
                Note over Strategy: Decrement remainingCachePoints
            end
        end

        alt previousCachePointPlacements exists
            Strategy->>Strategy: preservePreviousCachePoints()
            Note over Strategy: Analyze previous placements
            Note over Strategy: Preserve N-1 cache points when possible
            Note over Strategy: Determine which points to keep or combine
        else
            Strategy->>Strategy: determineMessageCachePoints(minTokensPerPoint, remainingCachePoints)
            loop while currentIndex < messages.length and remainingCachePoints > 0
                Strategy->>Strategy: Calculate remaining tokens
                Strategy->>Strategy: Calculate minumTokenMultiples
                alt remainingTokens > minTokensPerPoint
                    Strategy->>Strategy: Find next valid placement
                    Strategy->>Strategy: Add placement to placements array
                    Strategy->>Strategy: Update currentIndex and decrement remainingCachePoints
                end
            end
        end
        Strategy->>Strategy: applyCachePoints(messages, placements)
        Strategy->>Strategy: Store cache point placements in result
    end

    Strategy-->>Bedrock: Return CacheResult with system blocks, messages, and messageCachePointPlacements

    Bedrock->>Bedrock: Store cache point placements for conversationId
    Bedrock->>AWS: Send request with multiple cache points
    AWS-->>Bedrock: Stream response
    Bedrock-->>Client: Yield response chunks
```

## Key Components and Their Relationships

### AwsBedrockHandler

The `AwsBedrockHandler` class is responsible for:

- Creating and managing AWS Bedrock API requests
- Determining which cache strategy to use based on model capabilities
- Tracking cache point placements across consecutive messages using conversation IDs
- Converting Anthropic messages to Bedrock format with appropriate cache points

### CacheStrategy (Abstract Base Class)

The `CacheStrategy` abstract class provides:

- Common functionality for all cache strategies
- Methods for token estimation and threshold checking
- Utilities for message conversion and cache point creation
- Abstract method for determining optimal cache points

### SinglePointStrategy

The `SinglePointStrategy` class:

- Extends CacheStrategy
- Implements a strategy for placing a single cache point
- Places the cache point either after the system prompt or at an optimal position in messages
- Used when the model supports only one cache point

### MultiPointStrategy

The `MultiPointStrategy` class:

- Extends CacheStrategy
- Implements a strategy for placing multiple cache points
- Preserves previous cache points when processing growing conversations
- Analyzes token distribution to determine optimal cache point placements
- Ensures N-1 cache points remain in the same location when possible

### CacheStrategyConfig

The `CacheStrategyConfig` interface:

- Contains configuration for the cache strategy
- Includes model information, messages, and prompt cache settings
- Optionally includes previous cache point placements for maintaining consistency

### CacheResult

The `CacheResult` interface:

- Contains the result of cache strategy application
- Includes system content blocks and message content blocks
- Optionally includes cache point placements for future reference

### CachePointPlacement

The `CachePointPlacement` interface:

- Represents the position and metadata for a cache point
- Includes index, type, and token coverage information
- Used for tracking and preserving cache points across consecutive messages
