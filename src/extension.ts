// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import axios from 'axios';

import { Configuration, OpenAIApi } from 'openai';
import { BrushTreeDataProvider } from './brushTreeDataProvider';

async function requestCompletion(prompt: string, userMessage: string, apiKey: string, cancelToken: vscode.CancellationToken) {
    // Create an Axios cancellation token
    const axiosCancelTokenSource = axios.CancelToken.source();

    // Map the VSCode cancellation token to cancel the Axios request
    cancelToken.onCancellationRequested(() => {
        axiosCancelTokenSource.cancel('Request cancelled by the user.');
    });

    const configuration = new Configuration({
        apiKey: apiKey,
    });
    const openai = new OpenAIApi(configuration);

    const completion = await openai.createChatCompletion({
        model: 'gpt-4',
        messages: [
            { role: 'system', content: prompt },
            { role: 'user', content: userMessage },
        ],
    }, { cancelToken: axiosCancelTokenSource.token });

    if (cancelToken.isCancellationRequested) {
        return Promise.reject(new Error('Request cancelled'));
    }

    return completion.data.choices[0].message?.content ?? userMessage;
}

async function replaceSelectedText(editor: vscode.TextEditor, originalSelection: vscode.Selection, newText: string): Promise<void> {
  const document = editor.document;

  await editor.edit((editBuilder) => {
    editBuilder.replace(originalSelection, newText);
  });
}

async function getApiKey(context: vscode.ExtensionContext): Promise<string | undefined> {
    const apiKey = await context.secrets.get('openaiApiKey');
    return apiKey || updateApiKey(context);
}

async function updateApiKey(context: vscode.ExtensionContext): Promise<string|undefined> {
    const input = await vscode.window.showInputBox({
      prompt: 'Please enter your new OpenAI API key:',
      ignoreFocusOut: true,
      password: true,
    });
  
    if (input) {
      await context.secrets.store('openaiApiKey', input);
      vscode.window.showInformationMessage('OpenAI API key has been updated.');
      return input;
    } else {
      vscode.window.showInformationMessage('No API key entered. The OpenAI API key has not been updated.');
    }

    return undefined;
  }
  

export function activate(context: vscode.ExtensionContext) {
    const brushes = vscode.workspace.getConfiguration('gptbrushes').get('brushes') as Array<any>;
  const brushDataProvider = new BrushTreeDataProvider(brushes);
  const treeView = vscode.window.createTreeView('gptbrushes.brushList', {
    treeDataProvider: brushDataProvider,
  });
  
  context.subscriptions.push(
    vscode.commands.registerCommand('gptbrushes.updateApiKey', async () => {
      await updateApiKey(context);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('gptbrushes.useBrush', async (index: number) => {
      const apiKey = await getApiKey(context);
      if (!apiKey) {
          vscode.window.showErrorMessage('Unable to obtain the OpenAI API key. The extension will not function correctly.');
          return;
      }

      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage('Please open a text editor to use GPT-4 Brushes.');
        return;
      }

      const originalSelection = editor.selection;
      const selectedText = editor.document.getText(originalSelection);
      const originalVersion = editor.document.version;

      let prompt = brushes[index].prompt;
      const variables = brushes[index].variables;

      if(variables)
      {
        for (const variable of variables) {
            let input = await vscode.window.showInputBox({
                prompt: variable.description,
                ignoreFocusOut: true,
            });

            if(input===undefined) {
                return;
            }

            if(input==="") {
                if(variable.defaultValue === undefined)
                {
                    return;
                }
                input = variable.defaultValue;
            }

            prompt=prompt.replace(`{{${variable.name}}}`, input);
        }
      }

      vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Window,
          title: 'GPT-4 Brushes',
          cancellable: true,
        },
        async (progress, cancelToken) => {
          try {
            progress.report({ message: 'Applying Brush...' });
            const completion = await requestCompletion(prompt, selectedText, apiKey, cancelToken);

            if (editor.document.version !== originalVersion) {
                vscode.window.showWarningMessage('Document changed during API call. Completion was not applied.');
                return;
              }
            
              if(cancelToken.isCancellationRequested) {
                    return;
              }

            replaceSelectedText(editor, originalSelection, completion);
            progress.report({ message: 'Brush applied.' });
          } catch (error) {
            if (cancelToken.isCancellationRequested) {
                vscode.window.showInformationMessage('Request cancelled.');
              } else {
            vscode.window.showErrorMessage(`Brush failed: ${error}`);
              }
          }
        }
      );
    })
  );
}

export function deactivate() {}
