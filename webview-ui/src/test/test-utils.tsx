import React from "react"
import { render } from "@testing-library/react"
import { TranslationProvider } from "@/i18n/TranslationContext"
import { ExtensionStateContext } from "@/context/ExtensionStateContext"
import i18next from "i18next"
import { initReactI18next } from "react-i18next"

// Mock vscode API
;(global as any).acquireVsCodeApi = () => ({
	postMessage: jest.fn(),
})

// Initialize i18next for tests
i18next.use(initReactI18next).init({
	lng: "en",
	fallbackLng: "en",
	interpolation: {
		escapeValue: false,
	},
	resources: {
		en: {
			"package-manager": {
				filters: {
					type: {
						package: "Package",
						mode: "Mode",
						"mcp server": "MCP Server",
						prompt: "Prompt",
					},
					tags: {
						clickToFilter: "Click tags to filter items",
					},
				},
				items: {
					card: {
						by: "by {{author}}",
						viewSource: "View",
						externalComponents: "Contains {{count}} external component",
						externalComponents_plural: "Contains {{count}} external components",
					},
				},
				"type-group": {
					"mcp-servers": "MCP Servers",
					modes: "Modes",
					prompts: "Prompts",
					packages: "Packages",
					match: "Match",
					"generic-type": "{{type}}s",
				},
			},
		},
	},
})

// Minimal mock state
const mockExtensionState = {
	language: "en",
	packageManagerSources: [{ url: "test-url", enabled: true }],
	setPackageManagerSources: jest.fn(),
	experiments: {
		search_and_replace: false,
		insert_content: false,
		powerSteering: false,
	},
}

export const renderWithProviders = (ui: React.ReactElement) => {
	return render(
		<ExtensionStateContext.Provider value={mockExtensionState as any}>
			<TranslationProvider>{ui}</TranslationProvider>
		</ExtensionStateContext.Provider>,
	)
}
