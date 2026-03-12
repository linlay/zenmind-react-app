import { PayloadAction, createSlice } from '@reduxjs/toolkit';

export type DrivePanel = 'browser' | 'search' | 'menu' | 'tasks' | 'trash';
export type DriveDetailMode = 'none' | 'preview' | 'operation';

interface DriveState {
  panel: DrivePanel;
  detailMode: DriveDetailMode;
  detailTitle: string;
  searchQuery: string;
  selectionMode: boolean;
  browserPath: string;
}

const initialState: DriveState = {
  panel: 'browser',
  detailMode: 'none',
  detailTitle: '',
  searchQuery: '',
  selectionMode: false,
  browserPath: '/'
};

const driveSlice = createSlice({
  name: 'drive',
  initialState,
  reducers: {
    resetDriveUi() {
      return initialState;
    },
    openDriveBrowser(state) {
      state.panel = 'browser';
      state.selectionMode = false;
    },
    openDriveSearch(state) {
      state.panel = 'search';
      state.selectionMode = false;
    },
    openDriveMenu(state) {
      state.panel = 'menu';
      state.selectionMode = false;
    },
    openDriveTasks(state) {
      state.panel = 'tasks';
      state.selectionMode = false;
    },
    openDriveTrash(state) {
      state.panel = 'trash';
      state.selectionMode = false;
    },
    setDriveSearchQuery(state, action: PayloadAction<string>) {
      state.searchQuery = action.payload;
    },
    setDriveSelectionMode(state, action: PayloadAction<boolean>) {
      state.selectionMode = action.payload;
    },
    toggleDriveSelectionMode(state) {
      state.selectionMode = !state.selectionMode;
    },
    setDriveBrowserPath(state, action: PayloadAction<string>) {
      state.browserPath = String(action.payload || '').trim() || '/';
    },
    openDriveDetail(
      state,
      action: PayloadAction<{
        mode: Exclude<DriveDetailMode, 'none'>;
        title?: string;
      }>
    ) {
      state.detailMode = action.payload.mode;
      state.detailTitle = String(action.payload.title || '').trim();
      state.selectionMode = false;
    },
    closeDriveDetail(state) {
      state.detailMode = 'none';
      state.detailTitle = '';
    }
  }
});

export const {
  resetDriveUi,
  openDriveBrowser,
  openDriveSearch,
  openDriveMenu,
  openDriveTasks,
  openDriveTrash,
  setDriveSearchQuery,
  setDriveSelectionMode,
  toggleDriveSelectionMode,
  setDriveBrowserPath,
  openDriveDetail,
  closeDriveDetail
} = driveSlice.actions;

export default driveSlice.reducer;
