import reducer, {
  closeDriveDetail,
  openDriveDetail,
  openDriveMenu,
  openDriveSearch,
  openDriveTrash,
  resetDriveUi,
  toggleDriveSelectionMode
} from '../driveSlice';

describe('driveSlice', () => {
  it('opens search and clears selection mode', () => {
    const state = reducer(undefined, toggleDriveSelectionMode());
    const next = reducer(state, openDriveSearch());
    expect(next.panel).toBe('search');
    expect(next.selectionMode).toBe(false);
  });

  it('tracks detail mode and title', () => {
    const state = reducer(undefined, openDriveDetail({ mode: 'preview', title: '报告.pdf' }));
    expect(state.detailMode).toBe('preview');
    expect(state.detailTitle).toBe('报告.pdf');

    const closed = reducer(state, closeDriveDetail());
    expect(closed.detailMode).toBe('none');
    expect(closed.detailTitle).toBe('');
  });

  it('resets back to browser defaults', () => {
    const state = reducer(undefined, openDriveMenu());
    const next = reducer(reducer(state, openDriveTrash()), resetDriveUi());
    expect(next.panel).toBe('browser');
    expect(next.searchQuery).toBe('');
    expect(next.selectionMode).toBe(false);
  });
});
