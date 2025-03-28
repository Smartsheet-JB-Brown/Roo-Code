# Fixing the Bedrock Prompt Cache Issue

## Problem Summary

The "Enable prompt caching" checkbox is not appearing in the Roo settings panel for the Bedrock provider, even though you're using a model (`anthropic.claude-3-7-sonnet-20250219-v1:0`) that should support prompt caching according to the model definitions in `src/shared/api.ts`.

## Root Cause Analysis

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

Since the checkbox isn't appearing, something is preventing `selectedModelInfo?.supportsPromptCache` from being true, even though the model definition has `supportsPromptCache: true`.

## Solution Options

### Option 1: Add the awsUsePromptCache setting manually

Since the UI checkbox isn't appearing, we can add the setting directly to your configuration:

1. Open the Command Palette (Cmd+Shift+P or Ctrl+Shift+P)
2. Type "Roo: Open Settings" and select it
3. Click on "Edit in settings.json"
4. Add the following line to your settings.json file:

```json
"roo.awsUsePromptCache": true
```

5. Save the file and restart VS Code

### Option 2: Fix the UI rendering (requires code changes)

Modify the `ApiOptions.tsx` file to always show the prompt caching checkbox for Bedrock:

1. Open `webview-ui/src/components/settings/ApiOptions.tsx`
2. Find the section for Bedrock provider (around line 530)
3. Replace the conditional rendering:

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

With an unconditional rendering:

```jsx
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
```

### Option 3: Add debugging to identify the issue

Add logging to help identify why `selectedModelInfo?.supportsPromptCache` is not true:

1. Open `webview-ui/src/components/settings/ApiOptions.tsx`
2. Add console logging before the conditional rendering:

```jsx
console.log("Selected model info:", selectedModelInfo)
console.log("Supports prompt cache:", selectedModelInfo?.supportsPromptCache)
console.log("Model ID:", selectedModelId)
```

3. Check the browser console for the logged values

## Recommended Approach

I recommend trying Option 1 first, as it's the simplest solution and doesn't require code changes. If that doesn't work, you can try Option 3 to gather more information about the issue, and then proceed with Option 2 if necessary.

## Additional Investigation

If you want to further investigate the issue, you can:

1. Check if the model ID in the UI matches the model ID being used by the Bedrock provider
2. Add logging to the `normalizeApiConfiguration` function to see how it's determining the selected model info
3. Check if there's a mismatch between the model definitions in `src/shared/api.ts` and the actual model being used

## Long-term Fix

For a long-term fix, you might want to:

1. Update the `normalizeApiConfiguration` function to correctly handle the model info
2. Add better error handling and logging to the Bedrock provider
3. Consider making the prompt caching checkbox always visible for Bedrock, with a note that it only works for supported models
