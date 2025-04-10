import React from "react";
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react";

/**
 * A button that opens the package manager view when clicked
 */
const PackageManagerButton: React.FC = () => {
  return (
    <VSCodeButton
      appearance="icon"
      title="Package Manager"
      onClick={() => {
        window.postMessage({ type: "action", action: "packageManagerButtonClicked" }, "*");
      }}
    >
      <span className="codicon codicon-extensions"></span>
    </VSCodeButton>
  );
};

export default PackageManagerButton;