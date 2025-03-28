# Bedrock Cache Usage Issue Analysis

## Understanding the Problem

Prior to merging main to the codebase, you were getting good cache usage from the Bedrock provider, but now you don't see any cache usage. Based on my investigation, I've identified how the caching system works and potential points of failure.

## How Bedrock Caching Works

1. **Cache Configuration**:

    - The `awsUsePromptCache` setting controls whether caching is enabled
    - The model must support prompt caching (`supportsPromptCache: true`)
    - The model must have `cachableFields` defined (e.g., "system", "messages", "tools")

2. **Cache Strategy**:

    - The `MultiPointStrategy` class determines optimal cache point placements
    - Cache points can be added to both system prompts and messages
    - Cache points are inserted as special blocks in the messages sent to the Bedrock API

3. **Cache Usage Reporting**:
    - The Bedrock API returns cache usage metrics in the response
    - Two types of cache tokens are reported:
        - `cacheReadTokens`: Tokens that were read from the cache (saving cost)
        - `cacheWriteTokens`: Tokens that were written to the cache (for future use)
    - The code handles multiple naming conventions for these metrics

## Potential Causes of the Issue

1. **Configuration Changes**:

    - The `awsUsePromptCache` setting might have been disabled
    - The selected model might have changed to one that doesn't support caching

2. **Model Support Changes**:

    - The model's `supportsPromptCache` property might have changed
    - The model's `cachableFields` might have been removed or changed

3. **Code Changes**:

    - The cache strategy implementation might have changed
    - The way cache points are inserted might have changed
    - The way cache usage metrics are processed might have changed

4. **API Changes**:
    - The Bedrock API might have changed how it reports cache usage
    - The naming convention for cache metrics might have changed

## Diagnostic Plan

1. **Check Configuration**:

    - Verify that `awsUsePromptCache` is enabled in the settings
    - Confirm that the selected model supports prompt caching

2. **Check Model Support**:

    - Verify that the model has `supportsPromptCache: true`
    - Verify that the model has `cachableFields` defined

3. **Check Cache Strategy**:

    - Verify that the `MultiPointStrategy` is being used
    - Verify that cache points are being inserted correctly

4. **Check Cache Usage Reporting**:
    - Add logging to see if the Bedrock API is returning cache usage metrics
    - Verify that the code is correctly processing these metrics

## Implementation Plan

1. **Add Diagnostic Logging**:

    - Add detailed logging to the `createMessage` method to log:
        - The value of `usePromptCache`
        - The model's `supportsPromptCache` and `cachableFields` properties
        - The raw usage metrics returned by the Bedrock API
        - The processed cache usage metrics

2. **Verify Configuration**:

    - Check if `awsUsePromptCache` is enabled in the user's settings
    - If not, enable it and test again

3. **Test with Different Models**:

    - Try different Bedrock models that are known to support caching
    - Compare the results to identify if the issue is model-specific

4. **Compare with Previous Version**:
    - If possible, compare the current code with the pre-merge code
    - Identify any changes that might have affected caching

## Recommended Solution

Based on the diagnostic results, implement one of the following solutions:

1. **If Configuration Issue**:

    - Update the settings to enable `awsUsePromptCache`
    - Select a model that supports prompt caching

2. **If Model Support Issue**:

    - Update the model definitions to correctly specify `supportsPromptCache` and `cachableFields`

3. **If Code Issue**:

    - Fix any bugs in the cache strategy implementation
    - Ensure cache points are being inserted correctly
    - Ensure cache usage metrics are being processed correctly

4. **If API Issue**:
    - Update the code to handle any changes in the Bedrock API
    - Update the naming conventions for cache metrics if needed

## Verification Plan

After implementing the solution:

1. **Test Cache Writing**:

    - Send a message that should be cached
    - Verify that `cacheWriteTokens` is reported in the usage metrics

2. **Test Cache Reading**:

    - Send a similar message that should hit the cache
    - Verify that `cacheReadTokens` is reported in the usage metrics

3. **Monitor Cache Usage**:
    - Track cache usage over time to ensure it's working consistently

## Key Code Insights

From the code review, I found these important details:

1. The `isTestEnvironment` check in `bedrock.ts` (line 281) prevents cache tokens from being included in the output during tests:

    ```javascript
    const isTestEnvironment = process.env.NODE_ENV === "test"

    yield isTestEnvironment
        ? {
              type: "usage",
              inputTokens: usage.inputTokens || 0,
              outputTokens: usage.outputTokens || 0,
          }
        : {
              type: "usage",
              inputTokens: usage.inputTokens || 0,
              outputTokens: usage.outputTokens || 0,
              cacheReadTokens: cacheReadTokens,
              cacheWriteTokens: cacheWriteTokens,
          }
    ```

2. The `supportsAwsPromptCache` method checks three conditions:

    ```javascript
    return (
        modelConfig?.info?.supportsPromptCache &&
        (modelConfig?.info as any)?.cachableFields &&
        (modelConfig?.info as any)?.cachableFields?.length > 0
    )
    ```

3. The cache usage is determined by the `usePromptCache` variable:
    ```javascript
    const usePromptCache = Boolean(this.options.awsUsePromptCache && this.supportsAwsPromptCache(modelConfig))
    ```
