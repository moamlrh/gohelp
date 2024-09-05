import path from "path";
import * as vscode from "vscode";
import Utils from "./utils";

export default class GoMoveToNewFileActionProvider
  implements vscode.CodeActionProvider
{
  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range
  ): vscode.CodeAction[] {
    const lineText = document.lineAt(range.start.line).text;
    const typeOrMethodRegex = /^(type|func)\s+(\w+)/;
    const match = lineText.match(typeOrMethodRegex);

    if (match) {
      const action = new vscode.CodeAction(
        "Move to new file",
        vscode.CodeActionKind.RefactorMove
      );
      action.command = {
        title: "Move to new file",
        command: "gohelp.moveToNewFile",
        arguments: [document, range, match[2]],
      };
      return [action];
    }

    return [];
  }
}

vscode.commands.registerCommand(
  "gohelp.moveToNewFile",
  async (document: vscode.TextDocument, range: vscode.Range, name: string) => {
    const originalDir = path.dirname(document.uri.fsPath);
    const originalPackageName = await Utils.getPackageName(document);
    const newFilePath = await Utils.promptForNewFilePath(document, name);
    const newFileDir = newFilePath ? path.dirname(newFilePath) : "";

    if (newFilePath) {
      let newPackageName =
        originalDir === newFileDir
          ? originalPackageName
          : path.basename(path.dirname(newFilePath));
      const content = await Utils.extractContent(
        document,
        range.start.line,
        name
      );
      if (!content) {
        vscode.window.showErrorMessage(
          "Failed to extract content. Please try again."
        );
        return;
      }
      const updatedContent = Utils.updatePackageAndImports(
        content,
        originalPackageName,
        newPackageName
      );
      await Utils.createNewFileWithContent(
        newFilePath,
        newPackageName,
        updatedContent
      );
      await Utils.removeContentFromOriginalFile(document, content);
      await Utils.updateImportsInOriginalFile(document, name, newPackageName);
      await vscode.workspace
        .openTextDocument(newFilePath)
        .then((doc) => vscode.window.showTextDocument(doc));
    }
  }
);
