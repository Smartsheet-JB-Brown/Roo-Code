import { useState, useEffect } from "react"
import { PackageManagerViewStateManager, ViewState } from "./PackageManagerViewStateManager"

export function useStateManager() {
	const [manager] = useState(() => new PackageManagerViewStateManager())
	const [state, setState] = useState(() => manager.getState())

	useEffect(() => {
		const handleStateChange = (newState: ViewState) => {
			setState((prevState) => {
				// Only update if something actually changed
				if (JSON.stringify(prevState) === JSON.stringify(newState)) {
					return prevState
				}
				return newState
			})
		}

		const handleMessage = (event: MessageEvent) => {
			manager.handleMessage(event.data)
		}

		window.addEventListener("message", handleMessage)
		const unsubscribe = manager.onStateChange(handleStateChange)

		return () => {
			window.removeEventListener("message", handleMessage)
			unsubscribe()
			manager.cleanup()
		}
	}, [manager]) // Remove state from dependencies

	return [state, manager] as const
}
