import { PayloadAction, createSlice } from '@reduxjs/toolkit';

interface ShellState {
  drawerOpen: boolean;
}

const initialState: ShellState = {
  drawerOpen: false
};

const shellSlice = createSlice({
  name: 'shell',
  initialState,
  reducers: {
    setDrawerOpen(state, action: PayloadAction<boolean>) {
      state.drawerOpen = action.payload;
    }
  }
});

export const { setDrawerOpen } = shellSlice.actions;
export default shellSlice.reducer;
