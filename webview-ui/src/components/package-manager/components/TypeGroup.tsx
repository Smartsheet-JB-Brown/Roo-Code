import React from "react"
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
	const getTypeLabel = (type: string) => {
		switch (type) {
			case "mode":
				return t("package_manager:type_group.modes")
			case "mcp server":
				return t("package_manager:type_group.mcp_servers")
			case "prompt":
				return t("package_manager:type_group.prompts")
			case "package":
				return t("package_manager:type_group.packages")
			default:
				return t("package_manager:type_group.generic_type", {
					type: type.charAt(0).toUpperCase() + type.slice(1),
				})
		}
	}

	if (!items?.length) {
		return null
	}

	return (
		<div className={cn("mb-4", className)}>
			<h4 className="text-sm font-medium text-vscode-foreground mb-2">{getTypeLabel(type)}</h4>
			<ol className="list-decimal list-inside space-y-1">
				{items.map((item, index) => (
					<li
						key={`${item.path || index}`}
						className={cn(
							"text-sm pl-1",
							item.matchInfo?.matched ? "text-vscode-foreground font-medium" : "text-vscode-foreground",
						)}
						title={item.path}>
						<span className={cn("font-medium", item.matchInfo?.matched ? "text-vscode-textLink" : "")}>
							{item.name}
						</span>
						{item.description && (
							<span className="text-vscode-descriptionForeground"> - {item.description}</span>
						)}
						{item.matchInfo?.matched && (
							<span className="ml-2 text-xs bg-vscode-badge-background text-vscode-badge-foreground px-1 py-0.5 rounded">
								{t("package_manager:type_group.match")}
							</span>
						)}
					</li>
				))}
			</ol>
		</div>
	)
}
