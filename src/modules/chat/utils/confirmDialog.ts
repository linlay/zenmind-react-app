export interface ConfirmDialogParams {
  question: string;
  options: string[];
  allowFreeText: boolean;
}

export interface ConfirmDialogSubmitParams {
  selectedOption: string;
  selectedIndex: number;
  freeText: string;
  isCustom: boolean;
}

export interface ConfirmDialogNormalizationResult {
  params: ConfirmDialogParams | null;
  error: string;
}

export function normalizeConfirmDialogParams(
  raw: Record<string, unknown> | null | undefined
): ConfirmDialogNormalizationResult {
  if (!raw || typeof raw !== 'object') {
    return { params: null, error: '确认对话框参数缺失' };
  }

  const question = String(raw.question || '').trim();
  if (!question) {
    return { params: null, error: '确认对话框问题不能为空' };
  }

  const allowFreeText = Boolean(raw.allowFreeText);
  const rawOptions = Array.isArray(raw.options) ? raw.options : [];
  const options = rawOptions
    .map((item) => String(item || '').trim())
    .filter((item) => item.length > 0);

  if (!allowFreeText && options.length === 0) {
    return { params: null, error: '确认对话框缺少可选项' };
  }

  return {
    params: {
      question,
      options,
      allowFreeText
    },
    error: ''
  };
}

export function buildConfirmDialogSubmitParams(input: {
  selectedOption?: unknown;
  selectedIndex?: unknown;
  freeText?: unknown;
}): ConfirmDialogSubmitParams | null {
  const freeText = String(input.freeText || '').trim();
  if (freeText) {
    return {
      selectedOption: freeText,
      selectedIndex: -1,
      freeText,
      isCustom: true
    };
  }

  const selectedOption = String(input.selectedOption || '').trim();
  const selectedIndex = Number(input.selectedIndex);
  if (!selectedOption || !Number.isInteger(selectedIndex) || selectedIndex < 0) {
    return null;
  }

  return {
    selectedOption,
    selectedIndex,
    freeText: '',
    isCustom: false
  };
}
