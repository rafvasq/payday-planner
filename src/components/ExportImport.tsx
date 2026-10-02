import React, { useState } from 'react';
import { usePlannerStore } from '../store/usePlannerStore';
import { Download, Upload, Copy, Check, FileSpreadsheet, RefreshCw } from 'lucide-react';

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';

export const ExportImport: React.FC = () => {
  const { accounts, events, getBlueprintJson, importBlueprintJson, resetToDefaults } =
    usePlannerStore();

  const [pasteInput, setPasteInput] = useState('');
  const [copied, setCopied] = useState(false);
  const [minified, setMinified] = useState(true);
  const [compactIds, setCompactIds] = useState(true);
  const [importMessage, setImportMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const blueprintJson = getBlueprintJson({ minified, compactIds });

  const handleCopy = async () => {
    await navigator.clipboard.writeText(blueprintJson);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadJson = () => {
    const blob = new Blob([blueprintJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = minified ? 'payday_blueprint.min.json' : 'payday_blueprint.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (rawStr: string) => {
    try {
      importBlueprintJson(rawStr);
      setImportMessage({ type: 'success', text: 'Blueprint imported successfully!' });
      setPasteInput('');
    } catch (err: any) {
      setImportMessage({ type: 'error', text: `Import failed: ${err.message}` });
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      if (text) handleImport(text);
    };
    reader.readAsText(file);
  };

  const downloadCsv = (filename: string, rows: any[]) => {
    if (rows.length === 0) return;
    const headers = Object.keys(rows[0]).join(',');
    const csvContent =
      headers +
      '\n' +
      rows
        .map((r) =>
          Object.values(r)
            .map((v) => `"${v ?? ''}"`)
            .join(',')
        )
        .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Export Section */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div className="space-y-1.5">
            <CardTitle>Export Blueprint JSON</CardTitle>
            <CardDescription>
              Sparse, token-optimized JSON — paste directly into LLM context
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopy}
              className={copied ? 'text-emerald-600 border-emerald-200 bg-emerald-50' : ''}
            >
              {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
              {copied ? 'Copied!' : 'Copy JSON'}
            </Button>
            <Button size="sm" onClick={handleDownloadJson}>
              <Download className="mr-2 h-4 w-4" />
              Download JSON
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-6">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="minified"
                checked={minified}
                onCheckedChange={(c) => setMinified(!!c)}
              />
              <label
                htmlFor="minified"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Minified Single-Line
              </label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="compact"
                checked={compactIds}
                onCheckedChange={(c) => setCompactIds(!!c)}
              />
              <label
                htmlFor="compact"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Compress Long UUIDs
              </label>
            </div>
          </div>
          <textarea
            readOnly
            value={blueprintJson}
            rows={minified ? 5 : 10}
            className="w-full p-3 font-mono text-xs text-foreground bg-muted border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </CardContent>
      </Card>

      {/* Import Section */}
      <Card>
        <CardHeader>
          <CardTitle>Import Blueprint JSON</CardTitle>
          <CardDescription>
            Upload a blueprint.json file or paste raw JSON to restore your accounts & events
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {importMessage && (
            <div
              className={`p-3 rounded-md text-sm font-medium ${
                importMessage.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800'
                  : 'bg-destructive/10 text-destructive border border-destructive/20'
              }`}
            >
              {importMessage.text}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex flex-col items-center justify-center space-y-4 p-6 border-2 border-dashed border-border rounded-lg bg-muted/50 hover:bg-muted transition-colors">
              <Upload className="h-8 w-8 text-muted-foreground" />
              <div className="text-sm font-medium text-center">
                Upload blueprint.json file
              </div>
              <Input
                type="file"
                accept=".json"
                onChange={handleFileUpload}
                className="max-w-[200px] cursor-pointer"
              />
            </div>

            <div className="flex flex-col space-y-3">
              <textarea
                placeholder="Or paste blueprint JSON string here..."
                value={pasteInput}
                onChange={(e) => setPasteInput(e.target.value)}
                rows={5}
                className="w-full p-3 font-mono text-xs bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              />
              <Button
                variant="secondary"
                disabled={!pasteInput.trim()}
                onClick={() => handleImport(pasteInput)}
                className="w-full"
              >
                Import Pasted JSON
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* CSV Exports & Reset */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div className="space-y-1.5">
            <CardTitle>CSV Downloads & Reset</CardTitle>
            <CardDescription>
              Export spreadsheet tables or reset state to default template
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => downloadCsv('accounts.csv', accounts)}
            >
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              accounts.csv
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => downloadCsv('events.csv', events)}
            >
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              events.csv
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                if (confirm('Reset all members, accounts, and events to default template?')) {
                  resetToDefaults();
                }
              }}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Reset Defaults
            </Button>
          </div>
        </CardHeader>
      </Card>
    </div>
  );
};
