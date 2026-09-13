import React, { useState, useRef, useMemo } from 'react';
import { usePlannerStore } from '../store/usePlannerStore';
import { 
  parseCsvWithProfile, 
  aggregateTransactions, 
  autoDetectProfile,
  ParsedTransaction,
  BankProfile 
} from '../core/csvParser';
import { BANK_PROFILES } from '../core/bankProfiles';
import Papa from 'papaparse';
import { UploadCloud, Check, Copy, Calendar, AlertCircle, Info, Settings2 } from 'lucide-react';
import { format, startOfMonth } from 'date-fns';

export const AnalysisTab: React.FC = () => {
  const { getBlueprintJson } = usePlannerStore();
  
  const [selectedProfileId, setSelectedProfileId] = useState<string>(BANK_PROFILES[0].id);
  const [transactions, setTransactions] = useState<ParsedTransaction[]>([]);
  const [startDate, setStartDate] = useState<string>(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [detectedLog, setDetectedLog] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [includePayments, setIncludePayments] = useState(false);
  
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedProfile = BANK_PROFILES.find(p => p.id === selectedProfileId) as BankProfile;

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processFiles(files);
    }
  };

  const processFiles = (files: FileList) => {
    const allTx: ParsedTransaction[] = [...transactions];
    const newLogs: string[] = [];
    let processed = 0;

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        
        // Auto-detect profile from headers
        const preview = Papa.parse(text, { header: true, preview: 1 });
        const headers = preview.meta.fields || [];
        const detected = autoDetectProfile(headers);
        
        const activeProfile = detected || selectedProfile;
        
        if (detected) {
          newLogs.push(`Auto-detected ${detected.name} for ${file.name}`);
        } else {
          newLogs.push(`Using fallback ${selectedProfile.name} for ${file.name}`);
        }

        const newTx = parseCsvWithProfile(text, activeProfile, { includePayments });
        allTx.push(...newTx);
        processed++;

        if (processed === files.length) {
          // Sort by date ascending
          allTx.sort((a, b) => a.date.getTime() - b.date.getTime());
          setTransactions(allTx);
          
          setDetectedLog(prev => [...prev, ...newLogs]);
        }
      };
      reader.readAsText(file);
    });
    
    // Reset input so the same files can be selected again if needed
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const { markdown: aggMarkdown, total } = useMemo(() => {
    if (transactions.length === 0) return { markdown: '', total: 0 };
    
    const start = startDate ? new Date(startDate + 'T00:00:00') : undefined;
    const end = endDate ? new Date(endDate + 'T23:59:59') : undefined;
    
    return aggregateTransactions(transactions, start, end);
  }, [transactions, startDate, endDate]);

  const handleCopyPrompt = async () => {
    try {
      const jsonStr = getBlueprintJson({ minified: true, compactIds: true });
      const prompt = `Act as an expert financial advisor. Here is my current financial blueprint (planned cashflow) and a summary of my actual spending from ${startDate || 'Start'} to ${endDate || 'End'}.

Please analyze the aggregated spending. Compare my actual spending against the allocations in my blueprint (e.g., 'Shared Bills', 'Personal Bills'). Are my blueprint allocations accurate, or do I need to calibrate them?

--- ACTUAL SPENDING SUMMARY ---
${aggMarkdown}

--- PLANNED BLUEPRINT ---
${jsonStr}`;

      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      console.error('Failed to copy', err);
    }
  };

  const clearData = () => {
    setTransactions([]);
    setStartDate(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
    setEndDate(format(new Date(), 'yyyy-MM-dd'));
    setDetectedLog([]);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300 max-w-4xl">
      <div className="bg-white rounded-xl shadow-xs border border-ink-200 overflow-hidden">
        <div className="p-6 border-b border-ink-200">
          <h2 className="text-lg font-bold text-ink-900">Spending Analysis</h2>
          <p className="text-sm text-ink-500 mt-1">
            Upload your bank CSVs to locally aggregate your spending and generate an LLM analysis prompt.
          </p>
        </div>

        <div className="p-6 space-y-6">
          <div className="space-y-4">
            <div className="w-full sm:w-64 space-y-1.5">
              <label className="text-xs font-bold text-ink-700 uppercase tracking-wide">
                Fallback Bank Profile
              </label>
              <select
                value={selectedProfileId}
                onChange={(e) => setSelectedProfileId(e.target.value)}
                className="w-full bg-ink-50 border border-ink-200 text-ink-900 text-sm rounded-lg focus:ring-brand-500 focus:border-brand-500 p-2.5"
              >
                {BANK_PROFILES.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            
            <div className="w-full sm:w-64 space-y-1.5">
              <label className="text-xs font-bold text-ink-700 uppercase tracking-wide flex items-center gap-1.5">
                <Settings2 className="w-3.5 h-3.5" />
                Parsing Options
              </label>
              <div className="w-full bg-ink-50 border border-ink-200 rounded-lg p-2.5 flex items-center gap-2">
                <input
                  type="checkbox"
                  id="includePayments"
                  checked={includePayments}
                  onChange={(e) => setIncludePayments(e.target.checked)}
                  className="w-4 h-4 text-brand-500 bg-white border-ink-300 rounded focus:ring-brand-500"
                />
                <label htmlFor="includePayments" className="text-sm text-ink-900 cursor-pointer select-none">
                  Include Payments & Refunds
                </label>
              </div>
            </div>
            
            <div className="flex-1 w-full mt-4">
              <input
                type="file"
                multiple
                accept=".csv"
                ref={fileInputRef}
                onChange={handleFileUpload}
                className="hidden"
              />
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`w-full flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-xl p-10 cursor-pointer transition-colors ${
                  isDragging 
                    ? 'bg-brand-50 border-brand-500 text-brand-700' 
                    : 'bg-ink-50 border-ink-300 text-ink-500 hover:bg-ink-100 hover:border-ink-400'
                }`}
              >
                <UploadCloud className={`w-10 h-10 ${isDragging ? 'text-brand-500' : 'text-ink-400'}`} />
                <div className="text-center">
                  <p className="text-sm font-bold text-ink-900">Click to upload or drag and drop</p>
                  <p className="text-xs mt-1 text-ink-500">Support for multiple .csv files simultaneously</p>
                </div>
              </div>
            </div>
          </div>

          {detectedLog.length > 0 && (
            <div className="flex flex-col gap-1.5 bg-brand-50 border border-brand-200 p-3 rounded-lg">
              <div className="flex items-center gap-1.5 text-brand-700 font-bold text-xs uppercase tracking-wide">
                <Info className="w-3.5 h-3.5" />
                <span>Import Log</span>
              </div>
              <ul className="text-xs text-brand-700 font-medium space-y-0.5 list-disc pl-5">
                {detectedLog.map((log, i) => (
                  <li key={i}>{log}</li>
                ))}
              </ul>
            </div>
          )}

          {transactions.length > 0 && (
            <div className="bg-ink-50 border border-ink-200 rounded-lg p-4 space-y-4">
              <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-ink-400" />
                    <input 
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="text-sm bg-white border border-ink-200 rounded px-2 py-1 focus:ring-1 focus:ring-brand-500 outline-none"
                    />
                    <span className="text-ink-400">to</span>
                    <input 
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="text-sm bg-white border border-ink-200 rounded px-2 py-1 focus:ring-1 focus:ring-brand-500 outline-none"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm font-semibold text-ink-700">
                    {transactions.length} rows parsed
                  </span>
                  <button 
                    onClick={clearData}
                    className="text-xs text-red-600 font-semibold hover:underline"
                  >
                    Clear Data
                  </button>
                </div>
              </div>

              <div className="bg-white border border-ink-200 rounded-md p-4 overflow-auto max-h-96">
                <pre className="text-xs text-ink-700 font-mono whitespace-pre-wrap">
                  {aggMarkdown}
                </pre>
              </div>

              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-2 text-amber-600 bg-amber-50 px-3 py-1.5 rounded text-xs font-semibold border border-amber-200">
                  <AlertCircle className="w-4 h-4" />
                  <span>Data remains completely local. No servers involved.</span>
                </div>
                
                <button
                  onClick={handleCopyPrompt}
                  className={`inline-flex items-center gap-2 px-5 py-2.5 text-sm font-bold rounded-lg transition-all shadow-md ${
                    copied
                      ? 'bg-emerald-600 text-white shadow-emerald-200'
                      : 'bg-brand-500 hover:bg-brand-600 text-white shadow-brand-200'
                  }`}
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4 animate-bounce" />
                      <span>Copied Analysis Prompt!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>Copy Prompt + Blueprint</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
