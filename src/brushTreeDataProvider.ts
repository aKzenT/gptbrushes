import * as vscode from 'vscode';

export class BrushTreeDataProvider implements vscode.TreeDataProvider<BrushItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<BrushItem | undefined> = new vscode.EventEmitter<BrushItem | undefined>();
  readonly onDidChangeTreeData: vscode.Event<BrushItem | undefined> = this._onDidChangeTreeData.event;

  private brushes?: Brush[] = undefined;

  constructor() {}

  refresh(): void {
    this.brushes = undefined;
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: BrushItem): vscode.TreeItem | Thenable<vscode.TreeItem> {
    return element;
  }

  async getChildren(element?: BrushItem): Promise<BrushItem[]> {
    if (element) {
      return Promise.resolve([]);
    } else {
      const result = this.brushes ??= (await vscode.commands.executeCommand('gptbrushes.getBrushes') as Brush[]);
        return result.map(brush => new BrushItem(brush));
    }
  }
}

class BrushItem extends vscode.TreeItem {
  constructor(brush: Brush) {
    super(`${brush.icon} ${brush.name}`, vscode.TreeItemCollapsibleState.None);
    this.command = {
      command: `gptbrushes.useBrush`,
      title: 'Use Brush',
      arguments: [brush],
    };
  }
}
