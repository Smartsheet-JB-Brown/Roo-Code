import React, { useMemo } from "react"
import { cn } from "@/lib/utils"
import { useAppTranslation } from "@/i18n/TranslationContext"

interface TypeGroupProps {
	type: string
	items: Array<{
		name: string
		description?: string
		metadata?: any
		path?: string
		matchInfo?: {
			matched: boolean
			matchReason?: Record<string, boolean>
		}
	}>
	className?: string
}

export const TypeGroup: React.FC<TypeGroupProps> = ({ type, items, className }) => {
	const { t } = useAppTranslation()
	const typeLabel = useMemo(() => {
		switch (type) {
			case "mode":
				return t("package-manager:type-group.modes")
			case "mcp server":
				return t("package-manager:type-group.mcp-servers")
			case "prompt":
				return t("package-manager:type-group.prompts")
			case "package":
				return t("package-manager:type-group.packages")
			default:
				return t("package-manager:type-group.generic-type", {
					type: type.charAt(0).toUpperCase() + type.slice(1),
				})
		}
	}, [type, t])

	const containerClassName = useMemo(() => cn("mb-4", className), [className])

	// Memoize the list items
	const listItems = useMemo(() => {
		if (!items?.length) return null

		return items.map((item, index) => {
			const itemClassName = cn(
				"text-sm pl-1",
				item.matchInfo?.matched ? "text-vscode-foreground font-medium" : "text-vscode-foreground",
			)
			const nameClassName = cn("font-medium", item.matchInfo?.matched ? "text-vscode-textLink" : "")

			return (
				<li key={`${item.path || index}`} className={itemClassName} title={item.path}>
					<span className={nameClassName}>{item.name}</span>
					{item.description && (
						<span className="text-vscode-descriptionForeground"> - {item.description}</span>
					)}
					{item.matchInfo?.matched && (
						<span className="ml-2 text-xs bg-vscode-badge-background text-vscode-badge-foreground px-1 py-0.5 rounded">
							{t("package-manager:type-group.match")}
						</span>
					)}
				</li>
			)
		})
	}, [items, t])

	if (!items?.length) {
		return null
	}

	return (
		<div className={containerClassName}>
			<h4 className="text-sm font-medium text-vscode-foreground mb-2">{typeLabel}</h4>
			<ol className="list-decimal list-inside space-y-1">{listItems}</ol>
		</div>
	)
}
