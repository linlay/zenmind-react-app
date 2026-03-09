import { PayloadAction, createSlice } from '@reduxjs/toolkit';

export type AppToastTone = 'neutral' | 'danger' | 'warn' | 'success';

interface AppToastState {
  message: string;
  tone: AppToastTone;
  visible: boolean;
  nonce: number;
}

const initialState: AppToastState = {
  message: '',
  tone: 'neutral',
  visible: false,
  nonce: 0
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    showToast(
      state,
      action: PayloadAction<{
        message: string;
        tone?: AppToastTone;
      }>
    ) {
      const message = String(action.payload.message || '').trim();
      if (!message) {
        return;
      }
      state.message = message;
      state.tone = action.payload.tone || 'neutral';
      state.visible = true;
      state.nonce += 1;
    },
    hideToast(state) {
      state.visible = false;
    }
  }
});

export const { showToast, hideToast } = uiSlice.actions;
export default uiSlice.reducer;
