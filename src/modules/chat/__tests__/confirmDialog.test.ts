import {
  buildConfirmDialogSubmitParams,
  normalizeConfirmDialogParams
} from '../utils/confirmDialog';

describe('confirmDialog utils', () => {
  it('normalizes valid confirm dialog params', () => {
    const result = normalizeConfirmDialogParams({
      question: '你希望去哪种类型的城市旅行？',
      options: ['海滨城市', '历史文化名城'],
      allowFreeText: false
    });
    expect(result.error).toBe('');
    expect(result.params).toEqual({
      question: '你希望去哪种类型的城市旅行？',
      options: ['海滨城市', '历史文化名城'],
      allowFreeText: false
    });
  });

  it('returns error when required params are invalid', () => {
    expect(normalizeConfirmDialogParams(null).error).toContain('参数缺失');
    expect(normalizeConfirmDialogParams({ question: '', options: [], allowFreeText: false }).error).toContain(
      '问题不能为空'
    );
    expect(
      normalizeConfirmDialogParams({ question: 'Q', options: [], allowFreeText: false }).error
    ).toContain('缺少可选项');
  });

  it('builds option submit params', () => {
    expect(
      buildConfirmDialogSubmitParams({
        selectedOption: '海滨城市',
        selectedIndex: 0,
        freeText: ''
      })
    ).toEqual({
      selectedOption: '海滨城市',
      selectedIndex: 0,
      freeText: '',
      isCustom: false
    });
  });

  it('builds custom submit params with higher priority than selected option', () => {
    expect(
      buildConfirmDialogSubmitParams({
        selectedOption: '海滨城市',
        selectedIndex: 0,
        freeText: '  杭州西湖一日游  '
      })
    ).toEqual({
      selectedOption: '杭州西湖一日游',
      selectedIndex: -1,
      freeText: '杭州西湖一日游',
      isCustom: true
    });
  });

  it('returns null when submit payload is invalid', () => {
    expect(buildConfirmDialogSubmitParams({ selectedOption: '', selectedIndex: 0 })).toBeNull();
    expect(buildConfirmDialogSubmitParams({ selectedOption: 'A', selectedIndex: -1 })).toBeNull();
  });
});
