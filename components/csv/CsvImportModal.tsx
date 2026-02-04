'use client';

import { useState, useRef, useCallback } from 'react';
import { FaTimes, FaFileUpload, FaArrowLeft, FaArrowRight, FaCheck, FaExclamationTriangle } from 'react-icons/fa';
import {
  CsvColumnMapping,
  CsvPreviewResponse,
  ParsedCsvRow,
  CsvParseError,
  CsvImportResult,
  DateFormat,
  DATE_FORMAT_PATTERNS,
  DEFAULT_CSV_MAPPING,
  CsvAccount,
} from '@/types/csv';

type WizardStep = 'upload' | 'mapping' | 'preview' | 'result';

interface CsvImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: () => void;
  existingAccounts: CsvAccount[];
}

export default function CsvImportModal({
  isOpen,
  onClose,
  onImportComplete,
  existingAccounts,
}: CsvImportModalProps) {
  // Wizard state
  const [step, setStep] = useState<WizardStep>('upload');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Upload step state
  const [file, setFile] = useState<File | null>(null);
  const [previewData, setPreviewData] = useState<CsvPreviewResponse | null>(null);
  const [isNewAccount, setIsNewAccount] = useState(true);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [accountName, setAccountName] = useState('');
  const [institutionName, setInstitutionName] = useState('');

  // Mapping step state
  const [columnMapping, setColumnMapping] = useState<Partial<CsvColumnMapping>>({
    ...DEFAULT_CSV_MAPPING,
  });

  // Preview step state
  const [previewTransactions, setPreviewTransactions] = useState<ParsedCsvRow[]>([]);
  const [previewTotalCount, setPreviewTotalCount] = useState(0);
  const [previewDuplicateCount, setPreviewDuplicateCount] = useState(0);
  const [previewErrors, setPreviewErrors] = useState<CsvParseError[]>([]);

  // Result step state
  const [importResult, setImportResult] = useState<CsvImportResult | null>(null);
  const [createdAccountId, setCreatedAccountId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset all state when closing
  const handleClose = useCallback(() => {
    setStep('upload');
    setIsLoading(false);
    setError(null);
    setFile(null);
    setPreviewData(null);
    setIsNewAccount(true);
    setSelectedAccountId('');
    setAccountName('');
    setInstitutionName('');
    setColumnMapping({ ...DEFAULT_CSV_MAPPING });
    setPreviewTransactions([]);
    setPreviewTotalCount(0);
    setPreviewDuplicateCount(0);
    setPreviewErrors([]);
    setImportResult(null);
    setCreatedAccountId(null);
    onClose();
  }, [onClose]);

  // Handle file selection
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setError(null);
    setIsLoading(true);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const response = await fetch('/api/csv/preview', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to parse CSV');
      }

      const data: CsvPreviewResponse = await response.json();
      setPreviewData(data);

      // Apply auto-detected mapping
      if (data.detectedMapping) {
        setColumnMapping(prev => ({
          ...prev,
          ...data.detectedMapping,
        }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse CSV');
      setFile(null);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle dropping file
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && droppedFile.name.endsWith('.csv')) {
      // Create a synthetic event to reuse handleFileChange
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(droppedFile);
      if (fileInputRef.current) {
        fileInputRef.current.files = dataTransfer.files;
        handleFileChange({ target: fileInputRef.current } as React.ChangeEvent<HTMLInputElement>);
      }
    }
  };

  // Move to mapping step
  const handleUploadNext = () => {
    if (!file || !previewData) return;

    // If using existing account, check if columns match
    if (!isNewAccount && selectedAccountId) {
      const existingAccount = existingAccounts.find(a => a.id === selectedAccountId);
      if (existingAccount?.csvColumnMapping) {
        // Check if headers match the saved mapping
        const savedMapping = existingAccount.csvColumnMapping;
        const requiredColumns = [savedMapping.dateColumn];
        if (savedMapping.amountMode === 'single') {
          requiredColumns.push(savedMapping.amountColumn!);
        } else {
          requiredColumns.push(savedMapping.debitColumn!, savedMapping.creditColumn!);
        }

        const missingColumns = requiredColumns.filter(col => col && !previewData.headers.includes(col));
        if (missingColumns.length > 0) {
          // Columns don't match, need to re-map
          setError(`CSV columns don't match saved mapping. Missing: ${missingColumns.join(', ')}`);
          return;
        }

        // Columns match, use saved mapping and skip to preview
        setColumnMapping(savedMapping);
        handleMappingNext(savedMapping);
        return;
      }
    }

    setStep('mapping');
  };

  // Move to preview step with mapping applied
  const handleMappingNext = async (mappingOverride?: CsvColumnMapping) => {
    if (!file) return;

    const mapping = mappingOverride || columnMapping as CsvColumnMapping;

    // Validate mapping
    if (!mapping.dateColumn) {
      setError('Date column is required');
      return;
    }

    if (mapping.amountMode === 'single' && !mapping.amountColumn) {
      setError('Amount column is required');
      return;
    }

    if (mapping.amountMode === 'split' && (!mapping.debitColumn || !mapping.creditColumn)) {
      setError('Both Debit and Credit columns are required for split mode');
      return;
    }

    if (!mapping.dateFormat) {
      setError('Please select a date format');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('columnMapping', JSON.stringify(mapping));
      if (!isNewAccount && selectedAccountId) {
        formData.append('accountId', selectedAccountId);
      }

      const response = await fetch('/api/csv/import', {
        method: 'PUT', // PUT = preview mode
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to preview import');
      }

      const data = await response.json();
      setPreviewTransactions(data.transactions);
      setPreviewTotalCount(data.totalCount);
      setPreviewDuplicateCount(data.duplicateCount);
      setPreviewErrors(data.errors);
      setStep('preview');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to preview import');
    } finally {
      setIsLoading(false);
    }
  };

  // Execute the import
  const handleImport = async () => {
    if (!file) return;

    setIsLoading(true);
    setError(null);

    try {
      let accountId = selectedAccountId;

      // Create account first if new
      if (isNewAccount) {
        const accountResponse = await fetch('/api/csv/accounts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accountName,
            institutionName,
            columnMapping,
          }),
        });

        if (!accountResponse.ok) {
          const data = await accountResponse.json();
          throw new Error(data.error || 'Failed to create account');
        }

        const newAccount = await accountResponse.json();
        accountId = newAccount.id;
        setCreatedAccountId(accountId);
      }

      // Import transactions
      const formData = new FormData();
      formData.append('file', file);
      formData.append('accountId', accountId);

      const response = await fetch('/api/csv/import', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to import transactions');
      }

      const result: CsvImportResult = await response.json();
      setImportResult(result);
      setStep('result');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle completion
  const handleDone = () => {
    onImportComplete();
    handleClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-surface rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold text-text-primary">
            Import CSV Transactions
          </h2>
          <button
            onClick={handleClose}
            className="p-2 text-text-secondary hover:text-text-primary rounded"
          >
            <FaTimes />
          </button>
        </div>

        {/* Progress indicator */}
        <div className="px-4 py-2 border-b border-border">
          <div className="flex items-center gap-2">
            {(['upload', 'mapping', 'preview', 'result'] as WizardStep[]).map((s, i) => (
              <div key={s} className="flex items-center">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                    step === s
                      ? 'bg-primary text-white'
                      : i < ['upload', 'mapping', 'preview', 'result'].indexOf(step)
                      ? 'bg-success text-white'
                      : 'bg-gray-200 text-text-secondary'
                  }`}
                >
                  {i < ['upload', 'mapping', 'preview', 'result'].indexOf(step) ? (
                    <FaCheck className="w-3 h-3" />
                  ) : (
                    i + 1
                  )}
                </div>
                {i < 3 && (
                  <div
                    className={`w-12 h-0.5 mx-1 ${
                      i < ['upload', 'mapping', 'preview', 'result'].indexOf(step)
                        ? 'bg-success'
                        : 'bg-gray-200'
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-between text-xs text-text-secondary mt-1">
            <span>Upload</span>
            <span>Mapping</span>
            <span>Preview</span>
            <span>Done</span>
          </div>
        </div>

        {/* Error display */}
        {error && (
          <div className="mx-4 mt-4 p-3 bg-danger-light border border-danger rounded-lg text-danger text-sm">
            {error}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {step === 'upload' && (
            <UploadStep
              file={file}
              previewData={previewData}
              isLoading={isLoading}
              existingAccounts={existingAccounts}
              isNewAccount={isNewAccount}
              selectedAccountId={selectedAccountId}
              accountName={accountName}
              institutionName={institutionName}
              fileInputRef={fileInputRef}
              onFileChange={handleFileChange}
              onDrop={handleDrop}
              onIsNewAccountChange={setIsNewAccount}
              onSelectedAccountIdChange={setSelectedAccountId}
              onAccountNameChange={setAccountName}
              onInstitutionNameChange={setInstitutionName}
            />
          )}

          {step === 'mapping' && previewData && (
            <MappingStep
              headers={previewData.headers}
              sampleRows={previewData.sampleRows}
              columnMapping={columnMapping}
              onColumnMappingChange={setColumnMapping}
            />
          )}

          {step === 'preview' && (
            <PreviewStep
              transactions={previewTransactions}
              totalCount={previewTotalCount}
              duplicateCount={previewDuplicateCount}
              errors={previewErrors}
            />
          )}

          {step === 'result' && importResult && (
            <ResultStep result={importResult} />
          )}
        </div>

        {/* Footer with navigation */}
        <div className="flex items-center justify-between p-4 border-t border-border">
          <button
            onClick={step === 'upload' ? handleClose : () => setStep(
              step === 'mapping' ? 'upload' :
              step === 'preview' ? 'mapping' :
              'preview'
            )}
            disabled={isLoading || step === 'result'}
            className="flex items-center gap-2 px-4 py-2 text-text-secondary hover:text-text-primary disabled:opacity-50"
          >
            <FaArrowLeft />
            {step === 'upload' ? 'Cancel' : 'Back'}
          </button>

          {step === 'upload' && (
            <button
              onClick={handleUploadNext}
              disabled={!file || !previewData || isLoading || (isNewAccount ? (!accountName || !institutionName) : !selectedAccountId)}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover disabled:opacity-50"
            >
              Next
              <FaArrowRight />
            </button>
          )}

          {step === 'mapping' && (
            <button
              onClick={() => handleMappingNext()}
              disabled={isLoading}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover disabled:opacity-50"
            >
              {isLoading ? 'Processing...' : 'Preview Import'}
              <FaArrowRight />
            </button>
          )}

          {step === 'preview' && (
            <button
              onClick={handleImport}
              disabled={isLoading || previewTotalCount === previewDuplicateCount}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover disabled:opacity-50"
            >
              {isLoading ? 'Importing...' : `Import ${previewTotalCount - previewDuplicateCount} Transactions`}
              <FaCheck />
            </button>
          )}

          {step === 'result' && (
            <button
              onClick={handleDone}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover"
            >
              Done
              <FaCheck />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Upload Step Component
interface UploadStepProps {
  file: File | null;
  previewData: CsvPreviewResponse | null;
  isLoading: boolean;
  existingAccounts: CsvAccount[];
  isNewAccount: boolean;
  selectedAccountId: string;
  accountName: string;
  institutionName: string;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDrop: (e: React.DragEvent) => void;
  onIsNewAccountChange: (isNew: boolean) => void;
  onSelectedAccountIdChange: (id: string) => void;
  onAccountNameChange: (name: string) => void;
  onInstitutionNameChange: (name: string) => void;
}

function UploadStep({
  file,
  previewData,
  isLoading,
  existingAccounts,
  isNewAccount,
  selectedAccountId,
  accountName,
  institutionName,
  fileInputRef,
  onFileChange,
  onDrop,
  onIsNewAccountChange,
  onSelectedAccountIdChange,
  onAccountNameChange,
  onInstitutionNameChange,
}: UploadStepProps) {
  return (
    <div className="space-y-4">
      {/* File upload area */}
      <div
        onDrop={onDrop}
        onDragOver={e => e.preventDefault()}
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          file ? 'border-success bg-success-light' : 'border-border hover:border-primary'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={onFileChange}
          className="hidden"
        />

        {isLoading ? (
          <div className="text-text-secondary">Parsing CSV...</div>
        ) : file ? (
          <div>
            <FaCheck className="mx-auto text-3xl text-success mb-2" />
            <p className="font-medium text-text-primary">{file.name}</p>
            {previewData && (
              <p className="text-sm text-text-secondary mt-1">
                {previewData.totalRows} rows, {previewData.headers.length} columns
              </p>
            )}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="mt-2 text-sm text-primary hover:underline"
            >
              Choose different file
            </button>
          </div>
        ) : (
          <div>
            <FaFileUpload className="mx-auto text-4xl text-text-tertiary mb-2" />
            <p className="text-text-secondary mb-2">
              Drag and drop a CSV file here, or
            </p>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover"
            >
              Choose File
            </button>
          </div>
        )}
      </div>

      {/* Account selection */}
      {file && previewData && (
        <div className="space-y-4">
          <div className="flex gap-4">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={isNewAccount}
                onChange={() => onIsNewAccountChange(true)}
                className="w-4 h-4 text-primary"
              />
              <span className="text-text-primary">Create new account</span>
            </label>
            {existingAccounts.length > 0 && (
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={!isNewAccount}
                  onChange={() => onIsNewAccountChange(false)}
                  className="w-4 h-4 text-primary"
                />
                <span className="text-text-primary">Import to existing account</span>
              </label>
            )}
          </div>

          {isNewAccount ? (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  Account Name *
                </label>
                <input
                  type="text"
                  value={accountName}
                  onChange={e => onAccountNameChange(e.target.value)}
                  placeholder="e.g., Checking"
                  className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  Institution Name *
                </label>
                <input
                  type="text"
                  value={institutionName}
                  onChange={e => onInstitutionNameChange(e.target.value)}
                  placeholder="e.g., Chase Bank"
                  className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">
                Select Account
              </label>
              <select
                value={selectedAccountId}
                onChange={e => onSelectedAccountIdChange(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">Select an account...</option>
                {existingAccounts.map(account => (
                  <option key={account.id} value={account.id}>
                    {account.institutionName} - {account.accountName}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Mapping Step Component
interface MappingStepProps {
  headers: string[];
  sampleRows: Record<string, string>[];
  columnMapping: Partial<CsvColumnMapping>;
  onColumnMappingChange: (mapping: Partial<CsvColumnMapping>) => void;
}

function MappingStep({
  headers,
  sampleRows,
  columnMapping,
  onColumnMappingChange,
}: MappingStepProps) {
  const updateMapping = (key: keyof CsvColumnMapping, value: unknown) => {
    onColumnMappingChange({ ...columnMapping, [key]: value });
  };

  // Helper to get sample values for a column
  const getSampleValues = (columnName: string | undefined): string[] => {
    if (!columnName) return [];
    return sampleRows
      .map(row => row[columnName])
      .filter(v => v && v.trim())
      .slice(0, 3);
  };

  // Component to show sample values
  const SamplePreview = ({ columnName }: { columnName: string | undefined }) => {
    const samples = getSampleValues(columnName);
    if (samples.length === 0) return null;
    return (
      <div className="mt-1 text-xs text-text-tertiary">
        <span className="font-medium">Sample:</span>{' '}
        {samples.map((s, i) => (
          <span key={i}>
            <span className="bg-gray-100 px-1 rounded">{s.length > 25 ? s.slice(0, 25) + '...' : s}</span>
            {i < samples.length - 1 && ', '}
          </span>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Required column mappings */}
      <div>
        <h3 className="font-medium text-text-primary mb-3">Map Columns</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              Date Column *
            </label>
            <select
              value={columnMapping.dateColumn || ''}
              onChange={e => updateMapping('dateColumn', e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Select column...</option>
              {headers.map(h => (
                <option key={h} value={h}>{h}</option>
              ))}
            </select>
            <SamplePreview columnName={columnMapping.dateColumn} />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              Date Format *
            </label>
            <select
              value={columnMapping.dateFormat || ''}
              onChange={e => updateMapping('dateFormat', e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Select format...</option>
              {DATE_FORMAT_PATTERNS.map(({ format, example }) => (
                <option key={format} value={format}>{format} (e.g., {example})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              Description Column (optional)
            </label>
            <select
              value={columnMapping.descriptionColumn || ''}
              onChange={e => updateMapping('descriptionColumn', e.target.value || undefined)}
              className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">None</option>
              {headers.map(h => (
                <option key={h} value={h}>{h}</option>
              ))}
            </select>
            <SamplePreview columnName={columnMapping.descriptionColumn} />
            <p className="text-xs text-text-tertiary mt-1">
              Falls back to merchant or date if not set
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              Merchant Column (optional)
            </label>
            <select
              value={columnMapping.merchantColumn || ''}
              onChange={e => updateMapping('merchantColumn', e.target.value || undefined)}
              className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">None</option>
              {headers.map(h => (
                <option key={h} value={h}>{h}</option>
              ))}
            </select>
            <SamplePreview columnName={columnMapping.merchantColumn} />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              Status Column (optional)
            </label>
            <select
              value={columnMapping.statusColumn || ''}
              onChange={e => updateMapping('statusColumn', e.target.value || undefined)}
              className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">None</option>
              {headers.map(h => (
                <option key={h} value={h}>{h}</option>
              ))}
            </select>
            <SamplePreview columnName={columnMapping.statusColumn} />
            <p className="text-xs text-text-tertiary mt-1">
              Maps to posted/pending status
            </p>
          </div>
        </div>
      </div>

      {/* Amount configuration */}
      <div>
        <h3 className="font-medium text-text-primary mb-3">Amount Configuration</h3>
        <div className="space-y-4">
          <div className="flex gap-4">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={columnMapping.amountMode === 'single'}
                onChange={() => updateMapping('amountMode', 'single')}
                className="w-4 h-4 text-primary"
              />
              <span className="text-text-primary">Single amount column</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={columnMapping.amountMode === 'split'}
                onChange={() => updateMapping('amountMode', 'split')}
                className="w-4 h-4 text-primary"
              />
              <span className="text-text-primary">Separate debit/credit columns</span>
            </label>
          </div>

          {columnMapping.amountMode === 'single' ? (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  Amount Column *
                </label>
                <select
                  value={columnMapping.amountColumn || ''}
                  onChange={e => updateMapping('amountColumn', e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">Select column...</option>
                  {headers.map(h => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
                <SamplePreview columnName={columnMapping.amountColumn} />
                <p className="text-xs text-text-tertiary mt-1">
                  Negative values = expenses, positive = income
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  Debit/Expense Column *
                </label>
                <select
                  value={columnMapping.debitColumn || ''}
                  onChange={e => updateMapping('debitColumn', e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">Select column...</option>
                  {headers.map(h => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
                <SamplePreview columnName={columnMapping.debitColumn} />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  Credit/Income Column *
                </label>
                <select
                  value={columnMapping.creditColumn || ''}
                  onChange={e => updateMapping('creditColumn', e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">Select column...</option>
                  {headers.map(h => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
                <SamplePreview columnName={columnMapping.creditColumn} />
              </div>
            </div>
          )}

          {/* Parsing options */}
          <div className="grid grid-cols-2 gap-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={columnMapping.negativeInParentheses || false}
                onChange={e => updateMapping('negativeInParentheses', e.target.checked)}
                className="w-4 h-4 text-primary rounded"
              />
              <span className="text-sm text-text-secondary">
                Negative amounts in parentheses e.g., ($100.00)
              </span>
            </label>
          </div>
        </div>
      </div>

      {/* Sample data preview */}
      <div>
        <h3 className="font-medium text-text-primary mb-3">Sample Data</h3>
        <div className="overflow-x-auto border border-border rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                {headers.map(h => (
                  <th key={h} className="px-3 py-2 text-left font-medium text-text-secondary whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sampleRows.slice(0, 3).map((row, i) => (
                <tr key={i} className="border-t border-border">
                  {headers.map(h => (
                    <td key={h} className="px-3 py-2 text-text-primary whitespace-nowrap">
                      {row[h] || '-'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// Preview Step Component
interface PreviewStepProps {
  transactions: ParsedCsvRow[];
  totalCount: number;
  duplicateCount: number;
  errors: CsvParseError[];
}

function PreviewStep({
  transactions,
  totalCount,
  duplicateCount,
  errors,
}: PreviewStepProps) {
  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-success-light p-4 rounded-lg text-center">
          <div className="text-2xl font-bold text-success">{totalCount - duplicateCount}</div>
          <div className="text-sm text-text-secondary">To import</div>
        </div>
        <div className="bg-yellow-50 p-4 rounded-lg text-center">
          <div className="text-2xl font-bold text-yellow-600">{duplicateCount}</div>
          <div className="text-sm text-text-secondary">Duplicates (skip)</div>
        </div>
        <div className="bg-danger-light p-4 rounded-lg text-center">
          <div className="text-2xl font-bold text-danger">{errors.length}</div>
          <div className="text-sm text-text-secondary">Parse errors</div>
        </div>
      </div>

      {/* Errors list */}
      {errors.length > 0 && (
        <div className="bg-danger-light border border-danger rounded-lg p-4">
          <h4 className="font-medium text-danger mb-2 flex items-center gap-2">
            <FaExclamationTriangle />
            Parse Errors
          </h4>
          <ul className="text-sm text-danger space-y-1 max-h-32 overflow-y-auto">
            {errors.slice(0, 10).map((err, i) => (
              <li key={i}>Row {err.row}: {err.message}</li>
            ))}
            {errors.length > 10 && (
              <li>...and {errors.length - 10} more errors</li>
            )}
          </ul>
        </div>
      )}

      {/* Transactions preview */}
      <div>
        <h3 className="font-medium text-text-primary mb-2">
          Preview (first 20 transactions)
        </h3>
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-text-secondary">Date</th>
                <th className="px-3 py-2 text-left font-medium text-text-secondary">Description</th>
                <th className="px-3 py-2 text-right font-medium text-text-secondary">Amount</th>
                <th className="px-3 py-2 text-left font-medium text-text-secondary">Type</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t, i) => (
                <tr key={i} className="border-t border-border">
                  <td className="px-3 py-2 text-text-primary whitespace-nowrap">{t.date}</td>
                  <td className="px-3 py-2 text-text-primary truncate max-w-[200px]">{t.description}</td>
                  <td className={`px-3 py-2 text-right whitespace-nowrap ${
                    t.type === 'income' ? 'text-success' : 'text-text-primary'
                  }`}>
                    ${t.amount.toFixed(2)}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      t.type === 'income'
                        ? 'bg-success-light text-success'
                        : 'bg-gray-100 text-text-secondary'
                    }`}>
                      {t.type}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// Result Step Component
interface ResultStepProps {
  result: CsvImportResult;
}

function ResultStep({ result }: ResultStepProps) {
  return (
    <div className="text-center py-8">
      <div className="w-16 h-16 bg-success-light rounded-full flex items-center justify-center mx-auto mb-4">
        <FaCheck className="text-3xl text-success" />
      </div>
      <h3 className="text-xl font-semibold text-text-primary mb-2">
        Import Complete!
      </h3>
      <div className="space-y-2 text-text-secondary">
        <p>{result.imported} transactions imported successfully</p>
        {result.skipped > 0 && (
          <p>{result.skipped} duplicates skipped</p>
        )}
        {result.errors.length > 0 && (
          <p className="text-danger">{result.errors.length} rows had errors</p>
        )}
      </div>

      {result.errors.length > 0 && (
        <div className="mt-4 bg-danger-light border border-danger rounded-lg p-4 text-left max-h-40 overflow-y-auto">
          <h4 className="font-medium text-danger mb-2">Errors:</h4>
          <ul className="text-sm text-danger space-y-1">
            {result.errors.map((err, i) => (
              <li key={i}>Row {err.row}: {err.message}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
