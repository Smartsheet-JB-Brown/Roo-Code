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
				// Type group translations
				"type-group.mcp-servers": "MCP Servers",
				"type-group.modes": "Modes",
				"type-group.prompts": "Prompts",
				"type-group.packages": "Packages",
				"type-group.match": "Match",
				"type-group.generic-type": "{{type}}s",

				// Item card translations
				"item-card.by-author": "by {{author}}",
				"item-card.type-package": "Package",
				"item-card.type-mode": "Mode",
				"item-card.type-mcp-server": "MCP Server",
				"item-card.type-prompt": "Prompt",
				"item-card.source": "Source",
				"item-card.component-details": "Component Details",
				"item-card.filter-by-tag": "Filter by tag",
				"item-card.by": "by",
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
