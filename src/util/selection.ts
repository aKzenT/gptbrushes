import vscode, { Selection } from 'vscode'
import { StorageService } from './storage'
import { outputChannel } from './channel'

export function getSelectionRange(selection: vscode.Selection) {
  const selectionRange = new vscode.Range(
    new vscode.Position(selection.start.line, selection.start.character),
    new vscode.Position(selection.end.line, selection.end.character)
  )
  return selectionRange
}

export const SavedSelectionEvents: {
  currentSelection: vscode.Selection | undefined
  selectionChangeCallbacks: ((sel: vscode.Selection | undefined) => void)[]
  markSelectionChange: (sel: vscode.Selection | undefined) => void
  addListener: (cb: (sel: vscode.Selection | undefined) => void) => void
} = {
  currentSelection: undefined,
  selectionChangeCallbacks: [],
  markSelectionChange: (sel: vscode.Selection | undefined) => {
    SavedSelectionEvents.currentSelection = sel
    SavedSelectionEvents.selectionChangeCallbacks.forEach((cb) => cb(sel))
  },
  addListener: (cb: (sel: vscode.Selection | undefined) => void) => {
    SavedSelectionEvents.selectionChangeCallbacks.push(cb)
  },
}

async function _saveSelection(storage: StorageService): Promise<void> {
  const editor = vscode.window.activeTextEditor
  if (!editor) {
    outputChannel.appendLine('Could not get editor')
    return
  }
  outputChannel.appendLine(
    `Selection saved: ${editor.document.getText(getSelectionRange(editor.selection))}`
  )
  if (!getSelectionRange(editor.selection).isEmpty) {
    await storage.setValue('gptbrushes.current_selection', editor.selection)
    SavedSelectionEvents.markSelectionChange(editor.selection)
  } else {
    await storage.setValue('gptbrushes.current_selection', undefined)
    SavedSelectionEvents.markSelectionChange(undefined)
  }
}

function _getSavedSelection(storage: StorageService): undefined | vscode.Selection {
  const savedSelection: vscode.Selection | undefined = storage.getValue<vscode.Selection>(
    'gptbrushes.current_selection'
  )

  return savedSelection
}

async function _replaceSelection(selection: vscode.Selection, newText: string): Promise<void> {
  const editor = vscode.window.activeTextEditor
  if (!editor) {
    outputChannel.appendLine('Could not get editor')
    return
  }
  // const document = editor.document
  await editor.edit((editBuilder) => {
    editBuilder.replace(selection, newText)
  })
}

async function _insertAtCursor(selection: vscode.Selection, newText: string): Promise<void> {
  const editor = vscode.window.activeTextEditor
  if (!editor) {
    outputChannel.appendLine('Could not get editor')
    return
  }
  // const document = editor.document
  await editor.edit((editBuilder) => {
    editBuilder.insert(selection.start, newText)
  })
}

export interface SelectionHelper {
  /**
   * Saves the current selection to the storage
   * @returns A promise that resolves when the operation is complete
   * @see _saveSelection
   */
  saveSelection: (callback: (sel: vscode.Selection) => void) => ReturnType<typeof _saveSelection>
  /**
   * @returns A promise that resolves to the saved selection or null if no selection was saved
   * @see _getSavedSelection
   */
  getSavedSelection: () => ReturnType<typeof _getSavedSelection>
  replaceSelection: (selection: vscode.Selection, newText: string) => Promise<void>
  /**
   * @param newText - The text to replace with
   * @returns A promise that resolves when the operation is complete
   * @see _replaceSelection
   * @see _getSavedSelection
   */
  insertOrReplace: (selection: vscode.Selection, newText: string) => Promise<void>

  savedSelectionEvents: typeof SavedSelectionEvents
}
export function activateSelectionHelper(
  context: vscode.ExtensionContext,
  storage: StorageService
): SelectionHelper {
  context.subscriptions.push(
    vscode.commands.registerCommand('gptbrushes.saveSelection', () => {
      outputChannel.appendLine('saving selection')
      void _saveSelection(storage)
    })
  )

  return {
    saveSelection: () => _saveSelection(storage),
    getSavedSelection: () => _getSavedSelection(storage),
    replaceSelection: async (selection: vscode.Selection, newText: string) => {
      await _replaceSelection(selection, newText)
      return Promise.resolve()
    },
    insertOrReplace: async (selection: vscode.Selection, newText: string): Promise<void> => {
      if (selection.isEmpty) {
        await _insertAtCursor(selection, newText)
      } else {
        await _replaceSelection(selection, newText)
      }
      return Promise.resolve()
    },
    savedSelectionEvents: SavedSelectionEvents,
  }
}
