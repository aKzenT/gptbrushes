// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import axios from 'axios';

import { Configuration, OpenAIApi } from 'openai';
import { BrushTreeDataProvider } from './brushTreeDataProvider';

async function requestCompletion(prompt: string, userMessage: string, apiKey: string, cancelToken: vscode.CancellationToken) {
  // Create an Axios cancellation token
  // eslint-disable-next-line import/no-named-as-default-member
  const axiosCancelTokenSource = axios.CancelToken.source();

  // Map the VSCode cancellation token to cancel the Axios request
  cancelToken.onCancellationRequested(() => {
    axiosCancelTokenSource.cancel('Request cancelled by the user.');
  });

  const basePath = vscode.workspace.getConfiguration('gptbrushes').get<string>('openaiBasePath');
  const configuration = new Configuration({
    apiKey: apiKey,
    basePath,
  });
  const openai = new OpenAIApi(configuration);

  const completion = await openai.createChatCompletion(
    {
      model: 'gpt-4',
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: userMessage },
      ],
    },
    { cancelToken: axiosCancelTokenSource.token }
  );

  if (cancelToken.isCancellationRequested) {
    return Promise.reject(new Error('Request cancelled'));
  }

  return completion.data.choices[0].message?.content ?? userMessage;
}

async function getApiKey(context: vscode.ExtensionContext): Promise<string | undefined> {
  const apiKey = await context.secrets.get('openaiApiKey');
  return apiKey ?? updateApiKey(context);
}

async function updateApiKey(context: vscode.ExtensionContext): Promise<string | undefined> {
  const input = await vscode.window.showInputBox({
    prompt: 'Please enter your new OpenAI API key:',
    ignoreFocusOut: true,
    password: true,
  });

  if (input) {
    await context.secrets.store('openaiApiKey', input);
    void vscode.window.showInformationMessage('OpenAI API key has been updated.');
    return input;
  } else {
    void vscode.window.showInformationMessage('No API key entered. The OpenAI API key has not been updated.');
  }

  return undefined;
}

export function activate(context: vscode.ExtensionContext) {
  const brushDataProvider = new BrushTreeDataProvider();
  vscode.window.createTreeView('gptbrushes.brushList', {
    treeDataProvider: brushDataProvider,
  });

  context.subscriptions.push(
    vscode.commands.registerCommand('gptbrushes.getBrushes', async () => {
      const brushes = vscode.workspace.getConfiguration('gptbrushes').get<Partial<Brush>[] | undefined>('brushes') ?? [];
      brushes.forEach((brush) => (brush.type ??= 'gpt-4'));
      const fileBrushes = await vscode.workspace.findFiles('.vscode/codebrushes/*.js');
      for (const fileBrush of fileBrushes) {
        const filenameWithoutExtension = fileBrush.path.substring(fileBrush.path.lastIndexOf('/') + 1, fileBrush.path.lastIndexOf('.'));

        const content = await vscode.workspace.fs.readFile(fileBrush);
        const brush = {
          name: filenameWithoutExtension,
          type: 'javascript',
          icon: '⏩',
          prompt: content.toString(),
        };
        brushes.push(brush);
      }

      return brushes;
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('gptbrushes.updateApiKey', async () => {
      await updateApiKey(context);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('gptbrushes.providers.gpt-4.apply', async (invocationData: BrushInvocation) => {
      const apiKey = await getApiKey(context);
      if (!apiKey) {
        void vscode.window.showErrorMessage('Unable to obtain the OpenAI API key. The extension will not function correctly.');
        return;
      }

      const completion = await requestCompletion(invocationData.brush.prompt, invocationData.input, apiKey, invocationData.cancelToken);

      return completion;
    })
  );

  vscode.commands.registerCommand('gptbrushes.providers.javascript.apply', async (invocationData: BrushInvocation) => {
    const func = eval(invocationData.brush.prompt) as (s: string) => Promise<string>;
    const completion = await func(invocationData.input);

    return completion;
  });

  vscode.commands.registerCommand('gptbrushes.useBrush', async (brush: Brush) => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      void vscode.window.showErrorMessage('Please open a text editor to use Code Brushes.');
      return;
    }

    const originalSelection = editor.selection;
    const selectedText = editor.document.getText(originalSelection);
    const originalVersion = editor.document.version;

    let prompt = brush.prompt;
    const variables = brush.variables;

    if (variables) {
      for (const variable of variables) {
        let input = await vscode.window.showInputBox({
          prompt: variable.description,
          ignoreFocusOut: true,
        });

        if (input === undefined) {
          return;
        }

        if (input === '') {
          if (variable.defaultValue === undefined) {
            return;
          }
          input = variable.defaultValue;
        }

        prompt = prompt.replace(`{{${variable.name}}}`, input);
      }
    }

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Window,
        title: 'Code Brushes',
        cancellable: true,
      },
      async (progress, cancelToken) => {
        try {
          progress.report({ message: 'Applying Brush...' });

          const completion = await vscode.commands.executeCommand<string | undefined>('gptbrushes.providers.' + brush.type + '.apply', new BrushInvocation(brush, selectedText, cancelToken, progress));

          if (editor.document.version !== originalVersion) {
            void vscode.window.showWarningMessage('Document changed during API call. Completion was not applied.');
            return;
          }

          if (cancelToken.isCancellationRequested) {
            return;
          }

          if (completion === undefined) {
            throw new Error('No substitution was returned.');
          }

          await editor.edit((editBuilder) => editBuilder.replace(originalSelection, completion));
          progress.report({ message: 'Brush applied.' });
        } catch (error) {
          if (cancelToken.isCancellationRequested) {
            void vscode.window.showInformationMessage('Request cancelled.');
          } else {
            void vscode.window.showErrorMessage(`Brush failed: ${error instanceof Error ? error.message : JSON.stringify(error)}`);
          }
        }
      }
    );
  });
}

class BrushInvocation {
  constructor(public brush: Brush, public input: string, public cancelToken: vscode.CancellationToken, public progress: vscode.Progress<{ message?: string; increment?: number }>) {}
}

export function deactivate() {
  // Intentionally empty
}
