import { PayloadAction, createSlice } from '@reduxjs/toolkit';
import { TerminalState } from '../types/terminal';

const initialState: TerminalState = {
  ptyReloadKey: 0,
  ptyLoading: false,
  ptyLoadError: ''
};

const terminalSlice = createSlice({
  name: 'terminal',
  initialState,
  reducers: {
    reloadPty(state) {
      state.ptyReloadKey += 1;
      state.ptyLoadError = '';
    },
    setPtyLoading(state, action: PayloadAction<boolean>) {
      state.ptyLoading = action.payload;
    },
    setPtyLoadError(state, action: PayloadAction<string>) {
      state.ptyLoadError = action.payload;
    }
  }
});

export const { reloadPty, setPtyLoading, setPtyLoadError } = terminalSlice.actions;
export default terminalSlice.reducer;
