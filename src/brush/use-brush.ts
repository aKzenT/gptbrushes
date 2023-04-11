import vscode from 'vscode'
import { ConfigBrush, askForVariablesAndReplacePrompt, getBrushes } from '../config/config'
import { outputChannel } from '../util/channel'
import { getIdFromItemSource } from './brush-tree'
import { getApiKey, requestCompletion } from '../openai-api'
import { SelectionHelper } from '../util/selection'
import { requestOptions } from '../config/config-defaults'
import { StorageService } from '../util/storage'

export function getSelectionRange(selection: vscode.Selection) {
  const selectionRange = new vscode.Range(
    new vscode.Position(selection.start.line, selection.start.character),
    new vscode.Position(selection.end.line, selection.end.character)
  )
  return selectionRange
}
export function activateUseBrush(
  storage: StorageService,
  context: vscode.ExtensionContext,
  editor: vscode.TextEditor,
  sel: SelectionHelper
) {
  context.subscriptions.push(
    vscode.commands.registerCommand('gptbrushes.useBrush', async (id: string) => {
      try {
        const originalSelection = editor.selection
        let selection = editor.selection

        const brushToUse = getBrushes(storage).find((b: ConfigBrush) => {
          const bru = b as ConfigBrush & { contextValue: 'brush' }
          bru.contextValue = 'brush'
          return getIdFromItemSource(bru) === id
        })
        if (!brushToUse) {
          outputChannel.appendLine(`Unable to find brush with id ${id}`)
          return
        }

        outputChannel.appendLine(`Using brush ${brushToUse.name}`)

        const apiKey = await getApiKey(context)
        if (!apiKey) {
          await vscode.window.showErrorMessage(
            'Unable to obtain the OpenAI API key. The extension will not function correctly.'
          )
          return
        }

        outputChannel.appendLine(`Using API key ${apiKey}`)

        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (!editor) {
          await vscode.window.showErrorMessage('Please open a text editor to use GPT-4 Brushes.')
          return
        }

        outputChannel.appendLine(`Using editor ${editor.document.fileName}`)

        const savedSelection = sel.getSavedSelection()

        if (savedSelection && !getSelectionRange(savedSelection).isEmpty) {
          selection = savedSelection
        }

        if (getSelectionRange(selection).isEmpty) {
          await vscode.window.showErrorMessage(
            `Please select some text to use GPT-4 Brushes. ${JSON.stringify(selection, null, 2)}`
          )
          return
        }

        outputChannel.appendLine(
          `Using selection ${selection.start.line}:${selection.start.character} - ${selection.end.line}:${selection.end.character}`
        )

        const selectedText = editor.document.getText(getSelectionRange(selection))

        if (!selectedText) {
          await vscode.window.showErrorMessage('Please select some text to use GPT-4 Brushes.')
          return
        }

        const originalVersion = editor.document.version

        outputChannel.appendLine(`Using selected text ${selectedText}`)

        const variables = brushToUse.variables

        const prompts = [
          { role: 'system', content: brushToUse.prompt },
          ...(brushToUse.messages ?? []),
        ] as { role: 'system' | 'assistant' | 'user'; content: string }[]

        if (!prompts[0].content) {
          prompts.shift()
          if (!prompts.some((p) => p.role === 'system' && p.content)) {
            await vscode.window.showErrorMessage(
              'Something went wrong when getting the `system` prompt.'
            )
            return
          }
        }

        if (!prompts.find((p) => p.role === 'user')) {
          prompts.push({ role: 'user', content: '{{user_code}}' })
        }

        outputChannel.appendLine(`Using prompts: ${JSON.stringify(prompts, null, 2)}`)

        for (const prompt of prompts) {
          if (['system', 'assistant', 'user'].includes(prompt.role) && prompt.content) {
            if (prompt.role === 'user') {
              prompt.content = prompt.content.replace('{{user_code}}', selectedText)
            }
          }

          const variableRes = await askForVariablesAndReplacePrompt(prompt.content, variables)
          if (!variableRes) {
            await vscode.window.showErrorMessage(
              'Something went wrong when replacing variables in the prompt.'
            )
          }
          if (variableRes) {
            prompt.content = variableRes
          }
        }

        if (!prompts.some((p) => p.role === 'user')) {
          await vscode.window.showErrorMessage(
            'Something went wrong when getting the `user` prompt.'
          )
          return
        }

        outputChannel.appendLine(`Parsed prompts: ${JSON.stringify(prompts, null, 2)}`)

        const requestOptionsToUse = { ...requestOptions, ...brushToUse.requestOptions }

        const nonBlocking = (p: Thenable<unknown>) => {
          return new Promise((r) => {
            r(undefined)
            void p.then()
          })
        }

        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: 'GPT-4 Brushes',
            cancellable: true,
          },

          async (progress, cancelToken) => {
            const voidPromise: Thenable<void> = new Promise<void>((r) => setTimeout(r, 0))

            try {
              const max_percent = 50
              const avg_time = 20
              const update_freq = 250

              const delta = (max_percent / avg_time) * (update_freq / 1000)

              let p = 0
              const fakeProgressInterval = setInterval((c) => {
                if (cancelToken.isCancellationRequested) {
                  clearInterval(fakeProgressInterval)
                  return
                } else if (p < max_percent) {
                  p += delta
                }
                //outputChannel.appendLine(`Fake progress: ${p} and ${c as unknown as number}`)
                const dots = '.'.repeat(3 - Math.floor((p * 100) % 3))
                progress.report({
                  message: 'Requesting completion' + dots,
                  increment: p < max_percent ? delta : 0,
                })
              }, 250)

              const completion = await requestCompletion(
                prompts,
                apiKey,
                cancelToken,
                requestOptionsToUse
              )

              clearInterval(fakeProgressInterval)

              progress.report({ message: 'Request completed... Applying...', increment: 10 })

              if (!completion) {
                return nonBlocking(vscode.window.showWarningMessage('No completion was returned.'))
              }

              if (editor.document.version !== originalVersion) {
                void nonBlocking(
                  vscode.window.showWarningMessage(
                    'Document changed during API call. Completion might be incorrectly applied.'
                  )
                )
              }

              outputChannel.appendLine(`Completion: ${completion}`)

              outputChannel.appendLine(
                'Original selection:' + JSON.stringify(originalSelection, null, 2)
              )
              await sel.insertOrReplace(originalSelection, completion)

              progress.report({ message: 'Brush applied.', increment: 100 })

              await new Promise<void>((r) => setTimeout(r, 1000))

              return voidPromise
            } catch (error) {
              if (cancelToken.isCancellationRequested) {
                return nonBlocking(vscode.window.showErrorMessage(`Request cancelled.`))
              } else {
                return nonBlocking(
                  vscode.window.showErrorMessage(`Brush failed (Err 1): ${error as string}`)
                )
              }
            }
          }
        )
      } catch (error: unknown) {
        return vscode.window.showErrorMessage(`Brush failed (Err 2): ${error as string}`)
      }
    })
  )
}
