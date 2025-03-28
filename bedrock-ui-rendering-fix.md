# Fixing the Bedrock Prompt Cache UI Rendering Issue

## Problem Summary

The "Enable prompt caching" checkbox is not appearing in the Roo settings panel for the Bedrock provider, even though you're using a model (`anthropic.claude-3-7-sonnet-20250219-v1:0`) that should support prompt caching according to the model definitions in `src/shared/api.ts`.

## Detailed Bug Analysis

The checkbox for enabling prompt caching is conditionally rendered in `webview-ui/src/components/settings/ApiOptions.tsx` based on `selectedModelInfo?.supportsPromptCache`:

```jsx
{
	selectedModelInfo?.supportsPromptCache && (
		<Checkbox
			checked={apiConfiguration?.awsUsePromptCache || false}
			onChange={handleInputChange("awsUsePromptCache", noTransform)}>
			<div className="flex items-center gap-1">
				<span>Enable prompt caching</span>
				<i
					className="codicon codicon-info text-vscode-descriptionForeground"
					title="Enable prompt caching to improve performance and reduce costs for supported models."
					style={{ fontSize: "12px" }}
				/>
			</div>
		</Checkbox>
	)
}
```

The `selectedModelInfo` is determined by the `normalizeApiConfiguration` function:

```javascript
export function normalizeApiConfiguration(apiConfiguration?: ApiConfiguration) {
  const provider = apiConfiguration?.apiProvider || "anthropic"
  const modelId = apiConfiguration?.apiModelId

  const getProviderData = (models: Record<string, ModelInfo>, defaultId: string) => {
    let selectedModelId: string
    let selectedModelInfo: ModelInfo

    if (modelId && modelId in models) {
      selectedModelId = modelId
      selectedModelInfo = models[modelId]
    } else {
      selectedModelId = defaultId
      selectedModelInfo = models[defaultId]
    }

    return { selectedProvider: provider, selectedModelId, selectedModelInfo }
  }

  switch (provider) {
    case "anthropic":
      return getProviderData(anthropicModels, anthropicDefaultModelId)
    case "bedrock":
      // Special case for custom ARN
      if (modelId === "custom-arn") {
        return {
          selectedProvider: provider,
          selectedModelId: "custom-arn",
          selectedModelInfo: {
            maxTokens: 5000,
            contextWindow: 128_000,
            supportsPromptCache: false,
            supportsImages: true,
          },
        }
      }
      return getProviderData(bedrockModels, bedrockDefaultModelId)
    // ... other cases ...
  }
}
```

## Potential Bug Locations

1. **Model ID Mismatch**: The model ID in the UI might not exactly match the model ID in the `bedrockModels` object. This would cause the `getProviderData` function to use the default model instead of the selected one.

2. **Model Info Not Being Passed Correctly**: The model info might not be correctly passed from the `normalizeApiConfiguration` function to the UI component.

3. **Custom ARN Detection**: The code might be incorrectly identifying the model as a custom ARN, which would set `supportsPromptCache: false`.

4. **Cache-related Properties Missing**: The model info might be missing some required cache-related properties, causing the checkbox not to appear.

## Recommended UI Fix

The most straightforward fix is to modify the conditional rendering in `webview-ui/src/components/settings/ApiOptions.tsx` to always show the prompt caching checkbox for Bedrock:

```jsx
{
	selectedProvider === "bedrock" && (
		<Checkbox
			checked={apiConfiguration?.awsUsePromptCache || false}
			onChange={handleInputChange("awsUsePromptCache", noTransform)}>
			<div className="flex items-center gap-1">
				<span>Enable prompt caching</span>
				<i
					className="codicon codicon-info text-vscode-descriptionForeground"
					title="Enable prompt caching to improve performance and reduce costs for supported models."
					style={{ fontSize: "12px" }}
				/>
			</div>
		</Checkbox>
	)
}
```

This change would make the checkbox always visible for Bedrock, regardless of the model's `supportsPromptCache` property.

## Debugging Steps

To identify the exact cause of the bug, you can add the following debugging code to `webview-ui/src/components/settings/ApiOptions.tsx`:

```jsx
// Add this near the beginning of the ApiOptions component
console.log("API Configuration:", apiConfiguration)
console.log("Selected Provider:", selectedProvider)
console.log("Selected Model ID:", selectedModelId)
console.log("Selected Model Info:", selectedModelInfo)
console.log("Supports Prompt Cache:", selectedModelInfo?.supportsPromptCache)
console.log("Bedrock Models:", bedrockModels)
console.log("Default Bedrock Model ID:", bedrockDefaultModelId)
```

This will log the relevant information to the browser console, which can help identify why `selectedModelInfo?.supportsPromptCache` is not true.

## Implementation Plan

1. **Switch to Code Mode**: Use the `switch_mode` tool to switch to Code mode.

2. **Add Debugging Code**: Add the debugging code to `webview-ui/src/components/settings/ApiOptions.tsx` to identify the exact cause of the bug.

3. **Fix the UI Rendering**: Based on the debugging results, implement the appropriate fix:

    - If the model ID is not being correctly matched, fix the model ID matching logic.
    - If the model info is not being correctly passed, fix the data flow.
    - If the custom ARN detection is incorrect, fix the custom ARN detection logic.
    - If all else fails, implement the unconditional rendering fix.

4. **Test the Fix**: Test the fix by opening the Roo settings panel and verifying that the prompt caching checkbox appears.

5. **Verify Cache Usage**: After enabling prompt caching, verify that cache usage is being reported correctly.

## Additional Considerations

- The fix should be backward compatible with existing configurations.
- The fix should not affect other providers or settings.
- The fix should be robust against future changes to the model definitions.
- Consider adding more comprehensive error handling and logging to prevent similar issues in the future.
