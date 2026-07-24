import { configureStore, createSlice } from '@reduxjs/toolkit';

// ponytail: minimal store for view switching only. Session state lives in Session.jsx.

const appSlice = createSlice({
  name: 'app',
  initialState: {
    view: 'learn', // 'learn' | 'progress'
  },
  reducers: {
    setView(state, action) {
      state.view = action.payload;
    },
  },
});

export const { setView } = appSlice.actions;

export const store = configureStore({
  reducer: appSlice.reducer,
});

export const selectView = (state) => state.view;