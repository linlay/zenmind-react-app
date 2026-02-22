import { PayloadAction, createSlice } from '@reduxjs/toolkit';
import { TerminalState } from '../types/terminal';

const initialState: TerminalState = {
  ptyReloadKey: 0,
  ptyLoading: false,
  ptyLoadError: '',
  activeSessionId: '',
  openNewSessionNonce: 0
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
    },
    setActiveSessionId(state, action: PayloadAction<string>) {
      state.activeSessionId = String(action.payload || '').trim();
    },
    requestOpenNewSessionModal(state, action: PayloadAction<number | undefined>) {
      const requested = Number(action.payload);
      const nextNonce = Number.isFinite(requested) && requested > 0 ? Math.floor(requested) : Date.now();
      state.openNewSessionNonce = nextNonce > state.openNewSessionNonce ? nextNonce : state.openNewSessionNonce + 1;
    }
  }
});

export const { reloadPty, setPtyLoading, setPtyLoadError, setActiveSessionId, requestOpenNewSessionModal } = terminalSlice.actions;
export default terminalSlice.reducer;
