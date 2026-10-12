import React, { useState, useRef, useMemo, useEffect } from 'react';
import { usePlannerStore } from '../store/usePlannerStore';
import { aggregateTransactions, autoDetectProfile, categorizeAndCalculateVariance } from '../core/csvParser';
import Papa from 'papaparse';
import { api, AppConfig, ProviderModels } from '../lib/apiClient';
import { generateLedgerContext } from '../core/ledger';
import { format, startOfMonth } from 'date-fns';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { 
  UploadCloud, 
  Loader2,
  Calendar,
  Copy,
  Check,
  Info,
  AlertCircle,
  Cpu,
  Bot,
  FileText,
  X
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { ModelPopover } from './ModelPopover';

export const AnalysisTab: React.FC = () => {
  const { 
    getBlueprintJson,
    accounts,
    events,
    setRecentSpendingSummary,
    parsedTransactions,
    setParsedTransactions,
    analysisLogs,
    setAnalysisLogs,
    setActiveTab,
    uploadedFiles,
    setUploadedFiles,
    removeUploadedFile,
    analysisStartDate,
    setAnalysisStartDate,
    analysisEndDate,
    setAnalysisEndDate
  } = usePlannerStore();
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [copied, setCopied] = useState(false);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);
  const [queuedFiles, setQueuedFiles] = useState<File[]>([]);
  const [unmappedOverrides, setUnmappedOverrides] = useState<Record<string, string>>({});

  const [availableModels, setAvailableModels] = useState<ProviderModels[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('');

  useEffect(() => {
    Promise.all([api.getProvider(), api.getModels()])
      .then(([config, models]) => {
        setAvailableModels(models);
        setSelectedModel(config.extraction_model);
      })
      .catch(console.error);
  }, []);

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
      setQueuedFiles(prev => [...prev, ...Array.from(e.dataTransfer.files!)]);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setQueuedFiles(prev => [...prev, ...Array.from(e.target.files!)]);
    }
  };

  const runExtraction = async () => {
    setIsProcessing(true);
    setAnalysisLogs([]);
    const allTx = [...parsedTransactions];
    const newLogs: string[] = [];
    const newFiles = [...uploadedFiles];
    
    // Step 1: Pre-LLM Rough Trim
    const startObj = analysisStartDate ? new Date(analysisStartDate + 'T00:00:00') : undefined;
    const endObj = analysisEndDate ? new Date(analysisEndDate + 'T23:59:59') : undefined;
    
    for (const file of queuedFiles) {
      if (!file.name.endsWith('.csv')) {
        newLogs.push(`❌ Skipped ${file.name} (not a CSV)`);
        continue;
      }
      
      const fileId = crypto.randomUUID();
      try {
        const text = await file.text();
        const parsed = Papa.parse(text, { header: true, preview: 1 });
        const headers = parsed.meta.fields || [];
        const detectedProfile = autoDetectProfile(headers);
        const inferredCardName = detectedProfile ? detectedProfile.name : file.name.replace('.csv', '');
        
        if (detectedProfile) {
          newLogs.push(`ℹ️ Auto-detected ${detectedProfile.name} headers.`);
        }
        
        // Very rough string match pre-trim could go here, but since Papaparse has already loaded
        // the text, we'll just send the raw text if we don't have a robust date sniffer.
        // For the sake of safety in this prototype, we'll let Mellea do the exact parsing and 
        // rely on the Post-LLM filter for exact bounds, but log that we bounded it.
        newLogs.push(`🚀 Sending ${file.name} to AI Extraction Engine...`);
        
        const response = await api.parseCsv(file, selectedModel);
        
        const count = response.transactions?.length || 0;
        newLogs.push(`✅ Parsed ${count} transactions from ${file.name}`);
        
        let minDate: Date | undefined;
        let maxDate: Date | undefined;

        if (response.transactions) {
          response.transactions.forEach((tx: any) => {
            const date = new Date(tx.date);
            // Post-LLM Precision Filter
            if (startObj && date < startObj) return;
            if (endObj && date > endObj) return;

            if (!minDate || date < minDate) minDate = date;
            if (!maxDate || date > maxDate) maxDate = date;

            allTx.push({
              ...tx,
              card: tx.card || inferredCardName,
              id: tx.id || crypto.randomUUID(),
              fileId,
              date // ensure it's a date object
            });
          });
        }
        
        if (count > 0) {
          newFiles.push({
            id: fileId,
            name: file.name,
            count,
            startDate: minDate,
            endDate: maxDate
          });
        }

        if (response.warning) {
          if (response.warning === 'chunk_failure') {
            newLogs.push(`⚠️ WARNING: Backend reported a chunking or math mismatch issue for ${file.name}. Please review extracted totals.`);
          } else {
            newLogs.push(`⚠️ ${response.warning}`);
          }
        }
      } catch (err: any) {
        newLogs.push(`❌ Failed to parse ${file.name}: ${err.message}`);
      }
    }
    
    // Sort transactions by date
    allTx.sort((a, b) => a.date.getTime() - b.date.getTime());
    setParsedTransactions(allTx);
    setUploadedFiles(newFiles);
    setAnalysisLogs([...analysisLogs, ...newLogs]);
    setIsProcessing(false);
    setQueuedFiles([]);
    setWizardStep(2);
    
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const varianceReport = useMemo(() => {
    if (parsedTransactions.length === 0) return null;
    const start = analysisStartDate ? new Date(analysisStartDate + 'T00:00:00') : undefined;
    const end = analysisEndDate ? new Date(analysisEndDate + 'T23:59:59') : undefined;
    
    return categorizeAndCalculateVariance(
      parsedTransactions, 
      events, 
      start, 
      end,
      unmappedOverrides
    );
  }, [parsedTransactions, analysisStartDate, analysisEndDate, events, unmappedOverrides]);

  useEffect(() => {
    if (varianceReport) {
      setRecentSpendingSummary(JSON.stringify(varianceReport, null, 2));
    } else {
      setRecentSpendingSummary(null);
    }
  }, [varianceReport, setRecentSpendingSummary]);

  const handleCopyPrompt = async () => {
    try {
      const jsonStr = getBlueprintJson({ minified: true, compactIds: true });
      const prompt = `Act as an expert financial advisor. Here is my current financial blueprint (planned cashflow) and a summary of my actual spending from ${analysisStartDate || 'Start'} to ${analysisEndDate || 'End'}.

Please analyze the aggregated spending. Compare my actual spending against the allocations in my blueprint (e.g., 'Shared Bills', 'Personal Bills'). Are my blueprint allocations accurate, or do I need to calibrate them?

--- ACTUAL SPENDING VARIANCE ---
${JSON.stringify(varianceReport, null, 2)}

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
    setParsedTransactions([]);
    setUploadedFiles([]);
    setAnalysisStartDate(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
    setAnalysisEndDate(format(new Date(), 'yyyy-MM-dd'));
    setAnalysisLogs([]);
    setQueuedFiles([]);
    setUnmappedOverrides({});
    setWizardStep(1);
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <Card className="border border-border/80 shadow-none">
        <CardHeader className="p-5 pb-3 border-b border-border/70">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base font-bold tracking-tight">Spending Analysis & CSV Ingestion</CardTitle>
              <CardDescription className="text-xs">
                Upload raw bank export CSVs. Local or cloud AI normalizes transactions into verified spending categories.
              </CardDescription>
            </div>
            <div className="flex items-center gap-1.5">
              {[1, 2, 3].map(step => (
                <div key={step} className={cn(
                  "size-6 rounded-full flex items-center justify-center text-[10px] font-mono font-bold border transition-colors",
                  wizardStep === step ? "border-signal bg-signal text-signal-foreground shadow-sm" : "border-border/80 bg-muted/30 text-muted-foreground"
                )}>
                  {step}
                </div>
              ))}
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-5 space-y-5">
          {wizardStep === 1 && (
            <div className="space-y-5 animate-in fade-in slide-in-from-bottom-1">
              <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 bg-muted/20 p-3.5 rounded-lg border border-border/80">
                <div className="flex items-center gap-4">
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] font-mono font-bold text-muted-foreground uppercase tracking-wider">Analysis Target Window</span>
                    <div className="flex items-center gap-2">
                      <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                      <Input 
                        type="date"
                        value={analysisStartDate}
                        onChange={(e) => setAnalysisStartDate(e.target.value)}
                        className="h-7 w-auto text-xs font-mono bg-background"
                      />
                      <span className="text-muted-foreground text-xs font-mono">to</span>
                      <Input 
                        type="date"
                        value={analysisEndDate}
                        onChange={(e) => setAnalysisEndDate(e.target.value)}
                        className="h-7 w-auto text-xs font-mono bg-background"
                      />
                    </div>
                  </div>
                </div>
                {availableModels.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] font-mono font-bold text-muted-foreground uppercase tracking-wider">Extraction Engine</span>
                    <ModelPopover 
                      selectedModel={selectedModel} 
                      onSelectModel={setSelectedModel} 
                      availableModels={availableModels} 
                      className="w-full sm:w-[220px]"
                    />
                  </div>
                )}
              </div>

              <div className="w-full flex flex-col items-center">
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
                  onClick={() => !isProcessing && fileInputRef.current?.click()}
                  className={cn(
                    "w-full h-full min-h-[130px] flex flex-col items-center justify-center gap-2.5 border border-dashed rounded-lg p-8 transition-all cursor-pointer",
                    isDragging && !isProcessing
                      ? "bg-signal/10 border-signal text-signal" 
                      : "bg-muted/15 border-border/80 text-muted-foreground hover:bg-muted/30 hover:border-signal/50"
                  )}
                >
                  <UploadCloud className={cn("w-8 h-8", isDragging ? "text-signal" : "text-muted-foreground/80")} />
                  <div className="text-center">
                    <p className="text-xs font-semibold text-foreground">
                      Click to upload or drag bank CSV files here
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5 font-mono">Any institution. Auto-categorized by AI engine.</p>
                  </div>
                </div>
              </div>

              {queuedFiles.length > 0 && (
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Pending Files</span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {queuedFiles.map((f, i) => (
                      <div key={i} className="flex items-center justify-between p-2 border border-border rounded-md bg-muted/20">
                        <div className="flex items-center gap-2 overflow-hidden">
                          <FileText className="w-4 h-4 text-primary shrink-0" />
                          <span className="text-sm font-medium truncate">{f.name}</span>
                        </div>
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive shrink-0" onClick={() => setQueuedFiles(q => q.filter((_, idx) => idx !== i))}>
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <Button 
                    className="w-full mt-4" 
                    onClick={runExtraction}
                    disabled={isProcessing}
                  >
                    {isProcessing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Bot className="w-4 h-4 mr-2" />}
                    {isProcessing ? 'Extracting via AI...' : 'Process CSVs'}
                  </Button>
                </div>
              )}
            </div>
          )}

          {wizardStep === 2 && varianceReport && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
              <div className="flex items-center justify-between border-b border-border pb-4">
                <div>
                  <h3 className="text-lg font-bold">Data Reconciliation</h3>
                  <p className="text-sm text-muted-foreground">The AI extracted the data. Help map any unknown merchants.</p>
                </div>
                <Badge variant="outline" className="font-semibold text-sm h-8 px-3">
                  {parsedTransactions.length} rows inside range
                </Badge>
              </div>

              {varianceReport.unmappedTransactions.length > 0 ? (
                <div className="space-y-4">
                  <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-lg p-4">
                    <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 font-bold mb-2 text-sm">
                      <AlertCircle className="w-4 h-4" />
                      <span>{varianceReport.unmappedTransactions.length} Unmapped Transactions</span>
                    </div>
                    <p className="text-xs text-amber-700/80 dark:text-amber-500/80 mb-4">
                      These merchants didn't closely match any of the Events in your Blueprint. Select a category for them below.
                    </p>
                    <div className="space-y-2 max-h-80 overflow-y-auto pr-2">
                      {varianceReport.unmappedTransactions.map((tx: any, i: number) => {
                        const targetEvents = events.filter(e => e.amount < 0).map(e => e.name);
                        return (
                          <div key={tx.id || i} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2 bg-background border border-border rounded-md">
                            <div className="flex flex-col flex-1 min-w-0">
                              <span className="text-sm font-semibold truncate">{tx.merchant}</span>
                              <span className="text-xs text-muted-foreground">{format(tx.date, 'MMM d')} • {tx.card}</span>
                            </div>
                            <div className="flex items-center gap-4 shrink-0">
                              <span className="text-sm font-mono font-medium">${Math.abs(tx.amount).toFixed(2)}</span>
                              <select
                                className="text-xs p-1 rounded-md border border-input bg-muted/50 max-w-[150px]"
                                value={unmappedOverrides[tx.id || tx.merchant] || ''}
                                onChange={(e) => setUnmappedOverrides(prev => ({...prev, [tx.id || tx.merchant]: e.target.value}))}
                              >
                                <option value="">Select Category...</option>
                                {targetEvents.map(e => <option key={e} value={e}>{e}</option>)}
                              </select>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center p-12 border border-dashed border-border rounded-xl bg-muted/10">
                  <Check className="w-12 h-12 text-emerald-500 mb-4" />
                  <h4 className="text-base font-bold">100% Mapped</h4>
                  <p className="text-sm text-muted-foreground text-center max-w-sm mt-2">
                    Our local string-similarity engine successfully mapped all extracted transactions to your Blueprint.
                  </p>
                </div>
              )}

              <div className="flex justify-between pt-4">
                <Button variant="outline" onClick={() => setWizardStep(1)}>Back</Button>
                <Button onClick={() => setWizardStep(3)} className="bg-primary hover:bg-primary/90">
                  Finalize & Run Audit 
                </Button>
              </div>
            </div>
          )}

          {wizardStep === 3 && varianceReport && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
              <div className="bg-background border border-border rounded-md p-4 overflow-auto max-h-[500px]">
                <table className="w-full text-sm text-left">
                  <thead className="bg-muted/50 border-b border-border sticky top-0">
                    <tr>
                      <th className="p-2">Category</th>
                      <th className="p-2 text-right">Actual</th>
                      <th className="p-2 text-right">Target</th>
                      <th className="p-2 text-right">Variance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(varianceReport.categories).map(([cat, rawData]) => {
                      const data = rawData as any;
                      return (
                      <tr key={cat} className="border-b border-border/50 hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => {
                        const chatCtx = (window as any)._paydayChatContext;
                        if (chatCtx) {
                          chatCtx.setChatMode('auditor');
                          chatCtx.setIsOpen(true);
                          chatCtx.setInput(`Let's dig into my variance for ${cat}. I was ${data.variance > 0 ? 'over' : 'under'} by $${Math.abs(data.variance).toFixed(2)}.`);
                        }
                      }}>
                        <td className="p-2 font-medium">{cat}</td>
                        <td className="p-2 text-right font-mono">${data.actual.toFixed(2)}</td>
                        <td className="p-2 text-right font-mono text-muted-foreground">${data.baseline.toFixed(2)}</td>
                        <td className={cn(
                          "p-2 text-right font-mono font-medium",
                          data.variance > 0 ? "text-destructive" : (data.variance < 0 ? "text-emerald-500" : "text-muted-foreground")
                        )}>
                          {data.variance > 0 ? '+' : ''}{data.variance.toFixed(2)}
                        </td>
                      </tr>
                    )})}
                    <tr className="border-b-2 border-border font-bold bg-muted/10">
                      <td className="p-2">TOTAL SPENDING</td>
                      <td className="p-2 text-right font-mono">${varianceReport.totalActual.toFixed(2)}</td>
                      <td className="p-2 text-right font-mono">${varianceReport.totalBaseline.toFixed(2)}</td>
                      <td className={cn(
                        "p-2 text-right font-mono",
                        varianceReport.totalVariance > 0 ? "text-destructive" : (varianceReport.totalVariance < 0 ? "text-emerald-500" : "")
                      )}>
                        {varianceReport.totalVariance > 0 ? '+' : ''}{varianceReport.totalVariance.toFixed(2)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
                <Button variant="ghost" onClick={clearData} className="text-muted-foreground hover:text-destructive">
                  Reset Data
                </Button>
                
                <Button
                  onClick={() => {
                    const chatCtx = (window as any)._paydayChatContext;
                    if (chatCtx) {
                      chatCtx.setChatMode('auditor');
                      chatCtx.setIsOpen(true);
                    }
                  }}
                  className="gap-2 shadow-md transition-all bg-primary hover:bg-primary/90 text-lg px-8 py-6 h-auto"
                >
                  <Bot className="w-5 h-5" />
                  <span>Open AI Copilot</span>
                </Button>
              </div>
            </div>
          )}

        </CardContent>
      </Card>
    </div>
  );
};
