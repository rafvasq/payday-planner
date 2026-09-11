import React, { useState } from 'react';
import { usePlannerStore } from '../store/usePlannerStore';
import { Download, Upload, Copy, Check, FileSpreadsheet, RefreshCw } from 'lucide-react';

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
    <div className="space-y-6">
      {/* Export Section */}
      <div className="bg-white border border-ink-200 rounded-xl p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-ink-900">Export Blueprint JSON</h2>
            <p className="text-xs text-ink-400">
              Sparse, token-optimized JSON — paste directly into Gemini context
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-brand-600 bg-brand-50 hover:bg-brand-100 border border-brand-200 rounded-lg transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied to Clipboard!' : 'Copy JSON'}</span>
            </button>

            <button
              onClick={handleDownloadJson}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-brand-500 hover:bg-brand-600 rounded-lg transition-colors shadow-xs"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download JSON</span>
            </button>
          </div>
        </div>

        {/* Format Options */}
        <div className="flex items-center gap-4 pt-1 text-xs">
          <label className="flex items-center gap-1.5 cursor-pointer font-semibold text-ink-700 select-none">
            <input
              type="checkbox"
              checked={minified}
              onChange={(e) => setMinified(e.target.checked)}
              className="rounded text-brand-500 focus:ring-brand-500"
            />
            <span>Minified Single-Line (Save ~25% tokens)</span>
          </label>

          <label className="flex items-center gap-1.5 cursor-pointer font-semibold text-ink-700 select-none">
            <input
              type="checkbox"
              checked={compactIds}
              onChange={(e) => setCompactIds(e.target.checked)}
              className="rounded text-brand-500 focus:ring-brand-500"
            />
            <span>Compress Long UUIDs (Save ~30 chars/item)</span>
          </label>
        </div>

        <textarea
          readOnly
          value={blueprintJson}
          rows={minified ? 5 : 10}
          className="w-full p-3 font-mono text-xs text-ink-800 bg-ink-100/50 border border-ink-200 rounded-lg focus:outline-none"
        />
      </div>

      {/* Import Section */}
      <div className="bg-white border border-ink-200 rounded-xl p-5 shadow-xs space-y-4">
        <div>
          <h2 className="text-base font-bold text-ink-900">Import Blueprint JSON</h2>
          <p className="text-xs text-ink-400">
            Upload a blueprint.json file or paste raw JSON to restore your accounts & events
          </p>
        </div>

        {importMessage && (
          <div
            className={`p-3 rounded-lg text-xs font-semibold ${
              importMessage.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : 'bg-rose-50 text-rose-800 border border-rose-200'
            }`}
          >
            {importMessage.text}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-4 border-2 border-dashed border-ink-200 rounded-xl text-center bg-ink-100/20 hover:bg-ink-100/50 transition-colors flex flex-col items-center justify-center space-y-2">
            <Upload className="w-6 h-6 text-brand-500" />
            <span className="text-xs font-semibold text-ink-700">
              Upload blueprint.json file
            </span>
            <input
              type="file"
              accept=".json"
              onChange={handleFileUpload}
              className="text-xs text-ink-400 file:mr-2 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100"
            />
          </div>

          <div className="space-y-2">
            <textarea
              placeholder="Or paste blueprint JSON string here..."
              value={pasteInput}
              onChange={(e) => setPasteInput(e.target.value)}
              rows={4}
              className="w-full p-2.5 text-xs font-mono bg-white border border-ink-200 rounded-lg focus:ring-2 focus:ring-brand-500"
            />
            <button
              onClick={() => handleImport(pasteInput)}
              disabled={!pasteInput.trim()}
              className="w-full py-2 text-xs font-bold text-white bg-ink-900 hover:bg-ink-800 disabled:opacity-50 rounded-lg transition-colors"
            >
              Import Pasted JSON
            </button>
          </div>
        </div>
      </div>

      {/* CSV Exports & Reset */}
      <div className="bg-white border border-ink-200 rounded-xl p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-bold text-ink-900">CSV Downloads & Reset</h3>
          <p className="text-xs text-ink-400">Export spreadsheet tables or reset state to default template</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => downloadCsv('accounts.csv', accounts)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-ink-700 bg-ink-100 hover:bg-ink-200 rounded-lg transition-colors"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>accounts.csv</span>
          </button>

          <button
            onClick={() => downloadCsv('events.csv', events)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-ink-700 bg-ink-100 hover:bg-ink-200 rounded-lg transition-colors"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>events.csv</span>
          </button>

          <button
            onClick={() => {
              if (confirm('Reset all members, accounts, and events to default template?')) {
                resetToDefaults();
              }
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Reset Defaults</span>
          </button>
        </div>
      </div>
    </div>
  );
};
