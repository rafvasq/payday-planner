import React, { useState, useRef, useMemo, useEffect } from 'react';
import { usePlannerStore } from '../store/usePlannerStore';
import { aggregateTransactions, autoDetectProfile } from '../core/csvParser';
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
  const [localAnalysis, setLocalAnalysis] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);

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

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await processFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await processFiles(Array.from(e.target.files));
    }
  };

  const processFiles = async (files: File[]) => {
    setIsProcessing(true);
    setAnalysisLogs([]);
    const allTx = [...parsedTransactions];
    const newLogs: string[] = [];
    const newFiles = [...uploadedFiles];
    
    for (const file of files) {
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
        
        newLogs.push(`🚀 Sending ${file.name} to AI Extraction Engine...`);
        
        const response = await api.parseCsv(file, selectedModel);
        
        const count = response.transactions?.length || 0;
        newLogs.push(`✅ Parsed ${count} transactions from ${file.name}`);
        
        let minDate: Date | undefined;
        let maxDate: Date | undefined;

        if (response.transactions) {
          response.transactions.forEach((tx: any) => {
            const date = new Date(tx.date);
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
    
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const { markdown: aggMarkdown, total } = useMemo(() => {
    if (parsedTransactions.length === 0) return { markdown: '', total: 0 };
    const start = analysisStartDate ? new Date(analysisStartDate + 'T00:00:00') : undefined;
    const end = analysisEndDate ? new Date(analysisEndDate + 'T23:59:59') : undefined;
    return aggregateTransactions(parsedTransactions, start, end);
  }, [parsedTransactions, analysisStartDate, analysisEndDate]);

  useEffect(() => {
    if (aggMarkdown) {
      setRecentSpendingSummary(aggMarkdown);
    } else {
      setRecentSpendingSummary(null);
    }
  }, [aggMarkdown, setRecentSpendingSummary]);

  const handleCopyPrompt = async () => {
    try {
      const jsonStr = getBlueprintJson({ minified: true, compactIds: true });
      const prompt = `Act as an expert financial advisor. Here is my current financial blueprint (planned cashflow) and a summary of my actual spending from ${analysisStartDate || 'Start'} to ${analysisEndDate || 'End'}.

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

  const handleQuickAnalysis = async () => {
    if (!aggMarkdown) return;
    setIsAnalyzing(true);
    setLocalAnalysis('');
    try {
      const blueprintStr = getBlueprintJson({ minified: true, compactIds: true });
      const blueprint = JSON.parse(blueprintStr);
      const prompt = `Please provide a brief executive summary of this spending data compared to my blueprint. Where am I overspending? What adjustments do I need to make? Keep it concise.`;
      
      const ledgerContext = generateLedgerContext(accounts, events, 30);
      const stream = api.chatStream([{role: 'user', content: prompt}], blueprint, ledgerContext, aggMarkdown, selectedModel);
      
      for await (const chunk of stream) {
        setLocalAnalysis(prev => prev + chunk);
      }
    } catch (err: any) {
      setLocalAnalysis(`[Error generating analysis: ${err.message}]`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const clearData = () => {
    setParsedTransactions([]);
    setUploadedFiles([]);
    setAnalysisStartDate(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
    setAnalysisEndDate(format(new Date(), 'yyyy-MM-dd'));
    setAnalysisLogs([]);
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <Card>
        <CardHeader>
          <CardTitle>Spending Analysis (AI Powered)</CardTitle>
          <CardDescription>
            Upload your bank CSVs. Our local AI will natively understand and extract transactions without any brittle bank profiles.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
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
                "w-full h-full min-h-[140px] flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-xl p-10 transition-colors",
                isProcessing ? "bg-muted cursor-wait opacity-70" : "cursor-pointer",
                isDragging && !isProcessing
                  ? "bg-primary/10 border-primary text-primary" 
                  : "bg-muted/50 border-border text-muted-foreground hover:bg-muted hover:border-primary/50"
              )}
            >
              {isProcessing ? (
                <Loader2 className="w-10 h-10 animate-spin text-primary" />
              ) : (
                <UploadCloud className={cn("w-10 h-10", isDragging ? "text-primary" : "text-muted-foreground")} />
              )}
              <div className="text-center">
                <p className="text-sm font-bold text-foreground">
                  {isProcessing ? "Processing via AI Extraction Engine..." : "Click to upload or drag and drop"}
                </p>
                <p className="text-xs mt-1">Bank agnostic. Just drop the CSV.</p>
              </div>
            </div>
            
            {availableModels.length > 0 && (
              <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                <Cpu className="w-3.5 h-3.5" />
                <span>Extracting using</span>
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  disabled={isProcessing}
                  className="bg-transparent border-none font-medium text-foreground p-0 h-auto focus:ring-0 cursor-pointer"
                >
                  {availableModels.map(provider => (
                    <optgroup key={provider.provider_type} label={provider.provider_name}>
                      {provider.models.map(model => (
                        <option key={model.id} value={model.id}>
                          {model.name} {provider.provider_type === 'ollama' ? '(Local)' : ''}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <span>▾</span>
              </div>
            )}
          </div>

          {uploadedFiles.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Active Sandbox Files</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {uploadedFiles.map(f => (
                  <div key={f.id} className="flex items-center justify-between p-2 border border-border rounded-md bg-muted/20">
                    <div className="flex items-center gap-2 overflow-hidden">
                      <FileText className="w-4 h-4 text-primary shrink-0" />
                      <div className="flex flex-col overflow-hidden">
                        <span className="text-sm font-medium truncate">{f.name}</span>
                        <span className="text-xs text-muted-foreground">{f.count} rows {f.startDate && f.endDate ? `(${format(f.startDate, 'MMM d')} - ${format(f.endDate, 'MMM d')})` : ''}</span>
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive shrink-0" onClick={() => removeUploadedFile(f.id)}>
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {analysisLogs.length > 0 && (
            <div className="flex flex-col gap-1.5 bg-primary/10 border border-primary/20 p-3 rounded-lg">
              <div className="flex items-center gap-1.5 text-primary font-bold text-xs uppercase tracking-wide">
                <Info className="w-3.5 h-3.5" />
                <span>AI Pipeline Log</span>
              </div>
              <ul className="text-xs text-primary/90 font-medium space-y-0.5 list-disc pl-5">
                {analysisLogs.map((log, i) => (
                  <li key={i}>{log}</li>
                ))}
              </ul>
            </div>
          )}

          {parsedTransactions.length > 0 && (
            <div className="bg-muted/30 border border-border rounded-lg p-4 space-y-4">
              <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    <Input 
                      type="date"
                      value={analysisStartDate}
                      onChange={(e) => setAnalysisStartDate(e.target.value)}
                      className="h-8 w-auto text-xs"
                    />
                    <span className="text-muted-foreground text-sm">to</span>
                    <Input 
                      type="date"
                      value={analysisEndDate}
                      onChange={(e) => setAnalysisEndDate(e.target.value)}
                      className="h-8 w-auto text-xs"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <Badge variant="outline" className="font-semibold">
                    {parsedTransactions.length} rows parsed
                  </Badge>
                  <Button 
                    variant="ghost"
                    size="sm"
                    onClick={clearData}
                    className="h-8 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    Clear Data
                  </Button>
                </div>
              </div>

              <div className="bg-background border border-border rounded-md p-4 overflow-auto max-h-96">
                <pre className="text-xs font-mono whitespace-pre-wrap">
                  {aggMarkdown}
                </pre>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
                <div className="flex items-center gap-2 text-amber-600 bg-amber-50 dark:bg-amber-950 dark:text-amber-400 px-3 py-2 rounded-md text-xs font-semibold border border-amber-200 dark:border-amber-900/50">
                  <AlertCircle className="w-4 h-4" />
                  <span>Powered by strict schema normalization.</span>
                </div>
                
                <div className="flex gap-2">
                  <Button
                    onClick={handleQuickAnalysis}
                    disabled={isAnalyzing}
                    className="gap-2 shadow-md transition-all bg-primary hover:bg-primary/90"
                  >
                    {isAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bot className="w-4 h-4" />}
                    <span>{isAnalyzing ? "Analyzing..." : "Analyze Now"}</span>
                  </Button>
                  <Button
                    onClick={handleCopyPrompt}
                    variant="outline"
                    className={cn(
                      "gap-2 shadow-sm transition-all",
                      copied ? "bg-emerald-600 text-white hover:bg-emerald-700 hover:text-white" : ""
                    )}
                  >
                    {copied ? (
                      <>
                        <Check className="w-4 h-4 animate-bounce" />
                        <span>Copied Analysis Prompt!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        <span>Copy Prompt</span>
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {localAnalysis && (
                <div className="bg-primary/5 border border-primary/20 rounded-md p-4 mt-4">
                  <div className="flex items-center gap-2 mb-2 text-primary font-semibold">
                    <Bot className="w-4 h-4" />
                    <span>Quick Analysis</span>
                  </div>
                  <div className="text-sm text-foreground/90 leading-relaxed prose dark:prose-invert max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{localAnalysis}</ReactMarkdown>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
