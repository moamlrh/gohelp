import * as vscode from "vscode";
import GoMoveToNewFileActionProvider from "./MoveToNewFile";

export function activate(context: vscode.ExtensionContext) {
  console.log("GoHelper ext is now active!");

  const disposable = vscode.languages.registerCodeActionsProvider(
    { scheme: "file", language: "go" },
    new GoMoveToNewFileActionProvider(),
    {
      providedCodeActionKinds: [vscode.CodeActionKind.RefactorMove],
    }
  );

  context.subscriptions.push(disposable);
}

export function deactivate() {}
