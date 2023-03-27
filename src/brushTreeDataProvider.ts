import * as vscode from 'vscode';

export class BrushTreeDataProvider implements vscode.TreeDataProvider<BrushItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<BrushItem | undefined> = new vscode.EventEmitter<BrushItem | undefined>();
  readonly onDidChangeTreeData: vscode.Event<BrushItem | undefined> = this._onDidChangeTreeData.event;

  constructor(private brushes: Array<any>) {}

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: BrushItem): vscode.TreeItem | Thenable<vscode.TreeItem> {
    return element;
  }

  getChildren(element?: BrushItem): vscode.ProviderResult<BrushItem[]> {
    if (element) {
      return Promise.resolve([]);
    } else {
      return Promise.resolve(this.brushes.map((brush, index) => new BrushItem(brush, index)));
    }
  }
}

class BrushItem extends vscode.TreeItem {
  constructor(brush: any, index: number) {
    super(`${brush.icon} ${brush.name}`, vscode.TreeItemCollapsibleState.None);
    this.command = {
      command: 'gptbrushes.useBrush',
      title: 'Use Brush',
      arguments: [index],
    };
  }
}
